import { describe, expect, it } from 'vitest'
import type { GameState, Scene } from '../model'
import { SaveDataSchema } from '../saves'
import { createInitialState } from './state'
import { fixture } from './testFixture'
import { packTurns, rewound, unpackTurns, type Turn } from './turns'

const content = fixture()
const start = createInitialState(content)
const opening: Scene = {
  baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 0, trust: 0, desire: 0 }, companions: {} },
  loveInterestId: 'ana',
  companionIds: [],
  nsfw: false,
  beats: [{ activityName: 'Tea', locationName: 'Home' }],
  messages: [{ role: 'assistant', content: 'You came.' }],
  gifts: [], conceived: [], departed: [], npc: false
}

// Two turns: the first reply gave him her contact and changed her face; the second moved the scene and passed two hours.
const afterFirst: { state: GameState; scene: Scene } = {
  state: { ...start, contacts: [...start.contacts, 'ana'] },
  scene: { ...opening, expression: 'happy', messages: [...opening.messages, { role: 'user', content: 'I did.' }, { role: 'assistant', content: 'Good.' }] }
}
const now: { state: GameState; scene: Scene } = {
  state: { ...afterFirst.state, time: start.time + 2, locationId: 'shop' },
  scene: {
    ...afterFirst.scene,
    beats: [{ ...opening.beats[0], finished: true }, { activityName: 'arrived', locationName: 'the Shop' }],
    proposal: { loveInterestId: 'ana', companionIds: [], title: 'Supper', time: 30, hours: 2, locationId: 'home' },
    messages: [...afterFirst.scene.messages, { role: 'user', content: 'Shall we go?' }, { role: 'assistant', content: 'Lead on.' }]
  }
}
const turns: Turn[] = [
  { state: start, scene: opening, text: 'I did.' },
  { ...afterFirst, text: 'Shall we go?' }
]

describe('turns that can be taken back', () => {
  it('are saved as what each changed, and no more', () => {
    const packed = packTurns(turns, now.state, now.scene)
    expect(packed.map((turn) => [turn.text, turn.messages])).toEqual([['I did.', 1], ['Shall we go?', 3]])
    // The first turn changed who he can message; the second where and when he is.
    expect(Object.keys(packed[0].state)).toEqual(['contacts'])
    expect(Object.keys(packed[1].state).sort()).toEqual(['locationId', 'time'])
    expect(packed[0].absent.scene).toEqual(['expression'])
    expect(Object.keys(packed[1].scene)).toEqual(['beats'])
    expect(packed[1].absent.scene).toEqual(['proposal'])
  })

  it('come back from a save as they were, and take the game back turn by turn', () => {
    // As a save does it: through its own schema and through JSON, where nothing is shared any more.
    const saved = SaveDataSchema.parse(JSON.parse(JSON.stringify({ ...now, turns: packTurns(turns, now.state, now.scene) })))
    const read = unpackTurns(saved.turns ?? [], saved.state, saved.scene!)
    expect(read).toEqual(turns)
    // What was not touched is shared with the turn after it, so that a second save is as small as the first.
    expect(read[1].state.courses).toBe(saved.state.courses)
    expect(packTurns(read, saved.state, saved.scene!)).toEqual(saved.turns)
    expect(unpackTurns([], now.state, now.scene)).toEqual([])
  })

  it('keep what reached his phone meanwhile when one is taken back', () => {
    const posted = { ...now.state, feedDay: 3, feed: [{ id: 'post-1-ana', authorId: 'ana', time: 1, text: 'Rain.', liked: false }] }
    const back = rewound(turns[1], posted)
    expect(back).toMatchObject({ time: start.time, locationId: start.locationId, feedDay: 3 })
    expect(back.feed).toBe(posted.feed)
    expect(back.contacts).toEqual(afterFirst.state.contacts)
    // And a post that arrives during a turn is not put into the save with it.
    expect(Object.keys(packTurns([turns[1]], posted, now.scene)[0].state).sort()).toEqual(['locationId', 'time'])
  })
})
