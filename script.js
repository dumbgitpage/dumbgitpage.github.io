const RESULTS_PER_PAGE = 8;

let jobs = [];
let filteredJobs = [];
let currentPage = 1;

const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const locationFilter = document.getElementById('locationFilter');
const typeFilter = document.getElementById('typeFilter');
const remoteFilter = document.getElementById('remoteFilter');
const experienceFilter = document.getElementById('experienceFilter');
const categoryFilter = document.getElementById('categoryFilter');
const clearFiltersButton = document.getElementById('clearFilters');
const resultsCount = document.getElementById('resultsCount');
const currentQuery = document.getElementById('currentQuery');
const resultsContainer = document.getElementById('results');
const paginationTop = document.getElementById('paginationTop');
const paginationBottom = document.getElementById('paginationBottom');

function fetchJobs() {
    return fetch('jobs.json')
        .then(response => response.json())
        .then(data => {
            jobs = data;
            filteredJobs = jobs;
            render();
        })
        .catch(error => {
            resultsContainer.innerHTML = '<p class="error-message">Unable to load jobs. Please try again later.</p>';
            console.error('Error loading jobs.json:', error);
        });
}

function normalizeText(text) {
    return text?.toString().trim().toLowerCase() || '';
}

function buildSearchTokens(query) {
    const normalized = normalizeText(query);
    if (!normalized) return [];
    return normalized.split(/\s+/).filter(Boolean);
}

function scoreJob(job, tokens) {
    if (!tokens.length) return 0;

    const title = normalizeText(job.title);
    const company = normalizeText(job.company);
    const location = normalizeText(job.location);
    const description = normalizeText(job.description);
    const category = normalizeText(job.category);
    const tags = (job.tags || []).map(normalizeText).join(' ');
    const remote = normalizeText(job.remote);

    let score = 0;
    tokens.forEach(token => {
        if (title.includes(token)) score += 12;
        if (company.includes(token)) score += 10;
        if (description.includes(token)) score += 6;
        if (tags.includes(token)) score += 8;
        if (category.includes(token)) score += 6;
        if (location.includes(token)) score += 4;
        if (remote.includes(token)) score += 2;

        if (title.startsWith(token)) score += 5;
        if (job.title.toLowerCase() === token) score += 8;
    });

    return score;
}

function applyFilters() {
    const searchTerm = normalizeText(searchInput.value);
    const locationTerm = normalizeText(locationFilter.value);
    const typeValue = typeFilter.value;
    const remoteValue = remoteFilter.value;
    const experienceValue = experienceFilter.value;
    const categoryValue = categoryFilter.value;
    const tokens = buildSearchTokens(searchTerm);

    filteredJobs = jobs
        .map(job => {
            const score = scoreJob(job, tokens);
            return { job, score };
        })
        .filter(({ job, score }) => {
            if (searchTerm && score === 0) return false;
            if (locationTerm) {
                const locationMatch = normalizeText(job.location).includes(locationTerm);
                const remoteMatch = normalizeText(job.remote).includes(locationTerm);
                if (!locationMatch && !remoteMatch) return false;
            }
            if (typeValue !== 'all' && job.type !== typeValue) return false;
            if (remoteValue !== 'all' && job.remote !== remoteValue) return false;
            if (experienceValue !== 'all' && job.experience !== experienceValue) return false;
            if (categoryValue !== 'all' && job.category !== categoryValue) return false;
            return true;
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.job.title.localeCompare(b.job.title);
        })
        .map(({ job }) => job);

    currentPage = 1;
    render();
}

function render() {
    const totalJobs = filteredJobs.length;
    const pageCount = Math.max(1, Math.ceil(totalJobs / RESULTS_PER_PAGE));
    currentPage = Math.min(currentPage, pageCount);

    const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
    const endIndex = startIndex + RESULTS_PER_PAGE;
    const jobsToRender = filteredJobs.slice(startIndex, endIndex);

    resultsCount.textContent = `${totalJobs.toLocaleString()} job${totalJobs === 1 ? '' : 's'} found`;

    const queryText = searchInput.value.trim();
    currentQuery.textContent = queryText
        ? `Showing results for "${queryText}"` : 'Showing all available jobs. Use filters to refine.';

    resultsContainer.innerHTML = jobsToRender.length
        ? jobsToRender.map(buildJobCard).join('')
        : '<p class="empty-state">No matching jobs found. Try a broader search or remove a filter.</p>';

    renderPagination(pageCount);
}

function buildJobCard(job) {
    return `
        <article class="job-card">
            <div class="job-card-header">
                <div>
                    <h3>${job.title}</h3>
                    <p class="job-company">${job.company}</p>
                </div>
                <div class="badges">
                    <span class="badge">${job.remote}</span>
                    <span class="badge">${job.type}</span>
                </div>
            </div>
            <div class="job-meta">
                <span>📍 ${job.location}</span>
                <span>⭐ ${job.experience}</span>
                <span>💼 ${job.category}</span>
                <span>💰 ${job.salary}</span>
            </div>
            <p class="job-description">${job.description}</p>
            <a class="apply-link" href="${job.applyUrl}" target="_blank" rel="noreferrer noopener">Apply now</a>
        </article>
    `;
}

function renderPagination(pageCount) {
    paginationTop.innerHTML = '';
    paginationBottom.innerHTML = '';

    if (pageCount <= 1) return;

    const paginationMarkup = createPaginationMarkup(pageCount);
    paginationTop.innerHTML = paginationMarkup;
    paginationBottom.innerHTML = paginationMarkup;

    attachPaginationEvents();
}

function createPaginationMarkup(pageCount) {
    const pageButtons = [];
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(pageCount, currentPage + 2);

    pageButtons.push(`<button class="page-button" data-action="prev" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`);

    if (startPage > 1) {
        pageButtons.push(`<button class="page-number" data-page="1">1</button>`);
        if (startPage > 2) {
            pageButtons.push(`<span class="page-number">…</span>`);
        }
    }

    for (let page = startPage; page <= endPage; page += 1) {
        pageButtons.push(
            `<button class="page-number ${page === currentPage ? 'active' : ''}" data-page="${page}">${page}</button>`
        );
    }

    if (endPage < pageCount) {
        if (endPage < pageCount - 1) {
            pageButtons.push(`<span class="page-number">…</span>`);
        }
        pageButtons.push(`<button class="page-number" data-page="${pageCount}">${pageCount}</button>`);
    }

    pageButtons.push(`<button class="page-button" data-action="next" ${currentPage === pageCount ? 'disabled' : ''}>Next</button>`);

    return pageButtons.join('');
}

function attachPaginationEvents() {
    const pageButtons = [...paginationTop.querySelectorAll('[data-page], [data-action]'), ...paginationBottom.querySelectorAll('[data-page], [data-action]')];

    pageButtons.forEach(button => {
        button.addEventListener('click', event => {
            const action = event.currentTarget.dataset.action;
            const page = Number(event.currentTarget.dataset.page);

            if (action === 'prev' && currentPage > 1) {
                currentPage -= 1;
            } else if (action === 'next' && currentPage < Math.ceil(filteredJobs.length / RESULTS_PER_PAGE)) {
                currentPage += 1;
            } else if (page) {
                currentPage = page;
            }

            render();
        });
    });
}

function bindEvents() {
    searchButton.addEventListener('click', applyFilters);
    searchInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            applyFilters();
        }
    });
    locationFilter.addEventListener('input', applyFilters);
    typeFilter.addEventListener('change', applyFilters);
    remoteFilter.addEventListener('change', applyFilters);
    experienceFilter.addEventListener('change', applyFilters);
    categoryFilter.addEventListener('change', applyFilters);
    clearFiltersButton.addEventListener('click', () => {
        searchInput.value = '';
        locationFilter.value = '';
        typeFilter.value = 'all';
        remoteFilter.value = 'all';
        experienceFilter.value = 'all';
        categoryFilter.value = 'all';
        applyFilters();
    });
}

function initialize() {
    bindEvents();
    fetchJobs();
}

document.addEventListener('DOMContentLoaded', initialize);
