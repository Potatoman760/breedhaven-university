import { describe, expect, it } from 'vitest'
import type { ContentPack } from '../model'
import {
  breathAt,
  circuitDone,
  circuitLit,
  circuitScore,
  createBreath,
  createCircuit,
  createMiniGame,
  createPace,
  createPower,
  createRoom,
  createWire,
  difficultyFor,
  drillPoints,
  finishDrill,
  miniGameDone,
  moveWire,
  paceBand,
  paceScore,
  powerDone,
  powerScore,
  pressBreath,
  pressPower,
  releaseBreath,
  releasePower,
  roomDone,
  roomScore,
  sayTopic,
  shownForce,
  SIDES,
  stepBreath,
  stepPace,
  stepPower,
  tapPace,
  turnTile,
  turned,
  wireDone,
  wireScore,
  breathScore,
  stepWire,
  type CircuitGame,
  type PowerGame
} from './minigames'
import { createInitialState } from './state'
import { trainingToward } from './stats'
import { fixture } from './testFixture'

const content = fixture()
const state = createInitialState(content)
// Small steps of time, as the screen gives them.
const DT = 1 / 60

describe('what a drill is worth', () => {
  it('is an hour of focus played as badly as it can be, and three times that played perfectly', () => {
    expect(drillPoints(2, 0)).toBe(2)
    expect(drillPoints(2, 0.5)).toBe(4)
    expect(drillPoints(2, 1)).toBe(6)
    expect(drillPoints(3, 7)).toBe(9)
  })

  it('is settled on its stat by how the game went, and leaves nothing waiting', () => {
    const waiting = { ...state, player: { ...state.player, stats: { ...state.player.stats, wisdom: 20 } }, drill: { stat: 'wisdom' as const, hours: 2, title: 'Sit', description: '', seed: 1 } }
    const done = finishDrill(content, waiting, 1)
    expect(done.drill).toBeUndefined()
    expect(trainingToward(done, 'wisdom').banked).toBe(6)
    expect(trainingToward(finishDrill(content, waiting, 0), 'wisdom').banked).toBe(2)
    expect(finishDrill(content, state, 1)).toBe(state)
  })

  it('is harder the better he already is', () => {
    expect([8, 10, 20, 30].map(difficultyFor)).toEqual([0, 0, 0.5, 1])
  })
})

describe('the game for strength', () => {
  /** Holds until the shown force is in the middle of the mark, and lets go. */
  const rep = (game: PowerGame) => {
    let held = pressPower(game)
    while (shownForce(held) < held.zone.center && held.holding) held = stepPower(held, DT)
    return releasePower(held)
  }

  it('is eight reps, each scored by how near the middle of the mark he lets go', () => {
    let game = createPower(3, 0)
    while (!powerDone(game)) game = rep(game)
    expect(game.results).toHaveLength(8)
    expect(powerScore(game)).toBeGreaterThan(0.8)
  })

  it('loses a rep let go of short of the mark, or held past all he has, and tires him more for it', () => {
    const short = releasePower(stepPower(pressPower(createPower(3, 0)), 0.1))
    expect(short.results).toEqual([0])
    let held = pressPower(createPower(3, 0))
    for (let i = 0; i < 300 && held.results.length === 0; i++) held = stepPower(held, DT)
    expect(held.results).toEqual([0])
    expect(held.fatigue).toBeGreaterThan(rep(createPower(3, 0)).fatigue)
    expect(held.zone.width).toBeLessThan(createPower(3, 0).zone.width)
  })
})

describe('the game for dexterity', () => {
  it('follows the wire from its start to its end, and is scored by how steady and how quick', () => {
    let game = createWire(5, 0)
    for (const point of game.path) game = moveWire(stepWire(game, 0.05), point)
    expect(wireDone(game)).toBe(true)
    expect(game.slips).toBe(0)
    expect(wireScore(game)).toBeGreaterThan(0.9)
  })

  it('comes off it when the iron strays, and takes it up again only where he left it', () => {
    let game = createWire(5, 0)
    for (let i = 0; i <= 10; i++) game = moveWire(game, game.path[i])
    game = moveWire(game, { x: game.path[10].x, y: game.path[10].y + 3 })
    expect(game).toMatchObject({ onWire: false, slips: 1 })
    expect(game.progress).toBeGreaterThanOrEqual(10)
    expect(moveWire(game, game.path[game.progress + 15]).onWire).toBe(false)
    expect(moveWire(game, game.path[game.progress]).onWire).toBe(true)
    expect(wireScore(game)).toBeLessThan(0.2)
    // Leaping ahead along it is coming off it too.
    expect(moveWire(moveWire(createWire(5, 0), createWire(5, 0).path[0]), createWire(5, 0).path[30]).slips).toBe(1)
  })

  it('is narrower the better he is', () => {
    expect(createWire(5, 1).tolerance).toBeLessThan(createWire(5, 0).tolerance)
  })
})

describe('the game for endurance', () => {
  it('counts the time the pace is kept in the band', () => {
    let kept = createPace(0)
    while (kept.time < kept.duration) {
      kept = stepPace(kept, DT)
      if (kept.rate < paceBand(kept).center) kept = tapPace(kept)
    }
    expect(paceScore(kept)).toBeGreaterThan(0.9)
    let idle = createPace(0)
    while (idle.time < idle.duration) idle = stepPace(idle, DT)
    expect(paceScore(idle)).toBeLessThan(0.2)
  })
})

describe('the game for intelligence', () => {
  /** Turns each tile of the route until it joins the one before it to the one after. */
  const solve = (game: CircuitGame) => {
    let solved = game
    game.route.forEach(({ r, c }, i) => {
      const before = i === 0 ? { r, c: -1 } : game.route[i - 1]
      const after = i === game.route.length - 1 ? { r, c: game.size } : game.route[i + 1]
      const side = (cell: { r: number; c: number }) => (cell.r < r ? SIDES.north : cell.r > r ? SIDES.south : cell.c > c ? SIDES.east : SIDES.west)
      const wanted = side(before) | side(after)
      for (let n = 0; n < 4 && solved.tiles[r][c] !== wanted; n++) solved = { ...solved, tiles: solved.tiles.map((row, ri) => (ri === r ? row.map((ends, ci) => (ci === c ? turned(ends) : ends)) : row)) }
    })
    return solved
  }

  it('is laid out unsolved, and can always be solved by turning tiles', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const game = createCircuit(seed, seed / 25)
      expect(circuitLit(game).solved).toBe(false)
      const solved = solve(game)
      expect(circuitLit(solved).solved).toBe(true)
      expect(circuitDone(solved)).toBe(true)
      expect(circuitScore(solved)).toBe(1)
    }
  })

  it('is bigger the better he is, and counts what is lit of a circuit not finished', () => {
    expect(createCircuit(1, 0).size).toBe(4)
    expect(createCircuit(1, 1).size).toBe(6)
    const game = createCircuit(2, 0)
    expect(circuitScore(game)).toBeLessThan(0.6)
    expect(turned(SIDES.north)).toBe(SIDES.east)
    expect(turned(SIDES.west)).toBe(SIDES.north)
    expect(turnTile(game, 0, 0).tiles[0][0]).toBe(turned(game.tiles[0][0]))
  })
})

describe('the game for wisdom', () => {
  it('is in step while he holds as the ring grows and lets go as it shrinks', () => {
    let game = createBreath(4, 0)
    let fumbled = createBreath(4, 0)
    while (!miniGameDone(game)) {
      game = breathAt(game).inhaling ? pressBreath(game) : releaseBreath(game)
      game = stepBreath(game, DT)
    }
    expect(breathScore(game)).toBeGreaterThan(0.95)
    // Holding all the way through is in step for only half of it, and pressing as it shrinks breaks the quiet.
    let held = pressBreath(createBreath(4, 0))
    while (!miniGameDone(held)) held = stepBreath(held, DT)
    expect(breathScore(held)).toBeLessThan(0.65)
    fumbled = stepBreath({ ...fumbled, time: fumbled.breaths[0].inhale + 1 }, DT)
    expect(pressBreath(fumbled).fumbles).toBe(1)
  })
})

describe('the game for charisma', () => {
  const room: ContentPack = {
    ...content,
    minigames: {
      pieces: [],
      topics: ['books', 'sport', 'food', 'music', 'magic'].map((id) => ({ id, name: id })),
      listeners: [
        { id: 'a', name: 'A', likes: ['books'], dislikes: ['sport'] },
        { id: 'b', name: 'B', likes: ['books', 'food'], dislikes: [] },
        { id: 'c', name: 'C', likes: ['music'], dislikes: ['books'] }
      ]
    }
  }

  it('moves each of them by what she makes of the topic, less the second time, over six turns', () => {
    let game = createRoom(room, 9, 0)
    expect(game.listeners).toHaveLength(3)
    expect(game.hand).toHaveLength(4)
    const books = { ...game, hand: room.minigames.topics }
    const once = sayTopic(books, 'books')
    const byId = (g: typeof game, id: string) => g.last[g.listeners.findIndex((one) => one.id === id)]
    expect([byId(once, 'a'), byId(once, 'b'), byId(once, 'c')]).toEqual([0.25, 0.25, -0.2])
    const twice = sayTopic({ ...once, hand: room.minigames.topics }, 'books')
    expect(byId(twice, 'a')).toBe(0.125)
    // A topic not in his hand is not his to bring up.
    expect(sayTopic({ ...game, hand: [] }, 'books')).toEqual({ ...game, hand: [] })
    while (!roomDone(game)) game = sayTopic(game, game.hand[0].id)
    expect(game.said).toHaveLength(6)
    expect(roomScore(game)).toBeGreaterThanOrEqual(0)
  })
})

describe('the game a drill is', () => {
  it('is the one for its stat, laid out the same from the same seed', () => {
    const drill = (stat: 'strength' | 'intelligence') => ({ stat, hours: 2, title: 'T', description: '', seed: 11 })
    expect(createMiniGame(content, state, drill('strength')).kind).toBe('strength')
    expect(createMiniGame(content, state, drill('intelligence'))).toEqual(createMiniGame(content, state, drill('intelligence')))
  })
})
