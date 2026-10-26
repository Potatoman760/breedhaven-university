import { z } from 'zod'
import { cardBrief, freshId, withCard, type Card } from './sillyCard'
import { DEFAULT_IMAGE_SEED, LoveInterestSchema, STANDARD_OUTFITS, STATS, studiesOf, type ContentPack, type LoveInterest } from '../model'
import { t } from '../i18n'

// Room for her whole profile, and for the thinking a reasoning model does first, which counts against it.
export const DRAFT_MIN_TOKENS = 12000
export const DRAFT_MAX_IDEA_CHARS = 2000

/**
 * What the LLM is asked to write for a new love interest: the parts of her file that are
 * words and choices, with every choice limited to what this game's content has. Built from
 * the content so that the schema it is shown names the real ids. Her id, pictures and
 * outfits other than what she usually wears are the editor's to fill in.
 */
export function draftSchema(content: ContentPack) {
  const one = <T extends string>(values: T[]) => z.enum(values as [T, ...T[]])
  const location = one(content.locations.map((l) => l.id))
  // What she reads or teaches is the curriculum's: a subject she can read as her own, and courses that are written.
  const majors = (content.curriculum?.majors ?? []).filter((major) => !major.general).map((major) => major.code)
  const courses = (content.curriculum?.majors ?? []).flatMap((major) => major.courses.map((course) => `${major.code} ${course.number}`))
  const subject = z.object({
    major: (majors.length > 0 ? one(majors) : z.string()).describe(t('llm.draftCharacter.major')),
    level: z.number().int().min(1).max(5).describe(t('llm.draftCharacter.level'))
  })
  return z.object({
    name: z.string().min(1).describe(t('llm.draftCharacter.name')),
    age: z.number().int().min(18).describe(t('llm.draftCharacter.age')),
    pronouns: z.string().default('she/her'),
    handle: z.string().describe(t('llm.draftCharacter.handle')),
    bio: z.string().describe(t('llm.draftCharacter.bio')),
    appearance: z.string().describe(t('llm.draftCharacter.appearance')),
    usualClothes: z.string().describe(t('llm.draftCharacter.usualClothes')),
    personality: z.string().describe(t('llm.draftCharacter.personality')),
    traitIds: z.array(one(content.traits.map((trait) => trait.id))).max(3).describe(t('llm.draftCharacter.traitIds')),
    likes: z.array(z.string()).max(5).describe(t('llm.draftCharacter.likes')),
    dislikes: z.array(z.string()).max(4).describe(t('llm.draftCharacter.dislikes')),
    admires: z.array(z.enum(STATS)).max(3).describe(t('llm.draftCharacter.admires')),
    childNames: z
      .object({
        daughters: z.array(z.string()).min(5).max(5).describe(t('llm.draftCharacter.daughters')),
        sons: z.array(z.string()).min(2).max(2).describe(t('llm.draftCharacter.sons'))
      })
      .describe(t('llm.draftCharacter.childNames')),
    kind: z.enum(['student', 'teacher', 'outsider']).describe(t('llm.draftCharacter.kind')),
    studies: subject.optional().describe(t('llm.draftCharacter.studies')),
    teaching: z
      .object({
        department: z.string().describe(t('llm.draftCharacter.department')),
        title: z.string().describe(t('llm.draftCharacter.title')),
        subjects: z.array(courses.length > 0 ? one(courses) : z.string()).min(1).max(2).describe(t('llm.draftCharacter.subjects'))
      })
      .optional()
      .describe(t('llm.draftCharacter.teaching')),
    room: z.object({
      name: z.string().describe(t('llm.draftCharacter.roomName')),
      description: z.string().describe(t('llm.draftCharacter.roomDescription')),
      locationId: location.describe(t('llm.draftCharacter.roomLocation'))
    }),
    schedule: z
      .array(
        z.object({
          weekdays: z.array(one(content.calendar.weekdays)).optional().describe(t('llm.draftCharacter.weekdays')),
          periods: z.array(one(content.calendar.periods.map((p) => p.id))).optional().describe(t('llm.draftCharacter.periods')),
          locationId: location
        })
      )
      .min(2)
      .max(6)
      .describe(t('llm.draftCharacter.schedule')),
    ai: z.object({
      speechPattern: z.string().describe(t('llm.draftCharacter.speechPattern')),
      tone: z.string().describe(t('llm.draftCharacter.tone')),
      verbalQuirks: z.array(z.string()).max(3),
      backstory: z.string().describe(t('llm.draftCharacter.backstory')),
      secret: z.string().describe(t('llm.draftCharacter.secret')),
      extraInstructions: z.string().describe(t('llm.draftCharacter.extraInstructions'))
    })
  })
}
export type CharacterDraft = z.infer<ReturnType<typeof draftSchema>>

/**
 * The prompt asking the LLM to write a new love interest as one JSON object: from the user's idea, or from a
 * SillyTavern card brought into the setting, with the idea as notes on how.
 */
export function buildDraftPrompt(content: ContentPack, idea: string, card?: Card): { system: string; user: string } {
  const schema = z.toJSONSchema(draftSchema(content), { io: 'input' })
  const lore = content.codex.filter((entry) => entry.alwaysInclude && entry.startsUnlocked)
  const tags = [...new Set(content.items.flatMap((item) => item.tags))].sort()
  const system = [
    t('llm.draftCharacter.systemRole'),
    t('llm.draftCharacter.systemReply'),
    JSON.stringify(schema),
    t('llm.draftCharacter.systemFields'),
    t('llm.draftCharacter.systemDistinct'),
    t('llm.draftCharacter.systemBefore')
  ].join('\n\n')

  const user = [
    ...(lore.length > 0 ? [t('llm.draftCharacter.setting'), ...lore.map((e) => `- ${e.title}: ${e.content}`), ''] : []),
    t('llm.draftCharacter.locations'),
    ...content.locations.map((l) => `- ${l.id}: ${l.name}. ${l.description}`),
    '',
    t('llm.draftCharacter.traits'),
    ...content.traits.map((trait) => `- ${trait.id}: ${trait.definition}`),
    '',
    t('llm.draftCharacter.giftTags', { tags: tags.join(', ') }),
    '',
    t('llm.draftCharacter.subjectsList'),
    ...(content.curriculum?.majors ?? [])
      .filter((major) => !major.general)
      .map((major) => `- ${major.code}: ${major.subject}. ${major.courses.map((course) => `${major.code} ${course.number} ${course.title}`).join('; ')}`),
    '',
    t('llm.draftCharacter.existing'),
    ...content.loveInterests.map((li) => `- ${li.name}, ${li.age}: ${li.bio}${li.studies ? ` [${li.studies.code}]` : ''}${li.teaching ? ` [${li.teaching.subjects.map((s) => s.code).join(', ')}]` : ''}`),
    '',
    ...(card
      ? [
          t('llm.draftCharacter.fromCard'),
          ...(idea.trim() ? [t('llm.draftCharacter.notes', { notes: idea.trim() })] : []),
          '',
          t('llm.draftCharacter.theCard'),
          cardBrief(card)
        ]
      : [t('llm.draftCharacter.idea', { idea: idea.trim() })])
  ].join('\n')
  return { system, user }
}

/**
 * The first whole JSON object in a reply, whatever was written around it: read to the brace that closes it, and not
 * to the last brace there is, which in a reply cut off part way is one of its own. A comma left before a closing brace
 * is forgiven.
 */
export function extractObject(reply: string): unknown {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, '')
  const start = text.indexOf('{')
  if (start < 0) throw new Error(t('llm.draftCharacter.noObject'))
  let depth = 0
  let inString = false
  let escaped = false
  let end = -1
  for (let i = start; i < text.length && end < 0; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) end = i
  }
  if (end < 0) throw new Error(t('llm.draftCharacter.cutOff'))
  const body = text.slice(start, end + 1)
  try {
    return JSON.parse(body)
  } catch {
    try {
      return JSON.parse(body.replace(/,(\s*[}\]])/g, '$1'))
    } catch (error) {
      throw new Error(t('llm.draftCharacter.unreadable', { error: (error as Error).message }))
    }
  }
}

/**
 * Turns the LLM's reply into a love interest for the editor to open, unsaved: checked
 * against the schema it was shown, given an id nobody has, the four standard outfits and a
 * secret kept until she is close. Throws, saying why, when the reply can't be used.
 */
export function parseDraft(content: ContentPack, reply: string, card?: Card): LoveInterest {
  const written = parseReply(content, reply)
  return card ? withCard(written, card) : written
}

function parseReply(content: ContentPack, reply: string): LoveInterest {
  const parsed = draftSchema(content).safeParse(extractObject(reply))
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(t('llm.draftCharacter.unfit', { path: first?.path.join('.') || t('llm.draftCharacter.unfitPath'), message: `${first?.message}` }))
  }
  const { usualClothes, ai, studies, teaching, kind, ...rest } = parsed.data
  const { secret, ...voice } = ai

  const id = freshId(content, rest.name)
  const stages = content.relationships.stages
  return LoveInterestSchema.parse({
    ...rest,
    id,
    handle: rest.handle.replace(/^@/, ''),
    kind,
    // Each kind keeps only what belongs to it, filled in from the curriculum as a character file has it filled in.
    studies: kind === 'student' && studies && content.curriculum ? studiesOf(content.curriculum, studies.major, studies.level) : undefined,
    teaching:
      kind === 'teacher' && teaching && content.curriculum
        ? {
            ...teaching,
            subjects: teaching.subjects.flatMap((named) => {
              const [code, number] = named.split(' ')
              const subject = studiesOf(content.curriculum!, code, 1)
              if (!subject) return []
              const { level: _year, ...rest } = subject
              return [{ ...rest, number }]
            })
          }
        : undefined,
    outfits: STANDARD_OUTFITS.map((outfit) => (outfit.id === 'default' ? { ...outfit, description: usualClothes } : outfit)),
    defaultOutfitId: 'default',
    imageSeed: DEFAULT_IMAGE_SEED,
    ai: {
      ...voice,
      secrets: secret.trim() ? [{ text: secret.trim(), revealWhen: [{ type: 'stage', min: stages.at(-2)?.id ?? stages[0].id }] }] : []
    }
  })
}
