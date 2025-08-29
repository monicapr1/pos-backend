/***********************
 * Config & Helpers
 ************************/
const API_BASE = "http://localhost:4000";

// Token
function getToken() {
  return localStorage.getItem("pos_token") || "";
}
function setToken(t) {
  localStorage.setItem("pos_token", t);
}
function clearToken() {
  localStorage.removeItem("pos_token");
}

// Fetch helper
async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = "Bearer " + getToken();

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok) {
    const msg = data && data.error ? data.error : `Error API ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// UI helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function money(n) {
  return (
    "$ " +
    (Number(n) || 0).toLocaleString("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// Modal (compartido)
const modal = $("#modal");
const modalContent = $("#modalContent");
function openModal(node) {
  if (!modal || !modalContent) return;
  modalContent.innerHTML = "";
  modalContent.appendChild(node);
  modal.classList.remove("hidden");
  modal.addEventListener("click", backdropClose);
}
function backdropClose(e) {
  if (e.target === modal) closeModal();
}
function closeModal() {
  if (!modal || !modalContent) return;
  modal.classList.add("hidden");
  modalContent.innerHTML = "";
  modal.removeEventListener("click", backdropClose);
}

/***********************
 * Estado del Front
 ************************/
const state = {
  userName: localStorage.getItem("pos_user_name") || "",
  productos: [],
  clientes: [],
  usuarios: [],
  ventas: [], // listado (sin items)
};

// Carrito (sólo en Caja)
let cart = [];
let selectedCustomer = null;

/***********************
 * Login Page
 ************************/
(function initLogin() {
  const form = $("#formLogin");
  if (!form) return; // no estamos en login.html

  const errorEl = $("#loginError");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value.trim();
    try {
      const { token, user } = await api("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      setToken(token);
      localStorage.setItem("pos_user_name", user.name || "Usuario");
      location.href = "index.html";
    } catch (err) {
      if (errorEl) errorEl.classList.remove("hidden");
    }
  });
})();

/***********************
 * Barra superior / Logout
 ************************/
(function initTopbar() {
  const topUser = $("#userLabel");
  if (topUser) topUser.textContent = state.userName || "";

  const btnLogout = $("#btnLogout");
  if (btnLogout) {
    btnLogout.onclick = () => {
      clearToken();
      localStorage.removeItem("pos_user_name");
      location.href = "login.html";
    };
  }
})();

/***********************
 * Carga de datos comunes
 ************************/
async function loadCommon() {
  // Si no hay token, redirige salvo que sea login
  if (!getToken() && !$("#formLogin")) {
    location.href = "login.html";
    return;
  }

  // Usuarios sólo para la página de usuarios
  const needProducts = !!(
    $("#productGrid") ||
    $("#productosBody") ||
    $("#inventarioBody")
  );
  const needCustomers = !!($("#clientesBody") || $("#btnSelectCustomer"));
  const needSales = !!$("#ventasBody");
  const needUsers = !!$("#usuariosBody");

  const tasks = [];
  if (needProducts)
    tasks.push(api("/api/products").then((d) => (state.productos = d)));
  if (needCustomers)
    tasks.push(api("/api/customers").then((d) => (state.clientes = d)));
  if (needSales)
    tasks.push(
      api("/api/sales").then((d) => {
        state.ventas = d.map((s) => ({
          id: s.id,
          folio: s.folio,
          fecha: s.date,
          cliente: s.customer,
          metodo: s.method,
          subtotal: s.subtotal,
          iva: s.tax,
          total: s.total,
          items: null,
        }));
      })
    );
  if (needUsers)
    tasks.push(api("/api/users").then((d) => (state.usuarios = d)));

  if (tasks.length) await Promise.all(tasks);
}

/***********************
 * ---- CAJA (index.html)
 ************************/
(function initCaja() {
  const cartBody = $("#cartBody");
  if (!cartBody) return; // no estamos en index.html (Caja)

  // Botones
  const btnSelectCustomer = $("#btnSelectCustomer");
  if (btnSelectCustomer)
    btnSelectCustomer.onclick = () => openModal(renderClientePicker());

  const btnVaciar = $("#btnVaciar");
  if (btnVaciar)
    btnVaciar.onclick = () => {
      cart = [];
      renderCart();
    };

  const btnCobrar = $("#btnCobrar");
  if (btnCobrar)
    btnCobrar.onclick = () => {
      if (cart.length === 0) {
        alert("Agrega al menos un producto al carrito para cobrar.");
        return;
      }
      openModal(renderCobro());
    };

  // Buscar productos
  const search = $("#searchProducts");
  if (search) search.oninput = renderPOS;

  // Cargar datos y renderizar
  loadCommon().then(() => {
    renderPOS();
    renderCart();
  });
})();

// Render tarjetas de producto y agregar al carrito
function renderPOS() {
  const grid = $("#productGrid");
  if (!grid) return;
  grid.innerHTML = "";
  const term = ($("#searchProducts")?.value || "").toLowerCase();

  state.productos
    .filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term)
    )
    .forEach((p) => {
      const imgSrc =
        p.image_url && p.image_url.trim() !== ""
          ? p.image_url.startsWith("http")
            ? p.image_url
            : API_BASE + p.image_url.replace(/^\/+/, "/")
          : `https://placehold.co/600x400?text=${encodeURIComponent(p.name)}`;

      const card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML = `
        <img src="${imgSrc}" alt="${p.name}">
        <div class="pad">
          <div class="title">${p.name}</div>
          <div class="muted">SKU: ${p.sku}</div>
          <div class="price">${money(p.price)}</div>
          <div class="row">
            <span class="badge ${
              p.stock <= 0 ? "danger" : p.stock <= p.min ? "warning" : "success"
            }">
              ${
                p.stock <= 0
                  ? "Sin stock"
                  : p.stock <= p.min
                  ? "Bajo stock"
                  : "En stock"
              }
            </span>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="btn" ${
              p.stock <= 0 ? "disabled" : ""
            }>Agregar</button>
          </div>
        </div>
      `;
      card.querySelector("button").onclick = () => addToCart(p.id);
      grid.appendChild(card);
    });
}

function addToCart(productId) {
  const p = state.productos.find((x) => x.id === productId);
  if (!p || p.stock <= 0) return;
  const it = cart.find((i) => i.productId === productId);
  if (it) {
    if (it.qty < p.stock) it.qty++;
  } else {
    cart.push({ productId, qty: 1 });
  }
  renderCart();
}

// Carrito
function renderCart() {
  const tbody = $("#cartBody");
  if (!tbody) return;

  tbody.innerHTML = "";
  let subtotal = 0;

  cart.forEach((item) => {
    const p = state.productos.find((x) => x.id === item.productId);
    const line = p.price * item.qty;
    subtotal += line;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td><input type="number" min="1" max="${p.stock}" value="${
      item.qty
    }"></td>
      <td>${money(p.price)}</td>
      <td>${money(line)}</td>
      <td><button class="btn danger">Eliminar</button></td>
    `;

    const qtyInput = tr.querySelector("input");

    // edición fluida sin perder caret
    qtyInput.addEventListener("input", (e) => {
      let raw = (e.target.value || "").replace(/[^\d]/g, "");
      if (raw === "") return;
      let n = parseInt(raw, 10);
      if (n > p.stock) n = p.stock;
      if (n < 1) n = 1;
      item.qty = n;
      tr.children[3].textContent = money(p.price * item.qty);

      // actualizar totales sin re-render completo
      let sub = 0;
      cart.forEach((it) => {
        const pr = state.productos.find((x) => x.id === it.productId);
        sub += pr.price * it.qty;
      });
      const iva = sub * 0.16;
      $("#lblSubtotal").textContent = money(sub);
      $("#lblTax").textContent = money(iva);
      $("#lblTotal").textContent = money(sub + iva);
    });

    function commitQty() {
      let n = parseInt(qtyInput.value || "1", 10);
      if (isNaN(n) || n < 1) n = 1;
      if (n > p.stock) n = p.stock;
      item.qty = n;
      qtyInput.value = n;
      renderCart();
    }
    qtyInput.addEventListener("change", commitQty);
    qtyInput.addEventListener("blur", commitQty);
    qtyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        qtyInput.blur();
      }
    });

    tr.querySelector(".danger").onclick = () => {
      cart = cart.filter((c) => c !== item);
      renderCart();
    };

    tbody.appendChild(tr);
  });

  const tax = subtotal * 0.16;
  const total = subtotal + tax;

  $("#lblSubtotal").textContent = money(subtotal);
  $("#lblTax").textContent = money(tax);
  $("#lblTotal").textContent = money(total);
  $("#lblCliente").textContent =
    "Cliente: " +
    (selectedCustomer ? selectedCustomer.name : "Venta al público");

  const btnCobrar = $("#btnCobrar");
  if (btnCobrar) btnCobrar.disabled = cart.length === 0;
}

// Selector de cliente (incluye venta al público)
function renderClientePicker() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Seleccionar cliente</h3>
    <input id="pickSearch" class="input" placeholder="Buscar cliente…">
    <div id="pickList" style="max-height:300px;overflow:auto;margin-top:8px"></div>
    <div class="row end" style="margin-top:8px">
      <button class="btn" id="closeM">Cerrar</button>
    </div>
  `;

  const list = $("#pickList", wrap);

  // Fijo: venta al público
  const publicoRow = document.createElement("div");
  publicoRow.className = "row";
  publicoRow.style.justifyContent = "space-between";
  publicoRow.style.borderBottom = "1px solid var(--border)";
  publicoRow.style.padding = "8px 0";
  publicoRow.innerHTML = `
    <div><strong>Venta al público (general)</strong><div class="muted">Sin datos de facturación</div></div>
    <button class="btn">Usar</button>
  `;
  publicoRow.querySelector("button").onclick = () => {
    selectedCustomer = null;
    closeModal();
    renderCart();
  };
  list.appendChild(publicoRow);

  function draw() {
    list.querySelectorAll(".cliente-row").forEach((n) => n.remove());
    const term = ($("#pickSearch", wrap).value || "").toLowerCase();
    state.clientes
      .filter((c) => (c.name || "").toLowerCase().includes(term))
      .forEach((c) => {
        const row = document.createElement("div");
        row.className = "row cliente-row";
        row.style.justifyContent = "space-between";
        row.style.borderBottom = "1px solid var(--border)";
        row.style.padding = "8px 0";
        row.innerHTML = `
          <div><strong>${c.name}</strong><div class="muted">${c.email || ""} ${
          c.phone ? "· " + c.phone : ""
        }</div></div>
          <button class="btn">Elegir</button>
        `;
        row.querySelector("button").onclick = () => {
          selectedCustomer = c;
          closeModal();
          renderCart();
        };
        list.appendChild(row);
      });
  }

  $("#pickSearch", wrap).oninput = draw;
  draw();
  $("#closeM", wrap).onclick = closeModal;
  return wrap;
}

// Cobro (POST /api/sales) con centavos para precisión
function renderCobro() {
  if (cart.length === 0) {
    alert("El carrito está vacío. Agrega productos antes de cobrar.");
    const d = document.createElement("div");
    return d;
  }

  let subtotalC = 0;
  cart.forEach((it) => {
    const p = state.productos.find((x) => x.id === it.productId);
    if (p) subtotalC += Math.round(p.price * 100) * it.qty;
  });
  const ivaC = Math.round(subtotalC * 0.16);
  const totalC = subtotalC + ivaC;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Cobro</h3>
    <div>Total a pagar: <strong>${money(totalC / 100)}</strong></div>
    <div class="grid cols-2" style="margin-top:8px">
      <label>Método de pago<br>
        <select id="metodo" class="input">
          <option value="EFECTIVO">Efectivo</option>
          <option value="TARJETA">Tarjeta</option>
          <option value="TRANSFERENCIA">Transferencia</option>
        </select>
      </label>
      <label>Monto recibido<br>
        <input id="monto" class="input" type="number" min="0" step="0.01" value="${(
          totalC / 100
        ).toFixed(2)}">
      </label>
    </div>
    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cancelar</button>
      <button class="btn primary" id="confirm">Completar venta</button>
    </div>
  `;
  $("#closeM", wrap).onclick = closeModal;

  $("#confirm", wrap).onclick = async () => {
    const metodo = $("#metodo", wrap).value;
    const monto = parseFloat($("#monto", wrap).value || "0");
    const montoC = Math.round(monto * 100);
    if (isNaN(montoC) || montoC < totalC) {
      alert("El monto recibido es insuficiente.");
      return;
    }

    const payload = {
      customer_name: selectedCustomer?.name || "Venta al público",
      payment_method: metodo,
      items: cart.map((it) => ({ product_id: it.productId, qty: it.qty })),
    };

    try {
      const sale = await api("/api/sales", { method: "POST", body: payload });
      // Refrescar productos y ventas
      const [products, sales] = await Promise.all([
        api("/api/products"),
        api("/api/sales"),
      ]);
      state.productos = products;
      state.ventas = sales.map((s) => ({
        id: s.id,
        folio: s.folio,
        fecha: s.date,
        cliente: s.customer,
        metodo: s.method,
        subtotal: s.subtotal,
        iva: s.tax,
        total: s.total,
        items: null,
      }));

      cart = [];
      selectedCustomer = null;
      closeModal();
      renderCart();
      renderPOS();
      if ($("#ventasBody")) renderVentas();

      const cambioC = montoC - Math.round((sale.total || totalC / 100) * 100);
      alert("Venta completada. Cambio: " + money(cambioC / 100));
    } catch (e) {
      alert("No se pudo completar la venta: " + e.message);
    }
  };

  return wrap;
}

/***********************
 * ---- VENTAS (ventas.html)
 ************************/
(function initVentas() {
  const tbody = $("#ventasBody");
  if (!tbody) return;

  loadCommon().then(() => renderVentas());
})();

function renderVentas() {
  const tbody = $("#ventasBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.ventas.forEach((v) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.folio}</td>
      <td>${v.fecha}</td>
      <td>${v.cliente}</td>
      <td>${v.items?.length ?? ""}</td>
      <td>${money(v.total)}</td>
      <td>
        <button class="btn ver">Ver</button>
        <button class="btn edit">Editar</button>
        <button class="btn danger del">Eliminar</button>
      </td>
    `;
    tr.querySelector(".ver").onclick = async () => {
      // cargar detalle si no está
      if (!v.items) {
        const full = await api(`/api/sales/${v.id}`);
        v.items = full.items.map((i) => ({
          nombre: i.name,
          qty: i.qty,
          precio: i.price,
          total: i.total,
          sku: i.sku,
        }));
        v.subtotal = full.subtotal;
        v.iva = full.tax;
        v.total = full.total;
      }
      openModal(renderVentaDetalle(v));
    };
    tr.querySelector(".edit").onclick = () => openModal(renderVentaForm(v));
    tr.querySelector(".del").onclick = () => deleteVenta(v);
    tbody.appendChild(tr);
  });
}

// Detalle de venta
function renderVentaDetalle(v) {
  const wrap = document.createElement("div");
  const itemsHtml =
    v.items && v.items.length
      ? v.items
          .map(
            (i) => `
        <tr>
          <td>${i.nombre}</td>
          <td style="text-align:center">${i.qty}</td>
          <td>${money(i.precio)}</td>
          <td>${money(i.total)}</td>
        </tr>
      `
          )
          .join("")
      : `<tr><td colspan="4" class="muted">Sin productos</td></tr>`;

  wrap.innerHTML = `
    <h3>Detalle de venta ${v.folio}</h3>
    <div class="muted" style="margin-bottom:8px">
      ${v.fecha} — ${v.cliente} — ${v.metodo || "—"}
    </div>

    <table class="table" style="margin-top:8px">
      <thead>
        <tr>
          <th>Producto</th>
          <th style="width:90px;text-align:center">Qty</th>
          <th>Precio</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="row end" style="margin-top:8px">
      <div class="card" style="min-width:240px">
        <div>Subtotal: <strong>${money(v.subtotal)}</strong></div>
        <div>IVA: <strong>${money(v.iva)}</strong></div>
        <div>Total: <strong>${money(v.total)}</strong></div>
      </div>
    </div>

    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cerrar</button>
    </div>
  `;
  $("#closeM", wrap).onclick = closeModal;
  return wrap;
}

// Eliminar venta (DELETE /api/sales/:id)
async function deleteVenta(v) {
  if (!confirm(`¿Eliminar la venta ${v.folio}?`)) return;
  try {
    await api(`/api/sales/${v.id}`, { method: "DELETE" });
    const [products, sales] = await Promise.all([
      api("/api/products"),
      api("/api/sales"),
    ]);
    state.productos = products;
    state.ventas = sales.map((s) => ({
      id: s.id,
      folio: s.folio,
      fecha: s.date,
      cliente: s.customer,
      metodo: s.method,
      subtotal: s.subtotal,
      iva: s.tax,
      total: s.total,
      items: null,
    }));
    renderVentas();
    if ($("#inventarioBody")) renderInventario();
    if ($("#productGrid")) renderPOS();
  } catch (e) {
    alert("No se pudo eliminar: " + e.message);
  }
}

// Editar venta (PUT /api/sales/:id)
function renderVentaForm(v) {
  const prodBySku = (sku) => state.productos.find((p) => p.sku === sku);

  // si no hay items cargados aún, pedimos detalle
  if (!v.items) {
    api(`/api/sales/${v.id}`).then((full) => {
      v.items = full.items.map((i) => ({
        sku: i.sku,
        nombre: i.name,
        precio: i.price,
        qty: i.qty,
      }));
      v.subtotal = full.subtotal;
      v.iva = full.tax;
      v.total = full.total;
      closeModal();
      openModal(renderVentaForm(v)); // reabrir con datos
    });
    const placeholder = document.createElement("div");
    placeholder.innerHTML = `<p class="muted">Cargando venta...</p>`;
    return placeholder;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Editar venta ${v.folio}</h3>
    <div class="grid cols-2" style="margin:8px 0">
      <label>Cliente<br>
        <input id="edCliente" class="input" value="${v.cliente}">
      </label>
      <label>Método de pago<br>
        <select id="edMetodo" class="input">
          <option value="EFECTIVO" ${
            v.metodo === "EFECTIVO" ? "selected" : ""
          }>Efectivo</option>
          <option value="TARJETA" ${
            v.metodo === "TARJETA" ? "selected" : ""
          }>Tarjeta</option>
          <option value="TRANSFERENCIA" ${
            v.metodo === "TRANSFERENCIA" ? "selected" : ""
          }>Transferencia</option>
        </select>
      </label>
    </div>

    <div class="card" style="margin-top:6px">
      <table class="table">
        <thead>
          <tr>
            <th>Producto</th>
            <th style="width:120px">Cantidad</th>
            <th>Precio</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody id="editItemsBody">
          ${v.items
            .map(
              (it) => `
            <tr data-sku="${it.sku || ""}">
              <td>${it.nombre}<div class="muted">SKU: ${it.sku || ""}</div></td>
              <td><input class="input qty" type="number" min="0" value="${
                it.qty
              }"></td>
              <td>${money(it.precio)}</td>
              <td class="cell-total">${money(it.precio * it.qty)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="row end" style="margin-top:8px">
      <div class="card" style="min-width:240px">
        <div>Subtotal: <strong id="edSub">${money(v.subtotal)}</strong></div>
        <div>IVA: <strong id="edIva">${money(v.iva)}</strong></div>
        <div>Total: <strong id="edTot">${money(v.total)}</strong></div>
      </div>
    </div>

    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cancelar</button>
      <button class="btn primary" id="saveV">Guardar cambios</button>
    </div>
  `;

  const qtyInputs = $$(".qty", wrap);
  qtyInputs.forEach((inp, idx) => {
    inp.addEventListener("input", () => {
      let n = parseInt(inp.value || "0", 10);
      if (isNaN(n) || n < 0) n = 0;
      inp.value = n;
      v.items[idx].qty = n;

      // recalc
      const sub = v.items.reduce((s, it) => s + it.precio * it.qty, 0);
      const iva = sub * 0.16;
      const tot = sub + iva;

      // actualizar celdas
      const row = inp.closest("tr");
      $(".cell-total", row).textContent = money(v.items[idx].precio * n);
      $("#edSub", wrap).textContent = money(sub);
      $("#edIva", wrap).textContent = money(iva);
      $("#edTot", wrap).textContent = money(tot);
    });
  });

  $("#closeM", wrap).onclick = closeModal;

  $("#saveV", wrap).onclick = async () => {
    const payload = {
      customer_name:
        ($("#edCliente", wrap).value || "Venta al público").trim() ||
        "Venta al público",
      payment_method: $("#edMetodo", wrap).value,
      items: v.items
        .map((it) => {
          const p =
            prodBySku(it.sku) ||
            state.productos.find((pp) => pp.name === it.nombre);
          return { product_id: p ? p.id : null, qty: it.qty };
        })
        .filter((x) => x.product_id),
    };
    if (!payload.items.length) {
      alert("La venta no puede quedar vacía.");
      return;
    }

    try {
      await api(`/api/sales/${v.id}`, { method: "PUT", body: payload });
      const [products, sales] = await Promise.all([
        api("/api/products"),
        api("/api/sales"),
      ]);
      state.productos = products;
      state.ventas = sales.map((s) => ({
        id: s.id,
        folio: s.folio,
        fecha: s.date,
        cliente: s.customer,
        metodo: s.method,
        subtotal: s.subtotal,
        iva: s.tax,
        total: s.total,
        items: null,
      }));
      closeModal();
      renderVentas();
      if ($("#inventarioBody")) renderInventario();
      if ($("#productGrid")) renderPOS();
      alert("Venta actualizada.");
    } catch (e) {
      alert("No se pudo actualizar la venta: " + e.message);
    }
  };

  return wrap;
}

/***********************
 * ---- PRODUCTOS (productos.html)
 ************************/
(function initProductos() {
  const tbody = $("#productosBody");
  if (!tbody) return;

  loadCommon().then(() => renderProductos());

  const btnAdd = $("#btnAddProducto");
  if (btnAdd) btnAdd.onclick = () => openModal(renderProductoForm());
})();

function renderProductos() {
  const tbody = $("#productosBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.productos.forEach((p) => {
    const estado =
      p.stock <= 0
        ? '<span class="badge danger">Sin stock</span>'
        : p.stock <= p.min
        ? '<span class="badge warning">Bajo stock</span>'
        : '<span class="badge success">En stock</span>';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.sku}</td>
      <td>${p.name}</td>
      <td>${money(p.price)}</td>
      <td>${p.stock}</td>
      <td>${estado}</td>
      <td>
        <button class="btn edit">Editar</button>
        <button class="btn danger del">Eliminar</button>
      </td>
    `;
    tr.querySelector(".edit").onclick = () => openModal(renderProductoForm(p));
    tr.querySelector(".del").onclick = async () => {
      if (!confirm("¿Eliminar producto?")) return;
      try {
        await api(`/api/products/${p.id}`, { method: "DELETE" });
        state.productos = await api("/api/products");
        renderProductos();
        if ($("#inventarioBody")) renderInventario();
        if ($("#productGrid")) renderPOS();
      } catch (e) {
        alert(e.message);
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
      p?.name || ""
    }"></label>
    <label>Precio<br><input id="fPrecio" type="number" class="input" value="${
      p?.price ?? 0
    }"></label>
    <label>Stock<br><input id="fStock" type="number" class="input" value="${
      p?.stock ?? 0
    }"></label>
    <label>Mínimo<br><input id="fMin" type="number" class="input" value="${
      p?.min ?? 0
    }"></label>
    <label>Imagen (URL)<br>
      <input id="fImgUrl" class="input" placeholder="https://... o /uploads/sku.jpg" value="${
        p?.image_url || ""
      }">
    </label>
  </div>
  <div style="margin:8px 0">
    <img id="imgPreview" src="${
      p?.image_url
        ? p.image_url.startsWith("http")
          ? p.image_url
          : API_BASE + p.image_url
        : ""
    }" alt="" style="max-width:220px; ${p?.image_url ? "" : "display:none"}">
  </div>
  <div class="row end" style="margin-top:10px">
    <button class="btn" id="closeM">Cancelar</button>
    <button class="btn primary" id="saveM">Guardar</button>
  </div>
`;
  $("#closeM", wrap).onclick = closeModal;

  $("#saveM", wrap).onclick = async () => {
    const body = {
      sku: $("#fSku", wrap).value.trim(),
      name: $("#fNombre", wrap).value.trim(),
      price: parseFloat($("#fPrecio", wrap).value || "0"),
      stock: parseInt($("#fStock", wrap).value || "0", 10),
      min: parseInt($("#fMin", wrap).value || "0", 10),
      image_url: $("#fImgUrl", wrap).value.trim(), // <--- NUEVO
    };

    $("#fImgUrl", wrap).addEventListener("input", (e) => {
      const url = (e.target.value || "").trim();
      const prev = $("#imgPreview", wrap);
      if (!url) {
        prev.style.display = "none";
        return;
      }
      prev.src = url.startsWith("http")
        ? url
        : API_BASE + url.replace(/^\/+/, "/");
      prev.style.display = "block";
    });

    if (!body.sku || !body.name) {
      alert("SKU y Nombre son obligatorios.");
      return;
    }

    try {
      if (isEdit) await api(`/api/products/${p.id}`, { method: "PUT", body });
      else await api(`/api/products`, { method: "POST", body });
      state.productos = await api("/api/products");
      closeModal();
      renderProductos();
      if ($("#inventarioBody")) renderInventario();
      if ($("#productGrid")) renderPOS();
    } catch (e) {
      alert(e.message);
    }
  };

  return wrap;
}

/***********************
 * ---- INVENTARIO (stock.html)
 ************************/
(function initInventario() {
  const tbody = $("#inventarioBody");
  if (!tbody) return;
  loadCommon().then(() => renderInventario());
})();

// Modal: Ajustar stock (IN/OUT/SET)
function renderAjusteStockModal(p) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Ajustar stock — ${p.name} (SKU: ${p.sku})</h3>
    <div class="grid cols-2" style="margin-top:8px">
      <label>Tipo de movimiento<br>
        <select id="stkTipo" class="input">
          <option value="IN">Entrada (IN)</option>
          <option value="OUT">Salida (OUT)</option>
          <option value="SET">Fijar stock (SET)</option>
        </select>
      </label>
      <label id="lblQty">Cantidad<br>
        <input id="stkQty" class="input" type="number" min="0" step="1" placeholder="0">
      </label>
      <label id="lblSet" class="hidden">Nuevo stock<br>
        <input id="stkSet" class="input" type="number" min="0" step="1" placeholder="${p.stock}">
      </label>
      <label>Nota<br>
        <input id="stkNote" class="input" placeholder="Opcional">
      </label>
    </div>
    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cancelar</button>
      <button class="btn primary" id="saveM">Aplicar</button>
    </div>
  `;
  const tipo = $("#stkTipo", wrap);
  const lblQty = $("#lblQty", wrap);
  const lblSet = $("#lblSet", wrap);

  tipo.onchange = () => {
    const isSet = tipo.value === "SET";
    lblSet.classList.toggle("hidden", !isSet);
    lblQty.classList.toggle("hidden", isSet);
  };

  $("#closeM", wrap).onclick = closeModal;
  $("#saveM", wrap).onclick = async () => {
    try {
      const note = $("#stkNote", wrap).value.trim();
      if (tipo.value === "SET") {
        const stock = parseInt($("#stkSet", wrap).value || "0", 10);
        if (isNaN(stock) || stock < 0) {
          alert("Stock inválido");
          return;
        }
        await api("/api/stock/set", {
          method: "POST",
          body: { product_id: p.id, stock, note },
        });
      } else {
        const qty = parseInt($("#stkQty", wrap).value || "0", 10);
        if (isNaN(qty) || qty <= 0) {
          alert("Cantidad inválida");
          return;
        }
        await api("/api/stock/adjust", {
          method: "POST",
          body: { product_id: p.id, type: tipo.value, qty, note },
        });
      }

      // refrescar productos y vistas
      state.productos = await api("/api/products");
      closeModal();
      renderInventario();
      if ($("#productosBody")) renderProductos();
      if ($("#productGrid")) renderPOS();
      alert("Ajuste aplicado.");
    } catch (e) {
      alert("No se pudo ajustar: " + e.message);
    }
  };

  return wrap;
}

// Modal: Ver movimientos de stock de un producto
function renderMovimientosModal(productId) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Movimientos de stock</h3>
    <div class="card" style="margin-top:8px">
      <table class="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Cantidad</th>
            <th>Nota</th>
            <th>Producto</th>
          </tr>
        </thead>
        <tbody id="movBody">
          <tr><td colspan="5" class="muted">Cargando…</td></tr>
        </tbody>
      </table>
    </div>
    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cerrar</button>
    </div>
  `;
  $("#closeM", wrap).onclick = closeModal;

  // cargar desde API
  (async () => {
    try {
      const url = productId
        ? `/api/stock/movements?product_id=${productId}`
        : "/api/stock/movements";
      const rows = await api(url);
      const body = $("#movBody", wrap);
      body.innerHTML = rows.length
        ? rows
            .map(
              (r) => `
        <tr>
          <td>${r.created_at}</td>
          <td>${r.type}</td>
          <td>${r.qty}</td>
          <td>${r.note || ""}</td>
          <td>${r.sku} — ${r.name}</td>
        </tr>
      `
            )
            .join("")
        : `<tr><td colspan="5" class="muted">Sin movimientos</td></tr>`;
    } catch (e) {
      $(
        "#movBody",
        wrap
      ).innerHTML = `<tr><td colspan="5" class="muted">Error: ${e.message}</td></tr>`;
    }
  })();

  return wrap;
}

// Tabla de inventario con acciones
function renderInventario() {
  const tbody = $("#inventarioBody");
  if (!tbody) return;

  tbody.innerHTML = "";

  state.productos.forEach((p) => {
    const estado =
      p.stock <= 0
        ? '<span class="badge danger">Sin stock</span>'
        : p.stock <= p.min
        ? '<span class="badge warning">Bajo stock</span>'
        : '<span class="badge success">En stock</span>';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.sku}</td>
      <td>${p.name}</td>
      <td>${p.stock}</td>
      <td>${p.min}</td>
      <td>${estado}</td>
      <td>
        <div class="row">
          <button class="btn" data-act="ajustar">Ajustar</button>
          <button class="btn" data-act="mov">Movimientos</button>
        </div>
      </td>
    `;

    tr.querySelector('[data-act="ajustar"]').onclick = () =>
      openModal(renderAjusteStockModal(p));
    tr.querySelector('[data-act="mov"]').onclick = () =>
      openModal(renderMovimientosModal(p.id));

    tbody.appendChild(tr);
  });
}

/***********************
 * ---- CLIENTES (clientes.html)
 ************************/
(function initClientes() {
  const tbody = $("#clientesBody");
  if (!tbody) return;

  loadCommon().then(() => renderClientes());

  const btnAdd = $("#btnAddCliente");
  if (btnAdd) btnAdd.onclick = () => openModal(renderClienteForm());
})();

function renderClientes() {
  const tbody = $("#clientesBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  state.clientes.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.email || ""}</td>
      <td>${c.phone || ""}</td>
      <td>
        <button class="btn edit">Editar</button>
        <button class="btn danger del">Eliminar</button>
      </td>
    `;
    tr.querySelector(".edit").onclick = () => openModal(renderClienteForm(c));
    tr.querySelector(".del").onclick = async () => {
      if (!confirm("¿Eliminar cliente?")) return;
      try {
        await api(`/api/customers/${c.id}`, { method: "DELETE" });
        state.clientes = await api("/api/customers");
        renderClientes();
      } catch (e) {
        alert(e.message);
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
        c?.name || ""
      }"></label>
      <label>Email<br><input id="cEmail" class="input" value="${
        c?.email || ""
      }"></label>
      <label>Teléfono<br><input id="cTel" class="input" value="${
        c?.phone || ""
      }"></label>
    </div>
    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cancelar</button>
      <button class="btn primary" id="saveM">Guardar</button>
    </div>
  `;
  $("#closeM", wrap).onclick = closeModal;

  $("#saveM", wrap).onclick = async () => {
    const body = {
      name: $("#cNombre", wrap).value.trim(),
      email: $("#cEmail", wrap).value.trim(),
      phone: $("#cTel", wrap).value.trim(),
    };
    if (!body.name) {
      alert("El nombre es obligatorio.");
      return;
    }

    try {
      if (isEdit) await api(`/api/customers/${c.id}`, { method: "PUT", body });
      else await api(`/api/customers`, { method: "POST", body });
      state.clientes = await api("/api/customers");
      closeModal();
      renderClientes();
    } catch (e) {
      alert(e.message);
    }
  };
  return wrap;
}

/***********************
 * ---- USUARIOS (usuarios.html)
 ************************/
(function initUsuarios() {
  const tbody = $("#usuariosBody");
  if (!tbody) return;

  loadCommon().then(() => renderUsuarios());

  const btnAdd = $("#btnAddUsuario");
  if (btnAdd) btnAdd.onclick = () => openModal(renderUsuarioForm());
})();

function renderUsuarios() {
  const tbody = $("#usuariosBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const adminIds = state.usuarios
    .filter((u) => u.role === "ADMIN")
    .map((u) => u.id);
  const firstAdminId = adminIds.length ? Math.min(...adminIds) : null;

  state.usuarios.forEach((u) => {
    const isFirstAdmin = u.role === "ADMIN" && firstAdminId === u.id;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td>${u.role}</td>
      <td>${
        u.active
          ? '<span class="badge success">Activo</span>'
          : '<span class="badge danger">Inactivo</span>'
      }</td>
      <td>
        <button class="btn edit">Editar</button>
        ${
          isFirstAdmin ? "" : `<button class="btn danger del">Eliminar</button>`
        }
      </td>
    `;

    tr.querySelector(".edit").onclick = () => openModal(renderUsuarioForm(u));

    const delBtn = tr.querySelector(".del");
    if (delBtn) {
      delBtn.onclick = async () => {
        if (!confirm("¿Eliminar usuario?")) return;
        try {
          await api(`/api/users/${u.id}`, { method: "DELETE" });
          state.usuarios = await api("/api/users");
          renderUsuarios();
        } catch (e) {
          alert(e.message);
        }
      };
    }

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
        u?.name || ""
      }"></label>
      <label>Email<br><input id="uEmail" class="input" value="${
        u?.email || ""
      }"></label>
      <label>Rol<br>
        <select id="uRol" class="input">
          <option ${u?.role === "ADMIN" ? "selected" : ""}>ADMIN</option>
          <option ${u?.role === "MANAGER" ? "selected" : ""}>MANAGER</option>
          <option ${u?.role === "STAFF" ? "selected" : ""}>STAFF</option>
          <option ${u?.role === "CASHIER" ? "selected" : ""}>CASHIER</option>
        </select>
      </label>
      ${
        isEdit
          ? ""
          : `<label>Contraseña<br><input id="uPass" class="input" type="password" value="123456"></label>`
      }
      <label>Activo<br>
        <select id="uActivo" class="input">
          <option value="true" ${
            u?.active !== false ? "selected" : ""
          }>Sí</option>
          <option value="false" ${
            u?.active === false ? "selected" : ""
          }>No</option>
        </select>
      </label>
    </div>
    ${
      isEdit && u?.role === "ADMIN"
        ? `
      <div class="card" style="margin-top:8px">
        <div class="muted">Este usuario es ADMIN: no se permite cambiar el rol ni desactivarlo.</div>
      </div>
    `
        : ""
    }
    <div class="row end" style="margin-top:10px">
      <button class="btn" id="closeM">Cancelar</button>
      <button class="btn primary" id="saveM">Guardar</button>
    </div>
  `;

  $("#closeM", wrap).onclick = closeModal;

  if (isEdit && u?.role === "ADMIN") {
    const rolSel = $("#uRol", wrap);
    const actSel = $("#uActivo", wrap);
    if (rolSel) rolSel.setAttribute("disabled", "disabled");
    if (actSel) actSel.setAttribute("disabled", "disabled");
  }

  $("#saveM", wrap).onclick = async () => {
    const nombre = ($("#uNombre", wrap).value || "").trim();
    const email = ($("#uEmail", wrap).value || "").trim();
    if (!nombre || !email) {
      alert("Nombre y Email son obligatorios.");
      return;
    }

    const payload = {
      name: nombre,
      email: email,
      role: $("#uRol", wrap)?.value || u?.role || "STAFF",
      active: ($("#uActivo", wrap)?.value || "true") === "true",
    };
    if (!isEdit) payload.password = $("#uPass", wrap)?.value || "123456";

    if (isEdit && u?.role === "ADMIN") {
      payload.role = "ADMIN";
      payload.active = true;
    }

    try {
      if (isEdit) {
        await api(`/api/users/${u.id}`, { method: "PUT", body: payload });
      } else {
        await api(`/api/users`, { method: "POST", body: payload });
      }
      state.usuarios = await api("/api/users");
      closeModal();
      renderUsuarios();
    } catch (e) {
      alert(e.message || "No se pudo guardar el usuario.");
    }
  };

  return wrap;
}
