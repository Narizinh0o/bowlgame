/** ВСЕ балансовые константы игры — единственный источник правды (см. GAME_PLAN.md §3–4). */

/** Сглаживание новичков: rel = games / (games + SHRINK_K). */
export const SHRINK_K = 12

/** Диапазон базового рейтинга. */
export const RATING_MIN = 30
export const RATING_MAX = 88

/** Перцентиль avg, который маппится в RATING_MIN (отсекает нижние выбросы). */
export const RATING_LO_PCT = 2

/** Перцентиль базовых рейтингов, где coef = 1 («20-е место из 100»). */
export const COEF_PCT = 80

/** Бонусы редкостей и их количество в драфт-пуле из 30. */
export const RARITY_BONUS = { common: 0, rare: 3, epic: 8, legendary: 15 } as const
export const POOL_SIZE = 30
export const POOL_RARITIES: { rarity: keyof typeof RARITY_BONUS; count: number }[] = [
  { rarity: 'legendary', count: 1 },
  { rarity: 'epic', count: 2 },
  { rarity: 'rare', count: 4 },
]

/** Клубная синергия: одноклубников в пятёрке -> бонус рейтинга каждому из них. */
export const CLUB_BONUS: Record<number, number> = { 3: 5, 4: 10, 5: 20 }

/** Страйк: P = STRIKE_BASE + STRIKE_GAIN * tanh(skill / STRIKE_SCALE), асимптота 90%. */
export const STRIKE_BASE = 0.5
export const STRIKE_GAIN = 0.4
export const STRIKE_SCALE = 37

/** Веса категорий первого броска при skill=0 (страйк задаётся отдельно формулой). */
export const CAT_WEIGHTS = {
  single: 25.5,
  multi: 15.0,
  split: 5.5,
  washout: 2.5,
  gutter: 0.5,
  wild: 0.08,
} as const

/** «Плохие» категории (вес падает с ростом skill): mult = 1 - BAD_GAIN * tanh(skill/BAD_SCALE). */
export const BAD_GAIN = 0.35
export const BAD_SCALE = 45
/** Усиление плохих категорий у новичков: вес *= 1 + VOL_BAD * vol. */
export const VOL_BAD = 0.6

/** Добои: P = convP * (1 + CONV_GAIN * tanh(skill/CONV_SCALE)) * (1 - VOL_CONV * vol). */
export const CONV_GAIN = 0.35
export const CONV_SCALE = 40
export const VOL_CONV = 0.12
export const CONV_CAP = 0.97

/** Базовые вероятности добоя по категориям (для convP в таблицах ливов). */
export const CONV_BASE = { single: 0.75, multi: 0.7, split: 0.2, washout: 0.5 } as const

/** Желоб: добой всех 10 = P(страйк) * GUTTER_SPARE_FACTOR, иначе сбито 5–9. */
export const GUTTER_SPARE_FACTOR = 0.85

/** Недобор: сбито n-1 / n-2 / 0 кеглей с этими весами (n — размер лива). */
export const MISS_DOWN_WEIGHTS = { nMinus1: 50, nMinus2: 30, zero: 20 } as const

/** Отображаемый коэффициент (в UI не показывается): coef = 1 + skill / COEF_SLOPE. */
export const COEF_SLOPE = 40
