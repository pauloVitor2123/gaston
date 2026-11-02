export function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Gaston — Painel</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root, :root[data-theme="light"] {
    color-scheme: light;
    --bg: #FFFFFF;
    --surface: #F3F3F3;
    --text: #000000;
    --text-muted: #545454;
    --positive: #05A357;
    --negative: #E11900;
    --accent: #276EF1;
    --line: rgba(0, 0, 0, .08);
    --platform-99: #FFC800;
    --platform-other: #8F8F8F, #5E5E5E, #BDBDBD;
    --category: #276EF1, #7356BF, #1E9E8F, #D9731A, #C2408A, #8F8F8F;
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #000000;
    --surface: #141414;
    --text: #FFFFFF;
    --text-muted: #A6A6A6;
    --positive: #06C167;
    --negative: #FF5A47;
    --accent: #5B91F5;
    --line: rgba(255, 255, 255, .1);
    --platform-other: #A6A6A6, #6B6B6B, #D4D4D4;
    --category: #5B91F5, #9B82E0, #3CC4B4, #F0954A, #E36BB0, #A6A6A6;
  }

  * { box-sizing: border-box; }
  html { background: var(--bg); }
  body {
    margin: 0 auto; max-width: 720px; padding: 16px 16px 48px;
    background: var(--bg); color: var(--text);
    font: 400 15px/1.45 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-variant-numeric: tabular-nums;
  }
  button { font: inherit; color: inherit; cursor: pointer; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: var(--text-muted); }
  .small { font-size: 13px; }

  .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .brand { font-size: 20px; font-weight: 700; letter-spacing: -.01em; }
  .icon-btn { width: 40px; height: 40px; border-radius: 12px; border: 0; background: var(--surface); font-size: 18px; }

  .tabs { display: inline-flex; background: var(--surface); border-radius: 12px; padding: 4px; margin: 20px 0 12px; }
  .tabs button { border: 0; background: transparent; padding: 8px 18px; border-radius: 9px; font-weight: 500; color: var(--text-muted); }
  .tabs button[aria-selected="true"] { background: var(--text); color: var(--bg); }

  .nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px; }
  .nav .label { font-weight: 500; text-align: center; flex: 1; }
  .nav button { width: 40px; height: 40px; border-radius: 12px; border: 0; background: var(--surface); font-size: 20px; }
  .nav button:disabled { opacity: .3; cursor: default; }

  .card { background: var(--surface); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  .card h2 { font-size: 15px; font-weight: 700; margin: 0 0 12px; display: flex; justify-content: space-between; align-items: center; }
  .hero-value { font-size: 32px; font-weight: 700; letter-spacing: -.02em; line-height: 1.15; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .pair .card { margin: 0; }
  .value { font-size: 20px; font-weight: 700; }
  .positive { color: var(--positive); }
  .negative { color: var(--negative); }

  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 12px; }
  .stats.highlight { grid-template-columns: 1fr 1fr; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
  .stat .k { font-size: 13px; color: var(--text-muted); }
  .stat .v { font-size: 15px; font-weight: 500; }
  .stats.highlight .v { font-size: 20px; font-weight: 700; }

  .chart-box { position: relative; height: 220px; }
  .doughnut-box { position: relative; height: 200px; margin-bottom: 12px; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; font-size: 13px; color: var(--text-muted); }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 6px 0; border-top: 1px solid var(--line); }
  tr:first-child td { border-top: 0; }
  td.val { text-align: right; font-weight: 500; }
  td.pct { text-align: right; width: 48px; color: var(--text-muted); }
  tr.drill { cursor: pointer; }
  .chip-btn { border: 0; background: var(--bg); border-radius: 9px; padding: 4px 10px; font-size: 13px; font-weight: 500; }

  .badge { font-size: 13px; font-weight: 500; color: var(--accent); }
  .insight { padding: 12px 0; border-top: 1px solid var(--line); }
  .insight:first-child { border-top: 0; padding-top: 0; }
  .insight .h { font-weight: 500; margin: 0 0 4px; }
  .insight .s { margin: 0; color: var(--text-muted); }
  .insight .s::before { content: "→ "; color: var(--accent); }

  .empty { color: var(--text-muted); text-align: center; padding: 24px 0; font-size: 13px; }
  .hint { color: var(--text-muted); font-size: 13px; margin: 12px 0 0; }
  .error { color: var(--negative); text-align: center; padding: 32px 0; }
  [hidden] { display: none !important; }

  @media (max-width: 420px) {
    .stats { grid-template-columns: 1fr 1fr; }
    .hero-value { font-size: 28px; }
  }
</style>
</head>
<body>
  <div class="top">
    <div class="brand">Gaston</div>
    <button class="icon-btn" id="theme" aria-label="Alternar tema">◐</button>
  </div>

  <div class="tabs" role="tablist">
    <button role="tab" id="tab-week" aria-selected="true">Semana</button>
    <button role="tab" id="tab-month" aria-selected="false">Mês</button>
  </div>

  <div class="nav">
    <button id="prev" aria-label="Período anterior">‹</button>
    <div class="label" id="period-label">—</div>
    <button id="next" aria-label="Próximo período">›</button>
  </div>

  <div id="error" class="error" hidden>Não deu pra carregar o painel. Tente de novo.</div>

  <main id="content">
    <section class="card">
      <div class="muted small">Lucro</div>
      <div class="hero-value num" id="profit">—</div>
    </section>
    <div class="pair">
      <section class="card">
        <div class="muted small">Receita</div>
        <div class="value num positive" id="income">—</div>
      </section>
      <section class="card">
        <div class="muted small">Gastos</div>
        <div class="value num negative" id="expense">—</div>
      </section>
    </div>

    <section class="card" id="daily-card">
      <h2>Ganho por dia</h2>
      <div class="chart-box"><canvas id="chart-daily"></canvas></div>
      <div class="legend" id="daily-legend"></div>
      <p class="hint" id="best-day"></p>
    </section>

    <section class="card">
      <h2>Produtividade</h2>
      <div class="stats highlight">
        <div class="stat"><div class="k">Ganho por hora</div><div class="v num" id="gross-hour">—</div></div>
        <div class="stat"><div class="k">Ganho por km</div><div class="v num" id="gross-km">—</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">Lucro por hora</div><div class="v num" id="profit-hour">—</div></div>
        <div class="stat"><div class="k">Lucro por km</div><div class="v num" id="profit-km">—</div></div>
        <div class="stat"><div class="k">Tempo online</div><div class="v num" id="online">—</div></div>
        <div class="stat"><div class="k">Km rodados</div><div class="v num" id="km">—</div></div>
        <div class="stat"><div class="k">Corridas</div><div class="v num" id="rides">—</div></div>
        <div class="stat"><div class="k">Tempo por corrida</div><div class="v num" id="ride-minutes">—</div></div>
        <div class="stat"><div class="k">Valor por corrida</div><div class="v num" id="ride-value">—</div></div>
        <div class="stat"><div class="k">Km por corrida</div><div class="v num" id="ride-km">—</div></div>
      </div>
      <p class="hint" id="effort-hint" hidden>Pra ver ganho por hora e por km, conte sua jornada no chat: “rodei 200km, 9h online, 18 corridas”.</p>
    </section>

    <section class="card">
      <h2><span id="category-title">Gastos por categoria</span><button class="chip-btn" id="cat-back" hidden>← voltar</button></h2>
      <div class="doughnut-box" id="category-chart-box"><canvas id="chart-category"></canvas></div>
      <table id="table-category"></table>
    </section>

    <section class="card" id="insights" hidden>
      <h2>Insights da semana <span class="badge">IA</span></h2>
      <div id="insights-body"></div>
      <p class="hint">Sugestões geradas por IA a partir dos seus números. Não é orientação de especialista.</p>
    </section>
  </main>

<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  var u = params.get("u");
  var t = params.get("t");
  var WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var state = { view: "week", anchor: startOfWeek(localToday()), report: null, drill: null, requestId: 0 };
  var charts = {};

  function el(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function localToday() { var d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }
  function iso(d) { return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function parseIso(s) { var p = s.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
  function startOfWeek(d) { return addDays(d, -((d.getUTCDay() + 6) % 7)); }
  function startOfMonth(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
  function addMonths(d, n) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)); }
  function periodStart(d) { return state.view === "week" ? startOfWeek(d) : startOfMonth(d); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function brl(cents) { return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function brlShort(value) { return "R$ " + Math.round(value).toLocaleString("pt-BR"); }
  function perUnit(cents, unit) { return cents === null ? "—" : brl(cents) + "/" + unit; }
  function duration(min) { return min === null ? "—" : Math.floor(min / 60) + "h" + pad(min % 60); }
  function km(v) { return v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km"; }
  function count(v) { return v === null ? "—" : v.toLocaleString("pt-BR"); }
  function dayMonth(d) { return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); }
  function dayParts(s) { var d = parseIso(s); return [WEEKDAYS[d.getUTCDay()], pad(d.getUTCDate())]; }
  function dayLabel(s) { return dayParts(s).join(" "); }

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function cssList(name) { return cssVar(name).split(",").map(function (s) { return s.trim(); }); }

  function platformColor(label, index) {
    var key = label.toLowerCase();
    if (key === "uber") return cssVar("--text");
    if (key === "99") return cssVar("--platform-99");
    var grays = cssList("--platform-other");
    return grays[index % grays.length];
  }

  function periodLabel() {
    if (state.view === "month") {
      var m = state.anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
      return m.charAt(0).toUpperCase() + m.slice(1);
    }
    return dayMonth(state.anchor) + " – " + dayMonth(addDays(state.anchor, 6));
  }

  function fetchReport() {
    var period = state.view === "week" ? "week=" + iso(state.anchor) : "month=" + iso(state.anchor).slice(0, 7);
    var qs = "u=" + encodeURIComponent(u) + "&t=" + encodeURIComponent(t) + "&" + period;
    return fetch("/api/report?" + qs).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

  function renderTotals(r) {
    el("income").textContent = brl(r.incomeCents);
    el("expense").textContent = brl(r.expenseCents);
    var profit = el("profit");
    profit.textContent = brl(r.profitCents);
    profit.className = "hero-value num" + (r.profitCents < 0 ? " negative" : "");
  }

  function platformsOf(r) {
    var seen = [];
    r.days.forEach(function (d) {
      d.platforms.forEach(function (p) { if (seen.indexOf(p.label) < 0) seen.push(p.label); });
    });
    return seen;
  }

  function renderDaily(r) {
    var card = el("daily-card");
    destroy("daily");
    card.hidden = r.view !== "week";
    if (card.hidden) return;

    var labels = platformsOf(r);
    var bestIndex = r.bestDay ? r.days.map(function (d) { return d.date; }).indexOf(r.bestDay.date) : -1;
    var muted = cssVar("--text-muted");
    var text = cssVar("--text");
    var line = cssVar("--line");
    var grayIndex = 0;
    var colors = labels.map(function (label) {
      var key = label.toLowerCase();
      return platformColor(label, key === "uber" || key === "99" ? 0 : grayIndex++);
    });

    el("daily-legend").innerHTML = labels.map(function (label, i) {
      return "<span><i class='swatch' style='background:" + colors[i] + "'></i>" + escapeHtml(label) + "</span>";
    }).join("");
    el("best-day").textContent = r.bestDay ? "Melhor dia: " + dayLabel(r.bestDay.date) + " · " + brl(r.bestDay.incomeCents) : "Sem receita nesta semana.";

    var series = labels.map(function (label) {
      return r.days.map(function (d) {
        var hit = d.platforms.filter(function (p) { return p.label === label; })[0];
        return hit ? hit.amountCents / 100 : 0;
      });
    });
    function isTopSegment(datasetIndex, dayIndex) {
      for (var i = datasetIndex + 1; i < series.length; i++) if (series[i][dayIndex] > 0) return false;
      return true;
    }

    charts.daily = new Chart(el("chart-daily"), {
      type: "bar",
      data: {
        labels: r.days.map(function (d) { return dayParts(d.date); }),
        datasets: labels.map(function (label, i) {
          return {
            label: label,
            data: series[i],
            backgroundColor: colors[i],
            borderRadius: function (c) { return isTopSegment(c.datasetIndex, c.dataIndex) ? { topLeft: 6, topRight: 6 } : 0; },
            borderSkipped: false,
            maxBarThickness: 36
          };
        })
      },
      options: {
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ": " + brl(Math.round(c.parsed.y * 100)); } } }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: {
              maxRotation: 0,
              autoSkip: false,
              color: function (c) { return c.index === bestIndex ? text : muted; },
              font: function (c) { return { family: "Inter", size: 13, weight: c.index === bestIndex ? 700 : 400 }; }
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: line },
            border: { display: false },
            ticks: { color: muted, font: { family: "Inter", size: 13 }, maxTicksLimit: 5, callback: brlShort }
          }
        }
      }
    });
  }

  function renderProductivity(r) {
    var p = r.productivity;
    el("gross-hour").textContent = perUnit(p.grossPerHourCents, "h");
    el("gross-km").textContent = perUnit(p.grossPerKmCents, "km");
    el("profit-hour").textContent = perUnit(p.profitPerHourCents, "h");
    el("profit-km").textContent = perUnit(p.profitPerKmCents, "km");
    el("online").textContent = duration(p.onlineMinutes);
    el("km").textContent = km(p.km);
    el("rides").textContent = count(p.rides);
    el("ride-minutes").textContent = p.avgRideMinutes === null ? "—" : p.avgRideMinutes + " min";
    el("ride-value").textContent = p.avgRideValueCents === null ? "—" : brl(p.avgRideValueCents);
    el("ride-km").textContent = km(p.avgRideKm);
    el("effort-hint").hidden = p.km !== null || p.onlineMinutes !== null || p.rides !== null;
  }

  function renderCategoryTable(report, drillable) {
    var table = el("table-category");
    var colors = cssList("--category");
    table.innerHTML = report.rows.map(function (row, i) {
      var pct = report.totalCents ? Math.round((row.amountCents / report.totalCents) * 100) : 0;
      var canDrill = drillable && row.subcategories && row.subcategories.length;
      return "<tr" + (canDrill ? " class='drill' data-label='" + escapeHtml(row.label) + "'" : "") + ">" +
        "<td><i class='swatch' style='background:" + colors[i % colors.length] + "'></i>" + escapeHtml(row.label) + (canDrill ? " ›" : "") + "</td>" +
        "<td class='val num'>" + brl(row.amountCents) + "</td><td class='pct num'>" + pct + "%</td></tr>";
    }).join("");
    Array.prototype.forEach.call(table.querySelectorAll("tr.drill"), function (tr) {
      tr.addEventListener("click", function () { state.drill = tr.getAttribute("data-label"); renderCategory(); });
    });
  }

  function renderCategory() {
    var r = state.report;
    destroy("category");
    var report = r.categories;
    if (state.drill) {
      var cat = report.rows.filter(function (row) { return row.label === state.drill; })[0];
      report = { rows: (cat && cat.subcategories) || [], totalCents: cat ? cat.amountCents : 0 };
    }
    el("cat-back").hidden = !state.drill;
    el("category-title").textContent = state.drill ? state.drill : "Gastos por categoria";
    el("category-chart-box").hidden = !report.rows.length;
    if (!report.rows.length) {
      el("table-category").innerHTML = "<tr><td class='empty'>Nenhum gasto neste período.</td></tr>";
      return;
    }
    renderCategoryTable(report, !state.drill);
    charts.category = new Chart(el("chart-category"), {
      type: "doughnut",
      data: {
        labels: report.rows.map(function (row) { return row.label; }),
        datasets: [{
          data: report.rows.map(function (row) { return row.amountCents / 100; }),
          backgroundColor: cssList("--category"),
          borderColor: cssVar("--surface"),
          borderWidth: 2
        }]
      },
      options: {
        maintainAspectRatio: false,
        animation: false,
        cutout: "62%",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return c.label + ": " + brl(Math.round(c.parsed * 100)); } } }
        },
        onClick: function (evt, els) {
          if (state.drill || !els.length) return;
          var row = report.rows[els[0].index];
          if (row && row.subcategories && row.subcategories.length) { state.drill = row.label; renderCategory(); }
        }
      }
    });
  }

  var INSIGHT_MESSAGES = {
    loading: "Gerando insights…",
    insufficient_data: "Registre receita e jornada (km, horas online ou corridas) desta semana para receber insights.",
    unavailable: "Os insights não estão disponíveis agora. Tente abrir o painel mais tarde."
  };

  function renderInsightMessage(key) {
    el("insights-body").innerHTML = "<p class='empty'>" + INSIGHT_MESSAGES[key] + "</p>";
  }

  function loadInsights(requestId) {
    var card = el("insights");
    card.hidden = state.view !== "week";
    if (card.hidden) return;
    renderInsightMessage("loading");
    var qs = "u=" + encodeURIComponent(u) + "&t=" + encodeURIComponent(t) + "&week=" + iso(state.anchor);
    fetch("/api/insights?" + qs)
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (result) {
        if (requestId !== state.requestId) return;
        if (result.status !== "ready") { renderInsightMessage(result.status === "insufficient_data" ? "insufficient_data" : "unavailable"); return; }
        el("insights-body").innerHTML = result.items.map(function (item) {
          return "<div class='insight'><p class='h'>" + escapeHtml(item.hypothesis) + "</p><p class='s'>" + escapeHtml(item.suggestion) + "</p></div>";
        }).join("");
      })
      .catch(function () { if (requestId === state.requestId) renderInsightMessage("unavailable"); });
  }

  function render() {
    var r = state.report;
    if (!r) return;
    renderTotals(r);
    renderDaily(r);
    renderProductivity(r);
    renderCategory();
  }

  function syncNav() {
    el("period-label").textContent = periodLabel();
    el("next").disabled = state.anchor.getTime() >= periodStart(localToday()).getTime();
    el("tab-week").setAttribute("aria-selected", String(state.view === "week"));
    el("tab-month").setAttribute("aria-selected", String(state.view === "month"));
  }

  function load() {
    syncNav();
    state.drill = null;
    var requestId = ++state.requestId;
    loadInsights(requestId);
    fetchReport()
      .then(function (report) {
        if (requestId !== state.requestId) return;
        state.report = report;
        el("error").hidden = true;
        el("content").hidden = false;
        render();
      })
      .catch(function () {
        el("error").hidden = false;
        el("content").hidden = true;
      });
  }

  function move(step) {
    state.anchor = state.view === "week" ? addDays(state.anchor, 7 * step) : addMonths(state.anchor, step);
    load();
  }

  function switchView(view) {
    if (state.view === view) return;
    var today = localToday();
    var reference = state.view === "week" && state.anchor.getTime() < startOfWeek(today).getTime() ? state.anchor : today;
    state.view = view;
    state.anchor = periodStart(reference);
    load();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("gaston-theme", theme); } catch (e) {}
    Chart.defaults.font.family = "Inter";
    render();
  }

  try {
    var saved = localStorage.getItem("gaston-theme");
    if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  } catch (e) {}
  Chart.defaults.font.family = "Inter";

  el("prev").addEventListener("click", function () { move(-1); });
  el("next").addEventListener("click", function () { move(1); });
  el("tab-week").addEventListener("click", function () { switchView("week"); });
  el("tab-month").addEventListener("click", function () { switchView("month"); });
  el("cat-back").addEventListener("click", function () { state.drill = null; renderCategory(); });
  el("theme").addEventListener("click", function () {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
  load();
})();
</script>
</body>
</html>`;
}
