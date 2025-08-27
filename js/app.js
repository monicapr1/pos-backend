// ===== Estado & semillas =====
const STORAGE_KEY = "pos-demo-es-v1";
const state = loadState() || seedState();
saveState();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function seedState() {
  return {
    session: null,
    users: [
      {
        id: 1,
        nombre: "Administrador",
        email: "admin@tienda.com",
        rol: "ADMIN",
        activo: true,
      },
      {
        id: 2,
        nombre: "Cajero 1",
        email: "caja1@tienda.com",
        rol: "CASHIER",
        activo: true,
      },
    ],
    clientes: [
      {
        id: 1,
        nombre: "Alicia Gómez",
        email: "alicia@ejemplo.com",
        tel: "555-123-4567",
      },
      {
        id: 2,
        nombre: "Bruno Díaz",
        email: "bruno@ejemplo.com",
        tel: "555-987-6543",
      },
      {
        id: 3,
        nombre: "Carmen Vela",
        email: "carmen@ejemplo.com",
        tel: "555-567-8901",
      },
    ],
    productos: [
      {
        id: 1,
        sku: "WPI-001",
        nombre: "Proteína Whey 1kg",
        precio: 799,
        stock: 12,
        min: 5,
      },
      {
        id: 2,
        sku: "CRT-300",
        nombre: "Creatina 300g",
        precio: 299,
        stock: 5,
        min: 10,
      },
      {
        id: 3,
        sku: "ELT-ION",
        nombre: "Electrolitos 500ml",
        precio: 35,
        stock: 40,
        min: 10,
      },
      {
        id: 4,
        sku: "SHK-700",
        nombre: "Shaker 700ml",
        precio: 159,
        stock: 0,
        min: 8,
      },
      {
        id: 5,
        sku: "GLV-L",
        nombre: "Guantes Gym Talla L",
        precio: 249,
        stock: 7,
        min: 5,
      },
      {
        id: 6,
        sku: "BTT-STEEL",
        nombre: "Botella Acero 1L",
        precio: 189,
        stock: 20,
        min: 6,
      },
    ],
    ventas: [],
    folio: 1,
  };
}

// ===== Helpers globales =====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// ===== Auth compartido (todas las páginas excepto login) =====
function requireSession() {
  if (!state.session) {
    location.href = "login.html";
  }
}
function mountShell() {
  // set usuario
  const label = $("#userLabel");
  if (label) label.textContent = state.session?.nombre || "";
  const logout = $("#btnLogout");
  if (logout)
    logout.onclick = () => {
      state.session = null;
      saveState();
      location.href = "login.html";
    };
}

// ===== ========== PÁGINAS ESPECÍFICAS ========== =====

// ---- Caja (index.html)
let cart = [];
let selectedCustomer = null;

function initCaja() {
  requireSession();
  mountShell();
  $("#btnSelectCustomer").onclick = () => openModal(renderClientePicker());
  $("#btnVaciar").onclick = () => {
    cart = [];
    renderCart();
  };
  $("#btnCobrar").onclick = () => openModal(renderCobro());
  $("#searchProducts").oninput = renderPOS;
  renderPOS();
  renderCart();
}
function renderPOS() {
  const term = ($("#searchProducts").value || "").toLowerCase();
  const grid = $("#productGrid");
  grid.innerHTML = "";
  state.productos
    .filter(
      (p) =>
        p.nombre.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term)
    )
    .forEach((p) => {
      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <img src="https://picsum.photos/seed/${p.id}/600/400" alt="${p.nombre}">
        <div class="pad">
          <div class="title">${p.nombre}</div>
          <div class="muted">SKU: ${p.sku}</div>
          <div class="price">$ ${p.precio.toFixed(2)}</div>
          <div class="row"><span class="badge ${
            p.stock <= 0 ? "danger" : p.stock <= p.min ? "warning" : "success"
          }">
            ${
              p.stock <= 0
                ? "Sin stock"
                : p.stock <= p.min
                ? "Bajo stock"
                : "En stock"
            }
          </span></div>
          <div class="row" style="margin-top:8px"><button class="btn" ${
            p.stock <= 0 ? "disabled" : ""
          }>Agregar</button></div>
        </div>`;
      card.querySelector("button").onclick = () => addToCart(p.id);
      grid.appendChild(card);
    });
}
function addToCart(id) {
  const p = state.productos.find((x) => x.id === id);
  if (!p || p.stock <= 0) return;
  const it = cart.find((i) => i.productId === id);
  if (it) {
    if (it.qty < p.stock) it.qty++;
  } else {
    cart.push({ productId: id, qty: 1 });
  }
  renderCart();
}
function renderCart() {
  const tbody = $("#cartBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  let subtotal = 0;
  cart.forEach((item) => {
    const p = state.productos.find((x) => x.id === item.productId);
    const line = p.precio * item.qty;
    subtotal += line;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.nombre}</td>
      <td><input type="number" min="1" max="${p.stock}" value="${
      item.qty
    }"></td>
      <td>$ ${p.precio.toFixed(2)}</td>
      <td>$ ${line.toFixed(2)}</td>
      <td><button class="btn danger">Eliminar</button></td>`;
    tr.querySelector("input").oninput = (e) => {
      const v = Math.max(1, Math.min(parseInt(e.target.value || "1"), p.stock));
      item.qty = v;
      renderCart();
    };
    tr.querySelector(".danger").onclick = () => {
      cart = cart.filter((c) => c !== item);
      renderCart();
    };
    tbody.appendChild(tr);
  });
  const tax = subtotal * 0.16,
    total = subtotal + tax;
  $("#lblSubtotal").textContent = "$ " + subtotal.toFixed(2);
  $("#lblTax").textContent = "$ " + tax.toFixed(2);
  $("#lblTotal").textContent = "$ " + total.toFixed(2);
  $("#lblCliente").textContent =
    "Cliente: " +
    (selectedCustomer ? selectedCustomer.nombre : "Venta al público");
}
function renderClientePicker() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Seleccionar cliente</h3>
    <input id="pickSearch" class="input" placeholder="Buscar cliente…">
    <div id="pickList" style="max-height:300px;overflow:auto;margin-top:8px"></div>
    <div class="row end" style="margin-top:8px"><button class="btn" id="closeM">Cerrar</button></div>`;
  const list = wrap.querySelector("#pickList");
  function draw() {
    list.innerHTML = "";
    const term = wrap.querySelector("#pickSearch").value?.toLowerCase() || "";
    state.clientes
      .filter((c) => c.nombre.toLowerCase().includes(term))
      .forEach((c) => {
        const row = document.createElement("div");
        row.className = "row";
        row.style.justifyContent = "space-between";
        row.style.borderBottom = "1px solid var(--border)";
        row.style.padding = "8px 0";
        row.innerHTML = `<div><strong>${c.nombre}</strong><div class="muted">${c.email} · ${c.tel}</div></div><button class="btn">Elegir</button>`;
        row.querySelector("button").onclick = () => {
          selectedCustomer = c;
          closeModal();
          renderCart();
        };
        list.appendChild(row);
      });
  }
  wrap.querySelector("#pickSearch").oninput = draw;
  draw();
  wrap.querySelector("#closeM").onclick = closeModal;
  return wrap;
}
function renderCobro() {
  const subtotal =
    parseFloat($("#lblSubtotal").textContent.replace("$", "")) || 0;
  const iva = parseFloat($("#lblTax").textContent.replace("$", "")) || 0;
  const total = subtotal + iva;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Cobro</h3>
    <div>Total a pagar: <strong>$ ${total.toFixed(2)}</strong></div>
    <div class="grid cols-2" style="margin-top:8px">
      <label>Método de pago<br>
        <select id="metodo" class="input">
          <option value="EFECTIVO">Efectivo</option>
          <option value="TARJETA">Tarjeta</option>
          <option value="TRANSFERENCIA">Transferencia</option>
        </select>
      </label>
      <label>Monto recibido<br><input id="monto" class="input" type="number" min="0" value="${total.toFixed(
        2
      )}"></label>
    </div>
    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cancelar</button>
      <button class="btn primary" id="confirm">Completar venta</button>
    </div>`;
  wrap.querySelector("#closeM").onclick = closeModal;
  wrap.querySelector("#confirm").onclick = () => {
    const metodo = wrap.querySelector("#metodo").value;
    const monto = parseFloat(wrap.querySelector("#monto").value || "0");
    if (monto < total) {
      alert("El monto recibido es insuficiente.");
      return;
    }
    const folio = "V-" + String(state.folio).padStart(4, "0");
    const venta = {
      id: state.folio++,
      folio,
      fecha: new Date().toISOString().slice(0, 19).replace("T", " "),
      cliente: selectedCustomer?.nombre || "Venta al público",
      items: cart.map((it) => {
        const p = state.productos.find((x) => x.id === it.productId);
        return {
          sku: p.sku,
          nombre: p.nombre,
          qty: it.qty,
          precio: p.precio,
          total: p.precio * it.qty,
        };
      }),
      subtotal: subtotal,
      iva: iva,
      total: subtotal + iva,
      metodo,
    };
    state.ventas.unshift(venta);
    cart.forEach((it) => {
      const p = state.productos.find((x) => x.id === it.productId);
      if (p) p.stock = Math.max(0, p.stock - it.qty);
    });
    cart = [];
    selectedCustomer = null;
    saveState();
    closeModal();
    renderPOS();
    alert("Venta completada.");
  };
  return wrap;
}

// ---- Ventas (ventas.html)
function initVentas() {
  requireSession();
  mountShell();
  renderVentas();
}
function renderVentas() {
  const tbody = $("#ventasBody");
  tbody.innerHTML = "";
  state.ventas.forEach((v) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${v.folio}</td><td>${v.fecha}</td><td>${
      v.cliente
    }</td><td>${v.items.length}</td><td>$ ${v.total.toFixed(
      2
    )}</td><td><button class="btn">Ver</button></td>`;
    tr.querySelector("button").onclick = () => openModal(renderVentaDetalle(v));
    tbody.appendChild(tr);
  });
}
function renderVentaDetalle(v) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Detalle de venta ${v.folio}</h3>
    <div class="muted">${v.fecha} — ${v.cliente} — ${v.metodo}</div>
    <table class="table" style="margin-top:8px">
      <thead><tr><th>Producto</th><th>Qty</th><th>Precio</th><th>Total</th></tr></thead>
      <tbody>${v.items
        .map(
          (i) =>
            `<tr><td>${i.nombre}</td><td>${i.qty}</td><td>$ ${i.precio.toFixed(
              2
            )}</td><td>$ ${i.total.toFixed(2)}</td></tr>`
        )
        .join("")}</tbody>
    </table>
    <div class="row end"><div class="card" style="min-width:240px">
      <div>Subtotal: <strong>$ ${v.subtotal.toFixed(2)}</strong></div>
      <div>IVA: <strong>$ ${v.iva.toFixed(2)}</strong></div>
      <div>Total: <strong>$ ${v.total.toFixed(2)}</strong></div>
    </div></div>
    <div class="row end" style="margin-top:10px"><button class="btn" id="closeM">Cerrar</button></div>`;
  wrap.querySelector("#closeM").onclick = closeModal;
  return wrap;
}

// ---- Productos (productos.html)
function initProductos() {
  requireSession();
  mountShell();
  renderProductos();
  $("#btnAddProducto").onclick = () => openModal(renderProductoForm());
}
function renderProductos() {
  const tbody = $("#productosBody");
  tbody.innerHTML = "";
  state.productos.forEach((p) => {
    const estado =
      p.stock <= 0
        ? '<span class="badge danger">Sin stock</span>'
        : p.stock <= p.min
        ? '<span class="badge warning">Bajo stock</span>'
        : '<span class="badge success">En stock</span>';
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.sku}</td><td>${
      p.nombre
    }</td><td>$ ${p.precio.toFixed(2)}</td><td>${
      p.stock
    }</td><td>${estado}</td><td><button class="btn">Editar</button> <button class="btn danger">Eliminar</button></td>`;
    tr.querySelector(".btn").onclick = () => openModal(renderProductoForm(p));
    tr.querySelector(".danger").onclick = () => {
      if (confirm("¿Eliminar producto?")) {
        state.productos = state.productos.filter((x) => x.id !== p.id);
        saveState();
        renderProductos();
      }
    };
    tbody.appendChild(tr);
  });
}
function renderProductoForm(p) {
  const isEdit = !!p;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>${isEdit ? "Editar" : "Nuevo"} producto</h3>
    <div class="grid cols-2">
      <label>SKU<br><input id="fSku" class="input" value="${
        p?.sku || ""
      }"></label>
      <label>Nombre<br><input id="fNombre" class="input" value="${
        p?.nombre || ""
      }"></label>
      <label>Precio<br><input id="fPrecio" type="number" class="input" value="${
        p?.precio || 0
      }"></label>
      <label>Stock<br><input id="fStock" type="number" class="input" value="${
        p?.stock || 0
      }"></label>
      <label>Mínimo<br><input id="fMin" type="number" class="input" value="${
        p?.min || 0
      }"></label>
    </div>
    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cancelar</button>
      <button class="btn primary" id="saveM">Guardar</button>
    </div>`;
  $("#closeM", wrap).onclick = closeModal;
  $("#saveM", wrap).onclick = () => {
    const np = {
      id: p?.id || Math.max(0, ...state.productos.map((x) => x.id)) + 1,
      sku: $("#fSku", wrap).value.trim(),
      nombre: $("#fNombre", wrap).value.trim(),
      precio: parseFloat($("#fPrecio", wrap).value || "0"),
      stock: parseInt($("#fStock", wrap).value || "0"),
      min: parseInt($("#fMin", wrap).value || "0"),
    };
    if (!np.sku || !np.nombre) {
      alert("SKU y Nombre son obligatorios.");
      return;
    }
    if (isEdit) {
      Object.assign(p, np);
    } else {
      state.productos.push(np);
    }
    saveState();
    closeModal();
    renderProductos();
  };
  return wrap;
}

// ---- Inventario (stock.html)
function initStock() {
  requireSession();
  mountShell();
  renderInventario();
}
function renderInventario() {
  const tbody = $("#inventarioBody");
  tbody.innerHTML = "";
  state.productos.forEach((p) => {
    const estado =
      p.stock <= 0
        ? '<span class="badge danger">Sin stock</span>'
        : p.stock <= p.min
        ? '<span class="badge warning">Bajo stock</span>'
        : '<span class="badge success">En stock</span>';
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.sku}</td><td>${p.nombre}</td><td>${p.stock}</td><td>${p.min}</td><td>${estado}</td>`;
    tbody.appendChild(tr);
  });
}

// ---- Clientes (clientes.html)
function initClientes() {
  requireSession();
  mountShell();
  renderClientes();
  $("#btnAddCliente").onclick = () => openModal(renderClienteForm());
}
function renderClientes() {
  const tbody = $("#clientesBody");
  tbody.innerHTML = "";
  state.clientes.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${c.nombre}</td><td>${c.email}</td><td>${c.tel}</td><td><button class="btn">Editar</button> <button class="btn danger">Eliminar</button></td>`;
    tr.querySelector(".btn").onclick = () => openModal(renderClienteForm(c));
    tr.querySelector(".danger").onclick = () => {
      if (confirm("¿Eliminar cliente?")) {
        state.clientes = state.clientes.filter((x) => x.id !== c.id);
        saveState();
        renderClientes();
      }
    };
    tbody.appendChild(tr);
  });
}
function renderClienteForm(c) {
  const isEdit = !!c;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>${isEdit ? "Editar" : "Nuevo"} cliente</h3>
    <div class="grid cols-2">
      <label>Nombre<br><input id="cNombre" class="input" value="${
        c?.nombre || ""
      }"></label>
      <label>Email<br><input id="cEmail" class="input" value="${
        c?.email || ""
      }"></label>
      <label>Teléfono<br><input id="cTel" class="input" value="${
        c?.tel || ""
      }"></label>
    </div>
    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cancelar</button>
      <button class="btn primary" id="saveM">Guardar</button>
    </div>`;
  $("#closeM", wrap).onclick = closeModal;
  $("#saveM", wrap).onclick = () => {
    const nc = {
      id: c?.id || Math.max(0, ...state.clientes.map((x) => x.id)) + 1,
      nombre: $("#cNombre", wrap).value.trim(),
      email: $("#cEmail", wrap).value.trim(),
      tel: $("#cTel", wrap).value.trim(),
    };
    if (!nc.nombre) {
      alert("El nombre es obligatorio.");
      return;
    }
    if (isEdit) {
      Object.assign(c, nc);
    } else {
      state.clientes.push(nc);
    }
    saveState();
    closeModal();
    renderClientes();
  };
  return wrap;
}

// ---- Usuarios (usuarios.html)
function initUsuarios() {
  requireSession();
  mountShell();
  renderUsuarios();
  $("#btnAddUsuario").onclick = () => openModal(renderUsuarioForm());
}
function renderUsuarios() {
  const tbody = $("#usuariosBody");
  tbody.innerHTML = "";
  state.users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${u.nombre}</td><td>${u.email}</td><td>${
      u.rol
    }</td><td>${
      u.activo
        ? '<span class="badge success">Activo</span>'
        : '<span class="badge danger">Inactivo</span>'
    }</td><td><button class="btn">Editar</button> <button class="btn danger">Eliminar</button></td>`;
    tr.querySelector(".btn").onclick = () => openModal(renderUsuarioForm(u));
    tr.querySelector(".danger").onclick = () => {
      if (confirm("¿Eliminar usuario?")) {
        state.users = state.users.filter((x) => x.id !== u.id);
        saveState();
        renderUsuarios();
      }
    };
    tbody.appendChild(tr);
  });
}
function renderUsuarioForm(u) {
  const isEdit = !!u;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>${isEdit ? "Editar" : "Nuevo"} usuario</h3>
    <div class="grid cols-2">
      <label>Nombre<br><input id="uNombre" class="input" value="${
        u?.nombre || ""
      }"></label>
      <label>Email<br><input id="uEmail" class="input" value="${
        u?.email || ""
      }"></label>
      <label>Rol<br><select id="uRol" class="input">
        <option ${u?.rol === "ADMIN" ? "selected" : ""}>ADMIN</option>
        <option ${u?.rol === "MANAGER" ? "selected" : ""}>MANAGER</option>
        <option ${u?.rol === "CASHIER" ? "selected" : ""}>CASHIER</option>
      </select></label>
      <label>Activo<br><select id="uActivo" class="input">
        <option value="true" ${
          u?.activo !== false ? "selected" : ""
        }>Sí</option>
        <option value="false" ${
          u?.activo === false ? "selected" : ""
        }>No</option>
      </select></label>
    </div>
    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cancelar</button>
      <button class="btn primary" id="saveM">Guardar</button>
    </div>`;
  $("#closeM", wrap).onclick = closeModal;
  $("#saveM", wrap).onclick = () => {
    const nu = {
      id: u?.id || Math.max(0, ...state.users.map((x) => x.id)) + 1,
      nombre: $("#uNombre", wrap).value.trim(),
      email: $("#uEmail", wrap).value.trim(),
      rol: $("#uRol", wrap).value,
      activo: $("#uActivo", wrap).value === "true",
    };
    if (!nu.nombre || !nu.email) {
      alert("Nombre y Email son obligatorios.");
      return;
    }
    if (isEdit) {
      Object.assign(u, nu);
    } else {
      state.users.push(nu);
    }
    saveState();
    closeModal();
    renderUsuarios();
  };
  return wrap;
}

// ===== Modal helpers (compartido) =====
function openModal(content) {
  const m = $("#modal"),
    c = $("#modalContent");
  c.innerHTML = "";
  c.appendChild(content);
  m.classList.remove("hidden");
  m.addEventListener("click", backdropClose);
}
function backdropClose(e) {
  if (e.target.id === "modal") {
    closeModal();
  }
}
function closeModal() {
  const m = $("#modal"),
    c = $("#modalContent");
  m.classList.add("hidden");
  c.innerHTML = "";
  m.removeEventListener("click", backdropClose);
}

// ===== Punto de entrada por página =====
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page || "";
  if (page === "login") {
    // nada
  } else {
    mountShell();
  }
  if (page === "caja") initCaja();
  if (page === "ventas") initVentas();
  if (page === "productos") initProductos();
  if (page === "stock") initStock();
  if (page === "clientes") initClientes();
  if (page === "usuarios") initUsuarios();
});
