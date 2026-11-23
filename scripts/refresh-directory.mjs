import { readFile, writeFile } from 'node:fs/promises';

const source = 'https://www.sec.gov/files/company_tickers_exchange.json';
// A saved official SEC response may be supplied if the network blocks automated access.
const rawFile = process.argv[2];
const userAgent = process.env.SEC_USER_AGENT?.trim();
let raw;
if (rawFile) {
  raw = JSON.parse(await readFile(rawFile, 'utf8'));
} else {
  if (!userAgent || !/\S+@\S+\.\S+/.test(userAgent)) {
    throw new Error('Set SEC_USER_AGENT to your application name and a real technical contact email.');
  }
  const reply = await fetch(source, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(15000) });
  if (!reply.ok) throw new Error(`SEC directory returned HTTP ${reply.status}`);
  raw = await reply.json();
}
const fields = ['cik', 'name', 'ticker', 'exchange'];
if (JSON.stringify(raw.fields) !== JSON.stringify(fields) || !Array.isArray(raw.data) || raw.data.length < 1000) {
  throw new Error('Unexpected SEC directory schema; existing snapshot was not changed.');
}
const data = raw.data.filter(row => row.length === 4 && Number.isSafeInteger(row[0]) &&
  typeof row[1] === 'string' && typeof row[2] === 'string' &&
  /^(Nasdaq|NYSE(?: American| Arca)?|Cboe(?: BZX)?|IEX|MEMX|LTSE|MIAX(?: Pearl)?|TXSE)$/i.test(row[3] || ''));
if (data.length < 1000) throw new Error('Too few supported listings; existing snapshot was not changed.');
await writeFile(new URL('../functions/_data/sec-listings.json', import.meta.url),
  JSON.stringify({ source, snapshot: new Date().toISOString().slice(0, 10), fields, data }) + '\n');
console.log(`Refreshed directory: ${data.length} SEC exchange-listed records.`);
