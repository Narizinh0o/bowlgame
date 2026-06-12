import { useEffect, useMemo, useRef, useState } from 'react'
import {
  aiRolloffStart,
  LANE_BONUS_MAX,
  mulberry32,
  pickWeighted,
  playRolloff,
  playTwoGames,
  randomSeed,
  reactionFor,
  scoreGame,
  type BakerGame,
  type FrameScore,
  type MatchPlayer,
  type Reaction,
  type RolloffResult,
  type ThrowEvent,
} from '../engine'
import DualLaneView, { type BenchMood, type Bubble, type LaneHud } from './DualLaneView'
import PinDeck from './PinDeck'
import { capName, shortName } from './ui'

/** Серия «ТВ-финала»: 2 игры со сменой дорожек (№9/№10), очко за игру,
 *  при равенстве — ролл-офф до 3 очков с выбором стартового игрока. */

const KIND_RU: Record<string, string> = {
  single: 'одна кегля',
  multi: 'мультипин',
  split: 'СПЛИТ',
  washout: 'вошаут',
  gutter: 'ЖЕЛОБ — стоят все 10',
  wild: 'дикий лив',
}

/** Фраза реакции: строка или пара [мужской вариант, женский вариант]. */
type PhraseDef = string | [string, string]

const REACTION_PHRASES: Record<Reaction, PhraseDef[]> = {
  huge_joy: ['прыгает от счастья!', 'танцует на подходе!', 'кулаки в небо!', 'обнимает всю команду!'],
  joy: [['доволен!', 'довольна!'], 'есть!', 'кивает с улыбкой'],
  cocky: [
    ['как и планировал', 'как и планировала'],
    'даже не смотрит на кегли',
    ['поправляет воротник', 'поправляет хвостик'],
  ],
  neutral: [''],
  sad: ['вздыхает', 'качает головой', 'разводит руками'],
  huge_sad: ['хватается за голову!', 'падает на колени!', ['не верит своим глазам!', 'не верит своим глазам!']],
  stone_face: ['каменное лицо', 'ноль эмоций', '…'],
}

function phraseFor(reaction: Reaction, idx: number, gender: string): string {
  const defs = REACTION_PHRASES[reaction]
  const def = defs[idx % defs.length]
  return Array.isArray(def) ? def[gender === 'Ж' ? 1 : 0] : def
}

function throwText(e: ThrowEvent): string {
  if (e.pinsBefore.length === 10) {
    if (e.isStrike) return e.brooklyn ? 'СТРАЙК С БРУКЛИНА!' : 'СТРАЙК!'
    const base = `сбито ${e.pinsDown} — ${KIND_RU[e.leaveKind ?? '']}: ${e.leaveAfter.join('-') || '—'}`
    return e.brooklyn ? `бруклин! ${base}` : base
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

function frameDone(throws: number[], isTenth: boolean): boolean {
  if (!isTenth) return throws[0] === 10 || throws.length >= 2
  const bonus = throws[0] === 10 || (throws.length >= 2 && throws[0] + throws[1] === 10)
  return throws.length >= (bonus ? 3 : 2)
}

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
  laneNo,
  frames,
  total,
  hcp,
  lineup,
  active,
  activeFrame,
}: {
  name: string
  laneNo: string
  frames: (FrameScore | null)[]
  total: number
  hcp: number
  lineup: MatchPlayer[]
  active: boolean
  activeFrame: number | null
}) {
  return (
    <div className={`rounded-lg bg-slate-900 p-3 ${active ? 'ring-1 ring-slate-500/60' : ''}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className={`font-bold ${active ? 'text-amber-400' : 'text-slate-300'}`}>
          {name}
          <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-xs font-semibold text-slate-400">
            дор. {laneNo}
          </span>
          {hcp > 0 && (
            <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs font-semibold text-slate-300">
              ♀ +{hcp}
            </span>
          )}
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
            {p.clubBonus > 0 ? ` · клуб +${p.clubBonus}` : ''}
            {p.leftyBonus !== 0 ? ` · EZ ${p.leftyBonus > 0 ? '+' : ''}${p.leftyBonus}` : ''})
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
  lane: 0 | 1
  benchMood: BenchMood
  rolloff: boolean
  shout: boolean // команда кричит «ДАЙ БРУКЛИН!!!» пока шар летит
  ours: boolean // страйк с бруклина игроком Brooklyn Bowl: «БРУКЛИН НАШ!»
  flightBubble: Bubble | null // комикс-облако во время полёта шара
  resultBubbles: Bubble[] // облака после удара (макс. 2: своё и вражеское)
}

/** Выкрики в облачках. */
const SHOUTS_HUGE_JOY = ['ДА-А-А!', 'ЕЕЕСТЬ!', 'ВОТ ЭТО ДА!']
const SHOUTS_HUGE_SAD = ['НЕТ-НЕТ-НЕТ!', 'ДА КАК ТАК?!', 'НУ ЗА ЧТО?!']
const SHOUTS_COCKY: [string, string][] = [
  ['как и планировал', 'как и планировала'],
  ['изи', 'изи'],
]
const SHOUTS_CURSE = ['Б***!', 'ДА НУ ***!', 'Ё-МОЁ!', 'ДА БЛИН!']
const SHOUTS_BENCH_STRIKE = ['ЛЕГЕНДА!', 'КРАСАВА!', 'МОЩЬ!', 'ВОТ ТАК НАДО!']
const SHOUTS_BENCH_SINGLE = ['ЛЕГЕНДА!', 'СНАЙПЕР!', 'НУ КРАСИВО ЖЕ!']
const SHOUTS_OPP_EYEROLL = ['🙄 как обычно', '🙄 ну конечно']

const pickOf = <T,>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)]

/** Едкое замечание скамейки соперников (редкое, по контексту провала). */
function snideFor(ev: ThrowEvent, rng: () => number): string | null {
  const full = ev.pinsBefore.length === 10
  if (!full && !ev.isSpare && ev.pinsBefore.length === 1) {
    return pickOf(['🙄 даже я бы добил', 'одну кеглю... 😏'], rng)
  }
  if (full && ev.pinsDown === 0 && ev.leaveAfter.length === 10) return 'это что сейчас было? 😏'
  if (full && !ev.isStrike && ev.leaveKind === 'split') return 'классика 😏'
  if (!full && !ev.isSpare) return 'ну-ну 😏'
  return null
}

/** Дорожка команды в игре: игра 1 — А на левой (№9), игра 2 и ролл-офф — наоборот. */
const laneOf = (team: 0 | 1, gi: 0 | 1): 0 | 1 => (gi === 0 ? team : ((1 - team) as 0 | 1))

function gameMood(ev: ThrowEvent): BenchMood {
  if (ev.isStrike) return 'huge_joy'
  if (ev.isSpare) {
    const hard = ev.leaveKind && ['split', 'washout', 'wild', 'gutter'].includes(ev.leaveKind)
    return hard ? 'huge_joy' : 'joy'
  }
  if (ev.pinsBefore.length === 10) {
    if (ev.leaveKind === 'gutter') return 'huge_sad'
    if (ev.leaveKind && ['split', 'washout', 'wild'].includes(ev.leaveKind)) return 'sad'
    return 'idle'
  }
  if (ev.pinsDown === 0 && ev.pinsBefore.length >= 3) return 'huge_sad'
  const hard = ev.leaveKind && ['split', 'washout', 'wild', 'gutter'].includes(ev.leaveKind)
  return hard ? 'idle' : 'sad'
}

function rolloffReaction(pins: number, rng: () => number): Reaction {
  const table: [Reaction, number][] =
    pins === 10
      ? [
          ['huge_joy', 60],
          ['cocky', 25],
          ['joy', 15],
        ]
      : pins === 9
        ? [
            ['joy', 60],
            ['huge_joy', 20],
            ['neutral', 20],
          ]
        : pins >= 8
          ? [
              ['neutral', 55],
              ['sad', 30],
              ['stone_face', 15],
            ]
          : pins >= 6
            ? [
                ['sad', 45],
                ['huge_sad', 30],
                ['stone_face', 25],
              ]
            : [
                ['huge_sad', 50],
                ['stone_face', 30],
                ['sad', 20],
              ]
  return pickWeighted(table, (x) => x[1], rng)[0]
}

type Stage = { k: 'play'; gi: 0 | 1 } | { k: 'between' } | { k: 'pick'; who: 0 | 1 } | { k: 'rolloff' } | { k: 'done' }

interface Props {
  names: [string, string]
  lineups: [MatchPlayer[], MatchPlayer[]]
  mode: 'ai' | 'hotseat'
  onNewDraft: () => void
  onMenu: () => void
}

export default function MatchScreen({ names, lineups, mode, onNewDraft, onMenu }: Props) {
  const rngRef = useRef(mulberry32(randomSeed()))

  // Случайный рейтинг дорожек на матч + сама серия (бонусы применяются по играм).
  const { laneBonus, two } = useMemo(() => {
    const rng = rngRef.current
    const lb: [number, number] = [
      Math.round((rng() * 2 - 1) * LANE_BONUS_MAX),
      Math.round((rng() * 2 - 1) * LANE_BONUS_MAX),
    ]
    return { laneBonus: lb, two: playTwoGames(lineups[0], lineups[1], lb, rng) }
  }, [lineups])

  const laneLabels = useMemo<[string, string]>(() => {
    const lab = (v: number) => (v > 0 ? 'хорошая дорожка' : v < 0 ? 'плохая дорожка' : 'обычная дорожка')
    const L: [string, string] = [lab(laneBonus[0]), lab(laneBonus[1])]
    if (laneBonus[0] > 0 && laneBonus[1] > 0 && laneBonus[0] !== laneBonus[1]) {
      L[laneBonus[0] > laneBonus[1] ? 0 : 1] = 'эта даже лучше'
    }
    if (laneBonus[0] < 0 && laneBonus[1] < 0 && laneBonus[0] !== laneBonus[1]) {
      L[laneBonus[0] < laneBonus[1] ? 0 : 1] = 'эта даже хуже'
    }
    // Число — чтобы было видно, НАСКОЛЬКО хорошая/плохая.
    return L.map((txt, i) =>
      laneBonus[i] === 0 ? txt : `${txt} ${laneBonus[i] > 0 ? '+' : ''}${laneBonus[i]}`,
    ) as [string, string]
  }, [laneBonus])

  const mkStep = (team: 0 | 1, ev: ThrowEvent, gi: 0 | 1, isRolloff: boolean, rng: () => number): Step => {
    const player = lineups[team].find((p) => p.id === ev.playerId)
    const full = ev.pinsBefore.length === 10
    const reaction = isRolloff ? rolloffReaction(ev.pinsDown, rng) : reactionFor(ev, rng)
    const shout = ev.brooklyn && full && rng() < 0.6
    const ours = ev.brooklyn && ev.isStrike && (player?.club ?? '') === 'brooklyn bowl'
    const female = player?.gender === 'Ж'

    const missedSpare = !full && !ev.isSpare
    const badLeave = full && !ev.isStrike && ['split', 'washout', 'gutter', 'wild'].includes(ev.leaveKind ?? '')
    const singleSpared = !full && ev.isSpare && ev.pinsBefore.length === 1

    // Своя сторона: либо игрок, либо его скамейка (одно облако).
    const resultBubbles: Bubble[] = []
    if (ours) {
      resultBubbles.push({ text: 'БРУКЛИН НАШ!', from: 'bench' })
    } else if (missedSpare && rng() < 0.35) {
      resultBubbles.push({ text: pickOf(SHOUTS_CURSE, rng), from: 'player' })
    } else if (badLeave && rng() < 0.25) {
      resultBubbles.push({ text: pickOf(SHOUTS_CURSE, rng), from: 'player' })
    } else if (reaction === 'huge_joy' && rng() < 0.6) {
      resultBubbles.push({ text: pickOf(SHOUTS_HUGE_JOY, rng), from: 'player' })
    } else if (reaction === 'huge_sad' && rng() < 0.6) {
      resultBubbles.push({ text: pickOf(SHOUTS_HUGE_SAD, rng), from: 'player' })
    } else if (reaction === 'cocky' && rng() < 0.5) {
      resultBubbles.push({ text: pickOf(SHOUTS_COCKY, rng)[female ? 1 : 0], from: 'player' })
    } else if (singleSpared && rng() < 0.3) {
      resultBubbles.push({ text: pickOf(SHOUTS_BENCH_SINGLE, rng), from: 'bench' })
    } else if (ev.isStrike && rng() < 0.3) {
      resultBubbles.push({ text: pickOf(SHOUTS_BENCH_STRIKE, rng), from: 'bench' })
    }

    // Скамейка соперников: закатывает глаза на бруклин-страйк, изредка ехидничает.
    if (ev.brooklyn && ev.isStrike && rng() < 0.5) {
      resultBubbles.push({ text: pickOf(SHOUTS_OPP_EYEROLL, rng), from: 'opp' })
    } else {
      const snide = snideFor(ev, rng)
      if (snide && rng() < 0.07) resultBubbles.push({ text: snide, from: 'opp' })
    }

    return {
      team,
      ev,
      reaction,
      lane: laneOf(team, gi),
      benchMood: isRolloff && ev.pinsDown <= 5 ? 'faint' : gameMood(ev),
      rolloff: isRolloff,
      shout,
      ours,
      flightBubble: shout ? { text: 'ДАЙ БРУКЛИН!!!', from: 'bench' } : null,
      resultBubbles: resultBubbles.slice(0, 2),
    }
  }

  const gameSteps = useMemo<[Step[], Step[]]>(() => {
    const rng = mulberry32(randomSeed())
    const build = (gi: 0 | 1): Step[] => {
      const list: Step[] = []
      // Игру 1 начинает команда 1, игру 2 (после смены дорожек) — команда 2.
      const order = gi === 0 ? ([0, 1] as const) : ([1, 0] as const)
      for (let f = 1; f <= 10; f++) {
        for (const team of order) {
          const game = team === 0 ? two.g[gi].a : two.g[gi].b
          for (const ev of game.events.filter((e) => e.frame === f)) {
            list.push(mkStep(team, ev, gi, false, rng))
          }
        }
      }
      return list
    }
    return [build(0), build(1)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [two])

  const [rolloff, setRolloff] = useState<RolloffResult | null>(null)
  const [startA, setStartA] = useState<number | null>(null)
  const [stage, setStage] = useState<Stage>({ k: 'play', gi: 0 })
  const [shown, setShown] = useState(1)
  const [impacted, setImpacted] = useState(false)
  const [speed, setSpeed] = useState<1 | 2>(1)
  const [paused, setPaused] = useState(false)

  const rolloffSteps = useMemo<Step[]>(() => {
    if (!rolloff) return []
    const rng = mulberry32(randomSeed())
    const list: Step[] = []
    for (const round of rolloff.rounds) {
      // В ролл-оффе очерёдность как в игре 2: начинает команда 2.
      for (const team of [1, 0] as const) {
        const th = team === 0 ? round.a : round.b
        list.push(mkStep(team, th.ev, 1, true, rng))
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolloff])

  const steps = stage.k === 'play' ? gameSteps[stage.gi] : stage.k === 'rolloff' ? rolloffSteps : null
  const playing = steps !== null && steps.length > 0
  const cur = playing ? steps[Math.min(shown, steps.length) - 1] : null

  const advance = () => {
    setShown(1)
    setImpacted(false)
    if (stage.k === 'play' && stage.gi === 0) {
      setStage({ k: 'between' })
    } else if (stage.k === 'play' && stage.gi === 1) {
      setStage(two.tied ? { k: 'pick', who: 0 } : { k: 'done' })
    } else if (stage.k === 'rolloff') {
      setStage({ k: 'done' })
    }
  }

  // Фолбэк: rAF замер в фоновой вкладке — не зависаем.
  useEffect(() => {
    if (!playing || impacted || paused) return
    const t = setTimeout(() => setImpacted(true), 4500 / speed)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, impacted, speed, stage, paused])

  // После показа результата — следующий бросок или следующая фаза.
  useEffect(() => {
    if (!playing || !impacted || !cur || paused) return
    let delay = 1500
    if (cur.reaction === 'huge_joy' || cur.reaction === 'huge_sad' || cur.reaction === 'stone_face') delay += 450
    if (cur.rolloff) delay += 250
    const t = setTimeout(() => {
      if (steps && shown < steps.length) {
        setImpacted(false)
        setShown((s) => s + 1)
      } else {
        advance()
      }
    }, delay / speed)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impacted, speed, shown, stage, paused])

  // Баннер смены дорожек.
  useEffect(() => {
    if (stage.k !== 'between' || paused) return
    const t = setTimeout(() => {
      setStage({ k: 'play', gi: 1 })
      setShown(1)
      setImpacted(false)
    }, 2800 / speed)
    return () => clearTimeout(t)
  }, [stage, speed, paused])

  const handlePick = (slot: number) => {
    if (stage.k !== 'pick') return
    if (mode === 'ai') {
      const ro = playRolloff(lineups[0], lineups[1], slot, aiRolloffStart(lineups[1]), laneBonus, rngRef.current)
      setStartA(slot)
      setRolloff(ro)
      setStage({ k: 'rolloff' })
      setShown(1)
      setImpacted(false)
    } else if (stage.who === 0) {
      setStartA(slot)
      setStage({ k: 'pick', who: 1 })
    } else {
      const ro = playRolloff(lineups[0], lineups[1], startA ?? 0, slot, laneBonus, rngRef.current)
      setRolloff(ro)
      setStage({ k: 'rolloff' })
      setShown(1)
      setImpacted(false)
    }
  }

  // Видимые шаги: текущий бросок попадает на табло только после падения кеглей.
  const visCount = playing ? (impacted ? shown : shown - 1) : 0
  const visSteps = playing && steps ? steps.slice(0, visCount) : []

  const pointsAfterG1: [number, number] =
    two.finals[0][0] > two.finals[0][1] ? [1, 0] : two.finals[0][1] > two.finals[0][0] ? [0, 1] : [0.5, 0.5]
  const visPoints: [number, number] =
    stage.k === 'play' && stage.gi === 0 ? [0, 0] : stage.k === 'between' || (stage.k === 'play' && stage.gi === 1) ? pointsAfterG1 : two.points

  const fmtPts = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))

  const fullRounds =
    stage.k === 'done' && rolloff
      ? rolloff.rounds.length
      : stage.k === 'rolloff'
        ? Math.floor(visCount / 2)
        : 0
  const roScore: [number, number] =
    rolloff && fullRounds > 0 ? rolloff.rounds[Math.min(fullRounds, rolloff.rounds.length) - 1].score : [0, 0]

  const winner: 0 | 1 = two.tied ? (rolloff ? rolloff.winner : 0) : two.points[0] > two.points[1] ? 0 : 1
  const playerOf = (s: Step) => lineups[s.team].find((p) => p.id === s.ev.playerId)
  const phrase = cur ? phraseFor(cur.reaction, shown - 1, playerOf(cur)?.gender ?? 'М') : ''
  const gi = stage.k === 'play' ? stage.gi : 1

  // Частичные табло обеих команд (по видимым шагам) и мини-счёт над дорожками.
  const boards = ([0, 1] as const).map((team) =>
    partialFrames(visSteps.filter((s) => s.team === team && !s.rolloff).map((s) => s.ev)),
  )
  const hud: [LaneHud, LaneHud] = [0, 1].map((lane) => {
    const t = gi === 0 ? (lane as 0 | 1) : ((1 - lane) as 0 | 1)
    let line: string
    if (stage.k === 'rolloff') {
      line = rolloff
        ? rolloff.rounds
            .slice(0, fullRounds)
            .map((r) => (t === 0 ? r.a.pins : r.b.pins))
            .join(' ')
        : ''
    } else {
      line = boards[t].frames
        .filter((f): f is FrameScore => f !== null)
        .map((f, i) => frameSymbols(f.throws, i === 9).join(''))
        .join(' ')
    }
    return {
      name: names[t],
      score: stage.k === 'rolloff' ? String(roScore[t]) : String(boards[t].total),
      line,
    }
  }) as [LaneHud, LaneHud]
  const benchGenders = cur ? lineups[cur.team].filter((p) => p.id !== cur.ev.playerId).map((p) => p.gender) : []

  return (
    <div className="space-y-3">
      {/* Шапка серии */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2">
        <span className="text-sm font-bold">
          Серия: <span className="text-amber-400">{names[0]}</span>{' '}
          <span className="text-xl tabular-nums">{fmtPts(visPoints[0])}</span>
          <span className="mx-1 text-slate-500">:</span>
          <span className="text-xl tabular-nums">{fmtPts(visPoints[1])}</span>{' '}
          <span className="text-slate-300">{names[1]}</span>
        </span>
        <span className="text-xs text-slate-400">
          {stage.k === 'play' && `Игра ${stage.gi + 1} из 2`}
          {stage.k === 'between' && 'Смена дорожек'}
          {(stage.k === 'pick' || stage.k === 'rolloff') && 'РОЛЛ-ОФФ до 3 очков'}
          {stage.k === 'done' && 'Матч окончен'}
        </span>
      </div>

      {/* Строка завершённой игры 1 */}
      {(stage.k === 'between' || (stage.k === 'play' && stage.gi === 1) || stage.k === 'pick' || stage.k === 'rolloff' || stage.k === 'done') && (
        <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-slate-400">
          Игра 1: {two.finals[0][0]}:{two.finals[0][1]}
          {stage.k === 'done' || stage.k === 'pick' || stage.k === 'rolloff' ? (
            <span> · Игра 2: {two.finals[1][0]}:{two.finals[1][1]}</span>
          ) : null}
          {rolloff && (stage.k === 'done' ? <span> · Ролл-офф {rolloff.rounds[rolloff.rounds.length - 1].score.join(':')}</span> : null)}
        </div>
      )}

      {/* Баннер смены дорожек */}
      {stage.k === 'between' && (
        <div className="rounded-lg bg-slate-900 p-6 text-center">
          <div className="text-2xl font-extrabold text-amber-400">Игра 2 — смена дорожек!</div>
          <div className="mt-2 text-sm text-slate-300">
            {names[0]} переходит на дорожку №10, {names[1]} — на №9
          </div>
        </div>
      )}

      {/* Выбор стартового игрока ролл-оффа */}
      {stage.k === 'pick' && (
        <div className="rounded-lg bg-slate-900 p-4">
          <div className="text-lg font-extrabold text-amber-400">Ничья {fmtPts(two.points[0])}:{fmtPts(two.points[1])} — ролл-офф!</div>
          <p className="mt-1 text-sm text-slate-300">
            {names[stage.who]}: выбери, кто бросает первым. Дальше — по порядку слотов (выбрал 3-го → 3-4-5-1-2).
            По одному броску в полный комплект: сбил больше — очко, ничья — очко обоим. До 3 очков.
          </p>
          <div className="mt-3 grid gap-2">
            {lineups[stage.who].map((p, slot) => (
              <button
                key={p.id}
                onClick={() => handlePick(slot)}
                className="pick-btn flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-left transition hover:border-amber-400/70"
              >
                <span className="w-6 text-center text-lg font-extrabold text-amber-400">{slot + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{capName(p.name)}</span>
                <span className="text-xs text-slate-400">
                  очередь: {[0, 1, 2, 3, 4].map((i) => ((slot + i) % 5) + 1).join('-')}
                </span>
                <span className="text-lg font-extrabold tabular-nums">{p.effRating}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Игровой грид: табло/счёт слева, сцена справа (на мобиле сцена сверху) */}
      {playing && cur && (stage.k === 'play' || stage.k === 'rolloff') && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
          <div className="order-2 space-y-3 lg:order-1">
            {stage.k === 'play' &&
              ([0, 1] as const).map((team) => (
                <TeamBoard
                  key={team}
                  name={names[team]}
                  laneNo={laneOf(team, gi) === 0 ? '9' : '10'}
                  frames={boards[team].frames}
                  total={boards[team].total}
                  hcp={two.hcp[team]}
                  lineup={lineups[team]}
                  active={cur.team === team}
                  activeFrame={cur.team === team ? cur.ev.frame : null}
                />
              ))}
            {stage.k === 'rolloff' && rolloff && (
              <div className="rounded-lg bg-slate-900 p-3">
                <div className="text-center text-sm font-bold text-slate-300">
                  Ролл-офф · {names[0]} <span className="text-2xl tabular-nums text-amber-400">{roScore[0]}</span>
                  <span className="mx-1 text-slate-500">:</span>
                  <span className="text-2xl tabular-nums text-amber-400">{roScore[1]}</span> {names[1]}
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-slate-400">
                  {rolloff.rounds.slice(0, fullRounds).map((r, i) => (
                    <div key={i}>
                      Р{i + 1}: {shortName(lineups[0][r.a.slot].name)} <b className="tabular-nums">{r.a.pins}</b> —{' '}
                      <b className="tabular-nums">{r.b.pins}</b> {shortName(lineups[1][r.b.slot].name)}
                      <span className="ml-2 text-slate-500">{r.score.join(':')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="order-1 space-y-3 lg:order-2">
            <div className="overflow-hidden rounded-lg bg-slate-900">
              <DualLaneView
                key={`${stage.k}-${gi}-${shown}`}
                ev={cur.ev}
                hand={playerOf(cur)?.hand ?? 'R'}
                gender={playerOf(cur)?.gender ?? 'М'}
                team={cur.team}
                activeLane={cur.lane}
                laneNumbers={['9', '10']}
                laneHud={hud}
                laneLabels={laneLabels}
                laneBonus={laneBonus}
                benchGenders={benchGenders}
                oppBenchGenders={lineups[(1 - cur.team) as 0 | 1].map((p) => p.gender)}
                bowlerRating={(playerOf(cur)?.effRating ?? 0) + laneBonus[cur.lane]}
                flightBubble={cur.flightBubble}
                resultBubbles={cur.resultBubbles}
                speed={speed}
                paused={paused}
                reaction={cur.reaction}
                benchMood={cur.benchMood}
                onImpact={() => setImpacted(true)}
              />
              <div className="flex min-h-[4.5rem] items-center gap-3 border-t border-slate-800 p-3">
                <PinDeck before={cur.ev.pinsBefore} after={impacted ? cur.ev.leaveAfter : cur.ev.pinsBefore} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500">
                    {cur.rolloff ? `Ролл-офф · раунд ${cur.ev.frame}` : `Игра ${gi + 1} · фрейм ${cur.ev.frame}`} ·{' '}
                    {names[cur.team]} · дор. {cur.lane === 0 ? '9' : '10'}
                  </div>
                  <div className="truncate font-bold">
                    {playerOf(cur) ? capName(playerOf(cur)!.name) : ''}
                    {playerOf(cur) && (
                      <span className="ml-2 text-xs font-normal text-slate-400 tabular-nums">
                        {(playerOf(cur)?.effRating ?? 0) + laneBonus[cur.lane]}
                        {laneBonus[cur.lane] !== 0 && (
                          <span className="text-slate-500">
                            {' '}
                            ({playerOf(cur)?.effRating} {laneBonus[cur.lane] > 0 ? '+' : ''}
                            {laneBonus[cur.lane]} дор.)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm ${
                      impacted ? throwTextClass(cur.ev) : cur.shout ? 'font-bold text-amber-400' : 'text-slate-500'
                    }`}
                  >
                    {impacted
                      ? cur.rolloff
                        ? `сбито ${cur.ev.pinsDown}${cur.ev.brooklyn ? ' (бруклин!)' : ''}`
                        : throwText(cur.ev)
                      : cur.shout
                        ? '«ДАЙ БРУКЛИН!!!»'
                        : 'бросает…'}
                  </div>
                  {impacted && (cur.ours || cur.reaction !== 'neutral') && (
                    <div className={`reaction-pop text-xs ${cur.ours ? 'font-extrabold text-amber-400' : 'text-slate-400'}`}>
                      {cur.ours ? 'Вся команда: «БРУКЛИН НАШ!»' : phrase}
                    </div>
                  )}
                </div>
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
                onClick={() => setPaused((p) => !p)}
                className={`pause-btn rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  paused ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {paused ? '▶ Дальше' : '⏸ Пауза'}
              </button>
              <button
                onClick={() => {
                  if (!steps) return
                  setPaused(false)
                  setShown(steps.length)
                  setImpacted(true)
                }}
                className="skip-btn ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
              >
                Пропустить ⏭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Полный счёт ролл-оффа в финале */}
      {stage.k === 'done' && rolloff && (
        <div className="rounded-lg bg-slate-900 p-3">
          <div className="text-center text-sm font-bold text-slate-300">
            Ролл-офф · {names[0]} <span className="text-2xl tabular-nums text-amber-400">{roScore[0]}</span>
            <span className="mx-1 text-slate-500">:</span>
            <span className="text-2xl tabular-nums text-amber-400">{roScore[1]}</span> {names[1]}
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-slate-400">
            {rolloff.rounds.map((r, i) => (
              <div key={i}>
                Р{i + 1}: {shortName(lineups[0][r.a.slot].name)} <b className="tabular-nums">{r.a.pins}</b> —{' '}
                <b className="tabular-nums">{r.b.pins}</b> {shortName(lineups[1][r.b.slot].name)}
                <span className="ml-2 text-slate-500">{r.score.join(':')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Финал */}
      {stage.k === 'done' && (
        <>
          {([0, 1] as const).map((team) => {
            const board = partialFrames((team === 0 ? two.g[1].a : two.g[1].b).events)
            return (
              <TeamBoard
                key={team}
                name={names[team]}
                laneNo={laneOf(team, 1) === 0 ? '9' : '10'}
                frames={board.frames}
                total={two.finals[1][team]}
                hcp={two.hcp[team]}
                lineup={lineups[team]}
                active={false}
                activeFrame={null}
              />
            )
          })}
          <div className="rounded-lg bg-slate-900 p-4 text-center">
            <div className="text-xl font-extrabold">
              🏆 Серию выиграл <span className="text-amber-400">{names[winner]}</span>{' '}
              <span className="tabular-nums">
                {fmtPts(two.points[0])}:{fmtPts(two.points[1])}
              </span>
              {rolloff && (
                <span className="text-amber-400">
                  {' '}
                  · ролл-офф <span className="tabular-nums">{rolloff.rounds[rolloff.rounds.length - 1].score.join(':')}</span>
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              Игра 1: {two.finals[0][0]}:{two.finals[0][1]} · Игра 2: {two.finals[1][0]}:{two.finals[1][1]}
              {(two.hcp[0] > 0 || two.hcp[1] > 0) && (
                <span> · гандикап ♀ +{two.hcp[0]} : +{two.hcp[1]} (в каждой игре)</span>
              )}
            </div>
            {rolloff && (
              <div className="mt-1 text-sm text-slate-400">
                Ролл-офф: {rolloff.rounds[rolloff.rounds.length - 1].score.join(':')} (стартовали слоты{' '}
                {rolloff.start[0] + 1} и {rolloff.start[1] + 1})
              </div>
            )}
          </div>

          <details className="rounded-lg bg-slate-900 p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-300">Лог бросков</summary>
            {([0, 1] as const).map((gIdx) => (
              <div key={gIdx} className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                {([0, 1] as const).map((team) => {
                  const game: BakerGame = team === 0 ? two.g[gIdx].a : two.g[gIdx].b
                  return (
                    <div key={team}>
                      <div className="mb-1 font-semibold text-amber-400">
                        Игра {gIdx + 1} · {names[team]}
                      </div>
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
            ))}
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
