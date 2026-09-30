const SKILLS = [
  'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'Go', 'Rust', 'React', 'Next.js', 'Node.js',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST API', 'AWS', 'Azure', 'GCP',
  'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Git', 'Linux', 'Cybersecurity', 'Machine Learning',
  'Generative AI', 'LLM', 'NLP', 'Data Analysis', 'Data Visualization', 'Excel', 'Power BI', 'Tableau',
  'Figma', 'UI/UX', 'Product Design', 'User Research', 'Product Management', 'Project Management', 'Agile',
  'Automation', 'Workflow Automation', 'Salesforce', 'CRM', 'Sales', 'Marketing', 'Customer Success',
  'Customer Support', 'Operations', 'Supply Chain', 'Accounting', 'Financial Modeling', 'Recruiting', 'HR',
  'Compliance', 'Quality Assurance', 'Testing', 'Technical Writing', 'Content Strategy', 'SEO', 'Analytics',
  'Leadership', 'Communication', 'Negotiation', 'Research', 'Presentation', 'Forecasting', 'Budgeting',
];

const ROLES = [
  'software engineer', 'backend engineer', 'back-end engineer', 'frontend engineer', 'front-end engineer',
  'full stack engineer', 'full-stack engineer', 'data analyst', 'data scientist', 'machine learning engineer',
  'devops engineer', 'security engineer', 'automation engineer', 'quality assurance engineer', 'qa engineer',
  'business analyst', 'product manager', 'project manager', 'product designer', 'ux designer', 'ui designer',
  'graphic designer', 'financial analyst', 'accountant', 'operations manager', 'operations coordinator',
  'sales representative', 'account executive', 'customer success manager', 'marketing manager', 'content writer',
  'technical writer', 'recruiter', 'human resources', 'researcher', 'consultant', 'customer support specialist',
];

const normalize = (text) => ` ${String(text ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9+#]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const hasPhrase = (text, phrase) => normalize(text).includes(normalize(phrase));

export function buildResumeProfile(text = '') {
  const source = String(text).slice(0, 120_000);
  return {
    skills: SKILLS.filter((skill) => hasPhrase(source, skill)),
    roles: ROLES.filter((role) => hasPhrase(source, role)),
    level: /\b(principal|staff|director|head of|lead)\b/i.test(source) ? 'Lead'
      : /\b(senior|sr\.)\b/i.test(source) ? 'Senior'
      : /\b(mid[- ]level|intermediate)\b/i.test(source) ? 'Mid-level'
      : /\b(junior|entry[- ]level|graduate|intern(ship)?)\b/i.test(source) ? 'Entry level' : '',
  };
}

export function matchResumeToJob(job = {}, profile = {}) {
  const text = `${job.title ?? ''} ${job.description ?? ''}`;
  const jobSkills = SKILLS.filter((skill) => hasPhrase(text, skill));
  const jobRoles = ROLES.filter((role) => hasPhrase(text, role));
  const resumeSkills = new Set(profile.skills ?? []);
  const resumeRoles = new Set(profile.roles ?? []);
  const matchedSkills = jobSkills.filter((skill) => resumeSkills.has(skill));
  const missingSkills = jobSkills.filter((skill) => !resumeSkills.has(skill));
  const matchedRoles = jobRoles.filter((role) => resumeRoles.has(role));
  const matchedSignals = matchedSkills.length + matchedRoles.length;
  const totalSignals = jobSkills.length + jobRoles.length;
  if (!totalSignals) return { score: null, matchedSkills, missingSkills: [], matchedRoles, matchedSignals: 0, totalSignals: 0, limited: true };

  const skillCoverage = jobSkills.length ? matchedSkills.length / jobSkills.length : null;
  const roleCoverage = jobRoles.length ? matchedRoles.length / jobRoles.length : null;
  let score;
  if (skillCoverage !== null && roleCoverage !== null) score = Math.round((skillCoverage * 0.75 + roleCoverage * 0.25) * 100);
  else if (skillCoverage !== null) score = Math.round(skillCoverage * 100);
  else score = Math.round(roleCoverage * 100);
  return { score, matchedSkills, missingSkills: missingSkills.slice(0, 5), matchedRoles, matchedSignals, totalSignals, limited: false };
}

export const RESUME_LIMIT_BYTES = 8 * 1024 * 1024;
