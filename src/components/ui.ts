import type { Rarity } from '../engine'

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '',
  rare: 'Редкий',
  epic: 'Эпический',
  legendary: 'Легендарный',
}

/** Рамка+фон карточки по редкости (приглушённые тёмные тона). */
export const RARITY_CARD: Record<Rarity, string> = {
  common: 'border-slate-700 bg-slate-900',
  rare: 'border-sky-500/70 bg-sky-950/40',
  epic: 'border-violet-500/70 bg-violet-950/40',
  legendary: 'border-amber-400/80 bg-amber-950/40',
}

export const RARITY_TEXT: Record<Rarity, string> = {
  common: 'text-slate-400',
  rare: 'text-sky-300',
  epic: 'text-violet-300',
  legendary: 'text-amber-300',
}

/** «иванов иван» -> «Иванов Иван» (в данных имена в нижнем регистре). */
export function capName(name: string): string {
  return name.replace(/(^|[\s-])(\S)/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
}

/** Фамилия для компактных чипов. */
export function shortName(name: string): string {
  return capName(name.split(' ')[0])
}

/** Символ пола (левша помечается отдельным бейджем «EZ»). */
export function genderSymbol(p: { gender: string }): string {
  return p.gender === 'Ж' ? '♀' : p.gender === 'М' ? '♂' : ''
}

/** Классы красного мини-бейджа «EZ» для левшей. */
export const EZ_BADGE = 'rounded bg-red-500/15 px-1 text-[9px] font-black text-red-400'
