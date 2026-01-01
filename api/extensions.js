import { getApprovedExtensions } from './supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Use the backend helper from supabase.js
    const extensionsWithUrls = await getApprovedExtensions();

    res.status(200).json(extensionsWithUrls);
  } catch (err) {
    console.error('Failed to fetch extensions:', err);
    res.status(500).json({ error: 'Failed to fetch extensions' });
  }
}
