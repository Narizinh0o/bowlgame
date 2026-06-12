import {
  CLUB_EVENTS_WEIGHTS,
  EVENT_ALL_DELTA,
  EVENT_CLUB_BONUS,
  EVENT_HAND_EDGE,
  EVENT_HAND_EDGE_P,
  EVENT_HAND_ZONE,
  EVENT_HAND_ZONE_P,
  EVENT_HEAT_P,
  EVENT_MACHINE_P,
} from './constants'
import { pickWeighted, shuffle, type Rng } from './rng'

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

  // Клубные события — всегда; сколько клубов «разобралось с маслом» — рандом по весам.
  const clubCount = pickWeighted([1, 2, 3, 4], (n) => CLUB_EVENTS_WEIGHTS[n - 1], rng)
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

/** Список событийных вкладов игрока (каждое сработавшее событие — отдельным числом). */
export function eventBonusList(events: MatchEvent[], p: { club: string; hand: string }): number[] {
  const out: number[] = []
  for (const e of events) {
    if (e.kind === 'all') out.push(e.bonus)
    else if (e.kind === 'hand' && p.hand === e.hand) out.push(e.bonus)
    else if (e.kind === 'club' && p.club === e.club) out.push(e.bonus)
  }
  return out
}

/** Суммарный событийный бонус игрока. */
export function eventBonusFor(events: MatchEvent[], p: { club: string; hand: string }): number {
  return eventBonusList(events, p).reduce((s, v) => s + v, 0)
}
