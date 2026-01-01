import formidable from 'formidable-serverless';
import supabase from './supabase.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'Failed to parse files' });

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
          author: fields.author || 'Anonymous',
          hsx_url: hsxUrl,
          js_url: jsUrl,
          html_url: htmlUrl,
          test_url: testUrl,
          success_url: successUrl,
          status: 'pending'
        }
      ]);

      if (error) throw error;
      res.status(200).json({ message: 'Uploaded successfully', data });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Upload failed' });
    }
  });
}
