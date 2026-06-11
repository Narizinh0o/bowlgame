import { useEffect, useRef } from 'react'
import type { Reaction, ThrowEvent } from '../engine'

/**
 * Анимация одного броска (этап 5): дорожка в перспективе (вид сзади-сверху),
 * мультяшный боулер-стикмен, шар с поздним «хуком» (у левши зеркальным),
 * разлёт кеглей по результату движка, реакция-поза + эмодзи после удара.
 * Компонент пересоздаётся на каждый бросок (key), сам зовёт onImpact в момент удара.
 */

const W = 400
const H = 270
const CX = W / 2
const Y0 = 238 // линия заброса
const Y1 = 64 // пин-дек
const HALF0 = 132 // полуширина дорожки у линии заброса
const HALF1 = 46 // полуширина у кеглей

const T_APPROACH_FULL = 420
const T_APPROACH_SHORT = 240
const T_ROLL = 1000
const T_FALL = 420 // разлёт кеглей

/** Перспективное сжатие: ближние метры «длиннее» дальних. */
const persp = (s: number) => Math.pow(Math.max(0, s), 0.78)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (k: number) => k * k * (3 - 2 * k)

function project(u: number, s: number): { x: number; y: number; scale: number } {
  const f = persp(s)
  const half = lerp(HALF0, HALF1, f)
  return { x: CX + u * half, y: lerp(Y0, Y1, f), scale: half / HALF0 }
}

/** Поперечные позиции кеглей (u) и их глубина (s). 1-я кегля ближе всех. */
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

  // Желоб: первый бросок, ничего не сбито, стоят все 10.
  if (ev.pinsDown === 0 && ev.leaveAfter.length === 10) {
    return { u0: 0.35 * sign, uBreak: 0.85 * sign, uT: 1.12 * sign, gutter: true, approach }
  }

  const downPins = ev.pinsBefore.filter((p) => !ev.leaveAfter.includes(p))
  const meanU = (pins: number[]) =>
    pins.length ? pins.reduce((s, p) => s + PIN_POS[p].u, 0) / pins.length : 0

  let uT: number
  if (full) {
    uT = ev.isStrike ? pocket : 0.55 * meanU(downPins) + 0.45 * pocket
  } else if (downPins.length > 0) {
    uT = meanU(downPins) // добой: в центр сбитых
  } else {
    const miss = Math.random() < 0.5 ? -0.25 : 0.25
    uT = meanU(ev.pinsBefore) + miss // промах: мимо центра стоящих
  }

  if (full) {
    return { u0: 0.35 * sign, uBreak: 0.62 * sign, uT, gutter: false, approach }
  }
  // Добой — почти прямой бросок с лёгким изгибом.
  const u0 = uT * 0.45
  return { u0, uBreak: lerp(u0, uT, 0.55) + 0.1 * sign, uT, gutter: false, approach }
}

/** Поперечная позиция шара по глубине: разгон наружу, поздний резкий хук в цель. */
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

interface FallPin {
  pin: number
  vx: number
  vy: number
  rot: number
}

interface Props {
  ev: ThrowEvent
  hand: string
  gender: string
  team: 0 | 1
  speed: 1 | 2
  reaction: Reaction
  onImpact: () => void
}

const TEAM_COLOR = ['#f59e0b', '#94a3b8'] // amber-500 / slate-400

const REACTION_EMOJI: Record<Reaction, string> = {
  huge_joy: '🤩',
  joy: '😄',
  cocky: '😎',
  neutral: '',
  sad: '😟',
  huge_sad: '😱',
  stone_face: '🗿',
}

export default function LaneView({ ev, hand, gender, team, speed, reaction, onImpact }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onImpactRef = useRef(onImpact)
  onImpactRef.current = onImpact
  const speedRef = useRef(speed)
  speedRef.current = speed

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth || 400
    const cssH = (cssW * H) / W
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    const kx = (cssW * dpr) / W
    const ky = (cssH * dpr) / H

    const params = computeParams(ev, hand)
    const sign = hand === 'L' ? -1 : 1
    const tImpact = params.approach + T_ROLL
    const downPins = ev.pinsBefore.filter((p) => !ev.leaveAfter.includes(p))
    const falls: FallPin[] = downPins.map((pin) => ({
      pin,
      vx: (Math.random() - 0.5) * 90,
      vy: -(25 + Math.random() * 55),
      rot: (Math.random() - 0.5) * 14,
    }))
    const color = TEAM_COLOR[team]
    const isFemale = gender === 'Ж'

    const drawPinShape = (x: number, y: number, h: number, alpha: number, rot: number) => {
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

    const drawBowler = (t: number) => {
      const homeX = project(params.u0, 0).x - sign * 30
      let bx = homeX
      let by = Y0 + 18
      const inResult = t >= tImpact + 150
      const pose: Reaction | 'throw' = inResult ? reaction : 'throw'

      if (pose === 'huge_joy') by += -Math.abs(Math.sin(t / 90)) * 6
      const crouch = pose === 'huge_sad' ? 9 : 0
      by += crouch

      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // ноги
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 4
      const legBend = pose === 'huge_sad' ? 5 : 0
      ctx.beginPath()
      ctx.moveTo(bx, by - 14)
      ctx.lineTo(bx - 6, by - legBend)
      ctx.moveTo(bx, by - 14)
      ctx.lineTo(bx + 6, by - legBend)
      ctx.stroke()

      // туловище (цвет команды)
      ctx.strokeStyle = color
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(bx, by - 14)
      ctx.lineTo(bx, by - 34)
      ctx.stroke()

      // голова + волосы
      const headDrop = pose === 'sad' || pose === 'huge_sad' ? 3 : 0
      const hy = by - 42 + headDrop
      ctx.fillStyle = '#fcd9b8'
      ctx.beginPath()
      ctx.arc(bx, hy, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(bx, hy - 1.5, 7, Math.PI * 1.05, Math.PI * 1.95)
      ctx.stroke()
      if (isFemale) {
        ctx.beginPath()
        ctx.moveTo(bx - sign * 6, hy - 3)
        ctx.quadraticCurveTo(bx - sign * 12, hy + 2, bx - sign * 10, hy + 10)
        ctx.stroke()
      }

      // руки
      ctx.strokeStyle = '#cbd5e1'
      ctx.lineWidth = 4
      const sx = bx
      const sy = by - 30
      ctx.beginPath()
      if (pose === 'throw') {
        // свободная рука
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx - sign * 9, sy + 12)
        // бросковая рука: маятник во время подхода
        const k = Math.min(1, t / params.approach)
        const ang = lerp(2.5, 0.45, smooth(k)) // от замаха назад к выпуску
        const ax = sx + sign * Math.sin(ang) * 14
        const ay = sy + Math.cos(ang) * 14
        ctx.moveTo(sx, sy)
        ctx.lineTo(ax, ay)
        ctx.stroke()
        // шар в руке до выпуска
        if (t < params.approach) {
          ctx.fillStyle = '#991b1b'
          ctx.beginPath()
          ctx.arc(ax, ay + 3, 5, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (pose === 'huge_joy') {
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx - 9, sy - 13)
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + 9, sy - 13)
        ctx.stroke()
      } else if (pose === 'joy' || pose === 'cocky') {
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx - sign * 8, sy + 11)
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + sign * 9, sy - 12)
        ctx.stroke()
      } else if (pose === 'huge_sad') {
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx - 7, hy + 2)
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + 7, hy + 2)
        ctx.stroke()
      } else {
        // sad / stone_face / neutral: руки висят
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx - 5, sy + 13)
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + 5, sy + 13)
        ctx.stroke()
      }
      ctx.restore()

      // эмодзи-реакция над головой
      if (inResult && reaction !== 'neutral') {
        const emoji = REACTION_EMOJI[reaction]
        if (emoji) {
          const tr = t - (tImpact + 150)
          const pop = reaction === 'stone_face' ? 1 : Math.min(1, tr / 180)
          const huge = reaction === 'huge_joy' || reaction === 'huge_sad'
          const dx = huge ? Math.sin(t / 60) * 2.5 : 0
          ctx.save()
          ctx.font = `${Math.round(20 * (0.4 + 0.6 * pop))}px serif`
          ctx.textAlign = 'center'
          ctx.fillText(emoji, bx + sign * 16 + dx, hy - 12)
          ctx.restore()
        }
      }
    }

    const draw = (t: number) => {
      ctx.setTransform(kx, 0, 0, ky, 0, 0)
      ctx.clearRect(0, 0, W, H)

      // пит за кеглями
      ctx.fillStyle = '#0b1220'
      ctx.fillRect(CX - HALF1 - 20, Y1 - 26, (HALF1 + 20) * 2, 30)

      // желоба
      ctx.fillStyle = '#1e293b'
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(project(side * 1.0, 0).x, Y0)
        ctx.lineTo(project(side * 1.0, 1.04).x, project(0, 1.04).y)
        ctx.lineTo(project(side * 1.16, 1.04).x, project(0, 1.04).y)
        ctx.lineTo(project(side * 1.16, 0).x, Y0)
        ctx.closePath()
        ctx.fill()
      }

      // дорожка
      const grad = ctx.createLinearGradient(0, Y0, 0, Y1)
      grad.addColorStop(0, '#8a6230')
      grad.addColorStop(1, '#52391b')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(CX - HALF0, Y0)
      ctx.lineTo(CX - HALF1, Y1)
      ctx.lineTo(CX + HALF1, Y1)
      ctx.lineTo(CX + HALF0, Y0)
      ctx.closePath()
      ctx.fill()

      // швы досок
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'
      ctx.lineWidth = 1
      for (let u = -0.75; u <= 0.76; u += 0.25) {
        const a = project(u, 0)
        const b = project(u, 1.0)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      // стрелки прицеливания
      ctx.fillStyle = 'rgba(127,29,29,0.85)'
      for (let u = -0.75; u <= 0.76; u += 0.25) {
        const p = project(u, 0.26)
        const sz = 5 * p.scale + 2
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - sz)
        ctx.lineTo(p.x - sz * 0.55, p.y + sz * 0.5)
        ctx.lineTo(p.x + sz * 0.55, p.y + sz * 0.5)
        ctx.closePath()
        ctx.fill()
      }

      // Кегли (от дальних к ближним). До удара стоит ВСЯ расстановка pinsBefore;
      // в момент удара сбитые разлетаются, остаток продолжает стоять.
      const order = [7, 8, 9, 10, 4, 5, 6, 2, 3, 1]
      for (const pin of order) {
        const pos = PIN_POS[pin]
        const pr = project(pos.u, pos.s)
        const h = 30 * pr.scale
        if (!ev.pinsBefore.includes(pin)) continue // сбита ещё прошлым броском
        const survives = ev.leaveAfter.includes(pin)
        if (survives || t < tImpact) {
          drawPinShape(pr.x, pr.y, h, 1, 0)
        } else {
          const ft = (t - tImpact) / T_FALL
          if (ft < 1) {
            const fall = falls.find((f) => f.pin === pin)
            if (fall) {
              const fx = pr.x + fall.vx * ft
              const fy = pr.y + fall.vy * ft + 90 * ft * ft
              drawPinShape(fx, fy, h, 1 - ft, fall.rot * ft)
            }
          }
        }
      }

      // шар
      const tBall = t - params.approach
      if (tBall >= 0 && tBall <= T_ROLL + 60) {
        const s = Math.min(1.02, (tBall / T_ROLL) * 1.02)
        if (!(t > tImpact + 50)) {
          const u = ballU(s, params)
          const pr = project(u, s)
          const r = lerp(11, 4.5, persp(Math.max(0, s)))
          const gy = params.gutter && s > 0.72 ? 4 : 0 // провалился в желоб
          ctx.fillStyle = 'rgba(0,0,0,0.3)'
          ctx.beginPath()
          ctx.ellipse(pr.x, pr.y + r * 0.55 + gy, r * 0.9, r * 0.32, 0, 0, Math.PI * 2)
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
      }

      drawBowler(t)
    }

    let raf = 0
    let acc = 0
    let last = performance.now()
    let impactSent = false
    const frame = (now: number) => {
      acc += (now - last) * speedRef.current
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
