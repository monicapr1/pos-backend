const express = require("express");
const router = express.Router();
const db = require("../db");

// Helpers transacción
const tx = (fn) => db.transaction(fn);

// Listar movimientos (opcionalmente por producto)
router.get("/stock/movements", (req, res) => {
  const { product_id } = req.query;
  const base = `SELECT sm.*, p.sku, p.name
                FROM stock_movements sm
                JOIN products p ON p.id = sm.product_id`;
  const rows = product_id
    ? db
        .prepare(base + ` WHERE sm.product_id = ? ORDER BY sm.id DESC`)
        .all(product_id)
    : db.prepare(base + ` ORDER BY sm.id DESC`).all();
  res.json(rows);
});

// Ajuste simple (entrada/salida) con registro de movimiento
router.post("/stock/adjust", (req, res) => {
  const { product_id, type, qty, note } = req.body || {};
  if (!product_id || !type || !qty)
    return res
      .status(400)
      .json({ error: "product_id, type y qty son requeridos" });
  if (!["IN", "OUT"].includes(type))
    return res.status(400).json({ error: "type debe ser IN u OUT" });

  const run = tx(() => {
    const p = db
      .prepare(`SELECT id,stock,name FROM products WHERE id=?`)
      .get(product_id);
    if (!p) throw new Error("Producto no existe");

    const nQty = parseInt(qty, 10);
    if (isNaN(nQty) || nQty <= 0) throw new Error("qty inválida");

    // Actualizar stock
    if (type === "OUT") {
      if (p.stock < nQty) throw new Error(`Stock insuficiente para ${p.name}`);
      db.prepare(`UPDATE products SET stock = stock - ? WHERE id=?`).run(
        nQty,
        p.id
      );
    } else {
      db.prepare(`UPDATE products SET stock = stock + ? WHERE id=?`).run(
        nQty,
        p.id
      );
    }

    // Registrar movimiento
    db.prepare(
      `INSERT INTO stock_movements (product_id, type, qty, note) VALUES (?,?,?,?)`
    ).run(p.id, type, nQty, note || null);

    return db.prepare(`SELECT * FROM products WHERE id=?`).get(p.id);
  });

  try {
    const prod = run();
    res.json({ ok: true, product: prod });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// (Opcional) Reemplazar stock directo y registrar diferencia
router.post("/stock/set", (req, res) => {
  const { product_id, stock, note } = req.body || {};
  if (!product_id || stock == null)
    return res.status(400).json({ error: "product_id y stock son requeridos" });
  const run = tx(() => {
    const p = db
      .prepare(`SELECT id,stock FROM products WHERE id=?`)
      .get(product_id);
    if (!p) throw new Error("Producto no existe");
    const newStock = parseInt(stock, 10);
    if (isNaN(newStock) || newStock < 0) throw new Error("stock inválido");

    const diff = newStock - p.stock;
    db.prepare(`UPDATE products SET stock=? WHERE id=?`).run(newStock, p.id);
    if (diff !== 0) {
      db.prepare(
        `INSERT INTO stock_movements (product_id,type,qty,note) VALUES (?,?,?,?)`
      ).run(
        p.id,
        diff > 0 ? "IN" : "OUT",
        Math.abs(diff),
        note || "Ajuste directo"
      );
    }
    return db.prepare(`SELECT * FROM products WHERE id=?`).get(p.id);
  });
  try {
    res.json({ ok: true, product: run() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
