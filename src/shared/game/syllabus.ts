import type { ContentPack, Course, GameState, Topic } from '../model'

/** How many classes of a course he has sat. */
export function classesSat(state: Pick<GameState, 'attendance'>, courseId: string): number {
  return state.attendance[courseId]?.sat.length ?? 0
}

/** The key a class is kept under once sat: the day, and the hour it began. */
export function classKey(dayIndex: number, startHour: number): string {
  return `${dayIndex}:${startHour}`
}

/** What a course teaches, in the order it is taught. Nothing for a course with no syllabus. */
export function topicsOf(content: Pick<ContentPack, 'syllabus'>, courseId: string): Topic[] {
  return content.syllabus.find((entry) => entry.courseId === courseId)?.topics ?? []
}

/**
 * What the class he is about to sit is on: the next topic of the course's syllabus after those of the classes he has
 * been to, coming round again when it has all been taught. It is read before the class is counted as attended.
 */
export function lessonTopic(content: Pick<ContentPack, 'syllabus'>, state: Pick<GameState, 'attendance'>, course: Pick<Course, 'id'>): Topic | undefined {
  const topics = topicsOf(content, course.id)
  return topics.length === 0 ? undefined : topics[classesSat(state, course.id) % topics.length]
}

/**
 * The topics he has been taught, by their place in the syllabus: one for each class he sat, in the order the course
 * teaches them. A class he missed taught him nothing, so the next he sits takes up where he left off.
 */
export function topicsCovered(content: Pick<ContentPack, 'syllabus'>, state: Pick<GameState, 'attendance'>, courseId: string): number[] {
  const topics = topicsOf(content, courseId)
  return topics.map((_, index) => index).slice(0, Math.min(classesSat(state, courseId), topics.length))
}
