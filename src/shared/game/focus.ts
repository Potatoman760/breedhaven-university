import type { ContentPack, Focus, GameState } from '../model'
import { STATS } from '../model'
import { addCoursePoints } from './grades'
import { trainStat } from './stats'
import { factor } from './modifiers'

/**
 * His focus: the one stat or course he gives his spare hours to. When he skips ahead to the next thing on his
 * timetable, the hours that go by are not lost: they are spent on it. It is worth half of what the same hours would
 * be if he set out to do the work, and costs him nothing, so that planning a day by hand is still the better use of it.
 */

// What an hour of his focus is worth beside an hour he set aside for the work.
export const FOCUS_SHARE = 0.5

/** What he can give his spare hours to: each stat, and each course he is taking. */
export function focusChoices(state: Pick<GameState, 'courses' | 'enrolment'>): { focus: Focus; label: string }[] {
  return [
    ...STATS.map((stat) => ({ focus: { kind: 'stat' as const, id: stat }, label: stat[0].toUpperCase() + stat.slice(1) })),
    ...state.courses.filter((course) => state.enrolment?.includes(course.id)).map((course) => ({ focus: { kind: 'course' as const, id: course.id }, label: `${course.number}: ${course.title}` }))
  ]
}

/** His focus, if it is still something he can work on: a course he has dropped is not. */
export function focusOf(state: Pick<GameState, 'focus' | 'courses' | 'enrolment'>): Focus | undefined {
  const { focus } = state
  return focus && focusChoices(state).some((choice) => choice.focus.kind === focus.kind && choice.focus.id === focus.id) ? focus : undefined
}

/** What it is called: "Strength", "RID 101". */
export function focusName(state: Pick<GameState, 'focus' | 'courses' | 'enrolment'>): string | undefined {
  const focus = focusOf(state)
  if (!focus) return undefined
  return focus.kind === 'stat' ? focus.id[0].toUpperCase() + focus.id.slice(1) : (state.courses.find((course) => course.id === focus.id)?.number ?? focus.id)
}

/** Chooses what his spare hours go to, or nothing. */
export function setFocus(state: GameState, focus: Focus | undefined): GameState {
  return { ...state, focus }
}

/**
 * Spends hours that are going by on his focus, as the game stands before they pass: training toward the stat, or
 * marks in the course. Nothing changes without a focus, or for no hours.
 */
export function spendOnFocus(content: ContentPack, state: GameState, hours: number): GameState {
  const focus = focusOf(state)
  if (!focus || hours <= 0) return state
  const share = FOCUS_SHARE * factor(content, state, 'focus')
  if (focus.kind === 'stat') return trainStat(content, state, focus.id, hours * share)
  return addCoursePoints(content, state, focus.id, (content.coursework?.grading.studyPerHour ?? 0) * hours * share * factor(content, state, 'marks'))
}
