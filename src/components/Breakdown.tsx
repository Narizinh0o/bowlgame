import { RARITY_BONUS, type Rarity } from '../engine'
import { RARITY_TEXT } from './ui'

interface Props {
  base: number // чистый baseRating, без всего
  rarity: Rarity
  ez?: number // бонус левши (в пуле +10, в составе живой)
  club?: number // клубная синергия состава
  eventsList: number[] // вклад каждого сработавшего события
}

/** Цветная раскладка рейтинга: каждый бонус — цветом своего источника.
 *  База серая, редкость своим цветом, EZ красный, клуб зелёный, события голубые. */
export default function Breakdown({ base, rarity, ez = 0, club = 0, eventsList }: Props) {
  const sign = (v: number) => (v > 0 ? `+${v}` : String(v))
  return (
    <span className="tabular-nums">
      <span className="text-slate-400">{base}</span>
      {RARITY_BONUS[rarity] > 0 && <span className={RARITY_TEXT[rarity]}>{sign(RARITY_BONUS[rarity])}</span>}
      {ez !== 0 && <span className="text-red-400">{sign(ez)}</span>}
      {club !== 0 && <span className="text-emerald-400">{sign(club)}</span>}
      {eventsList.map((v, i) => (
        <span key={i} className="text-sky-300">
          {sign(v)}
        </span>
      ))}
    </span>
  )
}

/** Есть ли что раскладывать (иначе показываем только итог). */
export function hasBreakdown(rarity: Rarity, ez: number, club: number, eventsList: number[]): boolean {
  return RARITY_BONUS[rarity] > 0 || ez !== 0 || club !== 0 || eventsList.length > 0
}
