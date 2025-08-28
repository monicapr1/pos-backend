const express = require("express");
const router = express.Router();
const db = require("../db");

// listar
router.get("/customers", (_req, res) => {
  const rows = db.prepare(`SELECT * FROM customers ORDER BY id`).all();
  res.json(rows);
});

// crear
router.post("/customers", (req, res) => {
  const { name, email, phone } = req.body || {};
  if (!name) return res.status(400).json({ error: "name requerido" });
  const info = db
    .prepare(`INSERT INTO customers (name,email,phone) VALUES (?,?,?)`)
    .run(name, email, phone);
  const row = db
    .prepare(`SELECT * FROM customers WHERE id=?`)
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

// actualizar
router.put("/customers/:id", (req, res) => {
  const c = db.prepare(`SELECT * FROM customers WHERE id=?`).get(req.params.id);
  if (!c) return res.status(404).json({ error: "No existe" });
  const { name, email, phone } = req.body || {};
  db.prepare(`UPDATE customers SET name=?, email=?, phone=? WHERE id=?`).run(
    name || c.name,
    email || c.email,
    phone || c.phone,
    c.id
  );
  res.json(db.prepare(`SELECT * FROM customers WHERE id=?`).get(c.id));
});

// eliminar
router.delete("/customers/:id", (req, res) => {
  db.prepare(`DELETE FROM customers WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
