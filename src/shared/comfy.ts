import { z } from 'zod'
import { DEFAULT_VIEW, outfitParts, type Location, type LoveInterest, type Npc, pronounWords } from './model'

/**
 * The art studio's link to the user's own ComfyUI. It is a tool the user calls directly to
 * make sprites and backgrounds (and, later, photos); nothing in a scene ever calls it.
 *
 * ComfyUI has no "draw this" endpoint: a request is a whole workflow graph. So the user
 * exports their workflows in API format into a folder, and the app writes the prompt, the
 * size and the seed into the right places in one of them. Those places are the bindings
 * below, worked out by reading the graph (`main/comfy/graph.ts`) and correctable by hand.
 */

/** What a picture is for. Each kind has its own default workflow, size and framing words. */
export const ART_KINDS = ['sprite', 'background', 'photo', 'nsfw'] as const
export type ArtKind = (typeof ART_KINDS)[number]

export const ART_KIND_LABELS: Record<ArtKind, string> = {
  sprite: 'Sprite',
  background: 'Background',
  photo: 'Photo',
  nsfw: 'NSFW picture'
}

/** A place in a graph the app may write to. Nothing is written to `output`: it names whose pictures to collect. */
export const BINDING_SLOTS = ['positive', 'negative', 'width', 'height', 'seed', 'output'] as const
export type BindingSlot = (typeof BINDING_SLOTS)[number]

export const SLOT_LABELS: Record<BindingSlot, string> = {
  positive: 'Prompt',
  negative: 'Negative prompt',
  width: 'Width',
  height: 'Height',
  seed: 'Seed',
  output: 'Saved image'
}

/** One writable place: a node and one of its inputs. */
export const NodeFieldSchema = z.object({ node: z.string(), field: z.string() })
export type NodeField = z.infer<typeof NodeFieldSchema>

export type WorkflowBindings = Record<BindingSlot, NodeField | null>

/**
 * Hand corrections to what was detected. A slot being present means the user repointed
 * it; a null value means they deliberately left it unbound.
 */
export const BindingOverrideSchema = z.partialRecord(z.enum(BINDING_SLOTS), NodeFieldSchema.nullable())
export type BindingOverride = z.infer<typeof BindingOverrideSchema>

export const COMFY_DEFAULT_BASE_URL = 'http://127.0.0.1:8188'
// Long, because a large picture with an upscale pass takes minutes on a busy card.
export const COMFY_DEFAULT_TIMEOUT_SECONDS = 300
export const COMFY_MIN_TIMEOUT_SECONDS = 30
export const COMFY_MAX_TIMEOUT_SECONDS = 1800

const SizeSchema = z.object({
  width: z.number().int().min(64).max(8192),
  height: z.number().int().min(64).max(8192)
})

/** The size each kind is drawn at unless the studio is told otherwise. Sprites match the game's own, 9:16. */
export const DEFAULT_SIZES: Record<ArtKind, { width: number; height: number }> = {
  sprite: { width: 1080, height: 1920 },
  background: { width: 1920, height: 1080 },
  photo: { width: 1024, height: 1024 },
  nsfw: { width: 1920, height: 1080 }
}

/** Words that close every prompt of a kind, after its subject: how the picture is framed, not what is in it. */
export const DEFAULT_FRAMING: Record<ArtKind, string> = {
  sprite: 'three-quarter shot from knees up, standing, facing forward\n\nplain white background',
  background: 'wide establishing shot, no people',
  photo: 'candid phone photo, natural light',
  nsfw: 'wide cinematic shot, bedroom, soft warm light'
}

export const ComfySettingsSchema = z.object({
  /** Where ComfyUI answers. */
  baseUrl: z.string().default(COMFY_DEFAULT_BASE_URL),
  /** Folder of API-format workflow exports, or null when none is chosen. */
  workflowDir: z.string().nullable().default(null),
  /** How long one generation may take. */
  timeoutSeconds: z.number().int().min(COMFY_MIN_TIMEOUT_SECONDS).max(COMFY_MAX_TIMEOUT_SECONDS).default(COMFY_DEFAULT_TIMEOUT_SECONDS),
  /**
   * Text put before the prompt, by workflow file name. Per workflow because LoRA triggers
   * and model tokens that help one graph are meaningless or harmful in another.
   */
  promptPrefixes: z.record(z.string(), z.string()).default({}),
  /** Text put before the negative prompt, by workflow file name. */
  negativePrefixes: z.record(z.string(), z.string()).default({}),
  /** Hand corrections to the bindings, by workflow file name. */
  overrides: z.record(z.string(), BindingOverrideSchema).default({}),
  /** The workflow each kind of picture uses when none is picked, by file name. */
  defaults: z.partialRecord(z.enum(ART_KINDS), z.string()).default({}),
  /** Framing words for each kind, in place of the built-in ones. */
  framing: z.partialRecord(z.enum(ART_KINDS), z.string()).default({}),
  /** The size each kind is drawn at, in place of the built-in ones. */
  sizes: z.partialRecord(z.enum(ART_KINDS), SizeSchema).default({})
})
export type ComfySettings = z.infer<typeof ComfySettingsSchema>

/** What the game says of the workflows it ships with: the parts of the settings that are about a workflow or a kind of picture, and nothing of the player's own machine. */
export const ComfyBundleSettingsSchema = ComfySettingsSchema.pick({ promptPrefixes: true, negativePrefixes: true, overrides: true, defaults: true, framing: true, sizes: true })
export type ComfyBundleSettings = z.infer<typeof ComfyBundleSettingsSchema>

/** The workflows that ship with the game, and what each calls for that the player has to fetch themselves. */
export interface ComfyBundle {
  workflows: {
    file: string
    name: string
    /** Model files it loads, by the name ComfyUI knows them under. */
    models: string[]
    /** The kinds of node it is made of. Those ComfyUI does not come with are custom nodes. */
    nodes: string[]
  }[]
}

/** What came of installing the game's workflows. Null settings when it was not done; `message` says why. */
export interface ComfyBundleInstall {
  ok: boolean
  message: string
  settings: ComfySettings | null
}

/** What a running ComfyUI lacks of what the game's workflows call for. */
export interface ComfyBundleCheck {
  ok: boolean
  message: string
  missingNodes: string[]
  missingModels: string[]
}

export function framingFor(settings: Pick<ComfySettings, 'framing'>, kind: ArtKind): string {
  return settings.framing[kind] ?? DEFAULT_FRAMING[kind]
}

export function sizeFor(settings: Pick<ComfySettings, 'sizes'>, kind: ArtKind): { width: number; height: number } {
  return settings.sizes[kind] ?? DEFAULT_SIZES[kind]
}

/** A prompt with a workflow's prefix in front of it, as a paragraph of its own, when it has one. */
export function prependPrompt(prefix: string | undefined, prompt: string): string {
  const written = prefix?.trim() ?? ''
  if (written === '') return prompt
  return prompt.trim() === '' ? written : `${written}\n\n${prompt}`
}

/** The address, tidied, or why it is not one. */
export function normaliseComfyUrl(raw: string): { url: string | null; problem: string | null } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { url: null, problem: 'No address yet.' }
  // Checked before parsing: "127.0.0.1:8188" fails as unparseable, not as the missing scheme it is.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return { url: null, problem: `Include the http://: ${COMFY_DEFAULT_BASE_URL}, not ${trimmed}.` }
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { url: null, problem: `"${trimmed}" is not an address. It should look like ${COMFY_DEFAULT_BASE_URL}.` }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: null, problem: `Only http and https can be called, not ${parsed.protocol.replace(':', '')}.` }
  }
  if (parsed.hostname.length === 0) return { url: null, problem: `"${trimmed}" names no host.` }
  // Trailing slashes only: a reverse proxy may well serve ComfyUI from a sub-path.
  return { url: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, ''), problem: null }
}

export interface ComfyTestResult {
  ok: boolean
  message: string
  /** "ComfyUI 0.3.68 · NVIDIA GeForce RTX 4090 · 24.0 GB", when it said: proof the right machine answered. */
  device: string | null
}

/** One node, flattened for the binding pickers. */
export interface WorkflowNodeSummary {
  id: string
  classType: string
  /** The title the user gave it in ComfyUI, when the export carried one. */
  title: string | null
  /** Inputs holding a literal: the only ones anything can be written to. */
  fields: { name: string; value: string | number | boolean }[]
}

export interface WorkflowAnalysis {
  nodes: WorkflowNodeSummary[]
  /** The node the graph is read outwards from, when one was found. */
  sampler: string | null
  /** What reading the graph found, before any correction. */
  detected: WorkflowBindings
  /** How each was arrived at: "followed KSampler #3 positive → CLIPTextEncode #6 text". */
  notes: Partial<Record<BindingSlot, string>>
  /** Anything ambiguous or missing. */
  problems: string[]
}

/** One workflow file, read and understood as far as it could be. */
export interface WorkflowSummary {
  /** File name including `.json`: what prefixes, overrides and defaults are keyed by. */
  file: string
  /** File name without it. */
  name: string
  /** Null when the file would not parse; `problem` then says why. */
  analysis: WorkflowAnalysis | null
  problem: string | null
  /** Detected, corrected by any override, and checked against the graph. */
  bindings: WorkflowBindings
}

export interface WorkflowListResult {
  ok: boolean
  message: string
  workflows: WorkflowSummary[]
}

export const GenerateArtRequestSchema = z.object({
  kind: z.enum(ART_KINDS),
  /** Whose picture it is: a character id for a sprite, a location id for a background. Decides the folder. */
  subjectId: z.string().max(64).default(''),
  /** What the file is called, before a number is added to keep it from replacing another. */
  name: z.string().max(64).default(''),
  /** Workflow file name. Empty means the kind's default, or failing that the first that can take a prompt. */
  workflow: z.string().default(''),
  positive: z.string().max(8000),
  negative: z.string().max(8000).default(''),
  width: z.number().int().min(64).max(8192),
  height: z.number().int().min(64).max(8192),
  /** Left out, a new one is drawn each time. */
  seed: z.number().int().min(0).optional()
})
export type GenerateArtRequest = z.input<typeof GenerateArtRequestSchema>

export interface GenerateArtResult {
  ok: boolean
  message: string
  /** The picture's path in the content, served from the add-on folder. */
  path: string | null
  /** What was sent, for the record and for doing it again. */
  seed: number | null
  workflow: string | null
  positive: string | null
  /** Values asked for that the workflow had nowhere to put. */
  skipped: BindingSlot[]
}

export const CutoutRequestSchema = z.object({
  /** The picture's content path, in the add-on folder. */
  path: z.string(),
  /** How far from the border's own colour still counts as card. Left out, the usual. */
  tolerance: z.number().int().min(1).max(64).optional()
})
export type CutoutRequest = z.input<typeof CutoutRequestSchema>

export interface CutoutResult {
  ok: boolean
  /** Why not, or anything worth saying when it worked. */
  message: string
  /** The cut-out's content path. The picture it was made from is gone. */
  path: string | null
  /** The card colour that was found, as hex. */
  colour: string | null
  /** Pixels taken out entirely, given a partial alpha at the figure's edge, and taken from enclosed gaps. */
  cleared: number
  feathered: number
  enclosed: number
}

// ---- what to ask for: prompts written from the content, for the user to edit before sending

/** What is added to "she has a ... expression" for each standard face. Anything else is asked for by its own name. */
const FACES: Record<string, string> = {
  neutral: '',
  happy: 'a happy expression',
  sad: 'a sad expression',
  angry: 'an angry expression',
  surprised: 'a surprised expression, wide eyes, parted lips',
  embarrassed: 'an embarrassed expression, blushing, looking away',
  aroused: 'an aroused expression, flushed cheeks, half-lidded eyes, parted lips'
}

/** One paragraph of a prompt: trimmed, on one line, with a full stop. */
const paragraph = (text: string): string => {
  const tidy = text.trim().replace(/\s+/g, ' ')
  return tidy === '' || /[.!?]$/.test(tidy) ? tidy : `${tidy}.`
}

/** A prompt's paragraphs, a blank line between them, as the game's own sprites were written. */
const paragraphs = (parts: (string | false | undefined)[]): string => parts.filter((part): part is string => typeof part === 'string' && part.trim() !== '').join('\n\n')

/**
 * The prompt for a sprite, laid out as the prompts the game's own sprites were made
 * from: her body, what she wears, how the picture is framed, and last the look on her
 * face, each a paragraph of its own. A neutral face is asked for by saying nothing.
 * Written from `appearance` and the outfit's `description`, which is why those hold only
 * what can be drawn.
 */
export function spritePrompt(
  who: Pick<LoveInterest | Npc, 'appearance' | 'outfits'> & { pronouns?: string },
  outfitId: string,
  expression: string,
  framing: string
): string {
  const outfit = who.outfits.find((o) => o.id === outfitId)
  // What she wears first, then whatever an outfit that builds on it adds, each a paragraph.
  const [worn = '', ...added] = outfitParts(who.outfits, outfit)
  const face = expression.trim().toLowerCase().replace(/[-_]?\d+$/, '').replace(/[-_]/g, ' ')
  const look = face in FACES ? FACES[face] : face && `${/^[aeiou]/.test(face) ? 'an' : 'a'} ${face} expression`
  const { subject, has } = pronounWords(who.pronouns)
  const wears = subject === 'they' ? 'wear' : 'wears'
  return paragraphs([
    paragraph(who.appearance),
    worn && paragraph(`${subject[0].toUpperCase()}${subject.slice(1)} ${wears} ${worn}`),
    ...added.map(paragraph),
    framing.trim(),
    look && `${subject} ${has} ${look}`
  ])
}

// How each light a place is drawn in is asked for.
const LIGHT_WORDS: Record<string, string> = {
  day: 'daytime, bright natural daylight',
  night: 'night time, dark sky, lit by lamps and warm glowing lights'
}

/**
 * The prompt for a picture in a character's NSFW section: her body, that she is undressed
 * (in the words of her own nude outfit, when she has one), what the pose shows, and how
 * the picture is framed, each a paragraph, as a sprite's is written.
 */
export function nsfwPrompt(who: Pick<LoveInterest | Npc, 'appearance' | 'outfits'> & { pronouns?: string }, pose: string, framing: string, pregnant = false): string {
  // Drawn pregnant, she is in her pregnant nude: her nude, with what that outfit adds to it.
  const [bare = 'nothing at all, completely nude', ...added] = outfitParts(who.outfits, who.outfits.find((o) => o.id === (pregnant ? 'nude-pregnant' : 'nude')) ?? who.outfits.find((o) => o.id === 'nude'))
  const { subject } = pronounWords(who.pronouns)
  return paragraphs([
    paragraph(who.appearance),
    paragraph(`${subject[0].toUpperCase()}${subject.slice(1)} ${subject === 'they' ? 'wear' : 'wears'} ${bare}`),
    ...(pregnant ? (added.length > 0 ? added : ['She has a round, pregnant belly.']).map(paragraph) : []),
    paragraph(pose),
    framing.trim()
  ])
}

/** Someone in a photo: how they look and what they have on. */
export interface Sitter {
  appearance: string
  pronouns?: string
  /** What they are wearing, as an outfit describes it. Empty leaves it unsaid. */
  wears: string
}

/**
 * The prompt for a selfie posted on Bloomr: that it is one, the one taking it, the friend
 * beside them when there is one, what the picture shows, the place behind them, the light,
 * and how it is framed, each a paragraph.
 */
export function selfiePrompt(
  author: Sitter,
  friend: Sitter | undefined,
  shot: string,
  place: Pick<Location, 'appearance'> | undefined,
  light: string,
  framing: string
): string {
  const clothes = (who: Sitter): string => {
    const { subject } = pronounWords(who.pronouns)
    return who.wears.trim() === '' ? '' : paragraph(`${subject[0].toUpperCase()}${subject.slice(1)} ${subject === 'they' ? 'wear' : 'wears'} ${who.wears}`)
  }
  return paragraphs([
    friend
      ? "A selfie of two friends close together, taken at arm's length on a phone by the one in front, both looking into the camera."
      : "A selfie taken at arm's length on a phone, looking into the camera.",
    paragraph(author.appearance),
    clothes(author),
    friend && paragraph(`Beside ${pronounWords(author.pronouns).object}, a friend: ${friend.appearance}`),
    friend && clothes(friend),
    paragraph(shot),
    place && place.appearance.trim() !== '' && paragraph(`In the background: ${place.appearance}`),
    LIGHT_WORDS[light.trim().toLowerCase()],
    framing.trim()
  ])
}

/**
 * The prompt for a background: the place, the view of it (unless it is the Default one), the time of day, and how the
 * picture is framed, each a paragraph. A place given no name (a character's room, whose
 * name says whose it is and not what it looks like) is drawn from its description alone.
 */
export function backgroundPrompt(location: Pick<Location, 'name' | 'appearance' | 'indoors'>, view: string, period: string, framing: string): string {
  const named = location.name.trim() !== ''
  // The Default view is the place as it is: its name says nothing to draw, and is left out.
  const shown = view.trim().toLowerCase() === DEFAULT_VIEW.name.toLowerCase() ? '' : view.trim()
  return paragraphs([
    named && paragraph(`${location.indoors ? 'Interior of' : 'Exterior view of'} ${location.name}${shown ? `: ${shown}` : ''}`),
    !named && shown !== '' && paragraph(`View: ${shown}`),
    paragraph(location.appearance),
    period.trim() && (LIGHT_WORDS[period.trim().toLowerCase()] ?? `${period.trim()} light`),
    framing.trim()
  ])
}
