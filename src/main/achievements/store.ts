import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import { ACHIEVEMENTS, type AchievementId } from '../../shared/game/achievements'

const FileSchema = z.object({ unlocked: z.record(z.string(), z.string()).default({}) })

/**
 * The achievements earned on this install, with when each was, kept in the user data folder apart from the saves.
 * What else hears of one as it is earned is told by `onUnlock`: Steam, once the game is on it.
 */
export class AchievementStore {
  private unlocked: Record<string, string>

  constructor(
    private readonly path: string,
    private readonly onUnlock: (id: AchievementId) => void = () => undefined
  ) {
    let raw: unknown = {}
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      // Missing or unreadable: nothing earned yet.
    }
    const parsed = FileSchema.safeParse(raw)
    this.unlocked = parsed.success ? parsed.data.unlocked : {}
  }

  /** Every one earned, by id, with when. One the game no longer has is left out. */
  list(): Partial<Record<AchievementId, string>> {
    return Object.fromEntries(Object.entries(this.unlocked).filter(([id]) => (ACHIEVEMENTS as readonly string[]).includes(id)))
  }

  /** Earns those of these not already earned, and says which they were. */
  unlock(ids: readonly string[], now = new Date()): AchievementId[] {
    const fresh = [...new Set(ids)].filter((id): id is AchievementId => (ACHIEVEMENTS as readonly string[]).includes(id) && !(id in this.unlocked))
    if (fresh.length === 0) return []
    for (const id of fresh) this.unlocked[id] = now.toISOString()
    mkdirSync(dirname(this.path), { recursive: true })
    // Written to one side and moved into place, so that a crash mid-write leaves the old file and not half a new one.
    writeFileSync(`${this.path}.tmp`, `${JSON.stringify({ unlocked: this.unlocked }, null, 2)}\n`)
    renameSync(`${this.path}.tmp`, this.path)
    for (const id of fresh) this.onUnlock(id)
    return fresh
  }
}
