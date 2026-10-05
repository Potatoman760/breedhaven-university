import { z } from 'zod'
import { GameStateSchema, SceneSchema } from './model'

/** Bump when the save format changes in a way older code can't read. */
export const SAVE_VERSION = 1

export const AUTO_SLOT_ID = 'auto'
export const MANUAL_SLOT_IDS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6'] as const
export const SLOT_IDS = [AUTO_SLOT_ID, ...MANUAL_SLOT_IDS] as const
export const SlotIdSchema = z.enum(SLOT_IDS)
export type SlotId = z.infer<typeof SlotIdSchema>

/** Everything needed to resume play, including a scene that was still open. */
export const SaveDataSchema = z.object({
  state: GameStateSchema,
  scene: SceneSchema.nullable()
})
export type SaveData = z.infer<typeof SaveDataSchema>

export const SaveFileSchema = SaveDataSchema.extend({
  version: z.literal(SAVE_VERSION),
  /** Real-world time of the save, ISO 8601. */
  savedAt: z.string()
})
export type SaveFile = z.infer<typeof SaveFileSchema>

export const SaveRequestSchema = SaveDataSchema.extend({ slotId: SlotIdSchema })
export type SaveRequest = z.infer<typeof SaveRequestSchema>

/** What the slot list shows. Unreadable saves are listed so they aren't overwritten unknowingly. */
export type SaveSummary = { slotId: SlotId; savedAt: string } & (
  | { unreadable: false; time: number; playerName: string; inScene: boolean }
  | { unreadable: true }
)

export function slotLabel(slotId: SlotId): string {
  return slotId === AUTO_SLOT_ID ? 'Autosave' : `Slot ${slotId.slice(4)}`
}

/** The save "Continue" resumes: the most recently written readable one. */
export function latestSave(saves: SaveSummary[]): SaveSummary | undefined {
  return saves
    .filter((s) => !s.unreadable)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0]
}
