import { describe, expect, it } from 'vitest'
import type { GameState, Scene } from '../model'
import {
  applySpending,
  buildSpendingPrompt,
  parseSpending,
  addMemory,
  amendMemory,
  applyFeelings,
  buildSummaryPrompt,
  describeAge,
  fallbackSummary,
  parseSummary,
  PLAIN_FEELINGS,
  selectMemories
} from './memory'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const content = fixture()
const start = (): GameState => createInitialState(content)
const scene: Scene = {
  baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 0, trust: 0, desire: 0 }, companions: {} },
  loveInterestId: 'ana',
  companionIds: [],
  nsfw: false,
  beats: [{ activityName: 'Work', locationName: 'the Shop' }, { activityName: 'Date' }],
  messages: [
    { role: 'user', content: 'Do you like it here?' },
    { role: 'assistant', content: 'More than I expected.' }
  ],
  gifts: [], conceived: [], departed: [], npc: false
}

describe('buildSummaryPrompt', () => {
  it('lists what happened in order and attributes each line of the conversation', () => {
    const { system, user } = buildSummaryPrompt({ content, state: start(), scene })
    expect(system).toContain('what Ana remembered most')
    expect(system).toContain('Exactly one sentence')
    expect(user).toContain('1. Work at the Shop\n2. Date')
    expect(user).toContain('Pat: Do you like it here?\nAna: More than I expected.')
  })

  it('mentions gifts and how they were received', () => {
    const gifted: Scene = { ...scene, gifts: [{ name: 'Posy', description: '', reaction: 'loved', recipientId: 'ana' }] }
    const { user } = buildSummaryPrompt({ content, state: start(), scene: gifted })
    expect(user).toContain('Gifts Pat gave Ana:\n- Posy (Ana loved it)')
    expect(buildSummaryPrompt({ content, state: start(), scene }).user).not.toContain('Gifts')
  })

  it('keeps only the end of a very long conversation', () => {
    const long: Scene = {
      ...scene,
      messages: [
        { role: 'user', content: 'FIRST' + 'x'.repeat(13000) },
        { role: 'assistant', content: 'LAST' }
      ]
    }
    const { user } = buildSummaryPrompt({ content, state: start(), scene: long })
    expect(user).toContain('[earlier conversation omitted]')
    expect(user).not.toContain('FIRST')
    expect(user).toContain('Ana: LAST')
  })
})

describe('fallbackSummary', () => {
  it('describes the scene from its activities alone', () => {
    expect(fallbackSummary({ content, state: start(), scene })).toBe(
      'Pat and Ana spent time together: Work at the Shop, then Date.'
    )
  })
})

describe('memories', () => {
  it('are stored per love interest, stamped with the current time', () => {
    const before = { ...start(), time: 12 }
    const after = addMemory(addMemory(before, 'ana', 'First.'), 'ana', 'Second.', 'core')
    expect(after.memories.ana).toEqual([
      { time: 12, summary: 'First.', level: 'normal' },
      { time: 12, summary: 'Second.', level: 'core' }
    ])
    expect(before.memories).toEqual({})
  })

  it('are told no more than eight at a time, core before normal before fleeting, and the most recent first within each', () => {
    const levels = ['fleeting', 'core', 'normal', 'core', 'fleeting', 'normal'] as const
    const all = levels.map((level, time) => ({ time, summary: `${level} at ${time}`, level }))
    expect(selectMemories(all).map((m) => m.summary)).toEqual(['core at 3', 'core at 1', 'normal at 5', 'normal at 2', 'fleeting at 4', 'fleeting at 0'])
    expect(selectMemories(all, 3).map((m) => m.summary)).toEqual(['core at 3', 'core at 1', 'normal at 5'])
    // Twelve of them: the eight normal ones are told, and the fleeting ones are left out.
    const many = Array.from({ length: 12 }, (_, time) => ({ time, summary: `${time}`, level: time < 4 ? ('fleeting' as const) : ('normal' as const) }))
    expect(selectMemories(many).map((m) => m.summary)).toEqual(['11', '10', '9', '8', '7', '6', '5', '4'])
    // Two at the same hour: the one kept later comes first.
    expect(selectMemories([{ time: 5, summary: 'a', level: 'normal' }, { time: 5, summary: 'b', level: 'normal' }]).map((m) => m.summary)).toEqual(['b', 'a'])
  })

  it('come with a level from the summary, and an answer that names none is taken as normal', () => {
    expect(parseSummary('{"memory": "x", "level": " Core "}').level).toBe('core')
    expect(parseSummary('{"memory": "x", "level": "unforgettable"}').level).toBeUndefined()
    expect(parseSummary('{"memory": "x"}').level).toBeUndefined()
  })

  it('are described by how many days ago they happened', () => {
    const memory = { time: 0 }
    expect(describeAge(content, memory, 5)).toBe('earlier today')
    expect(describeAge(content, memory, 14)).toBe('yesterday')
    expect(describeAge(content, memory, 94)).toBe('5 days ago')
  })

  it('appear in the character prompt along with the current scene', () => {
    const state = { ...addMemory(start(), 'ana', 'Pat walked Ana home.'), time: 14 }
    const text = buildCharacterPrompt({
      content,
      state,
      loveInterestId: 'ana',
      sceneBeats: scene.beats
    })
    expect(text).toContain(
      '## What you remember of your time with Pat\nMost important first.'
    )
    expect(text).toContain('- Normal, yesterday (2 A): Pat walked Ana home.')
    expect(text).toContain('So far on this outing together: Work at the Shop, then Date.')
  })
})

describe('memories of a group scene', () => {
  const bea = { ...content.loveInterests[0], id: 'bea', name: 'Bea Stone' }
  const crowd = { ...content, loveInterests: [...content.loveInterests, bea] }
  const group: Scene = {
    ...scene,
    companionIds: ['bea'],
    messages: [
      { role: 'user', content: 'Hello, both.' },
      { role: 'assistant', content: 'Ana: Hello.\nBea: You again.' }
    ],
    gifts: [
      { name: 'Rose', description: '', reaction: 'loved', recipientId: 'bea' },
      { name: 'Ale', description: '', reaction: 'liked', recipientId: 'ana' }
    ]
  }

  it('writes each person their own, with only the gifts they were given', () => {
    const forBea = buildSummaryPrompt({ content: crowd, state: start(), scene: group, forId: 'bea' })
    expect(forBea.system).toContain('write the single memory Bea Stone keeps')
    expect(forBea.system).toContain("Ana was there too. Say so, but this is Bea Stone's own memory")
    expect(forBea.user).toContain('- Rose (Bea Stone loved it)')
    expect(forBea.user).not.toContain('Ale')
    // The reply already names its speakers, so no name is put in front of it.
    expect(forBea.user).toContain('Pat: Hello, both.\nAna: Hello.\nBea: You again.')

    const forAna = buildSummaryPrompt({ content: crowd, state: start(), scene: group })
    expect(forAna.system).toContain('write the single memory Ana keeps')
    expect(forAna.system).toContain('Bea was there too')
    expect(forAna.user).toContain('- Ale (Ana liked it)')
    expect(forAna.user).not.toContain('Rose')
  })

  it('names everyone in the plain fallback note', () => {
    expect(fallbackSummary({ content: crowd, state: start(), scene: group, forId: 'bea' })).toMatch(
      /^Pat, Ana and Bea Stone /
    )
  })
})

describe('amendMemory', () => {
  const kept = addMemory(addMemory(start(), 'ana', 'They talked.'), 'ana', 'They walked.')

  it('rewords the newest memory with that wording, keeping when it was', () => {
    const twice = addMemory({ ...kept, time: 9 }, 'ana', 'They talked.')
    const after = amendMemory(twice, 'ana', 'They talked.', '  They argued about dragons.  ')
    expect(after.memories['ana']).toEqual([
      { time: 0, summary: 'They talked.', level: 'normal' },
      { time: 0, summary: 'They walked.', level: 'normal' },
      { time: 9, summary: 'They argued about dragons.', level: 'normal' }
    ])
  })

  it('takes the level the player set, with or without new wording', () => {
    expect(amendMemory(kept, 'ana', 'They walked.', 'They walked.', 'core').memories['ana'][1]).toEqual({ time: 0, summary: 'They walked.', level: 'core' })
    expect(amendMemory(kept, 'ana', 'They walked.', 'They ran.', 'fleeting').memories['ana'][1]).toEqual({ time: 0, summary: 'They ran.', level: 'fleeting' })
    expect(amendMemory(kept, 'ana', 'They walked.', 'They walked.', 'normal')).toBe(kept)
  })

  it('forgets a memory edited down to nothing, and leaves alone what was not changed', () => {
    expect(amendMemory(kept, 'ana', 'They walked.', '   ').memories['ana'].map((m) => m.summary)).toEqual(['They talked.'])
    expect(amendMemory(kept, 'ana', 'They walked.', 'They walked.')).toBe(kept)
    expect(amendMemory(kept, 'ana', 'Never happened.', 'Something else.')).toBe(kept)
    expect(amendMemory(kept, 'nobody', 'They walked.', 'x')).toBe(kept)
  })
})

describe('what a scene does to how she feels', () => {
  const content = fixture()
  const state = { ...createInitialState(content), relationships: { ana: { affection: 28, trust: 10, desire: 5 } } }
  const scene: Scene = {
    loveInterestId: 'ana',
    companionIds: [],
    npc: false,
    nsfw: false,
    beats: [{ activityName: 'Tea', locationName: 'Home' }],
    messages: [
      { role: 'user', content: 'Tell me about the shop.' },
      { role: 'assistant', content: 'You are the first to ask.' }
    ],
    gifts: [],
    conceived: [],
    departed: [],
    comfort: { ana: { level: 4, reason: 'he listened' } },
    baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 28, trust: 10, desire: 5 }, companions: {} }
  }

  it('is asked of the LLM along with the memory, as her own judgement of the scene', () => {
    const { system, user } = buildSummaryPrompt({ content, state, scene })
    expect(system).toContain('{"memory": string, "level": string, "affection": number, "trust": number, "desire": number, "reason": string, "sex": boolean, "learned": string[]}')
    expect(system).toContain('whole numbers from -10 to 10')
    expect(system).toContain('Nothing is owed for turning up')
    expect(user).toContain('About Ana:')
    expect(user).toContain('affection 28, trust 10, desire 5, each of 100')
    expect(user).toContain('By the end she put how much she wanted to be there at 4 of 5: he listened.')
    // An NPC is asked for a memory and nothing else.
    const plain = buildSummaryPrompt({ content, state, scene: { ...scene, npc: true } })
    expect(plain.system).toContain('Reply with only the memory itself.')
    expect(plain.system).not.toContain('"affection"')
    expect(plain.user).not.toContain('About Ana:')
  })

  it('is read out of the answer, kept within what one scene can do', () => {
    const read = parseSummary('Here:\n{"memory": "Pat asked Ana about the shop.", "affection": 3, "trust": 2.6, "desire": -40, "reason": "He was the first to ask."}')
    expect(read).toEqual({ memory: 'Pat asked Ana about the shop.', feelings: { affection: 3, trust: 3, desire: -10, reason: 'He was the first to ask.' }, intimate: false, learned: [], rapport: [] })
    expect(parseSummary('{"memory": "x", "affection": "lots"}').feelings).toEqual({ affection: 0, trust: 0, desire: 0, reason: '' })
    // An answer that is not the JSON asked for is the memory alone.
    expect(parseSummary('Pat and Ana had tea.')).toEqual({ memory: 'Pat and Ana had tea.' })
  })

  it('moves what she feels, up or down, and never off the scale', () => {
    const warmer = applyFeelings(content, state, 'ana', { affection: 3, trust: 2, desire: 0, reason: '' })
    expect(warmer.relationships['ana']).toEqual({ affection: 31, trust: 12, desire: 5 })
    const colder = applyFeelings(content, state, 'ana', { affection: -6, trust: -10, desire: -10, reason: '' })
    expect(colder.relationships['ana']).toEqual({ affection: 22, trust: 0, desire: 0 })
    const full = applyFeelings(content, { ...state, relationships: { ana: { affection: 97, trust: 0, desire: 0 } } }, 'ana', { affection: 10, trust: 0, desire: 0, reason: '' })
    expect(full.relationships['ana'].affection).toBe(100)
    // Nobody the game keeps no feelings for.
    expect(applyFeelings(content, state, 'a-porter', PLAIN_FEELINGS)).toBe(state)
  })
})

describe('what he spent in a scene', () => {
  const rich = (): GameState => ({ ...start(), player: { ...start().player, money: 40 } })
  const treat: Scene = { ...scene, messages: [{ role: 'user', content: 'The drinks are on me.' }, { role: 'assistant', content: 'Then I will have the large one.' }] }

  it('is asked for from what was said, priced as dollars would be', () => {
    const { system, user } = buildSpendingPrompt(content, rich(), treat)
    expect(system).toContain('{"spent": number, "on": string}')
    expect(system).toContain('a whole number of dollars')
    expect(system).toContain('If he paid for nothing, "spent" is 0')
    expect(user).toContain('Pat has $40.')
    expect(user).toContain('Pat: The drinks are on me.')
    expect(user).toContain('Where it ended: Home.')
  })

  it('is read as whole dollars, never more than he has, and nothing when nothing was spent', () => {
    expect(parseSpending('{"spent": 12, "on": "drinks for two at Boba Blossom"}', 40)).toEqual({ amount: 12, on: 'drinks for two at Boba Blossom' })
    expect(parseSpending('Sure: {"spent": 11.6, "on": " tea "}', 40)).toEqual({ amount: 12, on: 'tea' })
    expect(parseSpending('{"spent": 90, "on": "dinner"}', 40)).toEqual({ amount: 40, on: 'dinner' })
    for (const nothing of ['{"spent": 0, "on": ""}', '{"spent": -5}', '{"spent": "a lot"}', 'no json', '{"spent": 9, "on": "x"']) expect(parseSpending(nothing, 40)).toBeUndefined()
    expect(parseSpending('{"spent": 5, "on": "tea"}', 0)).toBeUndefined()
  })

  it('comes out of his pocket when the scene is over', () => {
    expect(applySpending(rich(), { amount: 12, on: 'drinks' }).player.money).toBe(28)
    const state = rich()
    expect(applySpending(state, undefined)).toBe(state)
  })
})

describe('how many times they have had sex', () => {
  it('is read from the summary, counted once a scene for each of them, and told to her', async () => {
    const { addIntimacy, describeIntimacy, parseSummary, timesIntimate } = await import('./memory')
    const { buildCharacterPrompt } = await import('./prompt')
    const { createInitialState } = await import('./state')
    const { fixture } = await import('./testFixture')
    const content = fixture()
    const state = createInitialState(content)
    expect(parseSummary('{"memory":"m","affection":1,"trust":0,"desire":2,"reason":"r","sex":true}').intimate).toBe(true)
    expect(parseSummary('{"memory":"m","affection":1,"trust":0,"desire":2,"reason":"r","sex":false}').intimate).toBe(false)
    expect(parseSummary('{"memory":"m","affection":1,"trust":0,"desire":2,"reason":"r"}').intimate).toBe(false)

    expect(timesIntimate(state, 'ana')).toBe(0)
    expect(describeIntimacy(state, 'ana')).toBe('Times had sex: 0')
    const once = addIntimacy(state, ['ana', 'ana', 'nobody'])
    expect(once.timesIntimate).toEqual({ ana: 1 })
    expect(addIntimacy(once, [])).toBe(once)
    const twice = addIntimacy(once, ['ana'])
    expect(describeIntimacy(twice, 'ana')).toBe('Times had sex: 2')
    expect(buildCharacterPrompt({ content, state: twice, loveInterestId: 'ana' })).toContain('Times had sex: 2.')
  })
})

describe('what came out over a scene, and what changed between those in it', () => {
  it('is asked of the summary and kept only where it is something there was to learn, or a change between two who were there', async () => {
    const { buildSummaryPrompt, parseSummary, sceneRapport, sceneRevelations } = await import('./memory')
    const { hiddenFacts } = await import('./facts')
    const { createInitialState } = await import('./state')
    const { fixture } = await import('./testFixture')
    const base = fixture()
    const [ana] = base.loveInterests
    const content = { ...base, loveInterests: [{ ...ana, likes: ['tea'] }, { ...ana, id: 'bea', name: 'Bea Stone' }] }
    const state = createInitialState(content)
    const open = hiddenFacts(content, state, content.loveInterests[0])
    expect(open.length).toBeGreaterThan(0)

    const scene = { loveInterestId: 'ana', companionIds: ['bea'], nsfw: false, beats: [{ activityName: 'Tea' }], messages: [], gifts: [], conceived: [], departed: [], npc: false, baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 0, trust: 0, desire: 0 }, companions: {} } }
    const { system } = buildSummaryPrompt({ content, state, scene, forId: 'ana' })
    expect(system).toContain('"learned": string[]')
    expect(system).toContain(`  - ${open[0].id}: ${open[0].telling}`)
    expect(system).toContain('"rapport": {"with": string, "relation": string}[]')

    const read = parseSummary(`{"memory":"m","affection":1,"trust":0,"desire":0,"reason":"r","sex":false,"learned":["${open[0].id.toUpperCase()}","made-up"],"rapport":[{"with":"BEA","relation":"Friends"},{"with":"nobody","relation":"enemies"}]}`)
    expect(sceneRevelations(content, state, [{ id: 'ana', learned: read.learned ?? [] }])).toEqual([{ loveInterestId: 'ana', factId: open[0].id }])
    const changes = sceneRapport(state, ['ana', 'bea'], [
      { id: 'ana', rapport: read.rapport ?? [] },
      { id: 'bea', rapport: [{ with: 'ana', relation: 'enemies' }] }
    ])
    // One verdict for the pair, the first given; nothing for someone who was not there.
    expect(changes).toEqual([{ a: 'ana', b: 'bea', relation: 'friends' }])
  })
})

describe('how many threesomes he has had', () => {
  it('is counted once for a scene in which two or more of them had sex with him', async () => {
    const { addIntimacy } = await import('./memory')
    const { createInitialState } = await import('./state')
    const { fixture } = await import('./testFixture')
    const base = fixture()
    const [ana] = base.loveInterests
    const content = { ...base, loveInterests: [ana, { ...ana, id: 'bea', name: 'Bea Stone' }, { ...ana, id: 'cy', name: 'Cy' }] }
    const state = createInitialState(content)
    expect(state.threesomes).toBe(0)
    expect(addIntimacy(state, ['ana']).threesomes).toBe(0)
    const two = addIntimacy(state, ['ana', 'bea'])
    expect(two.threesomes).toBe(1)
    expect(two.timesIntimate).toEqual({ ana: 1, bea: 1 })
    // Three at once is still one scene, and someone the game keeps no feelings for does not make up the number.
    expect(addIntimacy(two, ['ana', 'bea', 'cy']).threesomes).toBe(2)
    expect(addIntimacy(state, ['ana', 'nobody']).threesomes).toBe(0)
  })
})
