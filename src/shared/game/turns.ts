import { z } from 'zod'
import type { GameState, Scene } from '../model'

/**
 * A turn the player has taken in a scene, kept so that it can be taken back: the line he
 * said, and the game and the scene as they stood just before he said it.
 */
export interface Turn {
  state: GameState
  scene: Scene
  text: string
}

// How many of his lines in a scene can be taken back, one after another.
export const MAX_TURNS_KEPT = 30

// What reaches the player from outside the scene while it goes on (posts, messages). Taking a turn back does not undo these.
const KEPT_ACROSS = ['feed', 'feedDay', 'feedPlans', 'courier'] as const

/**
 * A turn as it is written to a save. A turn changes little, so what is kept is only what
 * it changed: the parts of the game and the scene that were different before it, the
 * names of any that were not there at all, and how long the conversation was.
 */
export const PackedTurnSchema = z.object({
  text: z.string(),
  /** How many messages the scene had before the line was said. */
  messages: z.number().int().min(0),
  state: z.record(z.string(), z.unknown()),
  scene: z.record(z.string(), z.unknown()),
  /** Parts that the turn added, which were absent before it. */
  absent: z.object({ state: z.array(z.string()), scene: z.array(z.string()) })
})
export type PackedTurn = z.infer<typeof PackedTurnSchema>

type Parts = Record<string, unknown>

/** What of `before` is not as it is in `after`: its own values for the parts that differ, and the names of those it lacks. */
function changed(before: Parts, after: Parts, skip: readonly string[]): { parts: Parts; absent: string[] } {
  const parts: Parts = {}
  const absent: string[] = []
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (skip.includes(key) || before[key] === after[key]) continue
    if (before[key] === undefined) absent.push(key)
    else parts[key] = before[key]
  }
  return { parts, absent }
}

/** `after` put back to what it was: the parts that differed restored, and the ones it gained since taken away. */
function restored(after: Parts, parts: Parts, absent: string[]): Parts {
  const before = { ...after, ...parts }
  for (const key of absent) delete before[key]
  return before
}

/**
 * The turns of a scene as they go into a save: each as what it changed, measured against
 * the turn after it, and the last against the game and the scene as they are now.
 */
export function packTurns(turns: Turn[], state: GameState, scene: Scene): PackedTurn[] {
  return turns.map((turn, i) => {
    const next = turns[i + 1] ?? { state, scene }
    const ofState = changed(turn.state as Parts, next.state as Parts, KEPT_ACROSS)
    const ofScene = changed(turn.scene as Parts, next.scene as Parts, ['messages'])
    return { text: turn.text, messages: turn.scene.messages.length, state: ofState.parts, scene: ofScene.parts, absent: { state: ofState.absent, scene: ofScene.absent } }
  })
}

/**
 * The turns of a scene read back from a save, worked out from the game and the scene as
 * they were saved: the last turn first, and each one before it from the one after.
 */
export function unpackTurns(packed: PackedTurn[], state: GameState, scene: Scene): Turn[] {
  const turns: Turn[] = []
  let after: { state: GameState; scene: Scene } = { state, scene }
  for (const turn of [...packed].reverse()) {
    const before = {
      state: restored(after.state as Parts, turn.state, turn.absent.state) as GameState,
      scene: { ...(restored(after.scene as Parts, turn.scene, turn.absent.scene) as Scene), messages: after.scene.messages.slice(0, turn.messages) }
    }
    turns.unshift({ ...before, text: turn.text })
    after = before
  }
  return turns
}

/**
 * The game put back to before a turn. Everything the turn did is undone; what reached the
 * player from outside the scene meanwhile is kept as it is now.
 */
export function rewound(turn: Turn, current: GameState): GameState {
  return { ...turn.state, ...Object.fromEntries(KEPT_ACROSS.map((key) => [key, current[key]])) }
}
