(() => {
  'use strict';
  const directory = 'https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data';
  const escape = value => String(value ?? '').replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const link = (url, text) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' && !u.username && !u.password) {
        return `<a href="${escape(u.href)}" target="_blank" rel="noopener noreferrer">${escape(text)}</a>`;
      }
    } catch { /* Invalid URLs are never clickable. */ }
    return escape(text);
  };
  const dates = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value))
    ? dates.format(new Date(value)) : '';

  const state = { query: '', results: [], message: '', match: null, news: null, error: '' };
  let root, searchRequest, newsRequest, debounce;
  async function api(path, signal) {
    const response = await fetch('/api/equity/' + path, {
      signal, credentials: 'same-origin', headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!data || !response.ok) throw new Error(data?.detail || 'The equity service is unavailable. Try again in a moment.');
    return data;
  }

  function renderResults() {
    root.querySelector('#er-search-status').textContent = state.message;
    root.querySelector('#er-results').innerHTML = state.results.map((r, index) => `<li>
      <button type="button" data-er-choice="${index}"><b>${escape(r.symbol)}</b>
      <span class="er-resultname">${escape(r.name)}<small>${escape(r.exchange)}</small></span>
      <span aria-hidden="true">›</span></button></li>`).join('');
  }
  function list(items) {
    return `<ul class="er-newslist">${items.map(item => `<li><div>${escape(item.publisher)}
      <time datetime="${escape(item.date)}">${escape(date(item.date))}</time></div>
      ${link(item.url, item.title)}</li>`).join('')}</ul>`;
  }
  function feed(heading, description, items, status, labels, outlink = '') {
    return `<section class="er-card" aria-label="${heading}"><div class="er-toolbar">
      <div><h3>${heading}</h3><p class="er-note">${description}</p></div>${outlink}</div>
      ${status === 'ok' && items.length ? list(items) :
        `<p class="er-feed-status">${labels[status] || labels.empty}${status === 'unavailable'
          ? '<br><button type="button" class="bt" data-er-retry>Retry updates</button>' : ''}</p>`}</section>`;
  }
  function renderNews() {
    const output = root.querySelector('#er-output');
    if (!state.match) { output.innerHTML = '<div class="er-empty">Select a company to see its updates.</div>'; return; }
    const match = state.match, news = state.news;
    const official = news?.filingsUrl ? link(news.filingsUrl, 'View filings on SEC EDGAR')
      : link('https://www.sec.gov/edgar/search/#/q=' + encodeURIComponent(match.symbol), 'Search SEC EDGAR');
    let bottom;
    if (state.error) bottom = `<div class="er-card" role="alert">${escape(state.error)}
      <button type="button" class="bt" data-er-retry>Retry updates</button></div>`;
    else if (!news) bottom = '<div class="er-card" role="status">Loading company updates…</div>';
    else bottom = feed('Press headlines', 'Company coverage from Financial Modeling Prep, newest first.',
      news.articles, news.pressStatus, {
        disabled: 'Press coverage is not enabled on this site. See official company filings below.',
        unavailable: 'Press coverage is temporarily unavailable.',
        empty: 'No recent press articles were found for this ticker.',
      }) + feed('Latest company filings', 'Official disclosures filed with the SEC. These are not press articles.',
      news.filings, news.filingsStatus, {
        disabled: 'The on-site filings feed is not configured. Use the SEC EDGAR link above the list.',
        unavailable: 'The filings feed is temporarily unavailable. You can still use the SEC EDGAR link.',
        empty: 'No recent supported filing types were found. View the full filing history on SEC EDGAR.',
      }, official);
    output.innerHTML = `<section class="er-company" aria-label="Selected company"><div class="er-company-top">
      <div><div class="er-label">${escape(match.symbol)} · ${escape(match.exchange)}</div>
      <h2 tabindex="-1">${escape(match.name)}</h2></div></div></section>${bottom}`;
  }
  async function find(query) {
    if (!query || query !== state.query) return;
    searchRequest?.abort();
    const token = searchRequest = new AbortController();
    state.message = 'Searching the stock directory…'; renderResults();
    try {
      const response = await api('search?' + new URLSearchParams({ q: query }), token.signal);
      if (token !== searchRequest || query !== state.query) return;
      state.results = response.results;
      state.message = state.results.length ? 'Select a listing to see its updates.' : 'No matching company or ticker was found.';
    } catch (e) {
      if (token !== searchRequest || query !== state.query || e.name === 'AbortError') return;
      state.message = e.message;
    }
    renderResults();
  }
  async function loadNews() {
    newsRequest?.abort();
    const token = newsRequest = new AbortController();
    const symbol = state.match.symbol;
    state.news = null; state.error = ''; renderNews();
    try {
      const data = await api('news/' + encodeURIComponent(symbol), token.signal);
      if (token !== newsRequest) return;
      state.news = data;
    } catch (e) {
      if (token !== newsRequest || e.name === 'AbortError') return;
      state.error = e.message;
    }
    const hadFocus = root.querySelector('#er-output').contains(document.activeElement);
    renderNews();
    if (hadFocus) root.querySelector('.er-company h2').focus({ preventScroll: true });
  }
  function choose(match) {
    searchRequest?.abort(); clearTimeout(debounce);
    state.match = match; state.query = match.symbol; state.results = []; state.message = '';
    root.querySelector('#er-query').value = state.query;
    renderResults(); loadNews();
    root.querySelector('.er-company h2').focus({ preventScroll: true });
  }
  function mount(node) {
    root = node;
    root.innerHTML = `<section class="er-search" aria-labelledby="er-search-title">
      <div class="er-label">Equity Securities</div><h2 id="er-search-title">Find a listed company</h2>
      <p>Search the SEC stock directory by name or ticker to find company filings and available press headlines.</p>
      <form id="er-search-form" role="search"><label for="er-query">Company name or ticker</label><div class="er-search-row">
      <input id="er-query" maxlength="80" type="search" autocomplete="off" placeholder="e.g. Microsoft or MSFT"
      aria-describedby="er-search-status" value="${escape(state.query)}"><button type="submit" class="bt p">Search</button></div></form>
      <p id="er-search-status" role="status" class="er-search-status"></p>
      <ul id="er-results" class="er-results" aria-label="Stock search results"></ul>
      <p class="er-note">Directory: ${link(directory, 'SEC EDGAR')}. Coverage is limited to exchange-listed tickers in the directory.</p>
      </section><div id="er-output"></div>`;
    root.oninput = e => {
      if (e.target.id !== 'er-query') return;
      clearTimeout(debounce); searchRequest?.abort();
      state.query = e.target.value.trim(); state.results = []; state.message = ''; renderResults();
      if (state.query) { const query = state.query; debounce = setTimeout(() => find(query), 400); }
    };
    root.onsubmit = e => {
      e.preventDefault(); clearTimeout(debounce);
      if (state.results.length === 1) choose(state.results[0]);
      else if (state.query) find(state.query);
      else { state.message = 'Enter a company name or ticker.'; renderResults(); }
    };
    root.onclick = e => {
      const button = e.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-er-choice') && state.results[Number(button.dataset.erChoice)]) {
        choose(state.results[Number(button.dataset.erChoice)]);
      } else if (button.hasAttribute('data-er-retry') && state.match) {
        loadNews(); root.querySelector('.er-company h2').focus({ preventScroll: true });
      }
    };
    root.onkeydown = e => {
      const buttons = [...root.querySelectorAll('[data-er-choice]')];
      const index = buttons.indexOf(e.target);
      if (e.target.id !== 'er-query' && index === -1) return;
      if (buttons.length && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        buttons[index === -1 ? (e.key === 'ArrowDown' ? 0 : buttons.length - 1) :
          (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
      } else if (e.key === 'Escape') {
        clearTimeout(debounce); searchRequest?.abort(); state.results = []; state.message = '';
        renderResults(); root.querySelector('#er-query').focus();
      }
    };
    renderResults(); renderNews();
  }
  window.KetondaEquity = { mount };
})();
