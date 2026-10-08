import { z } from 'zod'
import { slugify } from '../editor'
import { DEFAULT_IMAGE_SEED, LoveInterestSchema, STANDARD_OUTFITS, STATS, type ContentPack, type LoveInterest } from '../model'

// A whole profile is a good deal longer than a line of dialogue.
export const DRAFT_MIN_TOKENS = 3500
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
  const subject = z.object({
    subject: z.string().describe('The subject, as a catalogue would name it: "Marine Biology".'),
    code: z.string().min(2).max(4).describe('Catalogue prefix: three capital letters, not one already in use.'),
    level: z.number().int().min(1).max(5).describe('Year of study or of the course: 1 to 4 for undergraduates, 5 for graduate.'),
    stats: z.array(z.enum(STATS)).min(1).max(2).describe('What a class in it raises in the player.')
  })
  return z.object({
    name: z.string().min(1).describe('Her full name, unlike any existing character\'s.'),
    age: z.number().int().min(18).describe('18 or over, always. Undergraduates are 18 to 22, graduate students up to the mid-twenties, staff older.'),
    pronouns: z.string().default('she/her'),
    handle: z.string().describe('Her name on the Bloomr apps, without the @: lower case, in character.'),
    bio: z.string().describe('One or two sentences shown to the player: who she is and what she does.'),
    appearance: z
      .string()
      .describe(
        'Her face, hair and body only, in plain words an image model can draw: age, skin, face shape, eyes, lips, hair colour and style, build and figure. ' +
          'No clothing and no personality. She should be attractive. Two to four sentences.'
      ),
    usualClothes: z
      .string()
      .describe('What she usually wears, as a noun phrase an image model can draw: garments, colours, accessories. Starts lower case, e.g. "a fitted grey coat over...".'),
    personality: z.string().describe('Two or three sentences on what she is like.'),
    traitIds: z.array(one(content.traits.map((t) => t.id))).max(3).describe('Traits from the game\'s library that fit her.'),
    likes: z.array(z.string()).max(5).describe('Kinds of gift she loves. Use the gift tags given where they fit; others are allowed.'),
    dislikes: z.array(z.string()).max(4).describe('Kinds of gift she dislikes, likewise.'),
    admires: z.array(z.enum(STATS)).max(3).describe('The stats she is drawn to in the player.'),
    kind: z.enum(['student', 'teacher', 'outsider']).describe('What she is to the University.'),
    studies: subject.optional().describe('For a student only: her own subject.'),
    teaching: z
      .object({
        department: z.string().describe('"the College of ..." she belongs to.'),
        title: z.string().describe('How she is styled before her name: "Professor", "Dr", "Coach".'),
        subjects: z.array(subject).min(1).max(2)
      })
      .optional()
      .describe('For a teacher only: what she teaches.'),
    room: z.object({
      name: z.string().describe('What her room is, in a few words: "a garret at the Honeyed Bee".'),
      description: z
        .string()
        .describe('What the room looks like, as a picture: the space, the things in it, the light. Never "she" or "her". Three or four sentences.'),
      locationId: location.describe('The location it is in.')
    }),
    schedule: z
      .array(
        z.object({
          weekdays: z.array(one(content.calendar.weekdays)).optional().describe('Left out, any day.'),
          periods: z.array(one(content.calendar.periods.map((p) => p.id))).optional().describe('Left out, any time of day.'),
          locationId: location
        })
      )
      .min(2)
      .max(6)
      .describe('Where she is found. The first line that matches wins, so particular days come first and a general line last.'),
    ai: z.object({
      speechPattern: z.string().describe('How she talks: rhythm, vocabulary, habits. Two sentences.'),
      tone: z.string().describe('Three or four words.'),
      verbalQuirks: z.array(z.string()).max(3),
      backstory: z
        .string()
        .describe(
          'Several short paragraphs: her studies or post, where she comes from, her own magic, and how she lives with the Bloom. Her life as it is before she meets the player: he is not in it.'
        ),
      secret: z.string().describe('One thing about herself that she keeps from everyone but those closest to her.'),
      extraInstructions: z.string().describe('Two or three sentences of direction to whoever writes her lines.')
    })
  })
}
export type CharacterDraft = z.infer<ReturnType<typeof draftSchema>>

/** The prompt asking the LLM to write a new love interest from the user's idea, as one JSON object. */
export function buildDraftPrompt(content: ContentPack, idea: string): { system: string; user: string } {
  const schema = z.toJSONSchema(draftSchema(content), { io: 'input' })
  const lore = content.codex.filter((entry) => entry.alwaysInclude && entry.startsUnlocked)
  const tags = [...new Set(content.items.flatMap((item) => item.tags))].sort()
  const system = [
    'You write a new love interest for a dating sim, as a character file. Every character in it is an adult.',
    'Reply with only one JSON object and nothing else: no prose, no code fence. It must be valid against this JSON Schema, which is ' +
      "generated from the game's own definition of a character. Use only the values each enum allows, and respect every limit:",
    JSON.stringify(schema),
    'Each field\'s "description" in the schema says what belongs in it. Write every text field in full; leave nothing as a placeholder.',
    'Make her a distinct person who fits the setting and does not repeat an existing character: her own background, voice, wants and flaws.',
    'Write her as she is before she has met the player. Nothing in the file names him, says how she feels about him, or gives the two of them any history, tie or plan: what they become is played out in the game.'
  ].join('\n\n')

  const user = [
    ...(lore.length > 0 ? ['Setting:', ...lore.map((e) => `- ${e.title}: ${e.content}`), ''] : []),
    'Locations (id: what it is):',
    ...content.locations.map((l) => `- ${l.id}: ${l.name}. ${l.description}`),
    '',
    'Traits (id: meaning):',
    ...content.traits.map((t) => `- ${t.id}: ${t.definition}`),
    '',
    `Gift tags in the game: ${tags.join(', ')}.`,
    '',
    'Characters who already exist; she must not share a name, a catalogue code or a concept with any of them:',
    ...content.loveInterests.map((li) => `- ${li.name}, ${li.age}: ${li.bio}${li.studies ? ` [${li.studies.code}]` : ''}${li.teaching ? ` [${li.teaching.subjects.map((s) => s.code).join(', ')}]` : ''}`),
    '',
    `The idea for the new character: ${idea.trim()}`
  ].join('\n')
  return { system, user }
}

/** The first JSON object in a reply, whatever was written around it. */
function extractObject(reply: string): unknown {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('The reply held no character.')
  try {
    return JSON.parse(reply.slice(start, end + 1))
  } catch {
    throw new Error('The reply was not readable as a character.')
  }
}

/**
 * Turns the LLM's reply into a love interest for the editor to open, unsaved: checked
 * against the schema it was shown, given an id nobody has, the four standard outfits and a
 * secret kept until she is close. Throws, saying why, when the reply can't be used.
 */
export function parseDraft(content: ContentPack, reply: string): LoveInterest {
  const parsed = draftSchema(content).safeParse(extractObject(reply))
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(`The character that came back did not fit: ${first?.path.join('.') || 'it'}: ${first?.message}`)
  }
  const { usualClothes, ai, studies, teaching, kind, ...rest } = parsed.data
  const { secret, ...voice } = ai

  const taken = new Set([...content.loveInterests, ...content.npcs].map((c) => c.id))
  const base = slugify(rest.name.split(' ')[0]) || 'new-character'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`

  const stages = content.relationships.stages
  return LoveInterestSchema.parse({
    ...rest,
    id,
    handle: rest.handle.replace(/^@/, ''),
    kind,
    // Each kind keeps only what belongs to it.
    studies: kind === 'student' ? studies : undefined,
    teaching: kind === 'teacher' ? teaching : undefined,
    outfits: STANDARD_OUTFITS.map((outfit) => (outfit.id === 'default' ? { ...outfit, description: usualClothes } : outfit)),
    defaultOutfitId: 'default',
    imageSeed: DEFAULT_IMAGE_SEED,
    ai: {
      ...voice,
      secrets: secret.trim() ? [{ text: secret.trim(), revealWhen: [{ type: 'stage', min: stages.at(-2)?.id ?? stages[0].id }] }] : []
    }
  })
}
