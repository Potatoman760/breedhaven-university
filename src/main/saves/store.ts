import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SaveFileSchema,
  SAVE_VERSION,
  SLOT_IDS,
  slotLabel,
  type SaveData,
  type SaveFile,
  type SaveSummary,
  type SlotId
} from '../../shared/saves'
import { t } from '../../shared/i18n'

/** Stores each save slot as one JSON file in a directory. */
export class SaveStore {
  constructor(private readonly dir: string) {}

  list(): SaveSummary[] {
    return SLOT_IDS.flatMap((slotId): SaveSummary[] => {
      const path = this.path(slotId)
      if (!existsSync(path)) return []
      try {
        return [summarize(slotId, this.read(path))]
      } catch {
        return [{ slotId, savedAt: statSync(path).mtime.toISOString(), unreadable: true }]
      }
    })
  }

  /** Writes a game to a slot. With no name given, one written over another keeps the name the other had. */
  save(slotId: SlotId, data: SaveData, now = new Date(), name?: string): SaveSummary {
    const kept = name ?? this.nameOf(slotId)
    const file: SaveFile = { version: SAVE_VERSION, savedAt: now.toISOString(), ...(kept ? { name: kept } : {}), ...data }
    this.write(slotId, file)
    return summarize(slotId, file)
  }

  /** Calls a save something else, or with an empty name, nothing: it then goes by its slot. When it was saved is left as it was. */
  rename(slotId: SlotId, name: string): SaveSummary {
    const path = this.path(slotId)
    if (!existsSync(path)) throw new Error(t('llm.saves.empty', { slot: slotLabel(slotId) }))
    const { name: _old, ...rest } = this.read(path)
    const file: SaveFile = name ? { ...rest, name } : rest
    this.write(slotId, file)
    return summarize(slotId, file)
  }

  /** The name a slot's save has, if it has one and can be read. */
  private nameOf(slotId: SlotId): string | undefined {
    try {
      return existsSync(this.path(slotId)) ? this.read(this.path(slotId)).name : undefined
    } catch {
      return undefined
    }
  }

  private write(slotId: SlotId, file: SaveFile): void {
    mkdirSync(this.dir, { recursive: true })
    // Write to a temporary file first so a crash mid-write can't destroy the existing save.
    const path = this.path(slotId)
    writeFileSync(`${path}.tmp`, JSON.stringify(file))
    renameSync(`${path}.tmp`, path)
  }

  load(slotId: SlotId): SaveData {
    const path = this.path(slotId)
    if (!existsSync(path)) throw new Error(t('llm.saves.empty', { slot: slotLabel(slotId) }))
    try {
      const { state, scene, turns } = this.read(path)
      return { state, scene, turns }
    } catch {
      throw new Error(t('llm.saves.unreadable', { slot: slotLabel(slotId) }))
    }
  }

  delete(slotId: SlotId): void {
    rmSync(this.path(slotId), { force: true })
  }

  private path(slotId: SlotId): string {
    return join(this.dir, `${slotId}.json`)
  }

  private read(path: string): SaveFile {
    return SaveFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  }
}

function summarize(slotId: SlotId, file: SaveFile): SaveSummary {
  return {
    slotId,
    savedAt: file.savedAt,
    unreadable: false,
    time: file.state.time,
    playerName: file.state.player.name,
    inScene: file.scene !== null,
    name: file.name || undefined
  }
}
