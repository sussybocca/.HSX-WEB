import formidable from 'formidable-serverless'
import supabase from './supabase.js'
import fetch from 'node-fetch'
import FormData from 'form-data'
import { readFile } from 'node:fs/promises'

export const config = { api: { bodyParser: false } }

const VT_KEY = process.env.VIRUSTOTAL_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const form = new formidable.IncomingForm({ multiples: false, keepExtensions: true })

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err)
      return res.status(500).json({ error: 'Form parse failed', details: err.message, stack: err.stack })
    }

    try {
      const required = ['hsx', 'js', 'html', 'test', 'success']
      for (const k of required) {
        if (!files[k]) {
          const msg = `Missing required file: ${k}`
          console.error(msg)
          return res.status(400).json({ error: msg })
        }
      }

      const name = f => f.originalFilename || f.newFilename || f.name

      // Helper to get buffer from file
      async function getFileBuffer(file) {
        if (file.filepath) return await readFile(file.filepath) // disk fallback
        if (file._data) return file._data // in-memory buffer
        throw new Error(`No data found for file ${name(file)}`)
      }

      // ---------- VirusTotal Scan ----------
      async function scanWithVirusTotal(file) {
        try {
          const buffer = await getFileBuffer(file)
          const formData = new FormData()
          formData.append('file', buffer, { filename: name(file) })

          const upload = await fetch('https://www.virustotal.com/api/v3/files', {
            method: 'POST',
            headers: { 'x-apikey': VT_KEY, ...formData.getHeaders() },
            body: formData
          })

          if (!upload.ok) {
            const text = await upload.text()
            throw new Error(`VirusTotal upload failed: ${upload.status} - ${text}`)
          }

          const { data } = await upload.json()
          const id = data.id

          while (true) {
            const poll = await fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, {
              headers: { 'x-apikey': VT_KEY }
            })
            if (!poll.ok) {
              const txt = await poll.text()
              throw new Error(`VirusTotal poll failed: ${poll.status} - ${txt}`)
            }

            const json = await poll.json()
            const status = json.data.attributes.status
            if (status === 'completed') {
              const stats = json.data.attributes.stats
              return stats.malicious === 0 && stats.suspicious === 0
            }
            await new Promise(r => setTimeout(r, 2500))
          }
        } catch (e) {
          console.error(`VirusTotal scan error for file ${name(file)}:`, e)
          throw new Error(`VirusTotal scan failed for ${name(file)}: ${e.message}`)
        }
      }

      // ---------- Scan all files ----------
      let safe = true
      for (const k of required) {
        try {
          const ok = await scanWithVirusTotal(files[k])
          if (!ok) {
            safe = false
            console.warn(`Malicious file detected: ${name(files[k])}`)
            break
          }
        } catch (e) {
          console.error(`Error scanning ${k}:`, e)
          throw e
        }
      }

      // ---------- Prepare DB record ----------
      const record = {
        name: name(files.hsx).replace('.hsx', ''),
        author: fields.author || 'Anonymous',
        status: safe ? 'success' : 'failed'
      }

      if (safe) {
        const upload = async (file, folder) => {
          const buffer = await getFileBuffer(file)
          try {
            const { data, error } = await supabase.storage
              .from('extensions')
              .upload(`${folder}/${name(file)}`, buffer, { upsert: true })
            if (error) throw error
            return data.path
          } catch (e) {
            console.error(`Supabase upload failed for ${folder}/${name(file)}:`, e)
            throw new Error(`Upload failed for ${folder}/${name(file)}: ${e.message}`)
          }
        }

        record.hsx_url = await upload(files.hsx, 'hsx')
        record.js_url = await upload(files.js, 'js')
        record.html_url = await upload(files.html, 'html')
        record.test_url = await upload(files.test, 'test')
        record.success_url = await upload(files.success, 'success')
      }

      const { data, error } = await supabase.from('extensions').insert([record])
      if (error) {
        console.error('Supabase DB insert error:', error)
        throw new Error(`DB insert failed: ${error.message}`)
      }

      res.json({ message: safe ? 'Uploaded successfully' : 'Malicious content blocked', data })
    } catch (e) {
      console.error('Handler caught error:', e)
      res.status(500).json({ error: 'Upload failed', message: e.message, stack: e.stack })
    }
  })
}
