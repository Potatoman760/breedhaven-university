import { useRef, useState } from 'react'
import { Button } from '../Button'

/** A run of work on several pictures, one after another: what it is on now, and how far along. */
export interface BatchState {
  /** What the run belongs to (an outfit, a view), so that its progress is shown in the right place. */
  key: string
  /** "Drawing", "Cutting out". */
  verb: string
  /** The one being worked on. */
  item: string
  done: number
  total: number
}

/** How one item of a run came out. A failure that is `fatal` ends the run: the rest would fail the same way. */
export type BatchOutcome = { ok: true } | { ok: false; message: string; fatal?: boolean }

/**
 * Runs a job over a list of things one at a time, keeping count for a progress bar, and
 * stopping when asked. Whatever fills in missing pictures (an outfit's expressions, a
 * view's times of day) or works through existing ones uses this.
 */
export function useBatch() {
  const [batch, setBatch] = useState<BatchState | null>(null)
  const stopped = useRef(false)

  /**
   * Does the work for each item in turn. Resolves with what could not be done, each as
   * "name (why)", and whether the run was stopped or cut short. Does nothing while
   * another run is under way.
   */
  async function run<T>(key: string, verb: string, items: T[], nameOf: (item: T) => string, work: (item: T) => Promise<BatchOutcome>): Promise<{ failed: string[]; halted: boolean }> {
    if (batch || items.length === 0) return { failed: [], halted: false }
    stopped.current = false
    const failed: string[] = []
    let halted = false
    try {
      for (const [done, item] of items.entries()) {
        if (stopped.current) {
          halted = true
          break
        }
        setBatch({ key, verb, item: nameOf(item), done, total: items.length })
        let outcome: BatchOutcome
        try {
          outcome = await work(item)
        } catch (error) {
          outcome = { ok: false, message: error instanceof Error ? error.message : String(error), fatal: true }
        }
        if (stopped.current) {
          halted = true
          break
        }
        if (!outcome.ok) {
          failed.push(`${nameOf(item)} (${outcome.message})`)
          if (outcome.fatal) {
            halted = true
            break
          }
        }
      }
    } finally {
      setBatch(null)
    }
    return { failed, halted }
  }

  /** Ends the run after the item in hand, and tells ComfyUI to drop what it is drawing. */
  function stop() {
    stopped.current = true
    window.api.comfy.cancel()
  }

  return { batch, run, stop }
}

/** The progress of a run, shown where it belongs, with a way to stop it. Nothing for any other key. */
export function BatchProgress({ batch, at, onStop }: { batch: BatchState | null; at: string; onStop: () => void }) {
  if (batch?.key !== at) return null
  return (
    <div className="batch" role="status">
      <span>
        {batch.verb} <strong>{batch.item}</strong>: {batch.done + 1} of {batch.total}
      </span>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={batch.total} aria-valuenow={batch.done}>
        <div style={{ width: `${(batch.done / batch.total) * 100}%` }} />
      </div>
      <Button onClick={onStop}>Stop</Button>
    </div>
  )
}
