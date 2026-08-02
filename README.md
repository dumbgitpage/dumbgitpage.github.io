# JobScout Search

JobScout Search is a local AI-backed job search engine that finds live job listings and official career pages using open web search results.

## Features

- live search using open HTML search results
- job link heuristics to focus on official career pages and apply links
- filters for location, job type, remote status, experience and category
- AI ranking endpoint support with a fallback local ranking model
- clean SEO-friendly title and description

## Setup

```bash
npm install
npm start
```

Open the app in your browser at the host and port configured for your environment.

## Environment

This project supports an open-source search backend via the `SEARCH_ENGINE_ENDPOINT` environment variable. Set it to a compatible public or self-hosted search service, for example:

```bash
export SEARCH_ENGINE_ENDPOINT="https://searx.example.com/search"
```

If no endpoint is provided, the app defaults to `https://searx.be/search`.

## How it works

- `index.html` contains the search-first homepage and results experience
- `script.js` calls `/api/search` for live job search results and uses a detail page link
- `job-detail.html` fetches listing details from `/api/job-detail` and renders available fields dynamically
- `server.js` scrapes search results, filters job-specific links, ranks them, and proxies job detail requests
- if `LOCAL_AI_ENDPOINT` is configured, the server forwards results to that AI service

## Production

This app is ready to run behind a production web server or reverse proxy. Use `PORT` to configure the listening port, and set `SEARCH_ENGINE_ENDPOINT` to a self-hosted or public open-source search endpoint for stable job search results.

## Notes

- This implementation avoids hardcoded job data and JSON datasets for live results.
- The site is designed for official job and careers pages, not company about pages.
- Use a real local AI endpoint with `LOCAL_AI_ENDPOINT` if you want advanced model-driven ranking.
