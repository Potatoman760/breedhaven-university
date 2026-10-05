import { STATS, type ContentPack, type GameState } from '../model'

// What the three stats of older saves became.
const OLD_STATS: Record<string, string> = { intellect: 'intelligence', charm: 'charisma', fitness: 'endurance' }

export function createInitialState(
  content: ContentPack,
  playerName?: string,
  weatherSeed = 0
): GameState {
  const { player, locationId } = content.newGame
  return {
    time: 0,
    weatherSeed,
    locationId,
    player: { ...player, name: playerName?.trim() || player.name },
    relationships: Object.fromEntries(
      content.loveInterests.map((li) => [li.id, { affection: 0, trust: 0, desire: 0 }])
    ),
    flags: {},
    unlockedCodexIds: [],
    memories: {},
    appointments: [],
    courses: [],
    enrolment: null,
    attendance: {},
    inventory: {},
    bonds: [],
    ties: {},
    courier: {},
    courierDay: -1,
    events: []
  }
}

/**
 * Makes a loaded save usable with the current content, which may have changed since it
 * was written: love interests added later get a fresh relationship, and a location that
 * no longer exists is replaced by the starting one. A save from before the six stats
 * gets them, keeping what it had earned under the old names.
 */
export function reconcileState(state: GameState, content: ContentPack): GameState {
  const fresh = createInitialState(content)
  const stats = { ...state.player.stats }
  for (const [old, now] of Object.entries(OLD_STATS)) {
    if (stats[old] === undefined) continue
    if (stats[now] === undefined) stats[now] = (fresh.player.stats[now] ?? 0) + stats[old]
    delete stats[old]
  }
  for (const stat of STATS) {
    if (fresh.player.stats[stat] !== undefined) stats[stat] ??= fresh.player.stats[stat]
  }
  return {
    ...state,
    player: { ...state.player, stats },
    locationId: content.locations.some((l) => l.id === state.locationId)
      ? state.locationId
      : fresh.locationId,
    relationships: { ...fresh.relationships, ...state.relationships }
  }
}
