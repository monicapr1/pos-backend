const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "Sin token" });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || "dev");
    req.user = payload; // { id, role }
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Requiere rol ADMIN" });
  }
  next();
}

const COMPANY_DOMAIN = process.env.COMPANY_DOMAIN || "empresa.com";
const emailCorp = (email = "") =>
  new RegExp(`@${COMPANY_DOMAIN.replace(".", "\\.")}$`, "i").test(email);
// 8+ chars, 1 upper, 1 lower, 1 digit, 1 special
const strongPwd = (pwd = "") => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/.test(pwd);


// Listar usuarios
router.get("/users", requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare(`SELECT id,name,email,role,active FROM users ORDER BY id DESC`).all();
  res.json(rows);
});

// Crear usuario (ADMIN)
router.post("/users", requireAuth, requireAdmin, (req, res) => {
  let { name, email, password, role = "STAFF", active = true } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: "name y email son obligatorios" });

  if (!emailCorp(email)) return res.status(400).json({ error: "El email debe ser corporativo" });
  if (!strongPwd(password)) {
    return res.status(400).json({
      error: "La contraseña debe tener 8+, 1 mayús, 1 minús, 1 número y 1 especial",
    });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare(
        `INSERT INTO users (name,email,password_hash,role,active) VALUES (?,?,?,?,?)`
      )
      .run(name, email, hash, role, active ? 1 : 0);

    const u = db
      .prepare(`SELECT id,name,email,role,active FROM users WHERE id=?`)
      .get(info.lastInsertRowid);
    res.status(201).json(u);
  } catch (e) {
    res
      .status(400)
      .json({ error: e.message.includes("UNIQUE") ? "Email ya existe" : e.message });
  }
});

// Actualizar usuario (ADMIN)
router.put("/users/:id", requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  const { name, email, password, role, active } = req.body || {};

  if (email && !emailCorp(email))
    return res.status(400).json({ error: "El email debe ser corporativo" });

  let setPwd = "";
  const paramsPwd = [];
  if (password) {
    if (!strongPwd(password))
      return res.status(400).json({ error: "Contraseña no cumple política" });
    const hash = bcrypt.hashSync(password, 10);
    setPwd = `, password_hash = ?`;
    paramsPwd.push(hash);
  }

  const sql = `UPDATE users SET
    name = COALESCE(?, name),
    email = COALESCE(?, email),
    role = COALESCE(?, role),
    active = COALESCE(?, active)
    ${setPwd}
    WHERE id = ?`;

  const result = db
    .prepare(sql)
    .run(
      name ?? null,
      email ?? null,
      role ?? null,
      typeof active === "boolean" ? (active ? 1 : 0) : null,
      ...paramsPwd,
      id
    );

  if (result.changes === 0) return res.status(404).json({ error: "No encontrado" });

  const u = db.prepare(`SELECT id,name,email,role,active FROM users WHERE id=?`).get(id);
  res.json(u);
});

// Eliminar usuario (ADMIN)
router.delete("/users/:id", requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare(`DELETE FROM users WHERE id=?`).run(id);
  if (result.changes === 0) return res.status(404).json({ error: "No encontrado" });
  res.json({ ok: true });
});

module.exports = router;
