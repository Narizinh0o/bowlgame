import { useState } from 'react'
import {
  clubBonuses,
  displayRating,
  eventBonusFor,
  eventBonusList,
  leftyBonuses,
  teamHcp,
  type MatchEvent,
  type Picked,
} from '../engine'
import Breakdown, { hasBreakdown } from './Breakdown'
import { EZ_BADGE, RARITY_CARD, RARITY_LABEL, RARITY_TEXT, capName, genderSymbol } from './ui'

interface Props {
  title: string
  picks: Picked[]
  events: MatchEvent[]
  doneLabel: string
  onDone: (order: Picked[]) => void
}

export default function ArrangeScreen({ title, picks, events, doneLabel, onDone }: Props) {
  const [order, setOrder] = useState<Picked[]>(picks)
  const [sel, setSel] = useState<number | null>(null)

  const bonuses = clubBonuses(order.map((p) => p.player))
  const lefty = leftyBonuses(order.map((p) => p.player))
  const lefties = order.filter((p) => p.player.hand === 'L').length
  const synergyClubs = new Map<string, number>()
  for (const p of order) {
    if (p.player.club !== '—') synergyClubs.set(p.player.club, (synergyClubs.get(p.player.club) ?? 0) + 1)
  }
  const syn = [...synergyClubs.entries()].filter(([, n]) => n >= 3)

  const tap = (i: number) => {
    if (sel === null) {
      setSel(i)
    } else if (sel === i) {
      setSel(null)
    } else {
      const next = [...order]
      ;[next[sel], next[i]] = [next[i], next[sel]]
      setOrder(next)
      setSel(null)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">
        Нажми двух игроков, чтобы поменять их местами. Слот 5 кидает 10-й фрейм — туда обычно ставят сильнейшего.
      </p>
      {syn.length > 0 && (
        <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-2 text-sm text-emerald-300">
          Клубная синергия:{' '}
          {syn.map(([club, n]) => `${club} ×${n}`).join(', ')} — бонус уже включён в рейтинг ниже.
        </div>
      )}
      {teamHcp(order.map((p) => p.player)) > 0 && (
        <div className="mt-2 rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-slate-300">
          Гандикап за девушек: <b className="text-slate-100">+{teamHcp(order.map((p) => p.player))}</b> к итогу игры
        </div>
      )}
      {lefties > 0 && (
        <div className="mt-2 rounded-lg border border-red-500/30 bg-slate-900 p-2 text-sm text-slate-300">
          <span className={EZ_BADGE}>EZ</span> Левши ×{lefties}:{' '}
          <b className={lefty.find((b) => b !== 0)! >= 0 ? 'text-red-300' : 'text-slate-400'}>
            {lefty.find((b) => b !== 0)! > 0 ? '+' : ''}
            {lefty.find((b) => b !== 0)}
          </b>{' '}
          к рейтингу каждому левше
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {order.map((p, i) => (
          <button
            key={p.player.id}
            onClick={() => tap(i)}
            className={`arr-slot flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${RARITY_CARD[p.rarity]} ${
              sel === i ? 'ring-2 ring-amber-400' : 'hover:border-amber-400/60'
            }`}
          >
            <div className="w-16 shrink-0 text-center">
              <div className="text-xl font-extrabold text-amber-400">{i + 1}</div>
              <div className="text-[9px] leading-tight text-slate-500">
                фреймы
                <br />
                {i + 1} и {i + 6}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{capName(p.player.name)}</div>
              <div className="truncate text-xs text-slate-400">
                {p.player.club}
                {genderSymbol(p.player) && ` · ${genderSymbol(p.player)}`}
                {p.player.hand === 'L' && (
                  <>
                    {' '}
                    <span className={EZ_BADGE}>EZ</span>
                  </>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-lg font-extrabold leading-none tabular-nums">
                {displayRating(p) + bonuses[i] + lefty[i] + eventBonusFor(events, p.player)}
              </div>
              {hasBreakdown(p.rarity, lefty[i], bonuses[i], eventBonusList(events, p.player)) && (
                <div className="text-[9px] leading-tight">
                  <Breakdown
                    base={p.player.baseRating}
                    rarity={p.rarity}
                    ez={lefty[i]}
                    club={bonuses[i]}
                    eventsList={eventBonusList(events, p.player)}
                  />
                </div>
              )}
              {p.rarity !== 'common' && (
                <div className={`text-[10px] font-bold ${RARITY_TEXT[p.rarity]}`}>{RARITY_LABEL[p.rarity]}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => onDone(order)}
        className="arrange-done mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-lg font-bold text-slate-950 transition hover:bg-amber-400"
      >
        {doneLabel}
      </button>
    </div>
  )
}
