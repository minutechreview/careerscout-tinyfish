import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_JOB_HOSTS,
  buildSearchQuery,
  canonicalizeJobUrl,
  companySlugFromUrl,
  deduplicateJobs,
  detectVisaSupport,
  isAllowedJobUrl,
  jobTitleFromUrl,
  jobTitleFromPage,
  normalizeJobTitle,
  locationsFromPage,
  workArrangementFromPage,
  postedLabelFromPage,
  cleanJobDescription,
  normalizePreferences,
  matchReason,
  portalName,
  scoreJob,
} from '../lib/careers.js';

test('normalizes the user’s search preferences without dropping visa or seniority', () => {
  const prefs = normalizePreferences({
    role: 'AI Engineer',
    location: 'Dubai, UAE',
    keywords: 'agents, Python',
    seniority: 'Mid-level',
    visa: 'sponsorship-required',
  });
  assert.equal(prefs.role, 'AI Engineer');
  assert.equal(prefs.location, 'Dubai, UAE');
  assert.equal(prefs.seniority, 'Mid-level');
  assert.equal(prefs.visa, 'sponsorship-required');
  assert.deepEqual(prefs.keywords, ['agents', 'Python']);
});

test('builds a live-job query from several user inputs', () => {
  const query = buildSearchQuery({
    role: 'Automation Engineer',
    location: 'Remote, UAE',
    keywords: ['workflow', 'LLM'],
    seniority: 'Junior',
    visa: 'sponsorship-required',
  });
  for (const term of ['Automation Engineer', 'Remote, UAE', 'workflow', 'LLM', 'Junior', 'visa sponsorship']) {
    assert.match(query.toLowerCase(), new RegExp(term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('allows only official, public job-board hosts for Agent navigation', () => {
  assert.ok(ALLOWED_JOB_HOSTS.length >= 3);
  assert.equal(isAllowedJobUrl('https://boards.greenhouse.io/acme/jobs/12345'), true);
  assert.equal(isAllowedJobUrl('https://jobs.lever.co/acme/abcdef1234567890'), true);
  assert.equal(isAllowedJobUrl('https://payward.wd1.myworkdayjobs.com/en-US/External/job/AI-Engineer_R-123'), true);
  assert.equal(isAllowedJobUrl('https://jobs.lever.co/acme'), false);
  assert.equal(isAllowedJobUrl('https://example.com/steal-data'), false);
  assert.equal(isAllowedJobUrl('http://127.0.0.1/admin'), false);
  assert.equal(isAllowedJobUrl('javascript:alert(1)'), false);
  assert.equal(portalName('https://boards.greenhouse.io/acme/jobs/12345'), 'Greenhouse');
  assert.equal(companySlugFromUrl('https://jobs.lever.co/acme/abcdef1234567890'), 'Acme');
  assert.equal(jobTitleFromUrl('https://kyndryl.wd5.myworkdayjobs.com/en-US/KyndrylProfessionalCareers/job/Application-Consulting_R-60378/apply'), 'Application Consulting');
  assert.equal(normalizeJobTitle('Software Development Engineer Backend Python Kubernetes P751307 1'), 'Software Development Engineer Backend Python Kubernetes');
  assert.equal(normalizeJobTitle('Senior Engineer JREQ199749 1'), 'Senior Engineer');
});

test('canonicalizes tracking parameters for stable deduplication', () => {
  assert.equal(
    canonicalizeJobUrl('https://jobs.lever.co/acme/abc?utm_source=feed&gh_src=123#apply'),
    'https://jobs.lever.co/acme/abc',
  );
});

test('deduplicates equivalent listing URLs while retaining the more complete record', () => {
  const jobs = deduplicateJobs([
    { title: 'AI Engineer', company: 'Acme', applyUrl: 'https://boards.greenhouse.io/acme/jobs/9?utm_source=x', score: 61, description: '' },
    { title: 'AI Engineer — Remote', company: 'Acme', applyUrl: 'https://boards.greenhouse.io/acme/jobs/9', score: 84, description: 'Remote role with Python and agents.' },
  ]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].score, 84);
  assert.match(jobs[0].description, /Python/);
});

test('visa status is explicit only when the source says so', () => {
  assert.equal(detectVisaSupport('We provide visa sponsorship for this role.'), 'yes');
  assert.equal(detectVisaSupport('We are unable to sponsor visas.'), 'no');
  assert.equal(detectVisaSupport('Competitive salary and benefits.'), 'unknown');
});

test('parses Workday facts from source metadata and removes page chrome from the summary', () => {
  const raw = `Skip to main content\n\nThis website uses cookies to improve your web experience. Privacy Policy\n\n## Job Description\n\n## ****Senior Full Stack Engineer, Solve Voice****\n\nApply\n\n**remote type**:   Hybrid\n\n**locations**:   Austin, Texas, United States of America\n:   Madison, Wisconsin, United States of America\n:   San Francisco, California, United States of America\n\n**time type**:   Full time\n\n**posted on**:   Posted 30+ Days Ago\n\n## What you’ll do\n\nBuild real-time voice AI services for customers with reliable low-latency integrations and careful monitoring.`;
  assert.equal(jobTitleFromPage(raw), 'Senior Full Stack Engineer, Solve Voice');
  assert.equal(workArrangementFromPage(raw), 'Hybrid');
  assert.match(locationsFromPage(raw), /Austin, Texas/);
  assert.match(locationsFromPage(raw), /Madison, Wisconsin/);
  assert.equal(postedLabelFromPage(raw), 'Posted 30+ Days Ago');
  const summary = cleanJobDescription(raw);
  assert.match(summary, /Build real-time voice AI/);
  assert.doesNotMatch(summary, /Skip to main content|uses cookies|remote type|posted on/i);
});

test('ranking rewards relevance and never interprets unknown visa as a match', () => {
  const prefs = normalizePreferences({ role: 'AI Engineer', location: 'Dubai', seniority: 'Mid-level', visa: 'sponsorship-required' });
  const strong = scoreJob({ title: 'Mid-level AI Engineer', company: 'Acme', location: 'Dubai', description: 'Visa sponsorship available; Python and agent workflows.' }, prefs);
  const unknownVisa = scoreJob({ title: 'Mid-level AI Engineer', company: 'Other', location: 'Dubai', description: 'Python and agent workflows.' }, prefs);
  assert.ok(strong > unknownVisa);
  assert.ok(strong >= 70 && strong <= 100);

  const remotePrefs = normalizePreferences({ role: 'Engineer', location: 'Remote, United States' });
  const abroad = scoreJob({ title: 'Engineer', location: 'Mexico City', workArrangement: 'Remote' }, remotePrefs);
  const usRemote = scoreJob({ title: 'Engineer', location: 'Remote (United States)', workArrangement: 'Remote' }, remotePrefs);
  assert.ok(usRemote > abroad);
  assert.match(matchReason({ title: 'Engineer', location: 'Mexico City', workArrangement: 'Remote' }, remotePrefs), /United States not confirmed/);
});
