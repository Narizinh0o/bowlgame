import type { BakerGame, MatchPlayer, ThrowEvent } from './types'
import { playBakerGame, teamHcp } from './baker'
import { rollFirstThrow } from './throws'
import { ALL_PINS } from './leaves'
import type { Rng } from './rng'

/**
 * Формат «ТВ-финала» КЛБ (GAME_PLAN.md §1): серия из 2 игр со сменой дорожек,
 * очко за игру; ничья в игре → ролл-офф за игру (1 бросок, до первого преимущества,
 * один игрок); при счёте 1-1 по играм → ролл-офф за матч (до 3).
 */

export interface TwoGamesResult {
  /** g[i] — игра i: бейкер-игры обеих команд. */
  g: [{ a: BakerGame; b: BakerGame }, { a: BakerGame; b: BakerGame }]
  hcp: [number, number]
  /** Итоги игр с гандикапом: finals[игра][команда]. */
  finals: [[number, number], [number, number]]
  /** Победитель игры по тоталу; null — ничья (нужен ролл-офф за игру). */
  winByTotal: [0 | 1 | null, 0 | 1 | null]
}

/** Команда на «своей» дорожке игры получает её случайный бонус к рейтингу каждого. */
function onLane(lineup: MatchPlayer[], delta: number): MatchPlayer[] {
  if (delta === 0) return lineup
  return lineup.map((p) => ({ ...p, effRating: p.effRating + delta, skill: p.skill + delta }))
}

export function playTwoGames(
  lineupA: MatchPlayer[],
  lineupB: MatchPlayer[],
  laneBonus: [number, number],
  rng: Rng,
): TwoGamesResult {
  const hcp: [number, number] = [teamHcp(lineupA), teamHcp(lineupB)]
  // Игра 1: А на дорожке 0 (№9), Б на дорожке 1 (№10); игра 2 — наоборот.
  const g: TwoGamesResult['g'] = [
    { a: playBakerGame(onLane(lineupA, laneBonus[0]), rng), b: playBakerGame(onLane(lineupB, laneBonus[1]), rng) },
    { a: playBakerGame(onLane(lineupA, laneBonus[1]), rng), b: playBakerGame(onLane(lineupB, laneBonus[0]), rng) },
  ]
  const finals = g.map((game) => [game.a.total + hcp[0], game.b.total + hcp[1]]) as TwoGamesResult['finals']
  const winByTotal = finals.map(([fa, fb]) => (fa > fb ? 0 : fb > fa ? 1 : null)) as TwoGamesResult['winByTotal']
  return { g, hcp, finals, winByTotal }
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
      brooklyn: ft.brooklyn,
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
  laneBonus: [number, number],
  rng: Rng,
): RolloffResult {
  // Дорожки в ролл-оффе — как в игре 2: А на дорожке 1 (№10), Б на дорожке 0 (№9).
  const la = onLane(lineupA, laneBonus[1])
  const lb = onLane(lineupB, laneBonus[0])
  const rounds: RolloffRound[] = []
  const score: [number, number] = [0, 0]
  for (let i = 0; i < 60; i++) {
    const sa = (startA + i) % 5
    const sb = (startB + i) % 5
    const a = rolloffThrow(la[sa], sa, i + 1, rng)
    const b = rolloffThrow(lb[sb], sb, i + 1, rng)
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

/**
 * Ролл-офф ЗА ИГРУ (при ничьей в игре): один и тот же игрок от каждой команды бросает
 * по разу в полный комплект; ничья в раунде → бросают ещё раз (тот же игрок); первое
 * преимущество решает — игра 1-0. Дорожки как в самой игре (бонус дорожки учтён).
 */
export function playGameRolloff(
  lineupA: MatchPlayer[],
  lineupB: MatchPlayer[],
  slotA: number,
  slotB: number,
  laneBonus: [number, number],
  gi: 0 | 1,
  rng: Rng,
): RolloffResult {
  const pa = onLane([lineupA[slotA]], gi === 0 ? laneBonus[0] : laneBonus[1])[0]
  const pb = onLane([lineupB[slotB]], gi === 0 ? laneBonus[1] : laneBonus[0])[0]
  const rounds: RolloffRound[] = []
  const score: [number, number] = [0, 0]
  for (let i = 0; i < 40; i++) {
    const a = rolloffThrow(pa, slotA, i + 1, rng)
    const b = rolloffThrow(pb, slotB, i + 1, rng)
    if (a.pins > b.pins) score[0]++
    else if (b.pins > a.pins) score[1]++
    rounds.push({ a, b, score: [score[0], score[1]] })
    if (score[0] !== score[1]) return { start: [slotA, slotB], rounds, winner: score[0] > score[1] ? 0 : 1 }
  }
  return { start: [slotA, slotB], rounds, winner: rng() < 0.5 ? 0 : 1 }
}

/** ИИ: игрок на ролл-офф за игру — сильнейший по итоговому рейтингу. */
export function aiAnchor(lineup: MatchPlayer[]): number {
  let best = 0
  for (let i = 1; i < lineup.length; i++) if (lineup[i].effRating > lineup[best].effRating) best = i
  return best
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
