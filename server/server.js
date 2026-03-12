import 'dotenv/config'
import express from 'express'

const app = express()
app.use(express.json({ limit: '1mb' }))

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/estimate-calories', async (req, res) => {
  try {
    const foodName = typeof req.body?.foodName === 'string' ? req.body.foodName.trim() : ''
    if (!foodName) {
      res.status(400).json({ error: 'foodName is required.' })
      return
    }

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss:20b',
        prompt:
          'You estimate calories. Return ONLY a JSON object like {"calories": 123}. No other text.\n' +
          `Estimate calories for a typical single serving of: ${foodName}`,
        stream: false,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      res.status(502).json({ error: 'Upstream AI request failed.', detail })
      return
    }

    const data = await response.json()
    const outputText = data?.response
    const raw = typeof outputText === 'string' ? outputText : JSON.stringify(outputText ?? '')

    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    const json = jsonStart >= 0 && jsonEnd >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw

    const parsed = JSON.parse(json)
    const calories = parsed?.calories

    if (typeof calories !== 'number' || !Number.isFinite(calories) || calories < 0) {
      res.status(502).json({ error: 'AI did not return a valid calorie number.' })
      return
    }

    res.json({ calories: Math.round(calories) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' })
  }
})

app.post('/api/recommend-meals', async (req, res) => {
  try {
    const body = req.body ?? {}
    const dailyCalories = Number(body.dailyCalories ?? 0)
    const profile = body.profile ?? {}
    const entries = Array.isArray(body.entries) ? body.entries : []

    if (!Number.isFinite(dailyCalories) || dailyCalories <= 0) {
      res.status(400).json({ error: 'dailyCalories is required and must be a positive number.' })
      return
    }

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss:20b',
        prompt: [
          'You are a friendly nutrition coach helping with fat loss.',
          'You must base all meal suggestions on typical Chinese and Asian-style home recipes that could be found on this recipe site: https://cook.yunyoujun.cn/',
          'Do not invent exotic Western dishes; prioritize rice, noodles, soups, stir-fries, steamed dishes, and simple vegetables and proteins common in that style of cooking.',
          'User details (may be partial):',
          `- Sex: ${profile.sex ?? 'unknown'}`,
          `- Age: ${profile.age ?? 'unknown'} years`,
          `- Height: ${profile.heightCm ?? 'unknown'} cm`,
          `- Weight: ${profile.weightKg ?? 'unknown'} kg`,
          `- Daily calorie target: ${dailyCalories} kcal`,
          '',
          'Today so far the user logged:',
          ...(entries.length
            ? entries.map(
                (e) => `- ${e.name ?? 'food'}: ${e.calories ?? '?'} calories`,
              )
            : ['- No foods logged yet.']),
          '',
          'TASK: Suggest one day of simple, realistic meals from that recipe site style that help reduce body fat while staying close to the daily calorie target.',
          'Return clear text with sections like "Breakfast", "Lunch", "Dinner", "Snacks" and rough calories per item.',
          'Keep the tone short and practical.',
        ].join('\n'),
        stream: false,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      res.status(502).json({ error: 'Upstream AI request failed.', detail })
      return
    }

    const data = await response.json()
    const text = typeof data?.response === 'string' ? data.response : JSON.stringify(data?.response)

    res.json({ recommendation: text })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' })
  }
})

async function imageToBase64(imageUrl) {
  const res = await fetch(imageUrl, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const buf = await res.arrayBuffer()
  const base64 = Buffer.from(buf).toString('base64')
  const ct = res.headers.get('content-type') || ''
  const mimeType = ct.includes('png') ? 'image/png' : ct.includes('gif') ? 'image/gif' : 'image/jpeg'
  return { base64Image: base64, mimeType }
}

app.post('/api/estimate-calories-image', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      res.status(500).json({
        error: 'GEMINI_API_KEY is not set on the server. Add it to your .env file and restart.',
      })
      return
    }

    const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : ''
    let base64Image
    let mimeType = 'image/jpeg'

    if (imageUrl) {
      try {
        const result = await imageToBase64(imageUrl)
        base64Image = result.base64Image
        mimeType = result.mimeType
      } catch (err) {
        res.status(400).json({
          error: 'Could not fetch image from URL. Check the link is public and returns an image.',
        })
        return
      }
    } else {
      const raw = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : ''
      if (!raw) {
        res.status(400).json({ error: 'Provide either imageDataUrl (base64) or imageUrl.' })
        return
      }
      const match = /^data:(.*?);base64,(.*)$/.exec(raw)
      mimeType = match?.[1] || 'image/jpeg'
      base64Image = match?.[2] || raw
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        GEMINI_API_KEY,
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    'You are a nutrition assistant. From this food or drink photo, detect the main item and estimate calories for the visible portion. ' +
                    'Return ONLY a JSON object like {"name":"grilled chicken breast","calories":350}. ' +
                    'If it is mostly plain water, set name to "water" and calories to 0.',
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
        }),
      },
    )

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      res
        .status(502)
        .json({ error: 'Gemini image request failed. Check your API key and quota.', detail })
      return
    }

    const data = await response.json()
    const candidates = data?.candidates ?? []
    const text =
      candidates[0]?.content?.parts
        ?.map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join(' ')
        .trim() ?? ''

    const rawText = text || JSON.stringify(candidates ?? '')
    const jsonStart = rawText.indexOf('{')
    const jsonEnd = rawText.lastIndexOf('}')
    const json = jsonStart >= 0 && jsonEnd >= 0 ? rawText.slice(jsonStart, jsonEnd + 1) : rawText

    let parsed
    try {
      parsed = JSON.parse(json)
    } catch {
      res.status(502).json({ error: 'Gemini did not return valid JSON.' })
      return
    }

    const name =
      typeof parsed?.name === 'string' && parsed.name.trim()
        ? parsed.name.trim()
        : 'Unknown food'
    const calories = Number(parsed?.calories ?? NaN)

    if (!Number.isFinite(calories) || calories < 0) {
      res.status(502).json({ error: 'Gemini did not return a valid calorie number.' })
      return
    }

    res.json({ name, calories: Math.round(calories) })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' })
  }
})

// Use a port that won't conflict with Vite (5173/5174 often used)
const port = Number(process.env.PORT ?? 5175)
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`)
})
