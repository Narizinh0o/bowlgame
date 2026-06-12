import type { BakerGame, ExtraFrame, FrameScore, MatchPlayer, MatchResult, ThrowEvent } from './types'
import { FEMALE_GAME_HCP } from './constants'
import { ALL_PINS } from './leaves'
import { rollFirstThrow, rollSecondThrow } from './throws'
import type { Rng } from './rng'

/** Слот ротации Бейкера для фрейма (1..10): слот 0 кидает фреймы 1 и 6 и т.д. */
export function slotForFrame(frame: number): number {
  return (frame - 1) % 5
}

interface ThrowOutcome {
  event: ThrowEvent
  pinsDown: number
}

/** Один «первый» бросок по полной расстановке (фрейм/10-й после закрытия). */
function doFirstThrow(p: MatchPlayer, frame: number, throwIndex: number, rng: Rng): ThrowOutcome & {
  ft: ReturnType<typeof rollFirstThrow>
} {
  const ft = rollFirstThrow(p, rng)
  const pinsDown = ft.strike ? 10 : 10 - ft.leave.length
  return {
    ft,
    pinsDown,
    event: {
      frame,
      throwIndex,
      playerId: p.id,
      pinsBefore: [...ALL_PINS],
      pinsDown,
      leaveAfter: [...ft.leave],
      isStrike: ft.strike,
      isSpare: false,
      leaveKind: ft.kind,
      brooklyn: ft.brooklyn,
    },
  }
}

/** Добой текущего лива. */
function doSecondThrow(
  p: MatchPlayer,
  ft: ReturnType<typeof rollFirstThrow>,
  frame: number,
  throwIndex: number,
  rng: Rng,
): ThrowOutcome {
  const st = rollSecondThrow(ft, p, rng)
  return {
    pinsDown: st.pinsDown,
    event: {
      frame,
      throwIndex,
      playerId: p.id,
      pinsBefore: [...ft.leave],
      pinsDown: st.pinsDown,
      leaveAfter: st.leaveAfter,
      isStrike: false,
      isSpare: st.converted,
      leaveKind: ft.kind,
      brooklyn: false,
    },
  }
}

/** Классический боулинг-скоринг по броскам фреймов (10-й — особый). */
export function scoreGame(throwsPerFrame: number[][]): { frames: FrameScore[]; total: number } {
  const flat: number[] = []
  const frameStart: number[] = []
  for (const fr of throwsPerFrame) {
    frameStart.push(flat.length)
    flat.push(...fr)
  }

  const frames: FrameScore[] = []
  let cum = 0
  for (let i = 0; i < throwsPerFrame.length; i++) {
    const fr = throwsPerFrame[i]
    let score: number | null = null
    if (i === 9) {
      score = fr.reduce((a, b) => a + b, 0)
    } else if (fr[0] === 10) {
      const next = flat.slice(frameStart[i] + 1, frameStart[i] + 3)
      score = next.length === 2 ? 10 + next[0] + next[1] : null
    } else if (fr[0] + (fr[1] ?? 0) === 10 && fr.length >= 2) {
      const next = flat.slice(frameStart[i] + 2, frameStart[i] + 3)
      score = next.length === 1 ? 10 + next[0] : null
    } else if (fr.length >= 2) {
      score = fr[0] + fr[1]
    }
    if (score === null) {
      frames.push({ throws: [...fr], cumulative: null })
    } else {
      cum += score
      frames.push({ throws: [...fr], cumulative: cum })
    }
  }
  return { frames, total: cum }
}

/** Одна игра Бейкера: 5 игроков, слот i кидает фреймы i+1 и i+6. */
export function playBakerGame(lineup: MatchPlayer[], rng: Rng): BakerGame {
  const events: ThrowEvent[] = []
  const throwsPerFrame: number[][] = []

  for (let frame = 1; frame <= 9; frame++) {
    const p = lineup[slotForFrame(frame)]
    const t1 = doFirstThrow(p, frame, 0, rng)
    events.push(t1.event)
    if (t1.ft.strike) {
      throwsPerFrame.push([10])
      continue
    }
    const t2 = doSecondThrow(p, t1.ft, frame, 1, rng)
    events.push(t2.event)
    throwsPerFrame.push([t1.pinsDown, t2.pinsDown])
  }

  // 10-й фрейм: до трёх бросков.
  const p10 = lineup[slotForFrame(10)]
  const rolls: number[] = []
  let throwIndex = 0
  let pending: ReturnType<typeof rollFirstThrow> | null = null
  while (rolls.length < (needsThird(rolls) ? 3 : 2) || pending) {
    if (pending) {
      const t = doSecondThrow(p10, pending, 10, throwIndex, rng)
      events.push(t.event)
      rolls.push(t.pinsDown)
      pending = null
      throwIndex++
      // открытый 10-й (не добил) после 2 бросков — конец
      if (throwIndex === 2 && !t.event.isSpare) break
    } else {
      const t = doFirstThrow(p10, 10, throwIndex, rng)
      events.push(t.event)
      rolls.push(t.pinsDown)
      if (!t.ft.strike) pending = t.ft
      throwIndex++
    }
    if (throwIndex >= 3) break
  }
  throwsPerFrame.push(rolls)

  const { frames, total } = scoreGame(throwsPerFrame)
  return { events, frames, total }
}

/** Заслужен ли третий бросок в 10-м (страйк или спэр в первых двух). */
function needsThird(rolls: number[]): boolean {
  if (rolls.length === 0) return false
  if (rolls[0] === 10) return true
  return rolls.length >= 2 && rolls[0] + rolls[1] === 10
}

/** Дополнительный фрейм sudden death: обычный фрейм, очки = сбитые кегли без бонусов. */
function playExtraFrame(p: MatchPlayer, frame: number, rng: Rng): { events: ThrowEvent[]; pins: number } {
  const events: ThrowEvent[] = []
  const t1 = doFirstThrow(p, frame, 0, rng)
  events.push(t1.event)
  if (t1.ft.strike) return { events, pins: 10 }
  const t2 = doSecondThrow(p, t1.ft, frame, 1, rng)
  events.push(t2.event)
  return { events, pins: t1.pinsDown + t2.pinsDown }
}

/** Гандикап команды: +2 очка к итогу игры за каждую девушку в пятёрке. */
export function teamHcp(lineup: { gender: string }[]): number {
  return lineup.filter((p) => p.gender === 'Ж').length * FEMALE_GAME_HCP
}

/** Матч: по одной игре Бейкера на команду; победитель — по «кегли + гандикап»;
 *  ничья решается sudden death по слотам (чистыми кеглями, гандикап разовый на игру). */
export function playMatch(lineupA: MatchPlayer[], lineupB: MatchPlayer[], rng: Rng): MatchResult {
  const gameA = playBakerGame(lineupA, rng)
  const gameB = playBakerGame(lineupB, rng)
  const hcp: [number, number] = [teamHcp(lineupA), teamHcp(lineupB)]
  const finalTotals: [number, number] = [gameA.total + hcp[0], gameB.total + hcp[1]]
  const extra: ExtraFrame[] = []

  let winner: 0 | 1
  if (finalTotals[0] !== finalTotals[1]) {
    winner = finalTotals[0] > finalTotals[1] ? 0 : 1
  } else {
    winner = 0
    let frame = 11
    let decided = false
    // 50 раундов sudden death на практике недостижимы; страховка от вечного цикла.
    for (let round = 0; round < 50 && !decided; round++) {
      for (let slot = 0; slot < 5 && !decided; slot++) {
        const a = playExtraFrame(lineupA[slot], frame, rng)
        const b = playExtraFrame(lineupB[slot], frame, rng)
        extra.push({ slot, a, b })
        if (a.pins !== b.pins) {
          winner = a.pins > b.pins ? 0 : 1
          decided = true
        }
        frame++
      }
    }
    if (!decided) winner = rng() < 0.5 ? 0 : 1
  }

  return { gameA, gameB, hcp, finalTotals, extra, winner }
}
