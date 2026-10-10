import { proposeMeeting } from '../../shared/game/appointments'
import { bondOf, canBond, describeBond, END_BOND, statusOf } from '../../shared/game/bonds'
import { MAX_SCENE_CAST, type BondProposal, type ContentPack, type DepartureFeeling, type GameState, type Proposal, type Scene } from '../../shared/model'
import { moveClash, sharedUpcoming, type Upcoming } from '../../shared/game/upcoming'
import { shiftLaterToday } from '../../shared/game/jobs'
import { hiddenFacts } from '../../shared/game/facts'
import { firstNames, leavers, sceneCast } from '../../shared/game/scene'
import { formatTime, toDate } from '../../shared/game/calendar'
import {
  findDestination,
  MAX_SCENE_HOURS,
  moveState,
  passSceneTime,
  sceneDestinations,
  sceneHours,
  type Destination
} from '../../shared/game/sceneMoves'
import { weatherOn } from '../../shared/game/weather'
import type { LlmTool } from './openai'

/**
 * Lets a character arrange to meet the player later. The game, not the model, picks the
 * time: the first slot both are free and the place is open. `onProposal` receives the
 * plan so the player can be asked to accept it.
 */
export function meetingTool(
  content: ContentPack,
  state: GameState,
  loveInterestId: string,
  onProposal: (proposal: Proposal) => void,
  /** Who is in the scene. Only they can be asked along; by message, where nobody else is there, nobody can. */
  presentIds: string[] = [],
  /** The place the scene has gone to in this same reply, if it has moved: a plan for there is not made. */
  movedTo?: () => string | undefined
): LlmTool {
  const player = state.player.name
  const others = presentIds.filter((id) => id !== loveInterestId && content.loveInterests.some((li) => li.id === id))
  // Face to face there is also the going somewhere now, which is another tool's; by message this is the only way anything is arranged.
  const together = presentIds.length > 0
  return {
    name: 'propose_meeting',
    description:
      `Find a time to meet ${player} later. Call this whenever you or ${player} want to meet ` +
      `up another time: to study, for a meal or a drink, on a date, or for anything else. ` +
      `It checks everyone's timetables and returns the day and time you are all free. ` +
      `Never invent a day or time yourself; call this, then suggest exactly what it returns. ` +
      (together
        ? `It is for another time only: it books something on the calendar and nobody goes anywhere. ` +
          `For going somewhere together right now, call move_scene and not this. They are never both called for the same thing: ` +
          `"let's go and get a coffee" is move_scene alone, "coffee on Friday?" is this alone.`
        : `You are writing to each other, not together, so this is the only way anything is arranged: call it for any meeting, ` +
          `whether for later today ("come over now", "see you in an hour": ask for "today") or for another day. ` +
          `Agreeing to meet without calling it puts nothing on ${player}'s calendar.`),
    parameters: {
      type: 'object',
      properties: {
        activity: {
          type: 'string',
          description: 'What you would do together, in a few words: "study for the Statecraft exam", "dinner", "a walk".'
        },
        place: {
          type: 'string',
          enum: content.locations.map((l) => l.id),
          description: 'Where to meet.'
        },
        earliest: {
          type: 'string',
          enum: ['today', 'tomorrow', 'later this week', 'the weekend', 'next week'],
          description: 'How soon. Leave out for the first time that works, which may be today. For "next week", say so here: nothing before the next week begins is offered.'
        },
        weekday: {
          type: 'string',
          enum: content.calendar.weekdays,
          description: 'A day of the week, when one was named. With "next week" it is that day next week; alone, the next such day, which may be today.'
        },
        ...(others.length > 0
          ? {
              with: {
                type: 'array',
                maxItems: MAX_SCENE_CAST - 1,
                items: { type: 'string', enum: others },
                description: `Who else here comes too, when a group was asked for. Leave out to meet ${player} alone.`
              }
            }
          : {}),
        time_of_day: {
          type: 'string',
          enum: content.calendar.periods.map((p) => p.name.toLowerCase()),
          description: 'Leave out unless a particular time of day was asked for.'
        }
      },
      required: ['activity', 'place']
    },
    run(args) {
      const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
      // Going there now is the move itself: a plan for the place the scene has just gone to is the same thing asked for twice.
      const gone = movedTo?.()
      if (gone !== undefined && gone === text(args['place'])) {
        const where = content.locations.find((l) => l.id === gone)?.name ?? gone
        return `You have just gone to ${where} with move_scene, and that is all it takes: you are there now. Nothing was put in the calendar. Call this only for another time.`
      }
      const { proposal, message } = proposeMeeting(content, state, loveInterestId, {
        activity: text(args['activity']) ?? '',
        place: text(args['place']) ?? '',
        earliest: text(args['earliest']),
        weekday: text(args['weekday']),
        timeOfDay: text(args['time_of_day']),
        with: Array.isArray(args['with']) ? args['with'].filter((id): id is string => typeof id === 'string' && others.includes(id)) : undefined
      })
      if (proposal) onProposal(proposal)
      return message
    }
  }
}

/**
 * Lets a character ask to change what they and the player are to each other: become a
 * couple, open things up, bring a third in, or end it. The game checks it is possible;
 * `onProposal` receives it so the player can be asked.
 */
export function relationshipTool(
  content: ContentPack,
  state: GameState,
  loveInterestId: string,
  onProposal: (proposal: BondProposal) => void,
  /** Who is in the scene. An arrangement of three can only be asked for with someone who is there to agree to it. */
  presentIds: string[] = []
): LlmTool {
  const player = state.player.name
  const others = presentIds.filter((id) => id !== loveInterestId && content.loveInterests.some((li) => li.id === id))
  const { statuses } = content.relationships
  const current = statusOf(content, bondOf(state, loveInterestId))
  return {
    name: 'propose_relationship',
    description:
      `Ask ${player} to change what you are to each other. Call this only when the two of you ` +
      `(or the three of you) have talked your way to it and you are ready to ask outright, ` +
      `or when you have decided to end things. How long you have known him does not stand in the way: if you mean it, ask. ` +
      `It checks only that nothing already promised forbids it, and tells you what to say. ${player} then accepts or declines. Never declare a relationship ` +
      `changed without calling this. Right now you are: ${current?.name ?? 'nothing agreed'}. The kinds: ` +
      statuses.map((s) => `${s.id}: ${s.name}. ${s.description}`).join(' ') +
      ` ${END_BOND}: end what you have.`,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...statuses.map((s) => s.id), END_BOND] },
        ...(others.length > 0
          ? {
              with: {
                type: 'array',
                maxItems: MAX_SCENE_CAST - 1,
                items: { type: 'string', enum: others },
                description: 'For an arrangement of three, the other person in it. Leave out otherwise.'
              }
            }
          : {})
      },
      required: ['status']
    },
    run(args) {
      const also = Array.isArray(args['with']) ? args['with'].filter((id): id is string => typeof id === 'string' && others.includes(id)) : []
      const statusId = typeof args['status'] === 'string' ? args['status'].trim().toLowerCase() : ''
      if (statusId === END_BOND) {
        if (!bondOf(state, loveInterestId)) return `You and ${player} have nothing agreed between you to end.`
        onProposal({ statusId: END_BOND, memberIds: [loveInterestId] })
        return `Tell ${player} plainly, in character, that you want to end what you have. ${player} will answer.`
      }
      const proposal = { statusId, memberIds: [loveInterestId, ...also] }
      const check = canBond(content, state, proposal)
      if (!check.ok) {
        return `Not yet: ${check.reasons.join('; ')}. Do not ask for it now. Say, in character, why it is too soon or what stands in the way.`
      }
      onProposal(proposal)
      return (
        `It is possible: ${describeBond(content, proposal).replace(/ with .*/, '')}. ` +
        `${statusOf(content, proposal)?.description ?? ''} Ask ${player} for exactly this, plainly and in character. ${player} will accept or decline.`
      )
    }
  }
}

/** The place the move tool offers for setting off together to the next thing on his timetable. */
export const NEXT_EVENT = 'next-event'

/**
 * Lets the characters take a scene somewhere else with the player: one of the places open
 * now, or one of their own rooms. The choice is from a fixed list, so the scene can only go
 * somewhere real. It is also the only way time passes in a scene: going somewhere takes none, and
 * with it any hours the characters say they stayed on before leaving. Returns undefined when
 * there is nowhere to go. `onMove` receives where, and those hours.
 */
export function moveTool(
  content: ContentPack,
  state: GameState,
  scene: Scene,
  onMove: (destination: Destination, hours: number, stayingIds: string[]) => void,
  /** Told when they set off together for the next thing on his timetable that some of them are in too: this scene ends, and that begins. */
  onEvent?: (next: Upcoming, withIds: string[]) => void
): LlmTool | undefined {
  const destinations = sceneDestinations(content, state, scene)
  const cast = sceneCast(scene)
  const group = cast.length > 1
  // His next class or plan today, when someone here is in it too: somewhere they can go together, which is going to it.
  const shared = onEvent && !scene.npc ? sharedUpcoming(content, state, cast) : undefined
  if (destinations.length === 0 && !shared) return undefined
  const sharedPlace = shared && (content.locations.find((l) => l.id === shared.next.locationId)?.name ?? shared.next.locationId)
  const player = state.player.name
  const doing = scene.beats.at(-1)?.activityName
  const soFar = sceneHours(state, scene)
  return {
    name: 'move_scene',
    description:
      `Take the scene somewhere else, right now: you and ${player} leave here together and go there. ` +
      `It is for going at once only. For meeting another time, later today or another day, call propose_meeting and not this. ` +
      `They are never both called for the same thing: going there now is this alone, and needs no plan made for it. ` +
      `Call it when what you are doing here is finished or you both decide to leave: the class is over and ` +
      `you walk back to your room, the meal is done, you want somewhere quieter. It ends ` +
      `${doing ? `"${doing}"` : 'what you were doing'} here. It moves you and ${player} only: you cannot send ` +
      `${player} off alone or bring anyone who is not already with you. ` +
      (group
        ? `Everyone in the scene comes along unless you name who stays behind in "staying": when ${player} leaves with ` +
          `only one or some of you ("I leave with Ana"), call this and name every one of the others there. ` +
          `Whoever stays behind is out of the scene from then on and you stop writing for her. `
        : '') +
      `Call it before you write the reply, ` +
      `then write the two of you leaving and arriving. Never say you have gone somewhere without calling it. ` +
      `This is also the only way time passes: the clock stands still while you stay here` +
      `${soFar === undefined ? '' : ` (${soFar} hour${soFar === 1 ? '' : 's'} counted so far)`}, and moves on when you leave.` +
      destinations
        .filter((d) => d.id.startsWith('room-of-'))
        .map((d) => ` ${d.id} is ${d.name}.`)
        .join('') +
      (shared
        ? ` ${NEXT_EVENT} is ${shared.next.title} at ${formatTime(toDate(content.calendar, shared.next.time))} at ${sharedPlace}, which ${player} has next and ${firstNames(content, shared.sharedBy)} ${shared.sharedBy.length > 1 ? 'are' : 'is'} in too: ` +
          `choose it when you set off for it together ("shall we walk to class?"). That ends this scene as you leave, lets the time until it starts go by, and the next scene is ${shared.next.kind === 'class' ? 'the class' : 'the plan'} itself. Give no hours with it.`
        : ''),
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', enum: [...destinations.map((d) => d.id), ...(shared ? [NEXT_EVENT] : [])], description: 'Where to go.' },
        hours: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_SCENE_HOURS,
          description:
            'Whole hours you stayed on here beyond the time already counted, before leaving: a meal that ran long, an afternoon of study, the night. ' +
            'Leave out when you leave on time.'
        },
        ...(group
          ? {
              staying: {
                type: 'array',
                maxItems: cast.length - 1,
                items: { type: 'string', enum: cast },
                description: `Who does not come along and is left behind here, out of the scene. Leave out when everyone goes. Whoever ${player} is leaving with is never named here.`
              }
            }
          : {})
      },
      required: ['place']
    },
    run(args) {
      const asked = typeof args['place'] === 'string' ? args['place'] : ''
      if (shared && asked.trim().toLowerCase() === NEXT_EVENT) {
        onEvent?.(shared.next, shared.sharedBy)
        return (
          `You and ${player} set off for ${shared.next.title} at ${sharedPlace}. Write the two of you leaving here and the walk there, in character, and stop as you arrive: ` +
          `this scene ends there, and ${shared.next.kind === 'class' ? 'the class' : 'what you came for'} is the next one. Write nothing of it yet.`
        )
      }
      const destination = findDestination(destinations, asked)
      if (!destination) {
        return `You cannot go to "${asked}". Stay where you are, and choose only from: ${[...destinations.map((d) => d.id), ...(shared ? [NEXT_EVENT] : [])].join(', ')}.`
      }
      const asHours = Math.floor(Number(args['hours'] ?? 0))
      const before = Number.isFinite(asHours) && asHours >= 1 ? passSceneTime(content, state, asHours) : state
      const stayed = before.time - state.time
      // His own timetable comes first: a move that would have him elsewhere when a class, a shift or a plan of his starts is refused,
      // and the reply is written knowing why.
      const clash = moveClash(content, state, before.time, destination.locationId)
      if (clash) {
        const where = content.locations.find((l) => l.id === clash.locationId)
        const wait = clash.time - state.time
        const there = destinations.find((d) => d.locationId === clash.locationId && d.roomOf === undefined)
        return (
          `You cannot go to ${destination.name} now: ${player} has ${clash.title} at ${formatTime(toDate(content.calendar, clash.time))}` +
          `${where ? ` at ${where.name}` : ''}, ${wait <= 1 ? 'within the hour' : `in ${wait} hours`}, and has to be there. Nothing has moved and no time has passed. ` +
          `Stay where you are and write your reply knowing it: say that he has to go soon, and do not write the two of you leaving for anywhere else. ` +
          (there ? `You may walk him to it instead, by calling this again with "${there.id}".` : 'Wind things up here, or part and make a plan for later.')
        )
      }
      const named = Array.isArray(args['staying']) ? args['staying'].filter((id): id is string => typeof id === 'string').map((id) => id.trim().toLowerCase()) : []
      // Someone has to come along: a list that names everyone is not acted on.
      const behind = leavers(scene, named)
      onMove(destination, stayed, behind)
      const there = moveState(before, destination)
      const weather = weatherOn(content, there)
      return (
        `${stayed > 0 ? `${stayed} more hour${stayed === 1 ? '' : 's'} pass${stayed === 1 ? 'es' : ''} here first. ` : ''}You and ${player} go to ${destination.name}. ` +
        `It is ${formatTime(toDate(content.calendar, there.time))} when you get there. ` +
        `It is ${destination.indoors ? 'indoors' : 'out of doors'}` +
        `${weather ? `, and the weather is: ${weather.name}` : ''}. ` +
        `${doing ? `"${doing}" is over. ` : ''}` +
        (behind.length > 0 ? `${firstNames(content, behind)} stay${behind.length === 1 ? 's' : ''} behind and ${behind.length === 1 ? 'is' : 'are'} out of the scene: give ${behind.length === 1 ? 'her' : 'them'} a last line as you go, and no more after it. ` : '') +
        `Write leaving and arriving, in character.`
      )
    }
  }
}

/** Who left a scene, how they felt about it, and why. */
export interface Leaving {
  ids: string[]
  feeling: DepartureFeeling
  reason: string
}

/** Something a love interest has just let the player know about herself. */
export interface Revelation {
  loveInterestId: string
  factId: string
}

/**
 * Lets the characters mark what the player has just found out about them. Each love
 * interest's file holds things about her the player does not start out knowing: what she
 * likes and dislikes, her nature, what draws her, where she lives. When one comes out in
 * what she says or does, the LLM names it from a fixed list and it goes into the player's
 * record of her. Returns undefined when there is nothing left to find out.
 */
export function revealTool(
  content: ContentPack,
  state: GameState,
  loveInterestIds: string[],
  onReveal: (revelation: Revelation) => void
): LlmTool | undefined {
  const options = loveInterestIds.flatMap((id) => {
    const li = content.loveInterests.find((c) => c.id === id)
    return li ? hiddenFacts(content, state, li).map((fact) => ({ key: `${id}/${fact.id}`, loveInterestId: id, fact })) : []
  })
  if (options.length === 0) return undefined
  const player = state.player.name
  const secrets = options.filter((o) => o.fact.group === 'secrets')
  return {
    name: 'reveal_fact',
    description:
      `Record that ${player} has just learned something about you. Below are things ${player} does not yet ` +
      `know. When your reply plainly tells or shows him one of them (he asks whether you like tea and you say ` +
      `you prefer coffee; you mention what you study; your temper shows), call this with it, as well as writing ` +
      `the reply. Only for what really comes out in this reply: do not volunteer things just to record them, ` +
      `and never read the list out. Each is named for what it is` +
      (secrets.length > 0 ? `, but for these: ${secrets.map((o) => `${o.key} = ${o.fact.telling}`).join('; ')}.` : '.'),
    parameters: {
      type: 'object',
      properties: {
        facts: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', enum: options.map((o) => o.key) },
          description: 'What came out in this reply.'
        }
      },
      required: ['facts']
    },
    run(args) {
      const asked = Array.isArray(args['facts']) ? args['facts'].filter((key): key is string => typeof key === 'string') : []
      const found = options.filter((o) => asked.some((key) => key.trim().toLowerCase() === o.key.toLowerCase()))
      if (found.length === 0) return 'None of those is on the list. Nothing was recorded; carry on with your reply.'
      for (const o of found) onReveal({ loveInterestId: o.loveInterestId, factId: o.fact.id })
      return `Recorded: ${found.map((o) => o.fact.telling).join('; ')}. Make sure your reply does say so, in character.`
    }
  }
}

/**
 * Lets the player's boss record that he has told her he cannot make today's shift. Offered
 * only to her, and only while he has a shift that day which has not started; undefined
 * otherwise. `onExcuse` receives the shift.
 */
export function excuseTool(content: ContentPack, state: GameState, npcId: string, onExcuse: (key: string) => void): LlmTool | undefined {
  const due = shiftLaterToday(content, state)
  if (!due || due.job.bossId !== npcId) return undefined
  const player = state.player.name
  const at = `${String(due.shift.startHour).padStart(2, '0')}:00`
  return {
    name: 'excuse_shift',
    description:
      `Record that ${player} has told you he cannot come to his shift today at ${at}. Call it when his message says he will not ` +
      `make it, whatever the reason (ill, an exam, something came up) and whatever you think of the excuse: being told beforehand is what ` +
      `counts. It then costs him half a strike in place of a whole one. Not for anything else: not for being late, not for another day, ` +
      `and not if he has only asked a question about his shifts.`,
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'What he gave as his reason, in a few words.' } }
    },
    run() {
      onExcuse(due.key)
      return `Recorded: ${player} will miss today's ${at} shift and has told you so. It counts as half a strike. Answer him in character.`
    }
  }
}
