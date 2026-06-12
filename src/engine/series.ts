import type { BakerGame, MatchPlayer, ThrowEvent } from './types'
import { playBakerGame, teamHcp } from './baker'
import { rollFirstThrow } from './throws'
import { ALL_PINS } from './leaves'
import type { Rng } from './rng'

/**
 * Формат «ТВ-финала» КЛБ (GAME_PLAN.md §1): серия из 2 игр со сменой дорожек,
 * очко за игру (ничья в игре — по 0.5), при равенстве очков — ролл-офф до 3.
 */

export interface TwoGamesResult {
  /** g[i] — игра i: бейкер-игры обеих команд. */
  g: [{ a: BakerGame; b: BakerGame }, { a: BakerGame; b: BakerGame }]
  hcp: [number, number]
  /** Итоги игр с гандикапом: finals[игра][команда]. */
  finals: [[number, number], [number, number]]
  points: [number, number]
  tied: boolean
}

export function playTwoGames(lineupA: MatchPlayer[], lineupB: MatchPlayer[], rng: Rng): TwoGamesResult {
  const hcp: [number, number] = [teamHcp(lineupA), teamHcp(lineupB)]
  const g: TwoGamesResult['g'] = [
    { a: playBakerGame(lineupA, rng), b: playBakerGame(lineupB, rng) },
    { a: playBakerGame(lineupA, rng), b: playBakerGame(lineupB, rng) },
  ]
  const finals = g.map((game) => [game.a.total + hcp[0], game.b.total + hcp[1]]) as TwoGamesResult['finals']
  const points: [number, number] = [0, 0]
  for (const [fa, fb] of finals) {
    if (fa > fb) points[0] += 1
    else if (fb > fa) points[1] += 1
    else {
      points[0] += 0.5
      points[1] += 0.5
    }
  }
  return { g, hcp, finals, points, tied: points[0] === points[1] }
}

export interface RolloffThrow {
  slot: number
  playerId: number
  ev: ThrowEvent // frame = номер раунда, бросок по полному комплекту
  pins: number
}

export interface RolloffRound {
  a: RolloffThrow
  b: RolloffThrow
  score: [number, number] // счёт ПОСЛЕ раунда
}

export interface RolloffResult {
  start: [number, number] // стартовые слоты команд
  rounds: RolloffRound[]
  winner: 0 | 1
}

function rolloffThrow(p: MatchPlayer, slot: number, round: number, rng: Rng): RolloffThrow {
  const ft = rollFirstThrow(p, rng)
  const pins = ft.strike ? 10 : 10 - ft.leave.length
  return {
    slot,
    playerId: p.id,
    pins,
    ev: {
      frame: round,
      throwIndex: 0,
      playerId: p.id,
      pinsBefore: [...ALL_PINS],
      pinsDown: pins,
      leaveAfter: [...ft.leave],
      isStrike: ft.strike,
      isSpare: false,
      leaveKind: ft.kind,
    },
  }
}

/**
 * Ролл-офф до 3 очков. Каждый раунд: по одному броску в полный комплект,
 * сбил больше — очко, ничья — очко обоим. Очерёдность слотов циклическая от
 * выбранного стартового (выбрали слот 3 → 3-4-5-1-2). Конец — у кого-то 3+
 * очков И разница (3-3 продолжается до перевеса).
 */
export function playRolloff(
  lineupA: MatchPlayer[],
  lineupB: MatchPlayer[],
  startA: number,
  startB: number,
  rng: Rng,
): RolloffResult {
  const rounds: RolloffRound[] = []
  const score: [number, number] = [0, 0]
  for (let i = 0; i < 60; i++) {
    const sa = (startA + i) % 5
    const sb = (startB + i) % 5
    const a = rolloffThrow(lineupA[sa], sa, i + 1, rng)
    const b = rolloffThrow(lineupB[sb], sb, i + 1, rng)
    if (a.pins > b.pins) score[0]++
    else if (b.pins > a.pins) score[1]++
    else {
      score[0]++
      score[1]++
    }
    rounds.push({ a, b, score: [score[0], score[1]] })
    if ((score[0] >= 3 || score[1] >= 3) && score[0] !== score[1]) {
      return { start: [startA, startB], rounds, winner: score[0] > score[1] ? 0 : 1 }
    }
  }
  // 60 раундов подряд без перевеса статистически невозможны; страховка от цикла.
  return { start: [startA, startB], rounds, winner: rng() < 0.5 ? 0 : 1 }
}

/** ИИ: стартовый слот ролл-оффа — чтобы первые три броска делали сильнейшие. */
export function aiRolloffStart(lineup: MatchPlayer[]): number {
  let best = 0
  let bestSum = -1
  for (let s = 0; s < 5; s++) {
    const sum =
      lineup[s].effRating + lineup[(s + 1) % 5].effRating + lineup[(s + 2) % 5].effRating
    if (sum > bestSum) {
      bestSum = sum
      best = s
    }
  }
  return best
}
