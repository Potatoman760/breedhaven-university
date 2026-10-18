import { describe, expect, it } from 'vitest'
import { ExpeditionConfigSchema, HIM, PregnancyConfigSchema, validateContentPack, type ContentPack, type Course, type ExpeditionRun, type GameState } from '../model'
import { act, canGoBelow, comeUp, depthsOpen, goOn, partyChoices, practiceRun, pregnancyPower, relicsHeld, runReport, startRun, turnActions, turnBack, turnOf, wayDownAt } from './expedition'
import { playOut } from './expeditionPolicy'
import { factor } from './modifiers'
import { meet } from './scene'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'

// The fixture's Shop is the way down, open from 05:00 to 15:00 on a 20-hour day that begins at 06:00. Ana holds the
// line and Bea mends. A run is two hours: a fight, something lying about, a place to rest and the guardian.
const raw = rawFixture()
const ana = raw.loveInterests[0]
const depth = (name: string, relicId: string, guardian: string) => ({
  name,
  nodes: [
    { kind: 'fight', enemyIds: ['blob'], finds: { money: 10 } },
    { kind: 'find', finds: { money: 5, items: { salve: 1 } } },
    { kind: 'checkpoint' },
    { kind: 'guardian', enemyIds: [guardian], finds: { money: 20 } }
  ],
  relic: { id: relicId, name: relicId, description: '', modifier: { kind: 'rent', amount: 0.5 } }
})
const expedition = ExpeditionConfigSchema.parse({
  entryLocationId: 'shop',
  hours: 2,
  trustNeeded: 30,
  pregnancyPower: { early: 2 },
  surgeLimit: 2,
  misfire: 3,
  grounds: 1,
  roles: [
    { id: 'guard', name: 'Guard', footing: 30, actions: [{ id: 'bash', name: 'Bash', kind: 'attack', power: 4 }, { id: 'hold', name: 'Hold', kind: 'taunt', cooldown: 1 }, { id: 'guard', name: 'Brace', kind: 'guard' }] },
    { id: 'healer', name: 'Healer', footing: 20, actions: [{ id: 'mend', name: 'Mend', kind: 'heal', power: 6 }, { id: 'jolt', name: 'Jolt', kind: 'attack', power: 3 }] }
  ],
  enemies: [
    { id: 'blob', name: 'Blob', footing: 40, attack: 4 },
    { id: 'boss', name: 'Boss', footing: 30, attack: 3, sweeps: true },
    { id: 'wall', name: 'Wall', footing: 9999, attack: 500, sweeps: true }
  ],
  depths: [depth('the Drains', 'stone', 'boss'), depth('the Pit', 'seal', 'wall')]
})
const content: ContentPack = validateContentPack({
  ...raw,
  loveInterests: [
    { ...ana, partyRole: 'guard' },
    { ...ana, id: 'bea', name: 'Bea Stone', partyRole: 'healer' },
    { ...ana, id: 'cy', name: 'Cy' }
  ],
  items: [{ id: 'salve', name: 'Salve', price: 0, below: { footing: 9, calms: true } }],
  pregnancy: PregnancyConfigSchema.parse({ birthLocationId: 'home', lengthDays: 5, stages: [{ id: 'early', name: 'Early', from: 0 }, { id: 'due', name: 'Due', from: 0.8 }] }),
  expedition
})

const trusting = { affection: 0, trust: 50, desire: 0 }
const start: GameState = {
  ...meet(content, createInitialState(content), ['ana', 'bea', 'cy']),
  locationId: 'shop',
  player: { ...createInitialState(content).player, stats: { strength: 10, dexterity: 10, endurance: 10, intelligence: 10, charisma: 10, wisdom: 10 } },
  relationships: { ana: trusting, bea: trusting, cy: trusting },
  expedition: { ...createInitialState(content).expedition, invited: true },
  // He always sees it coming, so that a fight starts with his turn.
  boons: [{ kind: 'ambush', amount: 1, until: 9999, source: 'test' }]
}
const below = (party: string[] = ['ana', 'bea'], from: GameState = start, depthIndex = 0): GameState => startRun(content, from, party, depthIndex)
const run = (state: GameState): ExpeditionRun => state.expedition.run!
const fighter = (state: GameState, id: string) => run(state).party.find((one) => one.id === id)!
const carrying = (state: GameState, id: string, progress: number): GameState => ({ ...state, pregnancies: { [id]: { conceivedAt: 0, dueAt: Math.round(state.time / progress) || 100 } } })

describe('where the way down is', () => {
  it('is marked once he has been told of it', () => {
    expect(wayDownAt(content, start)).toBe('shop')
    expect(wayDownAt(content, { ...start, expedition: { ...start.expedition, invited: false } })).toBeUndefined()
  })
})

describe('who can come below', () => {
  it('is those he has met who have a part to play, trust him, and are not near their time', () => {
    expect(partyChoices(content, start).map((choice) => [choice.li.id, choice.role.id, choice.reason])).toEqual([
      ['ana', 'guard', undefined],
      ['bea', 'healer', undefined]
    ])
    expect(canGoBelow(content, start, ['ana', 'bea'], 0)).toEqual({ ok: true, reasons: [] })
    expect(canGoBelow(content, start, ['cy'], 0).reasons).toEqual(['Cy: She would not be of use below'])
    expect(canGoBelow(content, { ...start, relationships: { ...start.relationships, ana: { ...trusting, trust: 29 } } }, ['ana'], 0).reasons).toEqual(['Ana: She does not trust you enough (30)'])
    expect(canGoBelow(content, { ...start, locationId: 'home' }, [], 0).reasons).toContain('The way down is at the Shop')
    expect(canGoBelow(content, start, ['ana', 'bea', 'cy'], 0).reasons).toContain('No more than 2 can come')
    // Only as deep as he has opened the way.
    expect(depthsOpen(content, start)).toBe(1)
    expect(canGoBelow(content, start, [], 1).reasons).toEqual(['You have not opened the way that deep'])
    // A woman carrying is worth more, until the last of it, when she does not come.
    const late = { ...start, time: 60 }
    expect(pregnancyPower(content, start, 'ana')).toBe(1)
    expect(pregnancyPower(content, carrying(late, 'ana', 0.5), 'ana')).toBe(2)
    expect(canGoBelow(content, carrying(late, 'ana', 0.95), ['ana'], 0).reasons).toContain('Ana: She is too near her time')
  })
})

describe('a practice fight', () => {
  it('is a fight at the first depth, on his turn, wherever he is and whoever trusts him, and leaves the game as it was', () => {
    // Nowhere near the way down, never told of it, and with nobody trusting him: none of it matters to practise.
    const anywhere: GameState = { ...start, locationId: 'home', boons: [], relationships: {}, expedition: { ...start.expedition, invited: false } }
    const practice = practiceRun(content, anywhere, ['ana'])
    const sample = practice.expedition.run!
    expect(sample.depth).toBe(0)
    expect(sample.party.map((fighter) => fighter.id)).toEqual([HIM, 'ana'])
    expect(sample.fight?.foes.length).toBeGreaterThan(0)
    expect(turnOf(sample)?.id).toBe(HIM)
    expect(anywhere.expedition.run).toBeUndefined()
  })
})

describe('a fight', () => {
  it('goes a turn at a time through the party, and then the enemies answer', () => {
    const first = below()
    expect(run(first).party.map((one) => [one.id, one.max])).toEqual([[HIM, 20], ['ana', 30], ['bea', 20]])
    expect(turnOf(run(first))?.id).toBe(HIM)
    expect(turnActions(content, first).map((action) => [action.id, action.ready])).toEqual([['strike', true], ['cover', true], ['anchor', true], ['ground', false]])

    const struck = act(content, first, { actionId: 'strike' })
    expect(run(struck).fight!.foes[0].footing).toBeLessThan(40)
    expect(turnOf(run(struck))?.id).toBe('ana')
    expect(turnActions(content, struck).map((action) => action.id)).toEqual(['bash', 'hold', 'guard'])
    const held = act(content, struck, { actionId: 'hold' })
    expect(fighter(held, 'ana')).toMatchObject({ guarding: true, taunting: true })
    // After the last of the party, the enemy: it goes for whoever is holding the line, who takes half, and the round turns over.
    const round = act(content, held, { actionId: 'jolt' })
    expect(run(round).fight).toMatchObject({ round: 2, turn: 0 })
    expect(fighter(round, 'ana').footing).toBeLessThan(30)
    expect(fighter(round, 'ana').footing).toBeGreaterThanOrEqual(26)
    expect(fighter(round, HIM).footing).toBe(20)
    expect(fighter(round, 'ana')).toMatchObject({ guarding: false, taunting: false, cooldowns: { hold: 1 } })
    expect(turnActions(content, act(content, round, { actionId: 'strike' })).find((action) => action.id === 'hold')).toMatchObject({ ready: false, note: 'ready in 1' })
    // Something that cannot be done changes nothing.
    expect(act(content, first, { actionId: 'ground', target: 'ana' })).toBe(first)
  })

  it('plays the same way from the same game, and otherwise from another', () => {
    const play = (state: GameState) => playOut(content, below(['ana', 'bea'], state)).state
    expect(play(start)).toEqual(play(start))
    const numbers = (state: GameState) => {
      const struck = act(content, below(['ana'], state), { actionId: 'strike' })
      return run(struck).fight!.foes[0].footing
    }
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => numbers({ ...start, weatherSeed: seed * 7919 }))).size).toBeGreaterThan(1)
  })

  it('lets him stand in front of her, and steady her for what she does next', () => {
    const covered = act(content, below(['ana']), { actionId: 'cover', target: 'ana' })
    expect(fighter(covered, 'ana').covered).toBe(true)
    const after = act(content, covered, { actionId: 'hold' })
    // The blow meant for her was his, and he is no longer in front of her.
    expect(fighter(after, 'ana')).toMatchObject({ footing: 30, covered: false })
    expect(fighter(after, HIM).footing).toBeLessThan(20)

    const anchored = act(content, below(['ana']), { actionId: 'anchor', target: 'ana' })
    expect(anchored.player.energy).toBe(start.player.energy - 8)
    expect(fighter(anchored, 'ana').anchored).toBe(true)
    const plain = run(act(content, act(content, below(['ana']), { actionId: 'cover', target: 'ana' }), { actionId: 'bash' })).fight!.foes[0].footing
    const steadied = act(content, anchored, { actionId: 'bash' })
    expect(run(steadied).fight!.foes[0].footing).toBeLessThan(plain)
    expect(fighter(steadied, 'ana').anchored).toBe(false)
    // Without the energy for it, it is not his to do.
    const spent = { ...start, player: { ...start.player, energy: 24 } }
    expect(turnActions(content, { ...below(['ana'], spent), player: { ...spent.player, energy: 5 } }).find((action) => action.id === 'anchor')).toMatchObject({ ready: false, note: 'needs 8 energy' })
  })

  it('has a woman carrying a child build a surge that breaks loose on everyone unless he grounds it', () => {
    const with_child = carrying({ ...start, time: 60 }, 'ana', 0.5)
    const once = act(content, act(content, below(['ana'], with_child), { actionId: 'strike' }), { actionId: 'bash' })
    expect(fighter(once, 'ana').surge).toBe(1)
    // Holding the line builds none.
    expect(fighter(act(content, act(content, below(['ana'], with_child), { actionId: 'strike' }), { actionId: 'hold' }), 'ana').surge).toBe(0)
    // Grounded, it is gone, for energy.
    const grounded = act(content, once, { actionId: 'ground', target: 'ana' })
    expect(fighter(grounded, 'ana').surge).toBe(0)
    expect(grounded.player.energy).toBe(once.player.energy - 6)
    // Left to build, the second thing she does sets it off: three from everyone, and it starts again.
    const before = act(content, once, { actionId: 'strike' })
    const loose = act(content, before, { actionId: 'bash' })
    expect(fighter(loose, 'ana').surge).toBe(0)
    expect(run(loose).fight!.events.some((event) => event.text.includes('breaks loose'))).toBe(true)
    expect(run(loose).fight!.events.find((event) => event.text.includes('breaks loose'))?.faces).toEqual({ ana: 'embarrassed' })
  })
})

describe('a run', () => {
  const won = (from: GameState = start) => playOut(content, below(['ana', 'bea'], from))

  it('goes from stop to stop, picking up what is there and making it safe at a checkpoint', () => {
    let state = below()
    while (!run(state).done) state = act(content, state, { actionId: turnOf(run(state))!.id === HIM ? 'strike' : turnOf(run(state))!.id === 'ana' ? 'bash' : 'jolt' })
    expect(run(state)).toMatchObject({ node: 0, found: { money: 10 }, banked: { money: 0 } })
    state = goOn(content, state)
    expect(run(state)).toMatchObject({ node: 1, done: true, found: { money: 15, items: { salve: 1 } } })
    state = goOn(content, state)
    expect(run(state)).toMatchObject({ node: 2, done: true, found: { money: 0, items: {} }, banked: { money: 15, items: { salve: 1 } } })
    // Turning back keeps what was made safe, and costs its hours.
    const left = turnBack(goOn(content, state))
    expect(runReport(content, left)).toMatchObject({ outcome: 'left', kept: { money: 15 }, relic: undefined, wentIds: ['ana', 'bea'], downedIds: [] })
    const up = comeUp(content, left)
    expect(up.expedition.run).toBeUndefined()
    expect(up).toMatchObject({ time: start.time + 2, inventory: { salve: 1 }, expedition: { cleared: 0, relics: [] } })
    expect(up.player.money).toBe(start.player.money + 15)
  })

  it('won leaves him the relic, opens the next depth, and is remembered by those who came', () => {
    const { state, outcome } = won()
    expect(outcome).toBe('won')
    expect(state.expedition).toMatchObject({ cleared: 1, relics: ['stone'] })
    expect(relicsHeld(content, state).map((relic) => relic.id)).toEqual(['stone'])
    expect(state.player.money).toBe(start.player.money + 10 + 5 + 20)
    expect(depthsOpen(content, state)).toBe(2)
    // The relic is as real as something a course teaches.
    expect(factor(content, start, 'rent')).toBe(1)
    expect(factor(content, state, 'rent')).toBe(0.5)
    expect(state.memories['ana'].at(-1)?.summary).toContain('held while he re-seated the anchor of the Drains')
    expect(state.relationships['ana'].trust).toBe(52)
    // Done again, there is no second relic.
    const again = playOut(content, below(['ana', 'bea'], { ...state, locationId: 'shop', time: start.time, player: { ...state.player, energy: 100 } }))
    expect(again.state.expedition).toMatchObject({ cleared: 1, relics: ['stone'] })
  })

  it('lost costs him the rest of his day, what was not made safe, and the trust of whoever went down', () => {
    const deep = { ...start, expedition: { ...start.expedition, cleared: 1 } }
    const { state, outcome } = playOut(content, below(['ana', 'bea'], deep, 1))
    expect(outcome).toBe('lost')
    // He got as far as the checkpoint, and keeps that.
    expect(state.player.money).toBe(start.player.money + 15)
    expect(state.player.energy).toBe(0)
    expect(state.expedition).toMatchObject({ cleared: 1, relics: [] })
    expect(state.relationships['ana'].trust).toBe(48)
    expect(state.memories['bea'].at(-1)?.summary).toContain('it went badly at the Pit')
  })
})

describe('what a course is worth below', () => {
  const course: Course = { id: 'rid', number: 'RID 101', title: 'Riddles', professor: '', description: '', subject: 'Riddles', code: 'RID', level: 1, general: false, stats: ['wisdom'], studentIds: [], locationId: 'shop', meetings: [] }
  const taught: ContentPack = { ...content, skills: [{ id: 'grip', name: 'Grip', description: '', code: 'RID', at: 30, passive: { kind: 'wages', amount: 1.1 }, below: { kind: 'might', amount: 2 } }] }

  it('is his beside what it teaches above, once he has the marks', () => {
    const enrolled = { ...start, courses: [course], enrolment: ['rid'] }
    expect(factor(taught, enrolled, 'might')).toBe(1)
    const learnt = { ...enrolled, coursePoints: { rid: 30 } }
    expect(factor(taught, learnt, 'might')).toBe(2)
    expect(factor(taught, learnt, 'wages')).toBe(1.1)
    const foe = (state: GameState) => run(act(taught, startRun(taught, state, [], 0), { actionId: 'strike' })).fight!.foes[0].footing
    expect(40 - foe(learnt)).toBe((40 - foe(enrolled)) * 2)
  })
})
