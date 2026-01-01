// api/extensions.js
import { createClient } from '@supabase/supabase-js';

// Use your server-side Supabase credentials
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // Use service key for full access

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase credentials not set! Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper to fetch all approved extensions with full public URLs
async function getApprovedExtensions() {
  try {
    const { data: extensions, error } = await supabase
      .from('extensions')
      .select('*')
      .eq('status', 'success')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Map each extension to include all file URLs
    return extensions.map(ext => ({
      id: ext.id,
      name: ext.name,
      author: ext.author,
      hsx_url: supabase.storage.from('extensions').getPublicUrl(ext.hsx_url).data.publicUrl,
      js_url: supabase.storage.from('extensions').getPublicUrl(ext.js_url).data.publicUrl,
      html_url: supabase.storage.from('extensions').getPublicUrl(ext.html_url).data.publicUrl,
      test_url: supabase.storage.from('extensions').getPublicUrl(ext.test_url).data.publicUrl,
      success_url: supabase.storage.from('extensions').getPublicUrl(ext.success_url).data.publicUrl,
    }));
  } catch (err) {
    console.error('Failed to fetch approved extensions:', err);
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const extensions = await getApprovedExtensions();
    res.status(200).json(extensions);
  } catch (err) {
    console.error('Failed to fetch extensions:', err);
    res.status(500).json({ error: 'Failed to fetch extensions' });
  }
}
