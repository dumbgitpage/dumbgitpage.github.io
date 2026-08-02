import express from 'express';
import { load } from 'cheerio';

const PORT = Number(process.env.PORT || 3000);
const LOCAL_AI_ENDPOINT = process.env.LOCAL_AI_ENDPOINT || null;

const app = express();
app.use(express.json());
app.use(express.static('.'));

const SEARCH_HTML_ENDPOINT = process.env.SEARCH_ENGINE_ENDPOINT || 'https://searx.be/search';
const FETCH_TIMEOUT = 10000;
const FETCH_RETRIES = 2;

async function fetchWithRetry(url, options = {}, retries = FETCH_RETRIES, timeout = FETCH_TIMEOUT) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt === retries) break;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Query parameter `q` is required.' });
  }

  const filters = {
    location: String(req.query.location || '').trim(),
    type: String(req.query.type || '').trim(),
    remote: String(req.query.remote || '').trim(),
    experience: String(req.query.experience || '').trim(),
    category: String(req.query.category || '').trim(),
  };

  try {
    const rawResults = await fetchWebResults(query, filters, 20);
    const results = await processResultsWithAi(query, filters, rawResults);
    return res.json({ query, results });
  } catch (error) {
    console.error('Search service error:', error);
    return res.status(500).json({ error: 'Unable to perform search at this time.' });
  }
});

app.get('/api/job-detail', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url) {
    return res.status(400).json({ error: 'Query parameter `url` is required.' });
  }

  try {
    const normalizedUrl = normalizeLink(url);
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobScoutSearch/1.0; +https://example.com)'
      }
    });
    const html = await response.text();
    const $ = load(html);
    const details = extractJobDetail($, normalizedUrl);
    return res.json(details);
  } catch (error) {
    console.error('Job detail fetch error:', error);
    return res.status(500).json({ error: 'Unable to fetch job details.' });
  }
});

function extractJobDetail($, link) {
  const host = extractHostname(link);
  const title = $('h1').first().text().trim() || $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '';
  const company = $('[class*=company], [id*=company]').first().text().trim() || $('meta[property="og:site_name"]').attr('content') || host;
  const location = $('[class*=location], [id*=location], [class*=place], [id*=place]').first().text().trim();
  const posted = $('[class*=date], [class*=posted], [id*=date], [id*=posted], [class*=published]').first().text().trim();

  const descriptionCandidates = [];
  $('[class*=description], [id*=description], [class*=job-desc], [id*=job-desc], [class*=jobDescription], [class*=posting], [class*=summary], [class*=overview], [class*=detail], article, main').each((_, element) => {
    const text = $(element).text().trim();
    if (text.length > 120) descriptionCandidates.push(text.replace(/\s+/g, ' '));
  });

  const description = descriptionCandidates[0] || $('meta[name="description"]').attr('content') || '';
  const applyUrl = link;

  return {
    title,
    company,
    location,
    posted,
    description,
    applyUrl,
    source: host,
    originalUrl: link,
  };
}

function buildSearchPrompt(query, filters) {
  const parts = [`Search for live job opportunities and official career pages for: "${query}".`];
  if (filters.location) parts.push(`Location or region: ${filters.location}.`);
  if (filters.type && filters.type !== 'all') parts.push(`Job type: ${filters.type}.`);
  if (filters.remote && filters.remote !== 'all') parts.push(`Remote style: ${filters.remote}.`);
  if (filters.experience && filters.experience !== 'all') parts.push(`Experience level: ${filters.experience}.`);
  if (filters.category && filters.category !== 'all') parts.push(`Category or industry: ${filters.category}.`);
  parts.push('Prioritize official job listing pages and show apply links when available.');
  return parts.join(' ');
}

async function fetchWebResults(query, filters, limit) {
  const searchQuery = buildSearchQuery(query, filters);
  const url = `${SEARCH_HTML_ENDPOINT}?q=${encodeURIComponent(searchQuery)}&format=json`;
  const response = await fetchWithRetry(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JobScoutSearch/1.0; +https://example.com)',
      'Accept': 'application/json,text/html'
    }
  });

  const text = await response.text();
  let jsonData = null;
  try {
    jsonData = JSON.parse(text);
  } catch {
    jsonData = null;
  }

  if (jsonData && typeof jsonData === 'object') {
    return finishSearchResults(parseSearchJson(jsonData), query, filters, limit);
  }

  const $ = load(text);
  const results = [];

  $('.result').each((_, element) => {
    if (results.length >= limit * 3) return false;
    const anchor = $(element).find('.result__a');
    const title = anchor.text().trim();
    let link = anchor.attr('href') || '';
    link = normalizeLink(link, url);
    const snippet = $(element).find('.result__snippet').text().trim();
    const source = extractHostname(link);

    if (!title || !link) return;
    if (isBlockedPage(link, title, snippet)) return;

    const result = { title, snippet, link, source, sourceName: source, rawSource: source };
    results.push(result);
  });

  return finishSearchResults(results, query, filters, limit);
}

async function finishSearchResults(results, query, filters, limit) {
  results.forEach(result => {
    result.jobScore = scoreJobResult(query, result, filters);
    result.isCareerPage = isCareerPageCandidate(result);
  });

  const nonGenericResults = results.filter(item => !isGenericJobHost(item.link));
  const careerPages = nonGenericResults
    .filter(item => item.isCareerPage)
    .sort((a, b) => b.jobScore - a.jobScore)
    .slice(0, limit);

  const scrapedJobs = [];
  for (const page of careerPages) {
    try {
      const jobs = await parseCareerPage(page.link, 20);
      if (jobs.length) {
        scrapedJobs.push(...jobs.map(job => ({
          title: job.title,
          snippet: job.snippet || `From ${page.sourceName}`,
          link: job.link,
          source: extractHostname(job.link),
          sourceName: extractHostname(job.link),
          rawSource: page.rawSource,
          jobScore: 100,
          isJobPage: true,
          careerPage: page.link,
          careerTitle: page.title,
        })));
      }
    } catch (error) {
      console.warn('Failed to parse career page', page.link, error.message || error);
    }
  }

  if (scrapedJobs.length) {
    return scrapedJobs.slice(0, limit);
  }

  const nonGenericJobResults = nonGenericResults.filter(item => item.isCareerPage).sort((a, b) => b.jobScore - a.jobScore);
  if (nonGenericJobResults.length) {
    return nonGenericJobResults.slice(0, limit);
  }

  const genericCareerPages = results
    .filter(item => item.isCareerPage)
    .sort((a, b) => b.jobScore - a.jobScore)
    .slice(0, limit);
  if (genericCareerPages.length) {
    return genericCareerPages;
  }

  return results.sort((a, b) => b.jobScore - a.jobScore).slice(0, limit);
}

function parseSearchJson(data) {
  const results = [];
  if (!data || !Array.isArray(data.results)) return results;

  for (const item of data.results) {
    const title = String(item.title || item.name || '').trim();
    const snippet = String(item.content || item.description || item.snippet || '').trim();
    const rawUrl = String(item.url || item.link || item.uri || item.source || '').trim();
    const link = normalizeLink(rawUrl, SEARCH_HTML_ENDPOINT);
    if (!title || !link || isBlockedPage(link, title, snippet)) continue;

    const source = extractHostname(link);
    results.push({
      title,
      snippet,
      link,
      source,
      sourceName: source,
      rawSource: source
    });
  }

  return results;
}

function buildSearchQuery(query, filters) {
  const terms = [query.trim()];
  if (filters.location) terms.push(filters.location.trim());
  if (filters.remote && filters.remote.toLowerCase() === 'remote') terms.push('remote');
  if (filters.type && filters.type.toLowerCase() !== 'all') terms.push(filters.type.trim());
  return terms.filter(Boolean).join(' ') + ' careers jobs';
}

function isGenericJobHost(link) {
  const host = extractHostname(link).toLowerCase();
  const genericHosts = [
    'linkedin.com', 'indeed.com', 'glassdoor.com', 'monster.com',
    'ziprecruiter.com', 'naukri.com', 'timesjobs.com', 'shine.com',
    'reed.co.uk', 'totaljobs.com', 'hired.com', 'simplyhired.com'
  ];
  return genericHosts.some(domain => host.includes(domain));
}

function isCareerPageCandidate(result) {
  const normalizedText = `${result.title} ${result.snippet} ${result.link}`.toLowerCase();
  let path = '';
  try {
    path = new URL(result.link).pathname.toLowerCase();
  } catch {
    path = result.link.toLowerCase();
  }

  const strongCareerPath = /\/careers?$|\/jobs?$|\/openings?$|\/positions?$|\/vacanc/i;
  const deepCareerPath = /\/jobs\/|\/careers\/|\/opportunities\/|\/join-us\//;
  const negativePath = /about|team|privacy|terms|press|blog|contact|support|newsletter|investor|policy/;
  const careerKeywords = /career|careers|job|jobs|hiring|vacanc|opening|openings|recruitment|apply|workday|talent|join-us|opportunities/;

  if (negativePath.test(path) || negativePath.test(normalizedText)) return false;
  if (strongCareerPath.test(path) || deepCareerPath.test(path)) return true;
  return careerKeywords.test(normalizedText);
}

async function parseCareerPage(url, limit) {
  const response = await fetchWithRetry(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JobScoutSearch/1.0; +https://example.com)'
    }
  });
  const html = await response.text();
  const $ = load(html);

  const schemaJobs = extractJobPostingsFromSchema($, url);
  if (schemaJobs.length) {
    return schemaJobs.slice(0, limit).map(job => ({
      title: job.title || 'Job listing',
      link: job.applyUrl || url,
      snippet: job.description ? job.description.slice(0, 220) : '',
      score: 100
    }));
  }

  const jobCandidates = new Map();
  const selectors = ['a[href]', 'li a[href]', '.job a[href]', '.opening a[href]', '.position a[href]'];
  $(selectors.join(', ')).each((_, element) => {
    const anchor = $(element);
    const hrefRaw = anchor.attr('href') || '';
    const href = normalizeLink(hrefRaw, url);
    const text = anchor.text().trim();
    const lowerText = text.toLowerCase();
    if (!href || !text || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
    if (isBlockedPage(href, text, '')) return;

    const candidateScore = scoreJobLinkCandidate(href, lowerText);
    if (candidateScore < 40) return;

    const snippet = extractJobSnippet(anchor);
    const title = text.length > 2 ? text : extractJobTitleFromContext(anchor);
    if (!title || title.length < 4) return;

    jobCandidates.set(href, {
      title: title.trim(),
      link: href,
      snippet: snippet || '',
      score: candidateScore
    });
  });

  const jobs = [...jobCandidates.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return jobs;
}


function extractJobSnippet(anchor) {
  const container = anchor.closest('li, .job, .opening, .position, .listing, .card, .row, .item');
  if (container.length) {
    const text = container.text().trim();
    if (text.length > 60) return text.replace(/\s+/g, ' ').slice(0, 220);
  }
  const parentText = anchor.parent().text().trim();
  if (parentText.length > 60) return parentText.replace(/\s+/g, ' ').slice(0, 220);
  return anchor.text().trim();
}

function extractJobTitleFromContext(anchor) {
  const heading = anchor.closest('h1, h2, h3, h4, h5').first();
  if (heading.length) return heading.text().trim();
  const parentHeading = anchor.parent().closest('h1, h2, h3, h4, h5').first();
  return parentHeading.length ? parentHeading.text().trim() : '';
}

function isBlockedPage(link, title, snippet) {
  const blocked = [/\babout\b/i, /\bteam\b/i, /\bprivacy\b/i, /\bterms\b/i, /\bpress\b/i, /\bblog\b/i, /\bcontact\b/i, /\bsupport\b/i, /\bnewsletter\b/i, /\binvestor\b/i, /\bpolicy\b/i];
  const text = `${title} ${snippet} ${link}`;
  return blocked.some(re => re.test(text));
}

function scoreJobResult(query, result, filters) {
  const normalizedText = [result.title, result.snippet, result.link, query, filters.location, filters.category].join(' ').toLowerCase();
  let score = 0;

  const queryTokens = tokenizeText(query);
  queryTokens.forEach(token => {
    if (normalizedText.includes(token)) score += 12;
  });

  if (filters.location && normalizedText.includes(filters.location.toLowerCase())) score += 20;
  if (filters.remote && /remote|work from home|telecommute|distributed/.test(normalizedText)) score += 18;
  if (filters.type && filters.type !== 'all' && normalizedText.includes(filters.type.toLowerCase())) score += 8;
  if (filters.experience && filters.experience !== 'all' && normalizedText.includes(filters.experience.toLowerCase())) score += 6;
  if (filters.category && normalizedText.includes(filters.category.toLowerCase())) score += 5;

  const trustedHosts = ['indeed.com','linkedin.com','glassdoor.com','monster.com','ziprecruiter.com','workday.com','greenhouse.io','lever.co','smartrecruiters.com'];
  if (trustedHosts.some(host => result.link.toLowerCase().includes(host))) score += 20;

  if (/\/careers?\b|\/jobs?\b|\/openings?\b|\/positions?\b|\/vacanc/i.test(result.link.toLowerCase())) score += 18;
  if (/career|job|opening|vacancy|hiring|apply|opportunity|position/.test(normalizedText)) score += 15;

  const ageMatch = normalizedText.match(/(\d+)\s*(day|hour|minute|week|month)s?\s*(ago|old)?/);
  if (ageMatch) {
    const num = Number(ageMatch[1]);
    const unit = ageMatch[2];
    if (unit.startsWith('hour') || unit.startsWith('minute')) score += 10;
    else if (unit.startsWith('day')) score += Math.max(0, 10 - num);
    else if (unit.startsWith('week')) score += Math.max(0, 8 - num * 2);
    else if (unit.startsWith('month')) score -= num > 3 ? 25 : 5;
  }

  if (/privacy|terms|login|signup|press|news|about|support|contact|investor|policy|cookie/.test(normalizedText)) {
    score -= 40;
  }

  if (isGenericJobHost(result.link) && !result.careerPage) {
    score -= 10;
  }

  return Math.max(0, score);
}

function scoreJobLinkCandidate(href, text) {
  let score = 0;
  const lowerHref = href.toLowerCase();
  const lowerText = text.toLowerCase();

  if (/career|careers|job|jobs|opening|openings|vacancy|vacancies|recruitment|apply|position|role|opportunity|workday|greenhouse|lever|smartrecruiters|breezy/.test(lowerHref)) score += 30;
  if (/career|careers|job|jobs|opening|openings|vacancy|vacancies|recruitment|apply|position|role|opportunity/.test(lowerText)) score += 25;
  if (/(apply|view|details|learn more|discover|join)/.test(lowerText)) score += 10;
  if (/jobs\/|job-|position|vacanc|career|opening|apply/.test(lowerHref)) score += 12;

  if (/^(https?:\/\/)?(www\.)?wikipedia\./.test(lowerHref)) score -= 60;
  if (/(about|team|privacy|terms|press|blog|contact|support|newsletter|investor|policy|cookie)/.test(lowerHref + lowerText)) score -= 50;
  if (isGenericJobHost(href) && !/jobs\//.test(lowerHref)) score -= 20;

  return score;
}

function normalizeLink(link, base = null) {
  let url = String(link || '').trim();
  if (!url) return '';
  if (url.startsWith('//')) url = `https:${url}`;

  try {
    let parsed = new URL(url, base || undefined);

    if (parsed.pathname === '/l/' && parsed.searchParams.has('uddg')) {
      url = decodeURIComponent(parsed.searchParams.get('uddg'));
      parsed = new URL(url, base || undefined);
    }

    const trackingParams = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref','fbclid','gclid','yclid','trk','trkCampaign','mc_cid','mc_eid'];
    trackingParams.forEach(param => parsed.searchParams.delete(param));
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

function extractJobPostingsFromSchema($, sourceUrl) {
  const results = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    let jsonText = $(element).html();
    if (!jsonText) return;

    try {
      const data = JSON.parse(jsonText.trim());
      const entries = Array.isArray(data) ? data : [data];
      entries.forEach(item => {
        if (!item || item['@type'] !== 'JobPosting') return;
        const applyUrl = String(item.url || item.sameAs || sourceUrl || '').trim();
        results.push({
          title: String(item.title || item.jobTitle || '').trim(),
          company: String((item.hiringOrganization && item.hiringOrganization.name) || item.hiringOrganization || '').trim(),
          location: String((item.jobLocation && item.jobLocation.address && item.jobLocation.address.addressLocality) || item.jobLocation?.name || '').trim(),
          posted: String(item.datePosted || '').trim(),
          description: String(item.description || item.jobDescription || '').trim().replace(/\s+/g, ' '),
          applyUrl: normalizeLink(applyUrl, sourceUrl),
          source: extractHostname(applyUrl || sourceUrl),
        });
      });
    } catch {
      // ignore invalid schema blocks
    }
  });
  return results;
}

function extractHostname(link) {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return link;
  }
}

function processResultsWithAi(query, filters, results) {
  if (!LOCAL_AI_ENDPOINT) {
    return Promise.resolve(rankResultsUsingModel(query, filters, results));
  }

  return fetch(LOCAL_AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, filters, results })
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Local AI endpoint responded with ${response.status}`);
      }
      return response.json();
    })
    .then(payload => {
      if (Array.isArray(payload.results) && payload.results.length) {
        return payload.results.map((result, index) => ({ rank: index + 1, ...result }));
      }
      return rankResultsUsingModel(query, filters, results);
    })
    .catch(error => {
      console.warn('AI pipeline fallback:', error.message || error);
      return rankResultsUsingModel(query, filters, results);
    });
}

function rankResultsUsingModel(query, filters, results) {
  const tokens = tokenizeText(query);
  return results
    .map((result, index) => {
      const text = [result.title, result.snippet, result.source, result.sourceName, result.link].join(' ');
      const score = computeRelevanceScore(tokens, text, filters);
      return { ...result, score, rank: index + 1 };
    })
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

function computeRelevanceScore(tokens, text, filters) {
  const normalized = normalizeText(text);
  let score = 0;
  tokens.forEach(token => {
    if (normalized.includes(token)) score += 12;
    if (normalized.startsWith(token)) score += 6;
  });

  if (filters.location && normalized.includes(normalizeText(filters.location))) score += 8;
  if (filters.category && normalized.includes(normalizeText(filters.category))) score += 6;
  if (filters.remote && filters.remote !== 'all' && normalized.includes(normalizeText(filters.remote))) score += 5;
  if (filters.type && filters.type !== 'all' && normalized.includes(normalizeText(filters.type))) score += 5;
  if (filters.experience && filters.experience !== 'all' && normalized.includes(normalizeText(filters.experience))) score += 4;

  return score;
}

function tokenizeText(text) {
  return normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean);
}

function normalizeText(text) {
  return text?.toString().trim().toLowerCase() || '';
}

app.listen(PORT, () => {
  console.log(`Search server running on http://localhost:${PORT}`);
  if (LOCAL_AI_ENDPOINT) {
    console.log(`Local AI endpoint configured: ${LOCAL_AI_ENDPOINT}`);
  }
});
