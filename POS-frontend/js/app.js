const API_BASE = "http://localhost:4000";

function getToken() { return localStorage.getItem("pos_token") || ""; }
function setToken(t) { localStorage.setItem("pos_token", t); }
function clearToken() {
  localStorage.removeItem("pos_token");
  localStorage.removeItem("pos_user_name");
  localStorage.removeItem("pos_user_role");
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = "Bearer " + getToken();
  const res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || `Error API ${res.status}`);
  return data;
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function money(n) {
  return "$ " + (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeText(str) {
  const base = String(str || "").toLowerCase().normalize("NFD");
  try { return base.replace(/\p{Diacritic}/gu, ""); } catch { return base.replace(/[\u0300-\u036f]/g, ""); }
}

function resolveInput(sel) {
  if (!sel) return null;
  if (sel instanceof HTMLElement) return sel;
  let node = null;
  try {
    if (typeof sel === "string" && (sel.startsWith("#") || sel.startsWith(".") || sel.includes("["))) node = document.querySelector(sel);
  } catch {}
  return node ||
         document.getElementById(sel) ||
         document.querySelector(`input[name="${sel}"]`) ||
         document.querySelector(`[name="${sel}"]`) ||
         document.querySelector(`input[id*="${sel}"], input[name*="${sel}"]`) ||
         null;
}
function readSearch(sel) {
  const el = resolveInput(sel);
  return el ? el.value : "";
}

function attachSearch(inputSel, onChange) {
  const input = resolveInput(inputSel);
  if (!input || typeof onChange !== "function") return;
  const handler = () => onChange();
  ["input","change","keyup"].forEach(ev => input.addEventListener(ev, handler));
  const btn = input.closest("[data-search-wrap]")?.querySelector(".btn-clear")
           || document.querySelector(`[data-clear="${input.id || input.name || ""}"]`)
           || input.parentElement?.querySelector(".btn-clear");
  if (btn) btn.addEventListener("click", () => { input.value = ""; input.dispatchEvent(new Event("input")); input.focus(); });

  onChange();
}

/* ===================== Tema ===================== */
function initTheme() {
  const themeToggle = document.getElementById("themeToggle");
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  const setIcon = (t) => { const i = themeToggle?.querySelector("i"); if (i) i.className = t === "dark" ? "fas fa-sun" : "fas fa-moon"; };
  setIcon(saved);
  themeToggle?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setIcon(next);
  });
}

/* ===================== RBAC ===================== */
function getRole() { return (localStorage.getItem("pos_user_role") || "STAFF").toUpperCase(); }
function isAdmin() {
  const r = getRole();
  return r === "ADMIN" || r === "ADMINISTRADOR" || r === "SUPERADMIN" || r === "ROOT";
}
function initRBAC() {
  const links = $$('a[href*="usuarios.html"]');
  if (isAdmin()) {
    links.forEach(a => { a.style.display = ""; a.classList.remove("hidden"); });
  } else {
    links.forEach(a => {
      a.style.display = "none";
      a.addEventListener("click", (e) => { e.preventDefault(); alert("Acceso restringido. Solo el administrador puede ingresar a Usuarios."); });
    });
  }
  const isUsersPage = (location.href || "").includes("usuarios.html");
  if (isUsersPage && !isAdmin()) {
    alert("Acceso restringido. Solo el administrador puede ingresar a Usuarios.");
    location.replace("home.html");
  }
}

/* ===================== Estado ===================== */
const state = { userName: localStorage.getItem("pos_user_name") || "", productos: [], clientes: [], usuarios: [], ventas: [] };
let cart = [];
let selectedCustomer = null;

/* ===================== Auth Guard ===================== */
function guardAuthOrRedirect() {
  const isLogin = !!document.getElementById("formLogin");
  if (!isLogin && !getToken()) { location.replace("login.html"); return false; }
  return true;
}

/* ===================== Login ===================== */
function initLogin() {
  const form = document.getElementById("formLogin");
  if (!form) return;
  const errorEl = document.getElementById("loginError");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();
    try {
      const { token, user } = await api("/auth/login", { method: "POST", body: { email, password }, auth: false });
      setToken(token);
      localStorage.setItem("pos_user_name", user.name || "Usuario");
      // Guardamos rol en mayúsculas para estandarizar
      localStorage.setItem("pos_user_role", (user.role || "STAFF").toString().toUpperCase());
      location.href = "index.html";
    } catch {
      if (errorEl) errorEl.classList.remove("hidden");
    }
  });
}

/* ===================== Topbar ===================== */
function initTopbar() {
  const topUser = document.getElementById("userLabel");
  if (topUser) topUser.textContent = state.userName || "";
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) btnLogout.addEventListener("click", () => { clearToken(); location.href = "login.html"; });
}

/* ===================== Carga Común ===================== */
async function loadCommon() {
  if (!guardAuthOrRedirect()) return;
  const needProducts = !!(document.getElementById("productGrid") || document.getElementById("productosBody") || document.getElementById("inventarioBody"));
  const needCustomers = !!(document.getElementById("clientesBody") || document.getElementById("btnSelectCustomer"));
  const needSales = !!document.getElementById("ventasBody");
  const needUsers = !!document.getElementById("usuariosBody");
  const tasks = [];
  if (needProducts) tasks.push(api("/api/products").then(d => state.productos = d));
  if (needCustomers) tasks.push(api("/api/customers").then(d => state.clientes = d));
  if (needSales) tasks.push(api("/api/sales").then(d => state.ventas = d.map(s => ({ id:s.id, folio:s.folio, fecha:s.date, cliente:s.customer, metodo:s.method, subtotal:s.subtotal, iva:s.tax, total:s.total, items:null }))));
  if (needUsers) tasks.push(api("/api/users").then(d => state.usuarios = d));
  if (tasks.length) await Promise.all(tasks);
}

/* ===================== CAJA ===================== */
function initCaja() {
  if (!document.getElementById("cartBody")) return;
  const btnSelectCustomer = document.getElementById("btnSelectCustomer");
  btnSelectCustomer && (btnSelectCustomer.onclick = () => openModal(renderClientePicker()));
  const btnVaciar = document.getElementById("btnVaciar");
  btnVaciar && (btnVaciar.onclick = () => { cart = []; renderCart(); });
  const btnCobrar = document.getElementById("btnCobrar");
  btnCobrar && (btnCobrar.onclick = () => { if (!cart.length) return alert("Agrega al menos un producto al carrito para cobrar."); openModal(renderCobro()); });
  attachSearch("searchProducts", renderPOS);
  loadCommon().then(() => { renderPOS(); renderCart(); });
}

function renderPOS() {
  const grid = document.getElementById("productGrid"); if (!grid) return;
  grid.innerHTML = "";
  const term = normalizeText(readSearch("searchProducts"));
  state.productos.filter(p => {
    const name = normalizeText(p.name), sku = normalizeText(p.sku);
    return name.includes(term) || sku.includes(term);
  }).forEach(p => {
    const imgSrc = p.image_url && p.image_url.trim() !== "" ? (p.image_url.startsWith("http") ? p.image_url : API_BASE + p.image_url.replace(/^\/+/, "/")) : `https://placehold.co/600x400?text=${encodeURIComponent(p.name)}`;
    const card = document.createElement("div"); card.className = "product-card";
    card.innerHTML = `
      <img src="${imgSrc}" alt="${p.name}">
      <div class="pad">
        <div class="title">${p.name}</div>
        <div class="muted">SKU: ${p.sku}</div>
        <div class="price">${money(p.price)}</div>
        <div class="row">
          <span class="badge ${p.stock<=0?"danger":p.stock<=p.min?"warning":"success"}">${p.stock<=0?"Sin stock":p.stock<=p.min?"Bajo stock":"En stock"}</span>
        </div>
        <div class="row" style="margin-top:8px"><button class="btn" ${p.stock<=0?"disabled":""}>Agregar</button></div>
      </div>`;
    card.querySelector("button").onclick = () => addToCart(p.id);
    grid.appendChild(card);
  });
}
function addToCart(productId) {
  const p = state.productos.find(x => x.id === productId);
  if (!p || p.stock <= 0) return;
  const it = cart.find(i => i.productId === productId);
  if (it) { if (it.qty < p.stock) it.qty++; } else { cart.push({ productId, qty: 1 }); }
  renderCart();
}
function renderCart() {
  const tbody = document.getElementById("cartBody"); if (!tbody) return;
  tbody.innerHTML = ""; let subtotal = 0;
  cart.forEach(item => {
    const p = state.productos.find(x => x.id === item.productId); const line = p.price * item.qty; subtotal += line;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td><input type="number" min="1" max="${p.stock}" value="${item.qty}"></td>
      <td>${money(p.price)}</td>
      <td>${money(line)}</td>
      <td><button class="btn danger">Eliminar</button></td>`;
    const qtyInput = tr.querySelector("input");
    qtyInput.addEventListener("input", (e) => {
      let raw = (e.target.value || "").replace(/[^\d]/g, ""); if (raw === "") return;
      let n = parseInt(raw, 10); if (n > p.stock) n = p.stock; if (n < 1) n = 1; item.qty = n;
      tr.children[3].textContent = money(p.price * item.qty);
      let sub = 0; cart.forEach(it => { const pr = state.productos.find(x => x.id === it.productId); sub += pr.price * it.qty; });
      const iva = sub * 0.16;
      $("#lblSubtotal").textContent = money(sub); $("#lblTax").textContent = money(iva); $("#lblTotal").textContent = money(sub + iva);
    });
    function commitQty() { let n = parseInt(qtyInput.value || "1", 10); if (isNaN(n) || n < 1) n = 1; if (n > p.stock) n = p.stock; item.qty = n; qtyInput.value = n; renderCart(); }
    qtyInput.addEventListener("change", commitQty);
    qtyInput.addEventListener("blur", commitQty);
    qtyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); qtyInput.blur(); } });
    tr.querySelector(".danger").onclick = () => { cart = cart.filter(c => c !== item); renderCart(); };
    tbody.appendChild(tr);
  });
  const tax = subtotal * 0.16, total = subtotal + tax;
  $("#lblSubtotal").textContent = money(subtotal); $("#lblTax").textContent = money(tax); $("#lblTotal").textContent = money(total);
  $("#lblCliente").textContent = "Cliente: " + (selectedCustomer ? selectedCustomer.name : "Venta al público");
  const btnCobrar = document.getElementById("btnCobrar"); if (btnCobrar) btnCobrar.disabled = cart.length === 0;
}
function renderClientePicker() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Seleccionar cliente</h3>
    <div class="search-wrapper" data-search-wrap>
      <input id="pickSearch" class="input" placeholder="Buscar cliente…">
      <button class="btn btn-icon btn-clear" title="Limpiar"><i class="fas fa-times"></i></button>
    </div>
    <div id="pickList" style="max-height:300px;overflow:auto;margin-top:8px"></div>
    <div class="row end" style="margin-top:8px"><button class="btn" id="closeM">Cerrar</button></div>`;
  const list = $("#pickList", wrap);
  const publicoRow = document.createElement("div"); publicoRow.className = "row";
  publicoRow.style.cssText = "justify-content:space-between;border-bottom:1px solid var(--border);padding:8px 0";
  publicoRow.innerHTML = `<div><strong>Venta al público (general)</strong><div class="muted">Sin datos de facturación</div></div><button class="btn">Usar</button>`;
  publicoRow.querySelector("button").onclick = () => { selectedCustomer = null; closeModal(); renderCart(); };
  list.appendChild(publicoRow);
  function draw() {
    list.querySelectorAll(".cliente-row").forEach(n => n.remove());
    const term = normalizeText($("#pickSearch", wrap).value || "");
    state.clientes.filter(c => {
      const name = normalizeText(c.name), email = normalizeText(c.email || ""), phone = normalizeText(c.phone || "");
      return name.includes(term) || email.includes(term) || phone.includes(term);
    }).forEach(c => {
      const row = document.createElement("div"); row.className = "row cliente-row";
      row.style.cssText = "justify-content:space-between;border-bottom:1px solid var(--border);padding:8px 0";
      row.innerHTML = `<div><strong>${c.name}</strong><div class="muted">${c.email || ""} ${c.phone ? "· " + c.phone : ""}</div></div><button class="btn">Elegir</button>`;
      row.querySelector("button").onclick = () => { selectedCustomer = c; closeModal(); renderCart(); };
      list.appendChild(row);
    });
  }
  attachSearch("#pickSearch", draw);
  $("#closeM", wrap).onclick = closeModal;
  return wrap;
}
function renderCobro() {
  if (!cart.length) { alert("El carrito está vacío. Agrega productos antes de cobrar."); return document.createElement("div"); }
  let subtotalC = 0; cart.forEach(it => { const p = state.productos.find(x => x.id === it.productId); if (p) subtotalC += Math.round(p.price * 100) * it.qty; });
  const ivaC = Math.round(subtotalC * 0.16), totalC = subtotalC + ivaC;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Cobro</h3>
    <div>Total a pagar: <strong>${money(totalC / 100)}</strong></div>
    <div class="grid cols-2" style="margin-top:8px">
      <label>Método de pago<br><select id="metodo" class="input"><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="TRANSFERENCIA">Transferencia</option></select></label>
      <label>Monto recibido<br><input id="monto" class="input" type="number" min="0" step="0.01" value="${(totalC / 100).toFixed(2)}"></label>
    </div>
    <div class="row end" style="margin-top:10px"><button class="btn" id="closeM">Cancelar</button><button class="btn primary" id="confirm">Completar venta</button></div>`;
  $("#closeM", wrap).onclick = closeModal;
  $("#confirm", wrap).onclick = async () => {
    const metodo = $("#metodo", wrap).value;
    const monto = parseFloat($("#monto", wrap).value || "0");
    const montoC = Math.round(monto * 100);
    if (isNaN(montoC) || montoC < totalC) return alert("El monto recibido es insuficiente.");
    const payload = { customer_name: selectedCustomer?.name || "Venta al público", payment_method: metodo, items: cart.map(it => ({ product_id: it.productId, qty: it.qty })) };
    try {
      const sale = await api("/api/sales", { method: "POST", body: payload });
      const [products, sales] = await Promise.all([api("/api/products"), api("/api/sales")]);
      state.productos = products;
      state.ventas = sales.map(s => ({ id:s.id, folio:s.folio, fecha:s.date, cliente:s.customer, metodo:s.method, subtotal:s.subtotal, iva:s.tax, total:s.total, items:null }));
      cart = []; selectedCustomer = null; closeModal(); renderCart(); renderPOS(); if ($("#ventasBody")) renderVentas();
      const cambioC = montoC - Math.round((sale.total || totalC / 100) * 100);
      alert("Venta completada. Cambio: " + money(cambioC / 100));
    } catch (e) { alert("No se pudo completar la venta: " + e.message); }
  };
  return wrap;
}

/* ===================== VENTAS ===================== */
function initVentas() {
  if (!document.getElementById("ventasBody")) return;
  attachSearch("searchVentas", renderVentas); // ahora soporta ID, name o selector
  loadCommon().then(() => renderVentas());
}
function renderVentas() {
  const tbody = document.getElementById("ventasBody"); if (!tbody) return;
  tbody.innerHTML = "";
  const term = normalizeText(readSearch("searchVentas"));
  state.ventas.filter(v => {
    const folio = normalizeText(v.folio);
    const fecha = normalizeText(v.fecha);
    const cliente = normalizeText(v.cliente);
    const total = String(v.total || 0);
    return folio.includes(term) || fecha.includes(term) || cliente.includes(term) || total.includes(term);
  }).forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.folio}</td><td>${v.fecha}</td><td>${v.cliente}</td><td>${v.items?.length ?? ""}</td><td>${money(v.total)}</td>
      <td><button class="btn ver">Ver</button><button class="btn edit">Editar</button><button class="btn danger del">Eliminar</button></td>`;
    tr.querySelector(".ver").onclick = async () => {
      if (!v.items) {
        const full = await api(`/api/sales/${v.id}`);
        v.items = full.items.map(i => ({ nombre:i.name, qty:i.qty, precio:i.price, total:i.total, sku:i.sku }));
        v.subtotal = full.subtotal; v.iva = full.tax; v.total = full.total;
      }
      openModal(renderVentaDetalle(v));
    };
    tr.querySelector(".edit").onclick = () => openModal(renderVentaForm(v));
    tr.querySelector(".del").onclick = () => deleteVenta(v);
    tbody.appendChild(tr);
  });
}
function renderVentaDetalle(v) {
  const wrap = document.createElement("div");
  const itemsHtml = (v.items && v.items.length) ? v.items.map(i => `
    <tr><td>${i.nombre}</td><td style="text-align:center">${i.qty}</td><td>${money(i.precio)}</td><td>${money(i.total)}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">Sin productos</td></tr>`;
  wrap.innerHTML = `
    <h3>Detalle de venta ${v.folio}</h3>
    <div class="muted" style="margin-bottom:8px">${v.fecha} — ${v.cliente} — ${v.metodo || "—"}</div>
    <table class="table" style="margin-top:8px"><thead><tr><th>Producto</th><th style="width:90px;text-align:center">Qty</th><th>Precio</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>
    <div class="row end" style="margin-top:8px"><div class="card" style="min-width:240px"><div>Subtotal: <strong>${money(v.subtotal)}</strong></div><div>IVA: <strong>${money(v.iva)}</strong></div><div>Total: <strong>${money(v.total)}</strong></div></div></div>
    <div class="row end" style="margin-top:10px"><button class="btn" id="closeM">Cerrar</button></div>`;
  $("#closeM", wrap).onclick = closeModal; return wrap;
}
async function deleteVenta(v) {
  if (!confirm(`¿Eliminar la venta ${v.folio}?`)) return;
  try {
    await api(`/api/sales/${v.id}`, { method: "DELETE" });
    const [products, sales] = await Promise.all([api("/api/products"), api("/api/sales")]);
    state.productos = products; state.ventas = sales.map(s => ({ id:s.id, folio:s.folio, fecha:s.date, cliente:s.customer, metodo:s.method, subtotal:s.subtotal, iva:s.tax, total:s.total, items:null }));
    renderVentas(); if ($("#inventarioBody")) renderInventario(); if ($("#productGrid")) renderPOS();
  } catch (e) { alert("No se pudo eliminar: " + e.message); }
}
function renderVentaForm(v) {
  const prodBySku = (sku) => state.productos.find(p => p.sku === sku);
  if (!v.items) {
    api(`/api/sales/${v.id}`).then(full => {
      v.items = full.items.map(i => ({ sku:i.sku, nombre:i.name, precio:i.price, qty:i.qty }));
      v.subtotal = full.subtotal; v.iva = full.tax; v.total = full.total;
      closeModal(); openModal(renderVentaForm(v));
    });
    const d = document.createElement("div"); d.innerHTML = `<p class="muted">Cargando venta...</p>`; return d;
  }
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Editar venta ${v.folio}</h3>
    <div class="grid cols-2" style="margin:8px 0">
      <label>Cliente<br><input id="edCliente" class="input" value="${v.cliente}"></label>
      <label>Método de pago<br><select id="edMetodo" class="input">
        <option value="EFECTIVO" ${v.metodo==="EFECTIVO"?"selected":""}>Efectivo</option>
        <option value="TARJETA" ${v.metodo==="TARJETA"?"selected":""}>Tarjeta</option>
        <option value="TRANSFERENCIA" ${v.metodo==="TRANSFERENCIA"?"selected":""}>Transferencia</option></select></label>
    </div>
    <div class="card" style="margin-top:6px">
      <table class="table"><thead><tr><th>Producto</th><th style="width:120px">Cantidad</th><th>Precio</th><th>Total</th></tr></thead>
        <tbody id="editItemsBody">${v.items.map(it=>`
          <tr data-sku="${it.sku||""}"><td>${it.nombre}<div class="muted">SKU: ${it.sku||""}</div></td>
          <td><input class="input qty" type="number" min="0" value="${it.qty}"></td><td>${money(it.precio)}</td>
          <td class="cell-total">${money(it.precio*it.qty)}</td></tr>`).join("")}</tbody></table>
    </div>
    <div class="row end" style="margin-top:8px"><div class="card" style="min-width:240px">
      <div>Subtotal: <strong id="edSub">${money(v.subtotal)}</strong></div>
      <div>IVA: <strong id="edIva">${money(v.iva)}</strong></div>
      <div>Total: <strong id="edTot">${money(v.total)}</strong></div></div></div>
    <div class="row end" style="margin-top:10px"><button class="btn" id="closeM">Cancelar</button><button class="btn primary" id="saveV">Guardar</button></div>`;
  $$(".qty", wrap).forEach((inp, idx) => {
    inp.addEventListener("input", () => {
      let n = parseInt(inp.value || "0", 10); if (isNaN(n) || n < 0) n = 0; inp.value = n; v.items[idx].qty = n;
      const sub = v.items.reduce((s, it) => s + it.precio * it.qty, 0); const iva = sub * 0.16; const tot = sub + iva;
      $(".cell-total", inp.closest("tr")).textContent = money(v.items[idx].precio * n);
      $("#edSub", wrap).textContent = money(sub); $("#edIva", wrap).textContent = money(iva); $("#edTot", wrap).textContent = money(tot);
    });
  });
  $("#closeM", wrap).onclick = closeModal;
  $("#saveV", wrap).onclick = async () => {
    const payload = {
      customer_name: ($("#edCliente", wrap)?.value || "Venta al público").trim() || "Venta al público",
      payment_method: $("#edMetodo", wrap)?.value,
      items: v.items.map(it => { const p = prodBySku(it.sku) || state.productos.find(pp => pp.name === it.nombre); return { product_id: p ? p.id : null, qty: it.qty }; }).filter(x => x.product_id),
    };
    if (!payload.items.length) return alert("La venta no puede quedar vacía.");
    try {
      await api(`/api/sales/${v.id}`, { method: "PUT", body: payload });
      const [products, sales] = await Promise.all([api("/api/products"), api("/api/sales")]);
      state.productos = products; state.ventas = sales.map(s => ({ id:s.id, folio:s.folio, fecha:s.date, cliente:s.customer, metodo:s.method, subtotal:s.subtotal, iva:s.tax, total:s.total, items:null }));
      closeModal(); renderVentas(); if ($("#inventarioBody")) renderInventario(); if ($("#productGrid")) renderPOS();
      alert("Venta actualizada.");
    } catch (e) { alert("No se pudo actualizar la venta: " + e.message); }
  };
  return wrap;
}

/* ===================== PRODUCTOS ===================== */
function initProductos() {
  if (!document.getElementById("productosBody")) return;
  attachSearch("searchProductos", renderProductos);
  loadCommon().then(() => renderProductos());
  const btnAdd = document.getElementById("btnAddProducto");
  btnAdd && (btnAdd.onclick = () => openModal(renderProductoForm()));
}
function renderProductos() {
  const tbody = document.getElementById("productosBody"); if (!tbody) return;
  tbody.innerHTML = "";
  const term = normalizeText(readSearch("searchProductos"));
  state.productos.filter(p => {
    const name = normalizeText(p.name), sku = normalizeText(p.sku);
    const price = String(p.price || 0), stock = String(p.stock || 0);
    return name.includes(term) || sku.includes(term) || price.includes(term) || stock.includes(term);
  }).forEach(p => {
    const estado = p.stock<=0?'<span class="badge danger">Sin stock</span>':p.stock<=p.min?'<span class="badge warning">Bajo stock</span>':'<span class="badge success">En stock</span>';
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.sku}</td><td>${p.name}</td><td>${money(p.price)}</td><td>${p.stock}</td><td>${estado}</td>
      <td><button class="btn edit">Editar</button><button class="btn danger del">Eliminar</button></td>`;
    tr.querySelector(".edit").onclick = () => openModal(renderProductoForm(p));
    tr.querySelector(".del").onclick = async () => {
      if (!confirm("¿Eliminar producto?")) return;
      try {
        await api(`/api/products/${p.id}`, { method: "DELETE" });
        state.productos = await api("/api/products");
        renderProductos(); if ($("#inventarioBody")) renderInventario(); if ($("#productGrid")) renderPOS();
      } catch (e) { alert(e.message); }
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
      <label>SKU<br><input id="fSku" class="input" value="${p?.sku || ""}" placeholder="SKU-00001"></label>
      <label>Nombre<br><input id="fNombre" class="input" value="${p?.name || ""}"></label>
      <label>Precio<br><input id="fPrecio" type="number" class="input" value="${p?.price ?? 0}"></label>
      <label>Stock<br><input id="fStock" type="number" class="input" value="${p?.stock ?? 0}"></label>
      <label>Mínimo<br><input id="fMin" type="number" class="input" value="${p?.min ?? 0}"></label>
      <label>Imagen (URL)<br><input id="fImgUrl" class="input" placeholder="https://... o /uploads/sku.jpg" value="${p?.image_url || ""}"></label>
    </div>
    <div style="margin:8px 0">
      <img id="imgPreview" src="${p?.image_url ? (p.image_url.startsWith("http") ? p.image_url : API_BASE + p.image_url) : ""}" alt="" style="max-width:220px; ${p?.image_url ? "" : "display:none"}">
    </div>
    <div class="row end" style="margin-top:10px"><button class="btn" id="closeM">Cancelar</button><button class="btn primary" id="saveM">Guardar</button></div>`;
  $("#closeM", wrap).onclick = closeModal;
  $("#fImgUrl", wrap).addEventListener("input", (e) => {
    const url = (e.target.value || "").trim(); const prev = $("#imgPreview", wrap);
    if (!url) { prev.style.display = "none"; return; }
    prev.src = url.startsWith("http") ? url : API_BASE + url.replace(/^\/+/, "/"); prev.style.display = "block";
  });
  $("#saveM", wrap).onclick = async () => {
    const body = {
      sku: ($("#fSku", wrap).value || "").trim(),
      name: ($("#fNombre", wrap).value || "").trim(),
      price: parseFloat($("#fPrecio", wrap).value || "0"),
      stock: parseInt($("#fStock", wrap).value || "0", 10),
      min: parseInt($("#fMin", wrap).value || "0", 10),
      image_url: $("#fImgUrl", wrap).value.trim(),
    };
    if (!body.sku || !body.name) return alert("SKU y Nombre son obligatorios.");
    try {
      if (isEdit) await api(`/api/products/${p.id}`, { method: "PUT", body });
      else await api(`/api/products`, { method: "POST", body });
      state.productos = await api("/api/products");
      closeModal(); renderProductos(); if ($("#inventarioBody")) renderInventario(); if ($("#productGrid")) renderPOS();
    } catch (e) { alert(e.message); }
  };
  return wrap;
}

/* ===================== INVENTARIO ===================== */
function initInventario() {
  if (!document.getElementById("inventarioBody")) return;
  attachSearch("searchInventario", renderInventario);
  loadCommon().then(() => renderInventario());
}
function renderAjusteStockModal(p) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Ajustar stock — ${p.name} (SKU: ${p.sku})</h3>
    <div class="grid cols-2" style="margin-top:8px">
      <label>Tipo de movimiento<br><select id="stkTipo" class="input"><option value="IN">Entrada (IN)</option><option value="OUT">Salida (OUT)</option><option value="SET">Fijar stock (SET)</option></select></label>
      <label id="lblQty">Cantidad<br><input id="stkQty" class="input" type="number" min="0" step="1" placeholder="0"></label>
      <label id="lblSet" class="hidden">Nuevo stock<br><input id="stkSet" class="input" type="number" min="0" step="1" placeholder="${p.stock}"></label>
      <label>Nota<br><input id="stkNote" class="input" placeholder="Opcional"></label>
    </div>
    <div class="row end" style="margin-top:10px"><button class="btn" id="closeM">Cancelar</button><button class="btn primary" id="saveM">Aplicar</button></div>`;
  const tipo = $("#stkTipo", wrap), lblQty = $("#lblQty", wrap), lblSet = $("#lblSet", wrap);
  tipo.onchange = () => { const isSet = tipo.value === "SET"; lblSet.classList.toggle("hidden", !isSet); lblQty.classList.toggle("hidden", isSet); };
  $("#closeM", wrap).onclick = closeModal;
  $("#saveM", wrap).onclick = async () => {
    try {
      const note = $("#stkNote", wrap).value.trim();
      if (tipo.value === "SET") {
        const stock = parseInt($("#stkSet", wrap).value || "0", 10); if (isNaN(stock) || stock < 0) return alert("Stock inválido");
        await api("/api/stock/set", { method: "POST", body: { product_id: p.id, stock, note } });
      } else {
        const qty = parseInt($("#stkQty", wrap).value || "0", 10); if (isNaN(qty) || qty <= 0) return alert("Cantidad inválida");
        await api("/api/stock/adjust", { method: "POST", body: { product_id: p.id, type: tipo.value, qty, note } });
      }
      state.productos = await api("/api/products"); closeModal(); renderInventario(); if ($("#productosBody")) renderProductos(); if ($("#productGrid")) renderPOS();
      alert("Ajuste aplicado.");
    } catch (e) { alert("No se pudo ajustar: " + e.message); }
  };
  return wrap;
}
function renderMovimientosModal(productId) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <h3>Movimientos de stock</h3>
    <div class="card" style="margin-top:8px">
      <table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Nota</th><th>Producto</th></tr></thead>
      <tbody id="movBody"><tr><td colspan="5" class="muted">Cargando…</td></tr></tbody></table></div>
    <div class="row end" style="margin-top:10px"><button class="btn" id="closeM">Cerrar</button></div>`;
  $("#closeM", wrap).onclick = closeModal;
  (async () => {
    try {
      const url = productId ? `/api/stock/movements?product_id=${productId}` : "/api/stock/movements";
      const rows = await api(url);
      const body = $("#movBody", wrap);
      body.innerHTML = rows.length ? rows.map(r => `
        <tr><td>${r.created_at}</td><td>${r.type}</td><td>${r.qty}</td><td>${r.note || ""}</td><td>${r.sku} — ${r.name}</td></tr>`).join("") : `<tr><td colspan="5" class="muted">Sin movimientos</td></tr>`;
    } catch (e) { $("#movBody", wrap).innerHTML = `<tr><td colspan="5" class="muted">Error: ${e.message}</td></tr>`; }
  })();
  return wrap;
}
function renderInventario() {
  const tbody = document.getElementById("inventarioBody"); if (!tbody) return;
  tbody.innerHTML = "";
  const term = normalizeText(readSearch("searchInventario"));
  state.productos.filter(p => {
    const name = normalizeText(p.name), sku = normalizeText(p.sku), stock = String(p.stock || 0);
    return name.includes(term) || sku.includes(term) || stock.includes(term);
  }).forEach(p => {
    const estado = p.stock<=0?'<span class="badge danger">Sin stock</span>':p.stock<=p.min?'<span class="badge warning">Bajo stock</span>':'<span class="badge success">En stock</span>';
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.sku}</td><td>${p.name}</td><td>${p.stock}</td><td>${p.min}</td><td>${estado}</td>
      <td><div class="row"><button class="btn" data-act="ajustar">Ajustar</button><button class="btn" data-act="mov">Movimientos</button></div></td>`;
    tr.querySelector('[data-act="ajustar"]').onclick = () => openModal(renderAjusteStockModal(p));
    tr.querySelector('[data-act="mov"]').onclick = () => openModal(renderMovimientosModal(p.id));
    tbody.appendChild(tr);
  });
}

/* ===================== CLIENTES ===================== */
function initClientes() {
  if (!document.getElementById("clientesBody")) return;
  attachSearch("searchClientes", renderClientes); // Soporta ID, name o selector
  loadCommon().then(() => renderClientes());
  const btnAdd = document.getElementById("btnAddCliente"); btnAdd && (btnAdd.onclick = () => openModal(renderClienteForm()));
}
function renderClientes() {
  const tbody = document.getElementById("clientesBody"); if (!tbody) return;
  tbody.innerHTML = "";
  const term = normalizeText(readSearch("searchClientes"));
  state.clientes.filter(c => {
    const name = normalizeText(c.name), email = normalizeText(c.email || ""), phone = normalizeText(c.phone || "");
    return name.includes(term) || email.includes(term) || phone.includes(term);
  }).forEach(c => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${c.name}</td><td>${c.email || ""}</td><td>${c.phone || ""}</td>
      <td><button class="btn edit">Editar</button><button class="btn danger del">Eliminar</button></td>`;
    tr.querySelector(".edit").onclick = () => openModal(renderClienteForm(c));
    tr.querySelector(".del").onclick = async () => {
      if (!confirm("¿Eliminar cliente?")) return;
      try { await api(`/api/customers/${c.id}`, { method: "DELETE" }); state.clientes = await api("/api/customers"); renderClientes(); }
      catch (e) { alert(e.message); }
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
      <label>Nombre<br><input id="cNombre" class="input" value="${c?.name || ""}"></label>
      <label>Email<br><input id="cEmail" class="input" value="${c?.email || ""}"></label>
      <label>Teléfono<br><input id="cTel" class="input" value="${c?.phone || ""}"></label>
    </div>
    <div class="row end" style="margin-top:10px"><button class="btn" id="closeM">Cancelar</button><button class="btn primary" id="saveM">Guardar</button></div>`;
  $("#closeM", wrap).onclick = closeModal;
  $("#saveM", wrap).onclick = async () => {
    const body = { name: $("#cNombre", wrap).value.trim(), email: $("#cEmail", wrap).value.trim(), phone: $("#cTel", wrap).value.trim() };
    if (!body.name) return alert("El nombre es obligatorio.");
    try {
      if (isEdit) await api(`/api/customers/${c.id}`, { method: "PUT", body }); else await api(`/api/customers`, { method: "POST", body });
      state.clientes = await api("/api/customers"); closeModal(); renderClientes();
    } catch (e) { alert(e.message); }
  };
  return wrap;
}

/* ===================== USUARIOS ===================== */
function initUsuarios() {
  if (!document.getElementById("usuariosBody")) return;
  // Si alguien abre usuarios.html sin ser admin (defensa extra)
  if (!isAdmin()) { alert("Acceso restringido. Solo el administrador puede ingresar a Usuarios."); return location.replace("home.html"); }
  attachSearch("searchUsuarios", renderUsuarios);
  loadCommon().then(() => renderUsuarios());
  const btnAdd = document.getElementById("btnAddUsuario"); btnAdd && (btnAdd.onclick = () => openModal(renderUsuarioForm()));
}
function renderUsuarios() {
  const tbody = document.getElementById("usuariosBody"); if (!tbody) return;
  tbody.innerHTML = "";
  const term = normalizeText(readSearch("searchUsuarios"));
  const adminIds = state.usuarios.filter(u => (u.role || "").toString().toUpperCase().includes("ADMIN")).map(u => u.id);
  const firstAdminId = adminIds.length ? Math.min(...adminIds) : null;
  state.usuarios.filter(u => {
    const name = normalizeText(u.name), email = normalizeText(u.email);
    const role = normalizeText((u.role || "").toString()); const active = u.active ? "activo" : "inactivo";
    return name.includes(term) || email.includes(term) || role.includes(term) || active.includes(term);
  }).forEach(u => {
    const isFirstAdmin = (u.role || "").toString().toUpperCase().includes("ADMIN") && firstAdminId === u.id;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
      <td>${u.active ? '<span class="badge success">Activo</span>' : '<span class="badge danger">Inactivo</span>'}</td>
      <td><button class="btn edit">Editar</button>${isFirstAdmin ? "" : `<button class="btn danger del">Eliminar</button>`}</td>`;
    tr.querySelector(".edit").onclick = () => openModal(renderUsuarioForm(u));
    const delBtn = tr.querySelector(".del");
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm("¿Eliminar usuario?")) return;
      try { await api(`/api/users/${u.id}`, { method: "DELETE" }); state.usuarios = await api("/api/users"); renderUsuarios(); }
      catch (e) { alert(e.message); }
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
      <label>Nombre<br><input id="uNombre" class="input" value="${u?.name || ""}"></label>
      <label>Email<br><input id="uEmail" class="input" value="${u?.email || ""}"></label>
      <label>Rol<br>
        <select id="uRol" class="input">
          <option ${((u?.role||"").toString().toUpperCase()==="ADMIN")?"selected":""}>ADMIN</option>
          <option ${((u?.role||"").toString().toUpperCase()==="MANAGER")?"selected":""}>MANAGER</option>
          <option ${((u?.role||"").toString().toUpperCase()==="STAFF")?"selected":""}>STAFF</option>
          <option ${((u?.role||"").toString().toUpperCase()==="CASHIER")?"selected":""}>CASHIER</option>
        </select>
      </label>
      ${isEdit ? "" : `<label>Contraseña<br><input id="uPass" class="input" type="password" value="123456"></label>`}
      <label>Activo<br>
        <select id="uActivo" class="input">
          <option value="true" ${u?.active !== false ? "selected" : ""}>Sí</option>
          <option value="false" ${u?.active === false ? "selected" : ""}>No</option>
        </select>
      </label>
    </div>
    ${isEdit && ((u?.role||"").toString().toUpperCase()==="ADMIN") ? `<div class="card" style="margin-top:8px"><div class="muted">Este usuario es ADMIN: no se permite cambiar el rol ni desactivarlo.</div></div>` : ""}
    <div class="row end" style="margin-top:10px"><button class="btn" id="closeM">Cancelar</button><button class="btn primary" id="saveM">Guardar</button></div>`;
  $("#closeM", wrap).onclick = closeModal;
  if (isEdit && ((u?.role||"").toString().toUpperCase()==="ADMIN")) {
    $("#uRol", wrap)?.setAttribute("disabled", "disabled");
    $("#uActivo", wrap)?.setAttribute("disabled", "disabled");
  }
  $("#saveM", wrap).onclick = async () => {
    const nombre = ($("#uNombre", wrap).value || "").trim();
    const email = ($("#uEmail", wrap).value || "").trim();
    if (!nombre || !email) return alert("Nombre y Email son obligatorios.");
    const payload = {
      name: nombre,
      email,
      role: $("#uRol", wrap)?.value || u?.role || "STAFF",
      active: ($("#uActivo", wrap)?.value || "true") === "true",
    };
    if (!isEdit) payload.password = $("#uPass", wrap)?.value || "123456";
    if (isEdit && ((u?.role||"").toString().toUpperCase()==="ADMIN")) { payload.role = "ADMIN"; payload.active = true; }
    try {
      if (isEdit) await api(`/api/users/${u.id}`, { method: "PUT", body: payload });
      else await api(`/api/users`, { method: "POST", body: payload });
      state.usuarios = await api("/api/users"); closeModal(); renderUsuarios();
    } catch (e) { alert(e.message || "No se pudo guardar el usuario."); }
  };
  return wrap;
}

/* ===================== Modal genérico ===================== */
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modalContent");
function openModal(node) { if (!modal || !modalContent) return; modalContent.innerHTML = ""; modalContent.appendChild(node); modal.classList.remove("hidden"); modal.addEventListener("click", backdropClose); }
function backdropClose(e) { if (e.target === modal) closeModal(); }
function closeModal() { if (!modal || !modalContent) return; modal.classList.add("hidden"); modalContent.innerHTML = ""; modal.removeEventListener("click", backdropClose); }

/* ===================== Bootstrap ===================== */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initRBAC();
  initTopbar();
  initLogin();
  initCaja();
  initVentas();
  initProductos();
  initInventario();
  initClientes();
  initUsuarios();
});