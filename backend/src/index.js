import { buildMenu } from './menu.js';

const KEY = 'menu:v1';
const TTL = 3600; // KV safety refresh (seconds). Changes are pushed immediately through /api/availability or /api/refresh.

const cors = (env) => ({
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
});
const reply = (env, body, status = 200, extra = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(env), ...extra },
  });

// constant-time comparison of the admin key
function authorized(req, env) {
  const got = req.headers.get('Authorization') || '', want = `Bearer ${env.ADMIN_KEY || ''}`;
  if (!env.ADMIN_KEY || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function refresh(env) {
  const body = JSON.stringify(await buildMenu(env));
  await env.MENU_KV.put(KEY, body, { expirationTtl: TTL });   // one write per refresh
  return body;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

    // Public: the customer app reads the menu (KV first, D1 only on a cache miss)
    if (url.pathname === '/api/menu' && req.method === 'GET') {
      try {
        const body = (await env.MENU_KV.get(KEY)) ?? (await refresh(env));
        return reply(env, body, 200, { 'Cache-Control': 'public, max-age=30' });
      } catch (e) {
        return reply(env, { error: 'menu_unavailable' }, 503, { 'Cache-Control': 'no-store' });
      }
    }

    // Private (n8n / you): requires `Authorization: Bearer <ADMIN_KEY>`
    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      if (!authorized(req, env)) return reply(env, { error: 'unauthorized' }, 401);
      await refresh(env);
      return reply(env, { ok: true });
    }

    // Set a component's status at one branch, then rebuild the cached menu.
    // Body: { "brc_id": 1, "com_id": 12, "status": "available" | "unavailable" }
    if (url.pathname === '/api/availability' && req.method === 'POST') {
      if (!authorized(req, env)) return reply(env, { error: 'unauthorized' }, 401);
      let b;
      try { b = await req.json(); } catch { return reply(env, { error: 'invalid_json' }, 400); }
      const brc = Number(b.brc_id), com = Number(b.com_id);
      if (!Number.isInteger(brc) || !Number.isInteger(com) || !['available', 'unavailable'].includes(b.status))
        return reply(env, { error: 'invalid_body' }, 400);
      const known = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM branches WHERE brc_id = ?) AS b, (SELECT COUNT(*) FROM components WHERE com_id = ?) AS c').bind(brc, com).first();
      if (!known || !known.b || !known.c) return reply(env, { error: 'unknown_branch_or_component' }, 404);
      await env.DB.prepare(
        'INSERT INTO branches_components_availability (brc_id, com_id, status) VALUES (?, ?, ?) ON CONFLICT(brc_id, com_id) DO UPDATE SET status = excluded.status'
      ).bind(brc, com, b.status).run();
      await refresh(env);
      return reply(env, { ok: true });
    }

    return reply(env, { error: 'not_found' }, 404);
  },

  // Optional safety net: enable a cron trigger in wrangler.toml to rebuild the cache regularly.
  async scheduled(_event, env, ctx) { ctx.waitUntil(refresh(env)); },
};
