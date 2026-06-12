import {
  EVENT_ALL_DELTA,
  EVENT_CLUB_BONUS,
  EVENT_HAND_EDGE,
  EVENT_HAND_EDGE_P,
  EVENT_HAND_ZONE,
  EVENT_HAND_ZONE_P,
  EVENT_HEAT_P,
  EVENT_MACHINE_P,
  EVENTS_MAX,
  EVENTS_MIN,
} from './constants'
import { shuffle, type Rng } from './rng'

/**
 * Случайные события матча (GAME_PLAN.md §3): генерятся перед драфтом, видны на экране
 * драфта и влияют на рейтинг игроков весь матч. Всего 3..7 событий; клубное — всегда
 * хотя бы одно (клуб случайный — его игроков может вообще не оказаться в пуле, это фан).
 * «Залили край» и «зона 10 досок» для одной руки взаимоисключающие; машинка либо
 * починена, либо сломана — не одновременно.
 */

export type MatchEvent =
  | { kind: 'club'; club: string; bonus: number; text: string }
  | { kind: 'hand'; hand: 'L' | 'R'; bonus: number; text: string }
  | { kind: 'all'; bonus: number; text: string }

export function rollMatchEvents(clubs: string[], rng: Rng): MatchEvent[] {
  const events: MatchEvent[] = []

  if (rng() < EVENT_HEAT_P) {
    events.push({
      kind: 'all',
      bonus: -EVENT_ALL_DELTA,
      text: `Как обычно не работает охлаждение, игроки умирают от жары — каждому −${EVENT_ALL_DELTA}`,
    })
  }

  if (rng() < EVENT_MACHINE_P) {
    events.push(
      rng() < 0.5
        ? { kind: 'all', bonus: EVENT_ALL_DELTA, text: `Машинку починили — каждому игроку +${EVENT_ALL_DELTA}` }
        : { kind: 'all', bonus: -EVENT_ALL_DELTA, text: `Машинка сломалась — каждому игроку −${EVENT_ALL_DELTA}` },
    )
  }

  for (const hand of ['L', 'R'] as const) {
    const who = hand === 'L' ? 'левш' : 'правш'
    const r = rng()
    if (r < EVENT_HAND_EDGE_P) {
      events.push({
        kind: 'hand',
        hand,
        bonus: EVENT_HAND_EDGE,
        text: `${hand === 'L' ? 'Левшам' : 'Правшам'} залили край и они плачут — каждый ${who}а получает ${EVENT_HAND_EDGE}`,
      })
    } else if (r < EVENT_HAND_EDGE_P + EVENT_HAND_ZONE_P) {
      events.push({
        kind: 'hand',
        hand,
        bonus: EVENT_HAND_ZONE,
        text: `У ${who}ей зона 10 досок — каждый ${who}а получает +${EVENT_HAND_ZONE}`,
      })
    }
  }

  // Клубных — столько, чтобы добрать до случайной цели 3..7, но минимум одно.
  const target = EVENTS_MIN + Math.floor(rng() * (EVENTS_MAX - EVENTS_MIN + 1))
  const clubCount = Math.max(1, target - events.length)
  const pool = shuffle(
    [...new Set(clubs.filter((c) => c && c !== '—'))],
    rng,
  ).slice(0, clubCount)
  const clubEvents: MatchEvent[] = pool.map((club) => ({
    kind: 'club',
    club,
    bonus: EVENT_CLUB_BONUS,
    text: `Клуб «${club}» разобрался с программой масла — все игроки клуба получают +${EVENT_CLUB_BONUS}`,
  }))

  return [...clubEvents, ...events]
}

/** Суммарный событийный бонус игрока. */
export function eventBonusFor(events: MatchEvent[], p: { club: string; hand: string }): number {
  let sum = 0
  for (const e of events) {
    if (e.kind === 'all') sum += e.bonus
    else if (e.kind === 'hand' && p.hand === e.hand) sum += e.bonus
    else if (e.kind === 'club' && p.club === e.club) sum += e.bonus
  }
  return sum
}
