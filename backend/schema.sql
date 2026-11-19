-- abo_asala_menu_database (Cloudflare D1 / SQLite) — created from the ERD.
-- Insert order: icons, components, branches, group_list, size_variants, extra -> categories, subcategories -> items -> junction tables.

CREATE TABLE icons (ico_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, file TEXT);
CREATE TABLE components (com_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, component_type TEXT NOT NULL CHECK (component_type IN ('main','sub')));
CREATE TABLE branches (brc_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT);
CREATE TABLE categories (
  cat_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  ico_id INTEGER REFERENCES icons(ico_id) ON DELETE SET NULL,
  com_id INTEGER NOT NULL UNIQUE REFERENCES components(com_id));
CREATE TABLE subcategories (sub_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ico_id INTEGER REFERENCES icons(ico_id) ON DELETE SET NULL);
CREATE TABLE group_list (lis_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE items (
  itm_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  main_price REAL NOT NULL CHECK (main_price >= 0),
  cat_id INTEGER NOT NULL REFERENCES categories(cat_id),
  sub_id INTEGER REFERENCES subcategories(sub_id),
  lis_id INTEGER REFERENCES group_list(lis_id),
  com_id INTEGER NOT NULL REFERENCES components(com_id),
  ico_id INTEGER REFERENCES icons(ico_id) ON DELETE SET NULL);
CREATE TABLE extra (ext_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price REAL NOT NULL CHECK (price >= 0));
CREATE TABLE extra_instance (
  cat_ext INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id INTEGER NOT NULL REFERENCES extra(ext_id) ON DELETE CASCADE,
  cat_id INTEGER NOT NULL REFERENCES categories(cat_id) ON DELETE CASCADE,
  UNIQUE (ext_id, cat_id));
CREATE TABLE size_variants (var_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, extra_price REAL NOT NULL DEFAULT 0 CHECK (extra_price >= 0));
CREATE TABLE variants_instance (
  cat_var INTEGER PRIMARY KEY AUTOINCREMENT,
  var_id INTEGER NOT NULL REFERENCES size_variants(var_id) ON DELETE CASCADE,
  cat_id INTEGER NOT NULL REFERENCES categories(cat_id) ON DELETE CASCADE,
  UNIQUE (var_id, cat_id));
CREATE TABLE extra_prices (
  ext_price_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ext_id INTEGER NOT NULL REFERENCES extra(ext_id) ON DELETE CASCADE,
  var_id INTEGER NOT NULL REFERENCES size_variants(var_id) ON DELETE CASCADE,
  price REAL NOT NULL CHECK (price >= 0),
  UNIQUE (ext_id, var_id));
CREATE TABLE branches_components_availability (
  brc_com_id INTEGER PRIMARY KEY AUTOINCREMENT,
  brc_id INTEGER NOT NULL REFERENCES branches(brc_id) ON DELETE CASCADE,
  com_id INTEGER NOT NULL REFERENCES components(com_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','unavailable')),
  UNIQUE (brc_id, com_id));

CREATE INDEX idx_items_cat ON items(cat_id);
CREATE INDEX idx_items_sub ON items(sub_id);
CREATE INDEX idx_items_lis ON items(lis_id);
CREATE INDEX idx_items_com ON items(com_id);
CREATE INDEX idx_items_ico ON items(ico_id);
CREATE INDEX idx_categories_ico ON categories(ico_id);
CREATE INDEX idx_subcategories_ico ON subcategories(ico_id);
CREATE INDEX idx_bca_com ON branches_components_availability(com_id);
CREATE INDEX idx_extra_instance_cat ON extra_instance(cat_id);
CREATE INDEX idx_variants_instance_cat ON variants_instance(cat_id);
CREATE INDEX idx_extra_prices_ext ON extra_prices(ext_id);

-- Derived values. A component is available if AT LEAST ONE branch has it available (OR across branches).
CREATE VIEW v_components AS
SELECT c.com_id, c.name, c.component_type,
  CASE WHEN COALESCE((SELECT MAX(b.status = 'available') FROM branches_components_availability b WHERE b.com_id = c.com_id), 0) = 1
       THEN 'available' ELSE 'unavailable' END AS status
FROM components c;
-- Category availability = its main component; item availability = its sub component.
CREATE VIEW v_categories AS
SELECT cat.cat_id, cat.name, cat.ico_id, cat.com_id, vc.status AS availability
FROM categories cat JOIN v_components vc ON vc.com_id = cat.com_id;
CREATE VIEW v_items AS
SELECT i.itm_id, i.name, i.main_price, i.cat_id, i.sub_id, i.lis_id, i.com_id, i.ico_id, vc.status AS availability
FROM items i JOIN v_components vc ON vc.com_id = i.com_id;
