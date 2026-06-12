/**
 * Балансовый прогон движка: npm run sim
 * 1) юнит-проверки боулинг-скоринга;
 * 2) инвариант монотонности (GAME_PLAN.md §3) на синтетических игроках;
 * 3) эффект волатильности новичков;
 * 4) реализм на настоящем ростере (медиана / топ / низ);
 * 5) эффект клубного бонуса.
 * Падает с ненулевым кодом, если инвариант нарушен или скоринг неверен.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  aiRolloffStart,
  buildRatedRoster,
  leftyBonuses,
  displayCoef,
  mulberry32,
  playBakerGame,
  playMatch,
  playRolloff,
  playTwoGames,
  scoreGame,
  teamHcp,
  toMatchPlayer,
  type MatchPlayer,
  type RatedPlayer,
  type RosterPlayer,
} from '../src/engine'

let failed = false
function check(cond: boolean, msg: string) {
  if (!cond) {
    failed = true
    console.error(`  FAIL: ${msg}`)
  }
}

// ---------- 1. Скоринг ----------
console.log('=== Скоринг (юнит-проверки) ===')
{
  const perfect = scoreGame([...Array(9).fill([10]), [10, 10, 10]])
  check(perfect.total === 300, `perfect game = ${perfect.total}, ожидалось 300`)
  const dutch190 = scoreGame([...Array(9).fill([9, 1]), [9, 1, 9]])
  check(dutch190.total === 190, `все спэры 9/ + 9 = ${dutch190.total}, ожидалось 190`)
  const open = scoreGame([...Array(9).fill([8, 1]), [8, 1]])
  check(open.total === 90, `все открытые 8-1 = ${open.total}, ожидалось 90`)
  const mixed = scoreGame([[10], [7, 3], [9, 0], [10], [0, 8], [8, 2], [0, 6], [10], [10], [10, 8, 1]])
  check(mixed.total === 167, `классический пример = ${mixed.total}, ожидалось 167`)
  console.log('  скоринг ок')
}

// ---------- хелперы ----------
function syntheticPlayer(skill: number, vol = 0, hand: 'R' | 'L' = 'R'): MatchPlayer {
  return {
    id: 0, name: 'bot', gender: 'М', hand, club: '—', avg: 0, games: 999,
    baseRating: 0, rel: 1 - vol, rarity: 'common', clubBonus: 0, leftyBonus: 0,
    effRating: 0, skill, vol,
  }
}

interface SimStats {
  meanTotal: number
  strikePct: number
  badPct: number // сплит+вошаут+желоб+дикий на первых бросках
  convPct: number // успешные добои / попытки добоя
}

function simSolo(p: MatchPlayer, games: number, seed: number): SimStats {
  const rng = mulberry32(seed)
  const lineup = [p, p, p, p, p]
  let total = 0
  let first = 0, strikes = 0, bad = 0, convTry = 0, convOk = 0
  for (let i = 0; i < games; i++) {
    const g = playBakerGame(lineup, rng)
    total += g.total
    for (const e of g.events) {
      if (e.throwIndex === 0 || (e.frame === 10 && e.pinsBefore.length === 10)) {
        first++
        if (e.isStrike) strikes++
        if (e.leaveKind && ['split', 'washout', 'gutter', 'wild'].includes(e.leaveKind)) bad++
      } else {
        convTry++
        if (e.isSpare) convOk++
      }
    }
  }
  return {
    meanTotal: total / games,
    strikePct: (100 * strikes) / first,
    badPct: (100 * bad) / first,
    convPct: convTry ? (100 * convOk) / convTry : 0,
  }
}

const fmt = (x: number) => x.toFixed(1).padStart(6)

// ---------- 2. Монотонность ----------
console.log('\n=== Монотонность по skill (синтетика, 4000 игр на точку) ===')
console.log('skill | coef | mean | strike% | bad% | conv%')
{
  const skills = [-45, -35, -25, -15, -5, 0, 5, 15, 25, 35, 50]
  let prev: SimStats | null = null
  for (const s of skills) {
    const st = simSolo(syntheticPlayer(s), 4000, 1000 + s)
    console.log(
      `${String(s).padStart(5)} | ${displayCoef(s).toFixed(2)} |${fmt(st.meanTotal)} |${fmt(st.strikePct)} |${fmt(st.badPct)} |${fmt(st.convPct)}`,
    )
    if (prev) {
      check(st.meanTotal > prev.meanTotal, `mean total не растёт на skill=${s}`)
      check(st.strikePct > prev.strikePct, `strike% не растёт на skill=${s}`)
      check(st.badPct < prev.badPct, `bad% не падает на skill=${s}`)
      check(st.convPct > prev.convPct, `conv% не растёт на skill=${s}`)
    }
    prev = st
  }
}

// ---------- 3. Волатильность ----------
console.log('\n=== Волатильность (skill=0): vol 0 vs 0.7 ===')
{
  const calm = simSolo(syntheticPlayer(0, 0), 4000, 7)
  const wild = simSolo(syntheticPlayer(0, 0.7), 4000, 8)
  console.log(`vol=0.0: mean ${fmt(calm.meanTotal)}, bad ${fmt(calm.badPct)}%, conv ${fmt(calm.convPct)}%`)
  console.log(`vol=0.7: mean ${fmt(wild.meanTotal)}, bad ${fmt(wild.badPct)}%, conv ${fmt(wild.convPct)}%`)
  check(wild.meanTotal < calm.meanTotal, 'волатильный должен набирать меньше')
  check(wild.badPct > calm.badPct, 'у волатильного должно быть больше плохих ливов')
}

// ---------- 4. Реализм на настоящем ростере ----------
console.log('\n=== Реальный ростер ===')
{
  const roster: RosterPlayer[] = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'data', 'roster.json'), 'utf-8'),
  )
  const rated = buildRatedRoster(roster)
  const ratings = rated.players.map((p) => p.baseRating).sort((a, b) => a - b)
  const q = (p: number) => ratings[Math.floor((ratings.length * p) / 100)]
  console.log(`игроков: ${rated.players.length}, r80 (coef=1): ${rated.r80}, средний лиги: ${rated.leagueAvg.toFixed(1)}`)
  console.log(`рейтинги: min ${ratings[0]}, p25 ${q(25)}, p50 ${q(50)}, p75 ${q(75)}, max ${ratings[ratings.length - 1]}`)

  const mp = (p: RatedPlayer) => toMatchPlayer(p, 'common', 0, rated.r80)
  const byRating = [...rated.players].sort((a, b) => b.baseRating - a.baseRating)
  const top5 = byRating.slice(0, 5).map(mp)
  const bottom5 = byRating.slice(-5).map(mp)
  const mid = byRating.filter((p) => Math.abs(p.baseRating - rated.r80 + 10) <= 2).slice(0, 5)
  const mid5 = mid.map(mp)

  const realAvg = (ps: MatchPlayer[]) => ps.reduce((s, p) => s + p.avg, 0) / ps.length
  console.log('\nкоманда      | реальн.avg | бейкер-тотал (3000 игр)')
  for (const [name, team] of [['топ-5', top5], ['медиана', mid5], ['низ-5', bottom5]] as const) {
    const rng = mulberry32(42)
    let sum = 0
    for (let i = 0; i < 3000; i++) sum += playBakerGame(team, rng).total
    console.log(`${name.padEnd(12)} | ${fmt(realAvg(team))}     | ${fmt(sum / 3000)}`)
  }

  // Хвосты распределения: хайскоры должны существовать, но оставаться событием.
  for (const [name, team] of [['топ-5', top5], ['медиана', mid5]] as const) {
    const rngT = mulberry32(321)
    const N = 20000
    let max = 0
    let c250 = 0
    let c279 = 0
    let c300 = 0
    for (let i = 0; i < N; i++) {
      const t = playBakerGame(team, rngT).total
      if (t > max) max = t
      if (t >= 250) c250++
      if (t >= 279) c279++
      if (t === 300) c300++
    }
    console.log(
      `хайскоры (${name}): max ${max}, 250+ ${((100 * c250) / N).toFixed(2)}%, 279+ ${((100 * c279) / N).toFixed(2)}%, 300 ровно ${((100 * c300) / N).toFixed(3)}%`,
    )
  }

  // Частота «диких» ливов — целевое: порядка 1 игры из 50–100 (у слабых чаще, но не разгул).
  for (const [name, team] of [['медиана', mid5], ['низ-5', bottom5]] as const) {
    const rngW = mulberry32(123)
    const N = 20000
    let wildGames = 0
    for (let i = 0; i < N; i++) {
      if (playBakerGame(team, rngW).events.some((e) => e.leaveKind === 'wild')) wildGames++
    }
    const share = (100 * wildGames) / N
    console.log(`«дикие» ливы (${name}): ${share.toFixed(2)}% игр (~1 из ${wildGames ? Math.round(N / wildGames) : '>20000'})`)
    check(share < 3, `дикие ливы у «${name}» чаще 3% игр`)
  }

  const rng = mulberry32(99)
  let topWins = 0
  for (let i = 0; i < 2000; i++) if (playMatch(top5, bottom5, rng).winner === 0) topWins++
  console.log(`\nтоп-5 vs низ-5: винрейт топов ${(topWins / 20).toFixed(1)}%`)
  check(topWins / 2000 > 0.85, 'топ-команда должна выигрывать у худшей >85%')

  // ---------- 5. Клубный бонус ----------
  const mid5boost = mid.map((p) => toMatchPlayer(p, 'common', 20, rated.r80))
  let boostWins = 0
  const rng2 = mulberry32(7)
  for (let i = 0; i < 2000; i++) if (playMatch(mid5boost, mid5, rng2).winner === 0) boostWins++
  const rngA = mulberry32(11)
  let sumBase = 0, sumBoost = 0
  for (let i = 0; i < 3000; i++) sumBase += playBakerGame(mid5, rngA).total
  for (let i = 0; i < 3000; i++) sumBoost += playBakerGame(mid5boost, rngA).total
  console.log(`клубный бонус +20 у медианной пятёрки: тотал ${fmt(sumBase / 3000)} -> ${fmt(sumBoost / 3000)}, винрейт ${(boostWins / 20).toFixed(1)}%`)
  check(boostWins / 2000 > 0.6, 'бонус +20 должен заметно повышать винрейт')

  // ---------- 6. Гандикап за девушек: +2 очка к итогу игры за каждую ----------
  check(teamHcp([{ gender: 'М' }, { gender: 'М' }, { gender: 'М' }]) === 0, 'teamHcp: без девушек 0')
  check(
    teamHcp([{ gender: 'Ж' }, { gender: 'Ж' }, { gender: 'Ж' }, { gender: 'М' }, { gender: 'М' }]) === 6,
    'teamHcp: 3 девушки = +6',
  )
  check(teamHcp(Array(5).fill({ gender: 'Ж' })) === 10, 'teamHcp: 5 девушек = +10')

  // Бонусы левшей «EZ»: +10 / +5 / 0 / -5 / -10 каждому левше.
  const hands = (hs: string[]) => hs.map((hand) => ({ hand }))
  check(leftyBonuses(hands(['R', 'R', 'R', 'R', 'L']))[4] === 10, 'EZ: одинокий левша +10')
  check(leftyBonuses(hands(['L', 'L', 'R', 'R', 'R']))[0] === 5, 'EZ: два левши +5 каждому')
  check(leftyBonuses(hands(['L', 'L', 'L', 'R', 'R']))[0] === 0, 'EZ: три левши 0')
  check(leftyBonuses(hands(['L', 'L', 'L', 'L', 'R']))[0] === -5, 'EZ: четыре левши -5')
  check(leftyBonuses(hands(['L', 'L', 'L', 'L', 'L']))[0] === -10, 'EZ: пять левшей -10')
  check(leftyBonuses(hands(['R', 'L', 'R', 'R', 'R']))[0] === 0, 'EZ: правшам бонус не положен')

  const mAll = byRating.filter((p) => p.gender === 'М')
  const startM = Math.max(0, Math.floor(mAll.length / 2) - 2)
  const midM = mAll.slice(startM, startM + 5).map(mp)
  const midF = midM.map((p) => ({ ...p, gender: 'Ж' }))
  let fWins = 0
  const rngH = mulberry32(13)
  for (let i = 0; i < 3000; i++) if (playMatch(midF, midM, rngH).winner === 0) fWins++
  console.log(`гандикап ♀ +10 у зеркальной команды: винрейт ${(fWins / 30).toFixed(1)}% (ожидание ~60%)`)
  check(fWins / 3000 > 0.55, 'гандикап +10 должен давать ощутимое преимущество')

  // ---------- 7. Серия из 2 игр + ролл-офф (формат ТВ-финала) ----------
  {
    // aiRolloffStart: сильнейшая тройка подряд
    const fake = [50, 60, 90, 80, 70].map((r, i) => ({ ...midM[i], effRating: r }))
    check(aiRolloffStart(fake) === 2, 'aiRolloffStart: старт с сильнейшей тройки (слот 3)')

    const rngS = mulberry32(77)
    const N = 2000
    let rolloffs = 0
    for (let i = 0; i < N; i++) {
      const two = playTwoGames(mid5, midM, rngS)
      const ptsSum = two.points[0] + two.points[1]
      check(Math.abs(ptsSum - 2) < 1e-9, 'очки серии всегда в сумме 2')
      if (two.tied) rolloffs++
    }
    console.log(`серии, дошедшие до ролл-оффа: ${((100 * rolloffs) / N).toFixed(1)}%`)

    const rngR = mulberry32(88)
    for (let i = 0; i < 500; i++) {
      const ro = playRolloff(mid5, midM, 2, 4, rngR)
      const last = ro.rounds[ro.rounds.length - 1].score
      check(ro.rounds.length >= 3, 'ролл-офф: минимум 3 раунда')
      check(Math.max(last[0], last[1]) >= 3 && last[0] !== last[1], 'ролл-офф: конец при 3+ с перевесом')
      ro.rounds.forEach((r, j) => {
        check(r.a.slot === (2 + j) % 5, 'ролл-офф: очерёдность слотов A (3-4-5-1-2)')
        check(r.b.slot === (4 + j) % 5, 'ролл-офф: очерёдность слотов B (5-1-2-3-4)')
      })
    }
    console.log('ролл-офф: очерёдность, минимум раундов и условие победы ок (500 прогонов)')
  }
}

console.log(failed ? '\n!!! ЕСТЬ ПРОВАЛЕННЫЕ ПРОВЕРКИ' : '\nвсе проверки пройдены')
process.exit(failed ? 1 : 0)
