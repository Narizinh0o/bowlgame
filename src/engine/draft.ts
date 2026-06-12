import type { RatedPlayer, Rarity } from './types'
import { LEFTY_BONUS_BASE, POOL_RARITIES, POOL_SIZE, RARITY_BONUS } from './constants'
import { clubBonuses, leftyBonuses } from './rating'
import type { Rng } from './rng'

/** Выбранный в драфте игрок: ростер + редкость слота пула. */
export interface Picked {
  player: RatedPlayer
  rarity: Rarity
}

export interface PoolSlot extends Picked {
  pickedBy: 0 | 1 | null
}

/** Рейтинг для показа в карточке: база + редкость (клубный бонус добавляется при расстановке). */
export function displayRating(p: Picked): number {
  return p.player.baseRating + RARITY_BONUS[p.rarity]
}

/** Рейтинг в карточке ПУЛА: одинокий левша показывается с полным «EZ +10».
 *  Реальный бонус пересчитается по составу (второй левша срежет до +5 и т.д.). */
export function poolRating(p: Picked): number {
  return displayRating(p) + (p.player.hand === 'L' ? LEFTY_BONUS_BASE : 0)
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Пул драфта: POOL_SIZE случайных игроков, 7 случайных слотов получают редкости. */
export function buildPool(players: RatedPlayer[], rng: Rng): PoolSlot[] {
  const chosen = shuffle(players, rng).slice(0, POOL_SIZE)
  const rarities: Rarity[] = Array(POOL_SIZE).fill('common')
  const idxs = shuffle([...Array(POOL_SIZE).keys()], rng)
  let k = 0
  for (const { rarity, count } of POOL_RARITIES) {
    for (let c = 0; c < count; c++) rarities[idxs[k++]] = rarity
  }
  return chosen.map((player, i) => ({ player, rarity: rarities[i], pickedBy: null }))
}

/** Ценность состава: рейтинги с редкостями + клубная синергия + бонусы левшей «EZ»
 *  + ценность гандикапа за девушек (+2 очка игры ≈ +1 пункт рейтинга по калибровке). */
function teamValue(picks: Picked[]): number {
  const clubs = clubBonuses(picks.map((p) => p.player))
  const lefty = leftyBonuses(picks.map((p) => p.player))
  return picks.reduce(
    (s, p, i) => s + displayRating(p) + clubs[i] + lefty[i] + (p.player.gender === 'Ж' ? 1 : 0),
    0,
  )
}

/**
 * Пик ИИ: максимизирует прирост ценности своей команды (клубная синергия учитывается
 * сама собой — через teamValue), немного ценит блокировку чужого комбо, плюс лёгкий
 * шум, чтобы драфт не был предсказуемым.
 */
export function aiPickIndex(pool: PoolSlot[], me: 0 | 1, rng: Rng): number {
  const mine = pool.filter((s) => s.pickedBy === me)
  const opp = pool.filter((s) => s.pickedBy !== null && s.pickedBy !== me)
  const myBase = teamValue(mine)
  const oppBase = teamValue(opp)
  let best = -1
  let bestScore = -Infinity
  pool.forEach((slot, i) => {
    if (slot.pickedBy !== null) return
    const gainSelf = teamValue([...mine, slot]) - myBase
    const gainOpp = opp.length < 5 ? teamValue([...opp, slot]) - oppBase : 0
    const score = gainSelf + 0.3 * gainOpp + (rng() - 0.5) * 4
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

/** Расстановка ИИ: сильнейший — слот 5 (кидает фреймы 5 и 10), остальные по убыванию в 1..4. */
export function aiArrangeOrder(picks: Picked[]): Picked[] {
  const sorted = [...picks].sort((a, b) => displayRating(b) - displayRating(a))
  return [...sorted.slice(1), sorted[0]]
}
