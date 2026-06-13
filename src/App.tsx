import { useEffect, useRef, useState } from 'react'
import {
  aiArrangeOrder,
  aiPickIndex,
  buildLineup,
  buildPool,
  buildRatedRoster,
  mulberry32,
  randomSeed,
  rollMatchEvents,
  type MatchEvent,
  type MatchPlayer,
  type Picked,
  type PoolSlot,
  type RatedRoster,
} from './engine'
import MenuScreen from './components/MenuScreen'
import DraftScreen from './components/DraftScreen'
import ArrangeScreen from './components/ArrangeScreen'
import MatchScreen from './components/MatchScreen'

type Mode = 'ai' | 'hotseat'
type Screen =
  | { s: 'menu' }
  | { s: 'draft' }
  | { s: 'arrange'; who: 0 | 1 }
  | { s: 'match'; lineups: [MatchPlayer[], MatchPlayer[]] }

export default function App() {
  const [rated, setRated] = useState<RatedRoster | null>(null)
  const [screen, setScreen] = useState<Screen>({ s: 'menu' })
  const [mode, setMode] = useState<Mode>('ai')
  const [pool, setPool] = useState<PoolSlot[]>([])
  const [turn, setTurn] = useState<0 | 1>(0)
  const [first, setFirst] = useState<0 | 1>(0)
  const [orderA, setOrderA] = useState<Picked[] | null>(null)
  const [events, setEvents] = useState<MatchEvent[]>([])
  const rngRef = useRef(mulberry32(randomSeed()))

  useEffect(() => {
    fetch('/data/roster.json')
      .then((r) => r.json())
      .then((roster) => setRated(buildRatedRoster(roster)))
    // Предзагрузка фото-вспышки желоба: чтобы за её 1 секунду показа на телефоне
    // не успел вылезти лишь контур (картинка не загружена) — кэшируем заранее.
    new Image().src = '/assets/gutter.jpg'
  }, [])

  const names: [string, string] = mode === 'ai' ? ['Ты', 'Компьютер'] : ['Игрок 1', 'Игрок 2']
  const tags: [string, string] = mode === 'ai' ? ['Ты', 'ПК'] : ['И1', 'И2']

  const picksOf = (pl: PoolSlot[], team: 0 | 1): Picked[] => pl.filter((s) => s.pickedBy === team)

  const startDraft = (m: Mode) => {
    if (!rated) return
    rngRef.current = mulberry32(randomSeed())
    const f: 0 | 1 = rngRef.current() < 0.5 ? 0 : 1
    setMode(m)
    setPool(buildPool(rated.players, rngRef.current))
    setEvents(rollMatchEvents(rated.players.map((p) => p.club), rngRef.current))
    setFirst(f)
    setTurn(f)
    setOrderA(null)
    setScreen({ s: 'draft' })
  }

  const doPick = (i: number) => {
    if (screen.s !== 'draft' || pool[i].pickedBy !== null) return
    const next = pool.map((s, j) => (j === i ? { ...s, pickedBy: turn } : s))
    setPool(next)
    if (next.filter((s) => s.pickedBy !== null).length >= 10) {
      setScreen({ s: 'arrange', who: 0 })
    } else {
      setTurn(turn === 0 ? 1 : 0)
    }
  }

  // Ход компьютера — с паузой, чтобы драфт ощущался живым.
  useEffect(() => {
    if (screen.s !== 'draft' || mode !== 'ai' || turn !== 1) return
    const t = setTimeout(() => {
      const idx = aiPickIndex(pool, 1, events, rngRef.current)
      if (idx >= 0) doPick(idx)
    }, 650)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.s, mode, turn, pool])

  const startMatch = (oA: Picked[], oB: Picked[]) => {
    if (!rated) return
    const lineups: [MatchPlayer[], MatchPlayer[]] = [
      buildLineup(oA, rated.r80, events),
      buildLineup(oB, rated.r80, events),
    ]
    setScreen({ s: 'match', lineups })
  }

  const onArranged = (order: Picked[]) => {
    if (screen.s !== 'arrange') return
    if (screen.who === 0) {
      if (mode === 'ai') {
        startMatch(order, aiArrangeOrder(picksOf(pool, 1)))
      } else {
        setOrderA(order)
        setScreen({ s: 'arrange', who: 1 })
      }
    } else if (orderA) {
      startMatch(orderA, order)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-3 md:p-4">
      {screen.s !== 'menu' && (
        <header className="mb-3 flex items-center justify-between">
          <button onClick={() => setScreen({ s: 'menu' })} className="text-sm text-slate-400 transition hover:text-slate-200">
            ← Меню
          </button>
          <span className="text-sm font-bold text-amber-400">КЛБ Боулинг-Батл</span>
        </header>
      )}

      {screen.s === 'menu' && <MenuScreen count={rated ? rated.players.length : null} onStart={startDraft} />}

      {screen.s === 'draft' && (
        <DraftScreen
          pool={pool}
          names={names}
          tags={tags}
          turn={turn}
          first={first}
          events={events}
          aiTurn={mode === 'ai' && turn === 1}
          onPick={doPick}
        />
      )}

      {screen.s === 'arrange' && (
        <ArrangeScreen
          key={screen.who}
          title={`${names[screen.who]}: расставь пятёрку по слотам`}
          picks={picksOf(pool, screen.who)}
          events={events}
          doneLabel={mode === 'hotseat' && screen.who === 0 ? 'Готово — дальше соперник' : 'В бой!'}
          onDone={onArranged}
        />
      )}

      {screen.s === 'match' && (
        <MatchScreen
          names={names}
          lineups={screen.lineups}
          mode={mode}
          onNewDraft={() => startDraft(mode)}
          onMenu={() => setScreen({ s: 'menu' })}
        />
      )}
    </div>
  )
}
