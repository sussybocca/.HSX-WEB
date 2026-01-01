import formidable from 'formidable-serverless';
import supabase from './supabase.js';
import fs from 'fs';
import MalwareScanner from 'malware-scanner';
import { parseCode } from 'js-slang';
import clamav from 'clamav.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ===== Formidable setup =====
  const form = new formidable.IncomingForm({
    multiples: false,
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err);
      return res.status(500).json({ error: 'Failed to parse files', details: err.message });
    }

    try {
      // ===== Check all required files exist =====
      const requiredFiles = ['hsx', 'js', 'html', 'test', 'success'];
      for (const key of requiredFiles) {
        if (!files[key]) {
          console.error(`Missing file: ${key}`);
          return res.status(400).json({ error: `Missing file: ${key}` });
        }
      }

      // ===== Helpers =====
      const getFilename = (file) => file.originalFilename || file.newFilename || file.name;

      // ===== Malware & code scanning =====
      async function scanJS(file) {
        const code = fs.readFileSync(file.filepath, 'utf-8');
        try {
          parseCode(code); // Will throw if syntax or dangerous pattern
          return true;
        } catch {
          return false;
        }
      }

      async function scanMalware(file) {
        const scanner = new MalwareScanner();
        const result = await scanner.scanFile(file.filepath);
        return result.clean;
      }

      async function scanClamAV(file) {
        return new Promise((resolve, reject) => {
          const stream = fs.createReadStream(file.filepath);
          clamav.createScanner(3310, '127.0.0.1').scan(stream, (err, object, malicious) => {
            if (err) reject(err);
            resolve(!malicious);
          });
        });
      }

      async function isFileSafe(file, type) {
        const jsSafe = type === 'js' ? await scanJS(file) : true;
        const malwareSafe = await scanMalware(file);
        const clamSafe = await scanClamAV(file);
        return jsSafe && malwareSafe && clamSafe;
      }

      // ===== Check all files =====
      let allSafe = true;
      for (const key of requiredFiles) {
        const safe = await isFileSafe(files[key], key === 'js' ? 'js' : 'other');
        if (!safe) {
          allSafe = false;
          break;
        }
      }

      // ===== Insert to DB with status failed if unsafe =====
      const status = allSafe ? 'success' : 'failed';
      const dbInsert = {
        name: getFilename(files.hsx).replace('.hsx', ''),
        author: fields.author || 'Anonymous',
        status,
      };

      // Only upload files if safe
      if (allSafe) {
        const uploadFile = async (file, folder) => {
          const filename = getFilename(file);
          const { data, error } = await supabase.storage
            .from('extensions')
            .upload(`${folder}/${filename}`, file.filepath, { upsert: true });
          if (error) throw error;
          return data.path;
        };

        dbInsert.hsx_url = await uploadFile(files.hsx, 'hsx');
        dbInsert.js_url = await uploadFile(files.js, 'js');
        dbInsert.html_url = await uploadFile(files.html, 'html');
        dbInsert.test_url = await uploadFile(files.test, 'test');
        dbInsert.success_url = await uploadFile(files.success, 'success');
      }

      const { data, error } = await supabase.from('extensions').insert([dbInsert]);
      if (error) throw error;

      res.status(200).json({ message: allSafe ? 'Uploaded successfully' : 'Malicious code detected', data });

    } catch (uploadError) {
      console.error('Upload handler error:', uploadError);
      res.status(500).json({
        error: 'Upload failed',
        message: uploadError.message,
        stack: uploadError.stack,
      });
    }
  });
}
