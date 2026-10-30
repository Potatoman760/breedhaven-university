import { MEMORY_LEVEL_LABELS, picturedOutfit, EXPRESSIONS, isPregnantPose, poseDescription, poseMedia, kindOf, classYear, outfitDescription, type ChatMessage, type ContentPack, type LoveInterest, type Outfit, type Departure, type GameState, type Lesson, type Npc, type Proposal, type Scene, type SceneBeat, type SceneGift, type ScenePresent, type RelicUse } from '../model'
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
import { describeAge, describeBeat, describeIntimacy, feelingWord, selectMemories } from './memory'
import { stageFor } from './relationships'
import { describeSexGate, sexGate } from './intimacy'
import { describeOwnChildren, describePregnancy, canConceive, ordinaryOutfit, pregnancyStage, wearableOutfits, wornOutfit } from './pregnancy'
import { AGREED_TAG, firstNames, SCENE_END_TAG, SEEDED_TAG, SLEEP_TAG } from './scene'
import { describePlayerRoom, playerRoom, describePlace, describeRoom, describeWeather, roomOwner, sceneView } from './sceneMoves'
import { backgroundFor, isIndoors } from './schedule'
import { weatherOn } from './weather'
import { presentEventNow } from './presents'
import { describeRelicUses, relicTraitIds } from './relics'
import { trustOf } from './modifiers'
import { skillLevel } from './skills'
import { t } from '../i18n'

// Characters know about events this many days ahead.
const UPCOMING_EVENT_DAYS = 7

// How near a class has to be before she is told she will have to leave for it.
const CLASS_SOON_HOURS = 2

// The shape of a reply: a few short beats the player clicks through, visual-novel style.
const REPLY_LINES = { min: 2, max: 4 }
const LINE_WORDS = 25
const REPLY_WORDS = 60
// The reply a class opens with is a stretch of the lecture, and runs longer than any other.
const LESSON_LINES = { min: 5, max: 8 }
const LESSON_LINE_WORDS = 30
const LESSON_WORDS = 180

// The tool names and hidden tags the prompt teaches: the parser and the tools read them back, so they are never translated.
const PROPOSE = 'propose_meeting'
const MOVE = 'move_scene'
const EXPRESSION_TAG = '[EXPRESSION]'
const OUTFIT_TAG = '[OUTFIT]'
const SEX_ACT_TAG = '[SEX-ACT]'
const COMFORT_TAG = '[COMFORT]'
// The place move_scene takes to go on to what he has next.
const NEXT_EVENT = 'next-event'
// The two sex-acts that are one moment each.
const ONE_MOMENT = { creampie: 'creampie', facial: 'facial' }

const lineRange = (range: { min: number; max: number }) => t('scene.prompt.lineRange', range)

export interface PromptInput {
  content: ContentPack
  state: GameState
  loveInterestId: string
  /** The class the scene is set in, if it is one. */
  lesson?: Lesson
  /** Nothing has been said yet: this reply opens the scene. */
  opening?: boolean
  /** Those in the scene whom nothing holds back: the sex gate is open to each of them. */
  uninhibited?: string[]
  /** What the relics he has used in the scene have set going in it. */
  relics?: RelicUse[]
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
  /** Set once the scene has run past its usual length, to how many times he has spoken in it: she is asked to wind it down. */
  windDown?: number
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
  /** Presents those in the scene brought him for the day, to give him as each first greets him. */
  presents?: ScenePresent[]
  /** Those in the scene meeting him for the first time whose name has not yet been said in it, by id. */
  strangers?: string[]
  /** A plan a character has suggested in this scene that the player has not yet put in his calendar. */
  pendingProposal?: Proposal
  /** In a group, who answers first this time (`firstToSpeak`): the lists of them begin with her. */
  firstSpeakerId?: string
  /** How many of her memories she is told, as set in the settings. */
  memoryRecall?: number
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
  return text.length > 0 && t('scene.prompt.labelled', { label, text })
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
      : t('scene.prompt.clubs', {
          teacher: kind === 'teacher',
          societies: societies
            .map((society) =>
              t('scene.prompt.club', { name: society.name, weekday: society.weekday, hour: String(society.startHour).padStart(2, '0'), member: state.societies.includes(society.id), player: player.name })
            )
            .join(t('scene.list.commaAnd'))
        })
  const place =
    isNpc || !content.coursework
      ? undefined
      : kind === 'student' && li.studies
        ? t('scene.prompt.student', { year: classYear(li.studies.level), graduate: li.studies.level >= 5, subject: li.studies.subject }) + clubs
        : kind === 'teacher' && li.teaching
          ? t('scene.prompt.teacher', {
              title: li.teaching.title,
              department: li.teaching.department,
              subjects: li.teaching.subjects.map((s) => s.subject).join(t('scene.list.and')),
              player: player.name,
              inClass: inHerClass,
              course: hers.find((c) => state.enrolment?.includes(c.id))?.title
            }) + clubs
          : t('scene.prompt.outsider')
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
  // `who` is her first name, or nothing when she is the one told.
  const pregnantNote = (c: LoveInterest, who?: string): string | false => {
    const stage = pregnancyStage(content, state, c.id)
    return stage?.showing === true && t('scene.prompt.appear.pregnant', { self: who === undefined, who, stage: stage.name })
  }
  // What she is asked to wear is always one of her ordinary outfits: the game puts her in its pregnant form itself.
  const outfits = wearableOutfits(li)
  const wearing = (c: LoveInterest, worn: ReturnType<typeof wornOutfit>): string => (worn ? ordinaryOutfit(c, worn).id : c.defaultOutfitId)
  const cast = [li, ...companions]
  // The same, from whoever answers first this time: what they are listed in is the order they answer in, and a list that
  // always runs the same way keeps them to one.
  const lead = cast.find((c) => c.id === input.firstSpeakerId)
  const voices = lead ? [lead, ...cast.filter((c) => c !== lead)] : cast
  const fertile = cast.filter((c) => canConceive(content, state, c.id) && sexGate(content, state, c, input.uninhibited?.includes(c.id)).open)
  // Only a pose with something to show can be asked for.
  // The poses that can be asked for are the ordinary ones. One drawn pregnant is put up in its place by the game, once she shows.
  const posesOf = (who: LoveInterest) => who.animations.filter((a) => poseMedia(a).length > 0 && !isPregnantPose(a.id))
  // A woman who will not go to bed with him in this scene is told nothing of sex-acts: there is none for her to choose.
  const actsOf = (c: LoveInterest) => (isNpc || sexGate(content, state, c, input.uninhibited?.includes(c.id)).open ? posesOf(c) : [])
  const animations = actsOf(li)
  // An outfit's pictures beyond the standard faces, each with what it shows: a face added in the editor says so itself
  // unless the picture does. One that says nothing is not offered.
  const ownFaces = (outfit: Outfit): [string, string][] =>
    Object.entries(outfit.sprites).flatMap(([name, sprite]): [string, string][] => {
      const description = sprite.description || content.looks.expressions.find((face) => face.id === name)?.description || ''
      return (EXPRESSIONS as readonly string[]).includes(name) || description === '' ? [] : [[name, description]]
    })
  // Her own traits, and any every woman has from a relic he has on.
  const fromRelics = isNpc ? [] : relicTraitIds(content, state)
  const traitsOf = (ids: string[]) => content.traits.filter((t) => ids.includes(t.id) || fromRelics.includes(t.id))
  const isBirthday = li.birthday?.month === date.month.id && li.birthday.day === date.day

  const ctx = { state, content, loveInterestId: li.id }
  const shareable = li.ai.secrets.filter((s) => evaluateAll(s.revealWhen, ctx))
  const guarded = li.ai.secrets.filter((s) => !shareable.includes(s))
  // An NPC keeps no memory of him: each time is the first, as far as she is told.
  const memories = input.npc ? [] : selectMemories(state.memories[li.id] ?? [], input.memoryRecall)
  const plansWith = upcomingAppointments(state).filter((a) => attendees(a).includes(li.id))
  const lore = selectCodexEntries({
    content,
    state,
    recentText,
    budgetChars: codexBudgetChars
  })

  const sections = [
    group
      ? t('scene.prompt.introGroup', { name: li.name, others, count: companions.length, player: player.name, firstName })
      : t('scene.prompt.introSolo', { name: li.name }),

    // How it is spelt is the game's to say and not the world's: told here, where no player reads it, and not in the lore.
    t('scene.prompt.usEnglish'),

    byCourier &&
      section(t('scene.prompt.courier.title'), [
        t('scene.prompt.courier.apart', { player: player.name }),
        t('scene.prompt.courier.only'),
        t('scene.prompt.courier.noActions'),
        t('scene.prompt.courier.tags', { open: DM_OPEN, close: DM_CLOSE }),
        !isNpc && t('scene.prompt.courier.meet', { player: player.name, tool: PROPOSE, today: 'today' }),
        !isNpc && t('scene.prompt.courier.askToMeet', { player: player.name, tool: PROPOSE }),
        input.mode === 'news' && t('scene.prompt.courier.news', { news: input.news ?? '' }),
        input.mode === 'note' && t('scene.prompt.courier.note', { player: player.name }),
        input.mode === 'invite' && t('scene.prompt.courier.invite', { player: player.name, tool: PROPOSE })
      ]),

    isNpc && t('scene.prompt.npc', { role: input.npc?.role, player: player.name }),

    !byCourier &&
      extras.length > 0 &&
      section(t('scene.prompt.extras.title'), [
        t('scene.prompt.extras.intro', { player: player.name }),
        ...extras.flatMap((extra) => [
          t('scene.prompt.extras.who', { name: extra.name, role: extra.role, personality: extra.personality }).trim(),
          extra.ai.speechPattern && t('scene.prompt.extras.speaks', { first: extra.name.split(' ')[0], speech: extra.ai.speechPattern }),
          extra.ai.knowledge.length > 0 && t('scene.prompt.extras.knows', { knowledge: extra.ai.knowledge.slice(0, 3).join(' ') })
        ])
      ]),

    !byCourier && section(t('scene.prompt.reply.title'), [
      t('scene.prompt.reply.box', { player: player.name }),
      lecture
        ? t('scene.prompt.reply.lectureLines', { lines: lineRange(LESSON_LINES) })
        : t('scene.prompt.reply.lines', { lines: lineRange(REPLY_LINES) }),
      lecture
        ? t('scene.prompt.reply.lectureWords', { lineWords: LESSON_LINE_WORDS, words: LESSON_WORDS })
        : t('scene.prompt.reply.words', { lineWords: LINE_WORDS, words: REPLY_WORDS }),
      input.lesson && t('scene.prompt.reply.speaker', { speaker: input.lesson.speaker }),
      input.lesson && t('scene.prompt.reply.noCalling', { speaker: input.lesson.speaker, player: player.name }),
      named ? t('scene.prompt.reply.named', { firstName: voices[0].name.split(' ')[0] }) : t('scene.prompt.reply.plain'),
      group && t('scene.prompt.reply.group', { others }),
      lecture
        ? t('scene.prompt.reply.lectureNarration')
        : named
        ? t('scene.prompt.reply.namedAction')
        : t('scene.prompt.reply.action'),
      lecture
        ? t('scene.prompt.reply.lectureNever', { player: player.name })
        : t('scene.prompt.reply.never', { player: player.name }),
      lecture
        ? t('scene.prompt.reply.lectureEnd', { player: player.name })
        : t('scene.prompt.reply.end', { player: player.name }),
      // A lecture has its own say on this: nothing made up for it is ever asked of him.
      !lecture && t('scene.prompt.reply.unknowable', { player: player.name }),
      t('scene.prompt.reply.noLists')
    ]),

    section(t('scene.prompt.who.title'), [
      t('scene.prompt.who.line', { name: li.name, age: li.age, pronouns: li.pronouns }),
      li.bio,
      place,
      labelled(t('scene.prompt.label.personality'), li.personality),
      labelled(t('scene.prompt.label.appearance'), li.appearance),
      outfit && labelled(t('scene.prompt.label.wearing'), outfitDescription(li.outfits, outfit) || outfit.name),
      labelled(t('scene.prompt.label.backstory'), li.ai.backstory),
      labelled(t('scene.prompt.label.likes'), li.likes),
      labelled(t('scene.prompt.label.dislikes'), li.dislikes)
    ]),

    section(
      t('scene.prompt.traits.title'),
      traitsOf(li.traitIds).map(
        (trait) => `- ${trait.name}: ${trait.definition}`
      )
    ),

    section(t('scene.prompt.speech.title'), [
      li.ai.speechPattern,
      labelled(t('scene.prompt.label.tone'), li.ai.tone),
      ...li.ai.verbalQuirks.map((q) => `- ${q}`),
      ...li.ai.exampleDialogue.map((ex) => t('scene.prompt.speech.example', { user: ex.user, reply: ex.reply }))
    ]),

    // Who he is, as anyone who has heard of him knows it.
    section(t('scene.prompt.about.title', { player: player.name }), [player.bio, player.about].map((text) => text.split(PLAYER_TOKEN).join(player.name))),

    !isNpc && section(t('scene.prompt.relationship.title', { player: player.name }), [
      t('scene.prompt.relationship.stage', { stage: stage.name, description: stage.description }).trim(),
      t('scene.prompt.relationship.meters', { affection: rel.affection, trust: trustOf(content, state, li.id), desire: rel.desire, max: content.relationships.meterMax }),
      `${describeIntimacy(state, li.id)}.`,
      ...describeAppeal(state, li)
    ]),

    // What a relic he has used in the scene has set going, as a rule of it.
    !isNpc && !byCourier && (input.relics ?? []).length > 0 && section(t('scene.prompt.relics.title'), describeRelicUses(input.relics ?? [], player.name, group)),
    // Whether each woman here will go to bed with him is the game's to say, and what she takes against the Bloom.
    !isNpc &&
      !byCourier &&
      section(
        t('scene.prompt.sex.title', { player: player.name }),
        cast.flatMap((c) => {
          const lines = describeSexGate(content, state, c, group, input.uninhibited?.includes(c.id))
          return group ? [t('scene.prompt.sex.for', { first: c.name.split(' ')[0] }), ...lines] : lines
        })
      ),

    !isNpc && section(
      t('scene.prompt.bonds.title'),
      describeBonds(content, state, li.id, companions.map((c) => c.id))
    ),

    ...companions.map((c) => {
      const theirs = state.relationships[c.id] ?? { affection: 0, trust: 0, desire: 0 }
      const theirStage = stageFor(content.relationships, theirs.affection)
      const last = (state.memories[c.id] ?? []).at(-1)
      return section(t('scene.prompt.companion.title', { name: c.name }), [
        t('scene.prompt.who.line', { name: c.name, age: c.age, pronouns: c.pronouns }),
        labelled(t('scene.prompt.label.personality'), c.personality),
        labelled(t('scene.prompt.label.appearance'), c.appearance),
        ...traitsOf(c.traitIds).map((trait) => `- ${trait.name}: ${trait.definition}`),
        labelled(t('scene.prompt.label.howTheySpeak'), [c.ai.speechPattern, c.ai.tone].filter((s) => s.length > 0).join(' ')),
        ...c.ai.verbalQuirks.map((q) => `- ${q}`),
        t('scene.prompt.companion.with', { player: player.name, stage: theirStage.name, description: theirStage.description }).trim(),
        statusOf(content, bondOf(state, c.id)) &&
          t('scene.prompt.companion.bond', { player: player.name, status: statusOf(content, bondOf(state, c.id))?.name }),
        last && t('scene.prompt.companion.last', { player: player.name, summary: last.summary }),
        labelled(t('scene.prompt.label.likes'), c.likes),
        labelled(t('scene.prompt.label.dislikes'), c.dislikes)
      ])
    }),

    group &&
      section(t('scene.prompt.rapport.title'), [
        ...describeRapport(content, state, cast.map((c) => c.id)),
        t('scene.prompt.rapport.play', { player: player.name })
      ]),

    section(
      t('scene.prompt.memories.title', { player: player.name }),
      memories.length === 0
        ? []
        : [
            t('scene.prompt.memories.intro'),
            ...memories.map((m) => {
              const then = toDate(content.calendar, m.time)
              return t('scene.prompt.memories.line', { level: MEMORY_LEVEL_LABELS[m.level], age: describeAge(content, m, state.time), day: then.day, month: then.month.name, summary: m.summary })
            })
          ]
    ),

    section(t('scene.prompt.scene.title'), [
      t('scene.prompt.scene.time', { time: formatTime(date), period: date.period.name, date: formatDate(date) }),
      describeHour(content, date),
      weather &&
        describeWeather(weather, byCourier ? (whereabouts ? isIndoors(whereabouts, herView) : true) : owner !== undefined || his !== undefined || isIndoors(location, view)),
      ...eventsOn(content, state).filter((e) => !e.secret).map((e) =>
        t('scene.prompt.scene.today', { name: e.name, description: describeEvent(content, e), going: eventGoers(state, e.id).includes(li.id), player: player.name }).trim()
      ),
      ...upcomingEvents(content, state, UPCOMING_EVENT_DAYS).map(({ event, inDays }) =>
        t('scene.prompt.scene.upcoming', { name: event.name, days: inDays, description: describeEvent(content, event), going: eventGoers(state, event.id).includes(li.id), player: player.name }).trim()
      ),
      ...examNotes(content, state, li, player.name),
      isBirthday && t('scene.prompt.scene.birthday'),
      byCourier
        ? t('scene.prompt.scene.apart', { away: whereabouts !== undefined, place: whereabouts?.name, player: player.name })
        : his
          ? t('scene.prompt.scene.in', { group, others, player: player.name, room: describePlayerRoom(his, location, player.name) })
          : owner
          ? t('scene.prompt.scene.in', { group, others, player: player.name, room: describeRoom(owner, location, li.id) })
          : location && t('scene.prompt.scene.at', { group, others, player: player.name, place: describePlace(location, view) }),
      sceneBeats.length > 0 &&
        (done.length > 0
          ? t('scene.prompt.scene.earlier', { done: done.map(describeBeat).join(t('scene.list.then')), now: current.map(describeBeat).join(t('scene.list.then')) || t('scene.prompt.scene.justUs') })
          : t('scene.prompt.scene.soFar', { beats: sceneBeats.map(describeBeat).join(t('scene.list.then')) })),
      ...(input.departed ?? []).map((d) =>
        t('scene.prompt.scene.departed', { name: firstNames(content, [d.id]), why: Boolean(d.reason), reason: d.reason, calm: d.feeling === 'content', feeling: feelingWord(d.feeling) })
      ),
      sceneBeats.at(-1)?.direction
    ]),

    // The whole of what is booked, said as the whole: a meeting talked of in a memory or a message is otherwise taken for one still to come.
    !isNpc &&
      section(t('scene.prompt.plans.title', { player: player.name }), [
        ...plansWith.map((a) => {
          const where = content.locations.find((l) => l.id === a.locationId)
          const also = attendees(a).filter((id) => id !== li.id)
          return t('scene.prompt.plans.line', { title: a.title, when: describeWhen(content, a.time), where: where?.name ?? a.locationId, also: also.length > 0, others: firstNames(content, also) })
        }),
        plansWith.length > 0 ? t('scene.prompt.plans.all') : t('scene.prompt.plans.none')
      ]),

    !isNpc && section(t('scene.prompt.children.title'), describePregnancy(content, state, li.id)),

    // Where he lives now, and who with: to someone of the house, as her own home.
    !isNpc && section(t('scene.prompt.house.title', { player: player.name }), describeHousehold(content, state, li.id)),

    section(t('scene.prompt.knowledge.title', { player: player.name }), (input.npc?.knowledge ?? li.ai.knowledge).map((fact) => `- ${fact}`)),

    // Whoever he works for knows him as her employee, whatever else she is to him.
    section(t('scene.prompt.employee.title', { player: player.name }), jobFacts(content, state, li.id)),

    // The officer who lets him his house has his file in front of her.
    section(t('scene.prompt.housingFile.title', { player: player.name }), housingFacts(content, state, li.id)),

    ...companions.map((c) =>
      section(
        t('scene.prompt.companionChildren.title', { first: c.name.split(' ')[0] }),
        describeOwnChildren(content, state, c.id).map((line) => t('scene.prompt.companionChildren.line', { first: c.name.split(' ')[0], line }))
      )
    ),

    section(t('scene.prompt.dms.title', { player: player.name }), notes),

    section(
      t('scene.prompt.posts.title'),
      recentPostsBy(state, li.id).map((post) => t('scene.prompt.posts.line', { text: post.text, liked: post.liked === true, player: player.name }))
    ),

    section(t('scene.prompt.gifts.title', { player: player.name, group }), [
      ...(input.gifts ?? []).map(
        (gift) =>
          `- ${describeGift(gift, group ? firstNames(content, [gift.recipientId]) : undefined)}`
      ),
      (input.gifts ?? []).length > 0 && (group ? t('scene.prompt.gifts.group') : t('scene.prompt.gifts.solo'))
    ]),

    section(t('scene.prompt.first.title'), [
      (input.strangers ?? []).includes(li.id) && t('scene.prompt.first.you', { player: player.name }),
      (input.strangers ?? []).some((id) => id !== li.id) &&
        t('scene.prompt.first.others', {
          names: firstNames(content, (input.strangers ?? []).filter((id) => id !== li.id)),
          count: (input.strangers ?? []).filter((id) => id !== li.id).length,
          player: player.name
        })
    ]),

    section(t('scene.prompt.presents.title', { player: player.name, event: presentEventNow(content, state)?.name ?? t('scene.prompt.presents.theDay') }), [
      ...(input.presents ?? []).flatMap((present) => {
        const item = content.items.find((one) => one.id === present.itemId)
        const mine = present.fromId === li.id
        return item ? [t('scene.prompt.presents.line', { mine, who: mine ? undefined : firstNames(content, [present.fromId]), item: item.name, description: item.description })] : []
      }),
      (input.presents ?? []).length > 0 &&
        (input.opening ? t('scene.prompt.presents.opening', { group, player: player.name }) : t('scene.prompt.presents.later'))
    ]),

    section(
      t('scene.prompt.share.title'),
      shareable.map((s) => `- ${s.text}`)
    ),

    section(t('scene.prompt.secrets.title'), [
      guarded.length > 0 && t('scene.prompt.secrets.intro', { player: player.name }),
      ...guarded.map((s) => `- ${s.text}`)
    ]),

    section(
      t('scene.prompt.lore.title'),
      lore.map((entry) => `- ${entry.title}: ${codexExcerpt(entry)}`)
    ),

    // What the class is on stays in front of her for the rest of it, so that a question about it is answered from the same facts.
    input.lesson?.topic &&
      section(t('scene.prompt.lesson.title', { topic: input.lesson.topic.title }), [
        t('scene.prompt.lesson.content', { speaker: input.lesson.speaker, content: input.lesson.topic.content })
      ]),

    section(t('scene.prompt.notes.title', { name: li.name }), [li.ai.extraInstructions]),

    look &&
      !isNpc &&
      section(t('scene.prompt.appear.title'), [
        group
          ? t('scene.prompt.appear.beginGroup', { tags: voices.map((c) => `[EXPRESSION: ${c.name.split(' ')[0]}=happy]`).join(' ') })
          : t('scene.prompt.appear.begin', { tag: '[EXPRESSION: happy]' }),
        t('scene.prompt.appear.faces', { faces: EXPRESSIONS.join(', '), group }),
        ...(group
          ? [
              t('scene.prompt.appear.outfitGroup', { tag: '[OUTFIT: Name=id]' }),
              ...voices.map((c) => {
                const worn = wornOutfit(content, state, c, c.id === li.id ? look.outfitId : input.looks?.[c.id]?.outfitId)
                const has = wearableOutfits(c).map((o) => `${o.id} (${o.name})`).join(', ')
                const first = c.name.split(' ')[0]
                const note = pregnantNote(c, first)
                return t('scene.prompt.appear.wearingGroup', { first, outfit: wearing(c, worn), has, showing: note !== false, note: note || undefined })
              }),
              // Faces of their own, beyond the standard ones, as the outfit each has on has pictures for.
              ...voices.flatMap((c) => {
                const worn = wornOutfit(content, state, c, c.id === li.id ? look.outfitId : input.looks?.[c.id]?.outfitId)
                const faces = worn ? ownFaces(picturedOutfit(c.outfits, worn)).map(([name, description]) => `${name} (${description})`) : []
                return faces.length > 0 ? [t('scene.prompt.appear.facesGroup', { first: c.name.split(' ')[0], faces: faces.join('; ') })] : []
              }),
              // Poses belong to one of them each, and one is shown at a time, over everyone.
              ...(cast.some((c) => actsOf(c).length > 0)
                ? [
                    t('scene.prompt.appear.actsGroup', {
                      up: Boolean(look.animationId),
                      pose: look.animationId,
                      first: cast.find((c) => c.id === (look.animationOf ?? li.id))?.name.split(' ')[0] ?? firstName
                    }),
                    ...cast.filter((c) => actsOf(c).length > 0).map((c) => `- ${c.name.split(' ')[0]}: ${actsOf(c).map((a) => `${a.id} (${poseDescription(a, content.looks.acts) || a.name})`).join('; ')}`),
                    t('scene.prompt.appear.actsGroupRules', { tag: '[SEX-ACT: Name=id]', bare: SEX_ACT_TAG, ...ONE_MOMENT })
                  ]
                : [])
            ]
          : [
              pregnantNote(li),
              t('scene.prompt.appear.wearing', { outfit: wearing(li, outfit), tag: '[OUTFIT: id]' }),
              ...outfits.flatMap((o) => {
                // Pictures that are not one of the faces: something particular, to be asked for by name.
                const others = ownFaces(picturedOutfit(li.outfits, o))
                return [
                  t('scene.prompt.appear.option', {
                    id: o.id,
                    name: o.name,
                    about: o.id === wearing(li, outfit) ? t('scene.prompt.appear.onNow') : outfitDescription(li.outfits, o) || t('scene.prompt.noDescription')
                  }),
                  ...others.map(([name, description]) => t('scene.prompt.appear.picture', { tag: `[EXPRESSION: ${name}]`, description }))
                ]
              }),
              ...(animations.length > 0
                ? [
                    look.animationId ? t('scene.prompt.appear.actsUp', { pose: look.animationId }) : t('scene.prompt.appear.acts'),
                    ...animations.map((a) => t('scene.prompt.appear.option', { id: a.id, name: a.name, about: poseDescription(a, content.looks.acts) || t('scene.prompt.noDescription') })),
                    t('scene.prompt.appear.actsRules', {
                      expression: EXPRESSION_TAG,
                      outfit: OUTFIT_TAG,
                      tag: '[SEX-ACT: id]',
                      example: '[OUTFIT: nude], [EXPRESSION: aroused], [SEX-ACT: missionary]',
                      bare: SEX_ACT_TAG,
                      ...ONE_MOMENT
                    })
                  ]
                : [])
            ]),
        t('scene.prompt.appear.onlyListed')
      ]),

    look &&
      !isNpc &&
      !byCourier &&
      section(group ? t('scene.prompt.comfort.titleGroup') : t('scene.prompt.comfort.title'), [
        group
          ? t('scene.prompt.comfort.lineGroup', { tags: voices.map((c) => `[COMFORT: ${c.name.split(' ')[0]}=4 ${t('scene.prompt.comfort.why')}]`).join(' ') })
          : t('scene.prompt.comfort.line', { tag: `[COMFORT: 4 ${t('scene.prompt.comfort.why')}]` }),
        t('scene.prompt.comfort.scale', { group, player: player.name, floor: skillLevel(content, state, 'comfort') === 2 }),
        ...voices.map((c) => {
          const said = input.comfort?.[c.id]
          const who = group ? c.name.split(' ')[0] : undefined
          const soon = classSoon(content, state, c.id, CLASS_SOON_HOURS)
          return [
            said
              ? t('scene.prompt.comfort.said', { self: !group, who, level: said.level, why: Boolean(said.reason), reason: said.reason })
              : group ? t('scene.prompt.comfort.notSaid', { who }) : '',
            soon && t('scene.prompt.comfort.class', { self: !group, who, course: soon.course.number, hour: String(soon.startHour).padStart(2, '0'), hours: soon.inHours })
          ]
            .filter(Boolean)
            .join(' ')
        }),
        group
          ? t('scene.prompt.comfort.leaveGroup', {
              tag: `[LEAVES: Name=feeling ${t('scene.prompt.comfort.why')}]`,
              content: 'content',
              hurt: 'hurt',
              angry: 'angry',
              example: `[LEAVES: ${cast[1]?.name.split(' ')[0] ?? 'Name'}=hurt ${t('scene.prompt.comfort.leaveExample')}]`,
              other: `[LEAVES: Name=content ${t('scene.prompt.comfort.why')}]`
            })
          : t('scene.prompt.comfort.leave'),
        t('scene.prompt.comfort.never')
      ]),

    !byCourier &&
      !isNpc &&
      cast.some((c) => !hasContact(state, c.id)) &&
      section(
        t('scene.prompt.bloomr.title'),
        [
          ...cast
            .filter((c) => !hasContact(state, c.id))
            .map((c) => {
              const who = group ? c.name.split(' ')[0] : undefined
              return (
                t('scene.prompt.bloomr.handle', { group, who, handle: handleOf(c), player: player.name }) +
                ' ' +
                (offersContact(content, state, c.id) ? t('scene.prompt.bloomr.offers', { group, who, player: player.name }) : t('scene.prompt.bloomr.waits', { group, who }))
              )
            }),
          // Writing the handle out is the giving: the game reads it in the reply and puts it in his phone.
          t('scene.prompt.bloomr.give', { group })
        ]
      ),

    !byCourier &&
      sceneBeats.length > 0 &&
      fertile.length > 0 &&
      section(t('scene.prompt.conception.title'), [
        t('scene.prompt.conception.sire', { player: player.name }),
        group
          ? t('scene.prompt.conception.group', { tag: '[SEEDED: name]', names: firstNames(content, fertile.map((c) => c.id)) })
          : t('scene.prompt.conception.solo', { tag: SEEDED_TAG }),
        t('scene.prompt.conception.rules')
      ]),

    !byCourier &&
      !isNpc &&
      section(t('scene.prompt.meeting.title'), [
        t('scene.prompt.meeting.call', { player: player.name, tool: PROPOSE }),
        t('scene.prompt.meeting.args', { weekday: 'weekday', timeOfDay: 'time_of_day', nextWeek: 'next week', earliest: 'earliest' }),
        input.pendingProposal &&
          t('scene.prompt.meeting.pending', {
            title: input.pendingProposal.title,
            when: describeWhen(content, input.pendingProposal.time),
            where: content.locations.find((l) => l.id === input.pendingProposal?.locationId)?.name ?? input.pendingProposal.locationId,
            player: player.name,
            tag: AGREED_TAG,
            tool: PROPOSE
          }),
        attendableEvents(content, state).length > 0 &&
          t('scene.prompt.meeting.attending', {
            player: player.name,
            tag: '[ATTENDING: id]',
            group,
            groupTag: '[ATTENDING: Name=id]',
            ids: attendableEvents(content, state).map((event) => t('scene.prompt.meeting.eventId', { id: event.id, name: event.name })).join('; ')
          })
      ]),

    !byCourier &&
      !isNpc &&
      sceneBeats.length > 0 &&
      section(t('scene.prompt.moving.title'), [
        t('scene.prompt.moving.kept', { player: player.name, move: MOVE }),
        t('scene.prompt.moving.tools', { move: MOVE, propose: PROPOSE }),
        canSleepOver(content, state) && t('scene.prompt.moving.sleep', { player: player.name, tag: SLEEP_TAG }),
        // What he has to be at soon, so that she does not try to carry him off somewhere else.
        due &&
          t('scene.prompt.moving.due', {
            player: player.name,
            title: due.title,
            time: formatTime(toDate(content.calendar, due.time)),
            there: duePlace !== undefined,
            place: duePlace?.name,
            hours: Math.max(1, due.time - state.time),
            move: MOVE,
            nextEvent: NEXT_EVENT
          })
      ]),

    sceneBeats.length > 0 &&
      section(t('scene.prompt.ending.title'), [
        t('scene.prompt.ending.close', { group, tag: SCENE_END_TAG }),
        t('scene.prompt.ending.when', { player: player.name }),
        input.windDown !== undefined &&
          (() => {
            const soon = classSoon(content, state, li.id, CLASS_SOON_HOURS)
            return t('scene.prompt.ending.windDown', {
              count: input.windDown,
              group,
              soon: Boolean(soon),
              course: soon?.course.number,
              hour: soon ? String(soon.startHour).padStart(2, '0') : undefined
            })
          })()
      ]),

    // Repeated last, where it is least likely to be forgotten.
    byCourier
      ? t('scene.prompt.reminder.courier', { open: DM_OPEN, close: DM_CLOSE })
      : t('scene.prompt.reminder.scene', {
          look: look !== undefined && !isNpc,
          expression: EXPRESSION_TAG,
          comfort: COMFORT_TAG,
          group,
          lecture,
          lines: lineRange(lecture ? LESSON_LINES : REPLY_LINES),
          words: lecture ? LESSON_WORDS : REPLY_WORDS,
          named
        })
  ]

  return sections.filter((s): s is string => typeof s === 'string' && s.length > 0).join('\n\n')
}

/**
 * What stands in for the player's first line when a scene begins: the character opens it,
 * with a little narration to set the scene and then what she says. It is sent to the LLM
 * and never kept in the scene or shown.
 */
export function openingCue(playerName: string): string {
  return t('scene.prompt.openingCue', { player: playerName })
}

/**
 * The conversation as it is sent: the scene's own lines, with the opening cue in front
 * when the character spoke first, so that the exchange always starts with the player's side,
 * and with the hidden lines each of her replies began with put back in front of it.
 */
export function sceneTurns(messages: ChatMessage[], playerName: string, lesson?: Lesson, now?: string): ChatMessage[] {
  // Each of her replies goes back as she wrote it, hidden lines and all: one sent without them would teach her to leave them out.
  // A stage note he did not say (someone walking in) goes in front of his line, where it is not missed.
  const turns = messages.map(({ role, content, tags, cue }): ChatMessage => ({
    role,
    content: role === 'assistant' && tags ? `${tags}\n${content}` : cue ? `[${cue}]\n${content}` : content
  }))
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
  if (date.period.light === 'night') return t('scene.prompt.hour.night', { period: date.period.name.toLowerCase() })
  const dusk = [...content.calendar.periods].sort((a, b) => a.startHour - b.startHour).find((period) => period.light === 'night' && period.startHour > date.hour)
  const left = dusk ? dusk.startHour - date.hour : 0
  return t('scene.prompt.hour.day', { dusk: dusk !== undefined, left, duskName: dusk?.name.toLowerCase(), far: left > 2 })
}

/** The time in a few words, to go beside the player's latest line: "It is now 12:00 (Afternoon), daytime." */
export function clockNote(content: ContentPack, state: GameState): string {
  const date = toDate(content.calendar, state.time)
  return t('scene.prompt.clock', { time: formatTime(date), period: date.period.name, dark: date.period.light === 'night' })
}

/**
 * What stands in for the player's first line when a class begins: the lecture's opening.
 * Whoever teaches it does the talking, and teaches something, for several beats; the
 * usual limit on a reply's length is lifted for this one reply.
 */
export function lessonCue(playerName: string, lesson: Lesson): string {
  const { speaker } = lesson
  return [
    t('scene.prompt.lessonCue.begin', { lines: lineRange(LESSON_LINES), lineWords: LESSON_LINE_WORDS, words: LESSON_WORDS }),
    t('scene.prompt.lessonCue.course', { speaker, course: lesson.course, hasAbout: Boolean(lesson.about), about: lesson.about }),
    lesson.topic && t('scene.prompt.lessonCue.topic', { title: lesson.topic.title, content: lesson.topic.content }),
    lesson.topic?.question && t('scene.prompt.lessonCue.question', { speaker, ask: lesson.topic.question.ask, answer: lesson.topic.question.answer }),
    t('scene.prompt.lessonCue.speaking', { speaker }),
    t('scene.prompt.lessonCue.neverCalled', { speaker, player: playerName }),
    t('scene.prompt.lessonCue.first', { player: playerName }),
    t('scene.prompt.lessonCue.end', { speaker, player: playerName }),
    t('scene.prompt.lessonCue.close', { player: playerName })
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')
}
