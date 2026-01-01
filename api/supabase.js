import { createClient } from '@supabase/supabase-js';

// ✅ SERVER-SIDE ONLY
// Pull credentials from Vercel environment variables
// These environment variables must be set in Vercel: SUPABASE_URL & SUPABASE_ANON_KEY
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Supabase credentials not set! Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set in Vercel secrets.'
  );
}

// Create Supabase client (server-side)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ✅ Helper function to fetch all approved extensions with public URLs
export async function getApprovedExtensions() {
  try {
    const { data: extensions, error } = await supabase
      .from('extensions')
      .select('*')
      .eq('status', 'success')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Generate real public URLs for each file
    return extensions.map(ext => ({
      id: ext.id,
      name: ext.name,
      author: ext.author,
      hsx_url: supabase.storage.from('extensions').getPublicUrl(ext.hsx_url).data.publicUrl,
      js_url: supabase.storage.from('extensions').getPublicUrl(ext.js_url).data.publicUrl,
      html_url: supabase.storage.from('extensions').getPublicUrl(ext.html_url).data.publicUrl,
    }));
  } catch (err) {
    console.error('Failed to fetch approved extensions:', err);
    return [];
  }
}

// ✅ Helper function to upload files to Supabase storage
export async function uploadExtensionToSupabase(files, author = 'Anonymous') {
  try {
    const { hsx, js, html, test, success } = files;

    const uploadFile = async (file, folder) => {
      const { data, error } = await supabase.storage
        .from('extensions')
        .upload(`${folder}/${file.originalFilename}`, file.filepath, { upsert: true });
      if (error) throw error;
      return data.path;
    };

    const hsxUrl = await uploadFile(hsx, 'hsx');
    const jsUrl = await uploadFile(js, 'js');
    const htmlUrl = await uploadFile(html, 'html');
    const testUrl = await uploadFile(test, 'test');
    const successUrl = await uploadFile(success, 'success');

    const { data, error } = await supabase.from('extensions').insert([
      {
        name: hsx.originalFilename.replace('.hsx', ''),
        author,
        hsx_url: hsxUrl,
        js_url: jsUrl,
        html_url: htmlUrl,
        test_url: testUrl,
        success_url: successUrl,
        status: 'pending',
      },
    ]);

    if (error) throw error;

    return data;
  } catch (err) {
    console.error('Failed to upload extension:', err);
    return null;
  }
}

// Export the raw supabase client too in case other API routes need it
export default supabase;
