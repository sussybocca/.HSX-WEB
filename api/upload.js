import supabase from './supabase.js'
import fetch from 'node-fetch'
import FormData from 'form-data'
import formidable from 'formidable-serverless'

export const config = { api: { bodyParser: false } }

const VT_KEY = process.env.VIRUSTOTAL_API_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  // Step 1: Capture uploaded files as buffers
  const form = new formidable.IncomingForm({ multiples: false })
  const fileBuffers = {}
  const fields = {}

  form.on('field', (name, value) => { fields[name] = value })
  form.on('file', (name, file) => {
    const chunks = []
    file.on('data', chunk => chunks.push(chunk))
    file.on('end', () => { fileBuffers[name] = Buffer.concat(chunks) })
  })

  form.parse(req, async (err) => {
    if (err) return res.status(500).json({ error: err.message })

    try {
      const required = ['hsx', 'js', 'html', 'test', 'success']
      for (const k of required) {
        if (!fileBuffers[k]) return res.status(400).json({ error: `Missing file: ${k}` })
      }

      const name = f => f.originalFilename || f.newFilename || f.name || 'file'

      // Step 2: VirusTotal scan
      async function scanWithVirusTotal(buffer, filename) {
        const formData = new FormData()
        formData.append('file', buffer, { filename })

        const upload = await fetch('https://www.virustotal.com/api/v3/files', {
          method: 'POST',
          headers: { 'x-apikey': VT_KEY, ...formData.getHeaders() },
          body: formData
        })
        if (!upload.ok) throw new Error(await upload.text())
        const { data } = await upload.json()
        const id = data.id

        // Poll for scan result
        while (true) {
          const poll = await fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, {
            headers: { 'x-apikey': VT_KEY }
          })
          const json = await poll.json()
          if (json.data.attributes.status === 'completed') {
            const stats = json.data.attributes.stats
            return stats.malicious === 0 && stats.suspicious === 0
          }
          await new Promise(r => setTimeout(r, 2500))
        }
      }

      let safe = true
      for (const k of required) {
        const ok = await scanWithVirusTotal(fileBuffers[k], k)
        if (!ok) {
          safe = false
          break
        }
      }

      // Step 3: Upload to Supabase
      const record = { name: 'hsx-file', author: fields.author || 'Anonymous', status: safe ? 'success' : 'failed' }
      if (safe) {
        const upload = async (buffer, folder, filename) => {
          const { data, error } = await supabase.storage.from('extensions')
            .upload(`${folder}/${filename}`, buffer, { upsert: true })
          if (error) throw error
          return data.path
        }

        record.hsx_url = await upload(fileBuffers.hsx, 'hsx', 'hsx-file.hsx')
        record.js_url = await upload(fileBuffers.js, 'js', 'js-file.js')
        record.html_url = await upload(fileBuffers.html, 'html', 'html-file.html')
        record.test_url = await upload(fileBuffers.test, 'test', 'test-file.txt')
        record.success_url = await upload(fileBuffers.success, 'success', 'success-file.txt')
      }

      const { data, error } = await supabase.from('extensions').insert([record])
      if (error) throw error
      res.json({ message: safe ? 'Uploaded successfully' : 'Malicious content blocked', data })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })
}
