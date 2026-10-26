import { courseOf, type ContentPack, type Course, type GameState, type LearntSkill, type Skill, type SkillGrant } from '../model'
import { factsOf, revealedIds } from './facts'
import { coursePoints } from './grades'
import { applyEffects } from './conditions'
import { skillsLearnt } from './modifiers'
import type { PerformCheck } from './activities'
import { t, type MessageKey } from '../i18n'

/**
 * What he has learnt to do. A course is worth more than its marks: far enough into one, he can do something he could
 * not before. Nothing is kept of it but the marks themselves: he has a skill for as long as he has the marks in a
 * course that teaches it, and marks do not fall, so what he has learnt he keeps.
 */

type Learner = Pick<GameState, 'courses' | 'enrolment' | 'coursePoints'>

/** Whether a course is the one that teaches a skill. */
const teaches = (skill: Pick<Skill, 'courseId'>, course: Pick<Course, 'id' | 'courseId'>) => courseOf(course) === skill.courseId

/** The courses he takes that teach a skill. */
function coursesFor(state: Learner, skill: Pick<Skill, 'courseId'>): Course[] {
  return state.courses.filter((course) => teaches(skill, course) && state.enrolment?.includes(course.id))
}

/** The skill a course teaches, if it teaches one. */
export function skillFor(content: Pick<ContentPack, 'skills'>, course: Pick<Course, 'id' | 'courseId'>): Skill | undefined {
  return content.skills.find((skill) => teaches(skill, course))
}

/**
 * How far he is toward a skill: the most marks he has in a course that teaches it, what the next level takes, and the
 * level he has (0 for none). At the second there is nothing further: `at` is then the second's.
 */
export function skillProgress(state: Learner, skill: Skill): { marks: number; at: number; has: boolean; level: 0 | 1 | 2 } {
  const marks = Math.max(0, ...coursesFor(state, skill).map((course) => coursePoints(state as GameState, course.id)))
  const taking = coursesFor(state, skill).length > 0
  const level = !taking || marks < skill.at ? 0 : skill.upgrade && marks >= skill.upgrade.at ? 2 : 1
  return { marks, at: level === 0 || !skill.upgrade ? skill.at : skill.upgrade.at, has: level > 0, level }
}

/** The skills he has, each as he has it. */
export function skillsOf(content: Pick<ContentPack, 'skills'>, state: Learner): LearntSkill[] {
  return skillsLearnt(content, state)
}

/** The level he has a sight at: 0 without it. */
export function skillLevel(content: Pick<ContentPack, 'skills'>, state: Learner, grant: SkillGrant): 0 | 1 | 2 {
  return skillsOf(content, state).reduce<0 | 1 | 2>((most, skill) => (skill.grants === grant && skill.level > most ? skill.level : most), 0)
}

/** What he is told of for a skill as he has it: its first level, and its second once he has that. */
export function toldOf(skill: LearntSkill): string[] {
  return skill.level === 2 ? [skill.id, `${skill.id}@2`] : [skill.id]
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
  if (!skill?.ability) return { ok: false, reasons: [t('game.skills.notLearned')] }
  const wait = readyIn(content, state, skill)
  if (wait > 0) return { ok: false, reasons: [wait >= content.calendar.hoursPerDay ? t('game.skills.readyInDays', { days: Math.ceil(wait / content.calendar.hoursPerDay) }) : t('game.skills.readyInHours', { hours: wait })] }
  if (skill.ability.on === 'her' && loveInterestId === undefined) return { ok: false, reasons: [t('game.market.forSomeone')] }
  return { ok: true, reasons: [] }
}

/** Makes or sets off what a skill lets him: what it does is done, and it is not ready again for its days. */
export function useAbility(content: ContentPack, state: GameState, skillId: string, loveInterestId?: string): GameState {
  const skill = skillsOf(content, state).find((one) => one.id === skillId)
  if (!skill?.ability || !canUseAbility(content, state, skillId, loveInterestId).ok) return state
  const done = applyEffects(state, skill.ability.effects, { content, loveInterestId: skill.ability.on === 'her' ? loveInterestId : undefined, source: skill.name })
  return { ...done, abilityUsed: { ...done.abilityUsed, [skill.id]: state.time } }
}

/** Whether he can do a thing: he has some skill that grants it, or one whose second level does as well. */
export function hasSkill(content: Pick<ContentPack, 'skills'>, state: Learner, grant: SkillGrant): boolean {
  return skillsOf(content, state).some((skill) => skill.grants === grant || (skill.level === 2 && skill.upgrade?.alsoGrants === grant))
}

/** The skill that would let him do a thing, for telling him where it is learnt. */
export function skillGranting(content: Pick<ContentPack, 'skills'>, grant: SkillGrant): Skill | undefined {
  return content.skills.find((skill) => skill.grants === grant) ?? content.skills.find((skill) => skill.upgrade?.alsoGrants === grant)
}

/** The skills he has and has not yet been told of as he has them: new ones, and ones that have reached their second level. */
export function newSkills(content: Pick<ContentPack, 'skills'>, state: Learner & Pick<GameState, 'skillsTold'>): LearntSkill[] {
  return skillsOf(content, state).filter((skill) => toldOf(skill).some((key) => !state.skillsTold.includes(key)))
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

const COMFORT_KEYS: (MessageKey | undefined)[] = [undefined, 'game.skills.comfort.leave', 'game.skills.comfort.uneasy', 'game.skills.comfort.wary', 'game.skills.comfort.atEase', 'game.skills.comfort.glad']

/** What a reading of her comfort is called. Each word is looked up as it is read, in the language of the moment. */
export const COMFORT_WORDS: readonly string[] = Object.defineProperties(
  [] as string[],
  Object.fromEntries(COMFORT_KEYS.map((key, level) => [level, { get: () => (key ? t(key) : ''), enumerable: true }]))
)
