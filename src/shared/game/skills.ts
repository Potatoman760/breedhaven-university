import type { ContentPack, Course, GameState, Skill, SkillGrant } from '../model'
import { factsOf, revealedIds } from './facts'
import { coursePoints } from './grades'
import { applyEffects } from './conditions'
import { skillsLearnt } from './modifiers'
import type { PerformCheck } from './activities'

/**
 * What he has learnt to do. A course is worth more than its marks: far enough into one, he can do something he could
 * not before. Nothing is kept of it but the marks themselves: he has a skill for as long as he has the marks in a
 * course that teaches it, and marks do not fall, so what he has learnt he keeps.
 */

type Learner = Pick<GameState, 'courses' | 'enrolment' | 'coursePoints'>

/** The courses he takes that teach a skill. */
/** Whether a course is one that teaches a skill: of its subject, and at its year where the skill names one. */
const teaches = (skill: Pick<Skill, 'code' | 'level'>, course: Pick<Course, 'code' | 'level'>) => course.code === skill.code && (skill.level === undefined || skill.level === course.level)

function coursesFor(state: Learner, skill: Pick<Skill, 'code' | 'level'>): Course[] {
  return state.courses.filter((course) => teaches(skill, course) && state.enrolment?.includes(course.id))
}

/** The skill a course teaches, if it teaches one. */
export function skillFor(content: Pick<ContentPack, 'skills'>, course: Pick<Course, 'code' | 'level'>): Skill | undefined {
  return content.skills.find((skill) => teaches(skill, course))
}

/** How far he is toward a skill: the most marks he has in a course that teaches it, and what it takes. */
export function skillProgress(state: Learner, skill: Skill): { marks: number; at: number; has: boolean } {
  const marks = Math.max(0, ...coursesFor(state, skill).map((course) => coursePoints(state as GameState, course.id)))
  return { marks, at: skill.at, has: coursesFor(state, skill).length > 0 && marks >= skill.at }
}

/** The skills he has. */
export function skillsOf(content: Pick<ContentPack, 'skills'>, state: Learner): Skill[] {
  return skillsLearnt(content, state)
}

/** How many hours it is until he can do again something he has done: none when it is ready. */
export function readyIn(content: Pick<ContentPack, 'calendar'>, state: Pick<GameState, 'abilityUsed' | 'time'>, skill: Skill): number {
  const used = state.abilityUsed[skill.id]
  if (used === undefined || !skill.ability) return 0
  return Math.max(0, used + skill.ability.cooldownDays * content.calendar.hoursPerDay - state.time)
}

/** Whether he can make or set off what a skill lets him: he has it, it is ready, and where it is done on a woman, he is with one. */
export function canUseAbility(content: ContentPack, state: GameState, skillId: string, loveInterestId?: string): PerformCheck {
  const skill = skillsOf(content, state).find((one) => one.id === skillId)
  if (!skill?.ability) return { ok: false, reasons: ['You have not learnt that'] }
  const wait = readyIn(content, state, skill)
  if (wait > 0) return { ok: false, reasons: [`Ready in ${wait >= content.calendar.hoursPerDay ? `${Math.ceil(wait / content.calendar.hoursPerDay)} days` : `${wait} hours`}`] }
  if (skill.ability.on === 'her' && loveInterestId === undefined) return { ok: false, reasons: ['It is for someone you are with'] }
  return { ok: true, reasons: [] }
}

/** Makes or sets off what a skill lets him: what it does is done, and it is not ready again for its days. */
export function useAbility(content: ContentPack, state: GameState, skillId: string, loveInterestId?: string): GameState {
  const skill = skillsOf(content, state).find((one) => one.id === skillId)
  if (!skill?.ability || !canUseAbility(content, state, skillId, loveInterestId).ok) return state
  const done = applyEffects(state, skill.ability.effects, { content, loveInterestId: skill.ability.on === 'her' ? loveInterestId : undefined, source: skill.name })
  return { ...done, abilityUsed: { ...done.abilityUsed, [skill.id]: state.time } }
}

/** Whether he can do a thing: he has some skill that grants it. */
export function hasSkill(content: Pick<ContentPack, 'skills'>, state: Learner, grant: SkillGrant): boolean {
  return skillsOf(content, state).some((skill) => skill.grants === grant)
}

/** The skill that would let him do a thing, for telling him where it is learnt. */
export function skillGranting(content: Pick<ContentPack, 'skills'>, grant: SkillGrant): Skill | undefined {
  return content.skills.find((skill) => skill.grants === grant)
}

/** The skills he has and has not yet been told of. */
export function newSkills(content: Pick<ContentPack, 'skills'>, state: Learner & Pick<GameState, 'skillsTold'>): Skill[] {
  return skillsOf(content, state).filter((skill) => !state.skillsTold.includes(skill.id))
}

/** Records that he has been told of these. */
export function tellSkills(state: GameState, ids: string[]): GameState {
  const fresh = ids.filter((id) => !state.skillsTold.includes(id))
  return fresh.length === 0 ? state : { ...state, skillsTold: [...state.skillsTold, ...fresh] }
}

/**
 * What an eye for taste picks up from time spent with her: one thing she likes or dislikes that he did not know,
 * the same for the same scene however often it is asked. Nothing when he knows them all, or `besides` already covers
 * what is left.
 */
export function intuitTaste(content: ContentPack, state: GameState, loveInterestId: string, besides: string[] = []): string | undefined {
  const li = content.loveInterests.find((one) => one.id === loveInterestId)
  if (!li) return undefined
  const known = [...revealedIds(state, loveInterestId), ...besides]
  const open = factsOf(content, li).filter((fact) => (fact.group === 'likes' || fact.group === 'dislikes') && !known.includes(fact.id))
  if (open.length === 0) return undefined
  // Which of them is settled by the game's seed, the hour and how much he already knows, so that it does not change on a second look.
  const pick = Math.abs(Math.imul(state.weatherSeed ^ (state.time * 2654435761), 0x9e3779b1) + known.length) % open.length
  return open[pick].id
}

/** What a reading of her comfort is called. */
export const COMFORT_WORDS = ['', 'wants to leave', 'uneasy', 'wary', 'at ease', 'glad to be here'] as const
