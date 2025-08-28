const express = require("express");
const router = express.Router();
const db = require("../db");
const { bcrypt, signToken } = require("../auth");

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Faltan credenciales" });

  const user = db
    .prepare(`SELECT * FROM users WHERE email = ? AND active = 1`)
    .get(email);
  if (!user)
    return res.status(401).json({ error: "Usuario o contraseña inválidos" });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok)
    return res.status(401).json({ error: "Usuario o contraseña inválidos" });

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

module.exports = router;
