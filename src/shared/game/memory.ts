import type { ContentPack, GameState, Memory, Scene, SceneBeat } from '../model'
import { formatDate, toDate } from './calendar'
import { describeBonds } from './bonds'
import { stageFor } from './relationships'
import { firstNames, sceneCast, sceneWitnesses } from './scene'
import { describeAppeal } from './stats'

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
  const system = [
    `You write what characters in a dating sim take away from a scene. Given what happened during one ` +
      `outing between ${player} and ${name}, write the single memory ${name} keeps of it` +
      `${feels ? `, and decide how it has changed what she feels for ${player}` : ''}.`,
    feels
      ? 'Reply with only a JSON object and nothing else: {"memory": string, "affection": number, "trust": number, "desire": number, "reason": string}'
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
          '- "reason": one short sentence, in the third person, on why it moved as it did.'
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
        `- With ${player} she is at the stage "${stageFor(content.relationships, rel.affection).name}": affection ${rel.affection}, trust ${rel.trust}, desire ${rel.desire}, each of ${max}.`,
        ...describeBonds(content, state, forId, otherIds).map((line) => `- ${line}`),
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
  /** Left out for an NPC, and when the reply said nothing that could be read. */
  feelings?: Feelings
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
  return {
    memory,
    feelings: {
      affection: change(given['affection']),
      trust: change(given['trust']),
      desire: change(given['desire']),
      reason: typeof given['reason'] === 'string' ? given['reason'].trim() : ''
    }
  }
}

/**
 * Changes what a love interest feels for the player by what a scene did. This is how a
 * relationship moves: by what she made of the time, not by the time. Each stays within
 * its scale. Nothing for anyone the game keeps no feelings for.
 */
export function applyFeelings(content: ContentPack, state: GameState, loveInterestId: string, feelings: Feelings): GameState {
  const rel = state.relationships[loveInterestId]
  if (!rel) return state
  const within = (value: number) => Math.max(0, Math.min(content.relationships.meterMax, value))
  return {
    ...state,
    relationships: {
      ...state.relationships,
      [loveInterestId]: { ...rel, affection: within(rel.affection + feelings.affection), trust: within(rel.trust + feelings.trust), desire: within(rel.desire + feelings.desire) }
    }
  }
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
export function addMemory(state: GameState, loveInterestId: string, summary: string): GameState {
  const memory: Memory = { time: state.time, summary }
  return {
    ...state,
    memories: {
      ...state.memories,
      [loveInterestId]: [...(state.memories[loveInterestId] ?? []), memory]
    }
  }
}

/**
 * Rewords a memory the player has edited: the newest one of that character's with the old
 * wording takes the new. Edited down to nothing, it is forgotten.
 */
export function amendMemory(state: GameState, loveInterestId: string, from: string, to: string): GameState {
  const memories = state.memories[loveInterestId] ?? []
  const index = memories.map((memory) => memory.summary).lastIndexOf(from)
  const wording = to.trim()
  if (index < 0 || wording === from) return state
  const amended =
    wording === '' ? memories.filter((_, i) => i !== index) : memories.map((m, i) => (i === index ? { ...m, summary: wording } : m))
  return { ...state, memories: { ...state.memories, [loveInterestId]: amended } }
}

/** The most recent memories that fit the budget, oldest first. Always keeps the newest. */
export function selectMemories(memories: Memory[], budgetChars = 1500): Memory[] {
  const selected: Memory[] = []
  let used = 0
  for (let i = memories.length - 1; i >= 0; i--) {
    used += memories[i].summary.length
    if (selected.length > 0 && used > budgetChars) break
    selected.unshift(memories[i])
  }
  return selected
}

/** How long ago a memory was, relative to now: "earlier today", "yesterday", "5 days ago". */
export function describeAge(content: ContentPack, memory: Memory, now: number): string {
  const days =
    toDate(content.calendar, now).dayIndex - toDate(content.calendar, memory.time).dayIndex
  if (days <= 0) return 'earlier today'
  return days === 1 ? 'yesterday' : `${days} days ago`
}
