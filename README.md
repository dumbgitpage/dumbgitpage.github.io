# Global Job Search Engine

A static website built to search job postings from a JSON dataset. The site supports keyword search, filters, and pagination without hardcoded job cards.

## Features

- dynamic search from `jobs.json`
- filter by location, job type, remote mode, experience, and category
- result ranking by relevance
- pagination for search results
- responsive job search interface

## How it works

- `index.html` contains the search UI and filter controls
- `styles.css` contains the site styling
- `script.js` loads `jobs.json`, applies filters, computes relevance, and renders paginated results
- `jobs.json` contains the job postings data

## Usage

1. Open `index.html` in a browser.
2. Type keywords in the search box.
3. Use filter controls to refine by location, type, remote style, experience or category.
4. Click `Search` or press Enter.
5. Browse results with pagination.

## Deploying

This site is ready for GitHub Pages or any static host.

## Extending the dataset

Add or update records within `jobs.json` to expand job coverage. Each record should include:

- `id`
- `title`
- `company`
- `location`
- `remote`
- `type`
- `experience`
- `category`
- `salary`
- `description`
- `applyUrl`
- `tags`

## Notes

If the browser blocks local file loading, use a local static server such as `Live Server`, `python -m http.server`, or host on GitHub Pages.
