import { z } from 'zod'

// How many wrong answers stand beside the right one.
export const WRONG_ANSWERS = 3

/** What an examination asks about a topic: one thing its class teaches, with the answer and the answers it is hidden among. */
export const QuestionSchema = z.object({
  ask: z.string(),
  answer: z.string(),
  wrong: z.array(z.string()).length(WRONG_ANSWERS)
})
export type Question = z.infer<typeof QuestionSchema>

/** One thing a course teaches: what a class of it is about, and what is true of that in this world. */
export const TopicSchema = z.object({
  title: z.string(),
  /** Told to whoever is teaching, to teach from. */
  content: z.string(),
  /** What the examinations ask of it. Whoever teaches the class is told to say the answer, so that it is something he heard. */
  question: QuestionSchema.optional()
})
export type Topic = z.infer<typeof TopicSchema>

/**
 * What each course teaches, class by class. It is lore, like the codex, but nobody reads it: it is handed to the
 * teacher of the class it belongs to and to nobody else, so that what is taught is of this world and the same from
 * one week to the next.
 */
export const SyllabusSchema = z.array(
  z.object({
    courseId: z.string(),
    topics: z.array(TopicSchema).min(1)
  })
)
export type Syllabus = z.infer<typeof SyllabusSchema>
