import formidable from 'formidable-serverless'
import supabase from './supabase.js'
import fetch from 'node-fetch'

export const config = { api: { bodyParser: false } }

const VT_KEY = process.env.VIRUSTOTAL_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const form = new formidable.IncomingForm({ multiples: false, keepExtensions: true })

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message })

    try {
      const required = ['hsx', 'js', 'html', 'test', 'success']
      for (const k of required) if (!files[k]) return res.status(400).json({ error: `Missing ${k}` })

      const name = f => f.originalFilename || f.newFilename || f.name

      // ---------- VirusTotal Scan ----------
      async function scanWithVirusTotal(file) {
        const upload = await fetch('https://www.virustotal.com/api/v3/files', {
          method: 'POST',
          headers: { 'x-apikey': VT_KEY },
          body: file
        })

        const { data } = await upload.json()
        const id = data.id

        // poll for analysis result
        while (true) {
          const res = await fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, {
            headers: { 'x-apikey': VT_KEY }
          })
          const json = await res.json()
          const status = json.data.attributes.status
          if (status === 'completed') {
            const stats = json.data.attributes.stats
            return stats.malicious === 0 && stats.suspicious === 0
          }
          await new Promise(r => setTimeout(r, 2500))
        }
      }

      // ---------- Scan every file ----------
      let safe = true
      for (const k of required) {
        const ok = await scanWithVirusTotal(files[k])
        if (!ok) { safe = false; break }
      }

      const record = {
        name: name(files.hsx).replace('.hsx', ''),
        author: fields.author || 'Anonymous',
        status: safe ? 'success' : 'failed'
      }

      if (safe) {
        const upload = async (file, folder) => {
          const { data, error } = await supabase.storage
            .from('extensions')
            .upload(`${folder}/${name(file)}`, file.filepath, { upsert: true })
          if (error) throw error
          return data.path
        }

        record.hsx_url = await upload(files.hsx, 'hsx')
        record.js_url = await upload(files.js, 'js')
        record.html_url = await upload(files.html, 'html')
        record.test_url = await upload(files.test, 'test')
        record.success_url = await upload(files.success, 'success')
      }

      const { data, error } = await supabase.from('extensions').insert([record])
      if (error) throw error

      res.json({ message: safe ? 'Uploaded successfully' : 'Malicious content blocked', data })

    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })
}
