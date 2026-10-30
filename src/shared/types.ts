import { BANTER_MOMENTS, type BanterLine } from './game/banter'
import { MOMENTS } from './game/momentLines'
import type { CoursePick } from './game/coursePick'
import { z } from 'zod'
import type { LoveInterest, Major } from './model'
import type { MajorIdea } from './game/draftMajor'
import type { Card } from './game/sillyCard'
import type { ComfyBundle, ComfyBundleCheck, ComfyDownloadList, ComfySettings, ModelDownloadProgress, ModelDownloadResult, ComfyTestResult, CutoutRequest, CutoutResult, GenerateArtRequest, GenerateArtResult, GenerateVideoRequest, WorkflowListResult } from './comfy'
import {
  GameStateSchema,
  PostPlanSchema,
  SceneSchema,
  type CalendarEvent,
  type ChatMessage,
  type ContentPack,
  type BondProposal,
  type DepartureFeeling,
  type Proposal
} from './model'
import type { EditorInfo, EditorResult, ImportAssetRequest, LookKind, OptimizedPicture } from './editor'
import type { Language, Messages } from './i18n'
import type { MemoryLevel } from './model'
import type { PostDraft } from './game/feed'
import type { Outing } from './game/outing'
import type { SceneLook } from './game/scene'
import type { RenameSaveRequest, SaveData, SaveRequest, SaveSummary, SlotId } from './saves'
import type {
  ListModelsRequest,
  ListModelsResponse,
  LlmProfileId,
  SettingsUpdate,
  SettingsView
} from './settings'

/** Sent for both chat turns and end-of-scene summaries. */
export const SceneRequestSchema = z.object({
  state: GameStateSchema,
  scene: SceneSchema
})
export type SceneRequest = z.infer<typeof SceneRequestSchema>

export interface ChatResponse {
  message: ChatMessage
  /** The system prompt the main process assembled for this turn, for debugging. */
  systemPrompt: string
  /** Which LLM answered. The NSFW one takes over when the Main LLM declines. */
  profileId: LlmProfileId
  /** The character brought the scene to a close with this reply. */
  sceneEnded: boolean
  /** Any change of outfit, expression or animation the character asked for. */
  look: SceneLook
  /** The same for the other love interests in the scene, by id: the face each was given, and any change of outfit. */
  looks: Record<string, { outfitId?: string; expression?: string }>
  /** A plan to meet later that the character has just suggested, for the player to accept or decline. */
  proposal?: Proposal
  /** The plan suggested earlier in the scene was agreed to in words, and is to be put in the calendar. */
  proposalAccepted?: boolean
  /** Where the character took the scene with the move tool: a location id, or `room-of-<love interest id>`. */
  moveTo?: string
  /** The characters set off with the player for the next thing on his timetable, which they are in too: the scene ends, and that is what comes next. */
  walkTo?: { withIds: string[] }
  /** Who said in this reply that she would be at an event, and which. */
  attending?: { eventId: string; ids: string[] }[]
  /** They went to sleep for the night where they were: the scene ends there, and once it is settled he wakes in the morning in the same place. */
  sleptOver?: boolean
  /** How comfortable each love interest said she was in this reply, by id. Kept on the scene for the LLM; never shown. */
  comfort: Record<string, { level: number; reason: string }>
  /** Love interests who gave the player their Bloomr in this reply. */
  contacts: string[]
  /** Love interests who left the scene in this reply, with how they felt and why. The scene goes on without them. */
  left?: { ids: string[]; feeling: DepartureFeeling; reason: string }
  /** Whole hours the character added with the time tool. */
  hours?: number
  /** Dice the character rolled while writing the reply, each as a line to show the player. */
  rolls: string[]
  /** Love interests the reply says could have conceived. The game decides whether they did. */
  seededIds: string[]
  /** Love interests who have said in the reply that they will stop taking what they take against the Bloom. */
  offControlIds: string[]
  /** A change to the relationship the character has just asked for, for the player to accept or decline. */
  bondProposal?: BondProposal
}

export interface SummarizeResponse {
  /** The memory each love interest in the scene keeps of it, by id. */
  memories: Record<string, string>
  /** How much each of those memories matters to her, by id. */
  levels: Record<string, MemoryLevel>
  /** How the scene changed what each love interest feels for the player, by id, and why. None for an NPC. */
  feelings: Record<string, { affection: number; trust: number; desire: number; reason: string }>
  /** The love interests who had sex with the player in the scene, by id. */
  intimate: string[]
  /** What the player found out about the love interests in the scene, as each one's summary told it. */
  revealed: { loveInterestId: string; factId: string }[]
  /** Pairs of love interests who became friends, enemies or neither over the scene. */
  rapport: { a: string; b: string; relation: 'friends' | 'enemies' | 'neither' }[]
  /** What the player paid for in the scene and what it came to, when he paid for anything. */
  spending?: { amount: number; on: string }
  /** Set when the LLM could not be used for at least one of them, which then got the plain fallback note. */
  error?: string
}

export const GenerateEventsRequestSchema = z.object({ state: GameStateSchema })
export type GenerateEventsRequest = z.infer<typeof GenerateEventsRequestSchema>

export const PlanOutingRequestSchema = z.object({ state: GameStateSchema, text: z.string().min(1).max(500) })
export type PlanOutingRequest = z.infer<typeof PlanOutingRequestSchema>

export interface PlanOutingResponse {
  outing: Outing
  /** Set when the LLM could not be used and the outing was read off the player's words alone. */
  error?: string
}

/** What he says he wants of his term, for the LLM to choose his courses from. */
export const PickCoursesRequestSchema = z.object({ state: GameStateSchema, text: z.string().min(1).max(500) })
export type PickCoursesRequest = z.infer<typeof PickCoursesRequestSchema>

/** The game as a fight below begins, for the party's few words before it. */
export const BanterRequestSchema = z.object({ state: GameStateSchema, moment: z.enum(BANTER_MOMENTS).default('before') })
export type BanterRequest = z.input<typeof BanterRequestSchema>

export const MomentLinesRequestSchema = z.object({
  state: GameStateSchema,
  ids: z.array(z.string()).min(1).max(3),
  moment: z.enum(MOMENTS),
  history: z.array(z.object({ speaker: z.string(), text: z.string() })).default([])
})
export type MomentLinesRequest = z.input<typeof MomentLinesRequestSchema>

export interface BanterResponse {
  /** What was said, in order. None when the LLM could not be used, or said nothing that could be read. */
  lines: BanterLine[]
}

export const CourierRequestSchema = z.object({
  state: GameStateSchema,
  loveInterestId: z.string(),
  /** True for a note the love interest sends unprompted, inviting the player to something. */
  invite: z.boolean().default(false),
  /** True for a message she sends unprompted about whatever is on her mind, with no invitation needed. */
  note: z.boolean().default(false),
  /** News the love interest writes to tell, unprompted. Takes the place of an invitation. */
  news: z.string().max(600).optional()
})
export type CourierRequest = z.input<typeof CourierRequestSchema>

export interface CourierResponse {
  /** The note. Empty only for an invitation that could not be made at all. */
  text: string
  /** A plan the note suggests, for the player to accept or decline. */
  proposal?: Proposal
  /** Events she said in the note that she would be at. */
  attending?: { eventId: string; ids: string[] }[]
  /** Ids of the facts about herself that the note let out. */
  revealed?: string[]
  /** The shift the player's boss has accepted he will miss, when the note was to her and said so. */
  excused?: string
  error?: string
}

export const FeedRequestSchema = z.object({
  state: GameStateSchema,
  /** The posts planned for today. */
  plans: z.array(PostPlanSchema).min(1).max(12)
})
export type FeedRequest = z.input<typeof FeedRequestSchema>

export interface FeedResponse {
  /** The day's posts with their captions written, earliest first, each still to have its selfie drawn. */
  drafts: PostDraft[]
  /** Why there are none: the Main LLM or ComfyUI is not set up, or the LLM could not be reached. */
  error?: string
  /** Why there are fewer than were planned, when some were written and some were not. */
  shortfall?: string
}

export const FeedPictureRequestSchema = z.object({
  authorId: z.string(),
  /** What the file is called, before a number is added to keep it from replacing another. */
  name: z.string().max(64),
  prompt: z.string().max(8000)
})
export type FeedPictureRequest = z.input<typeof FeedPictureRequestSchema>

/** A picture the player took in a scene: its caption and its path in the content, or why there is none. */
export interface ScenePhotoResponse {
  text?: string
  image?: string
  /** What each of those in it said under it, posted with it. */
  comments?: { authorId: string; text: string }[]
  error?: string
}

export interface FeedPictureResponse {
  /** The selfie's path in the content, or null when it could not be drawn. */
  image: string | null
  error?: string
}

export interface TestConnectionResponse {
  ok: boolean
  message: string
}

/** API exposed to the renderer by the preload script as `window.api`. */
/** The language the game is in, its translation of the game's own text, and the languages there are to choose from. */
export interface LanguageView {
  language: string
  messages: Messages
  languages: Language[]
}

export interface RendererApi {
  getContent(): Promise<ContentPack>
  getLanguage(): Promise<LanguageView>
  /** Changes the language, and with it the content: what comes back is the content as it reads in the new one. */
  setLanguage(language: string): Promise<LanguageView & { content: ContentPack }>
  /** The system's spell checker, asked a word at a time: whether it is misspelled, and what it might have been. */
  spell: { misspelled(word: string): boolean; suggestions(word: string): string[] }
  chat(request: SceneRequest): Promise<ChatResponse>
  /** Stops the scene reply being written. The call to chat then fails with CHAT_CANCELLED. */
  cancelChat(): Promise<void>
  /**
   * Hears, while a reply is still being written, that the scene is going somewhere: the character has called for the move and
   * the leaving and arriving are being written. Given what to say of it: "Going to the Library". Returns what stops the listening.
   */
  onSceneMoving(listener: (where: string) => void): () => void
  summarize(request: SceneRequest): Promise<SummarizeResponse>
  /** Asks the Main LLM to invent upcoming calendar events. May return fewer than asked, or none. */
  generateEvents(request: GenerateEventsRequest): Promise<CalendarEvent[]>
  /** Draws up a new game's course catalogue. Never rejects; without an LLM the wording is plain. */
  /** Works out what the player means by something they typed to do. Never rejects. */
  planOuting(request: PlanOutingRequest): Promise<PlanOutingResponse>
  /** Has the LLM choose his courses from what he says he wants. Rejects when it cannot be reached, or names nothing he can take. */
  pickCourses(request: PickCoursesRequest): Promise<CoursePick>
  /** Has the party say a few words as a fight below begins. Never rejects: without an LLM they say nothing. */
  banter(request: BanterRequest): Promise<BanterResponse>
  momentLines(request: MomentLinesRequest): Promise<BanterResponse>
  /**
   * Has a love interest write a message in Bloomr DMs: an answer to the player's latest (rejects
   * if the LLM can't be reached), or an unprompted invitation (never rejects).
   */
  courier(request: CourierRequest): Promise<CourierResponse>
  /** Writes the captions of today's planned Bloomr posts. Never rejects; without both the Main LLM and ComfyUI set up there are none. */
  feed(request: FeedRequest): Promise<FeedResponse>
  /** Draws the selfie for one Bloomr post on ComfyUI. Never rejects. */
  feedPicture(request: FeedPictureRequest): Promise<FeedPictureResponse>
  scenePhoto(request: SceneRequest): Promise<ScenePhotoResponse>
  getSettings(): Promise<SettingsView>
  saveSettings(update: SettingsUpdate): Promise<SettingsView>
  /** Sends a tiny request through the saved settings of the given profile. */
  testConnection(profileId: LlmProfileId): Promise<TestConnectionResponse>
  /** Loads the models an endpoint offers. Never rejects; a failure comes back as `error`. */
  listModels(request: ListModelsRequest): Promise<ListModelsResponse>
  listSaves(): Promise<SaveSummary[]>
  saveGame(request: SaveRequest): Promise<SaveSummary>
  loadGame(slotId: SlotId): Promise<SaveData>
  deleteSave(slotId: SlotId): Promise<void>
  /** Gives a save a name, or with an empty one takes its name away. Rejects for a slot with nothing in it. */
  renameSave(request: RenameSaveRequest): Promise<SaveSummary>
  /** The content editor. Changes are written to the user's add-on folder, never to the game's own files. */
  editor: {
    info(): Promise<EditorInfo>
    saveLoveInterest(loveInterest: unknown): Promise<EditorResult>
    /** Removes an add-on character, or puts a changed built-in one back as it shipped. */
    deleteLoveInterest(id: string): Promise<EditorResult>
    /**
     * Has the Main LLM write a new love interest from a short idea. Nothing is saved: she comes
     * back for the editor to open. Never rejects; a failure comes back as `error`.
     */
    draftLoveInterest(idea: string): Promise<{ loveInterest?: LoveInterest; error?: string }>
    /** Has the user pick a SillyTavern card (a PNG or its JSON) and reads it; nothing if they cancelled. */
    readCard(): Promise<{ card?: Card; error?: string } | null>
    /** A new character from the card last read, unsaved: as the card has her, or with the rest written by the Main LLM. */
    fromCard(request: { generate: boolean; notes?: string }): Promise<{ loveInterest?: LoveInterest; error?: string }>
    /** Adds a subject to the University, or changes one made in the editor, with a new college if it names one. */
    saveMajor(request: { major: unknown; college?: { id: string; name: string } }): Promise<EditorResult>
    /** Takes away a subject made in the editor, while nobody reads or teaches it. */
    deleteMajor(code: string): Promise<EditorResult>
    /** Has the Main LLM write a subject's courses in full. Nothing is saved. Never rejects; a failure comes back as `error`. */
    draftMajor(idea: MajorIdea): Promise<{ major?: Major; error?: string }>
    saveTrait(trait: unknown): Promise<EditorResult>
    deleteTrait(id: string): Promise<EditorResult>
    /** Adds or changes a face (`expressions`) or a sex-act (`acts`) added to the standard ones. */
    saveLook(change: { kind: LookKind; look: unknown }): Promise<EditorResult>
    deleteLook(which: { kind: LookKind; id: string }): Promise<EditorResult>
    /** Saves a location as changed in the editor: what is said of it, and its pictures. */
    saveLocation(location: unknown): Promise<EditorResult>
    /** Puts a changed location back as it shipped. */
    deleteLocation(id: string): Promise<EditorResult>
    /** Adds a job to the game, or changes one. Only when the game's own files are being edited. */
    saveJob(job: unknown): Promise<EditorResult>
    /** Takes a job out of the game. Only when the game's own files are being edited. */
    deleteJob(id: string): Promise<EditorResult>
    /** Adds a society to the game, or changes one. Only when the game's own files are being edited. */
    saveSociety(society: unknown): Promise<EditorResult>
    /** Takes a society out of the game. Only when the game's own files are being edited. */
    deleteSociety(id: string): Promise<EditorResult>
    /** Writes the player a new game starts with: his default name, what he starts with, and his room. */
    savePlayer(newGame: unknown): Promise<EditorResult>
    /** Puts the player back as the game shipped him. */
    resetPlayer(): Promise<EditorResult>
    /** Saves the course catalogue every new game starts with. */
    saveCatalogue(catalogue: unknown): Promise<EditorResult>
    /**
     * Has the Main LLM write titles and descriptions for a batch of courses. Nothing is saved.
     * Never rejects; a failure comes back as `error`, with the courses as they were sent.
     */
    /** Has the user pick a file, copies it into the add-on folder, and returns its content path. Null if they cancelled. */
    importAsset(request: ImportAssetRequest): Promise<string | null>
    /** The bytes of one of the content's pictures, by its path. Rejects for a path outside the content. */
    readPicture(path: string): Promise<Uint8Array>
    /**
     * Files a WebP made from one of the content's pictures beside it (in the add-on folder, for a picture of the game's
     * own while an add-on is edited), and returns its path. The original goes once a save no longer names it.
     */
    saveOptimized(picture: OptimizedPicture): Promise<string>
    openFolder(): Promise<void>
  }
  /** The art studio's link to the user's own ComfyUI. Called only from the studio, never from a scene. */
  comfy: {
    getSettings(): Promise<ComfySettings>
    /** Rejects when the address is not one. */
    saveSettings(settings: ComfySettings): Promise<ComfySettings>
    /** Asks the address given whether ComfyUI is there. Never rejects. */
    test(baseUrl: string): Promise<ComfyTestResult>
    /** Reads the game's workflows, as the saved settings have them bound. */
    workflows(): Promise<WorkflowListResult>
    /** The game's workflows, and what each calls for. */
    bundle(): Promise<ComfyBundle>
    /** Asks the ComfyUI in the settings which of the models and nodes the game's workflows call for it lacks. Never rejects. */
    checkBundle(): Promise<ComfyBundleCheck>
    /** The models and node packs the game's workflows call for, with which models are already in place. */
    downloads(): Promise<ComfyDownloadList>
    /** Has the player pick his ComfyUI folder, finds where its models are kept, and remembers it. The list as it then is; unchanged if he cancelled. Rejects when no models folder is found there. */
    chooseModelsDir(): Promise<ComfyDownloadList>
    /** Keeps the player's Civitai key for downloads, or with an empty one forgets it. */
    setCivitaiKey(key: string): Promise<ComfyDownloadList>
    /** Downloads one of the listed models into its folder. One at a time. Never rejects. */
    downloadModel(file: string): Promise<ModelDownloadResult>
    /** Stops the download that is running, if one is. */
    cancelDownload(): Promise<void>
    /** Hears how far a download has got. Returns what stops the listening. */
    onDownloadProgress(listener: (progress: ModelDownloadProgress) => void): () => void
    /** Draws one picture and files it in the add-on folder. Never rejects; a failure comes back as `message`. */
    generate(request: GenerateArtRequest): Promise<GenerateArtResult>
    /** Makes one clip from a picture of the content and files it in the add-on folder. Never rejects; a failure comes back as `message`. */
    generateVideo(request: GenerateVideoRequest): Promise<GenerateArtResult>
    /** Gives up on the picture or clip being made, if one is. */
    cancel(): Promise<void>
    /** Takes the flat background out from behind a generated picture, into a new file that replaces it. Never rejects. */
    cutout(request: CutoutRequest): Promise<CutoutResult>
  }
}
