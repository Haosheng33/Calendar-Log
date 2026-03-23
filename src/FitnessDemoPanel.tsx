import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  CATEGORY_DEFAULT_ICON,
  CATEGORY_EXERCISE_IMAGE,
  EXERCISE_LIBRARY,
  getExerciseById,
  type ExerciseCategory,
  type ExerciseDef,
} from './data/exerciseLibrary'
import { estimateExerciseCalories } from './fitnessCalories'
import { BodyMap } from './BodyMap'

export type { ExerciseCategory } from './data/exerciseLibrary'

type CalorieProfile = { sex: string; age: number; heightCm: number; weightKg: number; dailyCalories: number } | null

export type DemoExercise = {
  id: string
  libraryId: string | null
  name: string
  bodyParts: string[]
  category: ExerciseCategory
  weightLb: number | null
  repsPerSet: number | null
  sets: number | null
  minutes: number
  caloriesBurned: number
  done: boolean
  imageUrl: string
  iconEmoji: string
  imageDataUrl?: string
}

const STORAGE_KEY = 'fitnessDemoLogByDate'
const XP_PER_EXERCISE = 15
const XP_PER_MINUTE = 2

const CATEGORY_ORDER: ExerciseCategory[] = [
  'cardio', 'strength', 'flexibility', 'sports', 'recovery', 'other',
]

const CATEGORY_META: Record<ExerciseCategory, { label: string; emoji: string; hint: string; color: string }> = {
  cardio:      { label: 'Cardio',      emoji: '🏃', hint: 'Duration in minutes…',        color: '#ef4444' },
  strength:    { label: 'Strength',    emoji: '🏋️', hint: 'Weight (lb), reps & sets…',  color: '#f59e0b' },
  flexibility: { label: 'Flexibility', emoji: '🧘', hint: 'Duration in minutes…',        color: '#a855f7' },
  sports:      { label: 'Sports',      emoji: '⚽', hint: 'Duration in minutes…',        color: '#22c55e' },
  recovery:    { label: 'Recovery',    emoji: '🚶', hint: 'Duration in minutes…',        color: '#06b6d4' },
  other:       { label: 'Other',       emoji: '✨', hint: 'Duration or reps…',           color: '#64748b' },
}

const CUSTOM_BODY_PART_OPTIONS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
  'Core', 'Obliques', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves',
  'Heart & lungs', 'Full body', 'Hips', 'Neck / traps',
]

const MAX_PHOTO_WIDTH = 420

async function resizeImageFileToJpegDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') { resolve(null); return }
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_WIDTH / img.width)
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(img, 0, 0, w, h)
        try { resolve(canvas.toDataURL('image/jpeg', 0.82)) } catch { resolve(null) }
      }
      img.onerror = () => resolve(null)
      img.src = dataUrl
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

function migrateExercise(raw: unknown): DemoExercise | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || typeof e.name !== 'string') return null
  const category = (e.category as ExerciseCategory) ?? 'other'
  const libraryId = typeof e.libraryId === 'string' ? e.libraryId : null
  const fromLib = libraryId ? getExerciseById(libraryId) : undefined
  const imageUrl = typeof e.imageUrl === 'string' ? e.imageUrl : fromLib?.imageUrl ?? CATEGORY_EXERCISE_IMAGE[category]
  const iconEmoji = typeof e.iconEmoji === 'string' ? e.iconEmoji : fromLib?.iconEmoji ?? CATEGORY_DEFAULT_ICON[category]
  return {
    id: e.id as string,
    libraryId,
    name: String(e.name),
    bodyParts: Array.isArray(e.bodyParts) ? (e.bodyParts as string[]).filter((x) => typeof x === 'string') : [],
    category,
    weightLb: typeof e.weightLb === 'number' ? e.weightLb : null,
    repsPerSet: typeof e.repsPerSet === 'number' ? e.repsPerSet : null,
    sets: typeof e.sets === 'number' ? e.sets : null,
    minutes: typeof e.minutes === 'number' ? e.minutes : 0,
    caloriesBurned: typeof e.caloriesBurned === 'number' ? e.caloriesBurned : 0,
    done: Boolean(e.done),
    imageUrl, iconEmoji,
    imageDataUrl: typeof e.imageDataUrl === 'string' ? e.imageDataUrl : undefined,
  }
}

function readStored(): Record<string, DemoExercise[]> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, DemoExercise[]> = {}
    for (const [dateKey, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const rows = list.map(migrateExercise).filter((x): x is DemoExercise => x != null)
      if (rows.length) out[dateKey] = rows
    }
    return out
  } catch { return {} }
}

function writeStored(data: Record<string, DemoExercise[]>) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* */ }
}

function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }

/** An individual AI-suggested exercise that can be quick-added. */
type AiSuggestedExercise = {
  name: string
  category: ExerciseCategory
  bodyParts: string[]
  sets: number
  reps: number
  minutes: number
  reason: string
  libraryId: string | null
}

const AI_SUGGEST_CACHE_KEY = 'fitnessAiSuggestCache'
const AI_SUGGEST_CACHE_TTL_MS = 10 * 60 * 1000

function readAiSuggestCache(): Record<string, { suggestions: AiSuggestedExercise[]; timestamp: number }> {
  try {
    const raw = window.localStorage.getItem(AI_SUGGEST_CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, { suggestions: AiSuggestedExercise[]; timestamp: number }>
  } catch { return {} }
}

function writeAiSuggestCache(c: Record<string, { suggestions: AiSuggestedExercise[]; timestamp: number }>) {
  try { window.localStorage.setItem(AI_SUGGEST_CACHE_KEY, JSON.stringify(c)) } catch { /* */ }
}

function matchLibraryExercise(name: string): ExerciseDef | null {
  const lower = name.toLowerCase().trim()
  for (const ex of EXERCISE_LIBRARY) {
    if (ex.name.toLowerCase() === lower) return ex
  }
  for (const ex of EXERCISE_LIBRARY) {
    if (lower.includes(ex.name.toLowerCase()) || ex.name.toLowerCase().includes(lower)) return ex
  }
  return null
}

function apiUrl(base: string, path: string) {
  if (!base) return path
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
}

const BODY_PART_TARGETS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Core',
  'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Full body',
]

type Props = {
  selectedDate: string
  selectedDateLabel: string
  onSelectDate: (dateKey: string) => void
  userWeightKg: number | null
  apiBaseUrl: string
  userProfile: CalorieProfile
}

export function FitnessDemoPanel({ selectedDate, selectedDateLabel, onSelectDate, userWeightKg, apiBaseUrl, userProfile }: Props) {
  const [byDate, setByDate] = useState<Record<string, DemoExercise[]>>(() =>
    typeof window !== 'undefined' ? readStored() : {},
  )
  const [pickId, setPickId] = useState('')
  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] = useState<ExerciseCategory>('strength')
  const [customBodyParts, setCustomBodyParts] = useState<string[]>([])
  const [newWeightLb, setNewWeightLb] = useState<number | ''>('')
  const [newReps, setNewReps] = useState<number | ''>(10)
  const [newSets, setNewSets] = useState<number | ''>(3)
  const [newMinutes, setNewMinutes] = useState<number | ''>(30)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // AI suggestion state
  const [aiTargetParts, setAiTargetParts] = useState<string[]>([])
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestedExercise[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const aiAbortRef = useRef<AbortController | null>(null)

  const toggleAiTarget = (part: string) => {
    setAiTargetParts((prev) => prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part])
  }

  const buildLocalSuggestions = (targets: string[], alreadyNames: string[]): AiSuggestedExercise[] => {
    const alreadySet = new Set(alreadyNames.map((n) => n.toLowerCase()))
    const targetLower = new Set(targets.map((t) => t.toLowerCase()))
    const isFullBody = targetLower.has('full body')

    const scored: { ex: ExerciseDef; score: number }[] = []
    for (const ex of EXERCISE_LIBRARY) {
      if (alreadySet.has(ex.name.toLowerCase())) continue
      let overlap = 0
      for (const bp of ex.bodyParts) {
        if (isFullBody || targetLower.has(bp.toLowerCase())) overlap += 1
      }
      if (overlap > 0) scored.push({ ex, score: overlap })
    }
    scored.sort((a, b) => b.score - a.score)

    const picked: ExerciseDef[] = []
    const usedCategories = new Map<ExerciseCategory, number>()
    for (const { ex } of scored) {
      if (picked.length >= 6) break
      const catCount = usedCategories.get(ex.category) ?? 0
      if (catCount >= 3) continue
      picked.push(ex)
      usedCategories.set(ex.category, catCount + 1)
    }

    const REASONS: Record<ExerciseCategory, string> = {
      strength: 'Builds strength in the selected areas',
      cardio: 'Elevates heart rate and works your target muscles',
      flexibility: 'Improves mobility in the targeted regions',
      sports: 'Fun activity engaging your selected muscle groups',
      recovery: 'Active recovery for better circulation',
      other: 'Complementary work for your selected areas',
    }

    return picked.map((ex) => ({
      name: ex.name,
      category: ex.category,
      bodyParts: [...ex.bodyParts],
      sets: ex.category === 'strength' ? 3 : 0,
      reps: ex.category === 'strength' ? 10 : 0,
      minutes: ex.category !== 'strength' ? (ex.category === 'cardio' ? 20 : 15) : 0,
      reason: REASONS[ex.category],
      libraryId: ex.id,
    }))
  }

  const requestAiSuggestions = async () => {
    if (aiTargetParts.length === 0) { setAiError('Pick at least one body area to target.'); return }
    setAiError(null)
    setAiLoading(true)
    setAiSuggestions([])

    const cacheKey = JSON.stringify({ parts: [...aiTargetParts].sort(), profile: userProfile ? { sex: userProfile.sex, age: userProfile.age, weightKg: userProfile.weightKg } : null })
    const cache = readAiSuggestCache()
    const cached = cache[cacheKey]
    if (cached && Date.now() - cached.timestamp < AI_SUGGEST_CACHE_TTL_MS) {
      setAiSuggestions(cached.suggestions)
      setAiLoading(false)
      return
    }

    const alreadyLoggedNames = entries.map((e) => e.name)

    // Try AI API first, fall back to local smart matching
    let exercises: AiSuggestedExercise[] = []
    let usedApi = false

    if (apiBaseUrl) {
      try {
        aiAbortRef.current?.abort()
        const controller = new AbortController()
        aiAbortRef.current = controller

        const response = await fetch(apiUrl(apiBaseUrl, '/api/suggest-exercises'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            targetBodyParts: aiTargetParts,
            profile: userProfile ? { sex: userProfile.sex, age: userProfile.age, heightCm: userProfile.heightCm, weightKg: userProfile.weightKg } : null,
            alreadyLogged: alreadyLoggedNames,
            exerciseLibrary: EXERCISE_LIBRARY.map((e) => ({ id: e.id, name: e.name, category: e.category, bodyParts: e.bodyParts })),
          }),
        })

        const rawText = await response.text().catch(() => '')
        const data = (() => { try { return JSON.parse(rawText) } catch { return null } })() as { exercises?: unknown[]; error?: string } | null

        if (response.ok && Array.isArray(data?.exercises)) {
          for (const raw of data.exercises) {
            if (!raw || typeof raw !== 'object') continue
            const r = raw as Record<string, unknown>
            const name = typeof r.name === 'string' ? r.name.trim() : ''
            if (!name) continue
            const match = matchLibraryExercise(name)
            exercises.push({
              name: match?.name ?? name,
              category: (match?.category ?? (typeof r.category === 'string' ? r.category : 'strength')) as ExerciseCategory,
              bodyParts: match?.bodyParts ?? (Array.isArray(r.bodyParts) ? (r.bodyParts as string[]).filter((x) => typeof x === 'string') : aiTargetParts),
              sets: typeof r.sets === 'number' ? r.sets : 3,
              reps: typeof r.reps === 'number' ? r.reps : 10,
              minutes: typeof r.minutes === 'number' ? r.minutes : 0,
              reason: typeof r.reason === 'string' ? r.reason : '',
              libraryId: match?.id ?? null,
            })
          }
          if (exercises.length > 0) usedApi = true
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') { setAiLoading(false); return }
      }
    }

    if (exercises.length === 0) {
      exercises = buildLocalSuggestions(aiTargetParts, alreadyLoggedNames)
    }

    if (exercises.length === 0) {
      setAiError('No matching exercises found for those body areas. Try selecting different parts.')
      setAiLoading(false)
      return
    }

    setAiSuggestions(exercises)
    cache[cacheKey] = { suggestions: exercises, timestamp: Date.now() }
    const keys = Object.keys(cache)
    if (keys.length > 20) keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp).slice(0, keys.length - 20).forEach((k) => { delete cache[k] })
    writeAiSuggestCache(cache)
    if (!usedApi) setAiError(null)
    setAiLoading(false)
  }

  const quickAddSuggestion = (s: AiSuggestedExercise) => {
    const match = s.libraryId ? getExerciseById(s.libraryId) : null
    const category = match?.category ?? s.category
    const bodyParts = match?.bodyParts ?? s.bodyParts
    const imageUrl = match?.imageUrl ?? CATEGORY_EXERCISE_IMAGE[category]
    const iconEmoji = match?.iconEmoji ?? CATEGORY_DEFAULT_ICON[category]
    const weightLb = null
    const repsPerSet = s.reps > 0 ? s.reps : null
    const sets = s.sets > 0 ? s.sets : null
    const minutes = s.minutes > 0 ? s.minutes : 0
    const kcal = estimateExerciseCalories({ category, userWeightKg, minutes, weightLb, repsPerSet, sets, exercise: match ?? null })
    const row: DemoExercise = { id: newId(), libraryId: s.libraryId, name: s.name, bodyParts, category, weightLb, repsPerSet, sets, minutes, caloriesBurned: Math.max(1, kcal), done: false, imageUrl, iconEmoji }
    upsertDay(selectedDate, [...(byDate[selectedDate] ?? []), row])
  }

  useEffect(() => { writeStored(byDate) }, [byDate])

  const entries = byDate[selectedDate] ?? []
  const selectedDef = pickId && pickId !== '__custom__' ? getExerciseById(pickId) : null
  const effectiveCategory = selectedDef?.category ?? customCategory

  const previewCalories = useMemo(() => {
    if (!pickId) return null
    const def = selectedDef
    const minutes = newMinutes === '' ? 0 : Math.max(0, Number(newMinutes))
    const w = newWeightLb === '' ? null : Math.max(0, Number(newWeightLb))
    const r = newReps === '' ? null : Math.max(0, Math.round(Number(newReps)))
    const s = newSets === '' ? null : Math.max(0, Math.round(Number(newSets)))
    return estimateExerciseCalories({ category: effectiveCategory, userWeightKg, minutes, weightLb: w, repsPerSet: r, sets: s, exercise: def ?? null })
  }, [pickId, effectiveCategory, userWeightKg, newMinutes, newWeightLb, newReps, newSets, selectedDef])

  const upsertDay = useCallback((dateKey: string, next: DemoExercise[]) => {
    setByDate((prev) => ({ ...prev, [dateKey]: next }))
  }, [])

  const toggleBodyPart = (part: string) => {
    setCustomBodyParts((prev) => prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part])
  }

  const addExercise = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!pickId) { setFormError('Choose an exercise from the list or pick "Custom".'); return }
    const isCustom = pickId === '__custom__'
    const name = isCustom ? customName.trim() : selectedDef?.name ?? ''
    if (!name) { setFormError('Enter a name for your custom exercise.'); return }
    const def = isCustom ? null : selectedDef
    const category = def?.category ?? customCategory
    const bodyParts = def?.bodyParts?.length ? [...def.bodyParts] : [...customBodyParts]
    const minutes = newMinutes === '' ? 0 : Math.max(0, Math.round(Number(newMinutes)))
    const weightLb = newWeightLb === '' ? null : Math.max(0, Number(newWeightLb))
    const repsPerSet = newReps === '' ? null : Math.max(0, Math.round(Number(newReps)))
    const sets = newSets === '' ? null : Math.max(0, Math.round(Number(newSets)))
    const kcal = estimateExerciseCalories({ category, userWeightKg, minutes, weightLb, repsPerSet, sets, exercise: def ?? null })
    if (kcal <= 0) { setFormError(category === 'strength' ? 'Add weight + reps + sets, or reps + sets, or minutes.' : 'Add how long you did it (minutes).'); return }
    const imageUrl = def?.imageUrl ?? CATEGORY_EXERCISE_IMAGE[category]
    const iconEmoji = def?.iconEmoji ?? CATEGORY_DEFAULT_ICON[category]
    const row: DemoExercise = { id: newId(), libraryId: isCustom ? null : pickId, name, bodyParts, category, weightLb, repsPerSet, sets, minutes, caloriesBurned: kcal, done: false, imageUrl, iconEmoji, ...(pendingPhoto ? { imageDataUrl: pendingPhoto } : {}) }
    upsertDay(selectedDate, [...entries, row])
    setPickId(''); setCustomName(''); setCustomBodyParts([]); setNewWeightLb(''); setNewReps(10); setNewSets(3); setNewMinutes(30); setPendingPhoto(null); setShowForm(false)
  }

  const toggleDone = (id: string) => { upsertDay(selectedDate, entries.map((e) => e.id === id ? { ...e, done: !e.done } : e)) }
  const removeRow = (id: string) => { upsertDay(selectedDate, entries.filter((e) => e.id !== id)) }

  // ─── Derived stats ───
  const categorySummary = useMemo(() => {
    const map: Record<ExerciseCategory, { count: number; minutes: number; calories: number }> = {
      cardio: { count: 0, minutes: 0, calories: 0 }, strength: { count: 0, minutes: 0, calories: 0 },
      flexibility: { count: 0, minutes: 0, calories: 0 }, sports: { count: 0, minutes: 0, calories: 0 },
      recovery: { count: 0, minutes: 0, calories: 0 }, other: { count: 0, minutes: 0, calories: 0 },
    }
    for (const e of entries) { map[e.category].count += 1; map[e.category].minutes += e.minutes; map[e.category].calories += e.caloriesBurned }
    return map
  }, [entries])

  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0)
  const totalCalories = entries.reduce((s, e) => s + e.caloriesBurned, 0)
  const doneCount = entries.filter((e) => e.done).length
  const xpToday = entries.length * XP_PER_EXERCISE + totalMinutes * XP_PER_MINUTE

  const allBodyPartsToday = useMemo(() => {
    const s = new Set<string>()
    for (const e of entries) for (const p of e.bodyParts) s.add(p)
    return [...s]
  }, [entries])

  const muscleGroupCount = useMemo(() => {
    const unique = new Set<string>()
    for (const p of allBodyPartsToday) {
      if (['Full body', 'Heart & lungs', 'Heart & lungs (light)', 'Muscles & fascia', 'Recovery', 'Mobility', 'Posture', 'Joints'].includes(p)) continue
      unique.add(p)
    }
    return unique.size
  }, [allBodyPartsToday])

  const showLiftFields = effectiveCategory === 'strength'

  return (
    <section className="ft-panel log-card" aria-label="Fitness exercises">
      {/* ── Banner ── */}
      <div className="ft-banner">
        <span className="ft-badge">Demo</span>
        <span>Local only · Calorie burns are estimates</span>
      </div>

      {/* ── Hero header ── */}
      <div className="ft-hero">
        <div className="ft-hero-left">
          <h2 className="ft-hero-title">{selectedDateLabel}</h2>
          <p className="ft-hero-subtitle">
            {userWeightKg && userWeightKg > 0
              ? <>Using <strong>{Math.round(userWeightKg * 2.20462)} lb</strong> body weight</>
              : <>Set weight in <strong>Profile</strong> for better estimates</>}
          </p>
          <label className="ft-date-field">
            <input className="log-input" type="date" value={selectedDate} onChange={(e) => onSelectDate(e.target.value)} />
          </label>
        </div>
        <BodyMap highlight={allBodyPartsToday} className="ft-hero-body-map" />
      </div>

      {/* ── Stat cards row ── */}
      <div className="ft-stats-row">
        <div className="ft-stat-card ft-stat-xp">
          <span className="ft-stat-value">{xpToday}</span>
          <span className="ft-stat-label">XP earned</span>
        </div>
        <div className="ft-stat-card">
          <span className="ft-stat-value">{entries.length}</span>
          <span className="ft-stat-label">Exercises</span>
        </div>
        <div className="ft-stat-card">
          <span className="ft-stat-value">{doneCount}/{entries.length}</span>
          <span className="ft-stat-label">Completed</span>
        </div>
        <div className="ft-stat-card">
          <span className="ft-stat-value">{totalMinutes}</span>
          <span className="ft-stat-label">Minutes</span>
        </div>
        <div className="ft-stat-card">
          <span className="ft-stat-value">{totalCalories}</span>
          <span className="ft-stat-label">kcal burned</span>
        </div>
        <div className="ft-stat-card">
          <span className="ft-stat-value">{muscleGroupCount}</span>
          <span className="ft-stat-label">Muscles hit</span>
        </div>
      </div>

      {/* ── AI Workout Suggestion ── */}
      <div className="ft-ai-section">
        <button type="button" className={`ft-ai-toggle ${showAiPanel ? 'open' : ''}`} onClick={() => setShowAiPanel((v) => !v)}>
          <span className="ft-ai-toggle-icon">🤖</span>
          <span>AI exercise suggestion</span>
          <span className="ft-ai-toggle-arrow">{showAiPanel ? '▴' : '▾'}</span>
        </button>

        {showAiPanel ? (
          <div className="ft-ai-panel">
            <p className="ft-ai-desc">Select the body parts you want to train today and the AI will suggest a workout routine.</p>

            <div className="ft-ai-targets">
              <BodyMap highlight={aiTargetParts} className="ft-ai-bodymap" />
              <div className="ft-ai-target-chips">
                {BODY_PART_TARGETS.map((part) => {
                  const active = aiTargetParts.includes(part)
                  return (
                    <button key={part} type="button" className={`ft-ai-chip ${active ? 'active' : ''}`} onClick={() => toggleAiTarget(part)}>
                      {part}
                    </button>
                  )
                })}
              </div>
            </div>

            <button type="button" className="primary-button ft-ai-ask" onClick={requestAiSuggestions} disabled={aiLoading || aiTargetParts.length === 0}>
              {aiLoading ? 'Thinking…' : `Suggest workout for ${aiTargetParts.length || '…'} area${aiTargetParts.length !== 1 ? 's' : ''}`}
            </button>

            {aiError ? <p className="ft-form-error">{aiError}</p> : null}

            {aiSuggestions.length > 0 ? (
              <div className="ft-ai-results">
                <h4 className="ft-ai-results-title">Suggested exercises</h4>
                <ul className="ft-ai-suggest-list">
                  {aiSuggestions.map((s, i) => {
                    const meta = CATEGORY_META[s.category] ?? CATEGORY_META.other
                    const alreadyAdded = entries.some((e) => e.name.toLowerCase() === s.name.toLowerCase())
                    return (
                      <li key={i} className="ft-ai-suggest-card">
                        <div className="ft-ai-suggest-top">
                          <span className="ft-ai-suggest-emoji">{meta.emoji}</span>
                          <div className="ft-ai-suggest-info">
                            <span className="ft-ai-suggest-name">{s.name}</span>
                            <span className="ft-ai-suggest-meta">
                              {s.bodyParts.join(' · ')}
                              {s.sets > 0 && s.reps > 0 ? ` · ${s.reps} reps × ${s.sets} sets` : ''}
                              {s.minutes > 0 ? ` · ${s.minutes} min` : ''}
                            </span>
                            {s.reason ? <span className="ft-ai-suggest-reason">{s.reason}</span> : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`ft-ai-suggest-add ${alreadyAdded ? 'added' : ''}`}
                          disabled={alreadyAdded}
                          onClick={() => quickAddSuggestion(s)}
                        >
                          {alreadyAdded ? '✓ Added' : '+ Add'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Category breakdown ── */}
      <div className="ft-categories">
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat]
          const s = categorySummary[cat]
          if (s.count === 0) return null
          const pct = totalCalories > 0 ? Math.round((s.calories / totalCalories) * 100) : 0
          return (
            <div key={cat} className="ft-cat-bar" style={{ '--cat-color': meta.color } as React.CSSProperties}>
              <div className="ft-cat-bar-header">
                <span className="ft-cat-bar-icon">{meta.emoji}</span>
                <span className="ft-cat-bar-name">{meta.label}</span>
                <span className="ft-cat-bar-detail">{s.count} · {s.minutes} min · {s.calories} kcal</span>
              </div>
              <div className="ft-cat-bar-track">
                <div className="ft-cat-bar-fill" style={{ width: `${Math.max(4, pct)}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Add exercise toggle ── */}
      {!showForm ? (
        <button type="button" className="ft-add-btn" onClick={() => setShowForm(true)}>
          + Add exercise
        </button>
      ) : (
        <form className="ft-form" onSubmit={addExercise}>
          <div className="ft-form-header">
            <h3 className="ft-form-title">Log exercise</h3>
            <button type="button" className="ft-form-close" onClick={() => setShowForm(false)} aria-label="Close">✕</button>
          </div>

          <label className="field">
            <span className="field-label">Exercise</span>
            <select className="log-input month-select" value={pickId} onChange={(e) => { setPickId(e.target.value); setFormError(null); const v = e.target.value; if (v && v !== '__custom__') { const d = getExerciseById(v); if (d) setCustomCategory(d.category) } }}>
              <option value="">— Choose exercise —</option>
              {CATEGORY_ORDER.map((cat) => {
                const items = EXERCISE_LIBRARY.filter((ex) => ex.category === cat)
                if (!items.length) return null
                return (
                  <optgroup key={cat} label={`${CATEGORY_META[cat].emoji} ${CATEGORY_META[cat].label}`}>
                    {items.map((ex) => <option key={ex.id} value={ex.id}>{ex.iconEmoji} {ex.name}</option>)}
                  </optgroup>
                )
              })}
              <option value="__custom__">✏️ Custom exercise…</option>
            </select>
          </label>

          {/* Exercise preview card */}
          {pickId ? (
            <div className="ft-exercise-preview">
              <div className="ft-preview-visual">
                <div className="ft-preview-img-wrap">
                  <img src={pendingPhoto ?? (selectedDef?.imageUrl ?? CATEGORY_EXERCISE_IMAGE[customCategory])} alt="" className="ft-preview-img" />
                  <span className="ft-preview-emoji">{selectedDef?.iconEmoji ?? CATEGORY_META[customCategory].emoji}</span>
                </div>
                {selectedDef ? <BodyMap highlight={selectedDef.bodyParts} className="ft-preview-bodymap" /> : null}
              </div>
              {selectedDef ? (
                <div className="ft-preview-tags">
                  {selectedDef.bodyParts.map((p) => <span key={p} className="ft-bp-tag">{p}</span>)}
                </div>
              ) : null}
            </div>
          ) : null}

          {pickId === '__custom__' ? (
            <div className="ft-custom-fields">
              <label className="field"><span className="field-label">Custom name</span><input className="log-input" type="text" placeholder="e.g. Cable crossover" value={customName} onChange={(e) => setCustomName(e.target.value)} /></label>
              <label className="field"><span className="field-label">Category</span>
                <select className="log-input month-select" value={customCategory} onChange={(e) => setCustomCategory(e.target.value as ExerciseCategory)}>
                  {CATEGORY_ORDER.map((cat) => <option key={cat} value={cat}>{CATEGORY_META[cat].emoji} {CATEGORY_META[cat].label}</option>)}
                </select>
              </label>
              <fieldset className="ft-bp-fieldset">
                <legend className="field-label">Body areas</legend>
                <div className="ft-bp-grid">
                  {CUSTOM_BODY_PART_OPTIONS.map((part) => (
                    <label key={part} className="ft-bp-check">
                      <input type="checkbox" checked={customBodyParts.includes(part)} onChange={() => toggleBodyPart(part)} />{part}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          <div className="ft-inputs-row">
            {showLiftFields ? (
              <>
                <label className="field"><span className="field-label">Weight (lb)</span><input className="log-input" type="number" min={0} step={0.5} placeholder="135" value={newWeightLb} onChange={(e) => setNewWeightLb(e.target.value === '' ? '' : Number(e.target.value))} /></label>
                <label className="field"><span className="field-label">Reps</span><input className="log-input" type="number" min={0} step={1} value={newReps} onChange={(e) => setNewReps(e.target.value === '' ? '' : Math.round(Number(e.target.value)))} /></label>
                <label className="field"><span className="field-label">Sets</span><input className="log-input" type="number" min={0} step={1} value={newSets} onChange={(e) => setNewSets(e.target.value === '' ? '' : Math.round(Number(e.target.value)))} /></label>
              </>
            ) : null}
            <label className="field"><span className="field-label">Minutes</span><input className="log-input" type="number" min={0} step={1} placeholder="30" value={newMinutes} onChange={(e) => setNewMinutes(e.target.value === '' ? '' : Number(e.target.value))} /></label>
          </div>

          <label className="field ft-photo-field">
            <span className="field-label">Photo (optional)</span>
            <input className="file-input" type="file" accept="image/*" onChange={async (ev) => { const file = ev.target.files?.[0]; ev.target.value = ''; if (!file) return; const d = await resizeImageFileToJpegDataUrl(file); if (d) setPendingPhoto(d) }} />
            {pendingPhoto ? <button type="button" className="secondary-button ft-photo-rm" onClick={() => setPendingPhoto(null)}>Remove photo</button> : null}
          </label>

          <div className="ft-kcal-preview" aria-live="polite">
            {previewCalories == null ? 'Pick an exercise to see estimated burn' : <>Est. burn: <strong>{previewCalories}</strong> kcal</>}
          </div>

          {formError ? <p className="ft-form-error">{formError}</p> : null}
          <button type="submit" className="primary-button ft-submit">Add to this day</button>
        </form>
      )}

      {/* ── Exercise cards ── */}
      {entries.length === 0 ? (
        <p className="ft-empty">No exercises logged for this day yet.</p>
      ) : (
        <ul className="ft-exercise-list">
          {entries.map((e) => {
            const meta = CATEGORY_META[e.category]
            const parts = e.bodyParts.length ? e.bodyParts.join(' · ') : '—'
            const liftBit = e.weightLb != null && e.weightLb > 0 && e.repsPerSet && e.sets
              ? `${e.weightLb} lb × ${e.repsPerSet} × ${e.sets}`
              : e.repsPerSet && e.sets ? `${e.repsPerSet} × ${e.sets}` : null
            const exXp = XP_PER_EXERCISE + e.minutes * XP_PER_MINUTE
            return (
              <li key={e.id} className={`ft-card ${e.done ? 'done' : ''}`} style={{ '--cat-color': meta.color } as React.CSSProperties}>
                <div className="ft-card-accent" />
                <label className="ft-card-check">
                  <input type="checkbox" checked={e.done} onChange={() => toggleDone(e.id)} />
                </label>
                <div className="ft-card-img-wrap">
                  <img src={e.imageDataUrl ?? e.imageUrl} alt="" className="ft-card-img" />
                  <span className="ft-card-emoji">{e.iconEmoji}</span>
                </div>
                <div className="ft-card-body">
                  <div className="ft-card-top">
                    <span className="ft-card-name">{e.name}</span>
                    <span className="ft-card-xp">+{exXp} XP</span>
                  </div>
                  <span className="ft-card-parts">{parts}</span>
                  <div className="ft-card-stats">
                    <span className="ft-card-cat-pill" style={{ background: `${meta.color}20`, color: meta.color, borderColor: `${meta.color}40` }}>
                      {meta.emoji} {meta.label}
                    </span>
                    {liftBit ? <span className="ft-card-detail">{liftBit}</span> : null}
                    {e.minutes > 0 ? <span className="ft-card-detail">{e.minutes} min</span> : null}
                    <span className="ft-card-detail ft-card-kcal">~{e.caloriesBurned} kcal</span>
                  </div>
                </div>
                <button type="button" className="ft-card-remove" onClick={() => removeRow(e.id)} aria-label="Remove">✕</button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
