import { describe, expect, it } from 'vitest'
import { NpcSchema, validateContentPack, type ContentPack } from '../model'
import { buildSummaryPrompt } from './memory'
import { canTalkToNpc, npcAsCharacter, npcsAt, sceneExtras, talkToNpc, withNpc } from './npcs'
import { buildCharacterPrompt } from './prompt'
import { dialogueLines } from './scene'
import { createInitialState } from './state'
import { fixture, rawFixture } from './testFixture'

// The fixture's day runs from 05:00 ("day") to 15:00 ("night"); the game starts at 06:00 at home.
const smith = NpcSchema.parse({
  id: 'bryn',
  name: 'Bryn',
  role: 'the town smith',
  age: 34,
  bio: 'Bryn mends what people break.',
  personality: 'Blunt and cheerful.',
  outfits: [{ id: 'default', name: 'Apron', description: 'a scorched apron' }],
  defaultOutfitId: 'default',
  schedule: [{ periods: ['day'], locationId: 'home' }],
  ai: { speechPattern: 'Loud.', knowledge: ['The shop shuts at three.'] }
})
const content: ContentPack = { ...fixture(), npcs: [smith] }
const state = createInitialState(content)

describe('NPCs in content', () => {
  it('are checked like everything else, and may not share an id with a love interest', () => {
    const pack = (npc: object) => () => validateContentPack({ ...rawFixture(), npcs: [npc] })
    expect(pack(smith)).not.toThrow()
    expect(pack({ ...smith, id: 'ana' })).toThrow(/a love interest already has this id/)
    expect(pack({ ...smith, schedule: [{ locationId: 'moon' }] })).toThrow(/unknown location "moon"/)
    expect(pack({ ...smith, defaultOutfitId: 'gown' })).toThrow(/unknown outfit "gown"/)
    expect(pack({ ...smith, age: 12 })).toThrow()
    expect(fixture().npcs).toEqual([])
  })

  it('have no relationship with the player, and are not among the love interests', () => {
    expect(state.relationships['bryn']).toBeUndefined()
    expect(content.loveInterests.map((li) => li.id)).toEqual(['ana'])
    expect(withNpc(content, 'bryn').loveInterests.map((li) => li.id)).toEqual(['ana', 'bryn'])
    expect(withNpc(content, 'nobody')).toBe(content)
    expect(npcAsCharacter(smith)).toMatchObject({ id: 'bryn', traitIds: [], admires: [], likes: [] })
  })
})

describe('talking to an NPC', () => {
  it('needs them to be where the player is', () => {
    expect(npcsAt(content, state, 'home').map((npc) => npc.id)).toEqual(['bryn'])
    expect(npcsAt(content, state, 'shop')).toEqual([])
    expect(canTalkToNpc(content, state, 'bryn').ok).toBe(true)
    expect(canTalkToNpc(content, { ...state, locationId: 'shop' }, 'bryn').reasons).toEqual(['Bryn is not here'])
    // At night she has gone wherever smiths go.
    expect(npcsAt(content, { ...state, time: 10 }, 'home')).toEqual([])
    expect(() => talkToNpc(content, { ...state, time: 10 }, 'bryn')).toThrow(/not here/)
  })

  it('takes an hour and opens a scene marked as an NPC\'s', () => {
    const { state: after, scene } = talkToNpc(content, state, 'bryn')
    expect(after.time).toBe(1)
    expect(after.relationships).toEqual(state.relationships)
    expect(scene).toMatchObject({
      loveInterestId: 'bryn',
      npc: true,
      companionIds: [],
      beats: [{ activityName: 'A word with Bryn', locationName: 'Home', description: 'Bryn mends what people break.' }]
    })
  })

  it('is written with a prompt that has her voice and what she knows, and nothing of romance', () => {
    const { state: after, scene } = talkToNpc(content, state, 'bryn')
    const prompt = buildCharacterPrompt({
      content: withNpc(content, 'bryn'),
      state: after,
      loveInterestId: 'bryn',
      npc: { role: smith.role, knowledge: smith.ai.knowledge },
      sceneBeats: scene.beats,
      look: scene
    })
    expect(prompt).toContain('You are Bryn')
    expect(prompt).toContain("You are the town smith, not one of Pat's romantic prospects")
    expect(prompt).toContain('never take part in anything sexual')
    expect(prompt).toContain('## What you know, and will tell Pat if it comes up\n- The shop shuts at three.')
    expect(prompt).toContain('Loud.')
    expect(prompt).toContain('## Ending the scene')
    for (const absent of ['Your relationship with', 'What you are to each other', '## Conception', '## Children', 'Affection']) {
      expect(prompt).not.toContain(absent)
    }
    // A love interest's prompt is as it was.
    const ana = buildCharacterPrompt({ content, state, loveInterestId: 'ana' })
    expect(ana).toContain('## Your relationship with Pat')
    expect(ana).not.toContain('romantic prospects')
  })

  it('leaves a memory like any other scene', () => {
    const { state: after, scene } = talkToNpc(content, state, 'bryn')
    const { system } = buildSummaryPrompt({ content: withNpc(content, 'bryn'), state: after, scene })
    expect(system).toContain('write the single memory Bryn keeps of it')
  })
})

describe('NPCs as extras in a scene with love interests', () => {
  it('are whoever is where the scene is, and nobody in a scene that is an NPC\'s own', () => {
    expect(sceneExtras(content, state, { npc: false }).map((npc) => npc.id)).toEqual(['bryn'])
    expect(sceneExtras(content, { ...state, locationId: 'shop' }, { npc: false })).toEqual([])
    expect(sceneExtras(content, state, { npc: true })).toEqual([])
  })

  it('are listed for the LLM, which then names the speaker of every line', () => {
    const prompt = buildCharacterPrompt({
      content,
      state,
      loveInterestId: 'ana',
      sceneBeats: [{ activityName: 'Tea' }],
      extras: sceneExtras(content, state, { npc: false })
    })
    expect(prompt).toContain('## Also here')
    expect(prompt).toContain('- Bryn, the town smith. Blunt and cheerful.')
    expect(prompt).toContain('How Bryn speaks: Loud.')
    expect(prompt).toContain('Knows: The shop shuts at three.')
    expect(prompt).toContain("Start every spoken line with the speaker's first name")
    expect(prompt).toContain('They never flirt and take no part in anything sexual.')
    // She is still a love interest's scene: the relationship is all there.
    expect(prompt).toContain('## Your relationship with Pat')
    expect(buildCharacterPrompt({ content, state, loveInterestId: 'ana' })).not.toContain('## Also here')
  })

  it('have their lines told apart from the love interest\'s', () => {
    const cast = [content.loveInterests[0], npcAsCharacter(smith)]
    expect(dialogueLines('Ana: Ask her yourself.\nBryn: What will it be?\nTwo, please.', cast)).toEqual([
      { action: false, text: 'Ask her yourself.', speakerId: 'ana' },
      { action: false, text: 'What will it be?', speakerId: 'bryn' },
      { action: false, text: 'Two, please.' }
    ])
  })
})
