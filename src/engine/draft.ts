import type { RatedPlayer, Rarity } from './types'
import { POOL_RARITIES, POOL_SIZE, RARITY_BONUS } from './constants'
import { clubBonuses } from './rating'
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

/** Ценность состава: сумма рейтингов с редкостями и клубной синергией. */
function teamValue(picks: Picked[]): number {
  const bonuses = clubBonuses(picks.map((p) => p.player))
  return picks.reduce((s, p, i) => s + displayRating(p) + bonuses[i], 0)
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
