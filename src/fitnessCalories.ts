import {
  CATEGORY_DEFAULT_MET,
  type ExerciseCategory,
  type ExerciseDef,
} from './data/exerciseLibrary'

const DEFAULT_BODY_KG = 75

/**
 * Rough calorie estimate (demo). Uses MET × body mass × time where possible.
 * Strength: time inferred from reps×sets (~3 s/rep) + small bonus for moved volume (lb·reps).
 */
export function estimateExerciseCalories(params: {
  category: ExerciseCategory
  userWeightKg: number | null
  minutes: number
  weightLb: number | null
  repsPerSet: number | null
  sets: number | null
  exercise: ExerciseDef | null
}): number {
  const userKg = params.userWeightKg && params.userWeightKg > 0 ? params.userWeightKg : DEFAULT_BODY_KG

  const totalReps =
    params.repsPerSet != null && params.sets != null && params.repsPerSet > 0 && params.sets > 0
      ? params.repsPerSet * params.sets
      : 0

  const hasLiftNumbers =
    params.category === 'strength' &&
    params.weightLb != null &&
    params.weightLb > 0 &&
    totalReps > 0

  if (hasLiftNumbers) {
    const secondsPerRep = 3.5
    const durationMin = Math.max(0.75, (totalReps * secondsPerRep) / 60)
    const met = 5.5
    const base = (met * 3.5 * userKg) / 200 * durationMin
    const volumeLb = params.weightLb! * totalReps
    const volumeBonus = Math.min(12, (volumeLb / 1200) * 4)
    return Math.round(Math.max(1, base + volumeBonus))
  }

  if (params.category === 'strength' && totalReps > 0) {
    const durationMin = Math.max(0.75, (totalReps * 3.5) / 60)
    const base = (5.5 * 3.5 * userKg) / 200 * durationMin
    return Math.round(Math.max(1, base))
  }

  const minutes =
    params.minutes > 0
      ? params.minutes
      : params.category === 'strength' && totalReps > 0
        ? Math.max(1, (totalReps * 3.5) / 60)
        : 0

  if (minutes <= 0) return 0

  const met =
    params.exercise?.cardioMet ??
    CATEGORY_DEFAULT_MET[params.category]

  const kcal = (met * 3.5 * userKg) / 200 * minutes
  return Math.round(Math.max(1, kcal))
}
