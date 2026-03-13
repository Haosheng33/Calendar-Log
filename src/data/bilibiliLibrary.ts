export type BilibiliRecipeResult = {
  id: string
  title: string
  comboIds: string[]
  url: string
}

// Curated local Bilibili links (no generated English search links).
// Source policy: keep this list aligned with recipe videos you approve.
export const BILIBILI_RECIPE_LIBRARY: BilibiliRecipeResult[] = [
  {
    id: 'tomato-egg-special',
    title: '番茄相关家常菜（按你的指定链接）',
    comboIds: ['tomato', 'egg'],
    url: 'https://www.bilibili.com/video/BV11y4y167Wa/?vd_source=e7085070bf144665e61cf5d17f4d08cc',
  },
]

