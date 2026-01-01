import formidable from 'formidable-serverless';
import supabase from './supabase.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ===== FIXED: Make Formidable stable on Vercel =====
  const form = new formidable.IncomingForm({
    multiples: false,     // don't allow multiple files per input
    keepExtensions: true, // preserve file extensions
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err);
      return res.status(500).json({
        error: 'Failed to parse files',
        details: err.message, // sends the real error
      });
    }

    try {
      // ===== CHECK: all required files exist =====
      const requiredFiles = ['hsx', 'js', 'html', 'test', 'success'];
      for (const key of requiredFiles) {
        if (!files[key]) {
          console.error(`Missing file: ${key}`);
          return res.status(400).json({ error: `Missing file: ${key}` });
        }
      }

      // ===== Helper to upload a file to Supabase =====
      const uploadFile = async (file, folder) => {
        if (!file.originalFilename) {
          throw new Error(`File ${folder} has no originalFilename`);
        }
        const { data, error } = await supabase.storage
          .from('extensions')
          .upload(`${folder}/${file.originalFilename}`, file.filepath, { upsert: true });
        if (error) throw error;
        return data.path;
      };

      // ===== Upload each file =====
      const hsxUrl = await uploadFile(files.hsx, 'hsx');
      const jsUrl = await uploadFile(files.js, 'js');
      const htmlUrl = await uploadFile(files.html, 'html');
      const testUrl = await uploadFile(files.test, 'test');
      const successUrl = await uploadFile(files.success, 'success');

      // ===== Insert into Supabase DB =====
      const { data, error } = await supabase.from('extensions').insert([
        {
          name: files.hsx.originalFilename.replace('.hsx', ''),
          author: fields.author || 'Anonymous',
          hsx_url: hsxUrl,
          js_url: jsUrl,
          html_url: htmlUrl,
          test_url: testUrl,
          success_url: successUrl,
          status: 'pending',
        },
      ]);

      if (error) {
        console.error('Supabase DB insert error:', error);
        throw error;
      }

      // ===== Success response =====
      res.status(200).json({ message: 'Uploaded successfully', data });

    } catch (uploadError) {
      console.error('Upload handler error:', uploadError);
      res.status(500).json({
        error: 'Upload failed',
        message: uploadError.message, // real error message
        stack: uploadError.stack,     // full stack trace
      });
    }
  });
}
