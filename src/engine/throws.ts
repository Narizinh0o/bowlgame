import type { LeaveDef, LeaveKind, MatchPlayer } from './types'
import {
  BAD_GAIN,
  BAD_SCALE,
  CAT_WEIGHTS,
  CONV_CAP,
  CONV_GAIN,
  CONV_SCALE,
  GUTTER_SPARE_FACTOR,
  MISS_DOWN_WEIGHTS,
  STRIKE_BASE,
  STRIKE_GAIN,
  STRIKE_SCALE,
  VOL_BAD,
  VOL_CONV,
} from './constants'
import { ALL_PINS, LEAVE_TABLES, mirrorPins } from './leaves'
import { pickSubset, pickWeighted, type Rng } from './rng'

/**
 * ИНВАРИАНТ МОНОТОННОСТИ (GAME_PLAN.md §3): skill — единственный вход вероятностей.
 * Рост skill: страйк вверх, добои вверх, сплиты/вошауты/желоб/дикое вниз.
 * Волатильность (vol) бьёт только по плохим категориям и добоям — новичок нестабилен.
 */

export function strikeP(p: MatchPlayer): number {
  return STRIKE_BASE + STRIKE_GAIN * Math.tanh(p.skill / STRIKE_SCALE)
}

function badMult(p: MatchPlayer): number {
  return (1 - BAD_GAIN * Math.tanh(p.skill / BAD_SCALE)) * (1 + VOL_BAD * p.vol)
}

export function convMult(p: MatchPlayer): number {
  return (1 + CONV_GAIN * Math.tanh(p.skill / CONV_SCALE)) * (1 - VOL_CONV * p.vol)
}

export function convChance(convP: number, p: MatchPlayer): number {
  return Math.min(CONV_CAP, convP * convMult(p))
}

export interface FirstThrowResult {
  strike: boolean
  kind: LeaveKind | null // null при страйке
  leave: number[] // стоящие кегли (пусто при страйке)
  convP: number // базовый шанс добоя этого лива (без модификаторов)
}

export function rollFirstThrow(p: MatchPlayer, rng: Rng): FirstThrowResult {
  if (rng() < strikeP(p)) return { strike: true, kind: null, leave: [], convP: 0 }

  const bm = badMult(p)
  const cats: { kind: LeaveKind; w: number }[] = [
    { kind: 'single', w: CAT_WEIGHTS.single },
    { kind: 'multi', w: CAT_WEIGHTS.multi },
    { kind: 'split', w: CAT_WEIGHTS.split * bm },
    { kind: 'washout', w: CAT_WEIGHTS.washout * bm },
    { kind: 'gutter', w: CAT_WEIGHTS.gutter * bm },
    { kind: 'wild', w: CAT_WEIGHTS.wild * bm },
  ]
  const cat = pickWeighted(cats, (c) => c.w, rng).kind

  if (cat === 'gutter') return { strike: false, kind: 'gutter', leave: [...ALL_PINS], convP: -1 }

  const def: LeaveDef = pickWeighted(LEAVE_TABLES[cat], (d) => d.w, rng)
  const pins = p.hand === 'L' ? mirrorPins(def.pins) : [...def.pins]
  return { strike: false, kind: cat, leave: pins, convP: def.convP }
}

export interface SecondThrowResult {
  converted: boolean
  pinsDown: number
  leaveAfter: number[]
}

export function rollSecondThrow(ft: FirstThrowResult, p: MatchPlayer, rng: Rng): SecondThrowResult {
  const n = ft.leave.length

  if (ft.kind === 'gutter') {
    // Стоят все 10: добить всё — почти как выбить страйк.
    if (rng() < strikeP(p) * GUTTER_SPARE_FACTOR) return { converted: true, pinsDown: 10, leaveAfter: [] }
    const downs = [5, 6, 7, 8, 9]
    const down = pickWeighted(downs, (d) => [1, 2, 3, 2, 1][d - 5], rng)
    return { converted: false, pinsDown: down, leaveAfter: pickSubset(ft.leave, n - down, rng) }
  }

  if (rng() < convChance(ft.convP, p)) return { converted: true, pinsDown: n, leaveAfter: [] }

  // Недобор: одиночную — промах в ноль; группу — сбита часть (n-1 / n-2 / 0).
  if (n === 1) return { converted: false, pinsDown: 0, leaveAfter: [...ft.leave] }
  const opts: { down: number; w: number }[] = [{ down: n - 1, w: MISS_DOWN_WEIGHTS.nMinus1 }]
  if (n - 2 > 0) opts.push({ down: n - 2, w: MISS_DOWN_WEIGHTS.nMinus2 })
  opts.push({ down: 0, w: MISS_DOWN_WEIGHTS.zero + (n - 2 > 0 ? 0 : MISS_DOWN_WEIGHTS.nMinus2) })
  const down = pickWeighted(opts, (o) => o.w, rng).down
  return { converted: false, pinsDown: down, leaveAfter: pickSubset(ft.leave, n - down, rng) }
}
