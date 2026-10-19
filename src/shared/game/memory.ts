import { MEMORY_LEVELS, type ContentPack, type GameState, type Memory, type MemoryLevel, type Scene, type SceneBeat } from '../model'
import { formatDate, toDate } from './calendar'
import { describeBonds } from './bonds'
import { stageFor } from './relationships'
import { firstNames, sceneCast, sceneWitnesses } from './scene'
import { describeAppeal } from './stats'
import { feltChange, trustOf } from './modifiers'
import { hiddenFacts } from './facts'
import { RELATIONS, relationBetween, type Relation } from './rapport'

// Transcripts longer than this are trimmed from the start before summarising.
const MAX_TRANSCRIPT_CHARS = 12000

export function describeBeat(beat: SceneBeat): string {
  return beat.locationName ? `${beat.activityName} at ${beat.locationName}` : beat.activityName
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
    `You write what characters in a dating sim take away from a scene. Given what happened during one ` +
      `outing between ${player} and ${name}, write the single memory ${name} keeps of it` +
      `${feels ? `, and decide how it has changed what she feels for ${player}` : ''}.`,
    feels
      ? `Reply with only a JSON object and nothing else: {"memory": string, "level": string, "affection": number, "trust": number, "desire": number, "reason": string, "sex": boolean, "learned": string[]${group ? ', "rapport": {"with": string, "relation": string}[]' : ''}}`
      : 'Reply with only the memory itself.',
    'The memory:',
    '- Exactly one sentence, plain prose, past tense, third person, using both names.',
    others &&
      `- ${others} ${otherIds.length > 1 ? 'were' : 'was'} there too. Say so, but this is ${name}'s own ` +
        `memory: keep to what ${name} said, did, noticed and felt, and how ${player} treated ${name} in particular.`,
    departure &&
      `- ${name} left before it was over${departure.reason ? ` (${departure.reason})` : ''}, feeling ${departure.feeling}. ` +
        `Her memory ends with her leaving, and that is what stays with her.`,
    ...scene.departed
      .filter((d) => d.id !== forId && !departure)
      .map((d) => `- ${firstNames(content, [d.id])} left part-way through${d.reason ? ` (${d.reason})` : ''}. Say so if it mattered.`),
    `- End with what ${name} remembered most: one thing, chosen from the conversation.`,
    '- No preamble, no quotation marks, no lists.',
    'Example for two other people: Alex took Sam up to the lighthouse with a bottle of wine, ' +
      'and what Sam remembered most was the way Alex kissed her.',
    feels && `How much the memory will matter to ${name}, as "level":`,
    feels &&
      `- "core": a moment that defines what she and ${player} are to each other, which she will carry for good: a first kiss, the first time they slept together, ` +
        'a confession, a promise made or broken, a real fight or a betrayal, something she had never told anyone. Rare.',
    feels && '- "normal": time together that meant something, but changed nothing deep. Most scenes are this.',
    feels && '- "fleeting": little happened; she will soon forget the details.',
    ...(feels
      ? [
          `How ${name} feels:`,
          `- "affection", "trust" and "desire" are how much each has CHANGED because of this scene: whole numbers from ${FEELING_RANGE.min} to ${FEELING_RANGE.max}. ` +
            `Each is kept on a scale of 0 to ${max}, and it takes a whole term of scenes to cross it.`,
          `- Judge as ${name} herself: from who she is, what she wants in a man, how things already stand between them, and above all what ${player} said and did here. ` +
            `Nothing is owed for turning up: time together that left no mark is 0.`,
          '- 0: nothing changed. 1 to 2: a pleasant time, a small kindness, a good laugh. 3 to 5: he really reached her, or something happened between them. ' +
            '6 to 10: rare, a moment she will come back to for weeks.',
          '- Negative when he bored her, ignored her, pushed when she was uneasy, embarrassed or insulted her, broke a promise or showed her something she dislikes in him; ' +
            'as far down as he earned.',
          '- The three move on their own. Affection is fondness and warmth. Trust is whether she can rely on him and be honest with him: kept words, discretion, not being pressed. ' +
            'Desire is wanting him: it rises with attraction and tension, and can rise while trust falls.',
          `- What she admires in a man tilts all of it: where ${player} has it she warms to the same behaviour sooner, and where he lacks it he has more to prove.`,
          '- "reason": one short sentence, in the third person, on why it moved as it did.',
          `- "sex": true only if ${name} and ${player} had sex with each other in this scene, of any kind; false for kissing, flirting, talk of it, or sex that involved only others.`,
          unknown.length > 0
            ? `- "learned": the ids of the things below that ${player} found out about ${name} in this scene, because she plainly said or showed them; [] when none did. Only ids from this list, and only what really came out:`
            : '- "learned": always [].',
          ...unknown.map((fact) => `  - ${fact.id}: ${fact.telling}`),
          group &&
            `- "rapport": how ${name} stands with any of the others where this scene truly changed it from how they stood before (said below): a quarrel that will not be forgotten, a peace made, a friendship struck up. ` +
              `Not for a passing mood or one sharp remark; [] when nothing changed. Each entry: "with" is one of ${otherIds.join(', ')}, and "relation" is one of ${RELATIONS.join(', ')}.`
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
    transcript = `[earlier conversation omitted]\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`
  }

  const comfort = scene.comfort?.[forId]
  const about = feels
    ? [
        `About ${name}:`,
        `- ${li.personality}`,
        ...content.traits.filter((t) => li.traitIds.includes(t.id)).map((t) => `- ${t.name}: ${t.definition}`),
        li.admires.length > 0 ? `- She is drawn to ${li.admires.join(' and ')} in a man. ${describeAppeal(state, li).join(' ') || `${player} is ordinary in that so far.`}` : '',
        `- With ${player} she is at the stage "${stageFor(content.relationships, rel.affection).name}": affection ${rel.affection}, trust ${trustOf(content, state, forId)}, desire ${rel.desire}, each of ${max}.`,
        ...describeBonds(content, state, forId, otherIds).map((line) => `- ${line}`),
        // How she stood with each of the others before this scene, so that what changed is told from what did not.
        ...(group
          ? otherIds.map((id) => {
              const relation = relationBetween(state, forId, id)
              const other = firstNames(content, [id])
              return `- Before this scene she and ${other} were ${relation === 'neither' ? 'neither friends nor enemies' : relation}.`
            })
          : []),
        comfort ? `- By the end she put how much she wanted to be there at ${comfort.level} of 5${comfort.reason ? `: ${comfort.reason}` : ''}.` : '',
        ''
      ].filter((line, i, all) => line !== '' || i === all.length - 1)
    : []
  const user = [
    `Date: ${formatDate(toDate(content.calendar, state.time))}`,
    '',
    ...about,
    'What they did, in order:',
    ...(scene.beats.length > 0
      ? scene.beats.map((beat, i) => `${i + 1}. ${describeBeat(beat)}`)
      : ['(nothing in particular)']),
    ...(gifts.length > 0
      ? ['', `Gifts ${player} gave ${name}:`, ...gifts.map((gift) => `- ${gift.name} (${name} ${gift.reaction} it)`)]
      : []),
    '',
    'Conversation:',
    transcript || '(They did not say much.)'
  ].join('\n')

  return { system, user }
}

/** How far one scene can move any one of what she feels for him, either way. */
export const FEELING_RANGE = { min: -10, max: 10 } as const

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
 * Reads the LLM's answer: the memory, and the changes in what she feels, each kept within
 * what one scene can do. An answer that is not the JSON asked for is taken as the memory
 * alone.
 */
export function parseSummary(reply: string): Summary {
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
    const n = Math.round(Number(value))
    return Number.isFinite(n) ? Math.max(FEELING_RANGE.min, Math.min(FEELING_RANGE.max, n)) : 0
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
  return `Times had sex: ${timesIntimate(state, loveInterestId)}`
}

/** A plain memory built from the activity list alone, for when no LLM is available. */
export function fallbackSummary(input: SummaryInput): string {
  const { content, state, scene } = input
  const who = [state.player.name, ...sceneCast(scene).map((id) => loveInterestName(content, id))]
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1')
  return scene.beats.length > 0
    ? `${who} spent time together: ${scene.beats.map(describeBeat).join(', then ')}.`
    : `${who} talked.`
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
  if (days <= 0) return 'earlier today'
  return days === 1 ? 'yesterday' : `${days} days ago`
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
  const system = [
    `You keep the accounts of a dating sim. Given what was said in one scene, work out what ${player} himself paid for in it, and what it came to.`,
    'Reply with only a JSON object and nothing else: {"spent": number, "on": string}',
    `- Count only what ${player} plainly paid for or said he would: "the drinks are on me", buying a round, paying for dinner, tickets, a cab, something bought for someone. ` +
      `What someone else paid for, what was free, what was only talked about, and what he was given are not his.`,
    '- "spent" is a whole number of dollars, with no $ sign. Price it as it would be priced in the United States: a coffee or a tea $4 to $6, a drink at a bar $8 to $12, ' +
      'a casual meal for one $15 to $25, a good dinner for two $80 to $150. Count each person he paid for.',
    '- If he paid for nothing, "spent" is 0 and "on" is empty. Most scenes cost nothing; do not look for a reason to charge him.',
    '- "on" says what it went on in a few words, with the place when there is one: "drinks for two at Boba Blossom".',
    scene.gifts.length > 0 && `- Gifts he handed over were paid for when he bought them: leave them out (${scene.gifts.map((gift) => gift.name).join(', ')}).`,
    scene.shift && '- He is at work in this scene: what he serves or sells as part of the job is not his money.'
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')

  const place = content.locations.find((l) => l.id === state.locationId)
  let transcript = scene.messages.map((m) => (m.role === 'user' ? `${player}: ${m.content}` : m.content)).join('\n')
  if (transcript.length > MAX_TRANSCRIPT_CHARS) transcript = `[earlier conversation omitted]\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`
  const user = [
    `${player} has $${state.player.money}.`,
    `What they did: ${scene.beats.map(describeBeat).join('; then ')}.`,
    place && `Where it ended: ${place.name}.`,
    '',
    'What was said:',
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
