import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResumeProfile, matchResumeToJob } from '../public/resume-match.js';

test('builds a compact local profile from skills and role signals without retaining contact details', () => {
  const profile = buildResumeProfile(`Jordan Sample\njordan@example.com | +1 415 555 0119\nSenior Software Engineer\nExperience building TypeScript, React, Node.js and PostgreSQL services on AWS.`);
  assert.ok(profile.skills.includes('TypeScript'));
  assert.ok(profile.skills.includes('React'));
  assert.ok(profile.skills.includes('AWS'));
  assert.ok(profile.roles.includes('software engineer'));
  assert.equal(JSON.stringify(profile).includes('jordan@example.com'), false);
  assert.equal(JSON.stringify(profile).includes('415 555'), false);
  assert.equal('rawText' in profile, false);
});

test('ranks a role with matching skills higher than one with little overlap', () => {
  const profile = buildResumeProfile('Backend software engineer with Python, PostgreSQL, Docker, AWS and REST API experience.');
  const strong = matchResumeToJob({ title: 'Backend Software Engineer', description: 'Build Python services with PostgreSQL, Docker and AWS.' }, profile);
  const weak = matchResumeToJob({ title: 'Product Designer', description: 'Create Figma prototypes and conduct user research.' }, profile);
  assert.ok(strong.score > weak.score);
  assert.equal(strong.matchedSignals, strong.totalSignals);
  assert.equal(weak.matchedSignals, 0);
  assert.ok(weak.missingSkills.includes('Figma'));
});

test('returns an honest no-score result when the posting has no recognized match signals', () => {
  const profile = buildResumeProfile('Python backend engineer with AWS and PostgreSQL.');
  const result = matchResumeToJob({ title: 'Office Administrator', description: 'Coordinate schedules, maintain records, and support daily office activities.' }, profile);
  assert.equal(result.score, null);
  assert.equal(result.limited, true);
});
