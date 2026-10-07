import { z } from 'zod'
import type { LoveInterest } from './model'
import type { ComfySettings, ComfyTestResult, CutoutRequest, CutoutResult, GenerateArtRequest, GenerateArtResult, WorkflowListResult } from './comfy'
import {
  GameStateSchema,
  SceneSchema,
  type CalendarEvent,
  type ChatMessage,
  type ContentPack,
  type Course,
  type BondProposal,
  type DepartureFeeling,
  type Proposal
} from './model'
import type { EditorInfo, EditorResult, ImportAssetRequest } from './editor'
import type { Outing } from './game/outing'
import type { SceneLook } from './game/scene'
import type { SaveData, SaveRequest, SaveSummary, SlotId } from './saves'
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
  /** Where the character took the scene with the move tool: a location id, or `room-of-<love interest id>`. */
  moveTo?: string
  /** What the player found out about the love interests in this reply. */
  revealed: { loveInterestId: string; factId: string }[]
  /** Pairs of love interests who became friends, enemies or neither in this reply. */
  rapport: { a: string; b: string; relation: 'friends' | 'enemies' | 'neither' }[]
  /** How comfortable each love interest said she was in this reply, by id. Kept on the scene for the LLM; never shown. */
  comfort: Record<string, { level: number; reason: string }>
  /** Love interests who gave the player their Chats in this reply. */
  contacts: string[]
  /** Love interests who left the scene in this reply, with how they felt and why. The scene goes on without them. */
  left?: { ids: string[]; feeling: DepartureFeeling; reason: string }
  /** Whole hours the character added with the time tool, beyond the walk of a move. */
  hours?: number
  /** Dice the character rolled while writing the reply, each as a line to show the player. */
  rolls: string[]
  /** Love interests the reply says could have conceived. The game decides whether they did. */
  seededIds: string[]
  /** A change to the relationship the character has just asked for, for the player to accept or decline. */
  bondProposal?: BondProposal
}

export interface SummarizeResponse {
  /** The memory each love interest in the scene keeps of it, by id. */
  memories: Record<string, string>
  /** How the scene changed what each love interest feels for the player, by id, and why. None for an NPC. */
  feelings: Record<string, { affection: number; trust: number; desire: number; reason: string }>
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

export const CourierRequestSchema = z.object({
  state: GameStateSchema,
  loveInterestId: z.string(),
  /** True for a note the love interest sends unprompted, inviting the player to something. */
  invite: z.boolean().default(false),
  /** News the love interest writes to tell, unprompted. Takes the place of an invitation. */
  news: z.string().max(600).optional()
})
export type CourierRequest = z.input<typeof CourierRequestSchema>

export interface CourierResponse {
  /** The note. Empty only for an invitation that could not be made at all. */
  text: string
  /** A plan the note suggests, for the player to accept or decline. */
  proposal?: Proposal
  /** Ids of the facts about herself that the note let out. */
  revealed?: string[]
  /** The shift the player's boss has accepted he will miss, when the note was to her and said so. */
  excused?: string
  error?: string
}

export const FeedRequestSchema = z.object({
  state: GameStateSchema,
  /** The love interests who post today. */
  authorIds: z.array(z.string()).min(1).max(8)
})
export type FeedRequest = z.input<typeof FeedRequestSchema>

export interface FeedResponse {
  posts: { authorId: string; text: string }[]
  /** Set when the LLM could not be used and the posts are plain ones. */
  error?: string
}

export interface CourseWordingResponse {
  /** The courses sent, with whatever titles and descriptions the LLM wrote for them. */
  courses: Course[]
  /** Set when the LLM could not be used and the courses are as they were sent. */
  error?: string
}

export interface TestConnectionResponse {
  ok: boolean
  message: string
}

/** API exposed to the renderer by the preload script as `window.api`. */
export interface RendererApi {
  getContent(): Promise<ContentPack>
  chat(request: SceneRequest): Promise<ChatResponse>
  summarize(request: SceneRequest): Promise<SummarizeResponse>
  /** Asks the Main LLM to invent upcoming calendar events. May return fewer than asked, or none. */
  generateEvents(request: GenerateEventsRequest): Promise<CalendarEvent[]>
  /** Draws up a new game's course catalogue. Never rejects; without an LLM the wording is plain. */
  /** Works out what the player means by something they typed to do. Never rejects. */
  planOuting(request: PlanOutingRequest): Promise<PlanOutingResponse>
  /**
   * Has a love interest write a message on Chats: an answer to the player's latest (rejects
   * if the LLM can't be reached), or an unprompted invitation (never rejects).
   */
  courier(request: CourierRequest): Promise<CourierResponse>
  /** Writes today's Bloomr posts for the given love interests. Never rejects; without an LLM they are plain. */
  feed(request: FeedRequest): Promise<FeedResponse>
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
    saveTrait(trait: unknown): Promise<EditorResult>
    deleteTrait(id: string): Promise<EditorResult>
    /** Saves a location as changed in the editor: what is said of it, and its pictures. */
    saveLocation(location: unknown): Promise<EditorResult>
    /** Puts a changed location back as it shipped. */
    deleteLocation(id: string): Promise<EditorResult>
    /** Saves the course catalogue every new game starts with. */
    saveCatalogue(catalogue: unknown): Promise<EditorResult>
    /**
     * Has the Main LLM write titles and descriptions for a batch of courses. Nothing is saved.
     * Never rejects; a failure comes back as `error`, with the courses as they were sent.
     */
    writeCourseWording(courses: Course[]): Promise<CourseWordingResponse>
    /** Has the user pick a file, copies it into the add-on folder, and returns its content path. Null if they cancelled. */
    importAsset(request: ImportAssetRequest): Promise<string | null>
    openFolder(): Promise<void>
  }
  /** The art studio's link to the user's own ComfyUI. Called only from the studio, never from a scene. */
  comfy: {
    getSettings(): Promise<ComfySettings>
    /** Rejects when the address is not one. */
    saveSettings(settings: ComfySettings): Promise<ComfySettings>
    /** Asks the address given whether ComfyUI is there. Never rejects. */
    test(baseUrl: string): Promise<ComfyTestResult>
    /** Has the user pick the folder their workflows are exported to. Null if they cancelled. */
    chooseFolder(): Promise<string | null>
    /** Reads the workflow folder as the saved settings have it. */
    workflows(): Promise<WorkflowListResult>
    /** Draws one picture and files it in the add-on folder. Never rejects; a failure comes back as `message`. */
    generate(request: GenerateArtRequest): Promise<GenerateArtResult>
    /** Gives up on the picture being drawn, if one is. */
    cancel(): Promise<void>
    /** Takes the flat background out from behind a generated picture, into a new file that replaces it. Never rejects. */
    cutout(request: CutoutRequest): Promise<CutoutResult>
  }
}
