(function () {
  "use strict";

  const state = {
    payload: null,
    range: 30,
    currentProductId: null,
    products: [],
    firstLoadDone: false,
    _visibleSlice: [],
  };

  const money = (n) => {
    const v = Number(n || 0);
    try {
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
      }).format(v);
    } catch {
      return `$${v.toFixed(2)}`;
    }
  };

  const apiCall =
    typeof window.api === "function"
      ? window.api
      : async function (path, { method = "GET", body, auth = true } = {}) {
          const headers = { "Content-Type": "application/json" };
          const token =
            localStorage.getItem("pos_token") || localStorage.getItem("token");
          if (auth && token) headers.Authorization = "Bearer " + token;
          const res = await fetch((window.API_BASE || "") + path, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });
          const txt = await res.text().catch(() => "");
          if (!res.ok) throw new Error(txt || `Error API ${res.status}`);
          return txt ? JSON.parse(txt) : null;
        };

function showLoadingState(hard = true) {
  const chart = document.getElementById("topSellCanvas");
  if (chart) chart.style.opacity = hard ? "0.5" : "0.7";

   if (hard) {
    const ids = ["avgTicket", "sumSales", "sumRevenue"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.dataset.prev = el.textContent;
      el.textContent = "—"; 
      el.classList.add("muted"); 
    });
  }
}

function hideLoadingState() {
  const chart = document.getElementById("topSellCanvas");
  if (chart) chart.style.opacity = "1";
  ["avgTicket", "sumSales", "sumRevenue"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("muted");
  });
}

  function showError(message) {
    hideElement("topSellEmpty");
    hideElement("topSellCanvas");
    const errorEl = document.getElementById("topSellError");
    const errorMessage = document.getElementById("errorMessage");
    if (errorEl && errorMessage) {
      errorMessage.textContent = message;
      errorEl.style.display = "flex";
    }
  }

  function hideError() {
    const errorEl = document.getElementById("topSellError");
    if (errorEl) errorEl.style.display = "none";
  }

  const hideElement = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  };
  const showElement = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "block";
  };

  function showNotification(message, type = "info") {
    console.log(`${type}: ${message}`);
  }

  function computeStats(seriesSlice, unitPrice) {
    const hasRevenue = seriesSlice.some((s) => s.revenue != null);
    const units = seriesSlice.reduce((a, s) => a + Number(s.total || 0), 0);

    const revenue = hasRevenue
      ? seriesSlice.reduce((a, s) => a + Number(s.revenue || 0), 0)
      : units * Number(unitPrice || 0);

    const candidates = ["orders", "tickets", "receipts", "count_orders", "count"];
    let tickets = 0;
    for (const f of candidates) {
      const sum = seriesSlice.reduce((a, s) => a + Number(s[f] || 0), 0);
      if (sum > 0) {
        tickets = sum;
        break;
      }
    }
    if (tickets === 0) {
      tickets = seriesSlice.filter((s) => Number(s.total || 0) > 0).length;
    }

    const avg = tickets > 0 ? revenue / tickets : 0;
    return { sales: units, revenue, avg };
  }

  let tsChart = null;

  function gradientBG(ctx) {
    const { chartArea } = ctx.chart;
    if (!chartArea) return "rgba(37,99,235,0.25)";
    const g = ctx.chart.ctx.createLinearGradient(
      0,
      chartArea.top,
      0,
      chartArea.bottom
    );
    g.addColorStop(0, "rgba(37,99,235,0.45)");
    g.addColorStop(1, "rgba(37,99,235,0.06)");
    return g;
  }

  function ensureChart(canvas) {
    if (tsChart) return tsChart;

    const ctx = canvas.getContext("2d");
    tsChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Ventas",
            data: [],
            tension: 0.36,
            borderWidth: 2,
            borderColor: "#2563eb",
            fill: true,
            backgroundColor: gradientBG,
            pointRadius: 2.5,
            pointHoverRadius: 4,
            pointHitRadius: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 160, easing: "easeOutQuart" },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15,23,42,0.92)",
            padding: 10,
            cornerRadius: 8,
            titleColor: "#cbd5e1",
            bodyColor: "#fff",
            displayColors: false,
            callbacks: {
              title(items) {
                return items[0]?.label || "";
              },
              label(item) {
                const v = Number(item.parsed.y || 0);
                return `${v} ${v === 1 ? "venta" : "ventas"}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: "var(--grid)", drawBorder: false },
            ticks: { color: "var(--txt-subtle)", maxTicksLimit: 6 },
          },
          y: {
            beginAtZero: true,
            grid: { color: "var(--grid-strong)", drawBorder: false },
            ticks: {
              color: "var(--txt-subtle)",
              precision: 0,
              callback: (v) => Number(v).toFixed(0),
            },
          },
        },
      },
    });

    return tsChart;
  }

  function updateChart(canvas, labelsFull, values, animate = true) {
    const chart = ensureChart(canvas);
    const labelsShort = labelsFull.map((l) => String(l).slice(5));

    chart.data.labels = labelsShort;
    chart.options.plugins.tooltip.callbacks.title = (items) => {
      const i = items[0]?.dataIndex ?? 0;
      return labelsFull[i] || "";
    };
    chart.options.animation.duration = animate ? 160 : 0;

    chart.data.datasets[0].data = values;
    chart.update("active");
  }

  function toDate(s) {
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function sortByDateAsc(arr) {
    arr.sort((a, b) => {
      const da = toDate(a.label || a.date || a.day);
      const db = toDate(b.label || b.date || b.day);
      return (da?.getTime?.() || 0) - (db?.getTime?.() || 0);
    });
    return arr;
  }

  function looksCumulative(vals) {
    if (vals.length < 3) return false;
    let nonDec = true;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] < vals[i - 1]) {
        nonDec = false;
        break;
      }
    }
    const sum = vals.reduce((a, b) => a + b, 0);
    const last = vals[vals.length - 1];
    return nonDec && sum > last * 1.8;
  }

  function cumulativeToDaily(vals) {
    if (!vals.length) return vals;
    const out = new Array(vals.length);
    out[0] = vals[0];
    for (let i = 1; i < vals.length; i++)
      out[i] = Math.max(0, vals[i] - vals[i - 1]);
    return out;
  }

  function normalizeToDaily(arr) {
    if (!Array.isArray(arr) || !arr.length) return [];
    const clone = sortByDateAsc([...arr]);
    const raw = clone.map((s) => Number(s.total ?? s.units ?? 0));
    const daily = looksCumulative(raw) ? cumulativeToDaily(raw) : raw;
    return clone.map((s, i) => ({
      ...s,
      total: daily[i],
    }));
  }

  function getPreviousWindowDaily(fullSeries, n) {
    if (!Array.isArray(fullSeries) || fullSeries.length < n * 2) return null;
    const last60 = fullSeries.slice(-2 * n);
    const prevRaw = last60.slice(0, n);
    return normalizeToDaily(prevRaw);
  }

  function filterByDateRange(series, days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return series.filter((item) => {
      const itemDate = new Date(item.label || item.date || item.day);
      return itemDate >= cutoffDate;
    });
  }

  async function loadProducts() {
    const selector = document.getElementById("productSelector");
    try {
      const products = await apiCall("/api/products");
      const list = Array.isArray(products) ? products.slice(0, 50) : [];
      state.products = list;

      if (!selector) return;

      if (state.products.length > 0) {
        selector.innerHTML = "";
        state.products.forEach((product) => {
          const option = document.createElement("option");
          option.value = product.id;
          option.textContent = `${product.name} - ${money(product.price)}`;
          selector.appendChild(option);
        });

        if (!state.currentProductId) {
          state.currentProductId = state.products[0].id;
          selector.value = state.currentProductId;
        }
        selector.style.display = "block";
        selector.disabled = false;
      } else {
        selector.style.display = "none";
        selector.disabled = true;
      }
    } catch {
      if (selector) {
        selector.style.display = "none";
        selector.disabled = true;
      }
    }
  }

  async function loadProductData(productId, range, { hardLoader = false } = {}) {
    try {
      if (hardLoader || !state.firstLoadDone) showLoadingState(true);
      else showLoadingState(false);

      // Calcular fecha de inicio (hoy - range días)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - range);
      const formattedDate = startDate.toISOString().split("T")[0];

      let endpoint = productId
        ? `/api/sales/by-product/${productId}?startDate=${formattedDate}`
        : `/api/sales/top-sell?startDate=${formattedDate}`;

      let payload;
      try {
        payload = await apiCall(endpoint);
      } catch {
        endpoint = productId
          ? `/api/sales/by-product/${productId}?days=${range}`
          : `/api/sales/top-sell?days=${range}`;
        payload = await apiCall(endpoint);
      }

      state.payload = payload || {};
      state.firstLoadDone = true;
      return payload;
    } catch (error) {
      console.error("Error loading product data:", error);
      throw error;
    } finally {
      hideLoadingState();
    }
  }

  function setHeader(top) {
    const infoEl = document.getElementById("topSellInfo");
    if (infoEl && top) {
      const title = top.name || `Producto #${top.id}`;
      const qty = Number(top.qty_last_month || 0);
      infoEl.innerHTML = `${title} &middot; <strong>${qty}</strong> ventas último mes &middot; Precio: <strong>${money(
        top.price
      )}</strong>`;
    } else if (infoEl) {
      infoEl.textContent = "Producto más vendido";
    }
  }

  function setChips(seriesSlice, price) {
    const { sales, revenue, avg } = computeStats(seriesSlice, price);
    const sumSalesEl = document.getElementById("sumSales");
    const sumRevenueEl = document.getElementById("sumRevenue");
    const avgTicketEl = document.getElementById("avgTicket");

    if (sumSalesEl) sumSalesEl.textContent = sales.toLocaleString("es-MX");
    if (sumRevenueEl) sumRevenueEl.textContent = money(revenue);
    if (avgTicketEl) avgTicketEl.textContent = money(avg);
  }

  function updateComparisonBadge(comparison) {
    const badge = document.getElementById("comparisonBadge");
    const value = document.getElementById("comparisonValue");
    if (!badge || !value) return;

    if (comparison === null) {
      badge.style.display = "none";
      return;
    }

    const absTxt = `${Math.abs(comparison).toFixed(0)}%`;
    badge.style.display = "inline-flex";

    if (comparison > 0) {
      badge.className = "comparison-badge comparison-up";
    } else if (comparison < 0) {
      badge.className = "comparison-badge comparison-down";
    } else {
      badge.className = "comparison-badge";
    }
    value.textContent = absTxt;
  }

  function applyRangeAndRender({ animate = true } = {}) {
    const canvas = document.getElementById("topSellCanvas");
    const emptyEl = document.getElementById("topSellEmpty");
    const payload = state.payload || {};
    const top = payload.top;
    let series = Array.isArray(payload.series) ? [...payload.series] : [];

    series = filterByDateRange(series, state.range);
    const seriesDaily = normalizeToDaily(series);

    if (!top || !seriesDaily.length) {
      setHeader(top || null);
      setChips([], top?.price);
      updateComparisonBadge(null);

      if (emptyEl) emptyEl.style.display = "flex";
      if (canvas) canvas.style.display = "none";
      const exportBtn = document.getElementById("btnExport");
      if (exportBtn) exportBtn.disabled = true;
      if (tsChart) {
        tsChart.data.datasets[0].data = [];
        tsChart.update("none");
      }
      return;
    }

    const allZero = seriesDaily.every((s) => Number(s.total || 0) === 0);
    if (allZero) {
      setHeader(top);
      setChips(seriesDaily, top.price); 
      updateComparisonBadge(null);
      if (emptyEl) emptyEl.style.display = "flex";
      if (canvas) canvas.style.display = "none";
      const exportBtn = document.getElementById("btnExport");
      if (exportBtn) exportBtn.disabled = true;
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";
    if (canvas) canvas.style.display = "block";

    setChips(seriesDaily, top.price);

    const prevWindowDaily = getPreviousWindowDaily(payload.series, state.range);
    updateComparisonBadge(
      prevWindowDaily ? calculateComparison(seriesDaily, prevWindowDaily) : null
    );

    const labelsFull = seriesDaily.map((s) => s.label || s.date || s.day || "");
    const values = seriesDaily.map((s) => Number(s.total || 0));
    updateChart(canvas, labelsFull, values, animate);

    const exportBtn = document.getElementById("btnExport");
    if (exportBtn) exportBtn.disabled = false;

    state._visibleSlice = seriesDaily;
  }

  function calculateComparison(currentDaily, previousDaily) {
    if (!previousDaily || !currentDaily.length || !previousDaily.length)
      return null;

    const currentTotal = currentDaily.reduce(
      (sum, d) => sum + Number(d.total || 0),
      0
    );
    const previousTotal = previousDaily.reduce(
      (sum, d) => sum + Number(d.total || 0),
      0
    );

    if (previousTotal === 0) return currentTotal > 0 ? 100 : 0;
    return ((currentTotal - previousTotal) / previousTotal) * 100;
  }

  function bindRangeButtons() {
    const btns = document.querySelectorAll(".btn-range");
    btns.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const n = Number(btn.dataset.range);
        state.range = [7, 14, 30].includes(n) ? n : 30;

        btns.forEach((b) => {
          b.setAttribute("aria-pressed", String(b === btn));
          b.classList.toggle("active", b === btn);
        });

        try {
          await loadProductData(state.currentProductId, state.range, {
            hardLoader: false,
          });
          applyRangeAndRender({ animate: false });
        } catch (error) {
          console.error("Error changing range:", error);
        }
      });
    });
  }

  function bindProductSelector() {
    const selector = document.getElementById("productSelector");
    if (!selector) return;

    selector.addEventListener("change", async (e) => {
      const val = (e.target.value || "").trim();
      state.currentProductId = val ? val : null; 
      try {
        await loadProductData(state.currentProductId, state.range, {
          hardLoader: true,
        });
        applyRangeAndRender({ animate: true });
      } catch (error) {
        console.error("Error changing product:", error);
      }
    });
  }

  function bindRefreshButton() {
    const btn = document.getElementById("btnRefresh");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const icon = btn.querySelector("i");
      if (icon) icon.classList.add("fa-spin");

      try {
        await loadProducts();
        await loadProductData(state.currentProductId, state.range, {
          hardLoader: true,
        });
        applyRangeAndRender({ animate: true });
        showNotification("Datos actualizados correctamente", "success");
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        setTimeout(() => {
          if (icon) icon.classList.remove("fa-spin");
        }, 800);
      }
    });
  }

  function bindExportButton() {
    const btn = document.getElementById("btnExport");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const slice = state._visibleSlice || [];
      if (!slice.length) {
        showNotification("No hay datos para exportar", "warning");
        return;
      }

      const headers = ["Fecha", "Ventas", "Ingresos"];
      const top = state.payload?.top || {};
      const rows = slice.map((item) => [
        item.label || item.date || item.day || "",
        item.total || 0,
        item.revenue || item.total * (top.price || 0),
      ]);

      const csvContent = [headers, ...rows].map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ventas-${top.name || "producto"}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      showNotification("Datos exportados correctamente", "success");
    });
  }

  function bindRetryButton() {
    const btn = document.getElementById("btnRetry");
    if (!btn) return;
    btn.addEventListener("click", initTopSell);
  }

  async function initTopSell() {
    const infoEl = document.getElementById("topSellInfo");
    const card = document.getElementById("topSellCard");
    const canvas = document.getElementById("topSellCanvas");

    try {
      hideError();
      if (infoEl)
        infoEl.innerHTML =
          '<span class="skeleton" style="width: 320px; height: 20px;"></span>';

      await loadProducts(); 
      await loadProductData(state.currentProductId, state.range, {
        hardLoader: true,
      });

      const top = state.payload?.top;
      ensureChart(canvas);

      if (!top) {
        setHeader(null);
        setChips([], 0);
        updateComparisonBadge(null);
        const emptyEl = document.getElementById("topSellEmpty");
        if (emptyEl) emptyEl.style.display = "flex";
        if (canvas) canvas.style.display = "none";
        return;
      }

      setHeader(top);
      applyRangeAndRender({ animate: true });

      if (card) {
        const ro = new ResizeObserver(() => {
          if (tsChart) tsChart.resize();
        });
        ro.observe(card);
      }
    } catch (e) {
      console.error(e);
      showError(
        "No se pudo cargar el Top Sell. Verifica tu conexión e intenta nuevamente."
      );
      if (tsChart) {
        tsChart.data.datasets[0].data = [];
        tsChart.update("none");
      }
    }
    
    bindRangeButtons();
    bindProductSelector();
    bindRefreshButton();
    bindExportButton();
    bindRetryButton();
  }

  window.addEventListener("load", initTopSell);
})();
