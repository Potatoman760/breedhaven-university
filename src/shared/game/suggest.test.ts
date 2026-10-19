import { describe, expect, it } from 'vitest'
import { RelationshipStatusSchema, type ContentPack, type GameState } from '../model'
import { completeName, sceneSuggestions } from './suggest'
import { giveContact } from './courier'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Two love interests, the stages of the real game in miniature, and two arrangements: a couple from friend on, and an
// open throuple for two women close to each other.
const base = fixture()
const [ana] = base.loveInterests
const content: ContentPack = {
  ...base,
  loveInterests: [ana, { ...ana, id: 'bea', name: 'Bea Stone', handle: '@bea.reads' }],
  relationships: {
    ...base.relationships,
    stages: [
      { id: 'stranger', name: 'Stranger', minAffection: 0, description: '' },
      { id: 'acquaintance', name: 'Acquaintance', minAffection: 10, description: '' },
      { id: 'friend', name: 'Friend', minAffection: 30, description: '' }
    ],
    statuses: [
      { id: 'exclusive', name: 'Exclusive', exclusive: true, minStage: 'friend', description: '' },
      { id: 'open-throuple', name: 'Open throuple', minMembers: 2, maxMembers: 2, mutual: true, minStage: 'friend', minTie: 30, description: '' }
    ].map((s) => RelationshipStatusSchema.parse(s)),
    ties: [{ a: 'ana', b: 'bea', affection: 40 }]
  }
}
const rel = (affection: number) => ({ affection, trust: 0, desire: 0 })
const start: GameState = createInitialState(content)
const alone = { loveInterestId: 'bea', companionIds: [], npc: false }
const ids = (state: GameState, scene = alone) => sceneSuggestions(content, state, scene).map((one) => one.id)

describe('what the text box suggests', () => {
  it('offers to ask for her Bloomr once she knows him a little, until he has it', () => {
    expect(ids({ ...start, relationships: { ...start.relationships, bea: rel(5) } })).toEqual([])
    const known = { ...start, relationships: { ...start.relationships, bea: rel(12) } }
    const [ask] = sceneSuggestions(content, known, alone)
    expect(ask).toMatchObject({ id: 'contact:bea', text: 'Bea, could I get your Bloomr?' })
    // She is told what he is asking, and what to say to grant it.
    expect(ask.cue).toContain('@bea.reads')
    expect(ids(giveContact(known, 'bea'))).toEqual([])
    // Nothing in a scene with an NPC.
    expect(sceneSuggestions(content, known, { ...alone, npc: true })).toEqual([])
  })

  it('offers each arrangement the rules allow now, and not one they already have', () => {
    const friends = giveContact({ ...start, relationships: { ...start.relationships, ana: rel(40), bea: rel(40) } }, 'bea')
    expect(ids(friends)).toEqual(['bond:exclusive:bea'])
    const together = { ...friends, bonds: [{ statusId: 'exclusive', memberIds: ['bea'], since: 1 }] }
    expect(ids(together)).toEqual([])
    // With both there, and close to each other, each of them, and the two of them together.
    const both = { loveInterestId: 'bea', companionIds: ['ana'], npc: false }
    const asked = sceneSuggestions(content, giveContact(friends, 'ana'), both)
    expect(asked.map((one) => one.id)).toEqual(['bond:exclusive:bea', 'bond:exclusive:ana', 'bond:open-throuple:bea+ana'])
    expect(asked[2].text).toBe('Bea and Ana, do you think we\'re ready for open throuple?')
    expect(asked[2].cue).toContain('propose_relationship with open-throuple')
  })
})

describe('completing a name', () => {
  it('finishes the last word typed from its first letter, without accents or case in the way', () => {
    expect(completeName(['Zélie', 'Tamsin'], 'Hey ze')).toBe('lie')
    expect(completeName(['Zélie', 'Tamsin'], 'tam')).toBe('sin')
    expect(completeName(['Zélie', 'Tamsin'], 'Hey t')).toBe('amsin')
    expect(completeName(['Zélie', 'Tamsin'], 'Hey b')).toBeUndefined()
    expect(completeName(['Zélie', 'Tamsin'], 'Tamsin')).toBeUndefined()
    expect(completeName(['Zélie', 'Tamsin'], 'Hello ')).toBeUndefined()
  })
})
