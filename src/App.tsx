import { useEffect, useState } from 'react'
import {
  buildLineup,
  buildRatedRoster,
  mulberry32,
  playMatch,
  randomSeed,
  type BakerGame,
  type MatchPlayer,
  type MatchResult,
  type RatedRoster,
  type ThrowEvent,
} from './engine'

/**
 * ВРЕМЕННОЕ демо этапа 2 (GAME_PLAN.md): две случайные пятёрки, текстовый матч.
 * Настоящий UI (драфт, расстановка, анимация) — этапы 3-5.
 */

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
    <div className="flex flex-col items-center border-r border-slate-700 last:border-r-0 min-w-[2.5rem]">
      <div className="text-xs text-slate-400 h-4">{frameSymbols(f.throws, i === 9).join(' ')}</div>
      <div className="font-semibold tabular-nums">{f.cumulative ?? ''}</div>
    </div>
  )
}

function TeamBoard({ name, game, lineup }: { name: string; game: BakerGame; lineup: MatchPlayer[] }) {
  return (
    <div className="rounded-lg bg-slate-900 p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-bold text-amber-400">{name}</span>
        <span className="text-2xl font-extrabold tabular-nums">{game.total}</span>
      </div>
      <div className="flex overflow-x-auto rounded border border-slate-700 bg-slate-800/50 p-1">
        {game.frames.map((_, i) => (
          <FrameCell key={i} game={game} i={i} />
        ))}
      </div>
      <div className="mt-2 text-xs text-slate-400">
        {lineup.map((p, i) => (
          <span key={p.id} className="mr-3">
            {i + 1}. {p.name} ({p.effRating}{p.clubBonus > 0 ? ` · клуб +${p.clubBonus}` : ''})
          </span>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const [rated, setRated] = useState<RatedRoster | null>(null)
  const [match, setMatch] = useState<{ result: MatchResult; a: MatchPlayer[]; b: MatchPlayer[] } | null>(null)

  useEffect(() => {
    fetch('/data/roster.json')
      .then((r) => r.json())
      .then((roster) => setRated(buildRatedRoster(roster)))
  }, [])

  const play = () => {
    if (!rated) return
    const rng = mulberry32(randomSeed())
    const shuffled = [...rated.players].sort(() => rng() - 0.5)
    const a = buildLineup(shuffled.slice(0, 5).map((player) => ({ player, rarity: 'common' as const })), rated.r80)
    const b = buildLineup(shuffled.slice(5, 10).map((player) => ({ player, rarity: 'common' as const })), rated.r80)
    setMatch({ result: playMatch(a, b, rng), a, b })
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-extrabold text-amber-400">КЛБ Боулинг-Батл</h1>
      <p className="mt-1 text-sm text-slate-400">
        Демо движка (этап 2): две случайные пятёрки из {rated ? rated.players.length : '…'} реальных игроков КЛБ,
        одна игра по Бейкеру. Драфт и анимация — следующие этапы.
      </p>
      <button
        onClick={play}
        disabled={!rated}
        className="mt-3 rounded-lg bg-amber-500 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
      >
        Случайный матч
      </button>

      {match && (
        <div className="mt-4 space-y-3">
          <TeamBoard name="Команда А" game={match.result.gameA} lineup={match.a} />
          <TeamBoard name="Команда Б" game={match.result.gameB} lineup={match.b} />
          <div className="font-bold">
            Победитель: <span className="text-amber-400">{match.result.winner === 0 ? 'Команда А' : 'Команда Б'}</span>
            {match.result.extra.length > 0 && ' (в sudden death!)'}
          </div>
          <details className="rounded-lg bg-slate-900 p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-300">Лог бросков</summary>
            <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
              {(['gameA', 'gameB'] as const).map((g) => (
                <div key={g}>
                  <div className="mb-1 font-semibold text-amber-400">{g === 'gameA' ? 'Команда А' : 'Команда Б'}</div>
                  {match.result[g].events.map((e, i) => {
                    const pl = (g === 'gameA' ? match.a : match.b).find((p) => p.id === e.playerId)
                    return (
                      <div key={i} className="text-slate-400">
                        <span className="text-slate-500">Ф{e.frame}</span> {pl?.name.split(' ')[0]}: {throwText(e)}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
