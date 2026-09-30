import { buildResumeProfile, matchResumeToJob, RESUME_LIMIT_BYTES } from './resume-match.js';

const form = document.querySelector('#search-form');
const resultRoot = document.querySelector('#results-content');
const resultsSection = document.querySelector('#results-section');
const searchButton = form.querySelector('button[type="submit"]');
const resultsTitle = document.querySelector('#results-title');
const resultsMeta = document.querySelector('#results-meta');
const resumeInput = document.querySelector('#resume-file');
const resumeDrop = document.querySelector('#resume-drop');
const resumeStatus = document.querySelector('#resume-status');
const resumeClear = document.querySelector('#resume-clear');
let agentEnabled = false;
let lastPreferences = null;
let resumeProfile = null;

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

function updateResumeStatus(message, state = 'info') {
  resumeStatus.textContent = message;
  resumeStatus.dataset.state = state;
}

function clearResumeProfile(message = 'Not added. You can search without one.', state = 'info') {
  resumeProfile = null;
  resumeInput.value = '';
  resumeClear.hidden = true;
  updateResumeStatus(message, state);
}

async function extractResumeText(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (extension === 'txt') return new TextDecoder().decode(buffer).slice(0, 120_000);
  if (extension === 'docx') {
    if (!window.mammoth?.extractRawText) throw new Error('The DOCX reader did not load. Try a text-based PDF or TXT file.');
    const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    return String(result.value ?? '').slice(0, 120_000);
  }
  if (extension === 'pdf') {
    const pdfjs = await import('/vendor/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs';
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
    try {
      if (pdf.numPages > 30) throw new Error('Please use a résumé PDF with 30 pages or fewer.');
      const pages = [];
      for (let index = 1; index <= pdf.numPages; index += 1) {
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => item.str ?? '').join(' '));
        page.cleanup();
      }
      return pages.join('\n').slice(0, 120_000);
    } finally {
      await pdf.destroy();
    }
  }
  throw new Error('Choose a PDF, DOCX, or TXT résumé.');
}

async function readResume(file) {
  if (!file) return;
  if (file.size > RESUME_LIMIT_BYTES) {
    clearResumeProfile('That file is over 8 MB. Choose a smaller résumé.', 'error');
    return;
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'docx', 'txt'].includes(extension)) {
    clearResumeProfile('Choose a PDF, DOCX, or TXT résumé.', 'error');
    return;
  }
  updateResumeStatus('Reading on this device…', 'info');
  resumeClear.hidden = true;
  try {
    let text = await extractResumeText(file);
    const profile = buildResumeProfile(text);
    text = '';
    if (!profile.skills.length && !profile.roles.length) {
      clearResumeProfile('No supported skills or role signals found. Try a text-based résumé.', 'error');
      return;
    }
    resumeProfile = profile;
    const count = profile.skills.length + profile.roles.length;
    updateResumeStatus(`Ready · ${count} résumé signals · used for your next search only.`, 'ready');
    resumeClear.hidden = false;
  } catch (error) {
    clearResumeProfile(error.message || 'Could not read that résumé. Try a text-based PDF, DOCX, or TXT.', 'error');
  } finally {
    resumeInput.value = '';
  }
}

function resumeEvidenceHtml(result) {
  if (result.limited) return '<p class="resume-evidence"><b>Résumé signals:</b> Not enough detail in this posting to compare.</p>';
  const matched = result.matchedSkills.slice(0, 4).map((skill) => `<span class="evidence-pill">${escapeHtml(skill)}</span>`).join('');
  const roles = result.matchedRoles.slice(0, 2).map((role) => `<span class="evidence-pill">${escapeHtml(role)}</span>`).join('');
  const missing = result.missingSkills.slice(0, 3).map((skill) => `<span class="evidence-pill missing">${escapeHtml(skill)}</span>`).join('');
  const signals = matched || roles || '<span>No direct skill overlap found</span>';
  return `<div class="resume-evidence"><b>Shared signals:</b>${signals}${missing ? `<b class="also-asks">Other listed terms:</b>${missing}` : ''}</div>`;
}

function renderJobs(payload, activeResumeProfile = null) {
  const jobs = payload.jobs ?? [];
  if (!jobs.length) {
    resultRoot.innerHTML = '<div class="empty-state"><div class="empty-symbol" aria-hidden="true"><span></span><i></i></div><div><b>No matching live listings came back.</b><p>Try a broader title, another location, or fewer keywords.</p></div></div>';
    resultsTitle.textContent = 'No live matches this time';
    return;
  }
  const rankedJobs = jobs.map((job) => ({ ...job, resumeMatch: activeResumeProfile ? matchResumeToJob(job, activeResumeProfile) : null }));
  if (activeResumeProfile) {
    rankedJobs.sort((a, b) => {
      const aScore = a.resumeMatch?.score;
      const bScore = b.resumeMatch?.score;
      if (aScore === null && bScore !== null) return 1;
      if (bScore === null && aScore !== null) return -1;
      return (bScore ?? -1) - (aScore ?? -1) || (Number(b.score) || 0) - (Number(a.score) || 0);
    });
  }

  const cards = `<div class="job-list">${rankedJobs.map((job) => {
    const [visa, visaClass] = visaLabel(job.visaSponsorship);
    const applyUrl = /^https:\/\//i.test(job.applyUrl ?? '') ? job.applyUrl : '#';
    const agentButton = agentEnabled
      ? `<button class="agent-button" type="button" data-agent-url="${escapeHtml(job.applyUrl)}">Agent deep read <small>may use credits</small></button>`
      : '';
    const hasResumeMatch = Boolean(activeResumeProfile);
    const resumeScore = job.resumeMatch?.score;
    const scoreMarkup = hasResumeMatch
      ? `<strong>${resumeScore === null ? '—' : `${job.resumeMatch.matchedSignals}/${job.resumeMatch.totalSignals}`}</strong><span>${resumeScore === null ? 'LIMITED DETAIL' : 'SIGNALS MATCHED'}</span><small>Search fit ${Math.round(Number(job.score) || 0)}%</small>`
      : `<strong>${Math.round(Number(job.score) || 0)}%</strong><span>SEARCH FIT</span>`;
    const evidenceMarkup = hasResumeMatch ? resumeEvidenceHtml(job.resumeMatch) : '';
    return `<article class="job-card">
      <div class="job-main">
        <div class="job-company-row"><i class="company-dot"></i><span class="job-company">${escapeHtml(job.company)}</span><span class="source-label">${escapeHtml(job.source || 'Career page')}</span></div>
        <h3>${escapeHtml(job.title)}</h3>
        <div class="job-meta"><span>⌖ ${escapeHtml(job.location || 'Location not stated')}</span>${job.workArrangement ? `<span>◇ ${escapeHtml(job.workArrangement)}</span>` : ''}<span>◷ ${escapeHtml(job.seniority || 'Seniority not stated')}</span><span>${escapeHtml(job.postedLabel || prettyDate(job.postedDate))}</span><span class="visa-badge ${visaClass}">${visa}</span></div>
        <p class="job-summary">${escapeHtml(job.description || 'Open the source listing for details.')}</p>
        <p class="match-reason">${escapeHtml(job.matchReason || 'Related live listing; review details before applying.')}</p>
        ${evidenceMarkup}
        <div class="job-actions"><a class="apply-link" href="${escapeHtml(applyUrl)}" target="_blank" rel="noopener noreferrer">View original &amp; apply ↗</a>${agentButton}</div>
      </div>
      <div class="match-box ${hasResumeMatch ? 'resume-match-box' : ''}">${scoreMarkup}</div>
    </article>`;
  }).join('')}</div>`;
  resultRoot.innerHTML = `${activeResumeProfile ? '<p class="resume-disclaimer">Counts show skill and role terms shared between your résumé and each posting—not hiring odds. Search fit separately reflects your role, location, and keyword preferences.</p>' : ''}${cards}`;
  resultsTitle.textContent = `${jobs.length} live opening${jobs.length === 1 ? '' : 's'} to review`;
}

async function loadAgentSetting() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    agentEnabled = response.ok && config.agentEnabled === true;
  } catch {
    agentEnabled = false;
  }
}

resumeInput.addEventListener('change', (event) => readResume(event.target.files?.[0]));
resumeClear.addEventListener('click', () => clearResumeProfile('Temporary résumé profile cleared.'));
resumeDrop.addEventListener('dragover', (event) => { event.preventDefault(); resumeDrop.classList.add('drag-over'); });
resumeDrop.addEventListener('dragleave', () => resumeDrop.classList.remove('drag-over'));
resumeDrop.addEventListener('drop', (event) => {
  event.preventDefault();
  resumeDrop.classList.remove('drag-over');
  readResume(event.dataTransfer.files?.[0]);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const activeResumeProfile = resumeProfile;
  lastPreferences = {
    role: data.get('role'),
    location: data.get('location'),
    keywords: data.get('keywords'),
    seniority: data.get('seniority'),
    visa: data.get('visa'),
  };
  searchButton.disabled = true;
  resumeInput.disabled = true;
  resumeClear.disabled = true;
  searchButton.querySelector('.button-label').textContent = 'Searching live pages…';
  resultsSection.setAttribute('aria-busy', 'true');
  resultsMeta.textContent = 'TinyFish Search → Fetch';
  resultRoot.innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span><span>Finding current openings and reading the original listings…</span></div>';
  resultsTitle.textContent = 'Building your shortlist';
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only preferences go to the server; the résumé profile stays in this browser.
      body: JSON.stringify(lastPreferences),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Search failed (${response.status}).`);
    renderJobs(payload, activeResumeProfile);
    const when = payload.searchedAt ? new Date(payload.searchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'just now';
    const resumeNote = activeResumeProfile ? ' · résumé compared locally' : '';
    resultsMeta.textContent = `${payload.searchCount ?? payload.jobs?.length ?? 0} pages checked · ${payload.sources?.length ?? 0} portal type${(payload.sources?.length ?? 0) === 1 ? '' : 's'} · checked ${when}${resumeNote}`;
  } catch (error) {
    resultRoot.innerHTML = `<div class="error-state">${escapeHtml(error.message || 'Search failed. Please try again.')}</div>`;
    resultsTitle.textContent = 'Search needs another try';
    resultsMeta.textContent = 'No results were stored.';
  } finally {
    searchButton.disabled = false;
    resumeInput.disabled = false;
    resumeClear.disabled = false;
    searchButton.querySelector('.button-label').textContent = 'Find matching roles';
    resultsSection.setAttribute('aria-busy', 'false');
    if (activeResumeProfile) clearResumeProfile('Temporary résumé profile cleared after this search.');
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
