import { useEffect, useMemo, useState } from 'react'
import {
  mulberry32,
  randomSeed,
  reactionFor,
  scoreGame,
  type FrameScore,
  type MatchPlayer,
  type MatchResult,
  type Reaction,
  type ThrowEvent,
} from '../engine'
import PinDeck from './PinDeck'
import { capName, shortName } from './ui'

/** Покадровый «авто-бой» (этап 4): команды бросают по очереди, табло заполняется на глазах,
 *  игрок реагирует на свой бросок. Анимация дорожки — этап 5. */

const KIND_RU: Record<string, string> = {
  single: 'одна кегля',
  multi: 'мультипин',
  split: 'СПЛИТ',
  washout: 'вошаут',
  gutter: 'ЖЕЛОБ — стоят все 10',
  wild: 'дикий лив',
}

const REACTION_EMOJI: Record<Reaction, string> = {
  huge_joy: '🤩',
  joy: '😄',
  cocky: '😎',
  neutral: '',
  sad: '😟',
  huge_sad: '😱',
  stone_face: '🗿',
}

const REACTION_PHRASES: Record<Reaction, string[]> = {
  huge_joy: ['прыгает от счастья!', 'танцует на подходе!', 'кулаки в небо!', 'обнимает всю команду!'],
  joy: ['доволен!', 'есть!', 'кивает с улыбкой'],
  cocky: ['как и планировал', 'даже не смотрит на кегли', 'поправляет воротник'],
  neutral: [''],
  sad: ['вздыхает', 'качает головой', 'разводит руками'],
  huge_sad: ['хватается за голову!', 'падает на колени!', 'не верит своим глазам!'],
  stone_face: ['каменное лицо', 'ноль эмоций', '…'],
}

function throwText(e: ThrowEvent): string {
  if (e.pinsBefore.length === 10) {
    if (e.isStrike) return 'СТРАЙК!'
    return `сбито ${e.pinsDown} — ${KIND_RU[e.leaveKind ?? '']}: ${e.leaveAfter.join('-') || '—'}`
  }
  if (e.isSpare) return `добил ${e.pinsBefore.join('-')} — спэр!`
  return e.pinsDown === 0 ? `промах по ${e.pinsBefore.join('-')}` : `сбил только ${e.pinsDown}`
}

function throwTextClass(e: ThrowEvent): string {
  if (e.isStrike || e.isSpare) return 'text-amber-400 font-bold'
  if (e.leaveKind && ['split', 'washout', 'gutter', 'wild'].includes(e.leaveKind) && e.pinsBefore.length === 10)
    return 'text-red-400 font-semibold'
  return 'text-slate-300'
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

/** Завершён ли фрейм по сыгранным броскам. */
function frameDone(throws: number[], isTenth: boolean): boolean {
  if (!isTenth) return throws[0] === 10 || throws.length >= 2
  const bonus = throws[0] === 10 || (throws.length >= 2 && throws[0] + throws[1] === 10)
  return throws.length >= (bonus ? 3 : 2)
}

/** Частичное табло по показанным событиям: несыгранные фреймы — null. */
function partialFrames(shownEvents: ThrowEvent[]): { frames: (FrameScore | null)[]; total: number } {
  const byFrame: number[][] = []
  for (const e of shownEvents) {
    const i = e.frame - 1
    byFrame[i] = byFrame[i] ?? []
    byFrame[i].push(e.pinsDown)
  }
  const played = byFrame.filter((f) => f !== undefined)
  const { frames } = scoreGame(played)
  if (frames.length > 0 && !frameDone(frames[frames.length - 1].throws, frames.length === 10)) {
    frames[frames.length - 1] = { ...frames[frames.length - 1], cumulative: null }
  }
  let total = 0
  for (const f of frames) if (f.cumulative !== null) total = f.cumulative
  const out: (FrameScore | null)[] = Array(10).fill(null)
  frames.forEach((f, i) => (out[i] = f))
  return { frames: out, total }
}

function FrameCell({ frame, isTenth, active }: { frame: FrameScore | null; isTenth: boolean; active: boolean }) {
  return (
    <div
      className={`flex min-w-[2.5rem] flex-1 flex-col items-center border-r border-slate-700 last:border-r-0 ${
        active ? 'bg-amber-500/10' : ''
      }`}
    >
      <div className="h-4 text-xs text-slate-400">{frame ? frameSymbols(frame.throws, isTenth).join(' ') : ''}</div>
      <div className="h-6 font-semibold tabular-nums">{frame?.cumulative ?? ''}</div>
    </div>
  )
}

function TeamBoard({
  name,
  frames,
  total,
  lineup,
  active,
  activeFrame,
  won,
}: {
  name: string
  frames: (FrameScore | null)[]
  total: number
  lineup: MatchPlayer[]
  active: boolean
  activeFrame: number | null
  won: boolean
}) {
  return (
    <div className={`rounded-lg bg-slate-900 p-3 ${won ? 'ring-1 ring-amber-400/70' : active ? 'ring-1 ring-slate-500/60' : ''}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className={`font-bold ${active || won ? 'text-amber-400' : 'text-slate-300'}`}>
          {name}
          {won && ' 🏆'}
        </span>
        <span className="text-2xl font-extrabold tabular-nums">{total}</span>
      </div>
      <div className="flex overflow-x-auto rounded border border-slate-700 bg-slate-800/50 p-1">
        {frames.map((f, i) => (
          <FrameCell key={i} frame={f} isTenth={i === 9} active={activeFrame === i + 1} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
        {lineup.map((p, i) => (
          <span key={p.id}>
            {i + 1}. {shortName(p.name)} ({p.effRating}
            {p.clubBonus > 0 ? ` · клуб +${p.clubBonus}` : ''})
          </span>
        ))}
      </div>
    </div>
  )
}

interface Step {
  team: 0 | 1
  ev: ThrowEvent
  reaction: Reaction
  isExtra: boolean
}

interface Props {
  names: [string, string]
  lineups: [MatchPlayer[], MatchPlayer[]]
  result: MatchResult
  onNewDraft: () => void
  onMenu: () => void
}

export default function MatchScreen({ names, lineups, result, onNewDraft, onMenu }: Props) {
  // Порядок показа: фрейм 1 команды А, фрейм 1 команды Б, фрейм 2 А... затем sudden death.
  const steps = useMemo<Step[]>(() => {
    const rng = mulberry32(randomSeed())
    const list: Step[] = []
    for (let f = 1; f <= 10; f++) {
      for (const team of [0, 1] as const) {
        const game = team === 0 ? result.gameA : result.gameB
        for (const ev of game.events.filter((e) => e.frame === f)) {
          list.push({ team, ev, reaction: reactionFor(ev, rng), isExtra: false })
        }
      }
    }
    for (const ex of result.extra) {
      for (const ev of ex.a.events) list.push({ team: 0, ev, reaction: reactionFor(ev, rng), isExtra: true })
      for (const ev of ex.b.events) list.push({ team: 1, ev, reaction: reactionFor(ev, rng), isExtra: true })
    }
    return list
  }, [result])

  const [shown, setShown] = useState(1) // сколько шагов уже видно
  const [speed, setSpeed] = useState<1 | 2>(1)
  const done = shown >= steps.length
  const cur = steps[Math.min(shown, steps.length) - 1]

  useEffect(() => {
    if (done) return
    const r = cur.reaction
    let delay = 1900
    if (cur.ev.isStrike || cur.ev.isSpare) delay += 200
    if (r === 'huge_joy' || r === 'huge_sad' || r === 'stone_face') delay += 400
    const t = setTimeout(() => setShown((s) => s + 1), delay / speed)
    return () => clearTimeout(t)
  }, [shown, done, speed, cur])

  const shownSteps = steps.slice(0, shown)
  const boards = ([0, 1] as const).map((team) =>
    partialFrames(shownSteps.filter((s) => s.team === team && !s.isExtra).map((s) => s.ev)),
  )

  const player = lineups[cur.team].find((p) => p.id === cur.ev.playerId)
  const phrase =
    REACTION_PHRASES[cur.reaction][(shown - 1) % REACTION_PHRASES[cur.reaction].length]
  const finalTotals: [number, number] = [result.gameA.total, result.gameB.total]

  return (
    <div className="space-y-3">
      {([0, 1] as const).map((team) => (
        <TeamBoard
          key={team}
          name={names[team]}
          frames={boards[team].frames}
          total={done ? finalTotals[team] : boards[team].total}
          lineup={lineups[team]}
          active={!done && cur.team === team}
          activeFrame={!done && cur.team === team && !cur.isExtra ? cur.ev.frame : null}
          won={done && result.winner === team}
        />
      ))}

      {!done && (
        <>
          <div className="flex min-h-[7rem] items-center gap-3 rounded-lg bg-slate-900 p-3">
            <PinDeck before={cur.ev.pinsBefore} after={cur.ev.leaveAfter} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-500">
                Фрейм {cur.ev.frame}
                {cur.isExtra && ' · SUDDEN DEATH'} · {names[cur.team]}
              </div>
              <div className="truncate font-bold">{player ? capName(player.name) : ''}</div>
              <div className={`text-sm ${throwTextClass(cur.ev)}`}>{throwText(cur.ev)}</div>
            </div>
            <div className="ml-auto w-20 shrink-0 text-center">
              {cur.reaction !== 'neutral' && (
                <div
                  key={shown}
                  className={
                    cur.reaction === 'stone_face'
                      ? ''
                      : cur.reaction === 'huge_joy' || cur.reaction === 'huge_sad'
                        ? 'reaction-huge'
                        : 'reaction-pop'
                  }
                >
                  <div className={cur.reaction === 'huge_joy' || cur.reaction === 'huge_sad' ? 'text-4xl' : 'text-3xl'}>
                    {REACTION_EMOJI[cur.reaction]}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-tight text-slate-400">{phrase}</div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Скорость:</span>
            {([1, 2] as const).map((sp) => (
              <button
                key={sp}
                onClick={() => setSpeed(sp)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  speed === sp ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ×{sp}
              </button>
            ))}
            <button
              onClick={() => setShown(steps.length)}
              className="skip-btn ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
            >
              Пропустить ⏭
            </button>
          </div>
        </>
      )}

      {done && (
        <>
          <div className="rounded-lg bg-slate-900 p-4 text-center">
            <div className="text-xl font-extrabold">
              🏆 Победил <span className="text-amber-400">{names[result.winner]}</span>{' '}
              <span className="tabular-nums">
                {finalTotals[0]}:{finalTotals[1]}
              </span>
            </div>
            {result.extra.length > 0 && (
              <div className="mt-1 text-sm text-slate-400">
                Ничья в основное время — судьбу решил sudden death (
                {result.extra.map((ex) => `${ex.a.pins}:${ex.b.pins}`).join(', ')})
              </div>
            )}
          </div>

          <details className="rounded-lg bg-slate-900 p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-300">Лог бросков</summary>
            <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
              {([0, 1] as const).map((team) => {
                const game = team === 0 ? result.gameA : result.gameB
                return (
                  <div key={team}>
                    <div className="mb-1 font-semibold text-amber-400">{names[team]}</div>
                    {game.events.map((e, i) => {
                      const pl = lineups[team].find((p) => p.id === e.playerId)
                      return (
                        <div key={i} className="text-slate-400">
                          <span className="text-slate-500">Ф{e.frame}</span> {pl ? shortName(pl.name) : ''}:{' '}
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
        </>
      )}
    </div>
  )
}
