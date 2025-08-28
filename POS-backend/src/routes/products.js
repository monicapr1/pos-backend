const express = require("express");
const router = express.Router();
const db = require("../db");

// listar
router.get("/products", (_req, res) => {
  const rows = db.prepare(`SELECT * FROM products ORDER BY id`).all();
  res.json(rows);
});

// crear
router.post("/products", (req, res) => {
  const {
    sku,
    name,
    price = 0,
    stock = 0,
    min = 0,
    image_url = "",
  } = req.body || {};
  if (!sku || !name)
    return res.status(400).json({ error: "sku y name son requeridos" });

  const stmt = db.prepare(`
    INSERT INTO products (sku, name, price, stock, min, image_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(sku, name, price, stock, min, image_url);
  const prod = db
    .prepare(
      `SELECT id, sku, name, price, stock, min, image_url FROM products WHERE id=?`
    )
    .get(info.lastInsertRowid);
  res.json(prod);
});

// actualizar
router.put("/products/:id", (req, res) => {
  const id = req.params.id;
  const current = db.prepare(`SELECT * FROM products WHERE id=?`).get(id);
  if (!current) return res.status(404).json({ error: "Not found" });

  const { sku, name, price, stock, min, image_url } = req.body || {};
  const next = {
    sku: sku ?? current.sku,
    name: name ?? current.name,
    price: price ?? current.price,
    stock: stock ?? current.stock,
    min: min ?? current.min,
    image_url: image_url ?? current.image_url,
  };

  db.prepare(
    `
    UPDATE products SET sku=?, name=?, price=?, stock=?, min=?, image_url=? WHERE id=?
  `
  ).run(
    next.sku,
    next.name,
    next.price,
    next.stock,
    next.min,
    next.image_url,
    id
  );

  const updated = db
    .prepare(
      `SELECT id, sku, name, price, stock, min, image_url FROM products WHERE id=?`
    )
    .get(id);
  res.json(updated);
});

// eliminar
router.delete("/products/:id", (req, res) => {
  db.prepare(`DELETE FROM products WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
