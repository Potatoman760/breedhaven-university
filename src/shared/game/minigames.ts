import type { ContentPack, GameState, Listener, PendingDrill, Stat, TalkTopic } from '../model'
import { draws } from './seed'
import { STAT_CAP, statOf, trainStat } from './stats'

/**
 * The games a drill is played as, one for each stat. Each is a plain state stepped by the screen as time passes and as
 * the player presses, and each ends with a score from 0 to 1. What a drill does for its stat is decided by that score:
 * a game not played, or played as badly as it can be, is worth what an hour of focus is.
 */

/** What an hour of a drill is worth in training points: played as badly as it can be, and played perfectly. */
export const DRILL_PER_HOUR = { min: 1, max: 3 } as const

const within = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))

/** How hard a game is for him: nothing at an ordinary score, all of it at the cap. */
export function difficultyFor(score: number): number {
  return within((score - 10) / (STAT_CAP - 10))
}

/** What a drill of so many hours is worth, by how its game went. */
export function drillPoints(hours: number, score: number): number {
  return hours * (DRILL_PER_HOUR.min + (DRILL_PER_HOUR.max - DRILL_PER_HOUR.min) * within(score))
}

/** Settles the drill waiting on its game: the stat is worked on by how it went, and nothing is left waiting. */
export function finishDrill(content: ContentPack, state: GameState, score: number): GameState {
  const drill = state.drill
  if (!drill) return state
  return { ...trainStat(content, state, drill.stat, drillPoints(drill.hours, score)), drill: undefined }
}

// ---- Strength: hold to build force, and let go inside the mark.

export interface PowerGame {
  kind: 'strength'
  reps: number
  /** How well each rep went that has been done, from 0 to 1. */
  results: number[]
  /** How far the force has been built, from 0 to 1, and whether he is still building it. */
  force: number
  holding: boolean
  /** What the reps have taken out of him: the mark narrows, and the force shakes, as it grows. */
  fatigue: number
  zone: { center: number; width: number }
  time: number
  difficulty: number
  seed: number
}

const POWER_REPS = 8

function powerZone(seed: number, rep: number, difficulty: number, fatigue: number): PowerGame['zone'] {
  const roll = draws(seed + rep * 7919)()
  return { center: 0.55 + roll * 0.35, width: (0.24 - 0.1 * difficulty) * (1 - 0.45 * fatigue) }
}

export function createPower(seed: number, difficulty: number): PowerGame {
  return { kind: 'strength', reps: POWER_REPS, results: [], force: 0, holding: false, fatigue: 0, zone: powerZone(seed, 0, difficulty, 0), time: 0, difficulty, seed }
}

/** The force as it shows: what he has built, with the shake of a tired arm in it. */
export function shownForce(game: PowerGame): number {
  return within(game.force + Math.sin(game.time * 9) * 0.035 * (game.fatigue + game.difficulty))
}

function powerRep(game: PowerGame, result: number): PowerGame {
  const results = [...game.results, result]
  const fatigue = within(game.fatigue + (result > 0 ? 0.06 : 0.15))
  return { ...game, results, fatigue, force: 0, holding: false, zone: powerZone(game.seed, results.length, game.difficulty, fatigue) }
}

export function stepPower(game: PowerGame, dt: number): PowerGame {
  if (powerDone(game)) return game
  const time = game.time + dt
  if (!game.holding) return { ...game, time }
  const force = game.force + dt * (0.55 + 0.35 * game.difficulty)
  // Held past all he has, the bar comes down: the rep is lost.
  return force >= 1 ? powerRep({ ...game, time }, 0) : { ...game, time, force }
}

export function pressPower(game: PowerGame): PowerGame {
  return powerDone(game) || game.holding ? game : { ...game, holding: true }
}

export function releasePower(game: PowerGame): PowerGame {
  if (!game.holding) return game
  const off = Math.abs(shownForce(game) - game.zone.center) / (game.zone.width / 2)
  return powerRep(game, off <= 1 ? 1 - 0.5 * off : 0)
}

export const powerDone = (game: PowerGame) => game.results.length >= game.reps
export const powerScore = (game: PowerGame) => game.results.reduce((sum, r) => sum + r, 0) / game.reps

// ---- Dexterity: draw the iron along the wire without touching its edges.

/** The board, in units: sixteen across and nine down, so that a distance is the same either way. */
export const BOARD = { width: 16, height: 9 } as const

export interface WireGame {
  kind: 'dexterity'
  /** The wire, as points close together from its start to its end. */
  path: { x: number; y: number }[]
  /** How far from the wire the iron may stray. */
  tolerance: number
  /** The furthest point of the wire reached, and whether the iron is on it now. */
  progress: number
  onWire: boolean
  /** How many times the iron has come off it. */
  slips: number
  time: number
  limit: number
}

export function createWire(seed: number, difficulty: number): WireGame {
  const roll = draws(seed)
  const turns = 6 + Math.round(4 * difficulty)
  const knots = Array.from({ length: turns + 1 }, (_, i) => ({ x: 1.2 + (i / turns) * (BOARD.width - 2.4), y: i === 0 || i === turns ? BOARD.height / 2 : 1.5 + roll() * (BOARD.height - 3) }))
  // Drawn through the knots as a smooth curve, a point every short step.
  const path: { x: number; y: number }[] = []
  for (let i = 0; i < knots.length - 1; i++) {
    const [p0, p1, p2, p3] = [knots[Math.max(0, i - 1)], knots[i], knots[i + 1], knots[Math.min(knots.length - 1, i + 2)]]
    for (let s = 0; s < 12; s++) {
      const t = s / 12
      const curve = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t)
      path.push({ x: curve(p0.x, p1.x, p2.x, p3.x), y: curve(p0.y, p1.y, p2.y, p3.y) })
    }
  }
  path.push(knots[knots.length - 1])
  return { kind: 'dexterity', path, tolerance: 0.5 - 0.22 * difficulty, progress: 0, onWire: false, slips: 0, time: 0, limit: 30 }
}

export function stepWire(game: WireGame, dt: number): WireGame {
  return wireDone(game) ? game : { ...game, time: Math.min(game.limit, game.time + dt) }
}

/** The iron is at a point of the board: it follows the wire on from where it got to, or comes off it. */
export function moveWire(game: WireGame, at: { x: number; y: number }): WireGame {
  if (wireDone(game)) return game
  const near = (i: number) => Math.hypot(game.path[i].x - at.x, game.path[i].y - at.y) <= game.tolerance
  // Off the wire, it is taken up again only where he left it.
  if (!game.onWire) return near(game.progress) ? { ...game, onWire: true } : game
  let best = -1
  for (let i = Math.max(0, game.progress - 4); i <= Math.min(game.path.length - 1, game.progress + 6); i++) if (near(i)) best = i
  return best < 0 ? { ...game, onWire: false, slips: game.slips + 1 } : { ...game, progress: Math.max(game.progress, best) }
}

export const wireDone = (game: WireGame) => game.progress >= game.path.length - 1 || game.time >= game.limit
export function wireScore(game: WireGame): number {
  const steady = within(1 - 0.12 * game.slips)
  const reached = game.progress / (game.path.length - 1)
  return reached >= 1 ? 0.8 * steady + 0.2 * (1 - game.time / game.limit) : 0.8 * steady * reached
}

// ---- Endurance: keep the heart in the band, tapping to push it and easing off to let it fall.

export interface PaceGame {
  kind: 'endurance'
  /** The pace, from 0 to 1. */
  rate: number
  time: number
  duration: number
  /** The time spent in the band. */
  held: number
  difficulty: number
}

export function createPace(difficulty: number): PaceGame {
  return { kind: 'endurance', rate: 0.3, time: 0, duration: 45, held: 0, difficulty }
}

/** Where the pace should be just now: the band drifts, and narrows as the run goes on. */
export function paceBand(game: PaceGame): { center: number; width: number } {
  return {
    center: 0.55 + 0.2 * Math.sin(game.time * (0.15 + 0.25 * game.difficulty)),
    width: (0.3 - 0.12 * game.difficulty) * (1 - 0.3 * (game.time / game.duration))
  }
}

export function stepPace(game: PaceGame, dt: number): PaceGame {
  if (paceDone(game)) return game
  const band = paceBand(game)
  const inside = Math.abs(game.rate - band.center) <= band.width / 2
  return { ...game, time: Math.min(game.duration, game.time + dt), rate: within(game.rate - dt * (0.18 + 0.12 * game.difficulty)), held: game.held + (inside ? dt : 0) }
}

export const tapPace = (game: PaceGame): PaceGame => (paceDone(game) ? game : { ...game, rate: within(game.rate + 0.07) })
export const paceDone = (game: PaceGame) => game.time >= game.duration
export const paceScore = (game: PaceGame) => within(game.held / game.duration)

// ---- Intelligence: turn the tiles of a ward circuit until the lamp is lit from the spark.

// Each tile's ends, as the sides they open on: north, east, south and west.
export const SIDES = { north: 1, east: 2, south: 4, west: 8 } as const
const STEPS = [
  { side: SIDES.north, back: SIDES.south, dr: -1, dc: 0 },
  { side: SIDES.east, back: SIDES.west, dr: 0, dc: 1 },
  { side: SIDES.south, back: SIDES.north, dr: 1, dc: 0 },
  { side: SIDES.west, back: SIDES.east, dr: 0, dc: -1 }
]

export interface CircuitGame {
  kind: 'intelligence'
  size: number
  /** Each tile's ends, row by row. */
  tiles: number[][]
  /** The spark comes in at the west of the first column, and the lamp is past the east of the last. */
  from: number
  to: number
  /** The tiles the circuit was laid through, in order: what counts toward a circuit not finished. */
  route: { r: number; c: number }[]
  time: number
  limit: number
}

export const turned = (ends: number) => ((ends << 1) | (ends >> 3)) & 15

export function createCircuit(seed: number, difficulty: number): CircuitGame {
  const roll = draws(seed)
  const size = 4 + Math.round(2 * difficulty)
  const from = Math.floor(roll() * size)
  const to = Math.floor(roll() * size)
  // A route through the grid from the spark's side to the lamp's, found by a walk that backs out of dead ends.
  const seen = new Set<string>()
  const route: { r: number; c: number }[] = []
  const walk = (r: number, c: number): boolean => {
    seen.add(`${r},${c}`)
    route.push({ r, c })
    if (r === to && c === size - 1) return true
    const ways = STEPS.map((step) => ({ r: r + step.dr, c: c + step.dc })).filter((next) => next.r >= 0 && next.r < size && next.c >= 0 && next.c < size && !seen.has(`${next.r},${next.c}`))
    for (let i = ways.length - 1; i > 0; i--) {
      const j = Math.floor(roll() * (i + 1))
      ;[ways[i], ways[j]] = [ways[j], ways[i]]
    }
    for (const next of ways) if (walk(next.r, next.c)) return true
    route.pop()
    return false
  }
  walk(from, 0)
  const tiles = Array.from({ length: size }, () => Array.from({ length: size }, () => [5, 3, 7][Math.floor(roll() * 3)]))
  route.forEach(({ r, c }, i) => {
    const before = i === 0 ? { r, c: -1 } : route[i - 1]
    const after = i === route.length - 1 ? { r, c: size } : route[i + 1]
    tiles[r][c] = STEPS.filter((step) => [before, after].some((cell) => cell.r === r + step.dr && cell.c === c + step.dc)).reduce((ends, step) => ends | step.side, 0)
  })
  // Every tile turned a random way, and once more if that left the circuit whole.
  for (const row of tiles) for (let c = 0; c < row.length; c++) for (let n = Math.floor(roll() * 4); n > 0; n--) row[c] = turned(row[c])
  const game: CircuitGame = { kind: 'intelligence', size, tiles, from, to, route, time: 0, limit: 60 }
  return circuitLit(game).solved ? turnTile(game, from, 0) : game
}

/** The tiles the spark reaches, and whether it gets to the lamp. */
export function circuitLit(game: CircuitGame): { lit: Set<string>; solved: boolean } {
  const lit = new Set<string>()
  if (!(game.tiles[game.from][0] & SIDES.west)) return { lit, solved: false }
  const queue = [{ r: game.from, c: 0 }]
  lit.add(`${game.from},0`)
  while (queue.length > 0) {
    const { r, c } = queue.shift()!
    for (const step of STEPS) {
      const [nr, nc] = [r + step.dr, c + step.dc]
      if (!(game.tiles[r][c] & step.side) || nr < 0 || nr >= game.size || nc < 0 || nc >= game.size || lit.has(`${nr},${nc}`)) continue
      if (game.tiles[nr][nc] & step.back) {
        lit.add(`${nr},${nc}`)
        queue.push({ r: nr, c: nc })
      }
    }
  }
  return { lit, solved: lit.has(`${game.to},${game.size - 1}`) && (game.tiles[game.to][game.size - 1] & SIDES.east) !== 0 }
}

export function turnTile(game: CircuitGame, r: number, c: number): CircuitGame {
  if (circuitDone(game)) return game
  return { ...game, tiles: game.tiles.map((row, i) => (i === r ? row.map((ends, j) => (j === c ? turned(ends) : ends)) : row)) }
}

export const stepCircuit = (game: CircuitGame, dt: number): CircuitGame => (circuitDone(game) ? game : { ...game, time: Math.min(game.limit, game.time + dt) })
export const circuitDone = (game: CircuitGame) => game.time >= game.limit || circuitLit(game).solved
export function circuitScore(game: CircuitGame): number {
  const { lit, solved } = circuitLit(game)
  if (solved) return 0.6 + 0.4 * (1 - game.time / game.limit)
  return 0.6 * (game.route.filter(({ r, c }) => lit.has(`${r},${c}`)).length / game.route.length)
}

// ---- Wisdom: hold as the ring grows, let go as it shrinks.

export interface BreathGame {
  kind: 'wisdom'
  /** Each breath: how long it is drawn in, and how long let out. */
  breaths: { inhale: number; exhale: number }[]
  holding: boolean
  time: number
  /** The time he has been in step with the ring, and the presses that broke the quiet. */
  inStep: number
  fumbles: number
  /** How long a change of the ring is forgiven him while he follows it. */
  grace: number
}

export function createBreath(seed: number, difficulty: number): BreathGame {
  const roll = draws(seed)
  const breaths = Array.from({ length: 6 }, () => ({ inhale: 4 + (roll() - 0.5) * 2.4 * difficulty, exhale: 4 + (roll() - 0.5) * 2.4 * difficulty }))
  return { kind: 'wisdom', breaths, holding: false, time: 0, inStep: 0, fumbles: 0, grace: 0.5 - 0.25 * difficulty }
}

const breathLength = (game: BreathGame) => game.breaths.reduce((sum, b) => sum + b.inhale + b.exhale, 0)

/** Where the ring is now: drawing in or letting out, how far through it, and its size from 0 to 1. */
export function breathAt(game: BreathGame): { inhaling: boolean; into: number; size: number } {
  let left = game.time
  for (const breath of game.breaths) {
    if (left < breath.inhale) return { inhaling: true, into: left, size: left / breath.inhale }
    left -= breath.inhale
    if (left < breath.exhale) return { inhaling: false, into: left, size: 1 - left / breath.exhale }
    left -= breath.exhale
  }
  return { inhaling: false, into: 0, size: 0 }
}

export function stepBreath(game: BreathGame, dt: number): BreathGame {
  if (breathDone(game)) return game
  const now = breathAt(game)
  const inStep = now.into < game.grace || game.holding === now.inhaling
  return { ...game, time: Math.min(breathLength(game), game.time + dt), inStep: game.inStep + (inStep ? dt : 0) }
}

export function pressBreath(game: BreathGame): BreathGame {
  if (breathDone(game) || game.holding) return game
  const now = breathAt(game)
  return { ...game, holding: true, fumbles: game.fumbles + (now.inhaling || now.into < game.grace ? 0 : 1) }
}

export const releaseBreath = (game: BreathGame): BreathGame => ({ ...game, holding: false })
export const breathDone = (game: BreathGame) => game.time >= breathLength(game)
export const breathScore = (game: BreathGame) => within(game.inStep / breathLength(game) - 0.03 * game.fumbles)

// ---- Charisma: bring up what the room warms to, and learn what that is from how it takes what he says.

export interface RoomGame {
  kind: 'charisma'
  listeners: Listener[]
  /** How taken each of them is with him, from 0 to 1. */
  attention: number[]
  /** The topics in his hand to bring up next, and those he has already brought up. */
  hand: TalkTopic[]
  said: string[]
  turns: number
  /** How each took the last thing he said: up, down, or neither. */
  last: number[]
  seed: number
  topics: TalkTopic[]
}

const ROOM_TURNS = 6
const HAND = 4

function dealHand(topics: TalkTopic[], seed: number, turn: number): TalkTopic[] {
  const roll = draws(seed + turn * 104729)
  return [...topics].sort(() => roll() - 0.5).slice(0, HAND)
}

export function createRoom(content: ContentPack, seed: number, difficulty: number): RoomGame {
  const roll = draws(seed)
  const count = Math.min(content.minigames.listeners.length, 3 + Math.round(difficulty))
  const listeners = [...content.minigames.listeners].sort(() => roll() - 0.5).slice(0, count)
  const topics = content.minigames.topics
  return { kind: 'charisma', listeners, attention: listeners.map(() => 0.5), hand: dealHand(topics, seed, 0), said: [], turns: ROOM_TURNS, last: listeners.map(() => 0), seed, topics }
}

/** He brings up a topic in his hand: each of them warms to it, tires of it, or is bored by it; less the second time. */
export function sayTopic(game: RoomGame, topicId: string): RoomGame {
  if (roomDone(game) || !game.hand.some((topic) => topic.id === topicId)) return game
  const again = game.said.includes(topicId) ? 0.5 : 1
  const last = game.listeners.map((one) => (one.likes.includes(topicId) ? 0.25 : one.dislikes.includes(topicId) ? -0.2 : -0.05) * again)
  const said = [...game.said, topicId]
  return { ...game, said, last, attention: game.attention.map((a, i) => within(a + last[i])), hand: dealHand(game.topics, game.seed, said.length) }
}

export const roomDone = (game: RoomGame) => game.said.length >= game.turns
export const roomScore = (game: RoomGame) => within((game.attention.reduce((sum, a) => sum + a, 0) / Math.max(1, game.attention.length) - 0.3) / 0.7)

// ---- Any of them.

export type MiniGame = PowerGame | WireGame | PaceGame | CircuitGame | BreathGame | RoomGame

/** The game a drill is played as, laid out for him as he is now. */
export function createMiniGame(content: ContentPack, state: GameState, drill: PendingDrill): MiniGame {
  const difficulty = difficultyFor(statOf(state, drill.stat))
  const games: Record<Stat, () => MiniGame> = {
    strength: () => createPower(drill.seed, difficulty),
    dexterity: () => createWire(drill.seed, difficulty),
    endurance: () => createPace(difficulty),
    intelligence: () => createCircuit(drill.seed, difficulty),
    wisdom: () => createBreath(drill.seed, difficulty),
    charisma: () => createRoom(content, drill.seed, difficulty)
  }
  return games[drill.stat]()
}

export function stepMiniGame(game: MiniGame, dt: number): MiniGame {
  switch (game.kind) {
    case 'strength':
      return stepPower(game, dt)
    case 'dexterity':
      return stepWire(game, dt)
    case 'endurance':
      return stepPace(game, dt)
    case 'intelligence':
      return stepCircuit(game, dt)
    case 'wisdom':
      return stepBreath(game, dt)
    case 'charisma':
      return game
  }
}

export function miniGameDone(game: MiniGame): boolean {
  switch (game.kind) {
    case 'strength':
      return powerDone(game)
    case 'dexterity':
      return wireDone(game)
    case 'endurance':
      return paceDone(game)
    case 'intelligence':
      return circuitDone(game)
    case 'wisdom':
      return breathDone(game)
    case 'charisma':
      return roomDone(game)
  }
}

export function miniGameScore(game: MiniGame): number {
  switch (game.kind) {
    case 'strength':
      return powerScore(game)
    case 'dexterity':
      return wireScore(game)
    case 'endurance':
      return paceScore(game)
    case 'intelligence':
      return circuitScore(game)
    case 'wisdom':
      return breathScore(game)
    case 'charisma':
      return roomScore(game)
  }
}
