import type { ContentPack, GameState, Memory, Scene, SceneBeat } from '../model'
import { formatDate, toDate } from './calendar'
import { firstNames, sceneCast } from './scene'

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
  const otherIds = sceneCast(scene).filter((id) => id !== forId)
  const group = otherIds.length > 0
  const others = group ? firstNames(content, otherIds) : ''
  const gifts = scene.gifts.filter((gift) => (gift.recipientId ?? scene.loveInterestId) === forId)

  const system = [
    `You write memory notes for characters in a dating sim. Given what happened during one ` +
      `outing between ${player} and ${name}, write the single memory ${name} keeps of it.`,
    'Rules:',
    '- One or two sentences, at most 60 words, plain prose, past tense, third person, using both names.',
    '- First say where they went and what they did, in order.',
    others &&
      `- ${others} ${otherIds.length > 1 ? 'were' : 'was'} there too. Say so, but this is ${name}'s own ` +
        `memory: keep to what ${name} said, did, noticed and felt, and how ${player} treated ${name} in particular.`,
    `- End with what ${name} remembered most, chosen from the conversation.`,
    '- Only include things that happened below. No preamble, no quotation marks, no lists.',
    'Example for two other people: Alex took Sam to the harbour market and then up to the ' +
      'lighthouse, where they shared a bottle of wine and argued about constellations; what ' +
      'Sam remembered most was the way Alex kissed her.'
  ]
    .filter((line) => line !== '')
    .join('\n')

  let transcript = scene.messages
    // In a group the replies already name each speaker, line by line.
    .map((m) => (m.role === 'user' ? `${player}: ${m.content}` : others ? m.content : `${name}: ${m.content}`))
    .join('\n')
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = `[earlier conversation omitted]\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`
  }

  const user = [
    `Date: ${formatDate(toDate(content.calendar, state.time))}`,
    '',
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
