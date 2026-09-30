export const ALLOWED_JOB_HOSTS = [
  'boards.greenhouse.io',
  'jobs.lever.co',
  'myworkdayjobs.com',
];

const VISA_CHOICES = new Set(['sponsorship-required', 'no-sponsorship-needed', 'either']);
const SENIORITY_CHOICES = new Set(['Any level', 'Internship', 'Entry level', 'Junior', 'Mid-level', 'Senior', 'Lead']);

function cleanText(value, maxLength = 180) {
  return String(value ?? '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function normalizePreferences(raw = {}) {
  const role = cleanText(raw.role, 100);
  if (!role) throw new Error('Enter a role or job title to search for.');
  const location = cleanText(raw.location, 100);
  const keywordsRaw = Array.isArray(raw.keywords) ? raw.keywords : String(raw.keywords ?? '').split(',');
  const keywords = [...new Set(keywordsRaw.map((item) => cleanText(item, 48)).filter(Boolean))].slice(0, 10);
  const seniority = SENIORITY_CHOICES.has(raw.seniority) ? raw.seniority : 'Any level';
  const visa = VISA_CHOICES.has(raw.visa) ? raw.visa : 'either';
  return { role, location, keywords, seniority, visa };
}

export function buildSearchQuery(prefs) {
  const terms = [prefs.role, ...prefs.keywords, prefs.seniority !== 'Any level' ? prefs.seniority : '', prefs.location];
  if (prefs.visa === 'sponsorship-required') terms.push('visa sponsorship');
  if (prefs.visa === 'no-sponsorship-needed') terms.push('work authorization');
  terms.push('job OR internship careers apply');
  return terms.filter(Boolean).join(' ').slice(0, 1000);
}

export function isAllowedJobUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    const allowedHost = ALLOWED_JOB_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    if (!allowedHost) return false;
    const path = url.pathname.toLowerCase();
    if (host === 'boards.greenhouse.io' || host.endsWith('.boards.greenhouse.io')) return /\/(?:[^/]+\/)?jobs\/\d+(?:\/|$)/.test(path);
    if (host === 'jobs.lever.co' || host.endsWith('.jobs.lever.co')) {
      const parts = path.split('/').filter(Boolean);
      return parts.length >= 2 && parts[1].length >= 16;
    }
    return /\/job\//.test(path);
  } catch {
    return false;
  }
}

export function portalName(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host.includes('greenhouse.io')) return 'Greenhouse';
    if (host.endsWith('lever.co')) return 'Lever';
    if (host.includes('myworkdayjobs.com')) return 'Workday';
  } catch { /* handled with a neutral label below */ }
  return 'Career page';
}

export function companySlugFromUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    let slug = '';
    if (host.includes('greenhouse.io') || host.endsWith('lever.co')) slug = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (host.includes('myworkdayjobs.com')) slug = host.split('.').find((part) => part && !/^wd\d+$/i.test(part) && part !== 'myworkdayjobs' && part !== 'com') || url.pathname.split('/').filter(Boolean)[0] || '';
    return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  } catch { return ''; }
}

export function normalizeJobTitle(value) {
  return String(value ?? '')
    .replace(/\*+/g, '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/\s+(?:JREQ|JR|REQ|P|R)[-_]?\d[\w-]*\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function jobTitleFromUrl(value) {
  try {
    const url = new URL(value);
    if (!url.hostname.toLowerCase().includes('myworkdayjobs.com')) return '';
    const raw = url.pathname.match(/\/job\/([^/]+)/i)?.[1];
    if (!raw) return '';
    const decoded = decodeURIComponent(raw).replace(/(?:_|-)(?:R|JR|REQ)[-_]?\d[\w-]*$/i, '');
    return normalizeJobTitle(decoded.replace(/[-_]+/g, ' '));
  } catch { return ''; }
}

export function jobTitleFromPage(text = '') {
  const source = String(text).replace(/\r/g, '');
  const section = source.match(/^#{1,4}\s*Job Description\s*$([\s\S]*)/im)?.[1];
  if (!section) return '';
  for (const line of section.split('\n')) {
    const heading = line.match(/^\s*#{1,6}\s+(.+)$/);
    if (!heading) continue;
    const title = normalizeJobTitle(heading[1]);
    if (title && !/^(about|what you|responsibilities|requirements|qualifications|benefits|the role|job description)\b/i.test(title)) return title;
  }
  return '';
}

export function workArrangementFromPage(text = '') {
  const match = String(text).match(/(?:\*\*)?remote type(?:\*\*)?\s*:\s*([^\n*]+)/i);
  if (!match) return '';
  const value = match[1].trim().split(/\s{2,}/)[0];
  if (/^remote$/i.test(value)) return 'Remote';
  if (/hybrid/i.test(value)) return 'Hybrid';
  if (/flex/i.test(value)) return 'Flexible';
  if (/on.?site/i.test(value)) return 'On-site';
  return value.slice(0, 40);
}

export function locationsFromPage(text = '') {
  const source = String(text).replace(/\r/g, '');
  const match = source.match(/(?:\*\*)?locations?(?:\*\*)?\s*:\s*([\s\S]*?)(?=\n\s*\n|\n\s*\*\*(?:time type|posted on|job requisition id)|$)/i);
  if (!match) return '';
  const places = match[1].split('\n').map((line) => line.replace(/^\s*:\s*/, '').replace(/\*+/g, '').trim()).filter(Boolean);
  return [...new Set(places)].slice(0, 4).join(' · ');
}

export function postedLabelFromPage(text = '') {
  const match = String(text).match(/(?:\*\*)?posted on(?:\*\*)?\s*:\s*([^\n*]+)/i);
  return match?.[1]?.trim().slice(0, 60) || '';
}

export function cleanJobDescription(text = '', fallback = '') {
  let source = String(text).replace(/\r/g, '');
  const section = source.match(/^#{1,4}\s*Job Description\s*$([\s\S]*)/im)?.[1];
  if (section) source = section;
  source = source
    .replace(/\bSkip to main content\b/gi, '')
    .replace(/This website uses cookies[\s\S]*?(?:Privacy Policy|Cookie Policy)\s*/gi, '')
    .replace(/^.*page is loaded.*$/gim, '')
    .replace(/^\s*#{1,6}\s+.*$/gm, '')
    .replace(/^\s*(?:Apply|(?:\*\*)?(?:remote type|locations?|time type|posted on|job requisition id)(?:\*\*)?\s*:.*)$/gim, '')
    .replace(/^\s*:\s+.*$/gm, '')
    .replace(/\*{1,3}/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .trim();
  const paragraph = source.split(/\n\s*\n/).map((part) => part.replace(/\s+/g, ' ').trim()).find((part) => part.length > 50 && !/privacy|cookie policy|skip to main/i.test(part));
  const cleanFallback = String(fallback).replace(/\s+/g, ' ').trim();
  const chosen = paragraph || cleanFallback || 'Open the source listing for the full description.';
  if (chosen.length <= 420) return chosen;
  const cutoff = chosen.lastIndexOf(' ', 417);
  return `${chosen.slice(0, cutoff > 240 ? cutoff : 417).trim()}…`;
}

export function canonicalizeJobUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|gh_src|source|ref|referrer|campaign|trk)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return String(value ?? '').trim();
  }
}

export function detectVisaSupport(text = '') {
  const value = String(text).toLowerCase();
  if (/no visa sponsorship|cannot sponsor|can't sponsor|unable to sponsor|will not sponsor|does not sponsor|not eligible for sponsorship|sponsorship is not available/.test(value)) return 'no';
  if (/visa sponsorship (?:is )?(?:available|provided|offered|for)\b|provide(?:s)? visa sponsorship|will sponsor|sponsor(?:ship)? visas|immigration support/.test(value)) return 'yes';
  return 'unknown';
}

export function detectSeniority(text = '') {
  const value = String(text).toLowerCase();
  if (/\b(intern|internship|student placement)\b/.test(value)) return 'Internship';
  if (/\b(lead|principal|staff engineer|director|head of)\b/.test(value)) return 'Lead';
  if (/\b(senior|sr\.?|experienced)\b/.test(value)) return 'Senior';
  if (/\b(mid[- ]level|intermediate)\b/.test(value)) return 'Mid-level';
  if (/\b(junior|entry[- ]level|graduate|associate)\b/.test(value)) return 'Entry level';
  return 'Not stated';
}

function words(value) {
  return String(value ?? '').toLowerCase().match(/[a-z0-9+#.-]{2,}/g) ?? [];
}

export function scoreJob(job, prefs) {
  const haystack = `${job.title ?? ''} ${job.company ?? ''} ${job.location ?? ''} ${job.description ?? ''}`.toLowerCase();
  const roleTerms = words(prefs.role);
  const matchedRoleTerms = roleTerms.filter((term) => haystack.includes(term));
  let score = 18 + (haystack.includes(prefs.role.toLowerCase()) ? 22 : 0);
  if (roleTerms.length) score += Math.round(22 * matchedRoleTerms.length / roleTerms.length);
  if (prefs.location) {
    const wantsRemote = /\bremote\b/i.test(prefs.location);
    const arrangement = String(job.workArrangement ?? '').toLowerCase();
    if (wantsRemote && arrangement === 'remote') score += 15;
    else if (wantsRemote && arrangement === 'hybrid') score -= 8;
    else if (wantsRemote && /on.?site/.test(arrangement)) score -= 12;
    else if (!wantsRemote && haystack.includes(prefs.location.toLowerCase())) score += 15;
    if (wantsRemote && arrangement === 'remote') {
      const requestedRegion = prefs.location.replace(/\bremote\b/ig, '').replace(/[,-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (requestedRegion && !String(job.location ?? '').toLowerCase().includes(requestedRegion)) score -= 12;
    }
  }
  if (prefs.seniority !== 'Any level') {
    const detected = job.seniority ?? detectSeniority(`${job.title ?? ''} ${job.description ?? ''}`);
    if (detected === prefs.seniority || (prefs.seniority === 'Junior' && detected === 'Entry level')) score += 10;
  }
  const visaStatus = job.visaSponsorship ?? detectVisaSupport(job.description);
  if (prefs.visa === 'sponsorship-required') {
    if (visaStatus === 'yes') score += 10;
    if (visaStatus === 'no') score -= 18;
  } else if (prefs.visa === 'no-sponsorship-needed' && visaStatus === 'no') {
    score += 5;
  }
  const keywordHits = prefs.keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
  score += Math.min(15, keywordHits * 5);
  return Math.max(0, Math.min(100, score));
}

export function deduplicateJobs(jobs) {
  const byUrl = new Map();
  for (const job of jobs) {
    const key = canonicalizeJobUrl(job.applyUrl || job.url);
    if (!key) continue;
    const previous = byUrl.get(key);
    if (!previous) {
      byUrl.set(key, { ...job, applyUrl: key });
      continue;
    }
    const preferred = (job.score ?? 0) > (previous.score ?? 0) ? job : previous;
    const other = preferred === job ? previous : job;
    byUrl.set(key, {
      ...other,
      ...preferred,
      applyUrl: key,
      description: preferred.description || other.description || '',
      location: preferred.location && preferred.location !== 'Not stated' ? preferred.location : (other.location || 'Not stated'),
      visaSponsorship: preferred.visaSponsorship !== 'unknown' ? preferred.visaSponsorship : (other.visaSponsorship || 'unknown'),
    });
  }
  return [...byUrl.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function matchReason(job, prefs) {
  const reasons = [];
  const haystack = `${job.title ?? ''} ${job.description ?? ''} ${job.location ?? ''}`.toLowerCase();
  if (prefs.role && haystack.includes(prefs.role.toLowerCase())) reasons.push(`matches ${prefs.role}`);
  if (prefs.location && /\bremote\b/i.test(prefs.location)) {
    if (String(job.workArrangement).toLowerCase() === 'remote') {
      const requestedRegion = prefs.location.replace(/\bremote\b/ig, '').replace(/[,-]/g, ' ').replace(/\s+/g, ' ').trim();
      reasons.push(requestedRegion && !String(job.location ?? '').toLowerCase().includes(requestedRegion.toLowerCase()) ? `remote; ${requestedRegion} not confirmed` : 'remote role');
    } else if (String(job.workArrangement).toLowerCase() === 'hybrid') reasons.push('hybrid, not fully remote');
  } else if (prefs.location && job.location?.toLowerCase().includes(prefs.location.toLowerCase())) {
    reasons.push(`mentions ${prefs.location}`);
  }
  const hits = prefs.keywords.filter((word) => haystack.includes(word.toLowerCase()));
  if (hits.length) reasons.push(`keyword${hits.length > 1 ? 's' : ''}: ${hits.slice(0, 3).join(', ')}`);
  if (prefs.seniority !== 'Any level' && job.seniority === prefs.seniority) reasons.push(prefs.seniority);
  if (prefs.visa === 'sponsorship-required' && job.visaSponsorship === 'yes') reasons.push('sponsorship stated');
  return reasons.length ? reasons.join(' · ') : 'Related live listing; review details before applying.';
}
