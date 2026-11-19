# Backend — Cloudflare Worker (menu API)

Reads the menu from D1 (`abo_asala_menu_database`), caches it as one JSON in KV and serves it to the customer app.

| Route | Who | What it does |
|---|---|---|
| `GET /api/menu` | public | Returns the menu JSON (KV first; D1 only when the cache is empty). Shape: `../docs/menu-api-contract.md` |
| `POST /api/refresh` | private | Rebuilds the cached menu from D1 |
| `POST /api/availability` | private | Body `{"brc_id":1,"com_id":12,"status":"unavailable"}`. Updates D1, then rebuilds the cache |

Private routes need the header `Authorization: Bearer <ADMIN_KEY>`.

## Files
- `src/index.js` — routes, auth, KV cache. `src/menu.js` — builds the JSON from the tables and views.
- `wrangler.toml` — D1 binding `DB`, KV binding `MENU_KV`, variables. `schema.sql` — the D1 tables and views (derived availability).

## Deploy
1. `cd backend && npm install`
2. `npx wrangler login`
3. `npx wrangler secret put ADMIN_KEY` — choose a long random value and keep it (n8n will use it).
4. In `wrangler.toml` set `ALLOWED_ORIGIN` to your Pages address, and `R2_PUBLIC_BASE` when the icons are in R2.
5. `npx wrangler deploy` — it prints the Worker address. Put `https://<worker>/api/menu` in `frontend/js/config.js` as `MENU_API_URL`.
6. After changing menu data directly in D1, call `POST /api/refresh` (or wait up to one hour for the KV expiry).

## Free-plan notes
A menu view costs one Worker request and one KV read. KV is written only on a refresh or an availability change (limit: 1,000 writes/day).
Availability rule: a component is available if **any** branch has it available; a category follows its main component, an item its sub component.
