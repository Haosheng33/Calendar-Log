/**
 * Minimalist front-facing body silhouette SVG.
 * Muscle groups that appear in the `highlight` set get coloured.
 */

const MUSCLE_PATHS: Record<string, { d: string; label: string }> = {
  Chest: {
    label: 'Chest',
    d: 'M36 38 C36 34 42 30 50 30 C58 30 64 34 64 38 L64 46 C58 48 42 48 36 46 Z',
  },
  Shoulders: {
    label: 'Shoulders',
    d: 'M28 34 C26 30 30 26 36 28 L36 40 C30 40 28 38 28 34 Z M72 34 C74 30 70 26 64 28 L64 40 C70 40 72 38 72 34 Z',
  },
  Biceps: {
    label: 'Biceps',
    d: 'M26 42 C24 46 24 54 26 58 L30 58 C30 52 28 46 28 42 Z M74 42 C76 46 76 54 74 58 L70 58 C70 52 72 46 72 42 Z',
  },
  Triceps: {
    label: 'Triceps',
    d: 'M24 44 L22 56 L26 56 L28 44 Z M76 44 L78 56 L74 56 L72 44 Z',
  },
  Forearms: {
    label: 'Forearms',
    d: 'M22 58 L20 72 L24 72 L26 58 Z M78 58 L80 72 L76 72 L74 58 Z',
  },
  Core: {
    label: 'Core',
    d: 'M40 48 L60 48 L60 64 C55 66 45 66 40 64 Z',
  },
  Obliques: {
    label: 'Obliques',
    d: 'M36 48 L40 48 L40 64 L36 60 Z M64 48 L60 48 L60 64 L64 60 Z',
  },
  Abdominals: {
    label: 'Core',
    d: 'M44 48 L56 48 L56 62 L44 62 Z',
  },
  Quadriceps: {
    label: 'Quadriceps',
    d: 'M38 68 L46 68 L46 88 L40 88 Z M54 68 L62 68 L60 88 L54 88 Z',
  },
  Hamstrings: {
    label: 'Hamstrings',
    d: 'M40 70 L46 70 L46 86 L40 86 Z M54 70 L60 70 L60 86 L54 86 Z',
  },
  Glutes: {
    label: 'Glutes',
    d: 'M38 64 L50 66 L62 64 L62 70 C55 72 45 72 38 70 Z',
  },
  Calves: {
    label: 'Calves',
    d: 'M40 90 L44 90 L44 104 L40 104 Z M56 90 L60 90 L60 104 L56 104 Z',
  },
  'Heart & lungs': {
    label: 'Heart',
    d: 'M44 32 L56 32 L56 44 L44 44 Z',
  },
  Lats: {
    label: 'Lats',
    d: 'M34 40 L38 40 L40 56 L34 52 Z M66 40 L62 40 L60 56 L66 52 Z',
  },
  'Upper back': {
    label: 'Upper back',
    d: 'M38 30 L62 30 L64 40 L36 40 Z',
  },
  'Mid back': {
    label: 'Mid back',
    d: 'M38 40 L62 40 L60 52 L40 52 Z',
  },
  Back: {
    label: 'Back',
    d: 'M38 34 L62 34 L62 54 L38 54 Z',
  },
  'Lower back': {
    label: 'Lower back',
    d: 'M40 54 L60 54 L60 64 L40 64 Z',
  },
  Traps: {
    label: 'Traps',
    d: 'M38 24 L50 20 L62 24 L58 30 L42 30 Z',
  },
  Neck: {
    label: 'Neck',
    d: 'M44 18 L56 18 L56 24 L44 24 Z',
  },
  'Neck / traps': {
    label: 'Traps',
    d: 'M38 24 L50 20 L62 24 L58 30 L42 30 Z',
  },
  'Rear delts': {
    label: 'Shoulders',
    d: 'M28 34 C26 30 30 26 36 28 L36 40 C30 40 28 38 28 34 Z M72 34 C74 30 70 26 64 28 L64 40 C70 40 72 38 72 34 Z',
  },
  Brachialis: {
    label: 'Biceps',
    d: 'M26 42 C24 46 24 54 26 58 L30 58 C30 52 28 46 28 42 Z M74 42 C76 46 76 54 74 58 L70 58 C70 52 72 46 72 42 Z',
  },
  'Rotator cuff': {
    label: 'Shoulders',
    d: 'M28 34 C26 30 30 26 36 28 L36 40 C30 40 28 38 28 34 Z M72 34 C74 30 70 26 64 28 L64 40 C70 40 72 38 72 34 Z',
  },
  'Upper chest': {
    label: 'Chest',
    d: 'M36 34 C36 30 42 28 50 28 C58 28 64 30 64 34 L64 40 C58 42 42 42 36 40 Z',
  },
  Hips: {
    label: 'Hips',
    d: 'M36 60 L40 64 L40 68 L36 68 Z M64 60 L60 64 L60 68 L64 68 Z',
  },
}

const ALIAS_SET = new Set([
  'Full body',
  'Heart & lungs (light)',
  'Muscles & fascia',
  'Recovery',
  'Mobility',
  'Posture',
  'Joints',
  'Arms',
  'Legs',
])

const ALIAS_MAP: Record<string, string[]> = {
  'Full body': [
    'Chest', 'Shoulders', 'Biceps', 'Triceps', 'Core',
    'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Back',
  ],
  'Heart & lungs (light)': ['Heart & lungs'],
  Arms: ['Biceps', 'Triceps', 'Forearms'],
  Legs: ['Quadriceps', 'Hamstrings', 'Calves', 'Glutes'],
  'Muscles & fascia': [],
  Recovery: [],
  Mobility: [],
  Posture: ['Core'],
  Joints: ['Hips'],
}

type BodyMapProps = {
  highlight: string[]
  className?: string
}

export function BodyMap({ highlight, className }: BodyMapProps) {
  const expandedSet = new Set<string>()
  for (const part of highlight) {
    if (ALIAS_SET.has(part)) {
      for (const a of ALIAS_MAP[part] ?? []) expandedSet.add(a)
    } else {
      expandedSet.add(part)
    }
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="10 10 80 100"
      className={`body-map-svg ${className ?? ''}`}
      aria-label="Body muscle map"
    >
      {/* Head */}
      <ellipse cx="50" cy="14" rx="8" ry="6" className="body-map-base" />
      {/* Torso outline */}
      <path
        d="M36 24 C28 26 24 34 22 44 L20 72 L26 72 L28 60 C28 56 30 48 36 46 L36 68 L38 92 L38 108 L46 108 L46 68 L54 68 L54 108 L62 108 L62 92 L64 68 L64 46 C70 48 72 56 72 60 L74 72 L80 72 L78 44 C76 34 72 26 64 24 L56 20 L44 20 Z"
        className="body-map-base"
      />

      {/* Muscle regions */}
      {Object.entries(MUSCLE_PATHS).map(([key, { d }]) => {
        const active = expandedSet.has(key)
        return (
          <path
            key={key}
            d={d}
            className={`body-map-muscle ${active ? 'active' : ''}`}
          />
        )
      })}
    </svg>
  )
}
