import { z } from 'zod'
import {
  GameStateSchema,
  SceneSchema,
  type CalendarEvent,
  type ChatMessage,
  type ContentPack,
  type Course,
  type BondProposal,
  type Proposal
} from './model'
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
  /** A plan to meet later that the character has just suggested, for the player to accept or decline. */
  proposal?: Proposal
  /** A change to the relationship the character has just asked for, for the player to accept or decline. */
  bondProposal?: BondProposal
}

export interface SummarizeResponse {
  /** The memory each love interest in the scene keeps of it, by id. */
  memories: Record<string, string>
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
  invite: z.boolean().default(false)
})
export type CourierRequest = z.input<typeof CourierRequestSchema>

export interface CourierResponse {
  /** The note. Empty only for an invitation that could not be made at all. */
  text: string
  /** A plan the note suggests, for the player to accept or decline. */
  proposal?: Proposal
  error?: string
}

export interface GenerateCoursesResponse {
  courses: Course[]
  /** Set when the LLM could not be used and the courses carry plain placeholder wording. */
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
  generateCourses(): Promise<GenerateCoursesResponse>
  /** Works out what the player means by something they typed to do. Never rejects. */
  planOuting(request: PlanOutingRequest): Promise<PlanOutingResponse>
  /**
   * Has a love interest write a note by courier: an answer to the player's latest (rejects
   * if the LLM can't be reached), or an unprompted invitation (never rejects).
   */
  courier(request: CourierRequest): Promise<CourierResponse>
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
}
