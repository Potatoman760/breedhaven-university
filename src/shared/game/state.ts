import { ExpeditionStateSchema, HousingStateSchema, type ContentPack, type GameState } from '../model'
import { startingCourses } from './catalogue'
import { assignRapport } from './rapport'

export function createInitialState(
  content: ContentPack,
  playerName?: string,
  weatherSeed = 0,
  /** The stats he rolled for himself. Left out, he has the content's own. */
  stats?: Record<string, number>,
  /** What the player added to who he is when the game began. */
  about = ''
): GameState {
  const { player, locationId } = content.newGame
  // Those he knows already: met, and able to be messaged, from the first day.
  const known = content.loveInterests.filter((li) => li.startsAt).map((li) => li.id)
  return {
    time: 0,
    weatherSeed,
    locationId,
    player: { ...player, name: playerName?.trim() || player.name, stats: stats ? { ...player.stats, ...stats } : player.stats, about: about.trim() },
    relationships: Object.fromEntries(
      content.loveInterests.map((li) => [li.id, li.startsAt ? { ...li.startsAt } : { affection: 0, trust: 0, desire: 0 }])
    ),
    flags: {},
    unlockedCodexIds: [],
    memories: {},
    appointments: [],
    courses: startingCourses(content),
    enrolment: null,
    attendance: {},
    societies: [],
    societyMeetings: [],
    training: {},
    trainedOn: { day: -1, points: {} },
    coursePoints: {},
    grades: {},
    inventory: {},
    pregnancies: {},
    children: [],
    orientationStep: 0,
    bonds: [],
    ties: {},
    rapport: assignRapport(content, weatherSeed),
    seenTogether: [],
    revealed: {},
    courier: {},
    groupChats: {},
    job: null,
    formerJobs: [],
    met: known,
    contacts: [...known],
    courierDay: -1,
    feed: [],
    feedDay: -1,
    inOwnRoom: false,
    eventGoers: {},
    partsAttended: [],
    trips: {},
    timesIntimate: {},
    skillsTold: [],
    boons: [],
    abilityUsed: {},
    offBirthControl: [],
    threesomes: 0,
    feedPlans: [],
    feedSeen: -1,
    dramaDay: -1,
    events: [],
    housing: HousingStateSchema.parse({}),
    expedition: ExpeditionStateSchema.parse({})
  }
}

/**
 * Gives a loaded save a fresh relationship with any love interest it has not met: one
 * added in the character editor since the game was started.
 */
export function reconcileState(state: GameState, content: ContentPack): GameState {
  return { ...state, relationships: { ...createInitialState(content).relationships, ...state.relationships } }
}
