import test from 'node:test';
import assert from 'node:assert/strict';
import { handleEquity } from '../functions/api/equity/[[path]].js';

const now = Date.parse('2026-11-23T12:00:00Z');
const identity = { SEC_USER_AGENT: 'Ketonda Test qa@local.invalid' };
const licensed = { FMP_PUBLIC_NEWS: 'true', FMP_API_KEY: 'fictional-test-key' };
const noFetch = () => { throw new Error('An upstream call was not expected'); };
const baseOpts = { now, cache: null, fetchImpl: noFetch };
const request = (path, { q, method = 'GET', env = {}, opts = {} } = {}) => handleEquity({
  request: new Request('https://ketonda.test/api/equity/' + path + (q === undefined ? '' : '?' + new URLSearchParams({ q })), { method }),
  params: { path: path.split('/') }, env,
}, { ...baseOpts, ...opts });

test('name and symbol search use the public SEC snapshot without an upstream call', async () => {
  const r = await request('search', { q: '  microsoft  ' });
  assert.equal(r.status, 200);
  const m = await r.json();
  assert.equal(m.source, 'SEC EDGAR');
  assert.equal(m.results[0].symbol, 'MSFT');
  assert.equal((await (await request('search', { q: 'aapl' })).json()).results[0].symbol, 'AAPL');
  assert.equal((await (await request('search', { q: 'brk.b' })).json()).results[0].symbol, 'BRK-B');
  assert.deepEqual((await (await request('search', { q: 'not a real issuer zzz999' })).json()).results, []);
});

test('validation, path matching, method allowlist, and same-origin policy', async () => {
  for (const q of ['', '<script>', 'x'.repeat(81)]) assert.equal((await request('search', { q })).status, 400);
  const r = await request('news/MSFT', { method: 'POST' });
  assert.equal(r.status, 405); assert.equal(r.headers.get('Allow'), 'GET');
  assert.equal(r.headers.has('Access-Control-Allow-Origin'), false);
  assert.equal((await request('news/ZZZNOTKNOWN')).status, 404);
  assert.equal((await request('news/$$')).status, 400);
  assert.equal((await request('news/MSFT/extra')).status, 404);
  assert.equal((await request('company/MSFT')).status, 404);
  assert.equal((await (await request('health')).json()).status, 'ok');
});

test('public press is off unless both the key and explicit public-display setting are present', async () => {
  for (const env of [{}, { FMP_API_KEY: 'fictional-test-key' }, { FMP_PUBLIC_NEWS: 'true' },
    { SEC_USER_AGENT: 'Example admin@example.com' }]) {
    const r = await request('news/msft', { env });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.pressStatus, 'disabled');
    assert.equal(d.filingsStatus, 'disabled');
    assert.equal(d.filingsUrl, 'https://www.sec.gov/edgar/browse/?CIK=0000789019');
    assert.equal(JSON.stringify(d).includes('fictional-test-key'), false);
  }
});

const fakeSec = { cik: '0000789019', filings: { recent: {
  form: ['10-K', '8-K', '8-K', '4', '10-Q', '8-K', '8-K'],
  filingDate: ['2026-07-18', '2026-11-22', '2026-11-22', '2026-11-23', '2026-10-20', '2026-12-28', '2026-02-30'],
  accessionNumber: ['0000789019-26-000010', '0000789019-26-000011', '0000789019-26-000011',
    '0000789019-26-000012', '0000789019-26-000013', '0000789019-26-000014', '0000789019-26-000015'],
  primaryDocument: ['annual.htm', 'current.htm', 'same.htm', 'owner.htm', 'quarter.htm', 'future.htm', 'invalid.htm'],
} } };
const fakeFmp = [
  { symbol: 'MSFT', title: 'Sample recent headline', publishedDate: '2026-11-22 10:20:55', url: 'https://example.com/story?ref=test', publisher: 'Example Press' },
  { symbol: 'MSFT', title: 'Sample duplicate', publishedDate: '2026-11-21 07:20:55', url: 'https://example.com/story' },
  { symbol: 'MSFT,AAPL', title: 'Sample comparison headline', publishedDate: '2026-11-20 07:20:55', url: 'https://example.com/comparison' },
  { symbol: 'AAPL', title: 'Unrelated issuer', publishedDate: '2026-11-23 07:20:55', url: 'https://example.com/incorrect' },
  { symbol: 'MSFT', title: 'Invalid URL', publishedDate: '2026-11-23 07:20:55', url: 'javascript:alert(1)' },
  { symbol: 'MSFT', title: 'Old headline', publishedDate: '2020-04-23 07:20:55', url: 'https://example.com/old' },
];

test('issuer filings and press articles are validated, deduplicated, and independently labelled', async () => {
  const fetchImpl = (input, parameters) => {
    const url = new URL(input);
    assert.equal(parameters.redirect, 'error');
    if (url.hostname === 'data.sec.gov') {
      assert.equal(url.pathname, '/submissions/CIK0000789019.json');
      assert.equal(parameters.headers['User-Agent'], identity.SEC_USER_AGENT);
      return Response.json(fakeSec);
    }
    assert.equal(url.origin, 'https://financialmodelingprep.com');
    assert.equal(url.pathname, '/stable/news/stock');
    assert.equal(url.searchParams.get('symbols'), 'MSFT');
    assert.equal(url.searchParams.get('apikey'), licensed.FMP_API_KEY);
    return Response.json(fakeFmp);
  };
  const d = await (await request('news/MSFT', { env: { ...identity, ...licensed }, opts: { fetchImpl } })).json();
  assert.equal(d.pressStatus, 'ok'); assert.equal(d.filingsStatus, 'ok');
  assert.deepEqual(d.filings.map(f => f.form), ['8-K', '10-Q', '10-K']);
  assert.equal(d.filings[0].url, 'https://www.sec.gov/Archives/edgar/data/789019/000078901926000011/0000789019-26-000011-index.htm');
  assert.deepEqual(d.articles.map(a => a.title), ['Sample recent headline', 'Sample comparison headline']);
  assert.equal(d.articles[0].publisher, 'Example Press');
  assert.equal(JSON.stringify(d).includes(licensed.FMP_API_KEY), false);
});

test('one upstream failing or returning a different issuer does not hide the other', async () => {
  const fetchImpl = input => new URL(input).hostname === 'data.sec.gov'
    ? Response.json({ ...fakeSec, cik: '0000320193' }) : Response.json([]);
  const d = await (await request('news/MSFT', { env: { ...identity, ...licensed }, opts: { fetchImpl } })).json();
  assert.equal(d.pressStatus, 'empty');
  assert.equal(d.filingsStatus, 'unavailable');
  assert.deepEqual(d.filings, []);
  assert.match(d.filingsUrl, /sec\.gov/);
});

test('cached provider data is never used after its public display is disabled', async () => {
  const entries = new Map(); let calls = 0;
  const cache = {
    match: async req => entries.get(req.url)?.clone(),
    put: async (req, res) => { entries.set(req.url, res.clone()); },
  };
  const opts = { cache, fetchImpl: () => { calls++; return Response.json(fakeFmp); } };
  await request('news/MSFT', { env: licensed, opts });
  assert.equal((await (await request('news/msft', { env: licensed, opts })).json()).pressStatus, 'ok');
  assert.equal(calls, 1);
  assert.equal((await (await request('news/MSFT', { env: { FMP_API_KEY: licensed.FMP_API_KEY }, opts })).json()).pressStatus, 'disabled');
  assert.equal(calls, 1);
});
