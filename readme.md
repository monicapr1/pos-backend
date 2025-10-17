# Sistema POS Armario — Frontend & Backend

Un sistema de Punto de Venta (POS) minimalista con **frontend**, **backend** y **SQLite**.

## ✨ Características

- **Caja**: Carrito, cobro con IVA 16%, clientes públicos o registrados.
- **Ventas**: Listar, ver detalle, editar/eliminar.
- **Productos**: CRUD con stock y mínimo.
- **Inventario**: Ajustes (ENTRADA/SALIDA/ESTABLECER) y bitácora de movimientos.
- **Clientes**: CRUD completo.
- **Usuarios**: CRUD con roles.
- **Autenticación**: JWT (token en `localStorage`).
- **BD**: SQLite con `better-sqlite3`.

## 🧱 Tecnologías

- **Frontend**: HTML + CSS + JavaScript (sin frameworks).
- **Backend**: Node.js + Express + SQLite (`better-sqlite3`).

## 📂 Estructura

```
POS-frontend/
├── assets/
│   ├── js/
│   │   └── app.js
│   │   └── top-sell.js
│   └── styles/
│       └── styles.css
├── index.html
├── login.html
├── ventas.html
├── productos.html
├── stock.html
├── clientes.html
└── usuarios.html

POS-backend/
├── src/
│   ├── data/              
│   │   └── pos.db
│   ├── routes/
│   │   ├── auth.js
│   │   ├── customers.js
│   │   ├── products.js
│   │   ├── sales.js
│   │   ├── stock.js
│   │   └── users.js
│   ├── db.js
│   └── index.js
├── .env
└── package.json
```

## ✅ Requisitos

- **Node.js** 18+ (recomendado 20+)
- **npm** 8+
- macOS / Linux / Windows

## 🔐 Variables de entorno (Backend)

Crea `POS-backend/.env`:

```env
PORT=4000
JWT_SECRET=super-secreto-cambia-esto
POS_DB_PATH=./src/data/pos.db
CORS_ORIGIN=http://localhost:5500
COMPANY_DOMAIN=hasbolis.com
```

## 🧰 Instalación

### 1) Backend
## IMPORTANTE: USAR NODE 20 RECOMENDADO

```bash
cd POS-backend
node -v        # Debe ser v20.x.  Instalarlo :nvm install 20 - nvm use 20
npm install
npm run dev
# npm start    # modo producción
```

### 2) Frontend

```bash
cd POS-frontend
npx serve
# npx http-server -p 5500 .
```

## 🔑 Credenciales demo

- **Correo**: `admin@hasbolis.com`
- **Contraseña**: `ADMIN`

## 🧹 Resetear la Base de Datos

```bash
rm -f POS-backend/src/data/pos.db POS-backend/src/data/pos.db-wal POS-backend/src/data/pos.db-shm
```

## ⚙️ Generar dependencias en backend (solo la primera vez)

```bash
npm init -y && npm install express cors better-sqlite3 jsonwebtoken bcryptjs morgan dotenv && npm install -D nodemon && npm pkg set scripts.start="node src/index.js" && npm pkg set scripts.dev="nodemon src/index.js"
```
