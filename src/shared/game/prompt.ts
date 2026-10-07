import { picturedOutfit, EXPRESSIONS, kindOf, outfitDescription, type ContentPack, type LoveInterest, type Departure, type GameState, type Npc, type Scene, type SceneBeat, type SceneGift } from '../model'
import { describeGift } from './market'
import { attendees, describeWhen, upcomingAppointments } from './appointments'
import { bondOf, describeBonds, statusOf } from './bonds'
import { formatDate, formatTime, toDate } from './calendar'
import { codexExcerpt, selectCodexEntries } from './codex'
import { courierExcerpt, hasContact, offersContact } from './courier'
import { recentPostsBy } from './feed'
import { describeRapport } from './rapport'
import { locationOf } from './map'
import { classSoon } from './courses'
import { jobFacts } from './jobs'
import { describeAppeal } from './stats'
import { evaluateAll } from './conditions'
import { eventsOn, upcomingEvents } from './events'
import { describeAge, describeBeat, selectMemories } from './memory'
import { stageFor } from './relationships'
import { describePregnancy, canConceive, pregnancyStage, wearableOutfits, wornOutfit } from './pregnancy'
import { firstNames, SCENE_END_TAG, SEEDED_TAG } from './scene'
import { describePlace, describeRoom, describeWeather, roomOwner, sceneView } from './sceneMoves'
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
  mode?: 'scene' | 'courier' | 'invite' | 'news'
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
  look?: Pick<Scene, 'outfitId' | 'animationId'>
  /** How the others in the scene appear, by id. */
  looks?: Scene['looks']
  /** How comfortable each love interest in the scene last said she was, by id. */
  comfort?: Scene['comfort']
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
  const named = group || (input.extras ?? []).length > 0
  const others = firstNames(content, companions.map((c) => c.id))
  const firstName = li.name.split(' ')[0]
  const isNpc = input.npc !== undefined
  // What she is to the University, where the game has one.
  const kind = kindOf(li)
  const hers = state.courses.filter((c) => c.teacherId === li.id)
  const inHerClass = hers.some((c) => state.enrolment?.includes(c.id))
  const place =
    isNpc || !content.coursework
      ? undefined
      : kind === 'student' && li.studies
        ? `You are a student at the University, reading ${li.studies.subject}` +
          `${li.studies.level >= 5 ? ' as a graduate' : `, in your year ${li.studies.level}`}.`
        : kind === 'teacher' && li.teaching
          ? `You teach at the University: ${li.teaching.title} of ${li.teaching.department}, giving ` +
            `${li.teaching.subjects.map((s) => s.subject).join(' and ')}. ${player.name} is a student there` +
            `${inHerClass ? `, and sits in your ${hers.find((c) => state.enrolment?.includes(c.id))?.title} class.` : ', though not in any class of yours.'}`
          : `You are not part of the University: you do not study or teach there, and know it from outside.`
  const extras = input.extras ?? []
  // With anyone else to write for, every spoken line says whose it is.
  const byCourier = input.mode === 'courier' || input.mode === 'invite' || input.mode === 'news'
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
  const done = sceneBeats.filter((beat) => beat.finished)
  const current = sceneBeats.filter((beat) => !beat.finished)
  const outfit = wornOutfit(content, state, li, look?.outfitId)
  /** Said of anyone far enough along to show: which outfits are hers to wear now. */
  const pregnantNote = (c: LoveInterest, who: string, is: string): string | false => {
    const stage = pregnancyStage(content, state, c.id)
    return stage?.showing === true && `${who} ${is} ${stage.name} and showing, so ${who === 'You' ? 'you wear only your' : 'she wears only her'} pregnant outfits: "pregnant" dressed, "nude-pregnant" undressed.`
  }
  const outfits = wearableOutfits(content, state, li)
  const cast = [li, ...companions]
  const fertile = cast.filter((c) => canConceive(content, state, c.id))
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
      section('How to write your message', [
        `You and ${player.name} are apart. You are messaging ${player.name} on Chats, the messaging ` +
          `app everyone at the University has on their phone. People message back and forth all day, ` +
          `a line or two at a time.`,
        '- Write only the message itself: one to three short sentences, under 50 words, in your own voice, typed the way you would type on your phone.',
        '- No actions, no asterisks, no description, no greeting line or signature unless it is in character.',
        !isNpc && `- To meet ${player.name}, call the propose_meeting tool and suggest exactly the day, time and place it gives.`,
        input.mode === 'news' &&
          `- Nobody has written to you just now. You are writing first, because you have news: ${input.news ?? ''}`,
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
      `- Write ${REPLY_LINES} short lines, each on its own line. Each line is one beat.`,
      `- Keep every line under ${LINE_WORDS} words, and the whole reply under ${REPLY_WORDS}.`,
      named
        ? `- Most lines are speech. Start every spoken line with the speaker's first name ` +
          `and a colon, then what they say, with no quotation marks: ${firstName}: Sit down, then.`
        : '- Most lines are things you say, written plainly with no quotation marks.',
      group &&
        `- Not everyone speaks every time. Let whoever would naturally answer speak; ` +
          `${others} should each get a line now and then, and may talk to each other.`,
      named
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

    !isNpc && section(`Your relationship with ${player.name}`, [
      `Stage: ${stage.name}. ${stage.description}`.trim(),
      li.ai.stageNotes[stage.id],
      `Affection ${rel.affection}, trust ${rel.trust}, desire ${rel.desire} ` +
        `(each out of ${content.relationships.meterMax}).`,
      ...traitsOf(player.traitIds).map((t) => `${player.name} is ${t.name}: ${t.definition}`),
      ...describeAppeal(state, li)
    ]),

    !isNpc && section(
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
        last && `Their last time with ${player.name}: ${last.summary}`,
        labelled('Likes', c.likes),
        labelled('Dislikes', c.dislikes)
      ])
    }),

    group &&
      section('How the women here stand with each other', [
        ...describeRapport(content, state, cast.map((c) => c.id)),
        'Play this between them as well as toward ' + player.name + '. If something in this scene truly changes it (a falling-out, a peace made, a friendship struck), call set_rapport.'
      ]),

    section(
      `What you remember of your time with ${player.name}`,
      memories.map((m) => {
        const then = toDate(content.calendar, m.time)
        return `- ${describeAge(content, m, state.time)} (${then.day} ${then.month.name}): ${m.summary}`
      })
    ),

    section('The scene', [
      `It is ${formatTime(date)} (${date.period.name}) on ${formatDate(date)}.`,
      weather &&
        describeWeather(weather, byCourier ? (whereabouts ? isIndoors(whereabouts, herView) : true) : owner !== undefined || isIndoors(location, view)),
      ...eventsOn(content, state).map((e) => `Today is ${e.name}. ${e.description}`.trim()),
      ...upcomingEvents(content, state, UPCOMING_EVENT_DAYS).map(({ event, inDays }) =>
        `${event.name} is ${inDays === 1 ? 'tomorrow' : `in ${inDays} days`}. ${event.description}`.trim()
      ),
      isBirthday && 'Today is your birthday.',
      byCourier
        ? `You are ${whereabouts ? `at ${whereabouts.name}` : 'in your own rooms'}; ${player.name} is elsewhere.`
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

    section(`What you know, and will tell ${player.name} if it comes up`, (input.npc?.knowledge ?? li.ai.knowledge).map((fact) => `- ${fact}`)),

    // Whoever he works for knows him as her employee, whatever else she is to him.
    section(`${player.name} as your employee`, jobFacts(content, state, li.id)),

    ...companions.map((c) =>
      section(
        `${c.name.split(' ')[0]} and children`,
        describePregnancy(content, state, c.id)
          .filter((line) => /^(You are carrying|Today the Bloom|You have borne)/.test(line))
          .map((line) => `Of ${c.name.split(' ')[0]}, in her own words: ${line}`)
      )
    ),

    section(`Messages you and ${player.name} have sent each other on Chats, oldest first`, notes),

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
                const has = wearableOutfits(content, state, c).map((o) => `${o.id} (${o.name})`).join(', ')
                const first = c.name.split(' ')[0]
                return `- ${first} is wearing "${worn?.id ?? c.defaultOutfitId}". She has: ${has}.${pregnantNote(c, first, 'is') ? ` ${pregnantNote(c, first, 'is')}` : ''}`
              })
            ]
          : [
              pregnantNote(li, 'You', 'are'),
              `You are wearing "${outfit?.id ?? li.defaultOutfitId}". When what you are wearing changes in the story, write [OUTFIT: id] on a line after your face:`,
              ...outfits.flatMap((o) => {
                // Pictures that are not one of the faces: something particular, to be asked for by name.
                const others = Object.entries(picturedOutfit(li.outfits, o).sprites).filter(([name, sprite]) => !(EXPRESSIONS as readonly string[]).includes(name) && sprite.description)
                return [
                  `- ${o.id} (${o.name}): ${o.id === outfit?.id ? 'what you have on now, described above' : outfitDescription(li.outfits, o) || 'no description'}`,
                  ...others.map(([name, sprite]) => `  - in place of a face, [EXPRESSION: ${name}] shows: ${sprite.description}`)
                ]
              }),
              ...(animations.length > 0
                ? [
                    look.animationId
                      ? `Animations replace your picture with a video. "${look.animationId}" is playing now:`
                      : 'Animations replace your picture with a video:',
                    ...animations.map((a) => `- ${a.id} (${a.name}, ${a.loop ? 'loops' : 'plays once'}): ${a.description || 'no description'}`),
                    'Write [ANIMATION: id] when the scene reaches what an animation shows. One that loops plays until you ' +
                      'write [ANIMATION: none], which you do as soon as it no longer matches; one that plays once ends by itself.'
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
        `The number is how much ${group ? 'she wants' : 'you want'} to be here right now: 5 at ease and glad of it, 4 fine, 3 wary or restless, 2 uneasy and wanting a way out, 1 wanting to leave now. ` +
          `The words are ${group ? 'her' : 'your'} own reason.`,
        group
          ? `Judge it for each woman as herself, from her nature and what she is to ${player.name} and to the others here: what he is asking of her, how hard he presses, ` +
            `what he and another of you are doing in front of her, and whether she has somewhere to be. A shy or guarded woman drops quickly, a jealous one when his attention is on someone else, a bold or easygoing one hardly at all. ` +
            `It can come back up when things ease.`
          : `Judge it as yourself, from your nature and what you are to ${player.name}: what he is asking of you, how hard he presses, what is going on around you, and whether you have somewhere to be. ` +
            `If you are shy or guarded it drops quickly under pressure; if you are bold or easygoing, hardly at all. It can come back up when he eases off.`,
        ...cast.map((c) => {
          const said = input.comfort?.[c.id]
          const who = group ? c.name.split(' ')[0] : 'You'
          const soon = classSoon(content, state, c.id, CLASS_SOON_HOURS)
          return [
            said ? `${who} last said ${said.level}${said.reason ? `: ${said.reason}` : ''}.` : group ? `${who} has not said yet.` : '',
            soon && `${who} ${group ? 'has' : 'have'} ${soon.course.number} at ${String(soon.startHour).padStart(2, '0')}:00, ${soon.inHours === 1 ? 'within the hour' : `in ${soon.inHours} hours`}, and will have to go to it: let that pull ${group ? 'hers' : 'yours'} down as it gets near.`
          ]
            .filter(Boolean)
            .join(' ')
        }),
        group
          ? `Act on it. At 3 she lets it show. At 2 she says so or changes the subject, and looks for a way to go. At 1, or at 2 twice running with nothing better, she leaves: ` +
            `call leave_scene for her, with how she feels, and write her going in her own way; the scene goes on with whoever stays. If it is all of you, end the scene instead. ` +
            `Leaving is hers to decide: she does not need ${player.name}'s leave for it, and she may go gladly, tactfully, hurt or angry.`
          : `Act on it. At 3, let it show. At 2, say so or change the subject, and look for a way to go. At 1, or at 2 twice running with nothing better, leave: ` +
            `make your excuse in your own way and end the scene. Leaving is yours to decide: you do not need ${player.name}'s leave for it, and having somewhere to be is reason enough to go warmly.`,
        'Nobody sees these lines. Never mention them, and never give the number in what is said.'
      ]),

    !byCourier &&
      !isNpc &&
      cast.some((c) => !hasContact(state, c.id)) &&
      section(
        'Chats',
        cast
          .filter((c) => !hasContact(state, c.id))
          .map((c) => {
            const who = group ? c.name.split(' ')[0] : 'You'
            return offersContact(content, state, c.id)
              ? `${who} ${group ? 'is' : 'are'} taken enough with ${player.name} to want him to have ${group ? 'her' : 'your'} Chats: offer it unasked at a natural moment in this scene.`
              : `${who} ${group ? 'does' : 'do'} not offer ${player.name} ${group ? 'her' : 'your'} Chats unasked.`
          })
      ),

    !byCourier &&
      sceneBeats.length > 0 &&
      fertile.length > 0 &&
      section('Conception', [
        `${player.name} is a True Sire: when he spends himself inside a woman, the Bloom may lock in and leave her with child.`,
        group
          ? `If that happens in your reply, write [SEEDED: name] on a line of its own at the end of the reply, ` +
            `once for each woman it happened to (${firstNames(content, fertile.map((c) => c.id))}).`
          : `If that happens in your reply, write ${SEEDED_TAG} on a line of its own at the end of the reply.`,
        'Write it only for that, at most once a reply for each woman, and never mention it. The game decides what comes of it; ' +
          'do not say whether she has conceived unless these instructions tell you she has.'
      ]),

    !byCourier &&
      !isNpc &&
      sceneBeats.length > 0 &&
      section('Moving on, and time passing', [
        `Where you are and what time it is are kept by the game, and time moves only when the scene does. Never write that ` +
          `you and ${player.name} have gone somewhere else, or that hours have gone by, without calling move_scene for it.`
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
      ? 'Reminder: write only the message, one to three short sentences.'
      : (look && !isNpc ? `Reminder: begin with the [EXPRESSION] and [COMFORT] lines${group ? ', one of each for each of you' : ''}. Then ` : 'Reminder: ') +
        `${REPLY_LINES} short lines, one beat per line, under ${REPLY_WORDS} words in all.` +
      (named ? ` Every spoken line starts with the speaker's first name and a colon.` : '')
  ]

  return sections.filter((s): s is string => typeof s === 'string' && s.length > 0).join('\n\n')
}
