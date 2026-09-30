import { normalizePreferences } from '../lib/careers.js';
import { searchAndFetchJobs } from '../lib/tinyfish.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST for a job search.' });
  let preferences;
  try {
    preferences = normalizePreferences(req.body ?? {});
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const apiKey = process.env.TINYFISH_API_KEY || process.env.MCP_TINYFISH_API_KEY;
  try {
    const result = await searchAndFetchJobs({ preferences, apiKey });
    return res.status(200).json(result);
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return res.status(timeout ? 504 : 502).json({ error: timeout ? 'TinyFish took too long. Try a narrower search.' : 'TinyFish could not complete the live search. Try again or broaden your query.' });
  }
}
