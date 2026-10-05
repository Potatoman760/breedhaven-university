import { describe, expect, it } from 'vitest'
import { LoveInterestSchema, type Scene } from '../model'
import { perform } from './activities'
import { buildCharacterPrompt } from './prompt'
import {
  applyLook,
  dialogueLines,
  firstNames,
  sceneCast,
  parseDirectives,
  sceneBaseline,
  sceneOutcome,
  splitSceneEnd,
  validLook
} from './scene'
import { createInitialState } from './state'
import { fixture } from './testFixture'

describe('splitSceneEnd', () => {
  it('leaves an ordinary reply alone', () => {
    expect(splitSceneEnd('Stay a while longer.')).toEqual({ text: 'Stay a while longer.', ended: false })
  })

  it('strips the tag and reports the end', () => {
    expect(splitSceneEnd('Goodnight, then.\n[END SCENE]')).toEqual({ text: 'Goodnight, then.', ended: true })
  })

  it('tolerates the ways a model might write the tag', () => {
    expect(splitSceneEnd('Until tomorrow. [end scene]').ended).toBe(true)
    expect(splitSceneEnd('Until tomorrow.\n\n[ END_SCENE ]').text).toBe('Until tomorrow.')
    expect(splitSceneEnd('[END SCENE]')).toEqual({ text: '', ended: true })
  })
})

describe('look directives', () => {
  const li = LoveInterestSchema.parse({
    id: 'ana',
    name: 'Ana',
    age: 25,
    pronouns: 'she/her',
    personality: 'Dry.',
    outfits: [
      {
        id: 'default',
        name: 'Dress',
        description: 'a red dress',
        sprites: { neutral: 'a.png', happy: { image: 'b.png', description: 'laughing, head tilted' } }
      },
      { id: 'nude', name: 'Nude', sprites: { neutral: 'c.png' } }
    ],
    defaultOutfitId: 'default',
    animations: [
      { id: 'missionary', name: 'Missionary', description: 'on her back, him above', video: 'm.mp4' }
    ],
    ai: { speechPattern: 'Plain.' }
  })
  const scene: Scene = { loveInterestId: 'ana', companionIds: [], nsfw: false, beats: [], messages: [], gifts: [] }

  it('accepts a sprite written as a bare path or with a description', () => {
    expect(li.outfits[0].sprites).toEqual({
      neutral: { image: 'a.png', description: '' },
      happy: { image: 'b.png', description: 'laughing, head tilted' }
    })
  })

  it('reads look tags out of a reply and hides them', () => {
    expect(parseDirectives('Come in.\n[OUTFIT: nude]\n[expression: Happy]')).toEqual({
      text: 'Come in.',
      ended: false,
      outfitId: 'nude',
      expression: 'Happy'
    })
    expect(parseDirectives('Yes.\n[ANIMATION: missionary]').animationId).toBe('missionary')
    expect(parseDirectives('Enough.\n[ANIMATION: none]\n[END SCENE]')).toEqual({
      text: 'Enough.',
      ended: true,
      animationId: null
    })
  })

  it('accepts only what the character can show', () => {
    expect(validLook({ outfitId: 'NUDE', expression: 'happy' }, li, scene)).toEqual({ outfitId: 'nude' })
    expect(validLook({ outfitId: 'armor', expression: 'Happy' }, li, scene)).toEqual({ expression: 'happy' })
    expect(validLook({ expression: 'happy' }, li, { ...scene, outfitId: 'nude' })).toEqual({})
    expect(validLook({ animationId: 'cowgirl' }, li, scene)).toEqual({})
    expect(validLook({ animationId: null }, li, scene)).toEqual({ animationId: null })
  })

  it('lets the LLM play an animation in any scene, whichever LLM is writing it', () => {
    expect(validLook({ animationId: 'Missionary' }, li, scene)).toEqual({ animationId: 'missionary' })
    const onNsfwLlm: Scene = { ...scene, nsfw: true }
    expect(validLook({ animationId: 'missionary' }, li, onNsfwLlm)).toEqual({
      animationId: 'missionary'
    })
  })

  it('applies a look to the scene', () => {
    const dressed = applyLook(scene, { expression: 'happy' })
    expect(dressed).toMatchObject({ expression: 'happy', outfitId: undefined })

    // A new outfit drops an expression chosen for the old one.
    expect(applyLook(dressed, { outfitId: 'nude' })).toMatchObject({ outfitId: 'nude', expression: undefined })

    const playing = applyLook(dressed, { animationId: 'missionary' })
    expect(playing).toMatchObject({ animationId: 'missionary', expression: 'happy' })
    // It keeps playing through replies that say nothing about the look...
    expect(applyLook(playing, {}).animationId).toBe('missionary')
    // ...and stops when told to, or when the character goes back to a sprite.
    expect(applyLook(playing, { animationId: null }).animationId).toBeUndefined()
    expect(applyLook(playing, { expression: 'neutral' }).animationId).toBeUndefined()
  })

  it('tells the LLM what it may switch to', () => {
    const content = { ...fixture(), loveInterests: [li] }
    const state = createInitialState(content)
    const prompt = (look: Parameters<typeof buildCharacterPrompt>[0]['look']) =>
      buildCharacterPrompt({ content, state, loveInterestId: 'ana', look })

    const start = prompt({})
    expect(start).toContain('you are wearing "default"')
    expect(start).toContain(
      '- default (Dress): a red dress\n  - neutral\n  - happy: laughing, head tilted\n' +
        '- nude (Nude): no description\n  - neutral'
    )
    expect(start).toContain('- missionary (Missionary): on her back, him above')

    const later = prompt({ outfitId: 'nude', animationId: 'missionary' })
    expect(later).toContain('Wearing: Nude')
    expect(later).toContain('"missionary" is playing now')

    expect(prompt(undefined)).not.toContain('## How you appear')
  })
})

describe('sceneOutcome', () => {
  const content = fixture()
  const activity = (id: string) => content.activities.find((a) => a.id === id)!
  const friends = {
    ...createInitialState(content),
    locationId: 'shop',
    relationships: { ana: { affection: 28, trust: 0, desire: 0 } }
  }

  it('reports what the scene changed for the player and the relationship', () => {
    const baseline = sceneBaseline(friends, 'ana')
    // Work pays coin and costs energy; the date (forced past its stage requirement) adds affection.
    const worked = perform(activity('work'), friends, content)
    const after = {
      ...worked,
      relationships: { ana: { affection: 33, trust: 2, desire: 0 } }
    }
    expect(sceneOutcome(content, baseline, after, 'ana')).toEqual({
      player: [
        { label: 'coin', from: 0, to: 10 },
        { label: 'energy', from: 50, to: 30 }
      ],
      meters: [
        { label: 'affection', from: 28, to: 33 },
        { label: 'trust', from: 0, to: 2 },
        { label: 'desire', from: 0, to: 0 }
      ],
      stageBefore: 'Stranger',
      stageAfter: 'Friend'
    })
  })

  it('includes stats that did not exist before the scene', () => {
    const baseline = sceneBaseline(friends, 'ana')
    const after = { ...friends, player: { ...friends.player, stats: { charm: 2 } } }
    expect(sceneOutcome(content, baseline, after, 'ana').player).toEqual([
      { label: 'charm', from: 0, to: 2 }
    ])
  })
})

describe('group scenes', () => {
  const cast = [
    { id: 'ana', name: 'Ana' },
    { id: 'bea', name: 'Bea Stone' }
  ]

  it('reads the speaker off each line when given the cast', () => {
    expect(dialogueLines('Ana: Sit down.\n*Bea rolls her eyes.*\nBEA STONE: Or stand.\nNote: nobody cares.', cast)).toEqual([
      { action: false, text: 'Sit down.', speakerId: 'ana' },
      { action: true, text: 'Bea rolls her eyes.' },
      { action: false, text: 'Or stand.', speakerId: 'bea' },
      { action: false, text: 'Note: nobody cares.' }
    ])
    expect(dialogueLines('Ana: Sit down.')).toEqual([{ action: false, text: 'Ana: Sit down.' }])
  })

  it('lists the cast lead first and joins first names', () => {
    const content = fixture()
    expect(sceneCast({ loveInterestId: 'ana', companionIds: ['bea'] })).toEqual(['ana', 'bea'])
    expect(firstNames(content, ['ana'])).toBe('Ana')
    expect(firstNames(content, ['ana', 'x', 'y'])).toBe('Ana, x and y')
  })

  it('measures each companion from their own start', () => {
    const content = fixture()
    const state = createInitialState(content)
    const before = { ...state, relationships: { ...state.relationships, bea: { affection: 10, trust: 0, desire: 0 } } }
    const baseline = sceneBaseline(before, 'ana', ['bea'])
    const after = { ...before, relationships: { ...before.relationships, bea: { affection: 14, trust: 0, desire: 0 } } }
    expect(sceneOutcome(content, baseline, after, 'bea', true).meters[0]).toMatchObject({ from: 10, to: 14 })
    expect(sceneOutcome(content, baseline, after, 'ana').meters[0]).toMatchObject({ from: 0, to: 0 })
  })
})

describe('gifts in a group', () => {
  it('tells the model who each gift went to and how they take it', () => {
    const content = fixture()
    const bea = { ...content.loveInterests[0], id: 'bea', name: 'Bea Stone' }
    const crowd = { ...content, loveInterests: [...content.loveInterests, bea] }
    const prompt = buildCharacterPrompt({
      content: crowd,
      state: createInitialState(crowd),
      loveInterestId: 'ana',
      companionIds: ['bea'],
      gifts: [{ name: 'Rose', description: '', reaction: 'disliked', recipientId: 'bea' }]
    })
    expect(prompt).toContain('- To Bea: Rose. Bea dislikes this kind of thing')
    expect(prompt).toContain('whoever received it reacts')
  })
})
