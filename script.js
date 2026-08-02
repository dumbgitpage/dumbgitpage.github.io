const RESULTS_PER_PAGE = 8;
let currentPage = 1;
let searchResults = [];

const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const exampleButtons = document.querySelectorAll('.example-button');
const resultsCount = document.getElementById('resultsCount');
const currentQuery = document.getElementById('currentQuery');
const resultsContainer = document.getElementById('results');
const paginationBottom = document.getElementById('paginationBottom');

async function performSearch(queryValue) {
  const query = queryValue !== undefined ? queryValue : searchInput.value.trim();
  if (!query) {
    showEmptyState('Enter a search term to begin searching official job listings.');
    return;
  }

  currentPage = 1;
  resultsCount.textContent = 'Searching…';
  currentQuery.textContent = `Looking for official job listings for "${query}"`;
  resultsContainer.innerHTML = '<p class="result-snippet">Searching live job sources…</p>';

  try {
    const results = await fetchSearchResults(query);
    searchResults = results;
    render(query);
  } catch (error) {
    console.error('Search failed:', error);
    showError('Search failed. Please try again later.');
  }
}

function updateSummary(query) {
  resultsCount.textContent = `${searchResults.length.toLocaleString()} result${searchResults.length === 1 ? '' : 's'} found`;
  currentQuery.textContent = `Showing results for "${query}"`;
}

function showEmptyState(message) {
  searchResults = [];
  currentPage = 1;
  resultsCount.textContent = '0 results found';
  currentQuery.textContent = message;
  resultsContainer.innerHTML = '<p class="result-snippet">' + escapeHtml(message) + '</p>';
  paginationBottom.innerHTML = '';
}

function showError(message) {
  searchResults = [];
  currentPage = 1;
  resultsCount.textContent = '0 results found';
  currentQuery.textContent = message;
  resultsContainer.innerHTML = '<p class="result-snippet">' + escapeHtml(message) + '</p>';
  paginationBottom.innerHTML = '';
}

async function fetchSearchResults(query) {
  const params = new URLSearchParams({
    q: query,
  });

  const response = await fetch(`/api/search?${params.toString()}`);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || 'Network error');
  }

  const payload = await response.json();
  return payload.results || [];
}

function render(query) {
  const totalResults = searchResults.length;
  const pageCount = Math.max(1, Math.ceil(totalResults / RESULTS_PER_PAGE));
  currentPage = Math.min(currentPage, pageCount);

  const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
  const endIndex = startIndex + RESULTS_PER_PAGE;
  const pageResults = searchResults.slice(startIndex, endIndex);

  updateSummary(query);

  resultsContainer.innerHTML = pageResults.length
    ? pageResults.map(buildResultCard).join('')
    : '<p class="result-snippet">No official job pages found. Try another query or adjust your search.</p>';

  renderPagination(pageCount);
}

function buildResultCard(result) {
  const detailLink = `job-detail.html?url=${encodeURIComponent(result.link)}&title=${encodeURIComponent(result.title)}`;
  const typeLabel = result.isJobPage ? 'Job listing' : 'Related page';

  const careerLabel = result.careerPage ? `From ${escapeHtml(result.sourceName)} career page` : '';
  return `
    <article class="result-card">
      <div class="result-card-top">
        <div>
          <h3><a class="result-link" href="${detailLink}">${escapeHtml(result.title || 'Untitled result')}</a></h3>
          <p class="result-source">${escapeHtml(result.sourceName || result.source || 'official source')}</p>
          ${careerLabel ? `<p class="result-snippet">${careerLabel}</p>` : ''}
        </div>
        <span class="tag">${escapeHtml(typeLabel)}</span>
      </div>
      <p class="result-snippet">${escapeHtml(result.snippet || 'Live web search result from the open internet.')}</p>
      <div class="result-actions">
        <a class="visit-button" href="${detailLink}">View details</a>
        <span class="result-source">${escapeHtml(result.link)}</span>
      </div>
    </article>
  `;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPagination(pageCount) {
  paginationBottom.innerHTML = '';
  if (pageCount <= 1) return;

  const buttons = [];
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(pageCount, currentPage + 2);

  buttons.push(`<button class="page-button" data-action="prev" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`);

  if (startPage > 1) {
    buttons.push(`<button class="page-number" data-page="1">1</button>`);
    if (startPage > 2) buttons.push(`<span class="page-number">…</span>`);
  }

  for (let page = startPage; page <= endPage; page += 1) {
    buttons.push(`<button class="page-number ${page === currentPage ? 'active' : ''}" data-page="${page}">${page}</button>`);
  }

  if (endPage < pageCount) {
    if (endPage < pageCount - 1) buttons.push(`<span class="page-number">…</span>`);
    buttons.push(`<button class="page-number" data-page="${pageCount}">${pageCount}</button>`);
  }

  buttons.push(`<button class="page-button" data-action="next" ${currentPage === pageCount ? 'disabled' : ''}>Next</button>`);
  paginationBottom.innerHTML = buttons.join('');
  attachPaginationEvents();
}

function attachPaginationEvents() {
  const buttons = [...paginationBottom.querySelectorAll('[data-page], [data-action]')];
  buttons.forEach(button => {
    button.addEventListener('click', event => {
      const action = event.currentTarget.dataset.action;
      const page = Number(event.currentTarget.dataset.page);
      if (action === 'prev' && currentPage > 1) currentPage -= 1;
      else if (action === 'next' && currentPage < Math.ceil(searchResults.length / RESULTS_PER_PAGE)) currentPage += 1;
      else if (page) currentPage = page;
      render(searchInput.value.trim() || '');
    });
  });
}

function bindEvents() {
  searchButton.addEventListener('click', () => performSearch());
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') performSearch();
  });

  exampleButtons.forEach(button => {
    button.addEventListener('click', () => performSearch(button.dataset.query));
  });
}

function initialize() {
  bindEvents();
  showEmptyState('Enter a search term to begin searching official job listings.');
}

document.addEventListener('DOMContentLoaded', initialize);
