import directory from '../../_data/sec-listings.json';

const SEC = 'https://data.sec.gov/submissions/';
const GOOGLE_NEWS =
  'https://news.google.com/rss/search?q=';
const SYMBOL = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
const QUERY = /^[\p{L}\p{M}\p{N} .,&'’/()-]+$/u;
const FORMS = /^(8-K|6-K|10-Q|10-K|20-F|40-F)(\/A)?$/;

const clean = (value, max) =>
  typeof value === 'string'
    ? value.replace(/\s+/gu, ' ').trim().slice(0, max)
    : '';

const normalize = value =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

const tickerKey = value => value.toUpperCase().replace(/\./g, '-');

const listings = directory.data.map(([cik, name, symbol, exchange]) => ({
  cik: String(cik).padStart(10, '0'),
  name,
  symbol,
  exchange,
  normal: normalize(name)
}));

const bySymbol = new Map(
  listings
    .filter(row => SYMBOL.test(row.symbol))
    .map(row => [tickerKey(row.symbol), row])
);

const day = value =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

const httpsUrl = value => {
  try {
    const url = new URL(value);

    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.href.length <= 1600
      ? url.href
      : '';
  } catch {
    return '';
  }
};

const json = (body, status = 200, extra = {}) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra
    }
  });

function search(query) {
  const term = normalize(query);
  const symbol = tickerKey(query);
  const candidates = [];

  for (const row of listings) {
    if (!SYMBOL.test(row.symbol)) {
      continue;
    }

    const displayTicker = tickerKey(row.symbol);
    const index = row.normal.indexOf(term);

    const rank =
      displayTicker === symbol ? 0 :
      row.normal === term ? 1 :
      index === 0 ? 2 :
      displayTicker.startsWith(symbol) ? 3 :
      index > 0 && /[\s(.-]/.test(row.normal[index - 1]) ? 4 :
      index >= 0 ? 5 :
      Infinity;

    if (Number.isFinite(rank)) {
      candidates.push({ row, rank });
    }
  }

  return candidates
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.row.symbol.localeCompare(b.row.symbol)
    )
    .slice(0, 8)
    .map(({ row }) => ({
      name: row.name,
      symbol: row.symbol,
      exchange: row.exchange
    }));
}

async function readText(fetchImpl, url, headers = {}) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      ...headers
    },
    signal: AbortSignal.timeout(10000),
    redirect: 'follow'
  });

  if (!response.ok || !response.body) {
    throw new Error(
      `Upstream request failed: ${response.status} ${response.statusText}`
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      size += value.byteLength;

      if (size > 1_500_000) {
        await reader.cancel();
        throw new Error('Oversize upstream response');
      }

      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return body + decoder.decode();
}

async function readJson(fetchImpl, url, headers) {
  const body = await readText(fetchImpl, url, {
    Accept: 'application/json',
    ...headers
  });

  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Upstream response was not valid JSON');
  }
}

const decodeEntities = value =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&#34;', '"');

const tagValue = (xml, tag) => {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  );

  return match ? decodeEntities(match[1]).trim() : '';
};

const secIndex = cik =>
  `https://www.sec.gov/edgar/browse/?CIK=${cik}`;

function secItems(raw, listing, now) {
  const recent = raw?.filings?.recent;

  if (
    !recent ||
    Number(raw.cik) !== Number(listing.cik) ||
    !['form', 'filingDate', 'accessionNumber', 'primaryDocument'].every(
      key => Array.isArray(recent[key])
    )
  ) {
    throw new Error('Unexpected SEC response format');
  }

  const items = [];
  const seen = new Set();

  for (let index = 0; index < recent.form.length; index += 1) {
    const form = recent.form[index];
    const date = recent.filingDate[index];
    const accessionNumber = recent.accessionNumber[index];
    const document = recent.primaryDocument[index];
    const age = now - Date.parse(date);

    if (
      !FORMS.test(form || '') ||
      !day(date) ||
      age < -86_400_000 ||
      age > 366 * 86_400_000 ||
      !/^\d{10}-\d{2}-\d{6}$/.test(accessionNumber || '') ||
      !/^[\w.-]+\.html?$/i.test(document || '') ||
      seen.has(accessionNumber)
    ) {
      continue;
    }

    const group = form.split('/')[0];

    const type = {
      '8-K': 'Current report',
      '6-K': 'Foreign issuer report',
      '10-Q': 'Quarterly report',
      '10-K': 'Annual report',
      '20-F': 'Annual report',
      '40-F': 'Annual report'
    }[group];

    const url =
      `https://www.sec.gov/Archives/edgar/data/${Number(listing.cik)}/` +
      `${accessionNumber.replaceAll('-', '')}/${accessionNumber}-index.htm`;

    items.push({
      title: `${type} (Form ${form})`,
      url,
      date,
      form,
      publisher: 'SEC EDGAR'
    });

    seen.add(accessionNumber);
  }

  return items
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
}

function newsItems(xml, now) {
  const items = [];
  const entries = xml.split(/<item(?:\s[^>]*)?>/i).slice(1);

  for (const entry of entries) {
    const title = tagValue(entry, 'title');
    const link = httpsUrl(tagValue(entry, 'link'));
    const source = tagValue(entry, 'source');
    const published = tagValue(entry, 'pubDate');
    const timestamp = Date.parse(published);

    if (
      !title ||
      !link ||
      !Number.isFinite(timestamp) ||
      timestamp > now + 86_400_000 ||
      now - timestamp > 14 * 86_400_000
    ) {
      continue;
    }

    const publisher = clean(source, 120) || 'Google News';
    const date = new Date(timestamp).toISOString().slice(0, 10);

    items.push({
      title: clean(title, 320),
      url: link,
      publisher,
      date,
      timestamp
    });
  }

  const unique = new Map();

  for (const item of items) {
    const key = item.url;

    if (!unique.has(key) || unique.get(key).timestamp < item.timestamp) {
      unique.set(key, item);
    }
  }

  return [...unique.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 8)
    .map(({ timestamp, ...item }) => item);
}

async function stored(cache, context, feed, identifier, ttl, run) {
  const cacheKey = new Request(
    new URL(
      `/api/equity/news/${identifier}?__ketonda_v2=${feed}`,
      context.request.url
    )
  );

  if (cache) {
    try {
      const hit = await cache.match(cacheKey);

      if (hit) {
        return await hit.json();
      }
    } catch {
      // Ignore cache errors and fetch fresh data.
    }
  }

  const result = await run();

  if (cache) {
    const write = cache
      .put(
        cacheKey,
        json(result, 200, {
          'Cache-Control': `public, max-age=${ttl}`
        })
      )
      .catch(() => {});

    if (context.waitUntil) {
      context.waitUntil(write);
    } else {
      await write;
    }
  }

  return result;
}

async function loadFeed(
  enabled,
  cache,
  context,
  feed,
  identifier,
  ttl,
  fetchItems
) {
  if (!enabled) {
    return {
      status: 'disabled',
      items: [],
      debug: `${feed} feed is disabled`
    };
  }

  try {
    const items = await stored(
      cache,
      context,
      feed,
      identifier,
      ttl,
      fetchItems
    );

    return {
      status: items.length ? 'ok' : 'empty',
      items,
      debug: items.length
        ? `${feed} feed loaded successfully`
        : `${feed} feed returned no eligible items`
    };
  } catch (error) {
    console.error(`${feed} feed failed:`, error);

    return {
      status: 'unavailable',
      items: [],
      debug: String(
        error && error.message ? error.message : error
      )
    };
  }
}

function emptyFinancials() {
  return {
    quarterly: {
      currency: '',
      periods: []
    },
    annual: {
      currency: '',
      periods: []
    }
  };
}

export async function handleEquity(context, options = {}) {
  const { request, env = {} } = context;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const cache =
    options.cache === undefined
      ? globalThis.caches?.default
      : options.cache;
  const now = options.now ?? Date.now();

  if (request.method !== 'GET') {
    return json(
      { detail: 'Use GET for this endpoint.' },
      405,
      { Allow: 'GET' }
    );
  }

  const path = Array.isArray(context.params.path)
    ? context.params.path
    : [context.params.path];

  const [route, rawSymbol] = path;

  if (route === 'health' && path.length === 1) {
    return json({
      status: 'ok',
      directory: 'SEC EDGAR',
      snapshot: directory.snapshot
    });
  }

  if (route === 'search' && path.length === 1) {
    const params = new URL(request.url).searchParams;
    const query = (params.get('q') || '')
      .normalize('NFC')
      .trim()
      .replace(/\s+/gu, ' ');

    if (
      params.getAll('q').length !== 1 ||
      query.length < 1 ||
      query.length > 80 ||
      !QUERY.test(query)
    ) {
      return json(
        {
          detail:
            'Enter a company name or ticker (up to 80 characters).'
        },
        400
      );
    }

    return json({
      results: search(query),
      source: 'SEC EDGAR',
      snapshot: directory.snapshot
    });
  }

  if (
    (route === 'company' || route === 'news') &&
    path.length === 2
  ) {
    const symbol = String(rawSymbol).toUpperCase();

    if (!SYMBOL.test(symbol)) {
      return json(
        { detail: 'That ticker format is not supported.' },
        400
      );
    }

    const listing = bySymbol.get(tickerKey(symbol));

    if (!listing) {
      return json(
        {
          detail:
            'This listing was not found in the SEC directory.'
        },
        404
      );
    }

    const userAgent = env.SEC_USER_AGENT?.trim();

    const secReady = Boolean(
      userAgent &&
        /\S+@\S+\.\S+/.test(userAgent) &&
        !/example\.(com|org|net)\b/i.test(userAgent)
    );

    const newsQuery =
      `("${listing.name}" OR ${listing.symbol}) when:7d`;

    const newsUrl =
      `${GOOGLE_NEWS}${encodeURIComponent(newsQuery)}` +
      `&hl=en-US&gl=US&ceid=US:en`;

    const [filings, press] = await Promise.all([
      loadFeed(
        secReady,
        cache,
        context,
        'sec',
        listing.cik,
        600,
        async () =>
          secItems(
            await readJson(
              fetchImpl,
              `${SEC}CIK${listing.cik}.json`,
              {
                'User-Agent': userAgent,
                Accept: 'application/json'
              }
            ),
            listing,
            now
          )
      ),
      loadFeed(
        true,
        cache,
        context,
        'google-news',
        listing.symbol,
        300,
        async () =>
          newsItems(
            await readText(fetchImpl, newsUrl),
            now
          )
      )
    ]);

    const financials = emptyFinancials();

    return json({
      profile: {
        companyName: listing.name,
        symbol: listing.symbol,
        exchange: listing.exchange,
        sector: '',
        industry: '',
        country: '',
        website: '',
        description: ''
      },
      quote: null,
      ...financials,
      filings: filings.items,
      filingsStatus: filings.status,
      filingsDebug: filings.debug,
      filingsUrl: secIndex(listing.cik),
      articles: press.items,
      pressStatus: press.status,
      pressDebug: press.debug,
      newsSource: 'Google News',
      retrievedAt: new Date(now).toISOString()
    });
  }

  return json({ detail: 'Not found.' }, 404);
}

export const onRequest = context => handleEquity(context);
