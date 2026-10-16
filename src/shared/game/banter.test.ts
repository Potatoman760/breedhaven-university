import { describe, expect, it } from 'vitest'
import { ExpeditionConfigSchema, validateContentPack, type ContentPack, type GameState } from '../model'
import { banterDue, buildBanterPrompt, parseBanter } from './banter'
import { act, goOn, startRun } from './expedition'
import { plainMove } from './expeditionPolicy'
import { meet } from './scene'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'

// The fixture's Shop is the way down; Ana and Bea can come.
const raw = rawFixture()
const ana = raw.loveInterests[0]
const content: ContentPack = validateContentPack({
  ...raw,
  loveInterests: [
    { ...ana, partyRole: 'guard' },
    { ...ana, id: 'bea', name: 'Bea Stone', personality: 'Loud and sure of herself.', partyRole: 'guard' }
  ],
  expedition: ExpeditionConfigSchema.parse({
    entryLocationId: 'shop',
    hours: 2,
    trustNeeded: 0,
    roles: [{ id: 'guard', name: 'Geomancer', footing: 30, actions: [{ id: 'bash', name: 'Stone Spike', kind: 'attack', power: 4 }] }],
    enemies: [{ id: 'blob', name: 'Blob', appearance: 'A green blob.', footing: 10, attack: 1 }],
    depths: [{ name: 'the Drains', appearance: 'A wet tunnel.', nodes: [{ kind: 'guardian', enemyIds: ['blob'] }], relic: { id: 'stone', name: 'Stone', description: '', modifier: { kind: 'rent', amount: 0.5 } } }]
  })
})
const trusting = { affection: 40, trust: 50, desire: 0 }
const ready: GameState = { ...meet(content, createInitialState(content), ['ana', 'bea']), locationId: 'shop', relationships: { ana: trusting, bea: trusting }, expedition: { ...createInitialState(content).expedition, invited: true } }
const below = startRun(content, ready, ['ana', 'bea'], 0)

/** Plays a run to its end by the plain policy, without coming back up, so that its reckoning is still to be made. */
function playOut(pack: ContentPack, started: GameState): GameState {
  let state = started
  for (let step = 0; step < 500 && !state.expedition.run?.over; step++) {
    const run = state.expedition.run!
    state = run.fight && !run.done ? act(pack, state, plainMove(pack, state)!) : goOn(pack, state)
  }
  return state
}

describe('what the party says as a fight begins', () => {
  it('is asked for only with a fight on and someone to say it', () => {
    expect(banterDue(content, ready)).toBe(false)
    expect(banterDue(content, below)).toBe(true)
    expect(banterDue(content, startRun(content, ready, [], 0))).toBe(false)
  })

  it('is asked for with a cut-down account of who is there and what they face', () => {
    const { system, user } = buildBanterPrompt(content, below)
    expect(system).toContain('Reply with 3 or 4 lines')
    expect(system).toContain('using only Ana and Bea')
    expect(system).toContain(`Nothing said by ${below.player.name}`)
    expect(user).toContain('Where: the Drains. A wet tunnel.')
    expect(user).toContain('What they face, the guardian of this depth: Blob (A green blob.)')
    expect(user).toContain('Bea, 25. Loud and sure of herself.')
    expect(user).toContain("Here as the party's geomancer. To Pat she is: friend.")
    // Small: it is sent before every fight.
    expect(system.length + user.length).toBeLessThan(1600)
  })

  it('is asked for again over a guardian they have beaten, with what the win came to', () => {
    const won = playOut(content, below)
    expect(won.expedition.run?.over).toBe('won')
    expect(banterDue(content, won, 'won')).toBe(true)
    expect(banterDue(content, below, 'won')).toBe(false)
    expect(banterDue(content, won)).toBe(false)
    const { system, user } = buildBanterPrompt(content, won, 'won')
    expect(system).toContain('just after a hard fight is won')
    expect(user).toContain('What they have just beaten, the guardian of this depth: Blob')
    expect(user).toContain('set his hands on the anchor of the Drains, and it holds')
    expect(user).toContain('Lying by it: Stone.')
  })

  it('is read into lines given to whoever of the party each names, and nothing else', () => {
    const reply = ['Sure, here you go:', 'Ana: "Is it supposed to hum?"', '**Bea**: *grins* It is now. [EXPRESSION: happy]', 'Pat: I think so.', 'Cy: Who am I?', 'ana: Stay behind me.', 'Bea: One.', 'Bea: Two.'].join('\n')
    expect(parseBanter(reply, content, below)).toEqual([
      { speakerId: 'ana', text: 'Is it supposed to hum?' },
      { speakerId: 'bea', text: 'It is now.' },
      { speakerId: 'ana', text: 'Stay behind me.' },
      { speakerId: 'bea', text: 'One.' }
    ])
    expect(parseBanter('They look at each other and say nothing.', content, below)).toEqual([])
  })
})
