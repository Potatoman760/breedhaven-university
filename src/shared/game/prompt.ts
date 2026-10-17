import { MEMORY_LEVEL_LABELS, picturedOutfit, EXPRESSIONS, isPregnantPose, poseDescription, poseMedia, kindOf, outfitDescription, type ChatMessage, type ContentPack, type LoveInterest, type Departure, type GameState, type Lesson, type Npc, type Proposal, type Scene, type SceneBeat, type SceneGift } from '../model'
import { describeGift } from './market'
import { examNotes } from './exams'
import { attendees, describeWhen, upcomingAppointments } from './appointments'
import { bondOf, describeBonds, statusOf } from './bonds'
import { formatDate, formatTime, toDate, type GameDate } from './calendar'
import { describeHousehold, housingFacts } from './housing'
import { codexExcerpt, selectCodexEntries } from './codex'
import { DM_CLOSE, DM_OPEN, courierExcerpt, hasContact, offersContact } from './courier'
import { handleOf, recentPostsBy } from './feed'
import { describeRapport } from './rapport'
import { locationOf } from './map'
import { classSoon } from './courses'
import { PLAYER_TOKEN } from './personalise'
import { nextUp } from './upcoming'
import { canSleepOver } from './sleep'
import { jobFacts } from './jobs'
import { describeAppeal } from './stats'
import { evaluateAll } from './conditions'
import { attendableEvents, describeEvent, eventGoers, eventsOn, upcomingEvents } from './events'
import { describeAge, describeBeat, describeIntimacy, selectMemories } from './memory'
import { stageFor } from './relationships'
import { describeSexGate, sexGate } from './intimacy'
import { describePregnancy, canConceive, ordinaryOutfit, pregnancyStage, wearableOutfits, wornOutfit } from './pregnancy'
import { AGREED_TAG, firstNames, SCENE_END_TAG, SEEDED_TAG, SLEEP_TAG } from './scene'
import { describePlayerRoom, playerRoom, describePlace, describeRoom, describeWeather, roomOwner, sceneView } from './sceneMoves'
import { backgroundFor, isIndoors } from './schedule'
import { weatherOn } from './weather'

// Characters know about events this many days ahead.
const UPCOMING_EVENT_DAYS = 7

// How near a class has to be before she is told she will have to leave for it.
const CLASS_SOON_HOURS = 2

// The shape of a reply: a few short beats the player clicks through, visual-novel style.
const REPLY_LINES = '2 to 4'
const LINE_WORDS = 25
const REPLY_WORDS = 60
// The reply a class opens with is a stretch of the lecture, and runs longer than any other.
const LESSON_LINES = '5 to 8'
const LESSON_LINE_WORDS = 30
const LESSON_WORDS = 180

export interface PromptInput {
  content: ContentPack
  state: GameState
  loveInterestId: string
  /** The class the scene is set in, if it is one. */
  lesson?: Lesson
  /** Nothing has been said yet: this reply opens the scene. */
  opening?: boolean
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
  mode?: 'scene' | 'courier' | 'invite' | 'news' | 'note'
  /** For `news`: what the character has to tell. */
  news?: string
  /**
   * Set when the character is an NPC, not a love interest: what they are, and what they
   * can tell the player. Everything about romance is then left out of the prompt.
   */
  npc?: { role: string; knowledge: string[] }
  /**
   * NPCs who are around where the scene is. They are not part of the company; the LLM
   * writes a line for one when the player speaks to them or their work calls for it.
   */
  extras?: Npc[]
  /** Love interests who were in the scene and have left it. */
  departed?: Departure[]
  /** How many hours the scene has taken so far. */
  hoursSoFar?: number
  /** The love interest whose own room the scene is in, if it is in one. */
  roomOf?: string
  /** The view of the place the player has picked, if any. */
  backgroundId?: string
  /** What the two have done so far in the current scene. */
  sceneBeats?: SceneBeat[]
  /**
   * How the character appears in the current scene. When given, the prompt lists the
   * outfits, sprites and animations the LLM may switch to.
   */
  look?: Pick<Scene, 'outfitId' | 'animationId' | 'animationOf'>
  /** How the others in the scene appear, by id. */
  looks?: Scene['looks']
  /** How comfortable each love interest in the scene last said she was, by id. */
  comfort?: Scene['comfort']
  /** Gifts the player has handed over in the current scene. */
  gifts?: SceneGift[]
  /** A plan a character has suggested in this scene that the player has not yet put in his calendar. */
  pendingProposal?: Proposal
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
  // In a class the teacher has a voice of their own, so every spoken line says whose it is.
  const named = group || (input.extras ?? []).length > 0 || input.lesson !== undefined
  // The reply that opens a class is the lecture, and is written to its own length.
  const lecture = input.lesson !== undefined && input.opening === true
  const others = firstNames(content, companions.map((c) => c.id))
  const firstName = li.name.split(' ')[0]
  const isNpc = input.npc !== undefined
  // What she is to the University, where the game has one.
  const kind = kindOf(li)
  const hers = state.courses.filter((c) => c.teacherId === li.id)
  const inHerClass = hers.some((c) => state.enrolment?.includes(c.id))
  // The societies she belongs to, or sponsors as a teacher, and whether he belongs to them too.
  const societies = (content.societies?.societies ?? []).filter((society) => society.memberIds.includes(li.id) || society.sponsorId === li.id)
  const clubs =
    societies.length === 0
      ? ''
      : ` You ${kind === 'teacher' ? 'sponsor' : 'belong to'} ${societies
          .map((society) => `${society.name}, which meets ${society.weekday}s at ${String(society.startHour).padStart(2, '0')}:00${state.societies.includes(society.id) ? ` (${player.name} is a member)` : ''}`)
          .join(', and ')}.`
  const place =
    isNpc || !content.coursework
      ? undefined
      : kind === 'student' && li.studies
        ? `You are a student at the University, reading ${li.studies.subject}` +
          `${li.studies.level >= 5 ? ' as a graduate' : `, in your year ${li.studies.level}`}.` +
          clubs
        : kind === 'teacher' && li.teaching
          ? `You teach at the University: ${li.teaching.title} of ${li.teaching.department}, giving ` +
            `${li.teaching.subjects.map((s) => s.subject).join(' and ')}. ${player.name} is a student there` +
            `${inHerClass ? `, and sits in your ${hers.find((c) => state.enrolment?.includes(c.id))?.title} class.` : ', though not in any class of yours.'}` +
            clubs
          : `You are not part of the University: you do not study or teach there, and know it from outside.`
  const extras = input.extras ?? []
  // With anyone else to write for, every spoken line says whose it is.
  const byCourier = input.mode === 'courier' || input.mode === 'invite' || input.mode === 'news' || input.mode === 'note'
  const notes = courierExcerpt(content, state, li.id)
  const whereabouts = content.locations.find((l) => l.id === locationOf(content, state, li))
  const herView = whereabouts && backgroundFor(whereabouts)
  const date = toDate(content.calendar, state.time)
  const rel = state.relationships[li.id] ?? { affection: 0, trust: 0, desire: 0 }
  const stage = stageFor(content.relationships, rel.affection)
  const location = content.locations.find((l) => l.id === state.locationId)
  const { look } = input
  const weather = weatherOn(content, state)
  // Exactly where the character is: with the player in a scene, wherever her day has her when writing a note.
  const view = sceneView(content, state, input.backgroundId)
  const owner = roomOwner(content, { roomOf: input.roomOf })
  // Or the player's own room, which is nobody's in the scene.
  const his = playerRoom(content, { roomOf: input.roomOf })
  // The next thing on his own timetable, when it is close enough to matter to where the scene goes.
  const coming = byCourier ? undefined : nextUp(content, state)
  const due = coming && coming.time - state.time <= CLASS_SOON_HOURS ? coming : undefined
  const duePlace = content.locations.find((l) => l.id === due?.locationId)
  const done = sceneBeats.filter((beat) => beat.finished)
  const current = sceneBeats.filter((beat) => !beat.finished)
  const outfit = wornOutfit(content, state, li, look?.outfitId)
  /** Said of anyone far enough along to show: that it shows in every picture of her, with nothing for the writer to do about it. */
  const pregnantNote = (c: LoveInterest, who: string, is: string): string | false => {
    const stage = pregnancyStage(content, state, c.id)
    return stage?.showing === true && `${who} ${is} ${stage.name} and showing. Every picture of ${who === 'You' ? 'you' : 'her'} is drawn pregnant by the game: choose outfits and sex-acts as you would at any other time.`
  }
  // What she is asked to wear is always one of her ordinary outfits: the game puts her in its pregnant form itself.
  const outfits = wearableOutfits(li)
  const wearing = (c: LoveInterest, worn: ReturnType<typeof wornOutfit>): string => (worn ? ordinaryOutfit(c, worn).id : c.defaultOutfitId)
  const cast = [li, ...companions]
  const fertile = cast.filter((c) => canConceive(content, state, c.id) && sexGate(content, state, c).open)
  // Only a pose with something to show can be asked for.
  // The poses that can be asked for are the ordinary ones. One drawn pregnant is put up in its place by the game, once she shows.
  const posesOf = (who: LoveInterest) => who.animations.filter((a) => poseMedia(a).length > 0 && !isPregnantPose(a.id))
  // A woman who will not go to bed with him in this scene is told nothing of sex-acts: there is none for her to choose.
  const actsOf = (c: LoveInterest) => (isNpc || sexGate(content, state, c).open ? posesOf(c) : [])
  const animations = actsOf(li)
  const traitsOf = (ids: string[]) => content.traits.filter((t) => ids.includes(t.id))
  const isBirthday = li.birthday?.month === date.month.id && li.birthday.day === date.day

  const ctx = { state, content, loveInterestId: li.id }
  const shareable = li.ai.secrets.filter((s) => evaluateAll(s.revealWhen, ctx))
  const guarded = li.ai.secrets.filter((s) => !shareable.includes(s))
  // An NPC keeps no memory of him: each time is the first, as far as she is told.
  const memories = input.npc ? [] : selectMemories(state.memories[li.id] ?? [])
  const lore = selectCodexEntries({
    content,
    state,
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

    // How it is spelt is the game's to say and not the world's: told here, where no player reads it, and not in the lore.
    'Write in US English: American spelling and idiom (color, favor, center, mom, apartment), not British.',

    byCourier &&
      section('How to write your message', [
        `You and ${player.name} are apart. You are sending ${player.name} a DM on Bloomr, the photo ` +
          `app everyone at the University has on their phone. People DM back and forth all day, ` +
          `a line or two at a time.`,
        '- Write only the message itself: one to three short sentences, under 50 words, in your own voice, typed the way you would type on your phone.',
        '- No actions, no asterisks, no description, no greeting line or signature unless it is in character.',
        `- Put the message between ${DM_OPEN} and ${DM_CLOSE}, and write nothing else: no thinking aloud, no note on what he said or what you would say. Anything outside the tags is thrown away.`,
        !isNpc &&
          `- When ${player.name} asks to meet or to do something together and you are willing, call the propose_meeting tool in this ` +
            `same message: that is what puts it in his calendar, and saying yes without calling it arranges nothing. Choose the place ` +
            `yourself, somewhere that suits what was asked; never ask him to name one. If he means now or today, ask for "today". ` +
            `Then say yes and name exactly the day, time and place the tool gives.`,
        !isNpc && `- To ask ${player.name} to meet, call propose_meeting the same way and suggest exactly what it gives.`,
        input.mode === 'news' &&
          `- Nobody has written to you just now. You are writing first, because you have news: ${input.news ?? ''}`,
        input.mode === 'note' &&
          `- Nobody has written to you just now. ${player.name} is on your mind, so you are writing first, about whatever you would: ` +
            `something from your day or from the last time you saw him, a tease, a question, a thought you want him to have. ` +
            `What you say and how warm it is follows how you feel about him and what the two of you are to each other. ` +
            `Do not repeat what you have already sent him. You need not ask to meet.`,
        input.mode === 'invite' &&
          `- Nobody has written to you just now. You have been thinking about ${player.name} and want ` +
            `to see him, so you are writing first. Call propose_meeting for something you would ` +
            `enjoy doing together, then invite him to exactly that, warmly and in character.`
      ]),

    isNpc &&
      `You are ${input.npc?.role}, not one of ${player.name}'s romantic prospects, and you treat him as that ` +
        `person would. If he flirts, turn it aside in character, kindly or drily, and never take part in anything sexual.`,

    !byCourier &&
      extras.length > 0 &&
      section('Also here', [
        `These people are here too. They are not part of your company and not ${player.name}'s romantic ` +
          `prospects: they are at their work or about their business. Besides your own lines, write a line ` +
          `for one of them only when ${player.name} speaks to them or their work calls for it (taking an ` +
          `order, answering a question, minding the door), in their voice, starting with their first name ` +
          `and a colon. Otherwise leave them in the background. They never flirt and take no part in anything sexual.`,
        ...extras.flatMap((extra) => [
          `- ${extra.name}, ${extra.role}. ${extra.personality}`.trim(),
          extra.ai.speechPattern && `  How ${extra.name.split(' ')[0]} speaks: ${extra.ai.speechPattern}`,
          extra.ai.knowledge.length > 0 && `  Knows: ${extra.ai.knowledge.slice(0, 3).join(' ')}`
        ])
      ]),

    !byCourier && section('How to write your reply', [
      `Your reply appears in a small text box, one line at a time, and ${player.name} clicks ` +
        `through it. Write for that:`,
      lecture
        ? `- This reply opens the class with the lecture: write ${LESSON_LINES} lines, each on its own line. Each line is one beat.`
        : `- Write ${REPLY_LINES} short lines, each on its own line. Each line is one beat.`,
      lecture
        ? `- Keep every line under ${LESSON_LINE_WORDS} words, and the whole reply about ${LESSON_WORDS}.`
        : `- Keep every line under ${LINE_WORDS} words, and the whole reply under ${REPLY_WORDS}.`,
      input.lesson &&
        `- ${input.lesson.speaker} is teaching the class and has a voice in the scene: a line of theirs starts with "${input.lesson.speaker}:".`,
      input.lesson &&
        `- ${input.lesson.speaker} teaches the room and does not call on ${player.name}, put a question to him or single him out. A question asked of the class is answered by ` +
          `another student: one of you, or someone unnamed in a line of narration. Only when ${player.name} himself speaks to ${input.lesson.speaker}, or puts his hand up, does ` +
          `${input.lesson.speaker} answer him directly.`,
      named
        ? `- Most lines are speech. Start every spoken line with the speaker's first name ` +
          `and a colon, then what they say, with no quotation marks: ${firstName}: Sit down, then.`
        : '- Most lines are things you say, written plainly with no quotation marks.',
      group &&
        `- Not everyone speaks every time. Let whoever would naturally answer speak; ` +
          `${others} should each get a line now and then, and may talk to each other.`,
      lecture
        ? '- A line of narration is written in the third person and present tense, between asterisks: *The room settles.*'
        : named
        ? '- At most one line may be a small action by one of you, naming them, in the third ' +
          'person and present tense, between asterisks: *Ana glances at the door.*'
        : '- At most one line may be a small action or expression of your own, in the third ' +
          'person and present tense, between asterisks: *She glances at the door.*',
      lecture
        ? `- Never write what ${player.name} says, does or feels.`
        : `- Never describe the scenery, and never write what ${player.name} says, does or feels.`,
      lecture
        ? `- End on something ${player.name} can answer.`
        : `- Say one thing and stop. End on something ${player.name} can answer. This is a ` +
          `conversation, not a speech: short turns, back and forth.`,
      '- No lists, headings or summaries.'
    ]),

    section('Who you are', [
      `${li.name}, age ${li.age}, ${li.pronouns}.`,
      li.bio,
      place,
      labelled('Personality', li.personality),
      labelled('Appearance', li.appearance),
      outfit && labelled('Wearing', outfitDescription(li.outfits, outfit) || outfit.name),
      labelled('Backstory', li.ai.backstory),
      labelled('Likes', li.likes),
      labelled('Dislikes', li.dislikes)
    ]),

    section(
      'Your traits',
      traitsOf(li.traitIds).map(
        (t) => `- ${t.name}: ${t.definition}`
      )
    ),

    section('How you speak', [
      li.ai.speechPattern,
      labelled('Tone', li.ai.tone),
      ...li.ai.verbalQuirks.map((q) => `- ${q}`),
      ...li.ai.exampleDialogue.map((ex) => `Example - them: "${ex.user}" you: "${ex.reply}"`)
    ]),

    // Who he is, as anyone who has heard of him knows it.
    section(`About ${player.name}`, [player.bio, player.about].map((text) => text.split(PLAYER_TOKEN).join(player.name))),

    !isNpc && section(`Your relationship with ${player.name}`, [
      `Stage: ${stage.name}. ${stage.description}`.trim(),
      `Affection ${rel.affection}, trust ${rel.trust}, desire ${rel.desire} ` +
        `(each out of ${content.relationships.meterMax}).`,
      `${describeIntimacy(state, li.id)}.`,
      ...describeAppeal(state, li)
    ]),

    // Whether each woman here will go to bed with him is the game's to say, and what she takes against the Bloom.
    !isNpc &&
      !byCourier &&
      section(
        `Sex with ${player.name}`,
        cast.flatMap((c) => {
          const lines = describeSexGate(content, state, c, group)
          return group ? [`For ${c.name.split(' ')[0]}, written here as "you":`, ...lines] : lines
        })
      ),

    !isNpc && section(
      'What you are to each other, and to the others',
      describeBonds(content, state, li.id, companions.map((c) => c.id))
    ),

    ...companions.map((c) => {
      const theirs = state.relationships[c.id] ?? { affection: 0, trust: 0, desire: 0 }
      const theirStage = stageFor(content.relationships, theirs.affection)
      const last = (state.memories[c.id] ?? []).at(-1)
      return section(`Also in the scene: ${c.name}`, [
        `${c.name}, age ${c.age}, ${c.pronouns}.`,
        labelled('Personality', c.personality),
        labelled('Appearance', c.appearance),
        ...traitsOf(c.traitIds).map((t) => `- ${t.name}: ${t.definition}`),
        labelled('How they speak', [c.ai.speechPattern, c.ai.tone].filter((s) => s.length > 0).join(' ')),
        ...c.ai.verbalQuirks.map((q) => `- ${q}`),
        `With ${player.name}: ${theirStage.name}. ${theirStage.description}`.trim(),
        statusOf(content, bondOf(state, c.id)) &&
          `She and ${player.name} are in a relationship: ${statusOf(content, bondOf(state, c.id))?.name}.`,
        last && `Their last time with ${player.name}: ${last.summary}`,
        labelled('Likes', c.likes),
        labelled('Dislikes', c.dislikes)
      ])
    }),

    group &&
      section('How the women here stand with each other', [
        ...describeRapport(content, state, cast.map((c) => c.id)),
        'Play this between them as well as toward ' + player.name + '. If something in this scene truly changes it (a falling-out, a peace made, a friendship struck), let it show: it is noted when the scene is over.'
      ]),

    section(
      `What you remember of your time with ${player.name}`,
      memories.length === 0
        ? []
        : [
            'Most important first. A core memory is one that defines what you are to each other: it stays with you and colours everything. A fleeting one has mostly faded.',
            ...memories.map((m) => {
              const then = toDate(content.calendar, m.time)
              return `- ${MEMORY_LEVEL_LABELS[m.level]}, ${describeAge(content, m, state.time)} (${then.day} ${then.month.name}): ${m.summary}`
            })
          ]
    ),

    section('The scene', [
      `It is ${formatTime(date)} (${date.period.name}) on ${formatDate(date)}.`,
      describeHour(content, date),
      weather &&
        describeWeather(weather, byCourier ? (whereabouts ? isIndoors(whereabouts, herView) : true) : owner !== undefined || his !== undefined || isIndoors(location, view)),
      ...eventsOn(content, state).filter((e) => !e.secret).map((e) => `Today is ${e.name}. ${describeEvent(content, e)}${eventGoers(state, e.id).includes(li.id) ? ` You told ${player.name} you would be there.` : ''}`.trim()),
      ...upcomingEvents(content, state, UPCOMING_EVENT_DAYS).map(({ event, inDays }) =>
        `${event.name} is ${inDays === 1 ? 'tomorrow' : `in ${inDays} days`}. ${describeEvent(content, event)}${eventGoers(state, event.id).includes(li.id) ? ` You told ${player.name} you would be there.` : ''}`.trim()
      ),
      ...examNotes(content, state, li, player.name),
      isBirthday && 'Today is your birthday.',
      byCourier
        ? `You are ${whereabouts ? `at ${whereabouts.name}` : 'in your own rooms'}; ${player.name} is elsewhere.`
        : his
          ? `You${group ? `, ${others}` : ''} and ${player.name} are in ${describePlayerRoom(his, location, player.name)}`
          : owner
          ? `You${group ? `, ${others}` : ''} and ${player.name} are in ${describeRoom(owner, location, li.id)}`
          : location && `You${group ? `, ${others}` : ''} and ${player.name} are at ${describePlace(location, view)}`,
      sceneBeats.length > 0 &&
        (done.length > 0
          ? `Earlier on this outing, and now over: ${done.map(describeBeat).join(', then ')}. Now: ${current.map(describeBeat).join(', then ') || 'the two of you, here'}.`
          : `So far on this outing together: ${sceneBeats.map(describeBeat).join(', then ')}.`),
      ...(input.departed ?? []).map(
        (d) =>
          `${firstNames(content, [d.id])} was here earlier and has left${d.reason ? `: ${d.reason}` : ''}. ` +
          `She is gone${d.feeling === 'content' ? '' : `, and went ${d.feeling}`}; she does not speak or act again in this scene.`
      ),
      sceneBeats.at(-1)?.direction
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

    !isNpc && section('Children', describePregnancy(content, state, li.id)),

    // Where he lives now, and who with: to someone of the house, as her own home.
    !isNpc && section(`${player.name}'s house`, describeHousehold(content, state, li.id)),

    section(`What you know, and will tell ${player.name} if it comes up`, (input.npc?.knowledge ?? li.ai.knowledge).map((fact) => `- ${fact}`)),

    // Whoever he works for knows him as her employee, whatever else she is to him.
    section(`${player.name} as your employee`, jobFacts(content, state, li.id)),

    // The officer who lets him his house has his file in front of her.
    section(`${player.name}'s housing file`, housingFacts(content, state, li.id)),

    ...companions.map((c) =>
      section(
        `${c.name.split(' ')[0]} and children`,
        describePregnancy(content, state, c.id)
          .filter((line) => /^(You are carrying|Today the Bloom|You have borne)/.test(line))
          .map((line) => `Of ${c.name.split(' ')[0]}, in her own words: ${line}`)
      )
    ),

    section(`Messages you and ${player.name} have sent each other in Bloomr DMs, oldest first`, notes),

    section(
      `Your latest posts on Bloomr, the feed app, which anyone can read`,
      recentPostsBy(state, li.id).map((post) => `${post.text}${post.liked ? ` (${player.name} liked this)` : ''}`)
    ),

    section(`Gifts ${player.name} has given ${group ? 'out' : 'you'} in this scene`, [
      ...(input.gifts ?? []).map(
        (gift) =>
          `- ${describeGift(gift, group ? firstNames(content, [gift.recipientId]) : undefined)}`
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

    section(
      'World knowledge',
      lore.map((entry) => `- ${entry.title}: ${codexExcerpt(entry)}`)
    ),

    // What the class is on stays in front of her for the rest of it, so that a question about it is answered from the same facts.
    input.lesson?.topic && section(`Today's class: ${input.lesson.topic.title}`, [`What ${input.lesson.speaker} is teaching, and what is true of it in this world: ${input.lesson.topic.content}`]),

    section(`Notes on playing ${li.name}`, [li.ai.extraInstructions]),

    look &&
      !isNpc &&
      section('How you appear', [
        group
          ? `Every reply must BEGIN with one line for each of you giving the look on her face, before anything else is written: ` +
            `${cast.map((c) => `[EXPRESSION: ${c.name.split(' ')[0]}=happy]`).join(' ')}`
          : 'Every reply must BEGIN with one line giving the look on your face, before anything else is written: [EXPRESSION: happy]',
        `The faces to choose from are exactly these: ${EXPRESSIONS.join(', ')}. Choose the one that fits what ${group ? 'she' : 'you'} ` +
          `feel${group ? 's' : ''} in this reply. Never leave the line out, even when nothing has changed.`,
        ...(group
          ? [
              'When what one of you is wearing changes in the story, write [OUTFIT: Name=id] on a line after the faces:',
              ...cast.map((c) => {
                const worn = wornOutfit(content, state, c, c.id === li.id ? look.outfitId : input.looks?.[c.id]?.outfitId)
                const has = wearableOutfits(c).map((o) => `${o.id} (${o.name})`).join(', ')
                const first = c.name.split(' ')[0]
                return `- ${first} is wearing "${wearing(c, worn)}". She has: ${has}.${pregnantNote(c, first, 'is') ? ` ${pregnantNote(c, first, 'is')}` : ''}`
              }),
              // Poses belong to one of them each, and one is shown at a time, over everyone.
              ...(cast.some((c) => actsOf(c).length > 0)
                ? [
                    'During sex, an explicit picture of a sex-act by ONE of you at a time can be shown behind the rest of you, in place of her own picture.' +
                      (look.animationId ? ` "${look.animationId}" of ${cast.find((c) => c.id === (look.animationOf ?? li.id))?.name.split(' ')[0] ?? firstName} was up for the last reply.` : ''),
                    ...cast.filter((c) => actsOf(c).length > 0).map((c) => `- ${c.name.split(' ')[0]}: ${actsOf(c).map((a) => `${a.id} (${poseDescription(a) || a.name})`).join('; ')}`),
                    'A sex-act is chosen in addition to the faces and outfits, never in their place. When the scene reaches one of these sex-acts, add a line saying whose and which: [SEX-ACT: Name=id]. ' +
                      'Choose the one of you the moment is most about, and change whose it is as the moment passes from one of you to another; the rest of you stay in view in front of it. Most replies have no [SEX-ACT] line at all: write one only in a reply whose own lines show that act happening at that moment, ' +
                      'and never for talk, kissing or anything afterwards. A sex-act is up for the one reply that asks for it and comes down with the next, so do not carry it on out of habit. ' +
                      'creampie and facial are a single moment and are never shown twice running.'
                  ]
                : [])
            ]
          : [
              pregnantNote(li, 'You', 'are'),
              `You are wearing "${wearing(li, outfit)}". When what you are wearing changes in the story, write [OUTFIT: id] on a line after your face:`,
              ...outfits.flatMap((o) => {
                // Pictures that are not one of the faces: something particular, to be asked for by name.
                const others = Object.entries(picturedOutfit(li.outfits, o).sprites).filter(([name, sprite]) => !(EXPRESSIONS as readonly string[]).includes(name) && sprite.description)
                return [
                  `- ${o.id} (${o.name}): ${o.id === wearing(li, outfit) ? 'what you have on now, described above' : outfitDescription(li.outfits, o) || 'no description'}`,
                  ...others.map(([name, sprite]) => `  - in place of a face, [EXPRESSION: ${name}] shows: ${sprite.description}`)
                ]
              }),
              ...(animations.length > 0
                ? [
                    look.animationId
                      ? `During sex, an explicit picture of one of these sex-acts can be shown over the whole scene, on top of your picture. "${look.animationId}" was up for your last reply:`
                      : 'During sex, an explicit picture of one of these sex-acts can be shown over the whole scene, on top of your picture:',
                    ...animations.map((a) => `- ${a.id} (${a.name}): ${poseDescription(a) || 'no description'}`),
                    'A sex-act is chosen in addition to your face and outfit, never in their place: go on writing the [EXPRESSION] line every reply, and [OUTFIT] when what you wear changes, ' +
                      'and add [SEX-ACT: id] on a line of its own when the scene reaches one of these sex-acts: for example [OUTFIT: nude], [EXPRESSION: aroused], [SEX-ACT: missionary]. ' +
                      'Most replies have no [SEX-ACT] line at all. Write one only in a reply whose own lines show that act happening at that moment; a reply of talk, kissing, undressing, ' +
                      'lying together or anything afterwards has none. A sex-act is up for the one reply that asks for it and comes down with the next, so do not carry it on out of habit: ' +
                      'ask for it again only while the same act is still going on in what you write. creampie and facial are a single moment and are never shown twice running.'
                  ]
                : [])
            ]),
        'Use only the ids and names listed here.'
      ]),

    look &&
      !isNpc &&
      !byCourier &&
      section(group ? 'How comfortable each of you is' : 'How comfortable you are', [
        group
          ? `After the faces, every reply has one more hidden line for each of you: ${cast.map((c) => `[COMFORT: ${c.name.split(' ')[0]}=4 a few words why]`).join(' ')}`
          : 'After your face, every reply has one more hidden line: [COMFORT: 4 a few words why]',
        `The number is how much ${group ? 'she wants' : 'you want'} to be here: 5 glad of it, 4 fine, 3 wary, 2 wanting a way out, 1 leaving. ` +
          (group
            ? `Judge it for each woman as herself, from what ${player.name} asks of her, how hard he presses and what he does with another of you in front of her. It can recover.`
            : `Judge it as yourself, from what ${player.name} asks of you and how hard he presses. It can recover.`),
        ...cast.map((c) => {
          const said = input.comfort?.[c.id]
          const who = group ? c.name.split(' ')[0] : 'You'
          const soon = classSoon(content, state, c.id, CLASS_SOON_HOURS)
          return [
            said ? `${who} last said ${said.level}${said.reason ? `: ${said.reason}` : ''}.` : group ? `${who} has not said yet.` : '',
            soon && `${who} ${group ? 'has' : 'have'} ${soon.course.number} at ${String(soon.startHour).padStart(2, '0')}:00, ${soon.inHours === 1 ? 'within the hour' : `in ${soon.inHours} hours`}, and will have to go to it: let it pull the number down.`
          ]
            .filter(Boolean)
            .join(' ')
        }),
        group
          ? `At 3 she lets it show; at 2 she says so. At 1, or at 2 twice running with nothing better, she leaves: write her going and add [LEAVES: Name=feeling a few words why] on a line of its own at the end, ` +
            `the feeling being content, hurt or angry: [LEAVES: ${cast[1]?.name.split(' ')[0] ?? 'Name'}=hurt saw she was not wanted]. The scene goes on with whoever stays. If it is all of you, end the scene instead. ` +
            `Whenever one of you goes for any other reason (a class, practice, home), the same: [LEAVES: Name=content a few words why].`
          : `At 3 let it show; at 2 say so. At 1, or at 2 twice running with nothing better, leave: make your excuse and end the scene.`,
        'Never mention these lines or the number.'
      ]),

    !byCourier &&
      !isNpc &&
      cast.some((c) => !hasContact(state, c.id)) &&
      section(
        'Bloomr',
        [
          ...cast
            .filter((c) => !hasContact(state, c.id))
            .map((c) => {
              const who = group ? c.name.split(' ')[0] : 'You'
              return (
                `${group ? `${who}'s` : 'Your'} Bloomr handle is ${handleOf(c)}, and ${player.name} does not have it yet. ` +
                (offersContact(content, state, c.id)
                  ? `${who} ${group ? 'is' : 'are'} taken enough with ${player.name} to want him to have it: offer it unasked at a natural moment in this scene.`
                  : `${who} ${group ? 'does' : 'do'} not offer it unasked. Whether to give it when he asks is ${group ? 'hers' : 'yours'} to decide in character, from how well ${group ? 'she knows' : 'you know'} him: ${group ? 'she' : 'you'} may refuse or put him off.`)
              )
            }),
          // Writing the handle out is the giving: the game reads it in the reply and puts it in his phone.
          `Giving it is saying or showing the handle in the reply, written out exactly: that is what puts it in his phone, and he cannot write to ${group ? 'her' : 'you'} without it. Never write a handle unless it is being given.`
        ]
      ),

    !byCourier &&
      sceneBeats.length > 0 &&
      fertile.length > 0 &&
      section('Conception', [
        `${player.name} is a True Sire: when he spends himself inside a woman who is taking nothing against it, the Bloom locks in and leaves her with child.`,
        group
          ? `If that happens in your reply, write [SEEDED: name] on a line of its own at the end of the reply, ` +
            `once for each woman it happened to (${firstNames(content, fertile.map((c) => c.id))}).`
          : `If that happens in your reply, write ${SEEDED_TAG} on a line of its own at the end of the reply.`,
        'Write it only for that, at most once a reply for each woman, and never mention it. The game decides what comes of it; ' +
          'do not say whether she has conceived unless these instructions tell you she has.'
      ]),

    !byCourier &&
      !isNpc &&
      section('Making plans to meet again', [
        `When you and ${player.name} settle on meeting another time, call propose_meeting in that same reply: when he asks to see you again and you are willing, when he names a day ` +
          `("I'm free Windsday evening") and you agree, or when you suggest one yourself. Saying "see you then" without calling it arranges nothing: it is the call that puts it on his calendar.`,
        `Give it what was said: the day of the week in "weekday", the part of the day in "time_of_day", "next week" in "earliest". Then say exactly the day, time and place it gives you, and no other.`,
        input.pendingProposal &&
          `You have already suggested "${input.pendingProposal.title}" on ${describeWhen(content, input.pendingProposal.time)} at ` +
            `${content.locations.find((l) => l.id === input.pendingProposal?.locationId)?.name ?? input.pendingProposal.locationId}, and ${player.name} has not yet put it in his calendar. ` +
            `If what he says now agrees to it ("Windsday it is", "I'll be there", "yes"), write ${AGREED_TAG} on a line of its own at the end of your reply, which books it. If he wants another day or time, call propose_meeting again with what he asked for. ` +
            `If he turns it down, let it go. Do not call propose_meeting again for the same thing.`,
        attendableEvents(content, state).length > 0 &&
          `Telling ${player.name} you will be at an event is not a plan and needs no tool: when you say you are going, or agree when he asks whether you will be there, write [ATTENDING: id]` +
            `${group ? ' (in a group, [ATTENDING: Name=id] for each who says she is going herself; asked one of you, only she answers)' : ''} on a line of its own at the end of the reply, and you will be there when he goes. The ids: ` +
            `${attendableEvents(content, state).map((event) => `${event.id} is ${event.name}`).join('; ')}.`
      ]),

    !byCourier &&
      !isNpc &&
      sceneBeats.length > 0 &&
      section('Moving on, and time passing', [
        `Where you are and what time it is are kept by the game, and time moves only when the scene does. Never write that ` +
          `you and ${player.name} have gone somewhere else, or that hours have gone by, without calling move_scene for it.`,
        `Going somewhere now and planning to meet later are two different things, each with its own tool, and you call one or the other, never both for the same thing. ` +
          `move_scene is for now: the two of you get up and go, and the scene carries on there. propose_meeting is for later: it puts a time on the calendar and you stay where you are.`,
        canSleepOver(content, state) &&
          `It is late. If the night ends with you and ${player.name} going to sleep here together, after being intimate or because one of you asks the other to stay, ` +
            `write the two of you falling asleep, end the reply there, and put ${SLEEP_TAG} on a line of its own at its end: that closes the scene, and ${player.name} wakes here in the morning. ` +
            `Not for a nap or for lying down a while. Do not write the morning: the scene is over when you fall asleep.`,
        // What he has to be at soon, so that she does not try to carry him off somewhere else.
        due &&
          `${player.name} has ${due.title} at ${formatTime(toDate(content.calendar, due.time))}` +
            `${duePlace ? ` at ${duePlace.name}` : ''}, ${due.time - state.time <= 1 ? 'within the hour' : `in ${due.time - state.time} hours`}, and has to be there. ` +
            `Do not take the scene anywhere that would make him late for it: the game will refuse. You may walk him to it, or let him go. ` +
            `If you are in it too and the two of you go to it together, call move_scene with the place "next-event": that ends this scene and begins it.`
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
      ? `Reminder: write only the message, one to three short sentences, between ${DM_OPEN} and ${DM_CLOSE}.`
      : (look && !isNpc ? `Reminder: begin with the [EXPRESSION] and [COMFORT] lines${group ? ', one of each for each of you' : ''}. Then ` : 'Reminder: ') +
        (lecture
          ? `${LESSON_LINES} lines of the lecture, one beat per line, about ${LESSON_WORDS} words in all.`
          : `${REPLY_LINES} short lines, one beat per line, under ${REPLY_WORDS} words in all.`) +
      (named ? ` Every spoken line starts with the speaker's first name and a colon.` : '')
  ]

  return sections.filter((s): s is string => typeof s === 'string' && s.length > 0).join('\n\n')
}

/**
 * What stands in for the player's first line when a scene begins: the character opens it,
 * with a little narration to set the scene and then what she says. It is sent to the LLM
 * and never kept in the scene or shown.
 */
export function openingCue(playerName: string): string {
  return (
    `[The scene begins here, and you open it. First a sentence or two of narration between asterisks that sets the scene: ` +
    `where this is, what is going on, and ${playerName} arriving or already there. Then the first thing said to him, in character. ` +
    `Keep it short, do not speak or act for ${playerName}, and follow every rule above.]`
  )
}

/**
 * The conversation as it is sent: the scene's own lines, with the opening cue in front
 * when the character spoke first, so that the exchange always starts with the player's side,
 * and with the hidden lines each of her replies began with put back in front of it.
 */
export function sceneTurns(messages: ChatMessage[], playerName: string, lesson?: Lesson, now?: string): ChatMessage[] {
  // Each of her replies goes back as she wrote it, hidden lines and all: one sent without them would teach her to leave them out.
  const turns = messages.map(({ role, content, tags }): ChatMessage => ({ role, content: role === 'assistant' && tags ? `${tags}\n${content}` : content }))
  const all: ChatMessage[] = turns[0]?.role === 'user' ? turns : [{ role: 'user', content: lesson ? lessonCue(playerName, lesson) : openingCue(playerName) }, ...turns]
  // The time is said again beside the latest thing said to her, where it is hardest to lose sight of: told once, far above, it is forgotten for "tonight".
  const last = all[all.length - 1]
  return now && last?.role === 'user' ? [...all.slice(0, -1), { ...last, content: `${last.content}\n[${now}]` }] : all
}

/**
 * What the hour means, said outright: by day, how long there is until dark, and that the evening's words are not
 * for now. A clock time alone does not keep a character from asking him to stay the night at noon.
 */
export function describeHour(content: ContentPack, date: GameDate): string {
  if (date.period.light === 'night') return `It is ${date.period.name.toLowerCase()}, and dark out.`
  const dusk = [...content.calendar.periods].sort((a, b) => a.startHour - b.startHour).find((period) => period.light === 'night' && period.startHour > date.hour)
  const left = dusk ? dusk.startHour - date.hour : 0
  return (
    `It is daytime${dusk ? `, with ${left} hour${left === 1 ? '' : 's'} to go before ${dusk.name.toLowerCase()}` : ''}. Speak, plan and behave as people do at this hour. ` +
    `"Tonight", staying the night and going to bed are ${left > 2 ? 'a long way off' : 'not here yet'}: do not talk as if it were already evening, and say "later" or "this evening" for what is to come.`
  )
}

/** The time in a few words, to go beside the player's latest line: "It is now 12:00 (Afternoon), daytime." */
export function clockNote(content: ContentPack, state: GameState): string {
  const date = toDate(content.calendar, state.time)
  return `It is now ${formatTime(date)} (${date.period.name}), ${date.period.light === 'night' ? 'dark out' : 'daytime'}.`
}

/**
 * What stands in for the player's first line when a class begins: the lecture's opening.
 * Whoever teaches it does the talking, and teaches something, for several beats; the
 * usual limit on a reply's length is lifted for this one reply.
 */
export function lessonCue(playerName: string, lesson: Lesson): string {
  return (
    `[The class begins here, and you open it with the start of the lecture. This one reply is longer than any other: ` +
    `${LESSON_LINES} lines, each a beat of its own and under ${LESSON_LINE_WORDS} words, about ${LESSON_WORDS} words in all.\n` +
    `- ${lesson.speaker} is teaching ${lesson.course}.${lesson.about ? ` The course: ${lesson.about}` : ''}\n` +
    (lesson.topic ? `- Today's topic is "${lesson.topic.title}". What is true of it in this world, to teach from and not to contradict: ${lesson.topic.content}\n` : '') +
    (lesson.topic?.question ? `- It is examined, so ${lesson.speaker} says it outright in one of the lines: ${lesson.topic.question.ask} ${lesson.topic.question.answer}.\n` : '') +
    `- Most of the lines are ${lesson.speaker} speaking to the room, and each of those starts with "${lesson.speaker}:". ` +
    `They teach: today's topic named, an idea explained in plain words, a concrete example or a demonstration, ` +
    `and perhaps a question put to the room. Real content that belongs to this subject and this world, said the way this teacher would say it.\n` +
    `- ${playerName} is never called on. He could not know the answer to something made up for this lesson, so a question is put to the room and ` +
    `answered by another student: one of you sitting near him, or someone unnamed, told in a line of narration (*A girl in the front row answers that...*). ` +
    `${lesson.speaker} does not speak to ${playerName} or single him out.\n` +
    `- The first line is a sentence of narration between asterisks as the room settles. One or two of the other lines may be ` +
    `narration, or a short aside to ${playerName} from someone sitting beside him, named as usual.\n` +
    `- End on something ${playerName} can answer without knowing the subject: a neighbour's whisper or aside to him, or a lull while the room takes notes. Never on a question from ${lesson.speaker}.\n` +
    `- Do not speak or act for ${playerName}, and begin with the hidden lines as every reply does.]`
  )
}
