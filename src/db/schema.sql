-- Butts Kitchen database schema (PostgreSQL). Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS menu_items (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  category     TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  is_new       BOOLEAN NOT NULL DEFAULT FALSE,
  available    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_variants (
  id          SERIAL PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL CHECK (price > 0),
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS menu_variants_item_idx ON menu_variants(item_id);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'preparing', 'ready', 'completed', 'cancelled')),
  type           TEXT NOT NULL CHECK (type IN ('delivery', 'pickup')),
  source         TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'phone')),
  customer_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  address        TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  subtotal       INTEGER NOT NULL,
  delivery_fee   INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL,
  cancel_reason  TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id             SERIAL PRIMARY KEY,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id   INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  variant_id     INTEGER REFERENCES menu_variants(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,           -- copied at order time so history survives menu edits
  variant_label  TEXT NOT NULL,
  unit_price     INTEGER NOT NULL,
  qty            INTEGER NOT NULL CHECK (qty > 0),
  line_total     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_status_events (
  id          SERIAL PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_status_events_order_idx ON order_status_events(order_id);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
