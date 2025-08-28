const express = require("express");
const router = express.Router();
const db = require("../db");
const { nowLocalStamp } = require("../auth");

// helper para transacciones
const tx = (fn) => db.transaction(fn);

// listar (simple)
router.get("/sales", (_req, res) => {
  const list = db
    .prepare(
      `SELECT id,folio,date,customer_name as customer, payment_method as method, subtotal, tax, total FROM sales ORDER BY id DESC`
    )
    .all();
  // contar items
  list.forEach((s) => {
    const c = db
      .prepare(`SELECT COUNT(*) as c FROM sale_items WHERE sale_id=?`)
      .get(s.id).c;
    s.items_count = c;
  });
  res.json(list);
});

// detalle
router.get("/sales/:id", (req, res) => {
  const s = db.prepare(`SELECT * FROM sales WHERE id=?`).get(req.params.id);
  if (!s) return res.status(404).json({ error: "No existe" });
  const items = db
    .prepare(`SELECT * FROM sale_items WHERE sale_id=?`)
    .all(s.id);
  res.json({ ...s, items });
});

// crear venta (ajustando inventario)
router.post("/sales", (req, res) => {
  const {
    customer_name = "Venta al público",
    payment_method = "EFECTIVO",
    items = [],
  } = req.body || {};
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "items requeridos" });

  const run = tx(() => {
    // validar stock y calcular totales (en centavos para exactitud)
    let subtotalC = 0;
    const fullItems = items.map((it) => {
      const p = db
        .prepare(`SELECT * FROM products WHERE id=?`)
        .get(it.product_id);
      if (!p) throw new Error("Producto inexistente");
      const qty = Number(it.qty || 0);
      if (qty <= 0) throw new Error("Cantidad inválida");
      if (p.stock < qty) throw new Error(`Stock insuficiente para ${p.name}`);
      const priceC = Math.round(p.price * 100);
      const totalC = priceC * qty;
      subtotalC += totalC;
      return {
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        qty,
        total: totalC / 100,
      };
    });
    const ivaC = Math.round(subtotalC * 0.16);
    const totalC = subtotalC + ivaC;

    // insertar venta
    const info = db
      .prepare(
        `INSERT INTO sales (folio, date, customer_name, payment_method, subtotal, tax, total) VALUES (NULL,?,?,?,?,?,?)`
      )
      .run(
        nowLocalStamp(),
        customer_name,
        payment_method,
        subtotalC / 100,
        ivaC / 100,
        totalC / 100
      );

    const saleId = info.lastInsertRowid;
    const folio = "V-" + String(saleId).padStart(4, "0");
    db.prepare(`UPDATE sales SET folio=? WHERE id=?`).run(folio, saleId);

    // insertar items y descontar stock
    const ins = db.prepare(
      `INSERT INTO sale_items (sale_id,product_id,sku,name,price,qty,total) VALUES (?,?,?,?,?,?,?)`
    );
    const upd = db.prepare(`UPDATE products SET stock = stock - ? WHERE id=?`);
    fullItems.forEach((it) => {
      ins.run(
        saleId,
        it.product_id,
        it.sku,
        it.name,
        it.price,
        it.qty,
        it.total
      );
      upd.run(it.qty, it.product_id);
    });

    return {
      id: saleId,
      folio,
      date: nowLocalStamp(),
      customer_name,
      payment_method,
      subtotal: subtotalC / 100,
      tax: ivaC / 100,
      total: totalC / 100,
      items: fullItems,
    };
  });

  try {
    const sale = run();
    res.status(201).json(sale);
  } catch (e) {
    res.status(400).json({ error: e.message || "No se pudo crear la venta" });
  }
});

// eliminar venta (restaurando inventario)
router.delete("/sales/:id", (req, res) => {
  const run = tx(() => {
    const s = db.prepare(`SELECT * FROM sales WHERE id=?`).get(req.params.id);
    if (!s) throw new Error("No existe");
    const items = db
      .prepare(`SELECT * FROM sale_items WHERE sale_id=?`)
      .all(s.id);
    const add = db.prepare(`UPDATE products SET stock = stock + ? WHERE id=?`);
    items.forEach((it) => add.run(it.qty, it.product_id));
    db.prepare(`DELETE FROM sale_items WHERE sale_id=?`).run(s.id);
    db.prepare(`DELETE FROM sales WHERE id=?`).run(s.id);
    return true;
  });
  try {
    run();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// actualizar venta (cambia items y ajusta stock por diferencia)
router.put("/sales/:id", (req, res) => {
  const { customer_name, payment_method, items = [] } = req.body || {};
  const run = tx(() => {
    const s = db.prepare(`SELECT * FROM sales WHERE id=?`).get(req.params.id);
    if (!s) throw new Error("No existe");
    if (!Array.isArray(items) || items.length === 0)
      throw new Error("items requeridos");

    // mapa original
    const orig = db
      .prepare(`SELECT product_id, qty FROM sale_items WHERE sale_id=?`)
      .all(s.id)
      .reduce((acc, r) => {
        acc[r.product_id] = r.qty;
        return acc;
      }, {});

    // validar y calcular totales nuevos
    let subtotalC = 0;
    const fullItems = items.map((it) => {
      const p = db
        .prepare(`SELECT * FROM products WHERE id=?`)
        .get(it.product_id);
      if (!p) throw new Error("Producto inexistente");
      const qty = Number(it.qty || 0);
      if (qty < 0) throw new Error("Cantidad inválida");
      const priceC = Math.round(p.price * 100);
      subtotalC += priceC * qty;
      return {
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        qty,
        total: (priceC * qty) / 100,
      };
    });
    const ivaC = Math.round(subtotalC * 0.16);
    const totalC = subtotalC + ivaC;

    // ajuste de stock por diferencia
    fullItems.forEach((it) => {
      const prev = orig[it.product_id] || 0;
      const diff = it.qty - prev; // si >0 se vende más (baja stock), si <0 regresa stock
      if (diff > 0) {
        const prod = db
          .prepare(`SELECT stock,name FROM products WHERE id=?`)
          .get(it.product_id);
        if (prod.stock < diff)
          throw new Error(`Stock insuficiente para ${prod.name}`);
        db.prepare(`UPDATE products SET stock = stock - ? WHERE id=?`).run(
          diff,
          it.product_id
        );
      } else if (diff < 0) {
        db.prepare(`UPDATE products SET stock = stock + ? WHERE id=?`).run(
          -diff,
          it.product_id
        );
      }
      delete orig[it.product_id];
    });
    // si quedan productos en orig no presentes ahora, devolver su stock
    for (const pid of Object.keys(orig)) {
      const qtyBack = orig[pid];
      db.prepare(`UPDATE products SET stock = stock + ? WHERE id=?`).run(
        qtyBack,
        pid
      );
    }

    // reemplazar items
    db.prepare(`DELETE FROM sale_items WHERE sale_id=?`).run(s.id);
    const ins = db.prepare(
      `INSERT INTO sale_items (sale_id,product_id,sku,name,price,qty,total) VALUES (?,?,?,?,?,?,?)`
    );
    fullItems.forEach((it) =>
      ins.run(s.id, it.product_id, it.sku, it.name, it.price, it.qty, it.total)
    );

    // actualizar cabecera
    db.prepare(
      `UPDATE sales SET customer_name=?, payment_method=?, subtotal=?, tax=?, total=? WHERE id=?`
    ).run(
      customer_name || s.customer_name,
      payment_method || s.payment_method,
      subtotalC / 100,
      ivaC / 100,
      totalC / 100,
      s.id
    );

    return {
      id: s.id,
      folio: s.folio,
      date: s.date,
      customer_name: customer_name || s.customer_name,
      payment_method: payment_method || s.payment_method,
      subtotal: subtotalC / 100,
      tax: ivaC / 100,
      total: totalC / 100,
      items: fullItems,
    };
  });

  try {
    const updated = run();
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
