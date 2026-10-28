import { proposeMeeting } from '../../shared/game/appointments'
import { bondName, bondOf, canBond, END_BOND, statusOf } from '../../shared/game/bonds'
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
import { t } from '../../shared/i18n'
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
  // With two or more love interests here, whichever of them the plan is made with says so: it is not the scene's lead's by default.
  const cast = presentIds.filter((id) => content.loveInterests.some((li) => li.id === id))
  const others = cast.filter((id) => id !== loveInterestId)
  // Face to face there is also the going somewhere now, which is another tool's; by message this is the only way anything is arranged.
  const together = presentIds.length > 0
  return {
    name: 'propose_meeting',
    description: t('llm.tools.meeting', { player, together, move: 'move_scene', today: '"today"' }),
    parameters: {
      type: 'object',
      properties: {
        activity: {
          type: 'string',
          description: t('llm.tools.meetingActivity')
        },
        place: {
          type: 'string',
          enum: content.locations.map((l) => l.id),
          description: t('llm.tools.meetingPlace')
        },
        earliest: {
          type: 'string',
          enum: ['today', 'tomorrow', 'later this week', 'the weekend', 'next week'],
          description: t('llm.tools.meetingEarliest', { nextWeek: '"next week"' })
        },
        weekday: {
          type: 'string',
          enum: content.calendar.weekdays,
          description: t('llm.tools.meetingWeekday', { nextWeek: '"next week"' })
        },
        ...(others.length > 0
          ? {
              who: {
                type: 'string',
                enum: cast,
                description: t('llm.tools.meetingWho', { player })
              },
              with: {
                type: 'array',
                maxItems: MAX_SCENE_CAST - 1,
                items: { type: 'string', enum: cast },
                description: t('llm.tools.meetingWith', { player })
              }
            }
          : {}),
        time_of_day: {
          type: 'string',
          enum: content.calendar.periods.map((p) => p.name.toLowerCase()),
          description: t('llm.tools.meetingTimeOfDay')
        }
      },
      required: others.length > 0 ? ['activity', 'place', 'who'] : ['activity', 'place']
    },
    run(args) {
      const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
      const who = cast.find((id) => id === text(args['who'])) ?? loveInterestId
      // Going there now is the move itself: a plan for the place the scene has just gone to is the same thing asked for twice.
      const gone = movedTo?.()
      if (gone !== undefined && gone === text(args['place'])) {
        const where = content.locations.find((l) => l.id === gone)?.name ?? gone
        return t('llm.tools.meetingMoved', { place: where, move: 'move_scene' })
      }
      const { proposal, message } = proposeMeeting(content, state, who, {
        activity: text(args['activity']) ?? '',
        place: text(args['place']) ?? '',
        earliest: text(args['earliest']),
        weekday: text(args['weekday']),
        timeOfDay: text(args['time_of_day']),
        with: Array.isArray(args['with']) ? args['with'].filter((id): id is string => typeof id === 'string' && id !== who && cast.includes(id)) : undefined,
        named: others.length > 0
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
    description: t('llm.tools.relationship', {
      player,
      current: current?.name ?? t('llm.tools.nothingAgreed'),
      kinds: statuses.map((s) => `${s.id}: ${s.name}. ${s.description}`).join(' '),
      end: END_BOND
    }),
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
                description: t('llm.tools.relationshipWith')
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
        if (!bondOf(state, loveInterestId)) return t('llm.tools.nothingToEnd', { player })
        onProposal({ statusId: END_BOND, memberIds: [loveInterestId] })
        return t('llm.tools.endIt', { player })
      }
      const proposal = { statusId, memberIds: [loveInterestId, ...also] }
      const check = canBond(content, state, proposal)
      if (!check.ok) {
        return t('llm.tools.notYet', { reasons: check.reasons.join('; ') })
      }
      onProposal(proposal)
      return t('llm.tools.possible', {
        bond: bondName(content, proposal),
        description: statusOf(content, proposal)?.description ?? '',
        player
      })
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
      t('llm.tools.move', {
        player,
        meeting: 'propose_meeting',
        doing: doing ? t('llm.tools.moveDoing', { doing }) : t('llm.tools.moveWhatYouWereDoing'),
        group,
        staying: '"staying"',
        counted: soFar === undefined ? '' : t('llm.tools.moveCounted', { hours: soFar })
      }) +
      destinations
        .filter((d) => d.id.startsWith('room-of-'))
        .map((d) => t('llm.tools.moveRoom', { id: d.id, name: d.name }))
        .join('') +
      (shared
        ? t('llm.tools.moveShared', {
            next: NEXT_EVENT,
            title: shared.next.title,
            time: formatTime(toDate(content.calendar, shared.next.time)),
            place: sharedPlace,
            player,
            names: firstNames(content, shared.sharedBy),
            many: shared.sharedBy.length > 1,
            kind: shared.next.kind
          })
        : ''),
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', enum: [...destinations.map((d) => d.id), ...(shared ? [NEXT_EVENT] : [])], description: t('llm.tools.movePlace') },
        hours: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_SCENE_HOURS,
          description: t('llm.tools.moveHours')
        },
        ...(group
          ? {
              staying: {
                type: 'array',
                maxItems: cast.length - 1,
                items: { type: 'string', enum: cast },
                description: t('llm.tools.moveStaying', { player })
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
        return t('llm.tools.moveToEvent', { player, title: shared.next.title, place: sharedPlace, kind: shared.next.kind })
      }
      const destination = findDestination(destinations, asked)
      if (!destination) {
        return t('llm.tools.moveNowhere', { asked, places: [...destinations.map((d) => d.id), ...(shared ? [NEXT_EVENT] : [])].join(', ') })
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
        return t('llm.tools.moveClash', {
          place: destination.name,
          player,
          title: clash.title,
          time: formatTime(toDate(content.calendar, clash.time)),
          at: where !== undefined,
          where: where?.name,
          soon: wait <= 1,
          wait,
          then: there ? t('llm.tools.moveWalkHim', { id: there.id }) : t('llm.tools.moveWindUp')
        })
      }
      const named = Array.isArray(args['staying']) ? args['staying'].filter((id): id is string => typeof id === 'string').map((id) => id.trim().toLowerCase()) : []
      // Someone has to come along: a list that names everyone is not acted on.
      const behind = leavers(scene, named)
      onMove(destination, stayed, behind)
      const there = moveState(before, destination)
      const weather = weatherOn(content, there)
      return t('llm.tools.moved', {
        stayed: stayed > 0 ? t('llm.tools.moveStayed', { hours: stayed }) : '',
        player,
        place: destination.name,
        time: formatTime(toDate(content.calendar, there.time)),
        indoors: Boolean(destination.indoors),
        hasWeather: weather !== undefined,
        weather: weather?.name,
        over: doing ? t('llm.tools.moveOver', { doing }) : '',
        behind: behind.length > 0 ? t('llm.tools.moveBehind', { names: firstNames(content, behind), one: behind.length === 1 }) : ''
      })
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
    description: t('llm.tools.reveal', {
      player,
      hasSecrets: secrets.length > 0,
      secrets: secrets.map((o) => `${o.key} = ${o.fact.telling}`).join('; ')
    }),
    parameters: {
      type: 'object',
      properties: {
        facts: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', enum: options.map((o) => o.key) },
          description: t('llm.tools.revealFacts')
        }
      },
      required: ['facts']
    },
    run(args) {
      const asked = Array.isArray(args['facts']) ? args['facts'].filter((key): key is string => typeof key === 'string') : []
      const found = options.filter((o) => asked.some((key) => key.trim().toLowerCase() === o.key.toLowerCase()))
      if (found.length === 0) return t('llm.tools.revealNone')
      for (const o of found) onReveal({ loveInterestId: o.loveInterestId, factId: o.fact.id })
      return t('llm.tools.revealed', { facts: found.map((o) => o.fact.telling).join('; ') })
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
    description: t('llm.tools.excuse', { player, at }),
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: t('llm.tools.excuseReason') } }
    },
    run() {
      onExcuse(due.key)
      return t('llm.tools.excused', { player, at })
    }
  }
}
