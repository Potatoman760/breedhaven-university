import type { ContentPack, Focus, GameState, Stat } from '../model'
import { STAT_NAMES, STATS } from '../model'
import { addCoursePoints } from './grades'
import { trainStat } from './stats'
import { factor } from './modifiers'
import { DRILL_PER_HOUR } from './minigames'
import { t } from '../i18n'

/**
 * His focus: the one stat or course he gives his spare hours to. When he skips ahead to the next thing on his
 * timetable, the hours that go by are not lost: they are spent on it. It costs him nothing. A stat is worked on at what
 * a drill gives when its game is not played; a course at half of what the same hours of study would earn.
 */

// What an hour of his focus on a course is worth beside an hour he set aside for study.
export const FOCUS_SHARE = 0.5

/** What he can give his spare hours to: each stat, and each course he is taking. */
export function focusChoices(state: Pick<GameState, 'courses' | 'enrolment'>): { focus: Focus; label: string }[] {
  return [
    ...STATS.map((stat) => ({ focus: { kind: 'stat' as const, id: stat }, label: STAT_NAMES[stat] })),
    ...state.courses.filter((course) => state.enrolment?.includes(course.id)).map((course) => ({ focus: { kind: 'course' as const, id: course.id }, label: t('game.focus.course', { number: course.number, title: course.title }) }))
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
  return focus.kind === 'stat' ? STAT_NAMES[focus.id as Stat] : (state.courses.find((course) => course.id === focus.id)?.number ?? focus.id)
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
  const share = factor(content, state, 'focus')
  if (focus.kind === 'stat') return trainStat(content, state, focus.id, hours * DRILL_PER_HOUR.min * share)
  return addCoursePoints(content, state, focus.id, (content.coursework?.grading.studyPerHour ?? 0) * hours * FOCUS_SHARE * share * factor(content, state, 'marks'))
}
