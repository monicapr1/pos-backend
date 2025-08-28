# Documentación del Sistema POS

Un sistema de Punto de Venta (POS) minimalista con frontend, backend y base de datos SQLite.

## Características

- **Caja**: Carrito de compras, cobro con IVA al 16%, soporta clientes públicos o registrados.
- **Ventas**: Ver detalles, editar o eliminar ventas.
- **Productos**: Operaciones CRUD con seguimiento de stock y cantidad mínima.
- **Inventario**: Ajustes de stock (ENTRADA/SALIDA/ESTABLECER) y registro de movimientos.
- **Clientes**: Funcionalidad completa de CRUD.
- **Usuarios**: CRUD con roles.
- **Autenticación**: Sistema de inicio de sesión basado en JWT.
- **Base de datos**: SQLite (usando `better-sqlite3`).

## Tecnologías

- **Frontend**: HTML/CSS/JavaScript puro.
- **Backend**: Node.js + Express + SQLite (`better-sqlite3`).

## Estructura del Repositorio

```
POS-frontend/
├── assets/
│   ├── js/app.js
│   └── styles/styles.css
├── index.html
├── ventas.html
├── productos.html
├── stock.html
├── clientes.html
├── usuarios.html

POS-backend/
├── src/
│   ├── data/pos.db
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

## Requisitos

- **Node.js**: Versión 18+ (se recomienda 20+).
- **npm**: Versión 8+.
- **Sistemas operativos**: macOS, Linux o Windows.

## Variables de Entorno (Backend)

Crea un archivo `.env` en `POS-backend/` con lo siguiente:

```
PORT=4000
JWT_SECRET=super-secreto-cambia-esto
POS_DB_PATH=./src/data/pos.db
CORS_ORIGIN=http://localhost:5500
```

## Instalación

1. **Backend**:

   ```bash
   cd POS-backend
   npm install
   npm run dev  # o npm start
   ```

2. **Frontend**:
   - Abre `login.html` directamente o usa Live Server (`http://localhost:5500`).
   - Asegúrate de que `API_BASE` en `POS-frontend/assets/js/app.js` esté configurado como `http://localhost:4000`.

## Inicio de Sesión de Demostración

- **Correo**: `admin@tienda.com`
- **Contraseña**: `123456`

## Restablecer Base de Datos

Para restablecer la base de datos, elimina los archivos:

```bash
rm -f POS-backend/src/data/pos.db POS-backend/src/data/pos.db-wal POS-backend/src/data/pos.db-shm
```
