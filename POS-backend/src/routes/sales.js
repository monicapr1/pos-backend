const express = require("express");
const router = express.Router();
const db = require("../db");
const { nowLocalStamp } = require("../auth");

function toISODate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startEndFromDays(days) {
  const end0 = new Date(); end0.setUTCHours(0,0,0,0);
  const start = new Date(end0); start.setUTCDate(start.getUTCDate() - (Number(days) || 30));
  const endPlus1 = new Date(end0); endPlus1.setUTCDate(endPlus1.getUTCDate() + 1);
  return { start: toISODate(start), end: toISODate(endPlus1) }; // end exclusivo
}
function startEndFromStartDate(startDateStr) {
  const sd = new Date(`${startDateStr}T00:00:00Z`);
  if (isNaN(sd)) return null;
  const end0 = new Date(); end0.setUTCHours(0,0,0,0);
  const endPlus1 = new Date(end0); endPlus1.setUTCDate(endPlus1.getUTCDate() + 1);
  return { start: toISODate(sd), end: toISODate(endPlus1) };
}
function dateNDaysAgo(n) {
  const d = new Date(); d.setUTCHours(0,0,0,0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function fillMissingDays(rows, days) {
  const map = new Map(rows.map(r => [r.day, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = toISODate(dateNDaysAgo(i));
    const r = map.get(d);
    out.push({
      date: d, label: d, day: d,
      total: r ? Number(r.units || 0) : 0,
      revenue: r ? Number(r.revenue || 0) : 0,
    });
  }
  return out;
}


// listar (simple)
router.get("/sales", (_req, res) => {
  const list = db.prepare(
    `SELECT id, folio, date, customer_name as customer,
            payment_method as method, subtotal, tax, total
     FROM sales
     ORDER BY id DESC`
  ).all();

  list.forEach((s) => {
    const c = db.prepare(`SELECT COUNT(*) as c FROM sale_items WHERE sale_id=?`).get(s.id).c;
    s.items_count = c;
  });

  res.json(list);
});

// detalle
router.get("/sales/:id(\\d+)", (req, res) => {
  const s = db.prepare(`SELECT * FROM sales WHERE id=?`).get(req.params.id);
  if (!s) return res.status(404).json({ error: "No existe" });
  const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id=?`).all(s.id);
  res.json({ ...s, items });
});

// crear venta (ajustando inventario)
router.post("/sales", (req, res) => {
  const { customer_name = "Venta al público", payment_method = "EFECTIVO", items = [] } = req.body || {};
  const cleanItems = (Array.isArray(items) ? items : [])
    .map(it => ({ ...it, qty: Number(it.qty || 0) }))
    .filter(it => it.qty > 0);

  if (cleanItems.length === 0)
    return res.status(400).json({ error: "La venta no puede quedar vacía." });

  const run = db.transaction(() => {
    let subtotalC = 0;
    const fullItems = cleanItems.map((it) => {
      const p = db.prepare(`SELECT * FROM products WHERE id=?`).get(it.product_id);
      if (!p) throw new Error("Producto inexistente");
      if (p.stock < it.qty) throw new Error(`Stock insuficiente para ${p.name}`);
      const priceC = Math.round(p.price * 100);
      const totalC = priceC * it.qty;
      subtotalC += totalC;
      return {
        product_id: p.id, sku: p.sku, name: p.name,
        price: p.price, qty: it.qty, total: totalC / 100,
      };
    });

    const ivaC = Math.round(subtotalC * 0.16);
    const totalC = subtotalC + ivaC;

    const info = db.prepare(`
      INSERT INTO sales (folio, date, customer_name, payment_method, subtotal, tax, total)
      VALUES (NULL,?,?,?,?,?,?)
    `).run(
      nowLocalStamp(),
      customer_name, payment_method,
      subtotalC / 100, ivaC / 100, totalC / 100
    );

    const saleId = info.lastInsertRowid;
    const folio = "V-" + String(saleId).padStart(4, "0");
    db.prepare(`UPDATE sales SET folio=? WHERE id=?`).run(folio, saleId);

    const ins = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, sku, name, price, qty, total)
      VALUES (?,?,?,?,?,?,?)
    `);
    const upd = db.prepare(`UPDATE products SET stock = stock - ? WHERE id=?`);
    fullItems.forEach((it) => {
      ins.run(saleId, it.product_id, it.sku, it.name, it.price, it.qty, it.total);
      upd.run(it.qty, it.product_id);
    });

    return {
      id: saleId, folio, date: nowLocalStamp(), customer_name, payment_method,
      subtotal: subtotalC / 100, tax: ivaC / 100, total: totalC / 100, items: fullItems,
    };
  });

  try {
    const result = run();
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message || "No se pudo crear la venta" });
  }
});

// eliminar venta (restaurando inventario)
router.delete("/sales/:id(\\d+)", (req, res) => {
  const run = db.transaction(() => {
    const s = db.prepare(`SELECT * FROM sales WHERE id=?`).get(req.params.id);
    if (!s) throw new Error("No existe");

    const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id=?`).all(s.id);
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

// actualizar venta
router.put("/sales/:id(\\d+)", (req, res) => {
  const id = Number(req.params.id);
  const { items, customer_id = null, customer_name = null, payment_method = null, folio = null } = req.body || {};
  const cleanItems = (Array.isArray(items) ? items : [])
    .map(it => ({ ...it, qty: Number(it.qty || 0) }))
    .filter(it => it.qty > 0);

  if (cleanItems.length === 0) return res.status(400).json({ error: "La venta no puede quedar vacía." });

  const run = db.transaction(() => {
    const s = db.prepare(`SELECT * FROM sales WHERE id=?`).get(id);
    if (!s) throw new Error("No existe");

    const orig = db.prepare(`SELECT product_id, qty FROM sale_items WHERE sale_id=?`)
      .all(s.id).reduce((acc, r) => (acc[r.product_id] = r.qty, acc), {});

    let subtotalC = 0;
    const fullItems = cleanItems.map((it) => {
      const p = db.prepare(`SELECT * FROM products WHERE id=?`).get(it.product_id);
      if (!p) throw new Error("Producto inexistente");
      const priceC = Math.round(p.price * 100);
      subtotalC += priceC * it.qty;
      return { product_id: p.id, sku: p.sku, name: p.name, price: p.price, qty: it.qty, total: (priceC * it.qty) / 100 };
    });
    const ivaC = Math.round(subtotalC * 0.16);
    const totalC = subtotalC + ivaC;

    fullItems.forEach((it) => {
      const prev = orig[it.product_id] || 0;
      const diff = it.qty - prev;
      if (diff > 0) {
        const prod = db.prepare(`SELECT stock,name FROM products WHERE id=?`).get(it.product_id);
        if (prod.stock < diff) throw new Error(`Stock insuficiente para ${prod.name}`);
        db.prepare(`UPDATE products SET stock = stock - ? WHERE id=?`).run(diff, it.product_id);
      } else if (diff < 0) {
        db.prepare(`UPDATE products SET stock = stock + ? WHERE id=?`).run(-diff, it.product_id);
      }
      delete orig[it.product_id];
    });

    for (const pid of Object.keys(orig)) {
      db.prepare(`UPDATE products SET stock = stock + ? WHERE id=?`).run(orig[pid], pid);
    }

    db.prepare(`DELETE FROM sale_items WHERE sale_id=?`).run(s.id);
    const ins = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, sku, name, price, qty, total)
      VALUES (?,?,?,?,?,?,?)
    `);
    fullItems.forEach((it) => ins.run(s.id, it.product_id, it.sku, it.name, it.price, it.qty, it.total));

    db.prepare(`
      UPDATE sales
         SET customer_id=?, customer_name=?, payment_method=?,
             subtotal=?, tax=?, total=?, folio=COALESCE(?, folio)
       WHERE id=?
    `).run(
      customer_id ?? s.customer_id,
      customer_name ?? s.customer_name,
      payment_method ?? s.payment_method,
      subtotalC / 100, ivaC / 100, totalC / 100,
      folio, s.id
    );

    return {
      id: s.id, folio: folio ?? s.folio, date: s.date,
      customer_id: customer_id ?? s.customer_id, customer_name: customer_name ?? s.customer_name,
      payment_method: payment_method ?? s.payment_method,
      subtotal: subtotalC / 100, tax: ivaC / 100, total: totalC / 100,
      items: fullItems,
    };
  });

  try {
    const result = run();
    res.status(200).json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


router.get("/sales/by-product/:id", (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ error: "productId inválido" });

  const daysParam = Number(req.query.days);
  const sdParam = req.query.startDate;
  let range = sdParam ? startEndFromStartDate(sdParam)
                      : startEndFromDays(Math.max(1, Math.min(365, daysParam || 30)));
  if (!range) return res.status(400).json({ error: "startDate inválido" });

  const { start, end } = range;

  const p = db.prepare(`SELECT id, name, price FROM products WHERE id=?`).get(productId);
  if (!p) return res.status(404).json({ error: "Producto no existe" });

  const last30 = startEndFromDays(30);
  const lmRow = db.prepare(`
    SELECT SUM(si.qty) AS units
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    WHERE si.product_id = ? AND date(s.date) >= date(?) AND date(s.date) < date(?)
  `).get(productId, last30.start, last30.end);

  const rows = db.prepare(`
    SELECT date(s.date) AS day,
           SUM(si.qty) AS units,
           SUM(si.qty * si.price) AS revenue
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    WHERE si.product_id = ? AND date(s.date) >= date(?) AND date(s.date) < date(?)
    GROUP BY day
    ORDER BY day ASC
  `).all(productId, start, end);

  let daysToFill;
  if (sdParam) {
    const sd = new Date(`${sdParam}T00:00:00Z`);
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const ms = today - sd;
    daysToFill = Math.max(1, Math.min(365, Math.ceil(ms / 86400000)));
  } else {
    daysToFill = Math.max(1, Math.min(365, daysParam || 30));
  }

  const series = fillMissingDays(
    rows.map(r => ({ day: r.day, units: Number(r.units || 0), revenue: Number(r.revenue || 0) })),
    daysToFill
  );

  res.json({
    top: { id: p.id, name: p.name, price: Number(p.price || 0), qty_last_month: Number(lmRow?.units || 0) },
    series
  });
});


router.get("/sales/top-sell", (req, res) => {
  const daysParam = Number(req.query.days);
  const sdParam = req.query.startDate;
  const range = sdParam ? startEndFromStartDate(sdParam)
                        : startEndFromDays(Math.max(1, Math.min(365, daysParam || 30)));
  if (!range) return res.status(400).json({ error: "startDate inválido" });

  const { start, end } = range;

  const topRow = db.prepare(`
    SELECT si.product_id     AS id,
           p.name            AS name,
           p.price           AS price,
           SUM(si.qty)       AS units
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN products p   ON p.id = si.product_id
     WHERE date(s.date) >= date(?) AND date(s.date) < date(?)
     GROUP BY si.product_id
     ORDER BY units DESC
     LIMIT 1
  `).get(start, end);

  if (!topRow) {
    return res.json({ top: null, series: [] });
  }

  const rows = db.prepare(`
    SELECT date(s.date) AS day,
           SUM(si.qty) AS units,
           SUM(si.qty * si.price) AS revenue
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
     WHERE si.product_id = ? AND date(s.date) >= date(?) AND date(s.date) < date(?)
     GROUP BY day
     ORDER BY day ASC
  `).all(topRow.id, start, end);

  let daysToFill;
  if (sdParam) {
    const sd = new Date(`${sdParam}T00:00:00Z`);
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const ms = today - sd;
    daysToFill = Math.max(1, Math.min(365, Math.ceil(ms / 86400000)));
  } else {
    daysToFill = Math.max(1, Math.min(365, daysParam || 30));
  }

  const series = fillMissingDays(
    rows.map(r => ({ day: r.day, units: Number(r.units||0), revenue: Number(r.revenue||0) })),
    daysToFill
  );

  const last30 = startEndFromDays(30);
  const lmRow = db.prepare(`
    SELECT SUM(si.qty) AS units
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
     WHERE si.product_id = ? AND date(s.date) >= date(?) AND date(s.date) < date(?)
  `).get(topRow.id, last30.start, last30.end);

  res.json({
    top: {
      id: topRow.id,
      name: topRow.name,
      price: Number(topRow.price || 0),
      qty_last_month: Number(lmRow?.units || 0),
    },
    series
  });
});

module.exports = router;
