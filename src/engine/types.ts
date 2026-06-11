export type Hand = 'R' | 'L'

/** Строка roster.json — снапшот реальной статистики КЛБ. */
export interface RosterPlayer {
  id: number
  name: string
  gender: string // 'М' | 'Ж' | 'U'
  hand: string // 'R' | 'L'
  club: string
  avg: number // средний с гандикапом (формула сайта)
  games: number
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

/** Игрок с посчитанным базовым рейтингом (постоянная часть, без бонусов). */
export interface RatedPlayer extends RosterPlayer {
  baseRating: number // 30..88, целое
  rel: number // достоверность среднего: games/(games+12), 0..1
}

/** Игрок в конкретном матче: с редкостью и клубным бонусом. */
export interface MatchPlayer extends RatedPlayer {
  rarity: Rarity
  clubBonus: number // 0 | 5 | 10 | 20
  effRating: number // baseRating + rarity + clubBonus
  skill: number // effRating - r80 ростера; вход ВСЕХ вероятностей
  vol: number // волатильность новичка: 1 - rel
}

export type LeaveKind = 'single' | 'multi' | 'split' | 'washout' | 'gutter' | 'wild'

/** Вариант оставшихся кеглей. pins — для ПРАВШИ, левше зеркалится. */
export interface LeaveDef {
  pins: number[]
  w: number // вес внутри категории
  convP: number // базовая вероятность добоя при skill=0 (уже с учётом сложности)
}

/** Один бросок — событие для табло, лога и анимации. */
export interface ThrowEvent {
  frame: number // 1..10 (доп. фреймы sudden death: 11+)
  throwIndex: number // 0 | 1 | 2 (третий — только в 10-м фрейме)
  playerId: number
  pinsBefore: number[] // стоящие кегли до броска
  pinsDown: number // сколько сбил
  leaveAfter: number[] // стоящие после броска
  isStrike: boolean
  isSpare: boolean
  leaveKind: LeaveKind | null // категория лива, образованного ПЕРВЫМ броском
}

export interface FrameScore {
  throws: number[] // сбито за каждый бросок фрейма
  cumulative: number | null // накопительный итог (null, пока бонус не определён)
}

export interface BakerGame {
  events: ThrowEvent[]
  frames: FrameScore[] // 10 штук
  total: number
}

/** Дополнительный фрейм при ничьей (sudden death). */
export interface ExtraFrame {
  slot: number // чей слот кидал (0..4)
  a: { events: ThrowEvent[]; pins: number }
  b: { events: ThrowEvent[]; pins: number }
}

export interface MatchResult {
  gameA: BakerGame
  gameB: BakerGame
  hcp: [number, number] // гандикап за девушек (+2 за каждую в пятёрке)
  finalTotals: [number, number] // кегли + гандикап — по ним определяется победитель
  extra: ExtraFrame[]
  winner: 0 | 1
}
