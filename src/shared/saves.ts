import { z } from 'zod'
import { PackedTurnSchema } from './game/turns'
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
  scene: SceneSchema.nullable(),
  /** The lines he has said in the open scene that can still be taken back, oldest first, each as what it changed. */
  turns: z.array(PackedTurnSchema).optional()
})
export type SaveData = z.infer<typeof SaveDataSchema>

// As long as a name given to a save can be.
export const SAVE_NAME_CHARS = 40
/** A name the player gives a save, as it is kept: trimmed, and no longer than fits. Empty for none. */
export const SaveNameSchema = z.string().transform((name) => name.trim().slice(0, SAVE_NAME_CHARS))

export const SaveFileSchema = SaveDataSchema.extend({
  version: z.literal(SAVE_VERSION),
  /** What the player has called it. Left out, it goes by the name of its slot. */
  name: z.string().optional(),
  /** Real-world time of the save, ISO 8601. */
  savedAt: z.string()
})
export type SaveFile = z.infer<typeof SaveFileSchema>

export const SaveRequestSchema = SaveDataSchema.extend({
  slotId: SlotIdSchema,
  /** What to call it. Left out, a save written over another keeps the name the other had. */
  name: SaveNameSchema.optional()
})

export const RenameSaveRequestSchema = z.object({ slotId: SlotIdSchema, name: SaveNameSchema })
export type RenameSaveRequest = z.input<typeof RenameSaveRequestSchema>
export type SaveRequest = z.input<typeof SaveRequestSchema>

/** What the slot list shows. Unreadable saves are listed so they aren't overwritten unknowingly. */
export type SaveSummary = { slotId: SlotId; savedAt: string } & (
  | { unreadable: false; time: number; playerName: string; inScene: boolean; /** What the player has called it, if anything. */ name?: string }
  | { unreadable: true }
)

export function slotLabel(slotId: SlotId): string {
  return slotId === AUTO_SLOT_ID ? 'Autosave' : `Slot ${slotId.slice(4)}`
}

/** What a save goes by: the name the player gave it, or failing one, the name of its slot. */
export function saveLabel(slotId: SlotId, summary?: SaveSummary): string {
  return (summary && !summary.unreadable && summary.name) || slotLabel(slotId)
}

/** The save "Continue" resumes: the most recently written readable one. */
export function latestSave(saves: SaveSummary[]): SaveSummary | undefined {
  return saves
    .filter((s) => !s.unreadable)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0]
}
