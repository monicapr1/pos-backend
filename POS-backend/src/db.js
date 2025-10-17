// POS-backend/src/db.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE = process.env.DB_FILE || path.join(__dirname, "data", "pos.db");
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function columnExists(table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => c.name === column);
  } catch { return false; }
}
function index(name) {
  return `CREATE INDEX IF NOT EXISTS ${name}`;
}

function migrate() {
  // users
  db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF', -- ADMIN | STAFF
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`).run();

  // products (base)
  db.prepare(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0
  )`).run();

  // sales (base)
  db.prepare(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    total REAL NOT NULL DEFAULT 0
  )`).run();

  // sale_items
  db.prepare(`CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    sku TEXT,
    name TEXT,
    price REAL NOT NULL,
    qty INTEGER NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`).run();

  // customers
  db.prepare(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`).run();
  db.prepare(`${index("idx_customers_name")} ON customers(name)`).run();
  db.prepare(`${index("idx_customers_email")} ON customers(email)`).run();

  // stock_movements (historial de inventario)
  db.prepare(`CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL,            -- 'IN' | 'OUT'
    qty INTEGER NOT NULL,          -- cantidad > 0
    note TEXT,
    user_id INTEGER,
    reference_sale_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`).run();
  db.prepare(`${index("idx_stock_movements_product")} ON stock_movements(product_id)`).run();
  db.prepare(`${index("idx_stock_movements_created")} ON stock_movements(created_at)`).run();


if (!columnExists("sales", "subtotal")) {
  db.prepare(`ALTER TABLE sales ADD COLUMN subtotal REAL NOT NULL DEFAULT 0`).run();
}
if (!columnExists("sales", "tax")) {
  db.prepare(`ALTER TABLE sales ADD COLUMN tax REAL NOT NULL DEFAULT 0`).run();
}
if (!columnExists("sales", "discount")) {
  db.prepare(`ALTER TABLE sales ADD COLUMN discount REAL NOT NULL DEFAULT 0`).run();
}
  
  if (!columnExists("sales", "folio")) {
    db.prepare(`ALTER TABLE sales ADD COLUMN folio TEXT`).run();
    db.prepare(`${index("idx_sales_folio")} ON sales(folio)`).run();
  }

  // sales.customer_id
  if (!columnExists("sales", "customer_id")) {
    db.prepare(`ALTER TABLE sales ADD COLUMN customer_id INTEGER`).run();
  }

  // sales.customer_name (denormalizado para reportes)
  if (!columnExists("sales", "customer_name")) {
    db.prepare(`ALTER TABLE sales ADD COLUMN customer_name TEXT`).run();
  }

  // sales.payment_method (CASH, CARD, TRANSFER, etc.)
  if (!columnExists("sales", "payment_method")) {
    db.prepare(`ALTER TABLE sales ADD COLUMN payment_method TEXT`).run();
  }

  // products.min (stock mínimo)
  if (!columnExists("products", "min")) {
    db.prepare(`ALTER TABLE products ADD COLUMN min INTEGER NOT NULL DEFAULT 0`).run();
  }

  // products.image_url (imagen opcional)
  if (!columnExists("products", "image_url")) {
    db.prepare(`ALTER TABLE products ADD COLUMN image_url TEXT`).run();
  }

  // (opcional) products.max
  if (!columnExists("products", "max")) {
    db.prepare(`ALTER TABLE products ADD COLUMN max INTEGER`).run();
  }

  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_stock_movements_after_insert
    AFTER INSERT ON stock_movements
    BEGIN
      UPDATE products
      SET stock = stock + CASE NEW.type WHEN 'IN' THEN NEW.qty ELSE -NEW.qty END
      WHERE id = NEW.product_id;
    END;
  `).run();
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_stock_movements_after_delete
    AFTER DELETE ON stock_movements
    BEGIN
      UPDATE products
      SET stock = stock - CASE OLD.type WHEN 'IN' THEN OLD.qty ELSE -OLD.qty END
      WHERE id = OLD.product_id;
    END;
  `).run();
}

// (ADMIN) 
function seed() {
  const row = db.prepare(`SELECT COUNT(*) as c FROM users`).get();
  if (row.c === 0) {
    const bcrypt = require("bcryptjs");
    const hash = bcrypt.hashSync("ADMIN", 10); // contraseña inicial
    const domain = process.env.COMPANY_DOMAIN || "empresa.com";
    db.prepare(
      `INSERT INTO users (name,email,password_hash,role,active) VALUES (?,?,?,?,?)`
    ).run("Administrador", `admin@${domain}`, hash, "ADMIN", 1);
  }
}

migrate();
seed();

module.exports = db;
