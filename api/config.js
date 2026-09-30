export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET for the public app configuration.' });
  return res.status(200).json({ agentEnabled: process.env.ENABLE_TINYFISH_AGENT === 'true' });
}
