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

  save(slotId: SlotId, data: SaveData, now = new Date()): SaveSummary {
    const file: SaveFile = { version: SAVE_VERSION, savedAt: now.toISOString(), ...data }
    mkdirSync(this.dir, { recursive: true })
    // Write to a temporary file first so a crash mid-write can't destroy the existing save.
    const path = this.path(slotId)
    writeFileSync(`${path}.tmp`, JSON.stringify(file))
    renameSync(`${path}.tmp`, path)
    return summarize(slotId, file)
  }

  load(slotId: SlotId): SaveData {
    const path = this.path(slotId)
    if (!existsSync(path)) throw new Error(`${slotLabel(slotId)} is empty`)
    try {
      const { state, scene, turns } = this.read(path)
      return { state, scene, turns }
    } catch {
      throw new Error(
        `${slotLabel(slotId)} could not be read. It may be damaged or from a different version of the game.`
      )
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
    inScene: file.scene !== null
  }
}
