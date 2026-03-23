export type ExerciseCategory =
  | 'cardio'
  | 'strength'
  | 'flexibility'
  | 'sports'
  | 'recovery'
  | 'other'

export type ExerciseDef = {
  id: string
  name: string
  category: ExerciseCategory
  /** Muscle groups / areas involved */
  bodyParts: string[]
  /** MET for time-based cardio when using “Minutes” (Compendium-style rough values). */
  cardioMet?: number
  /** Illustration shown in the fitness log (category art in /public/fitness/). */
  imageUrl: string
  /** Badge emoji on the thumbnail */
  iconEmoji: string
}

/** Category illustrations (add matching files under public/fitness/). */
export const CATEGORY_EXERCISE_IMAGE: Record<ExerciseCategory, string> = {
  cardio: '/fitness/cardio.svg',
  strength: '/fitness/strength.svg',
  flexibility: '/fitness/flexibility.svg',
  sports: '/fitness/sports.svg',
  recovery: '/fitness/recovery.svg',
  other: '/fitness/other.svg',
}

/** Per-exercise emoji on the image tile (defaults applied in buildLibrary). */
const EXERCISE_ICON_BY_ID: Record<string, string> = {
  // Strength — chest / shoulders / arms
  'bench-press': '🏋️',
  'incline-db-press': '🏋️',
  ohp: '🏋️',
  'lateral-raise': '💪',
  'face-pull': '💪',
  'tricep-pushdown': '💪',
  skullcrusher: '💪',
  'barbell-curl': '💪',
  'hammer-curl': '🔨',
  // Strength — back
  'barbell-row': '🏋️',
  'cable-row': '🏋️',
  'lat-pulldown': '🏋️',
  'pull-up': '🧗',
  shrug: '🏋️',
  // Strength — legs
  'back-squat': '🦵',
  'front-squat': '🦵',
  deadlift: '🏋️',
  rdl: '🏋️',
  'leg-press': '🦵',
  'leg-curl': '🦵',
  'leg-extension': '🦵',
  'walking-lunge': '🚶',
  'bulgarian-split': '🦵',
  'hip-thrust': '🍑',
  'calf-raise': '🦶',
  // Strength — core
  plank: '🧘',
  'cable-crunch': '💪',
  woodchop: '🪓',
  // Cardio
  run: '🏃',
  jog: '🏃',
  'walk-brisk': '🚶',
  bike: '🚴',
  'bike-vigorous': '🚴',
  elliptical: '🏃',
  'stair-climber': '🪜',
  rower: '🚣',
  'jump-rope': '⏫',
  swim: '🏊',
  hiit: '🔥',
  // Flexibility
  'static-stretch': '🤸',
  'yoga-flow': '🧘',
  pilates: '🧘',
  'foam-roll': '🧘',
  // Sports
  basketball: '🏀',
  tennis: '🎾',
  soccer: '⚽',
  pickleball: '🏓',
  // Recovery
  'easy-walk': '🚶',
  'mobility-drill': '🔄',
}

const RAW_EXERCISES: Omit<ExerciseDef, 'imageUrl' | 'iconEmoji'>[] = [
  // Strength — upper
  {
    id: 'bench-press',
    name: 'Bench press',
    category: 'strength',
    bodyParts: ['Chest', 'Shoulders', 'Triceps'],
  },
  {
    id: 'incline-db-press',
    name: 'Incline dumbbell press',
    category: 'strength',
    bodyParts: ['Upper chest', 'Shoulders', 'Triceps'],
  },
  {
    id: 'ohp',
    name: 'Overhead press',
    category: 'strength',
    bodyParts: ['Shoulders', 'Triceps', 'Core'],
  },
  {
    id: 'lateral-raise',
    name: 'Lateral raise',
    category: 'strength',
    bodyParts: ['Shoulders'],
  },
  {
    id: 'face-pull',
    name: 'Face pull',
    category: 'strength',
    bodyParts: ['Rear delts', 'Upper back', 'Rotator cuff'],
  },
  {
    id: 'tricep-pushdown',
    name: 'Tricep pushdown',
    category: 'strength',
    bodyParts: ['Triceps'],
  },
  {
    id: 'skullcrusher',
    name: 'Skull crusher',
    category: 'strength',
    bodyParts: ['Triceps'],
  },
  {
    id: 'barbell-curl',
    name: 'Barbell curl',
    category: 'strength',
    bodyParts: ['Biceps', 'Forearms'],
  },
  {
    id: 'hammer-curl',
    name: 'Hammer curl',
    category: 'strength',
    bodyParts: ['Biceps', 'Brachialis', 'Forearms'],
  },
  {
    id: 'barbell-row',
    name: 'Barbell row',
    category: 'strength',
    bodyParts: ['Upper back', 'Lats', 'Biceps', 'Core'],
  },
  {
    id: 'cable-row',
    name: 'Seated cable row',
    category: 'strength',
    bodyParts: ['Mid back', 'Lats', 'Biceps'],
  },
  {
    id: 'lat-pulldown',
    name: 'Lat pulldown',
    category: 'strength',
    bodyParts: ['Lats', 'Biceps', 'Upper back'],
  },
  {
    id: 'pull-up',
    name: 'Pull-up / chin-up',
    category: 'strength',
    bodyParts: ['Lats', 'Biceps', 'Core'],
  },
  {
    id: 'shrug',
    name: 'Barbell shrug',
    category: 'strength',
    bodyParts: ['Traps', 'Neck'],
  },
  // Strength — lower
  {
    id: 'back-squat',
    name: 'Back squat',
    category: 'strength',
    bodyParts: ['Quadriceps', 'Glutes', 'Hamstrings', 'Core', 'Lower back'],
  },
  {
    id: 'front-squat',
    name: 'Front squat',
    category: 'strength',
    bodyParts: ['Quadriceps', 'Glutes', 'Core', 'Upper back'],
  },
  {
    id: 'deadlift',
    name: 'Deadlift',
    category: 'strength',
    bodyParts: ['Hamstrings', 'Glutes', 'Back', 'Traps', 'Core', 'Forearms'],
  },
  {
    id: 'rdl',
    name: 'Romanian deadlift',
    category: 'strength',
    bodyParts: ['Hamstrings', 'Glutes', 'Lower back'],
  },
  {
    id: 'leg-press',
    name: 'Leg press',
    category: 'strength',
    bodyParts: ['Quadriceps', 'Glutes'],
  },
  {
    id: 'leg-curl',
    name: 'Leg curl',
    category: 'strength',
    bodyParts: ['Hamstrings'],
  },
  {
    id: 'leg-extension',
    name: 'Leg extension',
    category: 'strength',
    bodyParts: ['Quadriceps'],
  },
  {
    id: 'walking-lunge',
    name: 'Walking lunge',
    category: 'strength',
    bodyParts: ['Quadriceps', 'Glutes', 'Hamstrings', 'Core'],
  },
  {
    id: 'bulgarian-split',
    name: 'Bulgarian split squat',
    category: 'strength',
    bodyParts: ['Quadriceps', 'Glutes', 'Hamstrings'],
  },
  {
    id: 'hip-thrust',
    name: 'Hip thrust',
    category: 'strength',
    bodyParts: ['Glutes', 'Hamstrings', 'Core'],
  },
  {
    id: 'calf-raise',
    name: 'Calf raise',
    category: 'strength',
    bodyParts: ['Calves'],
  },
  // Strength — core
  {
    id: 'plank',
    name: 'Plank',
    category: 'strength',
    bodyParts: ['Core', 'Shoulders'],
  },
  {
    id: 'cable-crunch',
    name: 'Cable crunch',
    category: 'strength',
    bodyParts: ['Abdominals'],
  },
  {
    id: 'woodchop',
    name: 'Cable woodchop',
    category: 'strength',
    bodyParts: ['Obliques', 'Core', 'Shoulders'],
  },
  // Cardio
  {
    id: 'run',
    name: 'Running',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Legs', 'Calves'],
    cardioMet: 9,
  },
  {
    id: 'jog',
    name: 'Jogging',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Legs'],
    cardioMet: 7,
  },
  {
    id: 'walk-brisk',
    name: 'Brisk walking',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Legs'],
    cardioMet: 4.3,
  },
  {
    id: 'bike',
    name: 'Cycling (moderate)',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Quadriceps', 'Glutes', 'Calves'],
    cardioMet: 8,
  },
  {
    id: 'bike-vigorous',
    name: 'Cycling (vigorous)',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Legs', 'Glutes'],
    cardioMet: 12,
  },
  {
    id: 'elliptical',
    name: 'Elliptical',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Legs', 'Glutes', 'Arms'],
    cardioMet: 5,
  },
  {
    id: 'stair-climber',
    name: 'Stair climber',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Quadriceps', 'Glutes', 'Calves'],
    cardioMet: 9,
  },
  {
    id: 'rower',
    name: 'Rowing machine',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Back', 'Legs', 'Core'],
    cardioMet: 7,
  },
  {
    id: 'jump-rope',
    name: 'Jump rope',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Calves', 'Shoulders'],
    cardioMet: 11,
  },
  {
    id: 'swim',
    name: 'Swimming laps',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Full body'],
    cardioMet: 8,
  },
  {
    id: 'hiit',
    name: 'HIIT circuit',
    category: 'cardio',
    bodyParts: ['Heart & lungs', 'Full body'],
    cardioMet: 10,
  },
  // Flexibility
  {
    id: 'static-stretch',
    name: 'Static stretching',
    category: 'flexibility',
    bodyParts: ['Full body', 'Mobility'],
    cardioMet: 2.3,
  },
  {
    id: 'yoga-flow',
    name: 'Yoga flow',
    category: 'flexibility',
    bodyParts: ['Full body', 'Core', 'Mobility'],
    cardioMet: 3,
  },
  {
    id: 'pilates',
    name: 'Pilates',
    category: 'flexibility',
    bodyParts: ['Core', 'Hips', 'Posture'],
    cardioMet: 3,
  },
  {
    id: 'foam-roll',
    name: 'Foam rolling',
    category: 'flexibility',
    bodyParts: ['Muscles & fascia', 'Recovery'],
    cardioMet: 2,
  },
  // Sports
  {
    id: 'basketball',
    name: 'Basketball',
    category: 'sports',
    bodyParts: ['Full body', 'Heart & lungs', 'Legs'],
    cardioMet: 8,
  },
  {
    id: 'tennis',
    name: 'Tennis',
    category: 'sports',
    bodyParts: ['Shoulders', 'Arms', 'Legs', 'Core'],
    cardioMet: 7,
  },
  {
    id: 'soccer',
    name: 'Soccer',
    category: 'sports',
    bodyParts: ['Legs', 'Core', 'Heart & lungs'],
    cardioMet: 10,
  },
  {
    id: 'pickleball',
    name: 'Pickleball',
    category: 'sports',
    bodyParts: ['Shoulders', 'Legs', 'Core'],
    cardioMet: 6,
  },
  // Recovery
  {
    id: 'easy-walk',
    name: 'Easy walk',
    category: 'recovery',
    bodyParts: ['Legs', 'Heart & lungs (light)'],
    cardioMet: 2.5,
  },
  {
    id: 'mobility-drill',
    name: 'Mobility drills',
    category: 'recovery',
    bodyParts: ['Joints', 'Hips', 'Shoulders'],
    cardioMet: 2.5,
  },
]

export const CATEGORY_DEFAULT_ICON: Record<ExerciseCategory, string> = {
  cardio: '🏃',
  strength: '🏋️',
  flexibility: '🧘',
  sports: '⚽',
  recovery: '🚶',
  other: '✨',
}

function buildLibrary(): ExerciseDef[] {
  return RAW_EXERCISES.map((ex) => ({
    ...ex,
    imageUrl: CATEGORY_EXERCISE_IMAGE[ex.category],
    iconEmoji: EXERCISE_ICON_BY_ID[ex.id] ?? CATEGORY_DEFAULT_ICON[ex.category],
  }))
}

export const EXERCISE_LIBRARY: ExerciseDef[] = buildLibrary()

const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]))

export function getExerciseById(id: string): ExerciseDef | undefined {
  return byId.get(id)
}

/** MET fallback by category when exercise has no cardioMet */
export const CATEGORY_DEFAULT_MET: Record<ExerciseCategory, number> = {
  cardio: 7,
  strength: 5,
  flexibility: 2.5,
  sports: 7,
  recovery: 2.8,
  other: 4,
}
