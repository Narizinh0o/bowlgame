import { useEffect, useMemo, useRef } from 'react'
import { mulberry32, type Reaction, type ThrowEvent } from '../engine'

/**
 * ТВ-сцена финала: пара дорожек (9 и 10), синий фон с логотипом КЛБ, трибуны
 * со зрителями в цветах команд, скамейка из 4 запасных за спиной бросающего.
 * Активная дорожка разыгрывает бросок (боулер, шар с хуком, разлёт кеглей),
 * на соседней стоит полный комплект. Кегли стоят до удара — интрига.
 */

export type BenchMood = 'idle' | 'joy' | 'huge_joy' | 'sad' | 'huge_sad' | 'faint'

const W = 480
const H = 300
const LANE_CX = [128, 352]
const HALF0 = 64
const HALF1 = 24
const Y0 = 252
const Y1 = 84

const T_APPROACH_FULL = 420
const T_APPROACH_SHORT = 240
const T_ROLL = 1000
const T_FALL = 420

const persp = (s: number) => Math.pow(Math.max(0, s), 0.78)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => k * k * (3 - 2 * k)

function project(cx: number, u: number, s: number): { x: number; y: number; scale: number } {
  const f = persp(s)
  const half = lerp(HALF0, HALF1, f)
  return { x: cx + u * half, y: lerp(Y0, Y1, f), scale: half / HALF0 }
}

const PIN_POS: Record<number, { u: number; s: number }> = {
  1: { u: 0, s: 0.93 },
  2: { u: -0.26, s: 0.957 },
  3: { u: 0.26, s: 0.957 },
  4: { u: -0.52, s: 0.984 },
  5: { u: 0, s: 0.984 },
  6: { u: 0.52, s: 0.984 },
  7: { u: -0.78, s: 1.01 },
  8: { u: -0.26, s: 1.01 },
  9: { u: 0.26, s: 1.01 },
  10: { u: 0.78, s: 1.01 },
}
const DRAW_ORDER = [7, 8, 9, 10, 4, 5, 6, 2, 3, 1]

interface ThrowParams {
  u0: number
  uBreak: number
  uT: number
  gutter: boolean
  approach: number
}

function computeParams(ev: ThrowEvent, hand: string): ThrowParams {
  const sign = hand === 'L' ? -1 : 1
  const pocket = 0.13 * sign
  const full = ev.pinsBefore.length === 10
  const approach = ev.throwIndex === 0 ? T_APPROACH_FULL : T_APPROACH_SHORT

  if (ev.pinsDown === 0 && ev.leaveAfter.length === 10) {
    return { u0: 0.35 * sign, uBreak: 0.85 * sign, uT: 1.12 * sign, gutter: true, approach }
  }

  const downPins = ev.pinsBefore.filter((p) => !ev.leaveAfter.includes(p))
  const meanU = (pins: number[]) =>
    pins.length ? pins.reduce((s, p) => s + PIN_POS[p].u, 0) / pins.length : 0

  // Бруклин: шар перелетает карман и бьёт с другой стороны головы (у правши — 1-2).
  const target = ev.brooklyn ? -pocket : pocket
  let uT: number
  if (full) {
    uT = ev.isStrike ? target : 0.55 * meanU(downPins) + 0.45 * target
  } else if (downPins.length > 0) {
    uT = meanU(downPins)
  } else {
    uT = meanU(ev.pinsBefore) + (Math.random() < 0.5 ? -0.25 : 0.25)
  }

  if (full) return { u0: 0.35 * sign, uBreak: 0.62 * sign, uT, gutter: false, approach }
  const u0 = uT * 0.45
  return { u0, uBreak: lerp(u0, uT, 0.55) + 0.1 * sign, uT, gutter: false, approach }
}

function ballU(s: number, p: ThrowParams): number {
  const BR = 0.62
  if (p.gutter) {
    if (s < 0.55) return lerp(p.u0, p.uBreak, smooth(s / 0.55))
    return lerp(p.uBreak, p.uT, smooth(Math.min(1, (s - 0.55) / 0.3)))
  }
  if (s < BR) return lerp(p.u0, p.uBreak, smooth(s / BR))
  const k = (s - BR) / (1 - BR)
  return lerp(p.uBreak, p.uT, Math.pow(k, 1.8))
}

const TEAM_COLOR = ['#f59e0b', '#94a3b8']
const NEUTRAL_COLOR = '#64748b'

const REACTION_EMOJI: Record<Reaction, string> = {
  huge_joy: '🤩',
  joy: '😄',
  cocky: '😎',
  neutral: '',
  sad: '😟',
  huge_sad: '😱',
  stone_face: '🗿',
}

type Pose = 'throw' | 'idle' | Reaction

export interface LaneHud {
  name: string
  score: string
  line: string // строка фреймов «X 9/ 9–» (или пины раундов ролл-оффа)
}

/** Комикс-облако: текст + от кого тянется хвостик. */
export interface Bubble {
  text: string
  from: 'player' | 'bench' | 'opp'
}

interface Props {
  ev: ThrowEvent
  hand: string
  gender: string
  team: 0 | 1
  activeLane: 0 | 1
  laneNumbers: [string, string]
  laneHud: [LaneHud, LaneHud] // мини-счёт над каждой дорожкой
  laneLabels: [string, string] // «хорошая/плохая/обычная дорожка +N»
  laneBonus: [number, number] // числа дорожек — для цвета подписи
  benchGenders: string[] // пол четырёх запасных (реальные одноклубники)
  oppBenchGenders: string[] // пол всей пятёрки соперника (сидят за своей дорожкой)
  bowlerRating: number // итоговый рейтинг бросающего с учётом дорожки
  flightBubble: Bubble | null // выкрик во время полёта («ДАЙ БРУКЛИН!!!»)
  resultBubbles: Bubble[] // выкрики после удара (макс. 2)
  speed: 1 | 2
  paused: boolean
  reaction: Reaction
  benchMood: BenchMood
  onImpact: () => void
}

export default function DualLaneView({
  ev,
  hand,
  gender,
  team,
  activeLane,
  laneNumbers,
  laneHud,
  laneLabels,
  laneBonus,
  benchGenders,
  oppBenchGenders,
  bowlerRating,
  flightBubble,
  resultBubbles,
  speed,
  paused,
  reaction,
  benchMood,
  onImpact,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onImpactRef = useRef(onImpact)
  onImpactRef.current = onImpact
  const speedRef = useRef(speed)
  speedRef.current = speed
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const hudRef = useRef(laneHud)
  hudRef.current = laneHud

  // Зрители: ровно по 6 за каждую команду + 4 нейтральных, рассадка фиксированная.
  const spectators = useMemo(() => {
    const rng = mulberry32(424242)
    const teams: (0 | 1 | 2)[] = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2]
    for (let i = teams.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[teams[i], teams[j]] = [teams[j], teams[i]]
    }
    const seats: { side: 0 | 1; row: number; col: number; team: 0 | 1 | 2; phase: number }[] = []
    let k = 0
    for (const side of [0, 1] as const) {
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          seats.push({ side, row, col, team: teams[k++], phase: rng() * Math.PI * 2 })
        }
      }
    }
    return seats
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth || W
    const cssH = (cssW * H) / W
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    const kx = (cssW * dpr) / W
    const ky = (cssH * dpr) / H

    const params = computeParams(ev, hand)
    const sign = hand === 'L' ? -1 : 1
    const tImpact = params.approach + T_ROLL
    const downPins = ev.pinsBefore.filter((p) => !ev.leaveAfter.includes(p))
    const falls = downPins.map((pin) => ({
      pin,
      vx: (Math.random() - 0.5) * 70,
      vy: -(20 + Math.random() * 45),
      rot: (Math.random() - 0.5) * 14,
    }))
    const color = TEAM_COLOR[team]
    const isFemale = gender === 'Ж'
    const cx = LANE_CX[activeLane]
    const cheerSide: 0 | 1 | null =
      reaction === 'huge_joy' || reaction === 'joy' || reaction === 'cocky'
        ? team
        : reaction === 'huge_sad'
          ? ((1 - team) as 0 | 1)
          : null

    const pinShape = (x: number, y: number, h: number, alpha: number, rot: number) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.globalAlpha = alpha
      const w = h * 0.38
      ctx.fillStyle = '#e2e8f0'
      ctx.beginPath()
      ctx.roundRect(-w / 2, -h, w, h, w / 2)
      ctx.fill()
      ctx.fillStyle = '#b91c1c'
      ctx.fillRect(-w / 2, -h * 0.72, w, h * 0.14)
      ctx.restore()
    }

    /** Универсальный стикмен: боулер, запасные. size — масштаб (1 = рост 40). */
    const stickman = (
      x: number,
      y: number,
      size: number,
      bodyColor: string,
      pose: Pose,
      t: number,
      female: boolean,
      fainted = false,
    ) => {
      ctx.save()
      ctx.translate(x, y)
      if (fainted) {
        ctx.rotate(Math.PI / 2)
        ctx.translate(0, 8 * size)
      }
      ctx.scale(size, size)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      let dy = 0
      if (pose === 'huge_joy') dy = -Math.abs(Math.sin(t / 90)) * 5
      const crouch = pose === 'huge_sad' ? 7 : 0
      ctx.translate(0, dy + crouch)

      // ноги
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.moveTo(0, -12)
      ctx.lineTo(-5, 0)
      ctx.moveTo(0, -12)
      ctx.lineTo(5, 0)
      ctx.stroke()
      // туловище
      ctx.strokeStyle = bodyColor
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(0, -12)
      ctx.lineTo(0, -28)
      ctx.stroke()
      // голова
      const headDrop = pose === 'sad' || pose === 'huge_sad' ? 2.5 : 0
      const hy = -35 + headDrop
      ctx.fillStyle = '#fcd9b8'
      ctx.beginPath()
      ctx.arc(0, hy, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(0, hy - 1.2, 6, Math.PI * 1.05, Math.PI * 1.95)
      ctx.stroke()
      if (female) {
        ctx.beginPath()
        ctx.moveTo(-5, hy - 2)
        ctx.quadraticCurveTo(-10, hy + 2, -8, hy + 9)
        ctx.stroke()
      }
      // руки
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 3.5
      const sy = -25
      ctx.beginPath()
      if (pose === 'throw') {
        ctx.moveTo(0, sy)
        ctx.lineTo(-sign * 7, sy + 10)
        ctx.stroke()
      } else if (pose === 'huge_joy') {
        ctx.moveTo(0, sy)
        ctx.lineTo(-8, sy - 11)
        ctx.moveTo(0, sy)
        ctx.lineTo(8, sy - 11)
        ctx.stroke()
      } else if (pose === 'joy' || pose === 'cocky') {
        ctx.moveTo(0, sy)
        ctx.lineTo(-7, sy + 9)
        ctx.moveTo(0, sy)
        ctx.lineTo(8, sy - 10)
        ctx.stroke()
      } else if (pose === 'huge_sad') {
        ctx.moveTo(0, sy)
        ctx.lineTo(-6, hy + 2)
        ctx.moveTo(0, sy)
        ctx.lineTo(6, hy + 2)
        ctx.stroke()
      } else {
        ctx.moveTo(0, sy)
        ctx.lineTo(-4.5, sy + 11)
        ctx.moveTo(0, sy)
        ctx.lineTo(4.5, sy + 11)
        ctx.stroke()
      }
      ctx.restore()
    }

    const drawLane = (laneIdx: number, t: number) => {
      const lcx = LANE_CX[laneIdx]
      const active = laneIdx === activeLane

      // желоба
      ctx.fillStyle = '#16213a'
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(project(lcx, side * 1.0, 0).x, Y0)
        ctx.lineTo(project(lcx, side * 1.0, 1.04).x, project(lcx, 0, 1.04).y)
        ctx.lineTo(project(lcx, side * 1.18, 1.04).x, project(lcx, 0, 1.04).y)
        ctx.lineTo(project(lcx, side * 1.18, 0).x, Y0)
        ctx.closePath()
        ctx.fill()
      }
      // настил
      const grad = ctx.createLinearGradient(0, Y0, 0, Y1)
      grad.addColorStop(0, '#8a6230')
      grad.addColorStop(1, '#52391b')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(lcx - HALF0, Y0)
      ctx.lineTo(lcx - HALF1, Y1)
      ctx.lineTo(lcx + HALF1, Y1)
      ctx.lineTo(lcx + HALF0, Y0)
      ctx.closePath()
      ctx.fill()
      // швы
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'
      ctx.lineWidth = 1
      for (let u = -0.66; u <= 0.67; u += 0.33) {
        const a = project(lcx, u, 0)
        const b = project(lcx, u, 1.0)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      // стрелки
      ctx.fillStyle = 'rgba(127,29,29,0.85)'
      for (let u = -0.6; u <= 0.61; u += 0.3) {
        const p = project(lcx, u, 0.26)
        const sz = 3.6 * p.scale + 1.5
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - sz)
        ctx.lineTo(p.x - sz * 0.55, p.y + sz * 0.5)
        ctx.lineTo(p.x + sz * 0.55, p.y + sz * 0.5)
        ctx.closePath()
        ctx.fill()
      }
      // табличка номера дорожки
      const topY = Y1 - 26
      ctx.fillStyle = '#0b1430'
      ctx.beginPath()
      ctx.roundRect(lcx - 13, topY, 26, 16, 4)
      ctx.fill()
      ctx.fillStyle = '#fbbf24'
      ctx.font = 'bold 11px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(laneNumbers[laneIdx], lcx, topY + 8.5)

      // мини-табло над дорожкой: имя · счёт + строка фреймов (обновляется после удара)
      const hud = hudRef.current[laneIdx]
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.font = '700 10px Inter, sans-serif'
      ctx.fillText(`${hud.name.slice(0, 12)} · ${hud.score}`, lcx, topY - 16)
      if (hud.line) {
        ctx.fillStyle = 'rgba(226,232,240,0.75)'
        ctx.font = '600 7.5px Inter, sans-serif'
        ctx.fillText(hud.line.length > 34 ? '…' + hud.line.slice(-33) : hud.line, lcx, topY - 6)
      }

      // вердикт дорожки — сразу под кеглями, на верху настила; цвет по знаку
      const lb = laneBonus[laneIdx]
      ctx.fillStyle = lb > 0 ? 'rgba(74,222,128,0.85)' : lb < 0 ? 'rgba(248,113,113,0.9)' : 'rgba(255,255,255,0.6)'
      ctx.font = 'italic 600 8.5px Inter, sans-serif'
      ctx.fillText(laneLabels[laneIdx], lcx, topY + 45)

      // кегли
      for (const pin of DRAW_ORDER) {
        const pos = PIN_POS[pin]
        const pr = project(lcx, pos.u, pos.s)
        const h = 24 * pr.scale + 4
        if (!active) {
          pinShape(pr.x, pr.y, h, 1, 0) // соседняя дорожка ждёт со свежим комплектом
          continue
        }
        if (!ev.pinsBefore.includes(pin)) continue
        const survives = ev.leaveAfter.includes(pin)
        if (survives || t < tImpact) {
          pinShape(pr.x, pr.y, h, 1, 0)
        } else {
          const ft = (t - tImpact) / T_FALL
          if (ft < 1) {
            const fall = falls.find((f) => f.pin === pin)
            if (fall) {
              pinShape(pr.x + fall.vx * ft, pr.y + fall.vy * ft + 80 * ft * ft, h, 1 - ft, fall.rot * ft)
            }
          }
        }
      }
    }

    const drawBallAndBowler = (t: number) => {
      const inResult = t >= tImpact + 150
      const pose: Pose = inResult ? reaction : 'throw'
      const bx = project(cx, params.u0, 0).x - sign * 22
      const by = Y0 + 16

      // запасные на скамейке за спиной — реальные одноклубники со своим полом
      const benchDir = activeLane === 0 ? -1 : 1
      const benchX = cx + benchDir * 78
      for (let i = 0; i < Math.min(4, benchGenders.length); i++) {
        const mood: Pose = !inResult ? 'idle' : benchMood === 'faint' ? (i === 0 ? 'idle' : 'huge_sad') : benchMood
        const fainted = inResult && benchMood === 'faint' && i === 0
        stickman(benchX + benchDir * i * 16, by + 14, 0.6, color, mood, t + i * 137, benchGenders[i] === 'Ж', fainted)
      }

      // скамейка соперников — вся пятёрка за своей дорожкой, наблюдают
      const oppDir = -benchDir
      const oppX = LANE_CX[1 - activeLane] + oppDir * 78
      const oppColor = TEAM_COLOR[1 - team]
      for (let i = 0; i < Math.min(5, oppBenchGenders.length); i++) {
        stickman(oppX + oppDir * i * 14, by + 14, 0.55, oppColor, 'idle', t + i * 211, oppBenchGenders[i] === 'Ж')
      }

      // итоговый рейтинг бросающего (с учётом дорожки) — плашка возле боулера
      ctx.save()
      ctx.fillStyle = 'rgba(11,20,48,0.85)'
      ctx.beginPath()
      ctx.roundRect(bx - sign * 34 - 13, by - 34, 26, 13, 3.5)
      ctx.fill()
      ctx.fillStyle = '#fbbf24'
      ctx.font = '700 9px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(bowlerRating), bx - sign * 34, by - 27.5)
      ctx.restore()

      // шар
      const tBall = t - params.approach
      if (tBall >= 0 && t <= tImpact + 50) {
        const s = Math.min(1.02, (tBall / T_ROLL) * 1.02)
        const u = ballU(s, params)
        const pr = project(cx, u, s)
        const r = lerp(8.5, 3.2, persp(Math.max(0, s)))
        const gy = params.gutter && s > 0.72 ? 3 : 0
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath()
        ctx.ellipse(pr.x, pr.y + r * 0.55 + gy, r * 0.9, r * 0.3, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#991b1b'
        ctx.beginPath()
        ctx.arc(pr.x, pr.y + gy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.beginPath()
        ctx.arc(pr.x - r * 0.3, pr.y - r * 0.35 + gy, r * 0.28, 0, Math.PI * 2)
        ctx.fill()
      }

      // боулер + шар в руке до выпуска
      stickman(bx, by, 0.85, color, pose, t, isFemale)
      if (pose === 'throw' && t < params.approach) {
        const k = Math.min(1, t / params.approach)
        const ang = lerp(2.5, 0.45, smooth(k))
        const ax = bx + sign * Math.sin(ang) * 12
        const ay = by - 21 + Math.cos(ang) * 12
        ctx.strokeStyle = '#cbd5e1'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(bx, by - 21)
        ctx.lineTo(ax, ay)
        ctx.stroke()
        ctx.fillStyle = '#991b1b'
        ctx.beginPath()
        ctx.arc(ax, ay + 2.5, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      // эмодзи-реакция
      if (inResult && reaction !== 'neutral') {
        const emoji = REACTION_EMOJI[reaction]
        if (emoji) {
          const tr = t - (tImpact + 150)
          const pop = reaction === 'stone_face' ? 1 : Math.min(1, tr / 180)
          const huge = reaction === 'huge_joy' || reaction === 'huge_sad'
          const dx = huge ? Math.sin(t / 60) * 2.5 : 0
          ctx.font = `${Math.round(18 * (0.4 + 0.6 * pop))}px serif`
          ctx.textAlign = 'center'
          ctx.fillText(emoji, bx + sign * 14 + dx, by - 48)
        }
      }
    }

    const drawBackdropAndCrowd = (t: number) => {
      // синий ТВ-фон
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#1e3a8a')
      bg.addColorStop(0.55, '#15275f')
      bg.addColorStop(1, '#0c1530')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // логотип: шар + «КээЛБэ» (никаких прав не нарушаем)
      ctx.save()
      ctx.globalAlpha = 0.9
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.arc(W / 2 - 48, 26, 13, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#1e3a8a'
      for (const [hx, hy] of [
        [-4, -4],
        [3, -5],
        [0, 1],
      ]) {
        ctx.beginPath()
        ctx.arc(W / 2 - 48 + hx, 26 + hy, 1.9, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.font = '800 19px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('КээЛБэ', W / 2 - 28, 27)
      ctx.restore()

      // бейдж трансляции «МячТВ» с мигающим огоньком записи
      ctx.save()
      ctx.fillStyle = 'rgba(11,20,48,0.85)'
      ctx.beginPath()
      ctx.roundRect(W - 70, 10, 60, 16, 4)
      ctx.fill()
      ctx.fillStyle = `rgba(239,68,68,${0.55 + 0.45 * Math.abs(Math.sin(t / 420))})`
      ctx.beginPath()
      ctx.arc(W - 61, 18, 2.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = '700 9px Inter, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('МячТВ', W - 55, 18.5)
      ctx.restore()

      // мини-камеры по бокам: на игроков (внизу) и на кегли (вверху)
      const drawCamera = (x: number, y: number, dir: 1 | -1) => {
        ctx.save()
        ctx.strokeStyle = '#334155'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(x, y + 3)
        ctx.lineTo(x - 3, y + 9)
        ctx.moveTo(x, y + 3)
        ctx.lineTo(x + 3, y + 9)
        ctx.stroke()
        ctx.fillStyle = '#475569'
        ctx.beginPath()
        ctx.roundRect(x - 4.5, y - 3, 9, 6, 1.5)
        ctx.fill()
        ctx.fillStyle = '#94a3b8'
        ctx.beginPath()
        ctx.arc(x + dir * 5.5, y, 1.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(239,68,68,${0.4 + 0.6 * Math.abs(Math.sin(t / 500))})`
        ctx.beginPath()
        ctx.arc(x - dir * 3, y - 4, 1, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      drawCamera(56, 232, 1) // на боулера левой дорожки
      drawCamera(424, 232, -1) // на боулера правой
      drawCamera(58, 96, 1) // на кегли левой
      drawCamera(422, 96, -1) // на кегли правой

      // пит-задник за обеими дорожками
      ctx.fillStyle = '#0b1220'
      for (const lcx of LANE_CX) {
        ctx.fillRect(lcx - HALF1 - 16, Y1 - 22, (HALF1 + 16) * 2, 26)
      }

      // трибуны по бокам (6 за каждую команду + 4 нейтральных)
      const inResult = t >= tImpact + 150
      for (const seat of spectators) {
        const baseX = seat.side === 0 ? 10 : W - 42
        const x = baseX + seat.col * 8 + seat.row * 4
        const y = 150 + seat.row * 26 - seat.col * 1.5
        if (seat.col === 0 && seat.row === 0) {
          ctx.fillStyle = 'rgba(15,23,42,0.65)' // ступень трибуны
          ctx.fillRect(baseX - 6, y + 6, 44, 24)
          ctx.fillRect(baseX - 6 + 4, y + 32, 44, 24)
        }
        const color = seat.team === 2 ? NEUTRAL_COLOR : TEAM_COLOR[seat.team]
        const cheering = inResult && cheerSide !== null && seat.team === cheerSide
        const wave = cheering ? Math.abs(Math.sin(t / 100 + seat.phase)) * 4 : 0
        const sy = y - wave
        ctx.strokeStyle = color
        ctx.lineWidth = 3.5
        if (cheering) {
          ctx.beginPath()
          ctx.moveTo(x - 3, sy - 2)
          ctx.lineTo(x - 6, sy - 9)
          ctx.moveTo(x + 3, sy - 2)
          ctx.lineTo(x + 6, sy - 9)
          ctx.stroke()
        }
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(x - 4.5, sy, 9, 8, 3)
        ctx.fill()
        ctx.fillStyle = '#fcd9b8'
        ctx.beginPath()
        ctx.arc(x, sy - 4, 3.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    /** Белое комикс-облако с хвостиком-отростком к говорящему. */
    const drawBubble = (text: string, wantX: number, cy: number, tailX: number, tailY: number, k: number) => {
      ctx.save()
      ctx.font = '800 9px Inter, sans-serif'
      const w = Math.min(160, ctx.measureText(text).width + 16)
      const h = 18
      const x = Math.min(W - w / 2 - 3, Math.max(w / 2 + 3, wantX))
      ctx.translate(x, cy)
      ctx.scale(k, k)
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.moveTo(-7, h / 2 - 2)
      ctx.lineTo(tailX - x, tailY - cy)
      ctx.lineTo(4, h / 2 - 2)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.roundRect(-w / 2, -h / 2, w, h, 9)
      ctx.fill()
      ctx.strokeStyle = 'rgba(15,23,42,0.25)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#0f172a'
      ctx.font = '800 9px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 0, 0.5)
      ctx.restore()
    }

    const drawBubbles = (t: number) => {
      const bx = project(cx, params.u0, 0).x - sign * 22
      const by = Y0 + 16
      const benchDir = activeLane === 0 ? -1 : 1
      const benchX = cx + benchDir * 78 + benchDir * 24
      const oppDir = -benchDir
      const oppX = LANE_CX[1 - activeLane] + oppDir * 78 + oppDir * 24

      const drawOne = (b: Bubble, tStart: number) => {
        const k = Math.min(1, Math.max(0, (t - tStart) / 160))
        if (k <= 0) return
        if (b.from === 'player') drawBubble(b.text, bx, by - 76, bx, by - 52, k)
        else if (b.from === 'bench') drawBubble(b.text, benchX, by - 40, benchX - benchDir * 12, by - 10, k)
        else drawBubble(b.text, oppX, by - 40, oppX - oppDir * 12, by - 10, k)
      }

      if (flightBubble && t > params.approach * 0.5 && t < tImpact) drawOne(flightBubble, params.approach * 0.5)
      if (t >= tImpact + 250) resultBubbles.forEach((b, i) => drawOne(b, tImpact + 250 + i * 130))
    }

    const draw = (t: number) => {
      ctx.setTransform(kx, 0, 0, ky, 0, 0)
      ctx.clearRect(0, 0, W, H)
      drawBackdropAndCrowd(t)
      drawLane(0, t)
      drawLane(1, t)
      drawBallAndBowler(t)
      drawBubbles(t)
    }

    let raf = 0
    let acc = 0
    let last = performance.now()
    let impactSent = false
    const frame = (now: number) => {
      if (!pausedRef.current) acc += (now - last) * speedRef.current
      last = now
      draw(acc)
      if (!impactSent && acc >= tImpact) {
        impactSent = true
        onImpactRef.current()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: `${W} / ${H}` }} />
}
