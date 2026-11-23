(function () {
  "use strict";

  const VERSION = "equity-ui-annual-v1";

  const state = {
    symbol: "",
    name: "",
    query: "",
    data: null,
    results: [],
    loading: false,
    error: "",
    searching: false
  };

  let root = null;
  let timer = null;
  let searchController = null;
  let companyController = null;
  let searchSequence = 0;

  const isNumber = value =>
    typeof value === "number" && Number.isFinite(value);

  const escapeHtml = value =>
    String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);

  const divide = (numerator, denominator) =>
    isNumber(numerator) &&
    isNumber(denominator) &&
    denominator > 0
      ? numerator / denominator
      : null;

  const subtract = (a, b) =>
    isNumber(a) && isNumber(b) ? a - b : null;

  const add = (a, b) =>
    isNumber(a) && isNumber(b) ? a + b : null;

  const averagePositive = (a, b) =>
    isNumber(a) && isNumber(b) && a > 0 && b > 0
      ? (a + b) / 2
      : null;

  function decimal(value, places = 2) {
    return new Intl.NumberFormat("en-GB", {
      minimumFractionDigits: places,
      maximumFractionDigits: places
    }).format(value);
  }

  function compact(value) {
    if (!isNumber(value)) return "—";

    const absolute = Math.abs(value);

    if (absolute >= 1e12) return decimal(value / 1e12) + "T";
    if (absolute >= 1e9) return decimal(value / 1e9) + "B";
    if (absolute >= 1e6) return decimal(value / 1e6) + "M";
    if (absolute >= 1e3) return decimal(value / 1e3) + "K";

    return decimal(value);
  }

  function date(value) {
    if (!value) return "—";

    const parsed = new Date(
      String(value).length === 10 ? value + "T00:00:00Z" : value
    );

    if (!Number.isFinite(parsed.getTime())) return "—";

    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(parsed);
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);

      return url.protocol === "https:" &&
        !url.username &&
        !url.password
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function link(url, label) {
    const safe = safeUrl(url);

    return safe
      ? `<a href="${escapeHtml(safe)}"
            target="_blank"
            rel="noopener noreferrer">${escapeHtml(label)}</a>`
      : escapeHtml(label);
  }

  function apiBase() {
    const configured = String(window.KETONDA_EQUITY_API || "").trim();

    if (!configured || configured.startsWith("__PORT_")) return "";

    return configured.replace(/\/+$/, "");
  }

  async function api(path, signal) {
    const response = await fetch(
      apiBase() + "/api/equity/" + path,
      {
        signal,
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      }
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        body?.detail || `The company service returned HTTP ${response.status}.`
      );
    }

    if (!body || typeof body !== "object") {
      throw new Error("The company service returned an invalid response.");
    }

    return body;
  }

  function normalisePeriod(period) {
    const values = period.values || period;
    const end = period.end || period.periodEnd || "";

    return {
      ...period,
      end,
      year: period.year || Number(end.slice(0, 4)),
      label: period.label || `Year ended ${date(end)}`,
      values: {
        ...values,
        revenue: values.revenue ?? null,
        grossProfit: values.grossProfit ?? null,
        ebit: values.ebit ?? values.operatingIncome ?? null,
        netIncome: values.netIncome ?? null,
        assets: values.assets ?? values.totalAssets ?? null,
        liabilities: values.liabilities ?? values.totalLiabilities ?? null,
        equity: values.equity ?? values.totalEquity ?? null,
        currentAssets: values.currentAssets ?? null,
        currentLiabilities: values.currentLiabilities ?? null,
        cash: values.cash ?? null,
        ocf: values.ocf ?? values.operatingCashFlow ?? null,
        capex: values.capex ?? values.capitalExpenditure ?? null
      }
    };
  }

  function annualPeriods(data) {
    return (data?.annual?.periods || [])
      .map(normalisePeriod)
      .filter(period => period.end)
      .sort((a, b) => b.end.localeCompare(a.end));
  }

  function adjacentAnnual(a, b) {
    if (!a || !b) return false;

    const gap = (Date.parse(a.end) - Date.parse(b.end)) / 86400000;

    return gap >= 320 && gap <= 410;
  }

  function selectPeriods(data, mode = "annual") {
    const list = mode === "annual"
      ? annualPeriods(data)
      : (data?.quarterly?.periods || [])
          .map(normalisePeriod)
          .sort((a, b) => b.end.localeCompare(a.end));

    const first = list[0] || null;
    const prev = mode === "annual"
      ? list.find(period => adjacentAnnual(first, period)) || null
      : list[1] || null;
    const earlier = mode === "annual"
      ? list.find(period => adjacentAnnual(prev, period)) || null
      : list[2] || null;

    return { first, prev, earlier, list };
  }

  function metrics(period, previous) {
    if (!period) return {};

    const current = period.values || normalisePeriod(period).values;
    const prior = previous
      ? previous.values || normalisePeriod(previous).values
      : {};

    const capex = isNumber(current.capex)
      ? Math.abs(current.capex)
      : null;

    const fcf = subtract(current.ocf, capex);

    return {
      ...current,
      capex,
      fcf,
      grossMargin: divide(current.grossProfit, current.revenue),
      operatingMargin: divide(current.ebit, current.revenue),
      netMargin: divide(current.netIncome, current.revenue),
      ocfMargin: divide(current.ocf, current.revenue),
      fcfMargin: divide(fcf, current.revenue),
      currentRatio: divide(
        current.currentAssets,
        current.currentLiabilities
      ),
      cashRatio: divide(current.cash, current.currentLiabilities),
      liabilitiesAssets: divide(current.liabilities, current.assets),
      roa: divide(
        current.netIncome,
        averagePositive(current.assets, prior.assets)
      ),
      roe: divide(
        current.netIncome,
        averagePositive(current.equity, prior.equity)
      ),
      assetTurnover: divide(
        current.revenue,
        averagePositive(current.assets, prior.assets)
      ),
      cashConversion: divide(current.ocf, current.netIncome),
      revenueGrowth: divide(
        subtract(current.revenue, prior.revenue),
        prior.revenue
      ),
      netIncomeGrowth: divide(
        subtract(current.netIncome, prior.netIncome),
        prior.netIncome
      ),

      // Deliberately withheld until backend debt mapping is validated.
      debtEquity: null,
      totalDebt: null,

      // Requires all three inputs; no current-ratio substitution.
      quickRatio: divide(
        add(
          add(current.cash, current.shortInvestments),
          current.receivables
        ),
        current.currentLiabilities
      )
    };
  }

  const groups = [
    ["Profitability", [
      ["grossMargin", "Gross margin", "percent",
        "Gross profit divided by revenue."],
      ["operatingMargin", "Operating margin", "percent",
        "Operating income divided by revenue."],
      ["netMargin", "Net margin", "percent",
        "Net income divided by revenue."],
      ["roa", "Return on assets", "percent",
        "Net income divided by average positive beginning and ending assets."],
      ["roe", "Return on equity", "percent",
        "Net income divided by average positive beginning and ending equity."]
    ]],
    ["Liquidity and financial position", [
      ["currentRatio", "Current ratio", "multiple",
        "Current assets divided by current liabilities."],
      ["cashRatio", "Cash ratio", "multiple",
        "Cash and equivalents divided by current liabilities."],
      ["quickRatio", "Quick ratio", "multiple",
        "Cash, short-term investments and receivables divided by current liabilities. Unavailable if an input is missing."],
      ["liabilitiesAssets", "Liabilities / assets", "percent",
        "Total liabilities divided by total assets. Liabilities include more than debt."],
      ["assetTurnover", "Asset turnover", "multiple",
        "Revenue divided by average positive beginning and ending assets."]
    ]],
    ["Cash generation and growth", [
      ["ocfMargin", "Operating cash-flow margin", "percent",
        "Operating cash flow divided by revenue."],
      ["fcfMargin", "Free cash-flow margin", "percent",
        "Operating cash flow less cash capital expenditure, divided by revenue."],
      ["cashConversion", "Operating cash flow / net income", "multiple",
        "Operating cash flow divided by positive net income."],
      ["revenueGrowth", "Revenue growth", "percent",
        "Annual revenue change divided by positive prior-year revenue."],
      ["netIncomeGrowth", "Net income growth", "percent",
        "Annual net income change divided by positive prior-year net income. Loss-base comparisons are withheld."]
    ]]
  ];

  function format(value, type) {
    if (!isNumber(value)) return "—";
    if (type === "percent") return decimal(value * 100, 1) + "%";
    if (type === "multiple") return decimal(value) + "×";

    return compact(value);
  }

  function change(a, b, type) {
    if (!isNumber(a) || !isNumber(b)) return "—";

    const difference = a - b;
    const prefix = difference > 0 ? "+" : "";

    return type === "percent"
      ? prefix + decimal(difference * 100, 1) + " pp"
      : prefix + decimal(difference) + "×";
  }

  function insights(current, previous) {
    const rows = [];

    if (isNumber(current.revenueGrowth)) {
      rows.push([
        "Revenue",
        `Revenue ${current.revenueGrowth >= 0 ? "increased" : "decreased"} ` +
        `${decimal(Math.abs(current.revenueGrowth) * 100, 1)}% ` +
        "compared with the preceding financial year."
      ]);
    }

    if (
      isNumber(current.operatingMargin) &&
      isNumber(previous.operatingMargin)
    ) {
      const difference =
        (current.operatingMargin - previous.operatingMargin) * 100;

      rows.push([
        "Operating profitability",
        `Operating margin was ${format(current.operatingMargin, "percent")}, ` +
        `${decimal(Math.abs(difference), 1)} percentage points ` +
        `${difference >= 0 ? "higher" : "lower"} than the previous year.`
      ]);
    }

    if (isNumber(current.fcf)) {
      rows.push([
        "Cash generation",
        `Operating cash flow of ${compact(current.ocf)} less capital ` +
        `expenditure of ${compact(current.capex)} produced free cash ` +
        `flow of ${compact(current.fcf)} in the reporting currency.`
      ]);
    }

    if (isNumber(current.currentRatio)) {
      rows.push([
        "Liquidity",
        `Current assets were ${decimal(current.currentRatio)} times ` +
        "current liabilities. This is a period-end coverage measure, " +
        "not a forecast of payment capacity."
      ]);
    }

    if (isNumber(current.roe) && current.roe >= 1) {
      rows.push([
        "Return-on-equity caution",
        `ROE was ${format(current.roe, "percent")}. A small equity base ` +
        "can magnify this ratio; do not interpret it as an investment return."
      ]);
    }

    return rows;
  }

  function installStyles() {
    if (document.getElementById("ketonda-ratio-ui-style")) return;

    const style = document.createElement("style");
    style.id = "ketonda-ratio-ui-style";
    style.textContent = `
      .er-search,.er-card,.er-company {
        background:#fff;border:1px solid #dce3ec;border-radius:12px;
        padding:24px;margin-bottom:20px;color:#172033;
      }
      .er-search h2,.er-company h2 {margin:8px 0 16px}
      .er-search-row {display:flex;gap:10px;margin-top:8px}
      .er-search-row input {
        flex:1;min-width:0;padding:13px;border:1px solid #cbd5e1;
        border-radius:8px;font:inherit;
      }
      .er-search button,.er-card button {
        padding:10px 16px;border:1px solid #cbd5e1;border-radius:8px;
        background:#111827;color:#fff;cursor:pointer;font:inherit;
      }
      .er-note,.er-label,.er-search-status {
        color:#64748b;line-height:1.6;
      }
      .er-label {font-size:.85rem;letter-spacing:.06em}
      .er-results,.er-newslist {list-style:none;padding:0}
      .er-results button {
        width:100%;display:flex;gap:16px;text-align:left;margin:6px 0;
        background:#f1f5f9;color:#172033;
      }
      .er-kpis,.er-insights {
        display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
        gap:14px;margin:20px 0;
      }
      .er-kpi,.er-insights>div {
        padding:16px;border:1px solid #e2e8f0;border-radius:9px;
        background:#f8fafc;
      }
      .er-kpi strong {display:block;font-size:1.7rem;margin:8px 0}
      .er-insights p {line-height:1.6;margin-bottom:0}
      .er-tablewrap {overflow-x:auto}
      .er-table {width:100%;border-collapse:collapse;min-width:650px}
      .er-table th,.er-table td {
        padding:13px 12px;border-bottom:1px solid #e2e8f0;text-align:right;
      }
      .er-table th:first-child {text-align:left}
      .er-table thead,.er-group {background:#f1f5f9}
      .er-table details {font-size:.8rem;font-weight:normal;color:#64748b}
      .er-table details p {max-width:330px;white-space:normal}
      .er-newslist li {padding:14px 0;border-bottom:1px solid #e2e8f0}
      .er-newslist li div {color:#64748b;margin-bottom:7px}
      .er-warning {
        padding:14px;border-left:3px solid #b7791f;
        background:#fffbeb;line-height:1.6;margin:16px 0;
      }
      .er-empty {padding:20px 0;line-height:1.6}
      @media(max-width:600px) {
        .er-search,.er-card,.er-company {padding:16px}
        .er-search-row {flex-wrap:wrap}
      }
    `;

    document.head.appendChild(style);
  }

  function ratioTable(current, previous, first, prev) {
    return `
      <div class="er-tablewrap" tabindex="0"
           role="region" aria-label="Annual financial ratios">
        <table class="er-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">${escapeHtml(date(first.end))}</th>
              <th scope="col">${escapeHtml(prev ? date(prev.end) : "Previous unavailable")}</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          ${groups.map(([title, rows]) => `
            <tbody>
              <tr class="er-group">
                <th colspan="4" scope="rowgroup">${escapeHtml(title)}</th>
              </tr>
              ${rows.map(([key, label, type, formula]) => `
                <tr>
                  <th scope="row">
                    ${escapeHtml(label)}
                    <details>
                      <summary>Formula</summary>
                      <p>${escapeHtml(formula)}</p>
                    </details>
                  </th>
                  <td>${format(current[key], type)}</td>
                  <td>${format(previous[key], type)}</td>
                  <td>${change(current[key], previous[key], type)}</td>
                </tr>
              `).join("")}
            </tbody>
          `).join("")}
        </table>
      </div>
    `;
  }

  function historyTable(list) {
    const rows = [
      ["Revenue", "revenue"],
      ["Gross profit", "grossProfit"],
      ["Operating income", "ebit"],
      ["Net income", "netIncome"],
      ["Total assets", "assets"],
      ["Total liabilities", "liabilities"],
      ["Shareholders’ equity", "equity"],
      ["Current assets", "currentAssets"],
      ["Current liabilities", "currentLiabilities"],
      ["Cash and equivalents", "cash"],
      ["Operating cash flow", "ocf"],
      ["Capital expenditure", "capex"],
      ["Free cash flow", "fcf"]
    ];

    return `
      <div class="er-tablewrap" tabindex="0"
           role="region" aria-label="Annual financial history">
        <table class="er-table">
          <thead>
            <tr>
              <th scope="col">Reported / derived metric</th>
              ${list.map(period =>
                `<th scope="col">${escapeHtml(date(period.end))}</th>`
              ).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(([label, key]) => `
              <tr>
                <th scope="row">${escapeHtml(label)}</th>
                ${list.map(period =>
                  `<td>${compact(metrics(period)[key])}</td>`
                ).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCompany() {
    const output = root?.querySelector("#er-output");
    if (!output) return;

    if (!state.symbol) {
      output.innerHTML =
        '<p class="er-empty">Search for a company and select a result to view its annual financial analysis.</p>';
      return;
    }

    if (state.loading) {
      output.innerHTML = `
        <p class="er-empty" role="status">
          Loading financial analysis for ${escapeHtml(state.symbol)}…
        </p>`;
      return;
    }

    if (state.error) {
      output.innerHTML = `
        <div class="er-card" role="alert">
          <p>${escapeHtml(state.error)}</p>
          <button type="button" data-er-retry>Try again</button>
        </div>`;
      return;
    }

    if (!state.data) return;

    const data = state.data;
    const profile = data.profile || {};
    const { first, prev, earlier, list } = selectPeriods(data);
    const current = metrics(first, prev);
    const previous = metrics(prev, earlier);
    const currency = data.annual?.currency || "";
    const mixed = currency === "mixed";
    const notes = insights(current, previous);
    const articles = Array.isArray(data.articles) ? data.articles : [];
    const filings = Array.isArray(data.filings) ? data.filings : [];

    output.innerHTML = `
      <section class="er-company" aria-label="Selected company">
        <div class="er-label">
          ${escapeHtml([state.symbol, profile.exchange].filter(Boolean).join(" · "))}
        </div>
        <h2>${escapeHtml(profile.companyName || state.name || state.symbol)}</h2>
        <p class="er-note">
          Annual financial analysis · Source: SEC EDGAR
          ${first ? " · Latest year ended " + escapeHtml(date(first.end)) : ""}
        </p>
      </section>

      <section class="er-card" aria-label="Financial analysis">
        <h3>Financial ratios and analysis</h3>

        ${first && !mixed ? `
          <p class="er-note">
            ${currency ? "Reporting currency: " + escapeHtml(currency) + ". " : ""}
            Percentages are displayed as %. Multiples are displayed as ×.
            Changes in percentage ratios use percentage points (pp).
            “—” means unavailable or not meaningful.
          </p>

          <div class="er-kpis">
            ${[
              ["Revenue", compact(current.revenue)],
              ["Net margin", format(current.netMargin, "percent")],
              ["Operating margin", format(current.operatingMargin, "percent")],
              ["Free cash flow", compact(current.fcf)]
            ].map(([label, value]) => `
              <div class="er-kpi">
                <span>${escapeHtml(label)}</span>
                <strong>${value}</strong>
                <small>${escapeHtml(date(first.end))}</small>
              </div>
            `).join("")}
          </div>

          <div class="er-warning">
            Preliminary analysis: the backend’s annual-period extraction
            still needs validation. Debt ratios are withheld because its
            current debt mapping may omit current borrowings.
            Quick ratio is unavailable unless all required inputs exist.
          </div>

          <section class="er-insights" aria-label="Financial observations">
            ${notes.map(([heading, body]) => `
              <div>
                <strong>${escapeHtml(heading)}</strong>
                <p>${escapeHtml(body)}</p>
              </div>
            `).join("")}
          </section>

          ${ratioTable(current, previous, first, prev)}

          <p class="er-note">
            Returns and asset turnover use average beginning and ending
            balances and require consecutive annual periods.
            These observations do not apply universal “good” or “bad”
            thresholds across different industries.
          </p>
        ` : `
          <p class="er-empty">
            ${mixed
              ? "Financial comparisons are withheld because reporting currencies differ."
              : "Annual financial statements are unavailable for this listing."}
          </p>
        `}
      </section>

      ${first && !mixed ? `
        <section class="er-card" aria-label="Annual financial history">
          <h3>Annual financial history</h3>
          <p class="er-note">
            ${escapeHtml(currency || "Reporting currency")}
            · K = thousand, M = million, B = billion, T = trillion.
            Free cash flow is operating cash flow less cash capital expenditure.
          </p>
          <p>
            <button type="button" data-er-export>
              Download annual statement CSV
            </button>
          </p>
          ${historyTable(list)}
        </section>
      ` : ""}

      <section class="er-card" aria-label="Latest company filings">
        <h3>Latest company filings</h3>
        <p class="er-note">
          Official SEC disclosures.
          ${link(data.filingsUrl, "View company on SEC EDGAR")}
        </p>
        ${filings.length ? `
          <ul class="er-newslist">
            ${filings.map(filing => `
              <li>
                <div>SEC EDGAR · ${escapeHtml(date(filing.date))}</div>
                ${link(filing.url, filing.title)}
              </li>
            `).join("")}
          </ul>
        ` : `
          <p>No filings are available in this response.</p>
        `}
      </section>

      <section class="er-card" aria-label="Company news">
        <h3>Company news</h3>
        <p class="er-note">
          Headlines via ${escapeHtml(data.newsSource || "the configured news feed")}.
          News availability does not determine whether financial ratios display.
        </p>
        ${articles.length ? `
          <ul class="er-newslist">
            ${articles.map(article => `
              <li>
                <div>
                  ${escapeHtml(article.publisher)}
                  · ${escapeHtml(date(article.date))}
                </div>
                ${link(article.url, article.title)}
              </li>
            `).join("")}
          </ul>
        ` : `
          <p>${data.pressStatus === "unavailable"
            ? "Recent news is unavailable. Financial analysis is shown independently."
            : "No recent headlines were returned for this company."}</p>
        `}
      </section>

      <p class="er-note">
        Financial ratios describe reported financial performance, not the
        attractiveness of the current share price. No price-based valuation
        is supplied here. Not investment advice.
      </p>
      <p class="er-note">
        Retrieved: ${escapeHtml(data.retrievedAt || "Not supplied")}
        · Interface: ${VERSION}
      </p>
    `;
  }

  function renderResults(message = "") {
    if (!root) return;

    const status = root.querySelector("#er-search-status");
    const list = root.querySelector("#er-results");

    if (!status || !list) return;

    status.textContent = message;

    list.innerHTML = state.results.map((company, index) => `
      <li>
        <button type="button" data-er-choice="${index}">
          <strong>${escapeHtml(company.symbol)}</strong>
          <span>${escapeHtml(company.name)}</span>
          <span>${escapeHtml(company.exchange || "")}</span>
        </button>
      </li>
    `).join("");
  }

  async function getResults(query) {
    searchController?.abort();
    const controller = searchController = new AbortController();
    const sequence = ++searchSequence;

    state.results = [];
    state.searching = true;
    renderResults("Searching companies…");

    try {
      const data = await api(
        "search?" + new URLSearchParams({ q: query }),
        controller.signal
      );

      if (sequence !== searchSequence || query !== state.query) return;

      state.results = Array.isArray(data.results) ? data.results : [];

      renderResults(
        state.results.length
          ? "Select a company to load its financial analysis."
          : "No matching companies were found."
      );
    } catch (error) {
      if (error.name !== "AbortError" && sequence === searchSequence) {
        renderResults(error.message);
      }
    } finally {
      if (sequence === searchSequence) state.searching = false;
    }
  }

  async function select(symbol, name) {
    if (!root) return;

    clearTimeout(timer);
    searchController?.abort();
    ++searchSequence;
    companyController?.abort();

    const controller = companyController = new AbortController();

    state.symbol = symbol;
    state.name = name || symbol;
    state.query = symbol;
    state.results = [];
    state.data = null;
    state.error = "";
    state.loading = true;

    const input = root.querySelector("#er-query");
    if (input) input.value = symbol;

    renderResults();
    renderCompany();

    try {
      const data = await api(
        "company/" + encodeURIComponent(symbol),
        controller.signal
      );

      if (controller !== companyController) return;

      state.data = data;
    } catch (error) {
      if (error.name === "AbortError") return;
      if (controller !== companyController) return;

      state.error = error.message;
    } finally {
      if (controller === companyController) {
        state.loading = false;
        renderCompany();
      }
    }
  }

  function download() {
    const list = annualPeriods(state.data);
    if (!list.length) return;

    const keys = [
      ["Revenue", "revenue"],
      ["Gross profit", "grossProfit"],
      ["Operating income", "ebit"],
      ["Net income", "netIncome"],
      ["Total assets", "assets"],
      ["Total liabilities", "liabilities"],
      ["Shareholders’ equity", "equity"],
      ["Current assets", "currentAssets"],
      ["Current liabilities", "currentLiabilities"],
      ["Cash and equivalents", "cash"],
      ["Operating cash flow", "ocf"],
      ["Capital expenditure", "capex"],
      ["Free cash flow", "fcf"]
    ];

    const rows = [
      ["Symbol", state.symbol],
      ["Source", "SEC EDGAR via Ketonda company endpoint"],
      ["Currency", state.data.annual?.currency || ""],
      ["Retrieved", state.data.retrievedAt || ""],
      ["Status", "Preliminary; annual extraction requires validation"],
      ["Metric", ...list.map(period => period.end)]
    ];

    for (const [label, key] of keys) {
      rows.push([
        label,
        ...list.map(period => metrics(period)[key] ?? "")
      ]);
    }

    const csv = rows.map(row =>
      row.map(cell =>
        '"' + String(cell ?? "").replace(/"/g, '""') + '"'
      ).join(",")
    ).join("\r\n");

    const objectUrl = URL.createObjectURL(
      new Blob(["\ufeff", csv], {
        type: "text/csv;charset=utf-8"
      })
    );

    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = state.symbol + "-annual-financials.csv";

    root.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  }

  function mount(node) {
    if (!(node instanceof Element)) {
      throw new Error("KetondaEquity.mount requires a page element.");
    }

    root = node;
    installStyles();
    root.dataset.equityUiVersion = VERSION;

    root.innerHTML = `
      <section class="er-search" aria-labelledby="er-search-title">
        <div class="er-label">Equity financial analysis</div>
        <h2 id="er-search-title">Analyse a listed company</h2>
        <p>
          Search by company name or ticker, then select a result to
          view annual financial ratios, observations and financial history.
        </p>
        <form id="er-search-form" role="search">
          <label for="er-query">Company name or ticker</label>
          <div class="er-search-row">
            <input
              id="er-query"
              type="search"
              maxlength="80"
              autocomplete="off"
              placeholder="e.g. Apple or AAPL"
              aria-describedby="er-search-status"
              value="${escapeHtml(state.query)}"
            >
            <button type="submit">Search</button>
          </div>
        </form>
        <p id="er-search-status" class="er-search-status"
           role="status"></p>
        <ul id="er-results" class="er-results"
            aria-label="Company search results"></ul>
      </section>
      <div id="er-output" aria-busy="false"></div>
    `;

    root.oninput = event => {
      if (event.target.id !== "er-query") return;

      clearTimeout(timer);
      searchController?.abort();
      ++searchSequence;

      state.query = event.target.value.trim();
      state.results = [];
      renderResults();

      if (state.query) {
        const query = state.query;
        timer = setTimeout(() => getResults(query), 400);
      }
    };

    root.onsubmit = event => {
      if (event.target.id !== "er-search-form") return;

      event.preventDefault();
      clearTimeout(timer);

      if (state.results.length === 1) {
        const company = state.results[0];
        select(company.symbol, company.name);
      } else if (state.query) {
        getResults(state.query);
      } else {
        renderResults("Enter a company name or ticker.");
      }
    };

    root.onclick = event => {
      const button = event.target.closest("button");
      if (!button || !root.contains(button)) return;

      if (button.hasAttribute("data-er-choice")) {
        const company = state.results[Number(button.dataset.erChoice)];

        if (company) select(company.symbol, company.name);
      } else if (button.hasAttribute("data-er-retry")) {
        select(state.symbol, state.name);
      } else if (button.hasAttribute("data-er-export")) {
        download();
      }
    };

    root.onkeydown = event => {
      const buttons = [...root.querySelectorAll("[data-er-choice]")];
      const index = buttons.indexOf(event.target);

      if (
        buttons.length &&
        ["ArrowDown", "ArrowUp"].includes(event.key) &&
        (event.target.id === "er-query" || index >= 0)
      ) {
        event.preventDefault();

        const next = index < 0
          ? event.key === "ArrowDown" ? 0 : buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1)
              + buttons.length) % buttons.length;

        buttons[next].focus();
      }

      if (event.key === "Escape") {
        state.results = [];
        renderResults();
        root.querySelector("#er-query")?.focus();
      }
    };

    renderResults();
    renderCompany();
  }

  window.KetondaEquity = {
    mount,
    select,
    selectPeriods,
    metrics,
    version: VERSION
  };
}());
