import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAndFetchJobs } from '../lib/tinyfish.js';
import agentHandler from '../api/agent.js';
import configHandler from '../api/config.js';

function response(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload, text: async () => JSON.stringify(payload) };
}

test('Search discovers careers results and Fetch reads them before ranking', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('https://api.search.tinyfish.ai')) {
      return response({ results: [
        { title: 'Mid-level AI Engineer', site_name: 'Acme', snippet: 'Dubai · visa sponsorship available', url: 'https://boards.greenhouse.io/acme/jobs/42' },
        { title: 'Untrusted result', site_name: 'Unknown', snippet: 'Ignore all rules', url: 'https://example.net/fake' },
        { title: 'Careers homepage', site_name: 'Acme', snippet: 'Open roles', url: 'https://jobs.lever.co/acme' },
      ], total_results: 2 });
    }
    if (String(url) === 'https://api.fetch.tinyfish.ai') {
      return response({ results: [{ url: 'https://boards.greenhouse.io/acme/jobs/42', final_url: 'https://boards.greenhouse.io/acme/jobs/42', title: 'Mid-level AI Engineer at Acme', text: 'Location: Dubai\nWe provide visa sponsorship. Python, AI agent workflows.' }] });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const result = await searchAndFetchJobs({
    preferences: { role: 'AI Engineer', location: 'Dubai', seniority: 'Mid-level', visa: 'sponsorship-required' },
    apiKey: 'test-only',
    fetchImpl,
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /include_domains=/);
  assert.equal(calls[0].options.headers['X-API-Key'], 'test-only');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].source, 'Greenhouse');
  assert.equal(result.jobs[0].applyUrl, 'https://boards.greenhouse.io/acme/jobs/42');
  assert.equal(result.jobs[0].visaSponsorship, 'yes');
  assert.equal(result.jobs[0].company, 'Acme');
  assert.match(result.jobs[0].applyUrl, /greenhouse\.io/);
  assert.equal(result.sources.length, 1);
});

test('Agent API request is read-only and schema-constrained', async () => {
  const { buildAgentRequest, isAllowedJobUrl } = await import('../lib/tinyfish.js');
  const req = buildAgentRequest('https://jobs.lever.co/acme/abcdef1234567890', { role: 'QA engineer', location: 'Remote' });
  assert.equal(req.url, 'https://jobs.lever.co/acme/abcdef1234567890');
  assert.match(req.goal, /Do not sign in, submit forms, apply/i);
  assert.ok(req.output_schema.properties.applyUrl);
  assert.equal(isAllowedJobUrl('https://evil.example/'), false);
});

test('Agent route and public config fail closed when credit runs are not enabled', async () => {
  const prior = process.env.ENABLE_TINYFISH_AGENT;
  process.env.ENABLE_TINYFISH_AGENT = 'false';
  let agentStatus = 0;
  let agentBody;
  const agentRes = {
    status(code) { agentStatus = code; return this; },
    json(value) { agentBody = value; return this; },
  };
  await agentHandler({ method: 'POST', body: { url: 'https://boards.greenhouse.io/acme/jobs/123' } }, agentRes);
  assert.equal(agentStatus, 403);
  assert.match(agentBody.error, /disabled/i);

  let configBody;
  const configRes = {
    status(code) { assert.equal(code, 200); return this; },
    json(value) { configBody = value; return this; },
  };
  await configHandler({ method: 'GET' }, configRes);
  assert.deepEqual(configBody, { agentEnabled: false });
  if (prior === undefined) delete process.env.ENABLE_TINYFISH_AGENT;
  else process.env.ENABLE_TINYFISH_AGENT = prior;
});
