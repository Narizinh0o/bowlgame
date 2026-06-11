import type { MatchPlayer, Rarity, RatedPlayer, RosterPlayer } from './types'
import {
  CLUB_BONUS,
  COEF_PCT,
  COEF_SLOPE,
  RARITY_BONUS,
  RATING_LO_PCT,
  RATING_MAX,
  RATING_MIN,
  SHRINK_K,
} from './constants'

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))
  return sorted[idx]
}

export interface RatedRoster {
  players: RatedPlayer[]
  r80: number // рейтинг 80-го перцентиля — точка coef = 1
  leagueAvg: number
}

/**
 * Базовые рейтинги всего ростера (GAME_PLAN.md §3):
 * средний сглаживается к среднему лиги по числу игр, затем линейно маппится в 30..88.
 */
export function buildRatedRoster(roster: RosterPlayer[]): RatedRoster {
  let ss = 0
  let gg = 0
  for (const p of roster) {
    ss += p.avg * p.games
    gg += p.games
  }
  const leagueAvg = ss / gg

  const adjOf = (p: RosterPlayer) => {
    const rel = p.games / (p.games + SHRINK_K)
    return leagueAvg + (p.avg - leagueAvg) * rel
  }

  const adjSorted = roster.map(adjOf).sort((a, b) => a - b)
  const lo = percentile(adjSorted, RATING_LO_PCT)
  const hi = adjSorted[adjSorted.length - 1]

  const players: RatedPlayer[] = roster.map((p) => {
    const t = (adjOf(p) - lo) / (hi - lo)
    const raw = RATING_MIN + (RATING_MAX - RATING_MIN) * t
    return {
      ...p,
      baseRating: Math.round(Math.min(RATING_MAX, Math.max(RATING_MIN, raw))),
      rel: p.games / (p.games + SHRINK_K),
    }
  })

  const ratingsSorted = players.map((p) => p.baseRating).sort((a, b) => a - b)
  const r80 = percentile(ratingsSorted, COEF_PCT)

  return { players, r80, leagueAvg }
}

/** Клубные бонусы пятёрки: 3/4/5 одноклубников -> +5/+10/+20 каждому из них. */
export function clubBonuses(lineup: RatedPlayer[]): number[] {
  const byClub = new Map<string, number>()
  for (const p of lineup) {
    if (p.club && p.club !== '—') byClub.set(p.club, (byClub.get(p.club) ?? 0) + 1)
  }
  return lineup.map((p) => CLUB_BONUS[byClub.get(p.club) ?? 0] ?? 0)
}

/** Игрок матча: рейтинг с бонусами, skill и волатильность — всё, что нужно движку. */
export function toMatchPlayer(p: RatedPlayer, rarity: Rarity, clubBonus: number, r80: number): MatchPlayer {
  const effRating = p.baseRating + RARITY_BONUS[rarity] + clubBonus
  return {
    ...p,
    rarity,
    clubBonus,
    effRating,
    skill: effRating - r80,
    vol: 1 - p.rel,
  }
}

/** Собрать пятёрку в MatchPlayer[] с учётом клубной синергии. */
export function buildLineup(picks: { player: RatedPlayer; rarity: Rarity }[], r80: number): MatchPlayer[] {
  const bonuses = clubBonuses(picks.map((p) => p.player))
  return picks.map((p, i) => toMatchPlayer(p.player, p.rarity, bonuses[i], r80))
}

/** Отображаемый коэффициент (для отладки и спеки; в UI не показывается). */
export function displayCoef(skill: number): number {
  return 1 + skill / COEF_SLOPE
}
