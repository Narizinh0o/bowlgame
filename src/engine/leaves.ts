import type { LeaveDef, LeaveKind } from './types'
import { CONV_BASE } from './constants'

/**
 * Таблицы реальных ливов. Кегли:
 *      7 8 9 10
 *       4 5 6
 *        2 3
 *         1
 * Все таблицы заданы ДЛЯ ПРАВШИ (карман 1-3): типичный лив — 10-я, бакет 2-4-5-8 и т.д.
 * Для левши набор зеркалится: 2<->3, 4<->6, 7<->10, 8<->9.
 */

const single = (pin: number, w: number, mult = 1): LeaveDef => ({
  pins: [pin],
  w,
  convP: CONV_BASE.single * mult,
})

/** Одиночные кегли. 10-я — классика правши; головную (1) одну почти не оставляют. */
export const SINGLES: LeaveDef[] = [
  single(10, 30),
  single(7, 12),
  single(4, 9, 0.97),
  single(6, 7, 0.97),
  single(9, 6),
  single(2, 5, 0.95),
  single(8, 5),
  single(3, 4, 0.95),
  single(5, 3, 0.93),
  single(1, 1, 0.9),
]

const multi = (pins: number[], w: number, mult = 1): LeaveDef => ({
  pins,
  w,
  convP: CONV_BASE.multi * mult,
})

/** Мультипины — 2+ кегли «кучкой», добиваются одним точным броском. */
export const MULTIS: LeaveDef[] = [
  multi([6, 10], 9),
  multi([1, 2], 7, 1.05),
  multi([1, 2, 4], 6, 0.95),
  multi([2, 8], 6, 0.9),
  multi([2, 4, 5], 5, 0.9),
  multi([9, 10], 5, 0.95),
  multi([4, 7], 5),
  multi([1, 3], 4, 1.05),
  multi([3, 5, 6], 4, 0.9),
  multi([3, 9], 4, 0.9),
  multi([1, 3, 6], 3, 0.95),
  multi([2, 4, 5, 8], 3, 0.8), // бакет
  multi([6, 9, 10], 3, 0.85),
  multi([7, 8], 3, 0.95),
  multi([5, 8], 3, 0.9),
  multi([3, 5, 6, 9], 2, 0.8), // бакет левого края
  multi([1, 2, 4, 7], 2, 0.75), // «забор»
  multi([4, 7, 8], 2, 0.85),
]

const split = (pins: number[], w: number, mult: number): LeaveDef => ({
  pins,
  w,
  convP: CONV_BASE.split * mult,
})

/** Сплиты. mult — сложность: бэйби-сплиты добиваются часто, 7-10 и big four — почти никогда. */
export const SPLITS: LeaveDef[] = [
  split([3, 10], 16, 1.8), // baby split правши
  split([5, 7], 9, 0.9),
  split([5, 10], 9, 0.9),
  split([2, 7], 8, 1.8), // baby split
  split([8, 10], 7, 0.55),
  split([7, 10], 6, 0.05), // легендарный безнадёжный
  split([4, 6], 5, 0.06),
  split([7, 9], 4, 0.55),
  split([4, 9], 4, 0.45),
  split([3, 7], 4, 0.65),
  split([2, 10], 4, 0.65),
  split([6, 7, 10], 3, 0.25),
  split([4, 7, 10], 3, 0.25),
  split([4, 6, 7], 2, 0.2),
  split([5, 7, 10], 2, 0.3), // sour apple
  split([4, 6, 7, 10], 2, 0.03), // big four
  split([4, 6, 7, 8, 10], 1, 0.03), // greek church
]

const washout = (pins: number[], w: number, mult: number): LeaveDef => ({
  pins,
  w,
  convP: CONV_BASE.washout * mult,
})

/** Вошауты — головная стоит + дыра (сплитом не считается, но добить трудно). */
export const WASHOUTS: LeaveDef[] = [
  washout([1, 10], 10, 1.1),
  washout([1, 2, 10], 8, 1.0),
  washout([1, 2, 4, 10], 5, 0.9),
  washout([1, 3, 7], 2, 0.9),
]

/** «Дикие» ливы — на долю WILD-категории (~1%); включая почти невозможные, для веселья. */
export const WILDS: LeaveDef[] = [
  { pins: [1, 2, 3], w: 3, convP: 0.4 },
  { pins: [7, 8, 9, 10], w: 2, convP: 0.04 }, // весь задний ряд — «как?!»
  { pins: [1, 2, 4, 7, 10], w: 2, convP: 0.08 },
  { pins: [1, 2, 3, 4, 6], w: 1, convP: 0.12 },
  { pins: [4, 6, 7, 8, 9, 10], w: 1, convP: 0.02 },
  { pins: [2, 3], w: 1, convP: 0.5 }, // «невозможный» — шанс выпадения ~0.1%
]

export const LEAVE_TABLES: Record<Exclude<LeaveKind, 'gutter'>, LeaveDef[]> = {
  single: SINGLES,
  multi: MULTIS,
  split: SPLITS,
  washout: WASHOUTS,
  wild: WILDS,
}

const MIRROR: Record<number, number> = { 1: 1, 2: 3, 3: 2, 4: 6, 5: 5, 6: 4, 7: 10, 8: 9, 9: 8, 10: 7 }

/** Зеркало расстановки для левши. */
export function mirrorPins(pins: number[]): number[] {
  return pins.map((p) => MIRROR[p]).sort((a, b) => a - b)
}

export const ALL_PINS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
