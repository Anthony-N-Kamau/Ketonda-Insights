# Ketonda Insights on Cloudflare Pages

This version keeps the Learn guides, browser-based investment calculators, and manual equity DCF. Its Equity Securities page searches a bundled SEC ticker directory and opens the selected issuer’s updates. It does not use the private Perplexity connector. Live quotes, automated fiscal comparisons, statement CSV, and the original AI scenario endpoint (`/api/analyse`) are not included in this Cloudflare version.

## Test locally

Use Node.js 22.12 or later.

```sh
npm ci
npm test
npm run dev
```

Open the URL printed by Wrangler. Search `Microsoft` or `AAPL`. Search and the link to the issuer’s full SEC filings work without a secret. The on-site filings and press sections explain their state when disabled, empty or unavailable.

To configure local live feeds, copy `.dev.vars.example` to `.dev.vars` and fill it in locally. Do not commit `.dev.vars`, API keys or tokens.

## Deploy from GitHub to Cloudflare Pages

1. Put the package contents in the root of your existing GitHub repository while retaining any repo-specific files you need. To test without replacing production, push to a new branch and enable preview deployments for that branch.
2. In the Pages project’s Git build settings, select **None** for the framework preset. Set **Build command** to `npm run build`, **Build output directory** to `dist`, and leave **Root directory** blank if the project files are at the repository root. The project pins Node 22.23.4 in `.node-version`; remove or update any older `NODE_VERSION` override. Keep the `functions/` folder at the project root, outside `dist`. If you bring an existing `wrangler.jsonc` or `wrangler.toml`, review it first: Cloudflare may take runtime settings from that file instead of the dashboard.
3. In **Workers & Pages → your Pages project → Settings → Variables and Secrets**, configure the following for the environment you want to test. Preview and Production have separate settings. Redeploy after making changes.

   | Name | Kind | Purpose |
   |---|---|---|
   | `SEC_USER_AGENT` | Runtime variable | A descriptive app name followed by your real technical contact email. Enables official SEC filings on the page. Replace the example address; it is deliberately not accepted. |
   | `FMP_PUBLIC_NEWS` | Runtime variable | Set to `true` only once your agreement permits displaying the headlines, dates, publishers and links to this audience. Defaults to off. |
   | `FMP_API_KEY` | Encrypted secret | A Financial Modeling Prep key for the permitted stock news endpoint. Store it in Cloudflare, not GitHub or JavaScript. |

4. On the Cloudflare preview branch, open `/api/equity/health` and look for JSON containing `"status":"ok"`. Search by name and ticker, click a result, and check the two update sections and outbound links before promoting the branch.

See [Cloudflare’s Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/), [Pages Functions setup](https://developers.cloudflare.com/pages/functions/get-started/), and [Pages runtime bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/). Uploading only the `dist` files as an ordinary static site does not deploy the Functions. GitHub Pages alone also does not run them; use the Cloudflare site as the public URL.

## Sources and maintenance

- **Stock directory:** [SEC ticker and exchange associations](https://www.sec.gov/files/company_tickers_exchange.json). The packaged snapshot excludes OTC and records without a supported exchange. It is not a global exchange directory, a market quote, or a guarantee of listing status. `/api/equity/health` exposes the snapshot date. To refresh it, run `SEC_USER_AGENT="Your App admin@your-domain.com" npm run refresh:directory`, inspect the resulting diff, then redeploy. If the SEC serves a 403 from your build network, save its official JSON from an allowed environment and use `npm run refresh:directory -- /path/to/company_tickers_exchange.json`. Do not turn the entire directory into a per-search upstream fetch.
- **Official filings:** Reads the [SEC Submissions API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) for the selected issuer. Shows recent 8-K, 6-K, 10-Q, 10-K, 20-F and 40-F filings, including amendments. These are disclosures, not press articles. The local SEC cache is separate from the press cache. Follow the [SEC fair access policy](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data). For significant traffic, coordinate an aggregate upstream rate cap rather than treating the edge cache as a rate limiter.
- **Press headlines:** Uses [FMP’s ticker-specific stock news API](https://site.financialmodelingprep.com/developer/docs/stable/search-stock-news). Only headlines, dates, publishers and outbound links are returned. Confirm permitted display, territory and caching in [the provider agreement](https://site.financialmodelingprep.com/insights/platform/can-you-use-fmp-data-in-a-public-app-website-or-client-dashboard) before enabling the feature. FMP coverage varies by ticker.
- **Public abuse protection:** Before opening the paid feed, set a [Cloudflare rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/) for `/api/equity/news/*`, where available, and configure provider-side usage limits. The Functions validate inputs and cache successful upstream results, but neither the cache nor same-origin browser requests impose a global request ceiling.

The automated tests use a real directory snapshot and synthetic news payloads, not a persisted provider key. Use an authorized Cloudflare branch preview to verify live press once the production data agreement and credentials are in place.
