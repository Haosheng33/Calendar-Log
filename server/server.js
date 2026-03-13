import 'dotenv/config'
import express from 'express'
import { getAllowedRecipes } from './comboLibrary.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

function hasVideoStructure(text = '') {
  const lower = String(text).toLowerCase()
  return (
    lower.includes('### shot list') &&
    lower.includes('### voiceover script') &&
    lower.includes('### search keywords')
  )
}

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
    const mode = body.mode === 'video' ? 'video' : 'normal'
    const dailyCalories = Number(body.dailyCalories ?? 0)
    const profile = body.profile ?? {}
    const entries = Array.isArray(body.entries) ? body.entries : []
    const preferredCombos = Array.isArray(body.preferredCombos) ? body.preferredCombos : []
    const preferredComboRecipes = Array.isArray(body.preferredComboRecipes)
      ? body.preferredComboRecipes
      : []
    const allowedRecipeLines =
      preferredComboRecipes.length > 0
        ? preferredComboRecipes.map((r) => String(r))
        : getAllowedRecipes(preferredCombos.map((c) => String(c)))

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
          'Use ONLY the local recipe combos listed below as your source of meal ideas.',
          'Do not reference any websites or external datasets.',
          'Do not invent dishes outside this local combo library.',
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
          'Preferred ingredient/style tags selected by user:',
          ...(preferredCombos.length
            ? preferredCombos.map((c) => `- ${String(c)}`)
            : ['- (none selected)']),
          '',
          'Local combo library you MUST use:',
          ...allowedRecipeLines.map((line) => `- ${line}`),
          '',
          'TASK: Suggest one day of simple, realistic meals from the local combo library that help reduce body fat while staying close to the daily calorie target.',
          mode === 'video'
            ? [
                'Return a VIDEO SCRIPT plan, not a regular meal summary.',
                'Use this exact structure:',
                'Section 1 (no heading marks): "Video concept + timeline" with breakfast/lunch/dinner/snack and rough calories.',
                'Section 2 heading: "### Shot list"',
                'Section 3 heading: "### Voiceover script"',
                'Section 4 heading: "### Search keywords"',
                'In "Shot list", include 6-10 short shots total across the day.',
                'In "Voiceover script", write short narration lines for each meal.',
              ].join(' ')
            : [
                'Return a full RECIPE PLAN (not just dish names).',
                'Use headings with "### Breakfast", "### Lunch", "### Dinner", "### Snacks".',
                'For each meal include:',
                '1) Dish name',
                '2) Ingredients (4-8 bullet points with rough amounts)',
                '3) Steps (3-6 short bullet points)',
                '4) Estimated calories for that meal',
                'At the end include a short daily total and 1-2 adjustment tips.',
              ].join(' '),
          mode === 'video'
            ? 'Keep total output under ~320 words and practical.'
            : 'Write practical home-cooking details. Target ~450-750 words so recipes include real ingredients and steps.',
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
    let recommendation = text

    if (mode === 'video' && !hasVideoStructure(recommendation)) {
      const rewriteResponse = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-oss:20b',
          prompt: [
            'Rewrite the following nutrition plan into strict video format.',
            'Rules:',
            '- Keep original food ideas and calories as much as possible.',
            '- Return ONLY plain text (no markdown code fence).',
            '- Structure:',
            '1) Intro block (no heading marks): "Video concept + timeline"',
            '2) Heading exactly: ### Shot list',
            '3) Heading exactly: ### Voiceover script',
            '4) Heading exactly: ### Search keywords',
            '- Keep concise, around 180-280 words.',
            '',
            'Input text:',
            recommendation,
          ].join('\n'),
          stream: false,
        }),
      })

      if (rewriteResponse.ok) {
        const rewriteData = await rewriteResponse.json()
        const rewritten =
          typeof rewriteData?.response === 'string'
            ? rewriteData.response
            : JSON.stringify(rewriteData?.response)
        if (rewritten && hasVideoStructure(rewritten)) {
          recommendation = rewritten
        }
      }
    }

    res.json({ recommendation })
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
