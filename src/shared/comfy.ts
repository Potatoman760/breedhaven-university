import { z } from 'zod'
import { basePoseId, DEFAULT_VIEW, outfitParts, type Location, type LoveInterest, type Npc, pronounWords } from './model'

/**
 * The art studio's link to the user's own ComfyUI. It is a tool the user calls directly to
 * make sprites and backgrounds (and, later, photos); nothing in a scene ever calls it.
 *
 * ComfyUI has no "draw this" endpoint: a request is a whole workflow graph. So the game
 * carries its own workflows, exported in API format, in its content (`comfy/`), and the app
 * writes the prompt, the size and the seed into the right places in one of them. Those places are the bindings
 * below, worked out by reading the graph (`main/comfy/graph.ts`) and correctable by hand.
 */

/** What a picture is for. Each kind has its own default workflow, size and framing words. */
export const ART_KINDS = ['sprite', 'background', 'photo', 'nsfw', 'birth'] as const
export type ArtKind = (typeof ART_KINDS)[number]

export const ART_KIND_LABELS: Record<ArtKind, string> = {
  sprite: 'Sprite',
  background: 'Background',
  photo: 'Photo',
  nsfw: 'NSFW picture',
  birth: 'Birth picture'
}

/** What a workflow can be the default for: each kind of picture, and the clips made from the NSFW pictures. */
export const WORKFLOW_KINDS = [...ART_KINDS, 'video'] as const
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number]

export const WORKFLOW_KIND_LABELS: Record<WorkflowKind, string> = { ...ART_KIND_LABELS, video: 'Video clip' }

/**
 * A place in a graph the app may write to. Nothing is written to `output`: it names whose pictures to collect.
 * `firstFrame` and `lastFrame` are the pictures a video workflow starts from and ends on: a workflow with
 * somewhere to put a first frame is a video workflow, and makes clips and not pictures. `length` is how long its
 * clip runs, in seconds.
 */
export const BINDING_SLOTS = ['positive', 'negative', 'width', 'height', 'seed', 'firstFrame', 'lastFrame', 'length', 'output'] as const
export type BindingSlot = (typeof BINDING_SLOTS)[number]

export const SLOT_LABELS: Record<BindingSlot, string> = {
  positive: 'Prompt',
  negative: 'Negative prompt',
  width: 'Width',
  height: 'Height',
  seed: 'Seed',
  firstFrame: 'First frame',
  lastFrame: 'Last frame',
  length: 'Length (seconds)',
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
// A clip is many frames: ten seconds of video takes several times what a picture does.
export const COMFY_DEFAULT_VIDEO_TIMEOUT_SECONDS = 1200
export const COMFY_MAX_VIDEO_TIMEOUT_SECONDS = 7200
// How long a clip runs, in seconds, unless the studio is told otherwise; and as long as one may be asked to.
export const DEFAULT_CLIP_SECONDS = 10
export const MAX_CLIP_SECONDS = 60

const SizeSchema = z.object({
  width: z.number().int().min(64).max(8192),
  height: z.number().int().min(64).max(8192)
})

/** The size each kind is drawn at unless the studio is told otherwise. Sprites match the game's own, 9:16. */
export const DEFAULT_SIZES: Record<ArtKind, { width: number; height: number }> = {
  sprite: { width: 1080, height: 1920 },
  background: { width: 1920, height: 1080 },
  photo: { width: 1024, height: 1024 },
  nsfw: { width: 1920, height: 1080 },
  birth: { width: 1920, height: 1080 }
}

/** Words that close every prompt of a kind, after its subject: how the picture is framed, not what is in it. */
export const DEFAULT_FRAMING: Record<ArtKind, string> = {
  sprite: 'three-quarter shot from knees up, standing, facing forward\n\nplain white background',
  background: 'wide establishing shot, no people',
  photo: 'phone photo, natural light',
  nsfw: 'wide cinematic shot, bedroom, soft warm light',
  birth: 'wide cinematic shot, a bright modern hospital maternity room, soft daylight'
}

/**
 * What a clip of a pose is asked for with, by pose id. Unlike a picture's prompt it is not written from the
 * character: the picture it starts from already shows her, so only what moves is said, and that is the same
 * for everyone. None is written yet, so each pose uses the general one below until it has its own.
 */
export const DEFAULT_VIDEO_PROMPTS: Record<string, string> = {}

/** What a clip is asked for with when nothing is written for its pose. */
export const DEFAULT_VIDEO_PROMPT =
  'static camera\n\nShe moves slowly and steadily in the pose she is in, breathing, her hair shifting a little. The motion is smooth and ends as it began.\n\nAudio: soft ambient room noise'

export const ComfySettingsSchema = z.object({
  /** Where ComfyUI answers. */
  baseUrl: z.string().default(COMFY_DEFAULT_BASE_URL),
  /** The folder ComfyUI keeps its models in, where downloaded ones are put. Null until it is found or chosen. */
  modelsDir: z.string().nullable().default(null),
  /** How long one generation may take. */
  timeoutSeconds: z.number().int().min(COMFY_MIN_TIMEOUT_SECONDS).max(COMFY_MAX_TIMEOUT_SECONDS).default(COMFY_DEFAULT_TIMEOUT_SECONDS),
  /** How long one clip may take. */
  videoTimeoutSeconds: z.number().int().min(COMFY_MIN_TIMEOUT_SECONDS).max(COMFY_MAX_VIDEO_TIMEOUT_SECONDS).default(COMFY_DEFAULT_VIDEO_TIMEOUT_SECONDS),
  /**
   * Text put before the prompt, by workflow file name. Per workflow because LoRA triggers
   * and model tokens that help one graph are meaningless or harmful in another.
   */
  promptPrefixes: z.record(z.string(), z.string()).default({}),
  /** Text put before the negative prompt, by workflow file name. */
  negativePrefixes: z.record(z.string(), z.string()).default({}),
  /** Hand corrections to the bindings, by workflow file name. */
  overrides: z.record(z.string(), BindingOverrideSchema).default({}),
  /** The workflow each kind of picture uses when none is picked, by file name; and the one clips are made with. */
  defaults: z.partialRecord(z.enum(WORKFLOW_KINDS), z.string()).default({}),
  /** Framing words for each kind, in place of the built-in ones. */
  framing: z.partialRecord(z.enum(ART_KINDS), z.string()).default({}),
  /** The size each kind is drawn at, in place of the built-in ones. */
  sizes: z.partialRecord(z.enum(ART_KINDS), SizeSchema).default({}),
  /** What a clip of each pose is asked for with, by pose id, in place of the built-in ones. */
  videoPrompts: z.record(z.string(), z.string()).default({}),
  /** Whether a clip is made to loop: asked to end on the picture it starts from, so that it goes round without a jump. One that is not is played once. */
  videoLastFrame: z.boolean().default(false),
  /** How long a clip runs, in seconds. */
  videoSeconds: z.number().min(1).max(MAX_CLIP_SECONDS).default(DEFAULT_CLIP_SECONDS)
})
export type ComfySettings = z.infer<typeof ComfySettingsSchema>

/**
 * What the game itself says of its workflows: the parts of the settings that are about a workflow or a kind of
 * picture, and nothing of the player's own machine. Kept in the content beside the workflows, and read under
 * whatever a player has changed for themselves.
 */
export const ComfyBundleSettingsSchema = ComfySettingsSchema.pick({ promptPrefixes: true, negativePrefixes: true, overrides: true, defaults: true, framing: true, sizes: true, videoPrompts: true })
export type ComfyBundleSettings = z.infer<typeof ComfyBundleSettingsSchema>

/** The game's workflows, and what each calls for that the player has to fetch themselves. */
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

/** One model file the game's workflows call for, and where it comes from. */
export const ModelDownloadSchema = z.object({
  /** Its path inside its folder, as the workflow names it, with forward slashes: `krea2/style.safetensors`. */
  file: z.string(),
  /** The folder of ComfyUI's models it belongs in: `diffusion_models`, `loras`, `vae`. */
  folder: z.string(),
  /** What it is, for a person. */
  name: z.string().default(''),
  /** For one on Civitai: the id of the version to fetch. Adult-rated ones need the player's own key. */
  civitaiVersionId: z.number().int().optional(),
  /** For one anywhere else: the address of the file itself. */
  url: z.string().optional(),
  /** Its page, to read about it or fetch it by hand. */
  page: z.string(),
  /** About how big it is. */
  sizeMb: z.number().min(0),
  /** What it must hash to, so that a broken or wrong download is not kept. */
  sha256: z.string().optional()
})
export type ModelDownload = z.infer<typeof ModelDownloadSchema>

/** A pack of custom nodes a workflow needs, which the player installs into ComfyUI himself. */
export const NodePackSchema = z.object({
  name: z.string(),
  /** The kinds of node it brings, as a workflow names them. */
  provides: z.array(z.string()).default([]),
  page: z.string()
})
export type NodePack = z.infer<typeof NodePackSchema>

export const ComfyDownloadsSchema = z.object({
  models: z.array(ModelDownloadSchema).default([]),
  nodes: z.array(NodePackSchema).default([])
})
export type ComfyDownloads = z.infer<typeof ComfyDownloadsSchema>

/** What there is to download, as the window is told it: each model with whether it is already there. */
export interface ComfyDownloadList {
  models: (ModelDownload & { present: boolean })[]
  nodes: NodePack[]
  /** Where models are put, once it is known. */
  modelsDir: string | null
  /** Whether a Civitai key is kept. The key itself never leaves the main process. */
  hasCivitaiKey: boolean
}

/** What came of downloading one model. */
export interface ModelDownloadResult {
  ok: boolean
  file: string
  message: string
}

/** How far a download has got, in bytes. */
export interface ModelDownloadProgress {
  file: string
  received: number
  total: number
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

/** What a clip of a pose is asked for with. One drawn pregnant moves as the pose it is built on does. */
export function videoPromptFor(settings: Pick<ComfySettings, 'videoPrompts'>, poseId: string): string {
  const pose = basePoseId(poseId)
  return settings.videoPrompts[pose] ?? DEFAULT_VIDEO_PROMPTS[pose] ?? DEFAULT_VIDEO_PROMPT
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

export const GenerateVideoRequestSchema = z.object({
  /** Whose clip it is: decides the folder. */
  subjectId: z.string().max(64).default(''),
  /** What the file is called, before a number is added to keep it from replacing another. */
  name: z.string().max(64).default(''),
  /** Workflow file name. Empty means the default for clips, or failing that the first that takes a first frame. */
  workflow: z.string().default(''),
  /** The picture the clip starts from, by its content path. */
  image: z.string().min(1),
  /** What moves in it. */
  prompt: z.string().max(8000),
  /** The picture the clip ends on, by its content path: the same one, for a clip that loops; another, for a pose that ends somewhere else. Left out, it ends where it goes. */
  lastImage: z.string().min(1).optional(),
  /** How long it runs, in seconds. Left out, as long as the workflow has it. */
  seconds: z.number().min(1).max(MAX_CLIP_SECONDS).optional(),
  /** Left out, a new one is drawn each time. */
  seed: z.number().int().min(0).optional()
})
export type GenerateVideoRequest = z.input<typeof GenerateVideoRequestSchema>

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

/**
 * The prompt for the picture of a character just after she has given birth, which is the whole stage of the scene of
 * a birth he is there for: her body, that she is in a hospital bed in a gown with the child in her arms, and how the
 * picture is framed, each a paragraph. She is no longer drawn pregnant: the child is born.
 */
export function birthPrompt(who: Pick<LoveInterest | Npc, 'appearance'> & { pronouns?: string }, framing: string): string {
  const { subject } = pronounWords(who.pronouns)
  const She = `${subject[0].toUpperCase()}${subject.slice(1)}`
  return paragraphs([
    paragraph(who.appearance),
    paragraph(`${She} ${subject === 'they' ? 'wear' : 'wears'} a pale hospital gown`),
    paragraph(`${She} ${subject === 'they' ? 'sit' : 'sits'} propped up on pillows in a hospital bed, cradling a newborn baby wrapped in a soft blanket in ${subject === 'they' ? 'their' : subject === 'he' ? 'his' : 'her'} arms, smiling down at it, tired and radiant`),
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

/** How a picture posted on Bloomr was taken: by her, of herself, or of her by someone out of the frame. Whoever writes the post says which. */
export const SHOTS = ['selfie', 'candid'] as const
export type Shot = (typeof SHOTS)[number]

/**
 * The prompt for a picture posted on Bloomr. Whoever is in it is said in one paragraph and no more: what kind of
 * picture it is, how she looks, what she wears and what she is doing, all of the one subject. Said in pieces, an
 * image model takes each piece for another person and draws her twice. After it, the place behind, the light, and how
 * it is framed.
 */
export function postPrompt(
  author: Sitter,
  friend: Sitter | undefined,
  shot: Shot,
  moment: string,
  place: Pick<Location, 'appearance'> | undefined,
  light: string,
  framing: string
): string {
  const wearing = (who: Sitter): string => {
    const { subject } = pronounWords(who.pronouns)
    return who.wears.trim() === '' ? '' : paragraph(`${subject[0].toUpperCase()}${subject.slice(1)} ${subject === 'they' ? 'wear' : 'wears'} ${who.wears}`)
  }
  const lead = friend
    ? shot === 'selfie'
      ? 'A phone selfie of two friends close together'
      : 'A candid phone photo of two friends together'
    : shot === 'selfie'
      ? 'A close-up phone selfie of one person, solo'
      : 'A candid phone photo of one person, solo'
  const { object } = pronounWords(author.pronouns)
  return paragraphs([
    [paragraph(lead), paragraph(author.appearance), wearing(author), friend && paragraph(`Beside ${object}, a friend: ${friend.appearance}`), friend && wearing(friend), paragraph(moment)].filter(Boolean).join(' '),
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
