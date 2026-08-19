export function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Gaston — Painel de gastos</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 16px; max-width: 900px; margin-inline: auto; }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  .muted { opacity: .7; font-size: .85rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 16px 0; }
  select, input, button { padding: 8px 10px; border-radius: 8px; border: 1px solid #8884; font-size: .95rem; background: transparent; color: inherit; }
  button { cursor: pointer; font-weight: 600; }
  .total { font-size: 1.6rem; font-weight: 700; margin: 8px 0 20px; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
  @media (min-width: 720px) { .grid { grid-template-columns: 1fr 1fr; } }
  .card { border: 1px solid #8883; border-radius: 12px; padding: 16px; }
  .card h2 { font-size: 1rem; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  td { padding: 4px 0; }
  td.val { text-align: right; font-variant-numeric: tabular-nums; }
  td.pct { text-align: right; opacity: .6; width: 48px; }
  .empty { opacity: .6; padding: 24px 0; text-align: center; }
</style>
</head>
<body>
  <h1>Painel de gastos</h1>
  <div class="muted" id="range-label"></div>

  <div class="controls">
    <select id="mode">
      <option value="month">Este mês</option>
      <option value="pick-month">Mês específico</option>
      <option value="day">Dia</option>
      <option value="range">Intervalo</option>
    </select>
    <input type="month" id="month" style="display:none" />
    <input type="date" id="day" style="display:none" />
    <input type="date" id="from" style="display:none" />
    <input type="date" id="to" style="display:none" />
    <button id="apply">Aplicar</button>
  </div>

  <div class="total" id="total">—</div>

  <div class="grid">
    <div class="card">
      <h2>Por categoria</h2>
      <canvas id="chart-category"></canvas>
      <table id="table-category"></table>
    </div>
    <div class="card">
      <h2>Por mantra</h2>
      <canvas id="chart-mantra"></canvas>
      <table id="table-mantra"></table>
    </div>
  </div>

<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var u = params.get("u");
  var t = params.get("t");
  var charts = {};

  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function brl(cents) {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function el(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function currentRange() {
    var mode = el("mode").value;
    var today = new Date();
    if (mode === "month") {
      var first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: iso(first), to: iso(today) };
    }
    if (mode === "pick-month") {
      var mv = el("month").value;
      if (!mv) return null;
      var parts = mv.split("-");
      var y = Number(parts[0]); var m = Number(parts[1]);
      var start = new Date(y, m - 1, 1);
      var end = new Date(y, m, 0);
      return { from: iso(start), to: iso(end) };
    }
    if (mode === "day") {
      var dv = el("day").value;
      if (!dv) return null;
      return { from: dv, to: dv };
    }
    var f = el("from").value; var to = el("to").value;
    if (!f || !to) return null;
    return { from: f, to: to };
  }

  function syncControls() {
    var mode = el("mode").value;
    el("month").style.display = mode === "pick-month" ? "" : "none";
    el("day").style.display = mode === "day" ? "" : "none";
    el("from").style.display = mode === "range" ? "" : "none";
    el("to").style.display = mode === "range" ? "" : "none";
  }

  function fetchReport(groupBy, range) {
    var qs = "u=" + encodeURIComponent(u) + "&t=" + encodeURIComponent(t) +
      "&group_by=" + groupBy + "&from=" + range.from + "&to=" + range.to;
    return fetch("/api/report?" + qs).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  function renderTable(tableId, report) {
    var table = el(tableId);
    if (!report.rows.length) { table.innerHTML = ""; return; }
    var rows = report.rows.map(function (row) {
      var pct = report.totalCents ? Math.round((row.amountCents / report.totalCents) * 100) : 0;
      return "<tr><td>" + escapeHtml(row.label) + "</td><td class='val'>" + brl(row.amountCents) +
        "</td><td class='pct'>" + pct + "%</td></tr>";
    });
    table.innerHTML = rows.join("");
  }

  function renderChart(canvasId, report) {
    var ctx = el(canvasId);
    if (charts[canvasId]) charts[canvasId].destroy();
    if (!report.rows.length) return;
    charts[canvasId] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: report.rows.map(function (r) { return r.label; }),
        datasets: [{ data: report.rows.map(function (r) { return r.amountCents / 100; }) }]
      },
      options: { plugins: { legend: { position: "bottom" } } }
    });
  }

  function renderEmpty() {
    el("total").textContent = brl(0);
    ["table-category", "table-mantra"].forEach(function (id) { el(id).innerHTML = "<tr><td class='empty'>Nada nesse período.</td></tr>"; });
    ["chart-category", "chart-mantra"].forEach(function (id) { if (charts[id]) charts[id].destroy(); });
  }

  function load() {
    var range = currentRange();
    if (!range) return;
    el("range-label").textContent = range.from === range.to ? range.from : (range.from + " → " + range.to);
    Promise.all([fetchReport("category", range), fetchReport("mantra", range)])
      .then(function (res) {
        var byCategory = res[0]; var byMantra = res[1];
        el("total").textContent = brl(byCategory.totalCents);
        if (!byCategory.totalCents) { renderEmpty(); return; }
        renderChart("chart-category", byCategory);
        renderTable("table-category", byCategory);
        renderChart("chart-mantra", byMantra);
        renderTable("table-mantra", byMantra);
      })
      .catch(function () { el("total").textContent = "Erro ao carregar."; });
  }

  el("mode").addEventListener("change", function () { syncControls(); load(); });
  el("apply").addEventListener("click", load);
  syncControls();
  load();
})();
</script>
</body>
</html>`;
}
