/** Детерминированный RNG (mulberry32) — чтобы матч можно было воспроизвести по сиду. */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff)
}

export function pickWeighted<T>(items: readonly T[], weightOf: (t: T) => number, rng: Rng): T {
  let sum = 0
  for (const it of items) sum += weightOf(it)
  let r = rng() * sum
  for (const it of items) {
    r -= weightOf(it)
    if (r <= 0) return it
  }
  return items[items.length - 1]
}

/** Перемешанная копия массива (Фишер-Йетс). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Случайное подмножество размера k (для выбора, какие кегли устояли при недоборе). */
export function pickSubset<T>(items: readonly T[], k: number, rng: Rng): T[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, k).sort((a, b) => (a as number) - (b as number)) as T[]
}
