// Builds the menu JSON (see ../../docs/menu-api-contract.md) from the D1 tables and views.
const IMAGE_FILE = /\.(png|webp|svg|jpe?g|gif|avif)$/i;

// icons.file holds either an emoji (temporary) or an image path inside the R2 bucket.
function icon(file, base) {
  if (!file) return { icon_url: '', icon_emoji: '' };
  if (IMAGE_FILE.test(file)) {
    const b = (base || '').replace(/\/+$/, '');
    return { icon_url: b ? `${b}/${file.replace(/^\/+/, '')}` : '', icon_emoji: '' };
  }
  return { icon_url: '', icon_emoji: file };
}

const groupBy = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {});

export async function buildMenu(env) {
  const q = (sql) => env.DB.prepare(sql);
  const [cats, subs, items, vars, extras, xprices] = await env.DB.batch([
    q(`SELECT c.cat_id, c.name, c.availability, i.file FROM v_categories c LEFT JOIN icons i ON i.ico_id = c.ico_id ORDER BY c.cat_id`),
    q(`SELECT DISTINCT it.cat_id, s.sub_id, s.name, ic.file FROM items it JOIN subcategories s ON s.sub_id = it.sub_id LEFT JOIN icons ic ON ic.ico_id = s.ico_id ORDER BY it.cat_id, s.sub_id`),
    q(`SELECT v.itm_id, v.name, v.main_price, v.cat_id, v.sub_id, v.availability, g.name AS group_name, ic.file
       FROM v_items v LEFT JOIN group_list g ON g.lis_id = v.lis_id LEFT JOIN icons ic ON ic.ico_id = v.ico_id ORDER BY v.itm_id`),
    q(`SELECT vi.cat_id, sv.var_id, sv.name, sv.extra_price FROM variants_instance vi JOIN size_variants sv ON sv.var_id = vi.var_id ORDER BY vi.cat_id, sv.extra_price, sv.var_id`),
    q(`SELECT ei.cat_id, e.ext_id, e.name, e.price FROM extra_instance ei JOIN extra e ON e.ext_id = ei.ext_id ORDER BY ei.cat_id, e.ext_id`),
    q(`SELECT ext_id, var_id, price FROM extra_prices ORDER BY ext_id, var_id`),
  ]);
  const base = env.R2_PUBLIC_BASE || '';
  const rows = (r) => r.results || [];
  const varsByCat = groupBy(rows(vars), 'cat_id');
  const extrasByCat = groupBy(rows(extras), 'cat_id');
  const pricesByExt = groupBy(rows(xprices), 'ext_id');
  const subsByCat = groupBy(rows(subs), 'cat_id');
  const itemsByCat = groupBy(rows(items), 'cat_id');

  const itemOut = (i) => ({
    itm_id: i.itm_id, name: i.name, main_price: i.main_price, ...icon(i.file, base),
    is_visible: 1, is_available: i.availability === 'available' ? 1 : 0, group_name: i.group_name || '',
  });

  return {
    delivery_fee: Number(env.DELIVERY_FEE ?? 15),
    categories: rows(cats).map((c) => {
      const sizes = varsByCat[c.cat_id] || [];
      const sizeIds = new Set(sizes.map((s) => s.var_id));
      const all = itemsByCat[c.cat_id] || [];
      const out = {
        cat_id: c.cat_id, name: c.name, ...icon(c.file, base),
        is_visible: 1, is_available: c.availability === 'available' ? 1 : 0,
        size_variants: sizes.map((s) => ({ var_id: s.var_id, name: s.name, extra_price: s.extra_price })),
        extras: (extrasByCat[c.cat_id] || []).map((e) => ({
          ext_id: e.ext_id, name: e.name, price: e.price, is_available: 1,
          size_prices: (pricesByExt[e.ext_id] || []).filter((p) => sizeIds.has(p.var_id)).map((p) => ({ var_id: p.var_id, price: p.price })),
        })),
        subcategories: (subsByCat[c.cat_id] || []).map((s) => ({
          sub_id: s.sub_id, name: s.name, ...icon(s.file, base), is_visible: 1, is_available: 1,
          items: all.filter((i) => i.sub_id === s.sub_id).map(itemOut),
        })),
      };
      const direct = all.filter((i) => i.sub_id == null).map(itemOut);
      if (direct.length) out.items = direct;   // categories without sub-categories list items directly
      return out;
    }),
  };
}
