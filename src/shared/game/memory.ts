import { MEMORY_LEVELS, SCENE_CHANGES, type ContentPack, type DepartureFeeling, type GameState, type Memory, type MemoryLevel, type Scene, type SceneBeat } from '../model'
import { formatDate, toDate } from './calendar'
import { describeBonds } from './bonds'
import { stageFor } from './relationships'
import { firstNames, sceneCast, sceneWitnesses } from './scene'
import { describeAppeal } from './stats'
import { feltChange, trustOf } from './modifiers'
import { hiddenFacts } from './facts'
import { RELATIONS, relationBetween, type Relation } from './rapport'
import { t } from '../i18n'

// Transcripts longer than this are trimmed from the start before summarising.
const MAX_TRANSCRIPT_CHARS = 12000

// The answer the summary asks for: its keys and the levels it may give are read back by `parseSummary`, so they stay as they are.
// The reason comes before the feelings so that the verdict follows from it.
const SUMMARY_SHAPE = '{"memory": string, "level": string, "reason": string, "affection": string, "trust": string, "desire": string, "sex": boolean, "learned": string[]'
const RAPPORT_SHAPE = ', "rapport": {"with": string, "relation": string}[]'
const SPENDING_SHAPE = '{"spent": number, "on": string}'

export function describeBeat(beat: SceneBeat): string {
  return beat.locationName ? t('scene.memory.beatAt', { activity: beat.activityName, place: beat.locationName }) : beat.activityName
}

/** How she went, as it is said of her: the feeling is the game's to keep, the word the language's. */
export function feelingWord(feeling: DepartureFeeling): string {
  return feeling === 'hurt' ? t('scene.feeling.hurt') : feeling === 'angry' ? t('scene.feeling.angry') : t('scene.feeling.content')
}

function loveInterestName(content: ContentPack, id: string): string {
  const li = content.loveInterests.find((c) => c.id === id)
  if (!li) throw new Error(`Unknown love interest "${id}"`)
  return li.name
}

export interface SummaryInput {
  content: ContentPack
  state: GameState
  scene: Scene
  /** Whose memory to write, in a group scene. Defaults to the scene's lead. */
  forId?: string
}

/** The prompt asking the LLM to condense a finished scene into one short memory. */
export function buildSummaryPrompt(input: SummaryInput): { system: string; user: string } {
  const { content, state, scene } = input
  const forId = input.forId ?? scene.loveInterestId
  const name = loveInterestName(content, forId)
  const player = state.player.name
  // Everyone else who was there, from this person's point of view.
  // Someone who left part-way remembers only what she was there for.
  const departure = scene.departed.find((d) => d.id === forId)
  const heard = departure ? scene.messages.slice(0, departure.at) : scene.messages
  const otherIds = sceneWitnesses(scene).filter((id) => id !== forId)
  const group = otherIds.length > 0
  const others = group ? firstNames(content, otherIds) : ''
  const gifts = scene.gifts.filter((gift) => gift.recipientId === forId)

  const li = content.loveInterests.find((c) => c.id === forId)
  const rel = state.relationships[forId]
  // An NPC has no feelings for him to keep track of: hers is a memory and nothing more.
  const feels = !scene.npc && li !== undefined && rel !== undefined
  const max = content.relationships.meterMax
  // What he does not yet know of her: anything of it that came out in the scene is recorded when the scene is over.
  const unknown = feels && li ? hiddenFacts(content, state, li) : []
  const system = [
    t('scene.memory.task', { player, name, feels }),
    feels ? t('scene.memory.json', { shape: `${SUMMARY_SHAPE}${group ? RAPPORT_SHAPE : ''}}` }) : t('scene.memory.plain'),
    t('scene.memory.heading'),
    t('scene.memory.oneSentence'),
    others && t('scene.memory.others', { others, count: otherIds.length, name, player }),
    departure && t('scene.memory.left', { name, why: Boolean(departure.reason), reason: departure.reason, feeling: feelingWord(departure.feeling) }),
    ...scene.departed
      .filter((d) => d.id !== forId && !departure)
      .map((d) => t('scene.memory.otherLeft', { name: firstNames(content, [d.id]), why: Boolean(d.reason), reason: d.reason })),
    t('scene.memory.endWith', { name }),
    t('scene.memory.noPreamble'),
    t('scene.memory.example'),
    feels && t('scene.memory.levelHeading', { name, key: 'level' }),
    feels && t('scene.memory.core', { player, level: 'core' }),
    feels && t('scene.memory.normal', { level: 'normal' }),
    feels && t('scene.memory.fleeting', { level: 'fleeting' }),
    ...(feels
      ? [
          t('scene.memory.feelsHeading', { name }),
          t('scene.memory.judge', { name, player, unchanged: 'unchanged' }),
          t('scene.memory.reason', { key: 'reason' }),
          t('scene.memory.change', { affection: 'affection', trust: 'trust', desire: 'desire', steps: SCENE_CHANGES.map((step) => `"${step}"`).join(', ') }),
          t('scene.memory.amounts', { unchanged: 'unchanged', littleMore: 'a little more', more: 'more', muchMore: 'much more' }),
          t('scene.memory.negative', { littleLess: 'a little less', less: 'less', muchLess: 'much less' }),
          t('scene.memory.three'),
          t('scene.memory.admires', { player }),
          t('scene.memory.sex', { key: 'sex', name, player }),
          unknown.length > 0 ? t('scene.memory.learned', { key: 'learned', player, name }) : t('scene.memory.learnedNone', { key: 'learned' }),
          ...unknown.map((fact) => `  - ${fact.id}: ${fact.telling}`),
          group &&
            t('scene.memory.rapport', { key: 'rapport', name, withKey: 'with', relationKey: 'relation', ids: otherIds.join(', '), relations: RELATIONS.join(', ') })
        ]
      : [])
  ]
    .filter((line) => line !== '')
    .join('\n')

  let transcript = heard
    // In a group, or with an NPC about, the replies already name each speaker, line by line.
    .map((m) =>
      m.role === 'user' ? `${player}: ${m.content}` : others || /^[^\s:]{1,40}:/m.test(m.content) ? m.content : `${name}: ${m.content}`
    )
    .join('\n')
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = `${t('scene.memory.omitted')}\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`
  }

  const comfort = scene.comfort?.[forId]
  const about = feels
    ? [
        t('scene.memory.about', { name }),
        `- ${li.personality}`,
        ...content.traits.filter((trait) => li.traitIds.includes(trait.id)).map((trait) => `- ${trait.name}: ${trait.definition}`),
        li.admires.length > 0
          ? t('scene.memory.drawnTo', { admires: li.admires.join(t('scene.list.and')), appeal: describeAppeal(state, li).join(' ') || t('scene.memory.ordinary', { player }) })
          : '',
        t('scene.memory.stage', { player, stage: stageFor(content.relationships, rel.affection).name, affection: rel.affection, trust: trustOf(content, state, forId), desire: rel.desire, max }),
        ...describeBonds(content, state, forId, otherIds).map((line) => `- ${line}`),
        // How she stood with each of the others before this scene, so that what changed is told from what did not.
        ...(group
          ? otherIds.map((id) => {
              const relation = relationBetween(state, forId, id)
              const other = firstNames(content, [id])
              return t('scene.memory.before', { other, relation })
            })
          : []),
        comfort ? t('scene.memory.comfort', { level: comfort.level, why: Boolean(comfort.reason), reason: comfort.reason }) : '',
        ''
      ].filter((line, i, all) => line !== '' || i === all.length - 1)
    : []
  const user = [
    t('scene.memory.date', { date: formatDate(toDate(content.calendar, state.time)) }),
    '',
    ...about,
    t('scene.memory.did'),
    ...(scene.beats.length > 0
      ? scene.beats.map((beat, i) => `${i + 1}. ${describeBeat(beat)}`)
      : [t('scene.memory.nothing')]),
    ...(gifts.length > 0
      ? ['', t('scene.memory.gifts', { player, name }), ...gifts.map((gift) => t('scene.memory.gift', { gift: gift.name, name, reaction: gift.reaction }))]
      : []),
    '',
    t('scene.memory.conversation'),
    transcript || t('scene.memory.silent')
  ].join('\n')

  return { system, user }
}

/** What a scene did to how a love interest feels about the player: the change in each, and why. */
export interface Feelings {
  affection: number
  trust: number
  desire: number
  reason: string
}

/** What a love interest takes away from a scene. */
export interface Summary {
  memory: string
  /** How much it will matter to her. Left out when the reply did not say, and taken as normal. */
  level?: MemoryLevel
  /** Left out for an NPC, and when the reply said nothing that could be read. */
  feelings?: Feelings
  /** She and the player had sex in the scene. */
  intimate?: boolean
  /** Ids of the things about her that the reply says came out in the scene, as written: still to be checked against what there was to learn. */
  learned?: string[]
  /** How the reply says she now stands with others who were there, as written: still to be checked. */
  rapport?: { with: string; relation: string }[]
}

/** What she feels when there was no LLM to ask: a little fonder for the time, and nothing else. */
export const PLAIN_FEELINGS: Feelings = { affection: 1, trust: 0, desire: 0, reason: '' }

/**
 * Reads the LLM's answer: the memory, and the changes in what she feels, each a word of `SCENE_CHANGES` that the content
 * puts a number on. A word it does not know changes nothing. An answer that is not the JSON asked for is taken as the
 * memory alone.
 */
export function parseSummary(content: ContentPack, reply: string): Summary {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  let read: unknown
  try {
    read = start < 0 || end < start ? undefined : JSON.parse(reply.slice(start, end + 1))
  } catch {
    read = undefined
  }
  if (typeof read !== 'object' || read === null) return { memory: reply.trim() }
  const given = read as Record<string, unknown>
  const memory = typeof given['memory'] === 'string' ? given['memory'].trim() : ''
  const change = (value: unknown) => {
    const step = SCENE_CHANGES.find((one) => typeof value === 'string' && one === value.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' '))
    return step ? content.relationships.sceneChange[step] : 0
  }
  const level = typeof given['level'] === 'string' ? MEMORY_LEVELS.find((one) => one === (given['level'] as string).trim().toLowerCase()) : undefined
  return {
    memory,
    level,
    feelings: {
      affection: change(given['affection']),
      trust: change(given['trust']),
      desire: change(given['desire']),
      reason: typeof given['reason'] === 'string' ? given['reason'].trim() : ''
    },
    intimate: given['sex'] === true || given['sex'] === 'true',
    learned: Array.isArray(given['learned']) ? given['learned'].filter((id): id is string => typeof id === 'string').map((id) => id.trim()) : [],
    rapport: Array.isArray(given['rapport'])
      ? given['rapport'].flatMap((entry) => {
          const { with: other, relation } = (entry ?? {}) as { with?: unknown; relation?: unknown }
          return typeof other === 'string' && typeof relation === 'string' ? [{ with: other.trim().toLowerCase(), relation: relation.trim().toLowerCase() }] : []
        })
      : []
  }
}

/**
 * What the player found out about those in a scene, from what each one's summary said came out: only things that were
 * there to be learned, by the id the game knows them under.
 */
export function sceneRevelations(content: ContentPack, state: GameState, said: { id: string; learned: string[] }[]): { loveInterestId: string; factId: string }[] {
  return said.flatMap(({ id, learned }) => {
    const li = content.loveInterests.find((c) => c.id === id)
    const open = li ? hiddenFacts(content, state, li) : []
    const wanted = learned.map((factId) => factId.toLowerCase())
    return open.filter((fact) => wanted.includes(fact.id.toLowerCase())).map((fact) => ({ loveInterestId: id, factId: fact.id }))
  })
}

/**
 * How those in a scene now stand with each other, from what each one's summary said had changed: only between two
 * who were both there, only a change from how they stood, and only where both of them say the same. One summary on
 * its own does not end a feud or make a friend.
 */
export function sceneRapport(state: GameState, presentIds: string[], said: { id: string; rapport: { with: string; relation: string }[] }[]): { a: string; b: string; relation: Relation }[] {
  // What each said of each other one: her verdict on the pair, the first she gave.
  const verdict = (id: string, other: string): Relation | undefined => {
    const entry = said.find((one) => one.id === id)?.rapport.find((one) => presentIds.find((present) => present.toLowerCase() === one.with) === other)
    return RELATIONS.find((r) => r === entry?.relation)
  }
  const changes: { a: string; b: string; relation: Relation }[] = []
  for (const [i, a] of presentIds.entries()) {
    for (const b of presentIds.slice(i + 1)) {
      const relation = verdict(a, b)
      if (!relation || verdict(b, a) !== relation || relationBetween(state, a, b) === relation) continue
      changes.push({ a, b, relation })
    }
  }
  return changes
}

/**
 * Changes what a love interest feels for the player by what a scene did. This is how a
 * relationship moves: by what she made of the time, not by the time. Each stays within
 * its scale. Nothing for anyone the game keeps no feelings for.
 */
export function applyFeelings(content: ContentPack, state: GameState, loveInterestId: string, feelings: Feelings, asGiven = false, out = false): GameState {
  const rel = state.relationships[loveInterestId]
  if (!rel) return state
  const within = (value: number) => Math.max(0, Math.min(content.relationships.meterMax, value))
  // What he has learnt and what he has taken change what a scene is worth; a reckoning that is meant to cost what it costs is `asGiven`.
  // `out`: the scene was one she was out with him.
  const change = (meter: 'affection' | 'trust' | 'desire') => (asGiven ? feelings[meter] : feltChange(content, state, loveInterestId, meter, feelings[meter], out))
  return {
    ...state,
    relationships: {
      ...state.relationships,
      [loveInterestId]: { ...rel, affection: within(rel.affection + change('affection')), trust: within(rel.trust + change('trust')), desire: within(rel.desire + change('desire')) }
    }
  }
}

/** How many times a love interest and the player have had sex: scenes it happened in. */
export function timesIntimate(state: GameState, loveInterestId: string): number {
  return state.timesIntimate[loveInterestId] ?? 0
}

/**
 * Counts a scene in which these love interests had sex with the player: once each, however much of it there was.
 * With two or more of them in the one scene, it is also counted once as a threesome, however many they were.
 */
export function addIntimacy(state: GameState, loveInterestIds: string[]): GameState {
  const counted = loveInterestIds.filter((id, i) => state.relationships[id] !== undefined && loveInterestIds.indexOf(id) === i)
  if (counted.length === 0) return state
  return {
    ...state,
    timesIntimate: { ...state.timesIntimate, ...Object.fromEntries(counted.map((id) => [id, timesIntimate(state, id) + 1])) },
    threesomes: state.threesomes + (counted.length >= 2 ? 1 : 0)
  }
}

/** What is told of it, to her and on her profile: "Times had sex: 2". */
export function describeIntimacy(state: GameState, loveInterestId: string): string {
  return t('scene.memory.timesIntimate', { count: timesIntimate(state, loveInterestId) })
}

/** A plain memory built from the activity list alone, for when no LLM is available. */
export function fallbackSummary(input: SummaryInput): string {
  const { content, state, scene } = input
  const names = [state.player.name, ...sceneCast(scene).map((id) => loveInterestName(content, id))]
  const joined = names.join(', ')
  const last = /, ([^,]*)$/.exec(joined)
  const who = last ? t('scene.list.last', { rest: joined.slice(0, last.index), last: last[1] }) : joined
  return scene.beats.length > 0
    ? t('scene.memory.fallback', { who, beats: scene.beats.map(describeBeat).join(t('scene.list.then')) })
    : t('scene.memory.fallbackTalked', { who })
}

/** Returns a new state with the memory recorded at the current game time. */
export function addMemory(state: GameState, loveInterestId: string, summary: string, level: MemoryLevel = 'normal'): GameState {
  const memory: Memory = { time: state.time, summary, level }
  return {
    ...state,
    memories: {
      ...state.memories,
      [loveInterestId]: [...(state.memories[loveInterestId] ?? []), memory]
    }
  }
}

/**
 * Changes a memory the player has edited: the newest one of that character's with the old wording takes the new
 * wording, and the level given if one is. Edited down to nothing, it is forgotten.
 */
export function amendMemory(state: GameState, loveInterestId: string, from: string, to: string, level?: MemoryLevel): GameState {
  const memories = state.memories[loveInterestId] ?? []
  const index = memories.map((memory) => memory.summary).lastIndexOf(from)
  const wording = to.trim()
  if (index < 0 || (wording === from && (level === undefined || level === memories[index].level))) return state
  const amended =
    wording === '' ? memories.filter((_, i) => i !== index) : memories.map((m, i) => (i === index ? { ...m, summary: wording, level: level ?? m.level } : m))
  return { ...state, memories: { ...state.memories, [loveInterestId]: amended } }
}

/** How many of her memories a character is told in a scene. */
export const MAX_PROMPT_MEMORIES = 8

/**
 * The memories a character is told, most important first: by level, core before normal before fleeting, and within
 * a level the most recent first. No more than `limit` of them.
 */
export function selectMemories(memories: Memory[], limit = MAX_PROMPT_MEMORIES): Memory[] {
  const rank = (memory: Memory) => MEMORY_LEVELS.indexOf(memory.level)
  return memories
    .map((memory, order) => ({ memory, order }))
    .sort((a, b) => rank(a.memory) - rank(b.memory) || b.memory.time - a.memory.time || b.order - a.order)
    .slice(0, limit)
    .map(({ memory }) => memory)
}

/** How long ago a memory was, relative to now: "earlier today", "yesterday", "5 days ago". */
export function describeAge(content: ContentPack, memory: Pick<Memory, 'time'>, now: number): string {
  const days =
    toDate(content.calendar, now).dayIndex - toDate(content.calendar, memory.time).dayIndex
  return t('scene.memory.age', { days: Math.max(0, days) })
}

/** What the player paid out of his own pocket in the course of a scene. */
export interface Spending {
  /** Whole dollars, never more than he had. */
  amount: number
  /** What it went on, in a few words: "the drinks at Boba Blossom". */
  on: string
}

/**
 * The prompt asking the LLM what the player spent in a scene. Nothing in a scene takes
 * his money as it happens: he says the drinks are on him, and what that came to is
 * settled here, when the scene is over.
 */
export function buildSpendingPrompt(content: ContentPack, state: GameState, scene: Scene): { system: string; user: string } {
  const player = state.player.name
  const keys = { spent: 'spent', on: 'on' }
  const system = [
    t('scene.spending.task', { player }),
    t('scene.spending.json', { shape: SPENDING_SHAPE }),
    t('scene.spending.count', { player }),
    t('scene.spending.price', keys),
    t('scene.spending.nothing', keys),
    t('scene.spending.on', keys),
    scene.gifts.length > 0 && t('scene.spending.gifts', { gifts: scene.gifts.map((gift) => gift.name).join(', ') }),
    scene.shift && t('scene.spending.shift')
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')

  const place = content.locations.find((l) => l.id === state.locationId)
  let transcript = scene.messages.map((m) => (m.role === 'user' ? `${player}: ${m.content}` : m.content)).join('\n')
  if (transcript.length > MAX_TRANSCRIPT_CHARS) transcript = `${t('scene.memory.omitted')}\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`
  const user = [
    t('scene.spending.purse', { player, money: state.player.money }),
    t('scene.spending.did', { beats: scene.beats.map(describeBeat).join(t('scene.list.thenSemicolon')) }),
    place && t('scene.spending.ended', { place: place.name }),
    '',
    t('scene.spending.said'),
    transcript
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')
  return { system, user }
}

/**
 * Reads the LLM's answer on what he spent: a whole number of dollars, no more than he has.
 * Nothing spent, or an answer that cannot be read, is no spending at all.
 */
export function parseSpending(reply: string, purse: number): Spending | undefined {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  let read: unknown
  try {
    read = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (typeof read !== 'object' || read === null) return undefined
  const given = read as Record<string, unknown>
  const asked = Math.round(Number(given['spent']))
  if (!Number.isFinite(asked) || asked <= 0) return undefined
  // He cannot pay out more than he has on him.
  const amount = Math.min(asked, Math.max(0, Math.floor(purse)))
  return amount > 0 ? { amount, on: typeof given['on'] === 'string' ? given['on'].trim().slice(0, 120) : '' } : undefined
}

/** Takes what he spent in a scene out of his pocket. */
export function applySpending(state: GameState, spending: Spending | undefined): GameState {
  if (!spending) return state
  return { ...state, player: { ...state.player, money: Math.max(0, state.player.money - spending.amount) } }
}
