import { MOODS, type ContentPack, type GameState, type Mood, type PendingDrill, type Stat } from '../model'
import { draws } from './seed'
import { STAT_CAP, statOf, trainStat } from './stats'

/**
 * The games a drill is played as, one for each stat. Each is a plain state stepped by the screen as time passes and as
 * the player presses, and each ends with a score from 0 to 1. What a drill does for its stat is decided by that score:
 * a game not played, or played as badly as it can be, is worth what an hour of focus is.
 */

/** What an hour of a drill is worth in training points: played as badly as it can be, and played perfectly. */
export const DRILL_PER_HOUR = { min: 1, max: 3 } as const

/** How long a game played against the clock lasts, in seconds: twenty at first, and up to thirty, with more to it, the better he is. */
export const roundSeconds = (difficulty: number): number => 20 + 10 * difficulty

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
  const turns = 4 + Math.round(3 * difficulty)
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
  return { kind: 'dexterity', path, tolerance: 0.5 - 0.22 * difficulty, progress: 0, onWire: false, slips: 0, time: 0, limit: roundSeconds(difficulty) }
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
  /** How far he has run, for the path to go by at the speed he runs it. */
  distance: number
  difficulty: number
}

export function createPace(difficulty: number): PaceGame {
  return { kind: 'endurance', rate: 0.3, time: 0, duration: roundSeconds(difficulty), held: 0, distance: 0, difficulty }
}

/** How far he is ahead of the pacer, who runs at the middle of the band: 0 beside her, up to 1 ahead or -1 behind. */
export function paceLead(game: PaceGame): number {
  const band = paceBand(game)
  return Math.max(-1, Math.min(1, (game.rate - band.center) / 0.4))
}

/** Whether he is keeping pace just now: inside the band, which is running beside her. */
export function onPace(game: PaceGame): boolean {
  const band = paceBand(game)
  return Math.abs(game.rate - band.center) <= band.width / 2
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
  // Even flagging he is still moving: the path never stops.
  return {
    ...game,
    time: Math.min(game.duration, game.time + dt),
    rate: within(game.rate - dt * (0.18 + 0.12 * game.difficulty)),
    held: game.held + (onPace(game) ? dt : 0),
    distance: game.distance + dt * (0.2 + game.rate)
  }
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
  const game: CircuitGame = { kind: 'intelligence', size, tiles, from, to, route, time: 0, limit: roundSeconds(difficulty) }
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

// ---- Wisdom: the candles flare in an order, and he lights them again in the same order, one more each time.

/** The colours the candles burn, one to a candle, in the order they stand. */
export const CANDLE_COLORS = ['red', 'orange', 'gold', 'green', 'blue', 'violet'] as const
export type CandleColor = (typeof CANDLE_COLORS)[number]

export interface CandleGame {
  kind: 'wisdom'
  /** How many candles stand in the row: the first so many colours. */
  candles: number
  /** The order they flare in, long enough for any round: each round is the first so many of it. */
  order: number[]
  /** How many flare this round, and how many of them he has lit again so far. */
  length: number
  entered: number
  /** The candles flaring to be watched, or his turn; or over, for a wrong candle. */
  phase: 'showing' | 'repeating' | 'over'
  /** When the phase began: the showing waits a moment before the first flares. */
  phaseAt: number
  /** How long each candle of the showing has to itself. */
  beat: number
  /** The rounds he got through. */
  rounds: number
  /** A candle he lit, flaring until a moment after, and whether it was the right one. */
  lit?: { candle: number; until: number; right: boolean }
  time: number
  duration: number
}

// The order a run starts at, the rounds that make a perfect score, and the pauses around the showing.
const FIRST_LENGTH = 2
const PERFECT_ROUNDS = 5
const LEAD_IN = 0.6
const FLARE = 0.3

export function createCandles(seed: number, difficulty: number): CandleGame {
  const roll = draws(seed)
  const candles = 4 + Math.round(2 * difficulty)
  // No candle twice running, so that each flare is plainly a new one.
  const order: number[] = []
  while (order.length < 40) {
    const next = Math.floor(roll() * candles)
    if (next !== order[order.length - 1]) order.push(next)
  }
  return { kind: 'wisdom', candles, order, length: FIRST_LENGTH, entered: 0, phase: 'showing', phaseAt: 0, beat: 0.7 - 0.25 * difficulty, rounds: 0, time: 0, duration: roundSeconds(difficulty) }
}

/** The candle flaring now, if any: in the showing, the one whose beat it is; in his turn, the one he last lit. */
export function candleLit(game: CandleGame): { candle: number; right: boolean } | undefined {
  if (game.lit && game.time < game.lit.until) return { candle: game.lit.candle, right: game.lit.right }
  if (game.phase !== 'showing') return undefined
  const into = game.time - game.phaseAt - LEAD_IN
  const at = Math.floor(into / game.beat)
  // Each flares for most of its beat, and goes dark before the next, so that the same candle twice would still show twice.
  return into >= 0 && at < game.length && into - at * game.beat < game.beat * 0.75 ? { candle: game.order[at], right: true } : undefined
}

export function stepCandles(game: CandleGame, dt: number): CandleGame {
  if (candlesDone(game)) return game
  const time = Math.min(game.duration, game.time + dt)
  // The showing over, it is his turn.
  if (game.phase === 'showing' && time - game.phaseAt >= LEAD_IN + game.length * game.beat) return { ...game, time, phase: 'repeating', phaseAt: time }
  return { ...game, time }
}

/** He lights a candle: the next in the order, or the run is over. The whole order lit, the next round is one longer. */
export function lightCandle(game: CandleGame, candle: number): CandleGame {
  if (game.phase !== 'repeating' || candlesDone(game) || candle < 0 || candle >= game.candles) return game
  const right = game.order[game.entered] === candle
  const lit = { candle, until: game.time + FLARE, right }
  if (!right) return { ...game, lit, phase: 'over' }
  if (game.entered + 1 < game.length) return { ...game, lit, entered: game.entered + 1 }
  return { ...game, lit, rounds: game.rounds + 1, length: game.length + 1, entered: 0, phase: 'showing', phaseAt: game.time + FLARE }
}

export const candlesDone = (game: CandleGame) => game.phase === 'over' || game.time >= game.duration
export const candlesScore = (game: CandleGame) => within(game.rounds / PERFECT_ROUNDS)

// ---- Charisma: read the mood on each face that comes up to him, and answer it in the tone it wants before she tires of waiting.

/** The tones he answers in, and the mood each is right for. */
export const TONES = ['compliment', 'joke', 'comfort', 'space'] as const
export type Tone = (typeof TONES)[number]
export const TONE_FOR: Record<Mood, Tone> = { happy: 'compliment', bored: 'joke', sad: 'comfort', annoyed: 'space' }

/** One face that comes up: whose, in what mood, and, at his better, the mood it turns to part-way through. */
export interface Face {
  listenerId: string
  mood: Mood
  turn?: { after: number; to: Mood }
}

export interface FaceGame {
  kind: 'charisma'
  faces: Face[]
  /** The face up now, and when it came up: before then, between faces, there is none. */
  current: number
  shownAt: number
  /** How long each face waits for him to answer. */
  patience: number
  /** How each face he has had went, from 0 to 1: a right answer is worth more the sooner it came. */
  results: number[]
  /** Whether the last answer was right, for the screen to say so. */
  lastRight?: boolean
  time: number
  duration: number
}

// The pause between one face and the next.
const FACE_GAP = 0.35

export function createFaces(content: ContentPack, seed: number, difficulty: number): FaceGame {
  const roll = draws(seed)
  const patience = 3 - 1.6 * difficulty
  const duration = roundSeconds(difficulty)
  const ids = content.minigames.listeners.map((one) => one.id)
  const other = <T>(list: readonly T[], not?: T): T => {
    const left = list.filter((one) => one !== not)
    return left[Math.floor(roll() * left.length)]
  }
  // More faces than can come up in the round, each a different stranger and mood from the one before.
  const faces: Face[] = []
  for (let i = 0; i < Math.ceil(duration / FACE_GAP); i++) {
    const before = faces[i - 1]
    const mood = other(MOODS, before?.mood)
    faces.push({ listenerId: other(ids, before?.listenerId), mood, ...(roll() < 0.4 * difficulty && { turn: { after: patience * (0.35 + 0.2 * roll()), to: other(MOODS, mood) } }) })
  }
  return { kind: 'charisma', faces, current: 0, shownAt: 0, patience, results: [], time: 0, duration }
}

/** The face up now and its mood as it is just now, or nothing between faces and once the round is over. */
export function faceNow(game: FaceGame): { face: Face; mood: Mood; waited: number } | undefined {
  const face = game.faces[game.current]
  if (!face || game.time < game.shownAt || facesDone(game)) return undefined
  const waited = game.time - game.shownAt
  return { face, mood: face.turn && waited >= face.turn.after ? face.turn.to : face.mood, waited }
}

const nextFace = (game: FaceGame, result: number, lastRight: boolean): FaceGame => ({
  ...game,
  results: [...game.results, result],
  lastRight,
  current: game.current + 1,
  shownAt: game.time + FACE_GAP
})

export function stepFaces(game: FaceGame, dt: number): FaceGame {
  if (facesDone(game)) return game
  const later = { ...game, time: Math.min(game.duration, game.time + dt) }
  const now = faceNow(later)
  // She would not wait any longer: nothing came of it.
  return now && now.waited >= game.patience ? nextFace(later, 0, false) : later
}

/** He answers the face up now in a tone: right for her mood as it is, and the sooner the better; wrong is nothing. */
export function answerFace(game: FaceGame, tone: Tone): FaceGame {
  const now = faceNow(game)
  if (!now) return game
  const right = TONE_FOR[now.mood] === tone
  return nextFace(game, right ? 1 - 0.5 * (now.waited / game.patience) : 0, right)
}

export const facesDone = (game: FaceGame) => game.time >= game.duration
export const facesScore = (game: FaceGame) => (game.results.length === 0 ? 0 : game.results.reduce((sum, r) => sum + r, 0) / game.results.length)

// ---- Any of them.

export type MiniGame = PowerGame | WireGame | PaceGame | CircuitGame | CandleGame | FaceGame

/** The game a drill is played as, laid out for him as he is now. */
export function createMiniGame(content: ContentPack, state: GameState, drill: PendingDrill): MiniGame {
  const difficulty = difficultyFor(statOf(state, drill.stat))
  const games: Record<Stat, () => MiniGame> = {
    strength: () => createPower(drill.seed, difficulty),
    dexterity: () => createWire(drill.seed, difficulty),
    endurance: () => createPace(difficulty),
    intelligence: () => createCircuit(drill.seed, difficulty),
    wisdom: () => createCandles(drill.seed, difficulty),
    charisma: () => createFaces(content, drill.seed, difficulty)
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
      return stepCandles(game, dt)
    case 'charisma':
      return stepFaces(game, dt)
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
      return candlesDone(game)
    case 'charisma':
      return facesDone(game)
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
      return candlesScore(game)
    case 'charisma':
      return facesScore(game)
  }
}
