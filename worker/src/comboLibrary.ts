type ComboItem = {
  label: string
  recipes: string[]
}

const COMBO_LIBRARY: ComboItem[] = [
  { label: 'Chicken', recipes: ['ginger scallion chicken', 'black pepper chicken stir-fry'] },
  { label: 'Beef', recipes: ['beef with broccoli', 'onion beef stir-fry'] },
  { label: 'Egg', recipes: ['tomato scrambled egg', 'steamed egg custard'] },
  { label: 'Fish', recipes: ['steamed sea bass with ginger', 'pan-seared salmon'] },
  { label: 'Tofu', recipes: ['mapo tofu (light oil)', 'tofu mushroom stir-fry'] },
  { label: 'Rice', recipes: ['mixed grain rice bowl', 'chicken rice with vegetables'] },
  { label: 'Noodle', recipes: ['clear broth noodles', 'beef vegetable noodles'] },
  { label: 'Potato', recipes: ['potato chicken stew', 'vinegar shredded potato'] },
  { label: 'Tomato', recipes: ['tomato egg stir-fry', 'tomato beef stew'] },
  { label: 'Broccoli', recipes: ['garlic broccoli', 'broccoli chicken stir-fry'] },
  { label: 'Mushroom', recipes: ['mushroom chicken stir-fry', 'mushroom tofu soup'] },
  { label: 'Cabbage', recipes: ['stir-fried cabbage', 'cabbage tofu stew'] },
]

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function getAllowedRecipes(preferredCombos: string[]): string[] {
  const selected = new Set(preferredCombos.map((c) => normalize(c)))
  const chosen = COMBO_LIBRARY.filter((item) =>
    [...selected].some((s) => s.includes(item.label.toLowerCase())),
  )
  const source = chosen.length > 0 ? chosen : COMBO_LIBRARY
  return source.flatMap((item) => item.recipes.map((recipe) => `${item.label}: ${recipe}`))
}

