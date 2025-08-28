require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const { authMiddleware } = require("./auth");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Rutas
app.get("/", (_req, res) =>
  res.json({ ok: true, name: "POS API", version: "1.0" })
);
app.use("/auth", require("./routes/auth"));
app.use("/api", authMiddleware, require("./routes/users"));
app.use("/api", authMiddleware, require("./routes/customers"));
app.use("/api", authMiddleware, require("./routes/products"));
app.use("/api", authMiddleware, require("./routes/stock"));
app.use("/api", authMiddleware, require("./routes/sales"));

const port = process.env.PORT || 4000;
app.listen(port, () =>
  console.log(`✅ POS API escuchando en http://localhost:${port}`)
);
