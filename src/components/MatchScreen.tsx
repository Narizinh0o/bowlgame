import type { BakerGame, MatchPlayer, MatchResult, ThrowEvent } from '../engine'
import { capName, shortName } from './ui'

/** Текстовый показ матча (этап 3). Покадровый авто-плей и анимация — этапы 4-5. */

const KIND_RU: Record<string, string> = {
  single: 'одна кегля',
  multi: 'мультипин',
  split: 'СПЛИТ',
  washout: 'вошаут',
  gutter: 'ЖЕЛОБ — стоят все 10',
  wild: 'дикий лив',
}

function throwText(e: ThrowEvent): string {
  if (e.pinsBefore.length === 10) {
    if (e.isStrike) return 'СТРАЙК!'
    return `сбито ${e.pinsDown}, ${KIND_RU[e.leaveKind ?? '']}: ${e.leaveAfter.join('-') || '—'}`
  }
  if (e.isSpare) return `добил ${e.pinsBefore.join('-')} — спэр!`
  return e.pinsDown === 0 ? `промах по ${e.pinsBefore.join('-')}` : `сбил только ${e.pinsDown}`
}

/** Символы бросков фрейма: X / – и цифры, с учётом «свежих» расстановок 10-го фрейма. */
function frameSymbols(throws: number[], isTenth: boolean): string[] {
  return throws.map((t, j) => {
    const digit = t === 0 ? '–' : String(t)
    if (j === 0) return t === 10 ? 'X' : digit
    const prev = throws[j - 1]
    const fresh = isTenth && (prev === 10 || (j === 2 && throws[0] !== 10 && throws[0] + throws[1] === 10))
    if (fresh) return t === 10 ? 'X' : digit
    return prev + t === 10 ? '/' : digit
  })
}

function FrameCell({ game, i }: { game: BakerGame; i: number }) {
  const f = game.frames[i]
  return (
    <div className="flex min-w-[2.5rem] flex-col items-center border-r border-slate-700 last:border-r-0">
      <div className="h-4 text-xs text-slate-400">{frameSymbols(f.throws, i === 9).join(' ')}</div>
      <div className="font-semibold tabular-nums">{f.cumulative ?? ''}</div>
    </div>
  )
}

function TeamBoard({ name, game, lineup, won }: { name: string; game: BakerGame; lineup: MatchPlayer[]; won: boolean }) {
  return (
    <div className={`rounded-lg bg-slate-900 p-3 ${won ? 'ring-1 ring-amber-400/60' : ''}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-bold text-amber-400">
          {name}
          {won && ' 🏆'}
        </span>
        <span className="text-2xl font-extrabold tabular-nums">{game.total}</span>
      </div>
      <div className="flex overflow-x-auto rounded border border-slate-700 bg-slate-800/50 p-1">
        {game.frames.map((_, i) => (
          <FrameCell key={i} game={game} i={i} />
        ))}
      </div>
      <div className="mt-2 text-xs text-slate-400">
        {lineup.map((p, i) => (
          <span key={p.id} className="mr-3 whitespace-nowrap">
            {i + 1}. {shortName(p.name)} ({p.effRating}
            {p.clubBonus > 0 ? ` · клуб +${p.clubBonus}` : ''})
          </span>
        ))}
      </div>
    </div>
  )
}

interface Props {
  names: [string, string]
  lineups: [MatchPlayer[], MatchPlayer[]]
  result: MatchResult
  onNewDraft: () => void
  onMenu: () => void
}

export default function MatchScreen({ names, lineups, result, onNewDraft, onMenu }: Props) {
  return (
    <div className="space-y-3">
      <TeamBoard name={names[0]} game={result.gameA} lineup={lineups[0]} won={result.winner === 0} />
      <TeamBoard name={names[1]} game={result.gameB} lineup={lineups[1]} won={result.winner === 1} />

      <div className="text-lg font-bold">
        Победитель: <span className="text-amber-400">{names[result.winner]}</span>
        {result.extra.length > 0 && (
          <span className="ml-2 text-sm font-normal text-slate-400">
            (ничья {result.gameA.total}:{result.gameB.total} — решил sudden death, доп. фреймов: {result.extra.length})
          </span>
        )}
      </div>

      <details className="rounded-lg bg-slate-900 p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-slate-300">Лог бросков</summary>
        <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
          {([0, 1] as const).map((t) => {
            const game = t === 0 ? result.gameA : result.gameB
            return (
              <div key={t}>
                <div className="mb-1 font-semibold text-amber-400">{names[t]}</div>
                {game.events.map((e, i) => {
                  const pl = lineups[t].find((p) => p.id === e.playerId)
                  return (
                    <div key={i} className="text-slate-400">
                      <span className="text-slate-500">Ф{e.frame}</span> {pl ? capName(pl.name).split(' ')[0] : ''}:{' '}
                      {throwText(e)}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </details>

      <div className="flex gap-2">
        <button
          onClick={onNewDraft}
          className="flex-1 rounded-xl bg-amber-500 px-4 py-3 font-bold text-slate-950 transition hover:bg-amber-400"
        >
          Новый драфт
        </button>
        <button
          onClick={onMenu}
          className="flex-1 rounded-xl bg-slate-800 px-4 py-3 font-bold text-slate-100 transition hover:bg-slate-700"
        >
          В меню
        </button>
      </div>
    </div>
  )
}
