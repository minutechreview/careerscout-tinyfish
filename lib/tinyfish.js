import { buildSearchQuery, canonicalizeJobUrl, cleanJobDescription, companySlugFromUrl, detectSeniority, detectVisaSupport, isAllowedJobUrl, jobTitleFromPage, jobTitleFromUrl, locationsFromPage, matchReason, normalizeJobTitle, normalizePreferences, portalName, postedLabelFromPage, scoreJob, workArrangementFromPage, deduplicateJobs } from './careers.js';

const SEARCH_ENDPOINT = 'https://api.search.tinyfish.ai';
const FETCH_ENDPOINT = 'https://api.fetch.tinyfish.ai';
const AGENT_ENDPOINT = 'https://agent.tinyfish.ai/v1/automation/run';
export const CAREER_DOMAINS = ['boards.greenhouse.io', 'jobs.lever.co', 'myworkdayjobs.com'];

async function readJson(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `${label} request failed (${response.status}).`;
    throw new Error(message.slice(0, 240));
  }
  return body;
}

function getResults(payload) {
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
}

function companyFrom(result, page) {
  for (const title of [page?.title, result?.title]) {
    const atMatch = String(title ?? '').match(/\bat\s+([^|–—-]{2,60}?)(?:\s*[-|–—]|$)/i);
    if (atMatch) return atMatch[1].trim();
  }
  return companySlugFromUrl(result?.url) || String(result?.site_name ?? result?.publisher ?? 'Company not identified').trim();
}

function locationFrom(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.replace(/[>*_`#]/g, '').trim();
    const labeled = line.match(/^(?:location|based in|work location)\s*[:\-–]\s*(.+)$/i);
    if (!labeled) continue;
    const value = labeled[1]
      .split(/\s{2,}|\s*[|;]\s*|\s+(?=(?:workplace category|travel required|direct reports|employment type)\s*:)/i)[0]
      .trim().replace(/[.,;]+$/, '');
    if (value) return value.slice(0, 90);
  }
  return 'Not stated';
}

export function createSearchUrl(preferences) {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('query', buildSearchQuery(preferences));
  url.searchParams.set('purpose', 'Find current job and internship postings matching the applicant preferences.');
  url.searchParams.set('include_domains', CAREER_DOMAINS.join(','));
  url.searchParams.set('language', 'en');
  return url;
}

export async function searchAndFetchJobs({ preferences: rawPreferences, apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('TinyFish API key is not configured on the server.');
  const preferences = normalizePreferences(rawPreferences);
  const searchResponse = await fetchImpl(createSearchUrl(preferences), {
    method: 'GET',
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(45_000),
  });
  const searchPayload = await readJson(searchResponse, 'Search');
  const searchResults = getResults(searchPayload)
    .filter((item) => item?.url && isAllowedJobUrl(item.url))
    .slice(0, 10);

  if (!searchResults.length) {
    return { preferences, jobs: [], sources: [], searchedAt: new Date().toISOString(), searchCount: 0 };
  }

  const fetchResponse = await fetchImpl(FETCH_ENDPOINT, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      urls: searchResults.map((item) => item.url),
      purpose: 'Extract current job listing details and application links for the user’s requested role.',
      format: 'markdown',
      links: true,
      per_url_timeout_ms: 20_000,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const fetchPayload = await readJson(fetchResponse, 'Fetch');
  const fetched = getResults(fetchPayload);
  const fetchedByUrl = new Map();
  for (const page of fetched) {
    if (page?.url) fetchedByUrl.set(canonicalizeJobUrl(page.url), page);
    if (page?.final_url) fetchedByUrl.set(canonicalizeJobUrl(page.final_url), page);
  }

  const jobs = searchResults.map((item) => {
    const page = fetchedByUrl.get(canonicalizeJobUrl(item.url)) ?? {};
    const rawText = String(page.text ?? '');
    const description = cleanJobDescription(rawText, item.snippet ?? '');
    const title = jobTitleFromPage(rawText) || jobTitleFromUrl(item.url) || normalizeJobTitle(page.title || item.title || 'Untitled opening');
    const company = companyFrom(item, page);
    const location = locationsFromPage(rawText) || locationFrom(rawText);
    const workArrangement = workArrangementFromPage(rawText);
    const visaSponsorship = detectVisaSupport(rawText || item.snippet || '');
    const seniority = detectSeniority(`${title}\n${description}`);
    const job = {
      title,
      company,
      location,
      workArrangement,
      seniority,
      visaSponsorship,
      description,
      source: portalName(item.url),
      sourceUrl: item.url,
      applyUrl: isAllowedJobUrl(page.final_url) ? page.final_url : item.url,
      postedDate: page.published_date || item.published_date || null,
      postedLabel: postedLabelFromPage(rawText),
      fetchStatus: page.text ? 'read' : 'search-result-only',
      score: 0,
    };
    job.score = scoreJob(job, preferences);
    job.matchReason = matchReason(job, preferences);
    return job;
  });
  const uniqueJobs = deduplicateJobs(jobs);
  const sources = [...new Set(searchResults.map((item) => portalName(item.url)))];
  return { preferences, jobs: uniqueJobs, sources, searchedAt: new Date().toISOString(), searchCount: searchResults.length };
}

export function buildAgentRequest(url, rawPreferences) {
  if (!isAllowedJobUrl(url)) throw new Error('Agent can only open supported public careers portals.');
  const preferences = normalizePreferences(rawPreferences);
  return {
    url,
    goal: `Read this public job listing only. Extract the job title, employer, location, seniority, posted date, visa sponsorship status, a short description, and the direct apply URL. Use "unknown" where the page does not explicitly state a value. Compare it to these preferences: role=${preferences.role}; location=${preferences.location || 'any'}; seniority=${preferences.seniority}; keywords=${preferences.keywords.join(', ') || 'none'}; visa=${preferences.visa}. Do not sign in, submit forms, apply, or change anything on the page.`,
    output_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        company: { type: 'string' },
        location: { type: 'string' },
        seniority: { type: 'string' },
        postedDate: { type: 'string' },
        visaSponsorship: { type: 'string', enum: ['yes', 'no', 'unknown'] },
        description: { type: 'string' },
        applyUrl: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['title', 'company', 'location', 'seniority', 'visaSponsorship', 'description', 'applyUrl'],
    },
    browser_profile: 'lite',
    agent_config: { mode: 'strict', max_steps: 18, max_duration_seconds: 90 },
  };
}

export async function runAgentExtraction({ url, preferences, apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('TinyFish API key is not configured on the server.');
  const response = await fetchImpl(AGENT_ENDPOINT, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(buildAgentRequest(url, preferences)),
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  });
  return readJson(response, 'Agent');
}

export { isAllowedJobUrl };
