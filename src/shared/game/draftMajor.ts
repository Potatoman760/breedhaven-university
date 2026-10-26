import { z } from 'zod'
import { slugify } from '../editor'
import { MAJOR_COURSES, MajorSchema, STATS, TOPICS_PER_COURSE, type ContentPack, type Major, type ModifierKind } from '../model'
import { extractObject } from './draftCharacter'
import { t, type MessageKey } from '../i18n'

// Room for two or three whole courses, and for the thinking a reasoning model does first, which counts against it.
export const MAJOR_DRAFT_MIN_TOKENS = 16000

/**
 * What a course's skill may change, and what each does, for the LLM to choose from: the numbers of the game that a
 * subject of study could plausibly improve. Those that shape conception or a woman's will are left to the game's own.
 */
const OFFERED: Partial<Record<ModifierKind, MessageKey>> = {
  training: 'llm.draftMajor.offered.training',
  marks: 'llm.draftMajor.offered.marks',
  focus: 'llm.draftMajor.offered.focus',
  wages: 'llm.draftMajor.offered.wages',
  prices: 'llm.draftMajor.offered.prices',
  rent: 'llm.draftMajor.offered.rent',
  keep: 'llm.draftMajor.offered.keep',
  build: 'llm.draftMajor.offered.build',
  gifts: 'llm.draftMajor.offered.gifts',
  effort: 'llm.draftMajor.offered.effort',
  affection: 'llm.draftMajor.offered.affection',
  trust: 'llm.draftMajor.offered.trust',
  escort: 'llm.draftMajor.offered.escort',
  bonds: 'llm.draftMajor.offered.bonds',
  desire: 'llm.draftMajor.offered.desire',
  losses: 'llm.draftMajor.offered.losses',
  comfort: 'llm.draftMajor.offered.comfort',
  care: 'llm.draftMajor.offered.care',
  trustBonus: 'llm.draftMajor.offered.trustBonus'
}
const KINDS = Object.keys(OFFERED) as [ModifierKind, ...ModifierKind[]]

/** What a course of a subject made in the editor may teach: these numbers of the game, each with what it does. */
export const COURSE_SKILL_KINDS: { kind: ModifierKind; does: string }[] = KINDS.map((kind) => ({
  kind,
  get does() {
    return t(OFFERED[kind]!)
  }
}))

/** What the LLM is asked to write for a new subject: its code, what it trains, and its courses in full. */
export function majorDraftSchema() {
  const question = z.object({
    ask: z.string().describe(t('llm.draftMajor.ask')),
    answer: z.string().describe(t('llm.draftMajor.answer')),
    wrong: z.array(z.string()).length(3).describe(t('llm.draftMajor.wrong'))
  })
  const topic = z.object({
    title: z.string().describe(t('llm.draftMajor.topicTitle')),
    content: z.string().describe(t('llm.draftMajor.topicContent')),
    question
  })
  const effect = z.object({
    kind: z.enum(KINDS).describe(t('llm.draftMajor.effectKind')),
    amount: z.number().describe(t('llm.draftMajor.effectAmount')),
    stats: z.array(z.enum(STATS)).min(1).max(2).optional().describe(t('llm.draftMajor.effectStats'))
  })
  const course = z.object({
    number: z.string().regex(/^1\d\d$/).describe(t('llm.draftMajor.number')),
    title: z.string().describe(t('llm.draftMajor.courseTitle')),
    description: z.string().describe(t('llm.draftMajor.courseDescription')),
    topics: z.array(topic).length(TOPICS_PER_COURSE).describe(t('llm.draftMajor.topics')),
    skill: z.object({
      name: z.string().describe(t('llm.draftMajor.skillName')),
      description: z.string().describe(t('llm.draftMajor.skillDescription')),
      effect,
      upgrade: z.object({
        description: z.string().describe(t('llm.draftMajor.upgradeDescription')),
        amount: z.number().describe(t('llm.draftMajor.upgradeAmount'))
      })
    })
  })
  return z.object({
    code: z.string().regex(/^[A-Z]{2,4}$/).describe(t('llm.draftMajor.code')),
    stats: z.array(z.enum(STATS)).min(1).max(2).describe(t('llm.draftMajor.stats')),
    practical: z.boolean().describe(t('llm.draftMajor.practical')),
    courses: z.array(course).min(MAJOR_COURSES).max(3)
  })
}

export interface MajorIdea {
  /** What it is called. */
  subject: string
  /** The college it belongs to, by id. */
  college: string
  /** Anything else the author wants of it. */
  notes: string
}

/** The prompt asking the LLM to write a new subject of the University, its courses in full, as one JSON object. */
export function buildMajorDraftPrompt(content: ContentPack, idea: MajorIdea): { system: string; user: string } {
  const schema = z.toJSONSchema(majorDraftSchema(), { io: 'input' })
  const lore = content.codex.filter((entry) => entry.alwaysInclude && entry.startsUnlocked)
  const majors = content.curriculum?.majors ?? []
  // One of the game's own courses, as the pattern to follow.
  const example = majors.find((major) => !major.general && major.courses.some((course) => course.skill?.passive))
  const shown = example?.courses.find((course) => course.skill?.passive)
  const college = content.curriculum?.colleges.find((one) => one.id === idea.college)?.name ?? idea.college
  const system = [
    t('llm.draftMajor.systemRole'),
    t('llm.draftMajor.systemReply'),
    JSON.stringify(schema),
    t('llm.draftMajor.systemFields'),
    t('llm.draftMajor.systemCourses', { count: MAJOR_COURSES }),
    t('llm.draftMajor.systemSkill'),
    ...KINDS.map((kind) => `- ${kind}: ${t(OFFERED[kind]!)}`),
    t('llm.draftMajor.systemModest')
  ].join('\n\n')
  const user = [
    ...(lore.length > 0 ? [t('llm.draftMajor.setting'), ...lore.map((entry) => `- ${entry.title}: ${entry.content}`), ''] : []),
    t('llm.draftMajor.existing'),
    ...majors.map((major) => `- ${major.code}: ${major.subject}`),
    '',
    ...(example && shown ? [t('llm.draftMajor.pattern'), JSON.stringify({ code: example.code, course: shown }), ''] : []),
    t('llm.draftMajor.subject', { subject: idea.subject.trim(), college }),
    ...(idea.notes.trim() ? [t('llm.draftMajor.notes', { notes: idea.notes.trim() })] : [])
  ].join('\n')
  return { system, user }
}

/**
 * Turns the LLM's reply into a subject for the editor to open, unsaved: named and placed as the author asked, each
 * skill given an id nobody has and its level at 70 of the same kind. Throws, saying why, when the reply can't be used.
 */
export function parseMajorDraft(content: ContentPack, idea: MajorIdea, reply: string): Major {
  const parsed = majorDraftSchema().safeParse(extractObject(reply))
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(t('llm.draftMajor.unfit', { path: first?.path.join('.') || t('llm.draftMajor.unfitPath'), message: `${first?.message}` }))
  }
  const draft = parsed.data
  if ((content.curriculum?.majors ?? []).some((major) => major.code === draft.code)) throw new Error(t('llm.draftMajor.codeTaken', { code: draft.code }))
  if (new Set(draft.courses.map((course) => course.number)).size !== draft.courses.length) throw new Error(t('llm.draftMajor.sameNumber'))
  const taken = new Set([...content.skills.map((skill) => skill.id), ...(content.curriculum?.majors ?? []).flatMap((major) => major.courses.flatMap((course) => course.skill?.id ?? []))])
  return MajorSchema.parse({
    code: draft.code,
    subject: idea.subject.trim(),
    college: idea.college,
    stats: draft.stats,
    practical: draft.practical,
    courses: draft.courses.map((course) => {
      const { effect, upgrade } = course.skill
      const base = slugify(course.skill.name) || `${draft.code.toLowerCase()}-${course.number}`
      let id = base
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
      taken.add(id)
      const passive = { kind: effect.kind, amount: effect.amount, ...(effect.kind === 'training' && effect.stats && { stats: effect.stats }) }
      return {
        number: course.number,
        title: course.title,
        description: course.description,
        topics: course.topics,
        skill: {
          id,
          name: course.skill.name,
          description: course.skill.description,
          at: 30,
          passive,
          upgrade: { at: 70, description: upgrade.description, passive: { ...passive, amount: upgrade.amount } }
        }
      }
    })
  })
}
