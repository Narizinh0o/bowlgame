import { CLUB_BONUS, displayRating, leftyBonuses, poolRating, teamHcp, type Picked, type PoolSlot } from '../engine'
import { EZ_BADGE, RARITY_CARD, RARITY_LABEL, RARITY_TEXT, capName, genderSymbol, shortName } from './ui'

interface Props {
  pool: PoolSlot[]
  names: [string, string]
  tags: [string, string] // короткие метки на занятых карточках
  turn: 0 | 1
  first: 0 | 1
  aiTurn: boolean // ход компьютера — клики заблокированы
  onPick: (i: number) => void
}

function clubCounts(picks: Picked[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of picks) {
    if (p.player.club !== '—') m.set(p.player.club, (m.get(p.player.club) ?? 0) + 1)
  }
  return m
}

function TeamPanel({ label, picks, active }: { label: string; picks: Picked[]; active: boolean }) {
  const syn = [...clubCounts(picks).entries()].filter(([, n]) => n >= 2)
  const lefty = leftyBonuses(picks.map((p) => p.player))
  const lefties = picks.filter((p) => p.player.hand === 'L').length
  return (
    <div className={`rounded-lg border p-2 ${active ? 'border-amber-400/70 bg-slate-900' : 'border-slate-700 bg-slate-900/50'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${active ? 'text-amber-400' : 'text-slate-300'}`}>{label}</span>
        <span className="text-xs text-slate-500">
          {teamHcp(picks.map((p) => p.player)) > 0 && (
            <span className="mr-2 text-slate-400">♀ +{teamHcp(picks.map((p) => p.player))}</span>
          )}
          {picks.length}/5
        </span>
      </div>
      <div className="mt-1 flex min-h-[1.6rem] flex-wrap gap-1">
        {picks.map((p, i) => (
          <span key={p.player.id} className={`rounded border px-1.5 py-0.5 text-xs ${RARITY_CARD[p.rarity]}`}>
            {shortName(p.player.name)} <b className="tabular-nums">{displayRating(p) + lefty[i]}</b>
            {p.player.hand === 'L' && <span className={`ml-0.5 ${EZ_BADGE}`}>EZ</span>}
          </span>
        ))}
      </div>
      {(syn.length > 0 || lefties > 0) && (
        <div className="mt-1 text-[11px]">
          {syn.map(([club, n]) => (
            <span key={club} className={`mr-2 ${n >= 3 ? 'text-emerald-400' : 'text-slate-400'}`}>
              {club} ×{n}
              {n >= 3 ? ` (+${CLUB_BONUS[n]} каждому)` : ''}
            </span>
          ))}
          {lefties > 0 && (
            <span className={lefty.find((b) => b !== 0)! > 0 ? 'text-red-400' : 'text-slate-400'}>
              EZ ×{lefties} ({lefty.find((b) => b !== 0)! > 0 ? '+' : ''}
              {lefty.find((b) => b !== 0)} каждому левше)
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function DraftScreen({ pool, names, tags, turn, first, aiTurn, onPick }: Props) {
  const picksA = pool.filter((s) => s.pickedBy === 0)
  const picksB = pool.filter((s) => s.pickedBy === 1)
  const done = picksA.length + picksB.length
  const turnClubs = clubCounts(turn === 0 ? picksA : picksB)

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="text-lg font-bold">
          Пик {Math.min(done + 1, 10)}/10 · выбирает:{' '}
          <span className="text-amber-400">{names[turn]}</span>
          {aiTurn && <span className="ml-2 animate-pulse text-sm text-slate-400">думает…</span>}
        </h2>
        <span className="text-xs text-slate-500">монетка: первым пикает {names[first]}</span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <TeamPanel label={names[0]} picks={picksA} active={turn === 0} />
        <TeamPanel label={names[1]} picks={picksB} active={turn === 1} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {pool.map((s, i) => {
          const picked = s.pickedBy !== null
          const synergy = !picked && (turnClubs.get(s.player.club) ?? 0) >= 2
          return (
            <button
              key={s.player.id}
              onClick={() => onPick(i)}
              disabled={picked || aiTurn}
              className={`pool-card relative rounded-lg border p-2 text-left transition ${RARITY_CARD[s.rarity]} ${
                picked ? 'opacity-30' : aiTurn ? '' : 'hover:border-amber-400/70'
              } ${synergy ? 'ring-1 ring-emerald-400/70' : ''}`}
            >
              <div className="min-h-[2rem] text-xs font-semibold leading-tight">{capName(s.player.name)}</div>
              <div className="mt-0.5 truncate text-[10px] text-slate-400">{s.player.club}</div>
              <div className="mt-1 flex items-end justify-between">
                <span className="text-[10px] text-slate-500">
                  {genderSymbol(s.player)}
                  {s.player.hand === 'L' && <span className={`ml-1 ${EZ_BADGE}`}>EZ</span>}
                </span>
                <span className="text-lg font-extrabold tabular-nums">{poolRating(s)}</span>
              </div>
              <div className="flex min-h-[0.9rem] items-center justify-between">
                <span className={`text-[10px] font-bold ${RARITY_TEXT[s.rarity]}`}>{RARITY_LABEL[s.rarity]}</span>
                {synergy && <span className="text-[10px] text-emerald-400">синергия!</span>}
              </div>
              {picked && (
                <span className="absolute right-1 top-1 rounded bg-slate-800 px-1 text-[10px] text-slate-300">
                  {tags[s.pickedBy!]}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
