import { kindOf, type ContentPack, type GameState, type Intro, type OrientationStep, type Scene } from '../model'
import { toDate } from './calendar'
import { courseMembers } from './courses'
import { sceneBaseline } from './scene'

// How many love interests the player meets at one step: one, so that the first day introduces them slowly.
const MET_AT_A_STEP = 1

/** Whether the time (now, by default) falls on orientation day. There are no classes on it. */
export function isOrientationDay(content: ContentPack, state: GameState, time = state.time): boolean {
  return content.orientation !== undefined && toDate(content.calendar, time).dayIndex === content.orientation.day - 1
}

/**
 * The part of orientation the player has to attend next, if any is left. Once its day has
 * passed, whatever was missed is let go.
 */
export function orientationStep(content: ContentPack, state: GameState): OrientationStep | undefined {
  if (!isOrientationDay(content, state)) return undefined
  return content.orientation?.steps[state.orientationStep]
}

/**
 * Who the player is thrown together with at each step: one student love interest, so that he is
 * introduced to people one at a time. Orientation is there for those he would not otherwise
 * run into: only someone he shares no class with is dealt out, one to a step. Classmates
 * are left for class, and whoever is left over is met some other way. A step that names
 * its own keeps every one it names who is a student: a story beat can bring two together.
 */
export function orientationCasts(content: ContentPack, state: GameState): string[][] {
  const steps = content.orientation?.steps ?? []
  const mine = state.courses.filter((c) => state.enrolment?.includes(c.id))
  const classmate = (id: string) => mine.some((c) => courseMembers(c).includes(id))
  const named = new Set(steps.flatMap((step) => step.castIds ?? []))
  // Orientation is for the new intake: only fellow students are there to be met, not teachers or people from outside.
  const students = content.loveInterests.filter((li) => kindOf(li) === 'student').map((li) => li.id)
  const strangers = students.filter((id) => !named.has(id) && !classmate(id))
  const casts = steps.map((step) => (step.castIds ?? []).filter((id) => students.includes(id)))
  // One to each open step in turn. Anyone left when every step has someone is met some other way.
  const open = steps.map((_step, i) => i).filter((i) => (steps[i].castIds ?? []).length === 0)
  for (let turn = 0; strangers.length > 0 && turn < MET_AT_A_STEP; turn++) {
    for (const i of open) {
      const next = strangers.shift()
      if (next === undefined) break
      casts[i].push(next)
    }
  }
  return casts
}

/**
 * Attends the next step: the player is taken there, at its hour if he is early, and it
 * lasts as long as it lasts. With anyone to meet, it is a scene with them; with nobody, it
 * only passes the time.
 */
export function attendOrientation(content: ContentPack, state: GameState): { state: GameState; cutscene?: Intro; scene: Scene | null } {
  const step = orientationStep(content, state)
  if (!step) throw new Error('There is no orientation to attend now')
  const index = state.orientationStep
  const [leadId, ...companionIds] = orientationCasts(content, state)[index] ?? []
  const date = toDate(content.calendar, state.time)
  const begins = state.time + Math.max(0, step.startHour - date.hour)
  const place = content.locations.find((l) => l.id === step.locationId)

  const there = { ...state, time: begins + step.hours, locationId: step.locationId, inOwnRoom: false, orientationStep: index + 1 }
  const after = there
  return {
    state: after,
    cutscene: step.cutscene,
    scene: leadId
      ? {
          loveInterestId: leadId,
          companionIds,
          nsfw: false,
          beats: [
            {
              activityName: `Orientation: ${step.name}`,
              locationName: place?.name,
              description: step.description || undefined,
              direction: step.direction || undefined
            }
          ],
          messages: [],
          gifts: [], conceived: [], departed: [], npc: false,
          baseline: sceneBaseline(state, leadId, companionIds)
        }
      : null
  }
}
