const express = require("express");
const router = express.Router();
const db = require("../db");
const { bcrypt } = require("../auth");

const getFirstAdminId = () => {
  const row = db
    .prepare(`SELECT id FROM users WHERE role='ADMIN' ORDER BY id ASC LIMIT 1`)
    .get();
  return row?.id ?? null;
};

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
  const id = req.params.id;
  const current = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);
  if (!current) return res.status(404).json({ error: "Usuario no encontrado" });

  const { name, email, role, active } = req.body || {};

  if (current.role === "ADMIN") {
    if (role && role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "No se puede cambiar el rol de un ADMIN" });
    }
    if (active === false) {
      return res.status(403).json({ error: "No se puede desactivar un ADMIN" });
    }
  }

  const next = {
    name: name ?? current.name,
    email: email ?? current.email,
    role: role ?? current.role,
    active: typeof active === "boolean" ? active : current.active,
  };

  db.prepare(
    `UPDATE users SET name=?, email=?, role=?, active=? WHERE id=?`
  ).run(next.name, next.email, next.role, next.active ? 1 : 0, id);

  res.json(
    db
      .prepare(`SELECT id, name, email, role, active FROM users WHERE id=?`)
      .get(id)
  );
});

// eliminar
router.delete("/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(id);
  if (!u) return res.status(404).json({ error: "Usuario no encontrado" });

  if (u.role === "ADMIN") {
    const firstAdminId = getFirstAdminId();
    if (firstAdminId && id === firstAdminId) {
      return res
        .status(403)
        .json({ error: "No se puede eliminar el primer ADMIN" });
    }
  }

  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  res.json({ ok: true });
});

module.exports = router;
