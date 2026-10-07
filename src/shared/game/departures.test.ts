import { describe, expect, it } from 'vitest'
import type { ContentPack, Scene } from '../model'
import { buildSummaryPrompt } from './memory'
import { buildCharacterPrompt } from './prompt'
import { leavers, leaveScene, sceneBaseline, sceneCast, sceneWitnesses } from './scene'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Three love interests at tea: Ana leads, Bea and Cy are with her.
const base = fixture()
const [ana] = base.loveInterests
const content: ContentPack = {
  ...base,
  loveInterests: [ana, { ...ana, id: 'bea', name: 'Bea Stone' }, { ...ana, id: 'cy', name: 'Cy' }]
}
const start = createInitialState(content)
const state = { ...start, relationships: { ...start.relationships, bea: { affection: 20, trust: 5, desire: 0 } } }
const scene: Scene = {
  loveInterestId: 'ana',
  companionIds: ['bea', 'cy'],
  npc: false,
  nsfw: false,
  beats: [{ activityName: 'Tea' }],
  messages: [
    { role: 'user', content: 'Hello, all.' },
    { role: 'assistant', content: 'Ana: Hello.\nBea: You again.' }
  ],
  gifts: [],
  conceived: [],
  departed: [],
  outfitId: 'default',
  expression: 'happy',
  roomOf: 'ana',
  baseline: sceneBaseline(state, 'ana', ['bea', 'cy'])
}

describe('leavers', () => {
  it('are people in the scene, and never everyone', () => {
    expect(leavers(scene, ['bea'])).toEqual(['bea'])
    expect(leavers(scene, ['cy', 'cy', 'nobody', 'ana'])).toEqual(['cy', 'ana'])
    expect(leavers(scene, ['ana', 'bea', 'cy'])).toEqual([])
    expect(leavers({ loveInterestId: 'ana', companionIds: [] }, ['ana'])).toEqual([])
  })
})

describe('leaveScene', () => {
  it('goes on with whoever remains, and remembers who went and when', () => {
    const after = leaveScene(scene, ['cy'], 'content', 'late for work')
    expect(sceneCast(after)).toEqual(['ana', 'bea'])
    expect(after.departed).toEqual([{ id: 'cy', at: 2, feeling: 'content', reason: 'late for work' }])
    expect(sceneWitnesses(after)).toEqual(['ana', 'bea', 'cy'])
    // The lead is still there: what she looks like, and her room, are untouched.
    expect(after).toMatchObject({ outfitId: 'default', expression: 'happy', roomOf: 'ana' })
    expect(leaveScene(scene, ['ana', 'bea', 'cy'])).toBe(scene)
  })

  it('hands the scene to the next when the one leading it goes', () => {
    const after = leaveScene(scene, ['ana'], 'angry', 'the joke about her mother')
    expect(after.loveInterestId).toBe('bea')
    expect(after.companionIds).toEqual(['cy'])
    // Her look and her room go with her.
    expect(after.outfitId).toBeUndefined()
    expect(after.expression).toBeUndefined()
    expect(after.roomOf).toBeUndefined()
    // Everyone is still measured from where they stood when the scene began.
    expect(after.baseline?.relationship.affection).toBe(20)
    expect(after.baseline?.companions['ana'].affection).toBe(0)
  })

  it('can be down to one, which is then an ordinary scene with her', () => {
    const alone = leaveScene(leaveScene(scene, ['cy']), ['ana'])
    expect(sceneCast(alone)).toEqual(['bea'])
    expect(alone.departed.map((d) => d.id)).toEqual(['cy', 'ana'])
    expect(leaveScene(alone, ['bea'])).toBe(alone)
  })
})

describe('after someone has left', () => {
  const later: Scene = {
    ...leaveScene(scene, ['bea'], 'hurt', 'saw she was not wanted'),
    messages: [...scene.messages, { role: 'user', content: 'Just us, then.' }, { role: 'assistant', content: 'Ana: So it seems.' }]
  }

  it('the prompt says she is gone and writes for those who are left', () => {
    const prompt = buildCharacterPrompt({
      content,
      state,
      loveInterestId: later.loveInterestId,
      companionIds: later.companionIds,
      sceneBeats: later.beats,
      departed: later.departed
    })
    expect(prompt).toContain('Bea was here earlier and has left: saw she was not wanted. She is gone, and went hurt; she does not speak or act again in this scene.')
    expect(prompt).toContain('## Also in the scene: Cy')
    expect(prompt).not.toContain('## Also in the scene: Bea Stone')
  })

  it('her memory stops where she left, and says how; the others remember that she went', () => {
    const hers = buildSummaryPrompt({ content, state, scene: later, forId: 'bea' })
    expect(hers.system).toContain('Bea Stone left before it was over (saw she was not wanted), feeling hurt.')
    expect(hers.user).toContain('You again.')
    expect(hers.user).not.toContain('Just us, then.')

    const anas = buildSummaryPrompt({ content, state, scene: later, forId: 'ana' })
    expect(anas.system).toContain('Bea left part-way through (saw she was not wanted).')
    expect(anas.user).toContain('Just us, then.')
  })
})
