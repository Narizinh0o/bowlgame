import { ALL_PINS } from '../engine'

/** Расстановка кеглей, вид сверху (как на табло боулинга): 1-я снизу, задний ряд сверху. */
const POS: Record<number, [number, number]> = {
  7: [10, 12],
  8: [36, 12],
  9: [62, 12],
  10: [88, 12],
  4: [23, 34],
  5: [49, 34],
  6: [75, 34],
  2: [36, 56],
  3: [62, 56],
  1: [49, 78],
}

interface Props {
  before: number[] // стояли до броска
  after: number[] // стоят после броска
}

/** Белые — стоят; янтарные — сбиты этим броском; контур — сбиты ранее. */
export default function PinDeck({ before, after }: Props) {
  return (
    <svg viewBox="0 0 98 90" className="w-16 shrink-0 md:w-20">
      {ALL_PINS.map((p) => {
        const standing = after.includes(p)
        const justDown = before.includes(p) && !standing
        return (
          <circle
            key={p}
            cx={POS[p][0]}
            cy={POS[p][1]}
            r="8"
            className={
              standing
                ? 'fill-slate-100'
                : justDown
                  ? 'fill-amber-500/80'
                  : 'fill-transparent stroke-slate-700'
            }
            strokeWidth="1.5"
          />
        )
      })}
    </svg>
  )
}
