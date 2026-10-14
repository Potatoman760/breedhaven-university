/**
 * A number that is a character's own, made from her id: what the game's rolls are seeded with when a roll is hers.
 * It does not depend on who else is in the game or in what order they are listed, so that someone joining or leaving
 * the cast, or a character who is only there for part of a game, changes nothing for anyone else.
 */
export function seedOf(id: string): number {
  // FNV-1a over the id's characters: small, and the same everywhere.
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** A repeatable source of numbers in [0, 1): the same seed gives the same numbers in the same order. */
export function draws(seed: number): () => number {
  let x = seed >>> 0
  return () => {
    x = (x + 0x6d2b79f5) >>> 0
    let t = Math.imul(x ^ (x >>> 15), 1 | x)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}
