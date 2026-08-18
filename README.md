# AIODL

All In One Downloader — lightweight web UI + Node/Express scraper API.

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repository into Vercel.
3. Keep the project root at the repository root.
4. Deploy with the default build settings.
5. Add the custom domain `aiodl.suwung.id` in Vercel.

The project includes `api/index.js` and `vercel.json` for Vercel Functions. Express is supported directly by Vercel. The scraper function is configured for up to 60 seconds; actual limits depend on the Vercel plan/runtime configuration.

## Local

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Environment variables

See `.env.example`.

- `AIODL_RATE_LIMIT` — scrape requests per IP per minute (default 30)
- `AIODL_REQUEST_TIMEOUT` — upstream request timeout in seconds (default 30)
- `AIODL_USER_AGENT` — optional custom User-Agent

## Notes

AIODL returns direct media URLs from the existing scraper layer instead of proxying the media through the server. This keeps server bandwidth and memory usage low.
