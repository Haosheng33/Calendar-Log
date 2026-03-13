import './App.css'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Login, type AuthUser } from './Login'
import { auth, db, firebaseConfigError } from './firebase-config'
import { COOK_COMBO_OPTIONS, type ComboCategory } from './data/comboLibrary'
import { BILIBILI_RECIPE_LIBRARY, type BilibiliRecipeResult } from './data/bilibiliLibrary'
import { COOK_RECIPE_SNAPSHOT } from './data/cookRecipeSnapshot'
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
} from 'firebase/firestore'

type FoodEntry = {
  id: string
  name: string
  calories: number
  imageDataUrl?: string
  imageUrl?: string
  iconEmoji?: string
  meal?: MealCategory
}

type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack'

type Theme = 'light' | 'dark'
type CoachMode = 'normal' | 'video'

const THEME_KEY = 'foodLogTheme'

function getMealMeta(meal: MealCategory) {
  switch (meal) {
    case 'breakfast':
      return { label: 'Breakfast', icon: '🌅', className: 'breakfast' }
    case 'lunch':
      return { label: 'Lunch', icon: '☀️', className: 'lunch' }
    case 'dinner':
      return { label: 'Dinner', icon: '🌙', className: 'dinner' }
    default:
      return { label: 'Snack', icon: '🍪', className: 'snack' }
  }
}

const CALORIE_CACHE_KEY_BASE = 'calorieEstimateCache'
const KG_PER_LB = 0.45359237

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
const OWNER_EMAIL = (import.meta.env.VITE_OWNER_EMAIL ?? '').trim().toLowerCase()
const COACH_CACHE_KEY = 'coachRecommendationCache'
const COACH_CACHE_TTL_MS = 10 * 60 * 1000
const COACH_PROMPT_VERSION = 4
const COOK_RECIPE_CSV_URL =
  'https://raw.githubusercontent.com/YunYouJun/cook/main/app/data/recipe.csv'
const COOK_RECIPE_CACHE_KEY = 'cookRecipeCsvCache'
const COOK_RECIPE_CACHE_TTL_MS = 12 * 60 * 60 * 1000

type CookCsvRecipe = {
  name: string
  stuff: string
  bv: string
  methods: string
  tools: string
}

const COMBO_CATEGORY_ORDER: ComboCategory[] = ['vegetable', 'meat', 'mainMeal', 'tool']
const COMBO_CATEGORY_LABEL: Record<ComboCategory, string> = {
  vegetable: 'Vegetables',
  meat: 'Meat',
  mainMeal: 'Main meal',
  tool: 'Tool to cook',
}

function apiUrl(path: string) {
  if (!API_BASE_URL) return path
  return `${API_BASE_URL.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
}

function readCoachCache(): Record<string, { recommendation: string; timestamp: number }> {
  try {
    const raw = window.localStorage.getItem(COACH_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, { recommendation: string; timestamp: number }>
  } catch {
    return {}
  }
}

function writeCoachCache(cache: Record<string, { recommendation: string; timestamp: number }>) {
  try {
    window.localStorage.setItem(COACH_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // ignore
  }
}

function readCookRecipeCache(): CookCsvRecipe[] | null {
  try {
    const raw = window.localStorage.getItem(COOK_RECIPE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { timestamp?: unknown; rows?: unknown }
    if (!parsed || typeof parsed !== 'object') return null
    const timestamp = Number(parsed.timestamp ?? 0)
    if (!timestamp || Date.now() - timestamp > COOK_RECIPE_CACHE_TTL_MS) return null
    if (!Array.isArray(parsed.rows)) return null
    return parsed.rows as CookCsvRecipe[]
  } catch {
    return null
  }
}

function writeCookRecipeCache(rows: CookCsvRecipe[]) {
  try {
    window.localStorage.setItem(
      COOK_RECIPE_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), rows }),
    )
  } catch {
    // ignore cache errors
  }
}

function parseCookCsv(text: string): CookCsvRecipe[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length <= 1) return []
  const rows: CookCsvRecipe[] = []
  for (const line of lines.slice(1)) {
    const cols = line.split(',')
    const name = (cols[0] ?? '').trim()
    const stuff = (cols[1] ?? '').trim()
    const bv = (cols[2] ?? '').trim()
    const methods = (cols[5] ?? '').trim()
    const tools = (cols[6] ?? '').trim()
    if (!name || !stuff || !/^BV/i.test(bv)) continue
    rows.push({ name, stuff, bv, methods, tools })
  }
  return rows
}

async function fetchCookRecipeRows(): Promise<CookCsvRecipe[]> {
  const cached = readCookRecipeCache()
  if (cached && cached.length) return cached

  const response = await fetch(COOK_RECIPE_CSV_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch cook recipe data (HTTP ${response.status}).`)
  }
  const csvText = await response.text()
  const rows = parseCookCsv(csvText)
  if (!rows.length) {
    throw new Error('Cook recipe data is empty or invalid.')
  }
  writeCookRecipeCache(rows)
  return rows
}

function buildBilibiliRecipeResults(
  selectedCombos: string[],
  cookRows: CookCsvRecipe[],
): BilibiliRecipeResult[] {
  const selectedSet = new Set(selectedCombos)
  const selectedOptions = COOK_COMBO_OPTIONS.filter((o) => selectedSet.has(o.id))
  const selectedIngredientOptions = selectedOptions.filter((o) => o.category !== 'tool')
  const selectedToolOptions = selectedOptions.filter((o) => o.category === 'tool')

  const manualMatches = BILIBILI_RECIPE_LIBRARY.filter((item) =>
    item.comboIds.every((comboId) => selectedSet.has(comboId)),
  )

  const scored = cookRows
    .map((row, index) => {
      const ingredientText = row.stuff.replaceAll('、', ' ')
      const toolText = `${row.tools} ${row.methods}`.replaceAll('、', ' ')
      const ingredientMatchCount = selectedIngredientOptions.filter((option) =>
        option.aliasesZh.some((alias) => ingredientText.includes(alias)),
      ).length
      const toolMatchCount = selectedToolOptions.filter((option) =>
        option.aliasesZh.some((alias) => toolText.includes(alias)),
      ).length
      return { row, index, ingredientMatchCount, toolMatchCount }
    })
    .filter((item) => {
      const ingredientMatched =
        selectedIngredientOptions.length === 0 ||
        item.ingredientMatchCount >= selectedIngredientOptions.length
      const toolMatched =
        selectedToolOptions.length === 0 || item.toolMatchCount >= selectedToolOptions.length
      return ingredientMatched && toolMatched
    })
    .sort(
      (a, b) =>
        b.ingredientMatchCount + b.toolMatchCount - (a.ingredientMatchCount + a.toolMatchCount) ||
        a.index - b.index,
    )

  const seen = new Set<string>()
  const combined: BilibiliRecipeResult[] = []

  for (const item of manualMatches) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    combined.push(item)
  }

  for (const item of scored) {
    const url = `https://www.bilibili.com/video/${item.row.bv}/`
    if (seen.has(url)) continue
    seen.add(url)
    combined.push({
      id: `cook-${item.row.bv}-${item.index}`,
      title: item.row.name,
      comboIds: selectedCombos,
      url,
    })
    if (combined.length >= 160) break
  }

  return combined
}

function userKey(base: string, userId: string | undefined): string {
  return userId ? `${base}_${userId}` : base
}

type CalorieEstimateCache = Record<string, number>

type Sex = 'male' | 'female'

type CalorieProfile = {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  dailyCalories: number
}

function normalizeFoodKey(name: string) {
  return name.trim().toLowerCase()
}

function getFoodEmoji(name: string) {
  const n = name.toLowerCase()
  if (n.includes('rice')) return '🍚'
  if (n.includes('noodle') || n.includes('pasta')) return '🍝'
  if (n.includes('soup')) return '🍲'
  if (n.includes('salad')) return '🥗'
  if (n.includes('egg')) return '🥚'
  if (n.includes('bread') || n.includes('toast') || n.includes('sandwich')) return '🥪'
  if (n.includes('chicken') || n.includes('drum')) return '🍗'
  if (n.includes('beef') || n.includes('steak')) return '🥩'
  if (n.includes('fish') || n.includes('salmon') || n.includes('tuna')) return '🐟'
  if (n.includes('fruit') || n.includes('apple') || n.includes('banana') || n.includes('berry'))
    return '🍎'
  if (n.includes('pizza')) return '🍕'
  if (n.includes('burger')) return '🍔'
  if (n.includes('ice cream') || n.includes('icecream')) return '🍨'
  if (n.includes('cake')) return '🍰'
  if (n.includes('coffee')) return '☕'
  return '🍽️'
}

function readCalorieCache(userEmail: string | undefined): CalorieEstimateCache {
  try {
    const key = userKey(CALORIE_CACHE_KEY_BASE, userEmail)
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as CalorieEstimateCache
  } catch {
    return {}
  }
}

function writeCalorieCache(userEmail: string | undefined, cache: CalorieEstimateCache) {
  try {
    const key = userKey(CALORIE_CACHE_KEY_BASE, userEmail)
    window.localStorage.setItem(key, JSON.stringify(cache))
  } catch {
    // ignore storage errors
  }
}

async function estimateCaloriesAI(foodName: string): Promise<number> {
  const response = await fetch(apiUrl('/api/estimate-calories'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foodName }),
  })

  const rawText = await response.text().catch(() => '')
  const data = (() => {
    try {
      return JSON.parse(rawText) as { calories?: unknown; error?: unknown; detail?: unknown }
    } catch {
      return null
    }
  })()

  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `AI calorie estimation failed (HTTP ${response.status}).`
    const detail =
      typeof data?.detail === 'string'
        ? data.detail
        : rawText && rawText.length < 800
          ? rawText
          : ''
    throw new Error(detail ? `${message}\n${detail}` : message)
  }

  const calories = data?.calories
  if (typeof calories !== 'number' || !Number.isFinite(calories) || calories < 0) {
    throw new Error('AI did not return a valid calorie number.')
  }

  return Math.round(calories)
}

async function estimateCaloriesFromImage(
  imageDataUrl: string,
): Promise<{ name: string | null; calories: number }> {
  const response = await fetch(apiUrl('/api/estimate-calories-image'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl }),
  })

  const data = (await response.json().catch(() => null)) as
    | { name?: unknown; calories?: unknown; error?: unknown }
    | null

  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : 'Image-based calorie estimation failed.'
    throw new Error(message)
  }

  const calories = data?.calories
  const name =
    typeof data?.name === 'string' && data.name.trim() ? (data.name as string).trim() : null

  if (typeof calories !== 'number' || !Number.isFinite(calories) || calories < 0) {
    throw new Error('Image AI did not return a valid calorie number.')
  }

  return { name, calories: Math.round(calories) }
}

async function estimateCaloriesFromImageUrl(
  imageUrl: string,
): Promise<{ name: string | null; calories: number }> {
  const response = await fetch(apiUrl('/api/estimate-calories-image'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  })

  const data = (await response.json().catch(() => null)) as
    | { name?: unknown; calories?: unknown; error?: unknown }
    | null

  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : 'Image URL calorie estimation failed.'
    throw new Error(message)
  }

  const calories = data?.calories
  const name =
    typeof data?.name === 'string' && data.name.trim() ? (data.name as string).trim() : null

  if (typeof calories !== 'number' || !Number.isFinite(calories) || calories < 0) {
    throw new Error('Image AI did not return a valid calorie number.')
  }

  return { name, calories: Math.round(calories) }
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getMonthLabel(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

function toAuthUser(u: FirebaseUser): AuthUser {
  return {
    email: u.email ?? '',
    name: u.displayName ?? u.email ?? 'User',
    picture: u.photoURL ?? undefined,
  }
}

function buildCalendar(year: number, monthIndex: number) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const firstDayOfWeek = firstOfMonth.getDay() // 0 (Sun) - 6 (Sat)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i += 1) {
    cells.push(null)
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day)
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  return weeks
}

function App() {
  if (firebaseConfigError) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Food Log Calendar</h1>
          <p className="login-error" role="alert">
            {firebaseConfigError}
          </p>
          <p className="login-subtitle">
            After updating env vars, restart the dev server and reload the page.
          </p>
        </div>
      </div>
    )
  }

  const today = useMemo(() => new Date(), [])
  const [currentMonth, setCurrentMonth] = useState(() => today.getMonth())
  const [currentYear, setCurrentYear] = useState(() => today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(today))
  const [newEntryName, setNewEntryName] = useState('')
  const [newEntryCalories, setNewEntryCalories] = useState<number | ''>('')
  const [newEntryMeal, setNewEntryMeal] = useState<MealCategory>('breakfast')
  const [newEntryImage, setNewEntryImage] = useState<string | undefined>(undefined)
  const [newEntryImageUrl, setNewEntryImageUrl] = useState('')
  const [isEstimatingCalories, setIsEstimatingCalories] = useState(false)
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(() => today.getMonth())
  const [pickerYear, setPickerYear] = useState(() => today.getFullYear())

  const [profileSex, setProfileSex] = useState<Sex>('male')
  const [profileAge, setProfileAge] = useState<number | ''>('')
  const [profileHeightCm, setProfileHeightCm] = useState<number | ''>('')
  const [profileWeightLb, setProfileWeightLb] = useState<number | ''>('')
  const [dailyCalorieNeed, setDailyCalorieNeed] = useState<number | null>(null)
  const [coachAdvice, setCoachAdvice] = useState<string | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState<string | null>(null)
  const [coachVisible, setCoachVisible] = useState(true)
  const [coachMode, setCoachMode] = useState<CoachMode>('normal')
  const [selectedCombos, setSelectedCombos] = useState<string[]>([])
  const [cookRecipeRows, setCookRecipeRows] = useState<CookCsvRecipe[]>(COOK_RECIPE_SNAPSHOT)
  const [cookRecipeLoading, setCookRecipeLoading] = useState(false)
  const [cookRecipeError, setCookRecipeError] = useState<string | null>(null)

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark'
    const saved = window.localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? (saved as Theme) : 'dark'
  })

  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [totalUsers, setTotalUsers] = useState<number | null>(null)
  const [totalUsersLoading, setTotalUsersLoading] = useState(false)
  const [totalUsersError, setTotalUsersError] = useState<string | null>(null)

  const [entriesLoading, setEntriesLoading] = useState(true)
  const [entries, setEntries] = useState<FoodEntry[]>([])
  const [entriesError, setEntriesError] = useState<string | null>(null)
  const [saveEntryError, setSaveEntryError] = useState<string | null>(null)
  const [saveEntryLoading, setSaveEntryLoading] = useState(false)

  useEffect(() => {
    setPickerMonth(currentMonth)
    setPickerYear(currentYear)
  }, [currentMonth, currentYear])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme)
    }
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      // ignore
    }
  }, [theme])

  useEffect(() => {
    if (coachMode !== 'video') return

    let cancelled = false
    setCookRecipeLoading(false)
    setCookRecipeError(null)

    void fetchCookRecipeRows()
      .then((rows) => {
        if (cancelled) return
        if (rows.length > 0) setCookRecipeRows(rows)
      })
      .catch((err) => {
        if (cancelled) return
        if (!cookRecipeRows.length) {
          setCookRecipeError(
            err instanceof Error ? err.message : 'Failed to import recipe videos from cook data.',
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [coachMode])

  useEffect(() => {
    if (!auth) {
      setUser(null)
      setUserId(null)
      setAuthLoading(false)
      return
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setUser(null)
        setUserId(null)
        setAuthLoading(false)
        return
      }
      setUserId(u.uid)
      setUser(toAuthUser(u))
      setAuthLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!db || !userId || !user?.email) return

    // Record a unique active user document so we can count total users.
    void setDoc(
      doc(db, 'app_users', userId),
      {
        uid: userId,
        email: user.email,
        name: user.name ?? null,
        lastSeenAt: serverTimestamp(),
      },
      { merge: true },
    )
  }, [db, userId, user?.email, user?.name])

  const isOwner = Boolean(user?.email && OWNER_EMAIL && user.email.toLowerCase() === OWNER_EMAIL)

  useEffect(() => {
    if (!db || !isOwner) {
      setTotalUsers(null)
      setTotalUsersError(null)
      setTotalUsersLoading(false)
      return
    }

    setTotalUsersLoading(true)
    setTotalUsersError(null)
    void getCountFromServer(collection(db, 'app_users'))
      .then((snapshot) => {
        setTotalUsers(snapshot.data().count)
      })
      .catch((err) => {
        setTotalUsersError(err instanceof Error ? err.message : 'Failed to load user count.')
      })
      .finally(() => setTotalUsersLoading(false))
  }, [db, isOwner])

  const [profileLoading, setProfileLoading] = useState(true)
  const [profileDoc, setProfileDoc] = useState<CalorieProfile | null>(null)

  useEffect(() => {
    if (!userId) {
      setProfileLoading(false)
      setProfileDoc(null)
      setProfileSex('male')
      setProfileAge('')
      setProfileHeightCm('')
      setProfileWeightLb('')
      setDailyCalorieNeed(null)
      return
    }

    setProfileLoading(true)
    if (!db) {
      setProfileLoading(false)
      return
    }
    const profileRef = doc(db, 'user_profiles', userId)
    const unsub = onSnapshot(
      profileRef,
      (snap) => {
        const data = (snap.data() ?? null) as (DocumentData & Partial<CalorieProfile>) | null
        if (!data) {
          setProfileDoc(null)
          setProfileSex('male')
          setProfileAge('')
          setProfileHeightCm('')
          setProfileWeightLb('')
          setDailyCalorieNeed(null)
          setProfileLoading(false)
          return
        }

        const parsed: CalorieProfile = {
          sex: data.sex === 'female' ? 'female' : 'male',
          age: typeof data.age === 'number' ? data.age : 0,
          heightCm: typeof data.heightCm === 'number' ? data.heightCm : 0,
          weightKg: typeof data.weightKg === 'number' ? data.weightKg : 0,
          dailyCalories: typeof data.dailyCalories === 'number' ? data.dailyCalories : 0,
        }

        setProfileDoc(parsed)
        setProfileSex(parsed.sex)
        setProfileAge(parsed.age || '')
        setProfileHeightCm(parsed.heightCm || '')
        setProfileWeightLb(parsed.weightKg ? parsed.weightKg / KG_PER_LB : '')
        setDailyCalorieNeed(parsed.dailyCalories || null)
        setProfileLoading(false)
      },
      () => {
        setProfileLoading(false)
      },
    )

    return () => unsub()
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setEntries([])
      setEntriesLoading(false)
      setEntriesError(null)
      return
    }

    setEntriesLoading(true)
    setEntriesError(null)
    if (!db) {
      setEntriesLoading(false)
      setEntriesError('Firestore is not available.')
      return
    }
    // Avoid composite-index requirements by only filtering by uid in the query.
    // We filter by dateKey + sort in-memory using createdAtMillis.
    const q = query(collection(db, 'calendar_logs'), where('uid', '==', userId))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => {
          const data = d.data() as DocumentData
          const createdAtMillis =
            typeof data.createdAtMillis === 'number' ? (data.createdAtMillis as number) : 0
          const dateKey = typeof data.dateKey === 'string' ? data.dateKey : ''
          const meal =
            data.meal === 'breakfast' || data.meal === 'lunch' || data.meal === 'dinner'
              ? (data.meal as MealCategory)
              : 'snack'
          const iconEmoji = typeof data.iconEmoji === 'string' ? data.iconEmoji : undefined
          const entry: FoodEntry = {
            id: d.id,
            name: typeof data.name === 'string' ? data.name : '',
            calories: typeof data.calories === 'number' ? data.calories : 0,
            imageDataUrl: typeof data.imageDataUrl === 'string' ? data.imageDataUrl : undefined,
            imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
            iconEmoji,
            meal,
          }
          return { entry, dateKey, createdAtMillis }
        })
        const filtered = next
          .filter((x) => x.entry.name && x.dateKey === selectedDate)
          .sort((a, b) => a.createdAtMillis - b.createdAtMillis)
          .map((x) => x.entry)
        setEntries(filtered)
        setEntriesLoading(false)
      },
      (err) => {
        setEntriesError(err instanceof Error ? err.message : 'Failed to load entries.')
        setEntriesLoading(false)
      },
    )
    return () => unsub()
  }, [userId, selectedDate])

  const addEntry = async (entry: Omit<FoodEntry, 'id'>) => {
    if (!userId || !db) return
    const trimmedName = entry.name.trim()
    if (!trimmedName) return
    if (!Number.isFinite(entry.calories) || entry.calories < 0) return

    // Firestore docs are limited to ~1MB; avoid storing very large base64 images.
    // We still keep the image in memory for detection, but drop it when persisting if too large.
    let imageUrl: string | null = entry.imageUrl ?? null
    let imageDataUrl: string | null = entry.imageDataUrl ?? null

    // If the user uploaded an image, we do NOT persist it (to avoid size limits and keep storage free).
    // We store only a generated emoji icon based on the detected/entered name.
    if (imageDataUrl) imageDataUrl = null
    if (imageUrl) imageUrl = null
    const iconEmoji = entry.iconEmoji ?? getFoodEmoji(trimmedName)

    await addDoc(collection(db, 'calendar_logs'), {
      uid: userId,
      userEmail: user?.email ?? null,
      dateKey: selectedDate,
      name: trimmedName,
      calories: entry.calories,
      imageDataUrl,
      imageUrl,
      iconEmoji,
      meal: entry.meal ?? 'snack',
      createdAt: serverTimestamp(),
      createdAtMillis: Date.now(),
    })
  }

  const removeEntry = async (id: string) => {
    if (!userId || !db) return
    await deleteDoc(doc(db, 'calendar_logs', id))
  }

  const onPrevMonth = () => {
    setCurrentMonth((prev) => {
      if (prev === 0) {
        setCurrentYear((y) => y - 1)
        return 11
      }
      return prev - 1
    })
  }

  const onNextMonth = () => {
    setCurrentMonth((prev) => {
      if (prev === 11) {
        setCurrentYear((y) => y + 1)
        return 0
      }
      return prev + 1
    })
  }

  const handleSelectDate = (day: number | null) => {
    if (!day) return
    const date = new Date(currentYear, currentMonth, day)
    setSelectedDate(formatDateKey(date))
  }

  const handleAddEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaveEntryError(null)
    if (!newEntryName.trim()) return
    const caloriesNumber = typeof newEntryCalories === 'number' ? newEntryCalories : Number.NaN
    if (!Number.isFinite(caloriesNumber)) return

    setSaveEntryLoading(true)
    try {
      await addEntry({
        name: newEntryName,
        calories: caloriesNumber,
        imageDataUrl: newEntryImage,
        imageUrl: newEntryImageUrl.trim() || undefined,
        iconEmoji: getFoodEmoji(newEntryName),
        meal: newEntryMeal,
      })
      setNewEntryName('')
      setNewEntryCalories('')
      setNewEntryMeal('breakfast')
      setNewEntryImage(undefined)
      setNewEntryImageUrl('')
    } catch (err) {
      setSaveEntryError(err instanceof Error ? err.message : 'Failed to save entry.')
    } finally {
      setSaveEntryLoading(false)
    }
  }

  const handleImageChange = async (file: File | undefined) => {
    if (!file) {
      setNewEntryImage(undefined)
      return
    }

    const hasImageMime = Boolean(file.type) && file.type.startsWith('image/')
    const hasImageExt = /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name || '')
    if (!hasImageMime && !hasImageExt) {
      setNewEntryImage(undefined)
      return
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(file)
    })

    setNewEntryImage(dataUrl || undefined)
  }

  const handleEstimateCalories = async () => {
    setEstimateError(null)
    const hasImage = Boolean(newEntryImage)

    if (hasImage && newEntryImage) {
      setIsEstimatingCalories(true)
      try {
        const { name, calories } = await estimateCaloriesFromImage(newEntryImage)
        if (name && name.trim()) setNewEntryName(name.trim())
        setNewEntryCalories(calories)
        // We only use the upload for detection; don't keep the huge data URL in state.
        setNewEntryImage(undefined)
      } catch (err) {
        setEstimateError(
          err instanceof Error ? err.message : 'Failed to estimate calories from image.',
        )
      } finally {
        setIsEstimatingCalories(false)
      }
      return
    }

    const imageUrl = newEntryImageUrl.trim()
    if (imageUrl) {
      setIsEstimatingCalories(true)
      try {
        const result = await estimateCaloriesFromImageUrl(imageUrl)
        if (result.name && result.name.trim()) setNewEntryName(result.name.trim())
        setNewEntryCalories(result.calories)
      } catch (err) {
        setEstimateError(
          err instanceof Error ? err.message : 'Failed to estimate from image URL.',
        )
      } finally {
        setIsEstimatingCalories(false)
      }
      return
    }

    const name = newEntryName.trim()
    if (!name) return

    const cacheKey = normalizeFoodKey(name)
    const cache = readCalorieCache(user?.email)
    if (typeof cache[cacheKey] === 'number') {
      setNewEntryCalories(cache[cacheKey])
      return
    }

    setIsEstimatingCalories(true)
    try {
      const calories = await estimateCaloriesAI(name)
      setNewEntryCalories(calories)
      cache[cacheKey] = calories
      writeCalorieCache(user?.email, cache)
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : 'Failed to estimate calories.')
    } finally {
      setIsEstimatingCalories(false)
    }
  }

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const ageNumber = typeof profileAge === 'number' ? profileAge : Number(profileAge)
    const heightNumber =
      typeof profileHeightCm === 'number' ? profileHeightCm : Number(profileHeightCm)
    const weightLbNumber =
      typeof profileWeightLb === 'number' ? profileWeightLb : Number(profileWeightLb)

    if (!Number.isFinite(ageNumber) || ageNumber <= 0) return
    if (!Number.isFinite(heightNumber) || heightNumber <= 0) return
    if (!Number.isFinite(weightLbNumber) || weightLbNumber <= 0) return

    const weightKgNumber = weightLbNumber * KG_PER_LB

    const base =
      10 * weightKgNumber +
      6.25 * heightNumber -
      5 * ageNumber +
      (profileSex === 'male' ? 5 : -161)
    const estimated = Math.round(base)

    setDailyCalorieNeed(estimated)

    try {
      const profile: CalorieProfile = {
        sex: profileSex,
        age: ageNumber,
        heightCm: heightNumber,
        weightKg: weightKgNumber,
        dailyCalories: estimated,
      }
      if (!userId || !db) return
      await setDoc(
        doc(db, 'user_profiles', userId),
        {
          ...profile,
          userEmail: user?.email ?? null,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    } catch {
      // ignore storage errors
    }
  }

  const selectedDateLabel = useMemo(() => {
    const [year, month, day] = selectedDate.split('-').map((p) => Number(p))
    if (!year || !month || !day) return selectedDate
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }, [selectedDate])

  const calendarWeeks = useMemo(
    () => buildCalendar(currentYear, currentMonth),
    [currentYear, currentMonth],
  )

  const applyPickerSelection = () => {
    if (!Number.isFinite(pickerYear) || pickerYear <= 0) {
      return
    }
    setCurrentYear(pickerYear)
    setCurrentMonth(pickerMonth)
    setIsMonthPickerOpen(false)
  }

  const totalCaloriesForDay = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.calories, 0),
    [entries],
  )

  const mealCalories = useMemo(() => {
    const base = {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      snack: 0,
    } satisfies Record<MealCategory, number>

    for (const e of entries) {
      const m: MealCategory = e.meal ?? 'snack'
      base[m] += e.calories
    }
    return base
  }, [entries])

  const mealPercent = useMemo(() => {
    const total = totalCaloriesForDay || 0
    const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)
    return {
      breakfast: pct(mealCalories.breakfast),
      lunch: pct(mealCalories.lunch),
      dinner: pct(mealCalories.dinner),
      snack: pct(mealCalories.snack),
    } satisfies Record<MealCategory, number>
  }, [mealCalories, totalCaloriesForDay])

  const bilibiliRecipeResults = useMemo(
    () => buildBilibiliRecipeResults(selectedCombos, cookRecipeRows),
    [selectedCombos, cookRecipeRows],
  )
  const comboOptionsByCategory = useMemo(
    () =>
      COMBO_CATEGORY_ORDER.map((category) => ({
        category,
        label: COMBO_CATEGORY_LABEL[category],
        options: COOK_COMBO_OPTIONS.filter((option) => option.category === category),
      })),
    [],
  )

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Food Log Calendar</h1>
          <p className="login-subtitle">Loading…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  const handleAskCoach = async () => {
    if (!dailyCalorieNeed) return

    setCoachError(null)
    setCoachLoading(true)
    try {
      if (coachMode === 'video') {
        setCoachAdvice(null)
        setCoachVisible(true)
        return
      }

      if (import.meta.env.PROD && !API_BASE_URL) {
        throw new Error(
          'AI coach API is not configured for production. Set VITE_API_BASE_URL to your Worker URL and redeploy.',
        )
      }

      const profile = profileDoc
      const selectedComboOptions = COOK_COMBO_OPTIONS.filter((c) => selectedCombos.includes(c.id))
      const comboSelection = selectedComboOptions.map((c) => `${c.icon} ${c.label}`)
      const comboRecipeLibrary = selectedComboOptions.flatMap((c) =>
        c.recipeIdeas.map((recipe) => `${c.label}: ${recipe}`),
      )
      const recentEntries = entries.slice(-8).map((e) => ({ name: e.name, calories: e.calories }))

      const cacheKey = JSON.stringify({
        v: COACH_PROMPT_VERSION,
        mode: coachMode,
        dailyCalories: dailyCalorieNeed,
        profile: profile
          ? {
              sex: profile.sex,
              age: profile.age,
              heightCm: profile.heightCm,
              weightKg: profile.weightKg,
            }
          : null,
        combos: [...comboSelection].sort(),
        comboRecipes: [...comboRecipeLibrary].sort(),
        entries: recentEntries,
      })
      const useCache = true
      const coachCache = readCoachCache()
      const cached = coachCache[cacheKey]
      if (useCache) {
        if (
          cached &&
          typeof cached.recommendation === 'string' &&
          Date.now() - cached.timestamp < COACH_CACHE_TTL_MS
        ) {
          setCoachAdvice(cached.recommendation)
          setCoachVisible(true)
          return
        }
      }

      const response = await fetch(apiUrl('/api/recommend-meals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: coachMode,
          dailyCalories: dailyCalorieNeed,
          profile,
          entries: recentEntries,
          preferredCombos: comboSelection,
          preferredComboRecipes: comboRecipeLibrary,
        }),
      })

      const rawText = await response.text().catch(() => '')
      const data = (() => {
        try {
          return JSON.parse(rawText) as { recommendation?: string; error?: string; detail?: string }
        } catch {
          return null
        }
      })()

      if (!response.ok) {
        const baseMessage =
          typeof data?.error === 'string'
            ? data.error
            : `AI coach request failed (HTTP ${response.status}).`
        const detail =
          typeof data?.detail === 'string'
            ? data.detail
            : rawText && rawText.length < 800
              ? rawText
              : ''
        throw new Error(
          detail ? `${baseMessage}\n${detail}` : baseMessage,
        )
      }

      const recommendationRaw = data?.recommendation ?? null
      if (typeof recommendationRaw !== 'string' || !recommendationRaw.trim()) {
        throw new Error('AI coach returned an empty response.')
      }
      const recommendation = recommendationRaw
      setCoachAdvice(recommendation)
      setCoachVisible(true)
      if (recommendation && useCache) {
        coachCache[cacheKey] = { recommendation, timestamp: Date.now() }
        // simple pruning to avoid unbounded growth
        const keys = Object.keys(coachCache)
        if (keys.length > 30) {
          keys
            .sort((a, b) => coachCache[a].timestamp - coachCache[b].timestamp)
            .slice(0, keys.length - 30)
            .forEach((k) => {
              delete coachCache[k]
            })
        }
        writeCoachCache(coachCache)
      }
    } catch (err) {
      setCoachError(
        err instanceof Error ? err.message : 'AI coach could not generate a recommendation.',
      )
    } finally {
      setCoachLoading(false)
    }
  }

  const handleLogout = async () => {
    if (!auth) return
    await signOut(auth)
  }

  const toggleCombo = (id: string) => {
    setSelectedCombos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  return (
    <div className={`app-root theme-${theme}`}>
      <header className="app-header">
        <div className="app-header-inner">
          <div>
            <h1>Food Log Calendar</h1>
            <p className="app-subtitle">
              Click a date on the calendar to view or edit that day&apos;s food log. Data is stored in
              the cloud for your account.
            </p>
          </div>
          <div className="app-header-user">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? '☀︎ Light' : '🌙 Dark'}
            </button>
            {isOwner && (
              <div className="admin-users-pill" title="Admin-only total users">
                Users:{' '}
                {totalUsersLoading ? '…' : totalUsersError ? 'error' : (totalUsers ?? 0).toString()}
              </div>
            )}
            <span className="app-user-name">{user.name || user.email}</span>
            <button type="button" className="logout-button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="app-layout">
        <section className="calendar-card" aria-label="Calendar">
          <div className="calendar-header">
            <button type="button" onClick={onPrevMonth} className="nav-button">
              ‹
            </button>
            <button
              type="button"
              className="calendar-title month-button"
              onClick={() => setIsMonthPickerOpen((open) => !open)}
            >
              {getMonthLabel(currentYear, currentMonth)}
            </button>
            <button type="button" onClick={onNextMonth} className="nav-button">
              ›
            </button>
          </div>

          {isMonthPickerOpen && (
            <div className="month-picker" aria-label="Change month and year">
              <select
                className="month-select"
                value={pickerMonth}
                onChange={(event) => setPickerMonth(Number(event.target.value))}
              >
                {[
                  'January',
                  'February',
                  'March',
                  'April',
                  'May',
                  'June',
                  'July',
                  'August',
                  'September',
                  'October',
                  'November',
                  'December',
                ].map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                className="year-input"
                type="number"
                value={pickerYear}
                onChange={(event) => setPickerYear(Number(event.target.value))}
              />
              <button type="button" className="apply-button" onClick={applyPickerSelection}>
                Go
              </button>
            </div>
          )}

          <div className="calendar-grid" role="grid">
            <div className="weekday-row" role="row">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="weekday-cell" role="columnheader">
                  {day}
                </div>
              ))}
            </div>

            {calendarWeeks.map((week, weekIndex) => (
              <div key={weekIndex} className="week-row" role="row">
                {week.map((day, dayIndex) => {
                  if (!day) {
                    return <div key={dayIndex} className="day-cell empty" />
                  }

                  const dateKey = formatDateKey(new Date(currentYear, currentMonth, day))
                  const isSelected = dateKey === selectedDate
                  const isToday =
                    dateKey === formatDateKey(today) &&
                    currentMonth === today.getMonth() &&
                    currentYear === today.getFullYear()

                  return (
                    <button
                      key={dayIndex}
                      type="button"
                      className={`day-cell button ${isSelected ? 'selected' : ''} ${
                        isToday ? 'today' : ''
                      }`}
                      onClick={() => handleSelectDate(day)}
                      aria-pressed={isSelected}
                    >
                      <span className="day-number">{day}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="log-card" aria-label="Food log">
          <section className="profile-section" aria-label="Daily calorie estimate">
            <h2 className="profile-title">Daily calorie estimate</h2>
            <p className="profile-caption">
              Based on Mifflin–St Jeor equation. Uses your sex, age, height, and weight.
            </p>
            {profileLoading && <p className="profile-caption">Loading profile…</p>}

            <form className="profile-form" onSubmit={handleProfileSubmit}>
              <div className="profile-grid">
                <label className="field">
                  <span className="field-label">Sex</span>
                  <select
                    className="log-input"
                    value={profileSex}
                    onChange={(event) =>
                      setProfileSex(event.target.value === 'female' ? 'female' : 'male')
                    }
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </label>

                <label className="field">
                  <span className="field-label">Age (years)</span>
                  <input
                    className="log-input"
                    type="number"
                    min={1}
                    value={profileAge}
                    onChange={(event) =>
                      setProfileAge(event.target.value === '' ? '' : Number(event.target.value))
                    }
                  />
                </label>

                <label className="field">
                  <span className="field-label">Height (cm)</span>
                  <input
                    className="log-input"
                    type="number"
                    min={1}
                    value={profileHeightCm}
                    onChange={(event) =>
                      setProfileHeightCm(
                        event.target.value === '' ? '' : Number(event.target.value),
                      )
                    }
                  />
                </label>

                <label className="field">
                  <span className="field-label">Weight (lb)</span>
                  <input
                    className="log-input"
                    type="number"
                    min={1}
                    value={profileWeightLb}
                    onChange={(event) =>
                      setProfileWeightLb(
                        event.target.value === '' ? '' : Number(event.target.value),
                      )
                    }
                  />
                </label>
              </div>

              <div className="profile-actions">
                <button type="submit" className="secondary-button">
                  Calculate
                </button>
                {dailyCalorieNeed && (
                  <p className="profile-result">
                    Approx. daily calories: <span>{dailyCalorieNeed.toLocaleString()}</span> kcal
                  </p>
                )}
              </div>
            </form>
          </section>

          <h2 className="log-title">{selectedDateLabel}</h2>

          <div className="calorie-progress">
            {dailyCalorieNeed ? (
              <>
                <div className="calorie-progress-header">
                  <span className="calorie-progress-label">Daily calories</span>
                  <span className="calorie-progress-value">
                    {totalCaloriesForDay.toLocaleString()} /{' '}
                    {dailyCalorieNeed.toLocaleString()} kcal
                  </span>
                </div>
                <div className="calorie-progress-track" aria-hidden="true">
                  <div
                    className="calorie-progress-liquid"
                    style={{
                      width: `${Math.min(100, (totalCaloriesForDay / dailyCalorieNeed) * 100)}%`,
                    }}
                  />
                </div>

                <div className="meal-breakdown" aria-label="Meal category breakdown">
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((meal) => {
                    const meta = getMealMeta(meal)
                    const calories = mealCalories[meal]
                    const pct = mealPercent[meal]
                    return (
                      <div key={meal} className={`meal-row meal-${meta.className}`}>
                        <div className="meal-row-header">
                          <span className="meal-row-title">
                            <span className="meal-row-icon" aria-hidden="true">
                              {meta.icon}
                            </span>
                            {meta.label}
                          </span>
                          <span className="meal-row-value">
                            {totalCaloriesForDay > 0 ? `${Math.round(pct)}%` : '0%'} ·{' '}
                            {calories.toLocaleString()} cal
                          </span>
                        </div>
                        <div className="meal-track" aria-hidden="true">
                          <div
                            className="meal-liquid"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="combo-picker" aria-label="Choose preferred recipe combinations">
                  <p className="combo-title">Choose ingredient combos</p>
                  <div className="combo-groups">
                    {comboOptionsByCategory.map((group) => (
                      <div key={group.category} className="combo-group">
                        <p className="combo-group-title">{group.label}</p>
                        <div className="combo-tags">
                          {group.options.map((option) => {
                            const active = selectedCombos.includes(option.id)
                            return (
                              <button
                                key={option.id}
                                type="button"
                                className={`combo-tag ${active ? 'active' : ''}`}
                                onClick={() => toggleCombo(option.id)}
                                aria-pressed={active}
                              >
                                <span aria-hidden="true">{option.icon}</span> {option.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="coach-row">
                  <select
                    className="log-input coach-mode-select"
                    value={coachMode}
                    onChange={(e) => {
                      const nextMode = e.target.value === 'video' ? 'video' : 'normal'
                      setCoachMode(nextMode)
                      setCoachError(null)
                      setCoachAdvice(null)
                      setCoachVisible(true)
                    }}
                    title="Choose AI coach output mode"
                  >
                    <option value="normal">Normal recipe plan</option>
                    <option value="video">Bilibili recipe videos</option>
                  </select>
                  {coachMode === 'normal' && (
                    <button
                      type="button"
                      className="secondary-button small"
                      onClick={() => void handleAskCoach()}
                      disabled={coachLoading}
                    >
                      {coachLoading ? 'Asking coach…' : 'Ask AI coach'}
                    </button>
                  )}
                  {(coachMode === 'normal'
                    ? Boolean(coachAdvice)
                    : selectedCombos.length > 0 && bilibiliRecipeResults.length > 0) && (
                    <button
                      type="button"
                      className="secondary-button small"
                      onClick={() => setCoachVisible((v) => !v)}
                    >
                      {coachVisible ? 'Hide results' : 'Show results'}
                    </button>
                  )}
                </div>
                {coachMode === 'video' && (
                  <p className="coach-video-hint">
                    Pick ingredients first. After you choose at least one item, matching Bilibili videos
                    will appear here and open in a new tab.
                  </p>
                )}
                {coachError && <p className="form-error">{coachError}</p>}
                {coachMode === 'video' && selectedCombos.length > 0 && cookRecipeError && (
                  <p className="form-error">{cookRecipeError}</p>
                )}
                {coachMode === 'video' && selectedCombos.length > 0 && coachVisible && (
                  <div className="coach-advice">
                    <div className="coach-section">
                      <p className="coach-title">
                        Matching Bilibili recipes ({bilibiliRecipeResults.length})
                      </p>
                      {cookRecipeLoading ? (
                        <p className="coach-video-hint">Importing recipe videos from cook data…</p>
                      ) : bilibiliRecipeResults.length > 0 ? (
                        <div className="bili-result-grid">
                          {bilibiliRecipeResults.map((item) => (
                            <a
                              key={item.id}
                              className="bili-result-chip"
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              title={`Open Bilibili page: ${item.title}`}
                            >
                              <span aria-hidden="true">🎬</span> {item.title}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="coach-video-hint">
                          No matching Bilibili videos found for the selected combo in imported cook data.
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {coachMode === 'normal' && coachAdvice && coachVisible && (() => {

                  const adviceText = coachAdvice ?? ''
                  const parts = adviceText.split('###')
                  const mainPlan = parts[0]?.trim() ?? ''
                  const tipsBlock =
                    parts.length > 1 ? `###${parts.slice(1).join('###')}`.trim() : ''
                  return (
                    <div className="coach-advice">
                      <div className="coach-section">
                        <p className="coach-title">Suggested plan for fat loss</p>
                        <pre className="coach-text">{mainPlan}</pre>
                      </div>
                      {tipsBlock && (
                        <div className="coach-section">
                          <p className="coach-title">Coach tips for the day</p>
                          <pre className="coach-text">{tipsBlock}</pre>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </>
            ) : (
              <p className="calorie-progress-hint">
                Set your daily calorie estimate above to see your progress bar.
              </p>
            )}
          </div>

          <form className="log-form" onSubmit={handleAddEntry}>
            <div className="log-form-grid">
              <label className="field">
                <span className="field-label">Food name</span>
                <input
                  className="log-input"
                  type="text"
                  placeholder="e.g. Oatmeal with berries"
                  value={newEntryName}
                  onChange={(e) => setNewEntryName(e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">Calories</span>
                <div className="calories-row">
                  <input
                    className="log-input"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="e.g. 350"
                    value={newEntryCalories}
                    onChange={(e) =>
                      setNewEntryCalories(e.target.value === '' ? '' : Number(e.target.value))
                    }
                  />
                  <button
                    type="button"
                    className="secondary-button small"
                    onClick={() => void handleEstimateCalories()}
                    disabled={
                      isEstimatingCalories ||
                      (!newEntryName.trim() && !newEntryImage && !newEntryImageUrl.trim())
                    }
                    title="Estimate from food name, uploaded image, or image URL"
                  >
                    {isEstimatingCalories ? 'Estimating…' : 'Auto'}
                  </button>
                </div>
              </label>

              <label className="field">
                <span className="field-label">Meal</span>
                <select
                  className="log-input"
                  value={newEntryMeal}
                  onChange={(e) =>
                    setNewEntryMeal(
                      (e.target.value as MealCategory) === 'breakfast' ||
                        (e.target.value as MealCategory) === 'lunch' ||
                        (e.target.value as MealCategory) === 'dinner'
                        ? (e.target.value as MealCategory)
                        : 'snack',
                    )
                  }
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
              </label>

              <label className="field">
                <span className="field-label">Image (optional)</span>
                <div className="image-url-row">
                  <input
                    className="file-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleImageChange(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className="secondary-button small"
                    onClick={() => void handleEstimateCalories()}
                    disabled={isEstimatingCalories || !newEntryImage}
                    title="Detect food and calories from uploaded image"
                  >
                    {isEstimatingCalories ? 'Detecting…' : 'Detect from image'}
                  </button>
                </div>
              </label>

              <label className="field field-full">
                <span className="field-label">Or image URL</span>
                <div className="image-url-row">
                  <input
                    className="log-input"
                    type="url"
                    placeholder="https://example.com/food-photo.jpg"
                    value={newEntryImageUrl}
                    onChange={(e) => setNewEntryImageUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="secondary-button small"
                    onClick={() => void handleEstimateCalories()}
                    disabled={isEstimatingCalories || !newEntryImageUrl.trim()}
                    title="Detect food and calories from image URL"
                  >
                    {isEstimatingCalories ? 'Detecting…' : 'Detect from URL'}
                  </button>
                </div>
              </label>
            </div>

            {estimateError && <p className="form-error">{estimateError}</p>}

            {(newEntryImage || newEntryImageUrl.trim()) && (
              <div className="image-preview-row">
                <img
                  className="image-preview"
                  src={newEntryImage || newEntryImageUrl.trim()}
                  alt="Selected food"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setNewEntryImage(undefined)
                    setNewEntryImageUrl('')
                  }}
                >
                  Remove image
                </button>
              </div>
            )}

            <div className="log-form-actions">
              <button type="submit" className="primary-button" disabled={saveEntryLoading}>
                {saveEntryLoading ? 'Saving…' : 'Add entry'}
              </button>
            </div>
          </form>

          {saveEntryError && <p className="form-error">{saveEntryError}</p>}
          {entriesError && <p className="form-error">{entriesError}</p>}

          {entriesLoading ? (
            <p className="log-empty">Loading entries…</p>
          ) : entries.length === 0 ? (
            <p className="log-empty">No entries yet for this day. Start by adding one above.</p>
          ) : (
            <ul className="log-list">
              {entries.map((entry) => (
                <li key={entry.id} className="log-item">
                  <div className="log-item-left">
                    {entry.imageDataUrl || entry.imageUrl ? (
                      <>
                        <img
                          className="log-thumb"
                          src={entry.imageDataUrl ?? entry.imageUrl}
                          alt={entry.name}
                          onError={(e) => {
                            const el = e.currentTarget
                            el.style.display = 'none'
                            const next = el.nextElementSibling as HTMLElement
                            if (next) next.style.display = 'flex'
                          }}
                        />
                        <div
                          className="log-thumb auto"
                          style={{ display: 'none' }}
                          aria-hidden="true"
                        >
                          <span className="log-thumb-initial">
                            {entry.iconEmoji ?? getFoodEmoji(entry.name)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="log-thumb auto" aria-hidden="true">
                        <span className="log-thumb-initial">
                          {entry.iconEmoji ?? getFoodEmoji(entry.name)}
                        </span>
                      </div>
                    )}
                    <div className="log-meta">
                      <span
                        className={`meal-badge meal-${getMealMeta(entry.meal ?? 'snack').className}`}
                      >
                        {getMealMeta(entry.meal ?? 'snack').icon}{' '}
                        {getMealMeta(entry.meal ?? 'snack').label}
                      </span>
                      <span className="log-text">{entry.name}</span>
                      <span className="log-subtext">{entry.calories} cal</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => removeEntry(entry.id)}
                    aria-label="Remove entry"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
