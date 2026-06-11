import type { ThrowEvent } from './types'
import { pickWeighted, type Rng } from './rng'

/**
 * Реакция игрока на результат своего броска (GAME_PLAN.md §6).
 * Часто утрированная (huge_*), но иногда инверсия для комедии:
 * каменное лицо после провала, невозмутимое «как и планировал» после успеха.
 * Этап 4 показывает реакции эмодзи, этап 5 повесит на них анимацию персонажа.
 */
export type Reaction = 'huge_joy' | 'joy' | 'cocky' | 'neutral' | 'sad' | 'huge_sad' | 'stone_face'

type Outcome = 'great' | 'good' | 'neutral' | 'bad' | 'terrible' | 'expected_miss'

function outcomeOf(e: ThrowEvent): Outcome {
  if (e.pinsBefore.length === 10) {
    // Бросок по полной расстановке (первый в фрейме или «свежий» в 10-м).
    if (e.isStrike) return 'great'
    switch (e.leaveKind) {
      case 'single':
      case 'multi':
        return 'neutral' // рабочий лив, рано радоваться или грустить
      case 'gutter':
        return 'terrible'
      default:
        return 'bad' // оставил сплит / вошаут / дикий
    }
  }
  // Добой.
  if (e.isSpare) {
    return e.leaveKind === 'single' || e.leaveKind === 'multi' ? 'good' : 'great' // вытащил сложное!
  }
  const hard =
    e.leaveKind === 'split' || e.leaveKind === 'washout' || e.leaveKind === 'wild' || e.leaveKind === 'gutter'
  if (hard) return 'expected_miss' // 7-10 не добил — никто и не ждал
  return e.pinsDown === 0 && e.pinsBefore.length >= 3 ? 'terrible' : 'bad'
}

const TABLE: Record<Outcome, [Reaction, number][]> = {
  great: [
    ['huge_joy', 55],
    ['joy', 25],
    ['cocky', 20],
  ],
  good: [
    ['joy', 45],
    ['huge_joy', 30],
    ['neutral', 15],
    ['cocky', 10],
  ],
  neutral: [['neutral', 100]],
  bad: [
    ['sad', 40],
    ['huge_sad', 35],
    ['stone_face', 25],
  ],
  terrible: [
    ['huge_sad', 40],
    ['stone_face', 35], // кинул в желоб — и стоит с каменным лицом
    ['sad', 25],
  ],
  expected_miss: [
    ['neutral', 55],
    ['sad', 30],
    ['stone_face', 15],
  ],
}

export function reactionFor(e: ThrowEvent, rng: Rng): Reaction {
  return pickWeighted(TABLE[outcomeOf(e)], (x) => x[1], rng)[0]
}
