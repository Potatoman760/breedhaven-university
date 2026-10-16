import { lookOf, spriteFor } from './looks'
import { describe, expect, it } from 'vitest'
import { LoveInterestSchema, type Scene } from '../model'
import { perform } from './activities'
import { buildCharacterPrompt } from './prompt'
import {
  applyComfort,
  applyLook,
  applyLooks,
  leaveScene,
  dialogueLines,
  firstNames,
  hasMet,
  meet,
  sceneCast,
  parseDirectives,
  plainName,
  namesHer,
  sceneBaseline,
  sceneOutcome,
  splitSceneEnd,
  validLook,
  whoSpoke
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
      { id: 'missionary', name: 'Missionary', description: 'on her back, him above', clip: 'm.mp4' }
    ],
    ai: { speechPattern: 'Plain.' }
  })
  const scene: Scene = { baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 0, trust: 0, desire: 0 }, companions: {} }, loveInterestId: 'ana', companionIds: [], nsfw: false, beats: [], messages: [], gifts: [], conceived: [], departed: [], npc: false }

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
      expression: 'Happy',
      seeded: [],
      stopsControl: [],
      named: [],
      comfort: [],
      leaving: [],
      attending: [],
      agreed: false,
      slept: false
    })
    expect(parseDirectives('Yes.\n[ANIMATION: missionary]').animationId).toBe('missionary')
    // A pose goes on top of a face and an outfit, and is asked for beside them.
    expect(parseDirectives('[OUTFIT: nude]\n[EXPRESSION: aroused]\n[POSE: missionary]\nYes.')).toMatchObject({ text: 'Yes.', outfitId: 'nude', expression: 'aroused', animationId: 'missionary' })
    expect(parseDirectives('Enough.\n[POSE: none]').animationId).toBeNull()
    // The tag is [SEX-ACT: id], however it is spaced or joined; [POSE] is still read.
    expect(parseDirectives('[SEX-ACT: cowgirl]\nYes.')).toMatchObject({ text: 'Yes.', animationId: 'cowgirl' })
    expect(parseDirectives('[Sex Act: Faye=doggy]').animationOf).toBe('Faye')
    expect(parseDirectives('[SEX_ACT: none]').animationId).toBeNull()
    expect(parseDirectives('Enough.\n[ANIMATION: none]\n[END SCENE]')).toEqual({
      text: 'Enough.',
      ended: true,
      animationId: null,
      seeded: [],
      stopsControl: [],
      named: [],
      comfort: [],
      leaving: [],
      attending: [],
      agreed: false,
      slept: false
    })
  })

  it('reads how comfortable she says she is, hides it, and keeps it for the next prompt', () => {
    const alone = parseDirectives('[EXPRESSION: embarrassed]\n[COMFORT: 2 he keeps asking about my mother]\nCan we talk about something else?')
    expect(alone.text).toBe('Can we talk about something else?')
    expect(alone.comfort).toEqual([{ name: '', level: 2, reason: 'he keeps asking about my mother' }])
    // In a group each line says whose it is; however it is punctuated, and whatever cannot be read is still hidden.
    const group = parseDirectives('[COMFORT: Ana=5: glad of the company]\n[comfort: bea = 1 - they are kissing in front of her]\n[COMFORT: very]\nAna: Stay.')
    expect(group.text).toBe('Ana: Stay.')
    expect(group.comfort).toEqual([
      { name: 'Ana', level: 5, reason: 'glad of the company' },
      { name: 'bea', level: 1, reason: 'they are kissing in front of her' }
    ])
    expect(parseDirectives('[COMFORT: 12 nonsense]\nHello.')).toMatchObject({ text: 'Hello.', comfort: [] })
    // A tag the model garbled is hidden all the same, but a bracket of ordinary words is not.
    expect(parseDirectives('[COMFassessing the table dynamics]\nHello.')).toMatchObject({ text: 'Hello.', comfort: [] })
    expect(parseDirectives('[COMF 4 fine]\nHi.')).toMatchObject({ text: 'Hi.', comfort: [{ name: '', level: 4, reason: 'fine' }] })
    expect(parseDirectives('[Comfortable silence]').text).toBe('[Comfortable silence]')

    const kept = applyComfort(scene, { ana: { level: 2, reason: 'he keeps asking about my mother' } })
    expect(applyComfort(scene, {})).toBe(scene)
    const prompt = buildCharacterPrompt({ content: fixture(), state: createInitialState(fixture()), loveInterestId: 'ana', sceneBeats: [{ activityName: 'Tea' }], look: kept, comfort: kept.comfort })
    expect(prompt).toContain('## How comfortable you are')
    expect(prompt).toContain('every reply has one more hidden line: [COMFORT: 4 a few words why]')
    expect(prompt).toContain('You last said 2: he keeps asking about my mother.')
    expect(prompt).toContain('At 1, or at 2 twice running with nothing better, leave')
    // Whoever walks out takes her reading with her.
    const both = applyComfort({ ...scene, companionIds: ['bea'] }, { ana: { level: 4, reason: '' }, bea: { level: 1, reason: 'had enough' } })
    expect(leaveScene(both, ['bea'], 'hurt', 'had enough').comfort).toEqual({ ana: { level: 4, reason: '' } })
  })

  it('reads whose look a tag is, in a group', () => {
    const { text, named, expression } = parseDirectives('[EXPRESSION: Ana=happy]\n[EXPRESSION: bea = Sad]\n[OUTFIT: Bea=nude]\nAna: Hello.')
    expect(text).toBe('Ana: Hello.')
    expect(expression).toBeUndefined()
    expect(named).toEqual([
      { name: 'Ana', expression: 'happy' },
      { name: 'bea', expression: 'Sad', outfitId: 'nude' }
    ])
  })

  it('accepts an outfit she has, any of the standard faces, and any other picture the outfit has', () => {
    expect(validLook({ outfitId: 'NUDE', expression: 'happy' }, li, scene)).toEqual({ outfitId: 'nude', expression: 'happy' })
    expect(validLook({ outfitId: 'armor', expression: 'Happy' }, li, scene)).toEqual({ expression: 'happy' })
    // A face that has not been drawn is still hers to make; the neutral picture stands in for it.
    expect(validLook({ expression: 'Embarassed' }, li, { ...scene, outfitId: 'nude' })).toEqual({ expression: 'embarrassed' })
    expect(validLook({ expression: 'horny' }, li, scene)).toEqual({ expression: 'aroused' })
    expect(validLook({ expression: 'smug' }, li, scene)).toEqual({})
    expect(spriteFor(li, li.outfits[1], 'embarrassed')).toBe('c.png')
    expect(spriteFor(li, li.outfits[0], 'happy')).toBe('b.png')
    // An outfit with no pictures of its own borrows: pregnant from her usual clothes, nude-pregnant from nude.
    const empty = (id: string) => ({ id, name: id, description: '', sprites: {}, pregnant: true })
    const four = [li.outfits[0], empty('pregnant'), li.outfits[1], empty('nude-pregnant')]
    expect(spriteFor({ ...li, outfits: four }, four[1], 'happy')).toBe('b.png')
    expect(spriteFor({ ...li, outfits: four }, four[3], 'happy')).toBe('c.png')
    // An outfit set to show another's pictures shows those, whatever it has of its own.
    const same = [li.outfits[0], { ...li.outfits[1], fallback: li.outfits[0].id }]
    expect(spriteFor({ ...li, outfits: same }, same[1], 'happy')).toBe('b.png')
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
    // A pose is up for the reply that asked for it and no longer: the next reply takes it down by leaving it out...
    expect(applyLook(playing, {}).animationId).toBeUndefined()
    expect(applyLook(playing, { expression: 'neutral' })).toMatchObject({ expression: 'neutral', animationId: undefined })
    expect(applyLook(playing, { animationId: null }).animationId).toBeUndefined()
    // ...and keeps it up only by asking for it again, or changes it by asking for another.
    expect(applyLook(playing, { expression: 'aroused', animationId: 'missionary' })).toMatchObject({ expression: 'aroused', animationId: 'missionary' })
    expect(applyLook(playing, { animationId: 'cowgirl' }).animationId).toBe('cowgirl')
  })

  it('keeps a look for each of the others in a group, and hands it on when one becomes the lead', () => {
    const group: Scene = { ...scene, companionIds: ['bea'], expression: 'happy' }
    const both = applyLooks(group, { bea: { expression: 'sad' }, ana: { expression: 'angry' } })
    expect(both.looks).toEqual({ bea: { outfitId: undefined, expression: 'sad' } })
    expect(lookOf(both, 'bea')).toEqual({ outfitId: undefined, expression: 'sad' })
    expect(lookOf(both, 'ana')).toEqual({ outfitId: undefined, expression: 'happy' })
    const changed = applyLooks(both, { bea: { outfitId: 'nude' } })
    expect(lookOf(changed, 'bea')).toEqual({ outfitId: 'nude', expression: undefined })
    const alone = leaveScene(changed, ['ana'], 'content', '')
    expect(alone).toMatchObject({ loveInterestId: 'bea', outfitId: 'nude', looks: {} })
  })

  it('tells the LLM what it may switch to', () => {
    const content = { ...fixture(), loveInterests: [li] }
    const fresh = createInitialState(content)
    // They have met before: a woman he has only just met is told nothing of sex-acts.
    const state = { ...fresh, memories: { ana: [{ time: 0, summary: 'They met.', level: 'normal' as const }], bea: [{ time: 0, summary: 'They met.', level: 'normal' as const }] } }
    const prompt = (look: Parameters<typeof buildCharacterPrompt>[0]['look']) =>
      buildCharacterPrompt({ content, state, loveInterestId: 'ana', look })
    expect(buildCharacterPrompt({ content, state: fresh, loveInterestId: 'ana', look: {} })).not.toContain('[SEX-ACT: id]')
    expect(buildCharacterPrompt({ content, state: fresh, loveInterestId: 'ana', look: {} })).not.toContain('- missionary')

    const start = prompt({})
    expect(start).toContain('Every reply must BEGIN with one line giving the look on your face, before anything else is written: [EXPRESSION: happy]')
    expect(start).toContain('exactly these: neutral, happy, sad, angry, surprised, embarrassed, aroused')
    expect(start).toContain('You are wearing "default"')
    // What she has on is described once, under who she is; the list only points to it.
    expect(start).toContain('Wearing: a red dress')
    expect(start).toContain('- default (Dress): what you have on now, described above\n- nude (Nude): no description')
    expect(start.split('a red dress')).toHaveLength(2)
    expect(start.trimEnd()).toContain('Reminder: begin with the [EXPRESSION] and [COMFORT] lines. Then ')
    expect(start).toContain('- missionary (Missionary): on her back, him above')

    const later = prompt({ outfitId: 'nude', animationId: 'missionary' })
    expect(later).toContain('Wearing: Nude')
    expect(later).toContain('"missionary" was up for your last reply')

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
    // Work pays money and costs energy; the date (forced past its stage requirement) adds affection.
    const worked = perform(activity('work'), friends, content)
    const after = {
      ...worked,
      relationships: { ana: { affection: 33, trust: 2, desire: 0 } }
    }
    expect(sceneOutcome(content, baseline, after, 'ana')).toEqual({
      player: [
        { label: 'money', from: 0, to: 10 },
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

  it('counts a love interest as met once she has been in a scene', () => {
    const content = fixture()
    const fresh = createInitialState(content)
    expect(hasMet(fresh, 'ana')).toBe(false)
    // Someone in the cast who is not a love interest, such as an NPC, is not recorded.
    const met = meet(content, fresh, ['ana', 'ana', 'a-porter'])
    expect(met.met).toEqual(['ana'])
    expect(hasMet(met, 'ana')).toBe(true)
    // Nothing new to record leaves the state as it was.
    expect(meet(content, met, ['ana'])).toBe(met)
  })

  it('starts someone the player already knows as met, reachable, and where her file says things stand', () => {
    const base = fixture()
    const [ana, ...rest] = base.loveInterests
    const content = { ...base, loveInterests: [{ ...ana, startsAt: { affection: 35, trust: 45, desire: 10 } }, ...rest] }
    const fresh = createInitialState(content)
    expect(fresh.relationships['ana']).toEqual({ affection: 35, trust: 45, desire: 10 })
    expect(fresh.met).toEqual(['ana'])
    expect(fresh.contacts).toEqual(['ana'])
    // Everyone else is a stranger still.
    expect(createInitialState(base).met).toEqual([])
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

describe('what a reasoning model thought first', () => {
  it('is no part of the reply', () => {
    expect(parseDirectives('<think>She would tease him.</think>\n[EXPRESSION: happy]\nAna: You came.')).toMatchObject({ text: 'Ana: You came.', expression: 'happy' })
    // A block whose opening was cut off is dropped up to where it closes.
    expect(parseDirectives('she would tease him.</think>\nAna: You came.').text).toBe('Ana: You came.')
    expect(parseDirectives('Ana: I think so.').text).toBe('Ana: I think so.')
  })
})

describe('what a character declares in a reply', () => {
  it('is read from lines of its own and never shown: leaving, being at an event, a plan agreed, the night slept through', () => {
    const read = parseDirectives('She gathers her things.\n[LEAVES: Bea=hurt saw she was not wanted]\n[ATTENDING: Societies-Fair]\n[AGREED]\n[SLEEP]')
    expect(read.text).toBe('She gathers her things.')
    expect(read.leaving).toEqual([{ name: 'Bea', feeling: 'hurt', reason: 'saw she was not wanted' }])
    expect(read.attending).toEqual([{ name: '', eventId: 'societies-fair' }])
    expect(read.agreed).toBe(true)
    expect(read.slept).toBe(true)
    // Who it is, in a group; and a leaving with no feeling given is simply a going.
    expect(parseDirectives('[ATTENDING: Bea=fair]\n[LEAVES: Cy]').attending).toEqual([{ name: 'Bea', eventId: 'fair' }])
    // Only someone with a line of her own in the reply can be the one who said she is going.
    const cast = [{ id: 'bea', name: 'Bea Moss' }, { id: 'cy', name: 'Cy Lark' }]
    expect(whoSpoke('Bea: I would love to come.\n*Cy looks away.*\nBea: Saturday, then.', cast)).toEqual(['bea'])
    expect(parseDirectives('[LEAVES: Cy]\nOff she goes.')).toMatchObject({ text: 'Off she goes.', leaving: [{ name: 'Cy', feeling: 'content', reason: '' }] })
    expect(parseDirectives('Good night.')).toMatchObject({ leaving: [], attending: [], agreed: false, slept: false })
  })
})

describe('a name the LLM wrote', () => {
  const zelie = { id: 'zelie', name: 'Zélie Marchand' }

  it('is known with or without its accents, in any case, by first name, whole name or id', () => {
    expect(plainName('  Zélie ')).toBe('zelie')
    for (const written of ['Zélie', 'Zelie', 'ZELIE', 'zelie', 'Zélie Marchand', 'Zelie Marchand']) expect(namesHer(written, zelie), written).toBe(true)
    expect(namesHer('Marchand', zelie)).toBe(false)
    expect(namesHer('Tamsin', zelie)).toBe(false)
  })

  it('gives her her lines and her looks, however the accent was written', () => {
    expect(dialogueLines('Zelie: Bonjour.\nTamsin: Hey.', [zelie, { id: 'tamsin', name: 'Tamsin' }]).map((line) => line.speakerId)).toEqual(['zelie', 'tamsin'])
    // Two spellings of one name are one person's look, not two people's.
    expect(parseDirectives('[EXPRESSION: Zélie=happy]\n[OUTFIT: Zelie=nude]\nZélie: Oui.').named).toEqual([{ name: 'Zélie', expression: 'happy', outfitId: 'nude' }])
    expect(parseDirectives('She goes.\n[LEAVES: Zelie=content the baby is crying]').leaving).toEqual([{ name: 'Zelie', feeling: 'content', reason: 'the baby is crying' }])
  })
})
