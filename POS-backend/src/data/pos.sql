CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  min INTEGER NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT ''
);
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  type TEXT NOT NULL,            -- 'IN' | 'OUT'
  qty INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT UNIQUE,
  date TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  subtotal REAL NOT NULL,
  tax REAL NOT NULL,
  total REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  total REAL NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_stock_movements_prod ON stock_movements(product_id);
