import { describe, expect, it } from 'vitest'
import { RelationshipStatusSchema, type ContentPack, type GameState } from '../model'
import {
  acceptBond,
  bondOf,
  bondLifts,
  canBond,
  changeTie,
  describeBond,
  describeBonds,
  endBond,
  formBond,
  growTies,
  tieLevel,
  tieOf
} from './bonds'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Three love interests, and the arrangements of the real game in miniature. The fixture's
// stages are stranger (0), friend (30) and lover (80).
const base = fixture()
const [ana] = base.loveInterests
const content: ContentPack = {
  ...base,
  loveInterests: [ana, { ...ana, id: 'bea', name: 'Bea Stone' }, { ...ana, id: 'cy', name: 'Cy' }],
  relationships: {
    ...base.relationships,
    statuses: [
      { id: 'exclusive', name: 'Courting', exclusive: true, minStage: 'friend', description: 'A couple.', guidance: 'Expect to be put first.' },
      { id: 'open', name: 'Open courtship', minStage: 'friend', description: 'A couple who may see others.' },
      { id: 'open-triad', name: 'Open triad', minMembers: 2, maxMembers: 2, mutual: true, minStage: 'friend', minTie: 30, description: 'Three together.' }
    ].map((s) => RelationshipStatusSchema.parse(s)),
    tieLevels: [
      { id: 'strangers', name: 'barely acquainted', min: 0, description: '' },
      { id: 'close', name: 'close', min: 30, description: 'You trust her.' }
    ],
    ties: [{ a: 'bea', b: 'cy', affection: 12, note: 'They shared a room last year.' }]
  }
}
const friendsWith = (...ids: string[]): GameState => {
  const state = createInitialState(content)
  return {
    ...state,
    relationships: Object.fromEntries(
      Object.keys(state.relationships).map((id) => [id, { affection: ids.includes(id) ? 40 : 0, trust: 0, desire: 0 }])
    )
  }
}

describe('ties between love interests', () => {
  it('start where the content puts them and grow when they share a scene', () => {
    const state = createInitialState(content)
    expect(tieOf(content, state, 'cy', 'bea')).toBe(12)
    expect(tieOf(content, state, 'ana', 'bea')).toBe(0)
    const after = growTies(content, state, ['ana', 'bea', 'cy'])
    expect(after.ties).toEqual({ 'ana|bea': 5, 'ana|cy': 5, 'bea|cy': 17 })
    expect(tieOf(content, changeTie(content, after, 'bea', 'ana', 500), 'ana', 'bea')).toBe(100)
    expect(changeTie(content, state, 'ana', 'ana', 5)).toBe(state)
    expect(tieLevel(content, 29)?.name).toBe('barely acquainted')
    expect(tieLevel(content, 30)?.name).toBe('close')
  })
})

describe('canBond', () => {
  it('needs the right people, and is not held back by how far along they are: whoever agrees to it is brought up to it', () => {
    const state = friendsWith('ana')
    expect(canBond(content, state, { statusId: 'open', memberIds: ['ana'] }).ok).toBe(true)
    expect(bondLifts(content, state, { statusId: 'open', memberIds: ['ana'] })).toEqual([])
    // Bea is a stranger. She may still ask, and agreeing makes her a friend, which is what the arrangement is for.
    expect(canBond(content, state, { statusId: 'open', memberIds: ['bea'] }).ok).toBe(true)
    expect(bondLifts(content, state, { statusId: 'open', memberIds: ['bea'] }).map((lift) => [lift.id, lift.stage.id])).toEqual([['bea', 'friend']])
    const agreed = formBond(content, state, { statusId: 'open', memberIds: ['bea'] })
    expect(agreed.relationships['bea']).toEqual({ affection: 30, trust: 0, desire: 0 })
    // Someone already past it is left where she is.
    expect(formBond(content, state, { statusId: 'open', memberIds: ['ana'] }).relationships['ana'].affection).toBe(40)
    expect(canBond(content, state, { statusId: 'open', memberIds: ['ana', 'bea'] }).reasons[0]).toBe(
      'Open courtship is between Pat and 1 other'
    )
    expect(canBond(content, state, { statusId: 'marriage', memberIds: ['ana'] }).ok).toBe(false)
  })

  it('needs the love interests in a three to be close to each other as well', () => {
    const state = friendsWith('ana', 'bea')
    const three = { statusId: 'open-triad', memberIds: ['ana', 'bea'] }
    expect(canBond(content, state, three).reasons).toEqual(['Ana and Bea are not close enough to each other yet'])
    expect(canBond(content, changeTie(content, state, 'ana', 'bea', 30), three).ok).toBe(true)
  })

  it('holds the player to a promise of exclusivity until it is changed with the one it was made to', () => {
    const couple = formBond(content, friendsWith('ana', 'bea'), { statusId: 'exclusive', memberIds: ['ana'] })
    expect(canBond(content, couple, { statusId: 'open', memberIds: ['bea'] }).reasons).toEqual([
      'Pat has promised to see only Ana'
    ])
    // Ana herself can agree to open it up, after which Bea is free to be asked.
    const opened = formBond(content, couple, { statusId: 'open', memberIds: ['ana'] })
    expect(opened.bonds).toEqual([{ statusId: 'open', memberIds: ['ana'], since: 0 }])
    expect(canBond(content, opened, { statusId: 'open', memberIds: ['bea'] }).ok).toBe(true)
    expect(canBond(content, opened, { statusId: 'exclusive', memberIds: ['bea'] }).reasons).toEqual([
      'Pat is also with Ana, which Courting would not allow'
    ])
  })
})

describe('an open three', () => {
  const close = changeTie(content, friendsWith('ana', 'bea'), 'ana', 'bea', 40)
  const both = formBond(content, formBond(content, close, { statusId: 'open', memberIds: ['ana'] }), {
    statusId: 'open',
    memberIds: ['bea']
  })
  const three = formBond(content, both, { statusId: 'open-triad', memberIds: ['ana', 'bea'] })

  it('replaces what each of them had with the player before', () => {
    expect(both.bonds).toHaveLength(2)
    expect(three.bonds).toEqual([{ statusId: 'open-triad', memberIds: ['ana', 'bea'], since: 0 }])
    expect(bondOf(three, 'bea')?.statusId).toBe('open-triad')
    expect(describeBond(content, three.bonds[0])).toBe('Open triad with Ana and Bea')
  })

  it('is told to each of them: who is in it, that they are with each other, and who else he sees', () => {
    const lines = describeBonds(content, three, 'ana')
    expect(lines[0]).toBe('You and Pat are in a relationship: Open triad. Three together.')
    expect(lines[1]).toBe('Bea is part of it too: you are with her as well as with Pat.')
    expect(lines[2]).toMatch(/free to see others/)
    expect(lines[3]).toBe('You and Bea: close. You trust her.')

    // Someone outside it, seen openly, is known about by those inside.
    const plusCy = formBond(content, { ...three, relationships: { ...three.relationships, cy: { affection: 40, trust: 0, desire: 0 } } }, {
      statusId: 'open',
      memberIds: ['cy']
    })
    expect(describeBonds(content, plusCy, 'ana')[2]).toBe('You know Pat is also with Cy, and that is within what you agreed.')
    // Someone with no arrangement is told so, and told of history worth knowing.
    expect(describeBonds(content, three, 'cy')).toEqual([
      'You and Pat have made each other no promises.',
      'You and Bea: barely acquainted. They shared a room last year.'
    ])
  })

  it('reaches the prompt, including what the others in a scene are to him and to her', () => {
    const prompt = buildCharacterPrompt({ content, state: three, loveInterestId: 'ana', companionIds: ['bea'] })
    expect(prompt).toContain('## What you are to each other, and to the others\nYou and Pat are in a relationship: Open triad.')
    expect(prompt).toContain('She and Pat are in a relationship: Open triad.')
    // What she and the other are to each other is said once, and not again under the other's name.
    expect(prompt).toContain('You and Bea: close.')
    expect(prompt).not.toContain('You and she are close.')
    expect(buildCharacterPrompt({ content: base, state: createInitialState(base), loveInterestId: 'ana' })).not.toContain(
      'What you are to each other'
    )
  })

  it('ends for one without ending for the rest where that still makes sense', () => {
    expect(endBond(content, both, 'ana').bonds).toEqual([{ statusId: 'open', memberIds: ['bea'], since: 0 }])
    // A three with one gone is no longer a three.
    expect(endBond(content, three, 'ana').bonds).toEqual([])
    expect(acceptBond(content, both, { statusId: 'none', memberIds: ['bea'] }).bonds.map((b) => b.memberIds)).toEqual([['ana']])
    expect(describeBond(content, { statusId: 'none', memberIds: ['bea'] })).toBe('End things with Bea')
  })
})
