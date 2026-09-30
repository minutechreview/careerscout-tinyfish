import { runAgentExtraction, isAllowedJobUrl } from '../lib/tinyfish.js';
import { normalizePreferences } from '../lib/careers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST for a read-only listing extraction.' });
  if (process.env.ENABLE_TINYFISH_AGENT !== 'true') {
    return res.status(403).json({ error: 'Agent runs are disabled until the project owner enables credit-consuming runs.' });
  }
  const { url } = req.body ?? {};
  if (!isAllowedJobUrl(url)) return res.status(400).json({ error: 'Choose a listing from a supported careers portal.' });
  let preferences;
  try {
    preferences = normalizePreferences(req.body?.preferences ?? {});
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const apiKey = process.env.TINYFISH_API_KEY || process.env.MCP_TINYFISH_API_KEY;
  try {
    const data = await runAgentExtraction({ url, preferences, apiKey });
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: 'Agent extraction failed. The posting remains available by its direct apply link.' });
  }
}
