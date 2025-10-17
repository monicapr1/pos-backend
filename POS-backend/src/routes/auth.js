const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../db");


const COMPANY_DOMAIN = process.env.COMPANY_DOMAIN || "empresa.com";
const emailCorp = (email = "") => new RegExp(`@${COMPANY_DOMAIN.replace(".", "\\.")}$`, "i").test(email);


router.post("/login", (req, res) => {
const { email, password } = req.body || {};
if (!email || !password) return res.status(400).json({ error: "Email y password requeridos" });


// PRD: solo correos corporativos
if (!emailCorp(email)) return res.status(401).json({ error: "Usa tu correo corporativo para iniciar sesión" });


const user = db.prepare(`SELECT * FROM users WHERE email = ? AND active = 1`).get(email);
if (!user) return res.status(401).json({ error: "Credenciales inválidas" });


const ok = bcrypt.compareSync(password, user.password_hash);
if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });


const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || "dev", { expiresIn: "8h" });
res.json({
token,
user: { id: user.id, name: user.name, email: user.email, role: user.role, active: !!user.active }
});
});


router.get("/me", (req, res) => {
const auth = req.headers.authorization || "";
const t = auth.startsWith("Bearer ") ? auth.slice(7) : null;
if (!t) return res.status(401).json({ error: "Sin token" });
try {
const payload = jwt.verify(t, process.env.JWT_SECRET || "dev");
const u = db.prepare(`SELECT id,name,email,role,active FROM users WHERE id=?`).get(payload.id);
if (!u) return res.status(401).json({ error: "Token inválido" });
res.json(u);
} catch (e) {
res.status(401).json({ error: "Token inválido" });
}
});


module.exports = router;