type Env = {
  GEMINI_API_KEY: string
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  return new Response(JSON.stringify(body), { ...init, headers })
}

function textResponse(text: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  return new Response(text, { ...init, headers })
}

async function geminiGenerate(
  apiKey: string,
  parts: Array<Record<string, unknown>>,
): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2 },
    }),
  })
  const text = await resp.text().catch(() => '')
  if (!resp.ok) {
    throw new Error(`Gemini HTTP ${resp.status}: ${text}`)
  }
  return JSON.parse(text) as unknown
}

function extractText(result: any): string {
  try {
    const t = result?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('') ?? ''
    return String(t)
  } catch {
    return ''
  }
}

function extractJsonObject(text: string): any | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) return null
  const raw = text.slice(start, end + 1)
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return textResponse('', { status: 204 })
    }

    if (url.pathname === '/api/health') {
      return jsonResponse({ ok: true })
    }

    const apiKey = env.GEMINI_API_KEY
    if (!apiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY is not set.' }, { status: 500 })
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed.' }, { status: 405 })
    }

    try {
      if (url.pathname === '/api/estimate-calories') {
        const body = (await req.json().catch(() => null)) as any
        const foodName = typeof body?.foodName === 'string' ? body.foodName.trim() : ''
        if (!foodName) return jsonResponse({ error: 'foodName is required.' }, { status: 400 })

        const result = await geminiGenerate(apiKey, [
          {
            text:
              'You estimate calories. Return ONLY a JSON object like {"calories": 123}. No other text.\n' +
              `Estimate calories for a typical single serving of: ${foodName}`,
          },
        ])

        const text = extractText(result)
        const parsed = extractJsonObject(text)
        const calories = parsed?.calories
        if (typeof calories !== 'number' || !Number.isFinite(calories) || calories < 0) {
          return jsonResponse(
            { error: 'AI did not return a valid calorie number.', detail: text },
            { status: 502 },
          )
        }
        return jsonResponse({ calories: Math.round(calories) })
      }

      if (url.pathname === '/api/recommend-meals') {
        const body = (await req.json().catch(() => null)) as any
        const dailyCalories = Number(body?.dailyCalories ?? 0)
        const profile = body?.profile ?? {}
        const entries = Array.isArray(body?.entries) ? body.entries : []

        if (!Number.isFinite(dailyCalories) || dailyCalories <= 0) {
          return jsonResponse(
            { error: 'dailyCalories is required and must be a positive number.' },
            { status: 400 },
          )
        }

        const prompt = [
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
            ? entries.map((e: any) => `- ${String(e?.name ?? '')}: ${Number(e?.calories ?? 0)} kcal`)
            : ['- (nothing logged yet)']),
          '',
          'Return a neat, readable plan. Use sections with "###".',
        ].join('\n')

        const result = await geminiGenerate(apiKey, [{ text: prompt }])
        const recommendation = extractText(result).trim()
        if (!recommendation) {
          return jsonResponse({ error: 'AI coach could not generate a recommendation.' }, { status: 502 })
        }
        return jsonResponse({ recommendation })
      }

      return jsonResponse({ error: 'Not found.' }, { status: 404 })
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
    }
  },
}

