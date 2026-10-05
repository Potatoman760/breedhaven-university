import { proposeMeeting } from '../../shared/game/appointments'
import { bondOf, canBond, describeBond, END_BOND, statusOf } from '../../shared/game/bonds'
import { MAX_SCENE_CAST, type BondProposal, type ContentPack, type GameState, type Proposal } from '../../shared/model'
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
  onProposal: (proposal: Proposal) => void
): LlmTool {
  const player = state.player.name
  const others = content.loveInterests.filter((li) => li.id !== loveInterestId)
  return {
    name: 'propose_meeting',
    description:
      `Find a time to meet ${player} later. Call this whenever you or ${player} want to meet ` +
      `up another time: to study, for a meal or a drink, on a date, or for anything else. ` +
      `It checks everyone's timetables and returns the day and time you are all free. ` +
      `Never invent a day or time yourself; call this, then suggest exactly what it returns. ` +
      `Do not call it for something happening right now.`,
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
          description: `Where to meet. ${content.locations.map((l) => `${l.id}: ${l.name}`).join('; ')}.`
        },
        earliest: {
          type: 'string',
          enum: ['today', 'tomorrow', 'later this week', 'the weekend'],
          description: 'How soon. Leave out for the first time that works.'
        },
        with: {
          type: 'array',
          maxItems: MAX_SCENE_CAST - 1,
          items: { type: 'string', enum: others.map((li) => li.id) },
          description:
            `Other people to bring along, when a group was asked for or you want company. ` +
            `Leave out to meet ${player} alone. ${others.map((li) => `${li.id}: ${li.name}`).join('; ')}.`
        },
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
      const { proposal, message } = proposeMeeting(content, state, loveInterestId, {
        activity: text(args['activity']) ?? '',
        place: text(args['place']) ?? '',
        earliest: text(args['earliest']),
        timeOfDay: text(args['time_of_day']),
        with: Array.isArray(args['with']) ? args['with'].filter((id): id is string => typeof id === 'string') : undefined
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
  onProposal: (proposal: BondProposal) => void
): LlmTool {
  const player = state.player.name
  const others = content.loveInterests.filter((li) => li.id !== loveInterestId)
  const { statuses } = content.relationships
  const current = statusOf(content, bondOf(state, loveInterestId))
  return {
    name: 'propose_relationship',
    description:
      `Ask ${player} to change what you are to each other. Call this only when the two of you ` +
      `(or the three of you) have talked your way to it and you are ready to ask outright, ` +
      `or when you have decided to end things. It checks whether it is possible yet and ` +
      `tells you what to say. ${player} then accepts or declines. Never declare a relationship ` +
      `changed without calling this. Right now you are: ${current?.name ?? 'nothing agreed'}. The kinds: ` +
      statuses.map((s) => `${s.id}: ${s.name}. ${s.description}`).join(' ') +
      ` ${END_BOND}: end what you have.`,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...statuses.map((s) => s.id), END_BOND] },
        with: {
          type: 'array',
          maxItems: MAX_SCENE_CAST - 1,
          items: { type: 'string', enum: others.map((li) => li.id) },
          description:
            `For an arrangement of three, the other person in it. Leave out otherwise. ` +
            `${others.map((li) => `${li.id}: ${li.name}`).join('; ')}.`
        }
      },
      required: ['status']
    },
    run(args) {
      const also = Array.isArray(args['with']) ? args['with'].filter((id): id is string => typeof id === 'string') : []
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
