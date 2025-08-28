const express = require("express");
const router = express.Router();
const db = require("../db");
const { bcrypt } = require("../auth");

// listar
router.get("/users", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id,name,email,role,active,created_at FROM users ORDER BY id`
    )
    .all();
  res.json(rows);
});

// crear
router.post("/users", (req, res) => {
  const {
    name,
    email,
    password = "123456",
    role = "STAFF",
    active = true,
  } = req.body || {};
  if (!name || !email)
    return res.status(400).json({ error: "name y email son obligatorios" });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare(
        `INSERT INTO users (name,email,password_hash,role,active) VALUES (?,?,?,?,?)`
      )
      .run(name, email, hash, role, active ? 1 : 0);
    const row = db
      .prepare(
        `SELECT id,name,email,role,active,created_at FROM users WHERE id=?`
      )
      .get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    res.status(400).json({ error: "Email duplicado" });
  }
});

// actualizar
router.put("/users/:id", (req, res) => {
  const { name, email, role, active } = req.body || {};
  const u = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.params.id);
  if (!u) return res.status(404).json({ error: "No existe" });
  db.prepare(
    `UPDATE users SET name=?, email=?, role=?, active=? WHERE id=?`
  ).run(
    name || u.name,
    email || u.email,
    role || u.role,
    active ?? (u.active ? 1 : 0) ? 1 : 0,
    u.id
  );
  const row = db
    .prepare(
      `SELECT id,name,email,role,active,created_at FROM users WHERE id=?`
    )
    .get(u.id);
  res.json(row);
});

// eliminar
router.delete("/users/:id", (req, res) => {
  db.prepare(`DELETE FROM users WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
