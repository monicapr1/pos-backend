const express = require("express");
const router = express.Router();
const db = require("../db");

function pad5(n) {
  const num = Math.max(0, Number(n) || 0);
  return String(num).padStart(5, "0");
}

function normalizeSku(input) {
  const s = String(input || "").trim().toUpperCase();
  const m = s.match(/(\d+)$/);
  const num = m ? parseInt(m[1], 10) : 0;
  return `SKU-${pad5(num)}`;
}

function findSkuOwnerId(sku) {
  return db.prepare(`SELECT id FROM products WHERE UPPER(sku)=UPPER(?)`).get(sku);
}

function nextSkuFromDb() {
  const rows = db.prepare(`SELECT sku FROM products`).all();
  let maxN = 0;
  for (const r of rows) {
    const m = String(r.sku || "").toUpperCase().match(/(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  return `SKU-${pad5(maxN + 1)}`;
}

router.get("/products/exists", (req, res) => {
  const raw = req.query.sku || "";
  const excludeId = Number(req.query.excludeId) || null;
  const sku = normalizeSku(raw);

  const owner = findSkuOwnerId(sku);
  const exists = !!owner && (!excludeId || owner.id !== excludeId);
  res.json({ exists, normalized: sku });
});

router.get("/products/next-sku", (_req, res) => {
  res.json({ sku: nextSkuFromDb() });
});


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

  const skuN = normalizeSku(sku);
  const owner = findSkuOwnerId(skuN);
  if (owner) return res.status(409).json({ error: "El SKU ya existe" });

  const stmt = db.prepare(`
    INSERT INTO products (sku, name, price, stock, min, image_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(skuN, name, price, stock, min, image_url);
  const prod = db
    .prepare(
      `SELECT id, sku, name, price, stock, min, image_url FROM products WHERE id=?`
    )
    .get(info.lastInsertRowid);
  res.json(prod);
});

// actualizar
router.put("/products/:id", (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare(`SELECT * FROM products WHERE id=?`).get(id);
  if (!current) return res.status(404).json({ error: "Not found" });

  let { sku, name, price, stock, min, image_url } = req.body || {};

  let nextSku = current.sku;
  if (typeof sku === "string" && sku.trim() !== "") {
    nextSku = normalizeSku(sku);
    const owner = findSkuOwnerId(nextSku);
    if (owner && owner.id !== id) {
      return res.status(409).json({ error: "El SKU ya existe" });
    }
  }

  const next = {
    sku: nextSku,
    name: name ?? current.name,
    price: price ?? current.price,
    stock: stock ?? current.stock,
    min: min ?? current.min,
    image_url: image_url ?? current.image_url,
  };

  db.prepare(
    `UPDATE products SET sku=?, name=?, price=?, stock=?, min=?, image_url=? WHERE id=?`
  ).run(next.sku, next.name, next.price, next.stock, next.min, next.image_url, id);

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
