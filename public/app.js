const form = document.querySelector('#search-form');
const resultRoot = document.querySelector('#results-content');
const resultsSection = document.querySelector('#results-section');
const searchButton = form.querySelector('button[type="submit"]');
const resultsTitle = document.querySelector('#results-title');
const resultsMeta = document.querySelector('#results-meta');
let agentEnabled = false;
let lastPreferences = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function prettyDate(value) {
  if (!value) return 'Date not stated';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Date not stated' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function visaLabel(value) {
  if (value === 'yes') return ['Sponsorship stated', ''];
  if (value === 'no') return ['No sponsorship stated', 'no'];
  return ['Visa details not stated', 'unknown'];
}

async function loadAgentSetting() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    agentEnabled = response.ok && config.agentEnabled === true;
  } catch {
    // Fail closed: credit-consuming Agent browsing stays unavailable if config cannot be checked.
    agentEnabled = false;
  }
}

function renderJobs(payload) {
  const jobs = payload.jobs ?? [];
  if (!jobs.length) {
    resultRoot.innerHTML = '<div class="empty-state"><strong>No matching live listings came back.</strong><p>Try broader keywords or leave the location blank. We only show results found on the live career sources.</p></div>';
    resultsTitle.textContent = 'No live matches this time';
    return;
  }
  resultRoot.innerHTML = `<div class="job-list">${jobs.map((job) => {
    const [visa, visaClass] = visaLabel(job.visaSponsorship);
    const applyUrl = /^https:\/\//i.test(job.applyUrl ?? '') ? job.applyUrl : '#';
    const agentButton = agentEnabled
      ? `<button class="agent-button" type="button" data-agent-url="${escapeHtml(job.applyUrl)}">Agent deep read <small>may use credits</small></button>`
      : '<button class="agent-button" type="button" disabled title="Agent runs are owner-disabled because they may use TinyFish wallet credits.">Agent deep read <small>disabled · credits</small></button>';
    return `<article class="job-card">
      <div class="job-main">
        <div class="job-company-row"><i class="company-dot"></i><span class="job-company">${escapeHtml(job.company)}</span><span class="source-label">${escapeHtml(job.source || 'Career page')}</span></div>
        <h3>${escapeHtml(job.title)}</h3>
        <div class="job-meta"><span>⌖ ${escapeHtml(job.location || 'Location not stated')}</span>${job.workArrangement ? `<span>◇ ${escapeHtml(job.workArrangement)}</span>` : ''}<span>◷ ${escapeHtml(job.seniority || 'Seniority not stated')}</span><span>${escapeHtml(job.postedLabel || prettyDate(job.postedDate))}</span><span class="visa-badge ${visaClass}">${visa}</span></div>
        <p class="job-summary">${escapeHtml(job.description || 'Open the source listing for details.')}</p>
        <p class="match-reason">${escapeHtml(job.matchReason || 'Related live listing; review details before applying.')}</p>
        <div class="job-actions"><a class="apply-link" href="${escapeHtml(applyUrl)}" target="_blank" rel="noopener noreferrer">View original & apply ↗</a>${agentButton}</div>
      </div>
      <div class="match-box"><strong>${Math.round(Number(job.score) || 0)}%</strong><span>MATCH</span></div>
    </article>`;
  }).join('')}</div>`;
  resultsTitle.textContent = `${jobs.length} live opening${jobs.length === 1 ? '' : 's'} to review`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  lastPreferences = {
    role: data.get('role'),
    location: data.get('location'),
    keywords: data.get('keywords'),
    seniority: data.get('seniority'),
    visa: data.get('visa'),
  };
  searchButton.disabled = true;
  searchButton.querySelector('span:nth-child(2)').textContent = 'Searching live pages…';
  resultsSection.setAttribute('aria-busy', 'true');
  resultsMeta.textContent = 'TinyFish Search → Fetch';
  resultRoot.innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>Finding current openings and reading the original listings…</span></div>';
  resultsTitle.textContent = 'Building your shortlist';
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastPreferences),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Search failed (${response.status}).`);
    renderJobs(payload);
    const when = payload.searchedAt ? new Date(payload.searchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now';
    resultsMeta.textContent = `${payload.searchCount ?? payload.jobs?.length ?? 0} pages checked · ${payload.sources?.length ?? 0} portal type${(payload.sources?.length ?? 0) === 1 ? '' : 's'} · checked ${when}`;
  } catch (error) {
    resultRoot.innerHTML = `<div class="error-state">${escapeHtml(error.message || 'Search failed. Please try again.')}</div>`;
    resultsTitle.textContent = 'Search needs another try';
    resultsMeta.textContent = 'No results were stored.';
  } finally {
    searchButton.disabled = false;
    searchButton.querySelector('span:nth-child(2)').textContent = 'Scan live openings';
    resultsSection.setAttribute('aria-busy', 'false');
  }
});

resultRoot.addEventListener('click', async (event) => {
  const button = event.target.closest('.agent-button[data-agent-url]');
  if (!button || !agentEnabled || !lastPreferences) return;
  const confirmed = window.confirm('TinyFish Agent uses wallet credits. Run a read-only extraction for this listing? It will not sign in or apply.');
  if (!confirmed) return;
  const url = button.dataset.agentUrl;
  button.disabled = true;
  button.textContent = 'Agent reading…';
  try {
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, preferences: lastPreferences }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Agent failed (${response.status}).`);
    const card = button.closest('.job-card');
    let panel = card.querySelector('.agent-result');
    if (!panel) {
      panel = document.createElement('pre');
      panel.className = 'agent-result';
      card.querySelector('.job-main').append(panel);
    }
    const result = payload.result ?? payload;
    panel.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    button.textContent = 'Agent result ready';
  } catch (error) {
    button.textContent = error.message || 'Agent unavailable';
  } finally {
    button.disabled = true;
  }
});

await loadAgentSetting();
