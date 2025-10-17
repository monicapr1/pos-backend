// require("dotenv").config();
// const express = require("express");
// const cors = require("cors");
// const { authMiddleware } = require("./auth");

// const app = express();

// const ORIGINS = process.env.CORS_ORIGIN
//   ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
//   : [
//       "http://localhost:3000",
//       "http://127.0.0.1:3000",
//       "http://172.20.21.215:3000",
//       "http://192.168.68.102:3000" 
//     ];

// const corsOptions = {
//   origin(origin, cb) {
//     if (!origin) return cb(null, true);
//     if (ORIGINS === true || ORIGINS.includes(origin)) return cb(null, true);
//     return cb(new Error("Not allowed by CORS"));
//   },
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"], 
//   exposedHeaders: [], 
// };

// app.use(cors(corsOptions));
// app.options("*", cors(corsOptions));

// app.use(express.json());

// app.get("/", (_req, res) => res.json({ ok: true, name: "POS API", version: "1.0" }));

// app.use("/auth", require("./routes/auth"));
// app.use("/api", authMiddleware, require("./routes/users"));
// app.use("/api", authMiddleware, require("./routes/customers"));
// app.use("/api", authMiddleware, require("./routes/products"));
// app.use("/api", authMiddleware, require("./routes/stock"));
// app.use("/api", authMiddleware, require("./routes/sales"));

// const port = process.env.PORT || 4000;
// app.listen(port, () => {
//   console.log(`✅ POS API escuchando en http://localhost:${port}`);
// });

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { authMiddleware } = require("./auth");

const app = express();

const RAW = process.env.CORS_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000,http://192.168.68.102:3000";
const ALLOW_ALL = RAW.trim() === "*" || RAW.trim().toLowerCase() === "true";
const ALLOWED_LIST = ALLOW_ALL ? [] : RAW.split(",").map(s => s.trim());

const WILDCARDS = [
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^http:\/\/192\.168\.\d+\.\d+(?::\d+)?$/,
  /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(?::\d+)?$/, // 172.16.0.0/12
];

function isAllowed(origin) {
  if (ALLOW_ALL) return true;
  if (ALLOWED_LIST.includes(origin)) return true;
  return WILDCARDS.some(rx => rx.test(origin));
}

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);

    if (isAllowed(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Requested-With"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
// Healthcheck público (sin auth)
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "pos-backend",
    time: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => res.json({ ok: true, name: "POS API", version: "1.0" }));

app.use("/auth", require("./routes/auth"));
app.use("/api", authMiddleware, require("./routes/users"));
app.use("/api", authMiddleware, require("./routes/customers"));
app.use("/api", authMiddleware, require("./routes/products"));
app.use("/api", authMiddleware, require("./routes/stock"));
app.use("/api", authMiddleware, require("./routes/sales"));

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ POS API escuchando en http://localhost:${port}`);
  console.log("CORS_ORIGIN:", RAW);
  console.log("ALLOW_ALL:", ALLOW_ALL);
});
