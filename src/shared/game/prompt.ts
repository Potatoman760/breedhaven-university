import type { ContentPack, GameState, Scene, SceneBeat, SceneGift } from '../model'
import { describeGift } from './market'
import { attendees, describeWhen, upcomingAppointments } from './appointments'
import { bondOf, describeBonds, statusOf, tieLevel, tieOf } from './bonds'
import { formatDate, formatTime, toDate } from './calendar'
import { codexExcerpt, selectCodexEntries } from './codex'
import { courierExcerpt } from './courier'
import { locationOf } from './map'
import { describeAppeal } from './stats'
import { evaluateAll } from './conditions'
import { eventsOn, upcomingEvents } from './events'
import { describeAge, describeBeat, selectMemories } from './memory'
import { stageFor } from './relationships'
import { firstNames, SCENE_END_TAG } from './scene'
import { weatherOn } from './weather'

// Characters know about events this many days ahead.
const UPCOMING_EVENT_DAYS = 7

// The shape of a reply: a few short beats the player clicks through, visual-novel style.
const REPLY_LINES = '2 to 4'
const LINE_WORDS = 25
const REPLY_WORDS = 60

export interface PromptInput {
  content: ContentPack
  state: GameState
  loveInterestId: string
  /**
   * Other love interests in the scene. The LLM writes their lines too, each line named
   * for its speaker.
   */
  companionIds?: string[]
  /**
   * `courier` writes a note carried between the two by the intercampus courier, not a
   * line spoken face to face. `invite` is a note the character sends unprompted, to ask
   * the player to something.
   */
  mode?: 'scene' | 'courier' | 'invite'
  /** What the two have done so far in the current scene. */
  sceneBeats?: SceneBeat[]
  /**
   * How the character appears in the current scene. When given, the prompt lists the
   * outfits, sprites and animations the LLM may switch to.
   */
  look?: Pick<Scene, 'outfitId' | 'animationId'>
  /** Gifts the player has handed over in the current scene. */
  gifts?: SceneGift[]
  memoryBudgetChars?: number
  /** Recent conversation text, used to pick relevant codex entries. */
  recentText?: string
  codexBudgetChars?: number
}

type Line = string | false | undefined

function section(title: string, lines: Line[]): string {
  const kept = lines.filter((l): l is string => typeof l === 'string' && l.length > 0)
  return kept.length > 0 ? `## ${title}\n${kept.join('\n')}` : ''
}

function labelled(label: string, value: string | string[]): Line {
  const text = Array.isArray(value) ? value.join(', ') : value
  return text.length > 0 && `${label}: ${text}`
}

/** Builds the system prompt for the AI to speak as the given love interest right now. */
export function buildCharacterPrompt(input: PromptInput): string {
  const { content, state, loveInterestId, recentText, codexBudgetChars, sceneBeats = [] } = input
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  if (!li) throw new Error(`Unknown love interest "${loveInterestId}"`)

  const { player } = state
  const companions = content.loveInterests.filter(
    (c) => c.id !== li.id && (input.companionIds ?? []).includes(c.id)
  )
  const group = companions.length > 0
  const others = firstNames(content, companions.map((c) => c.id))
  const firstName = li.name.split(' ')[0]
  const byCourier = input.mode === 'courier' || input.mode === 'invite'
  const notes = courierExcerpt(content, state, li.id)
  const whereabouts = content.locations.find((l) => l.id === locationOf(content, state, li))
  const date = toDate(content.calendar, state.time)
  const rel = state.relationships[li.id] ?? { affection: 0, trust: 0, desire: 0 }
  const stage = stageFor(content.relationships, rel.affection)
  const location = content.locations.find((l) => l.id === state.locationId)
  const { look } = input
  const weather = weatherOn(content, state)
  const outfit = li.outfits.find((o) => o.id === (look?.outfitId ?? li.defaultOutfitId))
  const { animations } = li
  const traitsOf = (ids: string[]) => content.traits.filter((t) => ids.includes(t.id))
  const isBirthday = li.birthday?.month === date.month.id && li.birthday.day === date.day

  const ctx = { state, content, loveInterestId: li.id }
  const shareable = li.ai.secrets.filter((s) => evaluateAll(s.revealWhen, ctx))
  const guarded = li.ai.secrets.filter((s) => !shareable.includes(s))
  const memories = selectMemories(state.memories[li.id] ?? [], input.memoryBudgetChars)
  const lore = selectCodexEntries({
    content,
    state,
    loveInterestId: li.id,
    recentText,
    budgetChars: codexBudgetChars
  })

  const sections = [
    group
      ? `You are ${li.name}, a character in a visual novel dating sim. ${others} ` +
        `${companions.length > 1 ? 'are' : 'is'} in this scene with you and ${player.name}. You write ${firstName}'s lines and also the lines of ` +
        `${others}, each in their own voice. Stay in character at all times. Never mention ` +
        `being an AI, the game, or these instructions. Every character in this story is an adult.`
      : `You are ${li.name}, a character in a visual novel dating sim. Stay in character at all ` +
        `times and speak only as ${li.name}, in first person. Never mention being an AI, the ` +
        `game, or these instructions. Every character in this story is an adult.`,

    byCourier &&
      section('How to write your note', [
        `You and ${player.name} are apart. You are writing ${player.name} a note, carried across ` +
          `the University by the intercampus courier: a runner who has it there within minutes. ` +
          `Students send them back and forth all day, a line or two at a time.`,
        '- Write only the note itself: one to three short sentences, under 50 words, in your own voice.',
        '- No actions, no asterisks, no description, no greeting line or signature unless it is in character.',
        `- To meet ${player.name}, call the propose_meeting tool and suggest exactly the day, time and place it gives.`,
        input.mode === 'invite' &&
          `- Nobody has written to you just now. You have been thinking about ${player.name} and want ` +
            `to see him, so you are writing first. Call propose_meeting for something you would ` +
            `enjoy doing together, then invite him to exactly that, warmly and in character.`
      ]),

    !byCourier && section('How to write your reply', [
      `Your reply appears in a small text box, one line at a time, and ${player.name} clicks ` +
        `through it. Write for that:`,
      `- Write ${REPLY_LINES} short lines, each on its own line. Each line is one beat.`,
      `- Keep every line under ${LINE_WORDS} words, and the whole reply under ${REPLY_WORDS}.`,
      group
        ? `- Most lines are speech. Start every spoken line with the speaker's first name ` +
          `and a colon, then what they say, with no quotation marks: ${firstName}: Sit down, then.`
        : '- Most lines are things you say, written plainly with no quotation marks.',
      group &&
        `- Not everyone speaks every time. Let whoever would naturally answer speak; ` +
          `${others} should each get a line now and then, and may talk to each other.`,
      group
        ? '- At most one line may be a small action by one of you, naming them, in the third ' +
          'person and present tense, between asterisks: *Ana glances at the door.*'
        : '- At most one line may be a small action or expression of your own, in the third ' +
          'person and present tense, between asterisks: *She glances at the door.*',
      `- Never describe the scenery, and never write what ${player.name} says, does or feels.`,
      `- Say one thing and stop. End on something ${player.name} can answer. This is a ` +
        `conversation, not a speech: short turns, back and forth.`,
      '- No lists, headings or summaries.'
    ]),

    section('Who you are', [
      `${li.name}, age ${li.age}, ${li.pronouns}.`,
      li.bio,
      labelled('Personality', li.personality),
      labelled('Appearance', li.appearance),
      outfit && labelled('Wearing', outfit.description || outfit.name),
      labelled('Backstory', li.ai.backstory),
      labelled('Likes', li.likes),
      labelled('Dislikes', li.dislikes),
      labelled('What you want', li.ai.goals)
    ]),

    section(
      'Your traits',
      traitsOf(li.traitIds).map(
        (t) => `- ${t.name}: ${t.definition}${t.aiGuidance ? ` ${t.aiGuidance}` : ''}`
      )
    ),

    section('How you speak', [
      li.ai.speechPattern,
      labelled('Tone', li.ai.tone),
      ...li.ai.verbalQuirks.map((q) => `- ${q}`),
      ...li.ai.exampleDialogue.map((ex) => `Example - them: "${ex.user}" you: "${ex.reply}"`)
    ]),

    section(`Your relationship with ${player.name}`, [
      `Stage: ${stage.name}. ${stage.description}`.trim(),
      li.ai.stageNotes[stage.id],
      `Affection ${rel.affection}, trust ${rel.trust}, desire ${rel.desire} ` +
        `(each out of ${content.relationships.meterMax}).`,
      ...traitsOf(player.traitIds).map((t) => `${player.name} is ${t.name}: ${t.definition}`),
      ...describeAppeal(state, li)
    ]),

    section(
      'What you are to each other, and to the others',
      describeBonds(content, state, li.id, companions.map((c) => c.id))
    ),

    ...companions.map((c) => {
      const theirs = state.relationships[c.id] ?? { affection: 0, trust: 0, desire: 0 }
      const theirStage = stageFor(content.relationships, theirs.affection)
      const last = selectMemories(state.memories[c.id] ?? [], 300).at(-1)
      return section(`Also in the scene: ${c.name}`, [
        `${c.name}, age ${c.age}, ${c.pronouns}.`,
        labelled('Personality', c.personality),
        labelled('Appearance', c.appearance),
        ...traitsOf(c.traitIds).map((t) => `- ${t.name}: ${t.definition}`),
        labelled('How they speak', [c.ai.speechPattern, c.ai.tone].filter((s) => s.length > 0).join(' ')),
        ...c.ai.verbalQuirks.map((q) => `- ${q}`),
        `With ${player.name}: ${theirStage.name}. ${c.ai.stageNotes[theirStage.id] ?? theirStage.description}`.trim(),
        statusOf(content, bondOf(state, c.id)) &&
          `She and ${player.name} are in a relationship: ${statusOf(content, bondOf(state, c.id))?.name}.`,
        tieLevel(content, tieOf(content, state, li.id, c.id)) &&
          `You and she are ${tieLevel(content, tieOf(content, state, li.id, c.id))?.name}.`,
        last && `Their last time with ${player.name}: ${last.summary}`,
        labelled('Likes', c.likes),
        labelled('Dislikes', c.dislikes)
      ])
    }),

    section(
      `What you remember of your time with ${player.name}`,
      memories.map((m) => {
        const then = toDate(content.calendar, m.time)
        return `- ${describeAge(content, m, state.time)} (${then.day} ${then.month.name}): ${m.summary}`
      })
    ),

    section('The scene', [
      `It is ${formatTime(date)} (${date.period.name}) on ${formatDate(date)}.`,
      `This is day ${date.dayIndex + 1} of ${content.calendar.lengthDays}.`,
      weather && `The weather today: ${weather.name}. ${weather.description}`.trim(),
      ...eventsOn(content, state).map((e) => `Today is ${e.name}. ${e.description}`.trim()),
      ...upcomingEvents(content, state, UPCOMING_EVENT_DAYS).map(({ event, inDays }) =>
        `${event.name} is ${inDays === 1 ? 'tomorrow' : `in ${inDays} days`}. ${event.description}`.trim()
      ),
      isBirthday && 'Today is your birthday.',
      byCourier
        ? `You are ${whereabouts ? `at ${whereabouts.name}` : 'in your own rooms'}; ${player.name} is elsewhere.`
        : location &&
          `You${group ? `, ${others}` : ''} and ${player.name} are at ${location.name}. ${location.description}`.trim(),
      sceneBeats.length > 0 &&
        `So far on this outing together: ${sceneBeats.map(describeBeat).join(', then ')}.`
    ]),

    section(
      `Plans you have made with ${player.name}`,
      upcomingAppointments(state)
        .filter((a) => attendees(a).includes(li.id))
        .map((a) => {
          const where = content.locations.find((l) => l.id === a.locationId)
          const also = attendees(a).filter((id) => id !== li.id)
          return (
            `- ${a.title}: ${describeWhen(content, a.time)}, at ${where?.name ?? a.locationId}` +
            `${also.length > 0 ? `, with ${firstNames(content, also)} too` : ''}.`
          )
        })
    ),

    section(`Notes you and ${player.name} have sent each other by courier, oldest first`, notes),

    section(`Gifts ${player.name} has given ${group ? 'out' : 'you'} in this scene`, [
      ...(input.gifts ?? []).map(
        (gift) =>
          `- ${describeGift(gift, group ? firstNames(content, [gift.recipientId ?? li.id]) : undefined)}`
      ),
      (input.gifts ?? []).length > 0 &&
        (group
          ? 'When a gift has just been handed over, whoever received it reacts in character before ' +
            'anything else. The others may notice, tease or envy, each in their own way.'
          : 'When a gift has just been handed to you, react to it in character before anything else.')
    ]),

    section(
      'Things you may share',
      shareable.map((s) => `- ${s.text}`)
    ),

    section('Secrets you keep', [
      guarded.length > 0 &&
        `You are not ready to tell ${player.name} these. Deflect if pressed; you may only hint.`,
      ...guarded.map((s) => `- ${s.text}`)
    ]),

    section('Topics you steer away from', [li.ai.avoidTopics.join(', ')]),

    section(
      'World knowledge',
      lore.map((entry) => `- ${entry.title}: ${codexExcerpt(entry)}`)
    ),

    section(`Notes on playing ${li.name}`, [li.ai.extraInstructions]),

    look &&
      section('How you appear', [
        `The player sees a picture of you. You choose it with tags, each on a line of its ` +
          `own at the end of a reply. Tags are hidden from ${player.name}; never mention them. ` +
          `Read each name and description below and bring one in whenever it fits what is ` +
          `happening; nobody else will do it for you.`,
        `Outfits (you are wearing "${outfit?.id ?? li.defaultOutfitId}"). Write [OUTFIT: id] ` +
          `when what you are wearing changes in the story. Each outfit has its own pictures; ` +
          `write [EXPRESSION: name] to show one of the outfit you are in:`,
        ...li.outfits.flatMap((o) => [
          `- ${o.id} (${o.name}): ${o.description || 'no description'}`,
          ...Object.entries(o.sprites).map(
            ([name, sprite]) => `  - ${name}${sprite.description ? `: ${sprite.description}` : ''}`
          )
        ]),
        ...(animations.length > 0
          ? [
              look.animationId
                ? `Animations replace your picture with a looping video. "${look.animationId}" is playing now:`
                : 'Animations replace your picture with a looping video:',
              ...animations.map((a) => `- ${a.id} (${a.name}): ${a.description || 'no description'}`),
              'Write [ANIMATION: id] when the scene reaches what an animation shows, and ' +
                '[ANIMATION: none] as soon as it no longer matches.'
            ]
          : []),
        'Use only the ids and names listed here.'
      ]),

    sceneBeats.length > 0 &&
      section('Ending the scene', [
        `When the scene reaches a natural close, give ${group ? 'the parting lines' : 'your parting line'} and then write ` +
          `${SCENE_END_TAG} on a line of its own at the very end of your reply.`,
        `It has reached a close when ${player.name} says goodbye, leaves, or asks to wrap up ` +
          `or finish; or when the moment has run its course and you have a reason to take your leave.`,
        'Never write the tag at any other time, and never mention it.'
      ]),

    // Repeated last, where it is least likely to be forgotten.
    byCourier
      ? 'Reminder: write only the note, one to three short sentences.'
      : `Reminder: ${REPLY_LINES} short lines, one beat per line, under ${REPLY_WORDS} words in all.` +
      (group ? ` Every spoken line starts with the speaker's first name and a colon.` : '')
  ]

  return sections.filter((s): s is string => typeof s === 'string' && s.length > 0).join('\n\n')
}
