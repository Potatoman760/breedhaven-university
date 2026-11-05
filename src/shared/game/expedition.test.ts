import { describe, expect, it } from 'vitest'
import { ExpeditionConfigSchema, HIM, PregnancyConfigSchema, validateContentPack, type ContentPack, type Course, type ExpeditionRun, type GameState } from '../model'
import { act, canGoBelow, comeUp, depthsOpen, goOn, partyChoices, practiceRun, pregnancyPower, relicsHeld, runReport, startRun, turnActions, turnBack, turnOf, wayDownAt } from './expedition'
import { playOut } from './expeditionPolicy'
import { factor } from './modifiers'
import { meet } from './scene'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'
import { toggleRelic } from './relics'
import { belowOutfitId, outfitOpen, setEchoOutfit, wearableOutfits } from './pregnancy'

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
  // Trust and desire make no difference here but where a test says.
  footingPerTrust: 0,
  roles: [
    { id: 'guard', name: 'Guard', footing: 30, actions: [{ id: 'bash', name: 'Bash', kind: 'attack', power: 4 }, { id: 'hold', name: 'Hold', kind: 'taunt', cooldown: 1 }, { id: 'guard', name: 'Brace', kind: 'guard' }], friendAction: { id: 'quake', name: 'Quake', kind: 'attack', power: 3, all: true, cooldown: 2 } },
    { id: 'healer', name: 'Healer', footing: 20, actions: [{ id: 'mend', name: 'Mend', kind: 'heal', power: 6 }, { id: 'jolt', name: 'Jolt', kind: 'attack', power: 3 }], friendAction: { id: 'renew', name: 'Renew', kind: 'heal', power: 4, all: true, cooldown: 3 } }
  ],
  enemies: [
    { id: 'blob', name: 'Blob', footing: 40, attack: 4 },
    { id: 'boss', name: 'Boss', footing: 30, attack: 3, sweeps: true },
    { id: 'wall', name: 'Wall', footing: 9999, attack: 500, sweeps: true },
    { id: 'shell', name: 'Shell', footing: 40, attack: 4, armor: 3 },
    { id: 'brute', name: 'Brute', footing: 40, attack: 4, charges: 1 },
    { id: 'caller', name: 'Caller', footing: 40, attack: 4, summons: { enemyId: 'blob', every: 1 } },
    { id: 'mender', name: 'Mender', footing: 40, attack: 4, mends: 7 },
    { id: 'hush', name: 'Hush', footing: 400, attack: 1, silences: true },
    { id: 'turner', name: 'Turner', footing: 40, attack: 4, phases: [{ at: 0.5, text: 'turns.', attack: 40 }] },
    { id: 'post', name: 'Post', footing: 400, attack: 1 }
  ],
  depths: [depth('the Drains', 'stone', 'boss'), depth('the Pit', 'seal', 'wall')]
})
const content: ContentPack = validateContentPack({
  ...raw,
  loveInterests: [
    { ...ana, partyRole: 'guard', ultimate: { id: 'avalanche', name: 'Avalanche', kind: 'attack', power: 20, all: true, stuns: 1 } },
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

// A depth of one fight with one of the fixture's enemies.
const facing = (enemyId: string): ContentPack => ({ ...content, expedition: { ...expedition, depths: [{ ...expedition.depths[0], nodes: [{ kind: 'guardian', name: '', enemyIds: [enemyId], finds: { money: 0, items: {} } }] }] } })

describe('what being close to him makes of her below', () => {
  // As close to him as this, back from as many runs won.
  const at = (affection: number, desire = 0, wins = 1): GameState => ({ ...start, relationships: { ...start.relationships, ana: { affection, trust: 50, desire } }, expedition: { ...start.expedition, wins: { ana: wins } } })
  const herTurn = (state: GameState) => act(content, below(['ana'], state), { actionId: 'strike' })

  it('gives her her role’s further move as a friend back from a run won, and her own ultimate as his lover, once a run', () => {
    expect(turnActions(content, herTurn(at(0))).map((action) => action.id)).toEqual(['bash', 'hold', 'guard'])
    expect(turnActions(content, herTurn(at(30))).map((action) => action.id)).toEqual(['bash', 'hold', 'guard', 'quake'])
    // A friend who has not yet come back from a run won has only her role's first moves.
    expect(turnActions(content, herTurn(at(30, 0, 0))).map((action) => action.id)).toEqual(['bash', 'hold', 'guard'])
    const post = facing('post')
    const lover = act(post, startRun(post, at(80), ['ana', 'bea'], 0), { actionId: 'strike' })
    expect(turnActions(post, lover).map((action) => action.id)).toEqual(['bash', 'hold', 'guard', 'quake', 'avalanche'])
    expect(turnActions(post, lover).find((action) => action.id === 'avalanche')?.description).toContain('Once a run')
    // It stuns what it hits, which then means nothing on the enemies' turn, and it is not hers again this run.
    const used = act(post, lover, { actionId: 'avalanche' })
    expect(run(used).fight!.foes[0]).toMatchObject({ intent: { kind: 'stunned' } })
    const answered = act(post, used, { actionId: 'jolt' })
    expect(run(answered).fight!.events.some((event) => event.text.includes('does nothing'))).toBe(true)
    expect(turnActions(post, act(post, answered, { actionId: 'strike' })).find((action) => action.id === 'avalanche')).toMatchObject({ ready: false, note: 'Used this run' })
  })

  it('has her trust in him as footing, and her desire for him fill a passion that makes her next action stronger', () => {
    const trusted = { ...content, expedition: { ...expedition, footingPerTrust: 0.1 } }
    expect(run(startRun(trusted, start, ['ana'], 0)).party.find((one) => one.id === 'ana')?.max).toBe(35)
    // At full desire, two things she does fill it; the next is stronger, and it starts again.
    const once = act(content, herTurn(at(0, 100)), { actionId: 'guard' })
    expect(fighter(once, 'ana')).toMatchObject({ passion: 1.5, impassioned: false })
    const twice = act(content, act(content, once, { actionId: 'strike' }), { actionId: 'guard' })
    expect(fighter(twice, 'ana')).toMatchObject({ passion: 0, impassioned: true })
    expect(run(twice).fight!.events.some((event) => event.text.includes('impassioned'))).toBe(true)
    expect(fighter(act(content, act(content, twice, { actionId: 'strike' }), { actionId: 'guard' }), 'ana').impassioned).toBe(false)
    // Wanting him not at all, it never fills.
    expect(fighter(act(content, herTurn(at(0)), { actionId: 'guard' }), 'ana').passion).toBe(0)
  })
})

describe('what is down there', () => {
  const into = (enemyId: string, party = ['ana', 'bea']) => startRun(facing(enemyId), start, party, 0)
  // Him, then each of them, doing this.
  const round = (pack: ContentPack, state: GameState, moves: string[]) => moves.reduce((next, actionId) => act(pack, next, { actionId }), state)

  it('says ahead what each enemy will do, and does it to whom it said unless someone draws it', () => {
    const begun = into('blob')
    const intent = run(begun).fight!.foes[0].intent
    expect(intent?.kind).toBe('hit')
    expect([HIM, 'ana', 'bea']).toContain(intent?.target)
    const after = round(content, begun, ['strike', 'guard', 'jolt'])
    const hurtOnes = [HIM, 'ana', 'bea'].filter((id) => fighter(after, id).footing < fighter(begun, id).footing)
    expect(hurtOnes).toEqual([intent?.target])
    // Drawn by a taunt, it goes for her instead.
    const drawn = round(content, begun, ['strike', 'hold', 'jolt'])
    expect(fighter(drawn, 'ana').footing).toBeLessThan(30)
  })

  it('has armor that blunts every blow until it is weakened, and blows it lands heavily when it says it will', () => {
    const hit = (enemyId: string) => 40 - run(act(facing(enemyId), into(enemyId), { actionId: 'strike' })).fight!.foes[0].footing
    expect(hit('blob') - hit('shell')).toBe(3)
    expect(run(into('brute')).fight!.foes[0].intent?.kind).toBe('heavy')
    const heavy = round(facing('brute'), into('brute'), ['strike', 'guard', 'jolt'])
    expect(run(heavy).fight!.events.some((event) => event.text.includes('heavy blow'))).toBe(true)
  })

  it('calls up more of its kind, mends its side when it is worn, silences, and turns as it is worn down', () => {
    expect(run(into('caller')).fight!.foes[0].intent?.kind).toBe('summon')
    expect(run(round(facing('caller'), into('caller'), ['strike', 'guard', 'jolt'])).fight!.foes.length).toBe(2)

    const worn = into('mender')
    const low = { ...worn, expedition: { ...worn.expedition, run: { ...run(worn), fight: { ...run(worn).fight!, foes: [{ ...run(worn).fight!.foes[0], footing: 15 }] } } } }
    // Nobody touching it, it hits once, then mends itself.
    const quiet = (state: GameState) => [{ actionId: 'cover', target: 'ana' }, { actionId: 'guard' }, { actionId: 'mend', target: 'bea' }].reduce((then, move) => act(facing('mender'), then, move), state)
    const next = quiet(low)
    expect(run(next).fight!.foes[0].intent).toEqual({ kind: 'mend', target: 'mender-0' })
    expect(run(quiet(next)).fight!.foes[0].footing).toBe(22)

    const hushed = round(facing('hush'), into('hush'), ['strike', 'hold', 'jolt'])
    expect(fighter(hushed, 'ana').silenced).toBeGreaterThan(0)
    const herTurn = act(facing('hush'), hushed, { actionId: 'strike' })
    expect(turnActions(facing('hush'), herTurn).map((action) => [action.id, action.ready])).toEqual([['bash', true], ['hold', false], ['guard', false]])

    let worn2 = into('turner')
    while (run(worn2).fight!.foes[0].footing > 20) worn2 = act(facing('turner'), worn2, { actionId: turnOf(run(worn2))!.id === HIM ? 'strike' : turnOf(run(worn2))!.id === 'ana' ? 'bash' : 'jolt' })
    expect(run(worn2).fight!.foes[0].phase).toBe(1)
    expect(run(worn2).fight!.events.some((event) => event.text === 'Turner turns.')).toBe(true)
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
    expect(state.expedition).toMatchObject({ cleared: 1, relics: ['stone'], wins: { ana: 1, bea: 1 } })
    expect(relicsHeld(content, state).map((relic) => relic.id)).toEqual(['stone'])
    expect(state.player.money).toBe(start.player.money + 10 + 5 + 20)
    expect(depthsOpen(content, state)).toBe(2)
    // The relic is as real as something a course teaches, once he turns it on: it comes up off.
    expect(factor(content, start, 'rent')).toBe(1)
    expect(factor(content, state, 'rent')).toBe(1)
    expect(factor(content, toggleRelic(state, state.expedition.relics[0]), 'rent')).toBe(0.5)
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
    expect(state.expedition).toMatchObject({ cleared: 1, relics: [], wins: {} })
    expect(state.relationships['ana'].trust).toBe(48)
    expect(state.memories['bea'].at(-1)?.summary).toContain('it went badly at the Pit')
  })
})

describe('the echoes', () => {
  // Every anchor set, and the wall of the Pit made something a party can beat in an echo.
  const echoing = { ...content, expedition: { ...expedition, enemies: expedition.enemies.map((one) => (one.id === 'wall' ? { ...one, footing: 30, attack: 2 } : one)), echoes: { ...expedition.echoes, power: 1, fights: 1, foes: 1 } } }
  const done = { ...start, expedition: { ...start.expedition, cleared: 2 } }
  const robe = { id: 'echoes', name: 'Ranger garb', description: '', sprites: {}, pregnant: false, day: true, locked: 'echoes' as const }
  const her = { ...content.loveInterests[0], outfits: [...content.loveInterests[0].outfits, robe] }

  it('open past the last depth once every anchor is set, put together from the depths', () => {
    expect(canGoBelow(echoing, start, ['ana'], 2).reasons).toContain('You have not opened the way that deep')
    expect(canGoBelow(echoing, done, ['ana'], 2).ok).toBe(true)
    const echo = run(startRun(echoing, done, ['ana', 'bea'], 2))
    expect(echo.echo?.name).toMatch(/^An echo of the (Drains|Pit)$/)
    expect(echo.echo?.nodes.map((node) => node.kind)).toEqual(['fight', 'find', 'checkpoint', 'guardian'])
    expect(['boss', 'wall']).toContain(echo.echo?.nodes.at(-1)?.enemyIds[0])
  })

  it('won, leave no relic and open nothing, but each woman who came may wear what she earned for it, unless he puts it away', () => {
    const { state, outcome } = playOut(echoing, startRun(echoing, done, ['ana', 'bea'], 2))
    expect(outcome).toBe('won')
    expect(state.expedition).toMatchObject({ cleared: 2, relics: [], echoes: 1, echoed: ['ana', 'bea'] })
    expect(outfitOpen(start, her, robe)).toBe(false)
    expect(outfitOpen(state, her, robe)).toBe(true)
    expect(outfitOpen(setEchoOutfit(state, 'ana', false), her, robe)).toBe(false)
    expect(outfitOpen(setEchoOutfit(setEchoOutfit(state, 'ana', false), 'ana', true), her, robe)).toBe(true)
    expect(wearableOutfits(her, start).map((o) => o.id)).not.toContain('echoes')
    expect(wearableOutfits(her, state).map((o) => o.id)).toContain('echoes')
    // Below, she always goes in it once earned, even put away for her days.
    expect(belowOutfitId(start, her)).toBeUndefined()
    expect(belowOutfitId(setEchoOutfit(state, 'ana', false), her)).toBe('echoes')
  })
})

describe('what a course is worth below', () => {
  const course: Course = { id: 'rid', number: 'RID 101', title: 'Riddles', professor: '', description: '', subject: 'Riddles', code: 'RID', general: false, stats: ['wisdom'], studentIds: [], locationId: 'shop', meetings: [] }
  const taught: ContentPack = { ...content, skills: [{ id: 'grip', name: 'Grip', description: '', code: 'RID', courseId: 'rid', at: 30, passive: { kind: 'wages', amount: 1.1 }, below: { kind: 'might', amount: 2 } }] }

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
