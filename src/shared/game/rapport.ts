import { kindOf, type ContentPack, type GameState, type Rapport } from '../model'
import { tieKey } from './bonds'

/** What two love interests are to each other, apart from anything either is to the player. */
export const RELATIONS = ['friends', 'enemies', 'neither'] as const
export type Relation = (typeof RELATIONS)[number]

// How many friends and enemies a student is brought up to at the start of a game.
const FRIENDS = { min: 2, max: 4 }
const ENEMIES = { min: 1, max: 3 }

/** A repeatable run of numbers in [0, 1) from a game's seed. */
function random(seed: number): () => number {
  let a = (seed ^ 0x6d2b79f5) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

const none = (): Rapport => ({ friends: [], enemies: [] })

/** What two love interests are to each other. Being friends or enemies always goes both ways. */
export function relationBetween(state: Pick<GameState, 'rapport'>, a: string, b: string): Relation {
  const mine = state.rapport[a]
  return mine?.friends.includes(b) ? 'friends' : mine?.enemies.includes(b) ? 'enemies' : 'neither'
}

/** Notes that he has seen these love interests in a scene together, every pair of them. The same state when nothing is new. */
export function noteTogether<S extends Pick<GameState, 'seenTogether'>>(state: S, ids: string[]): S {
  const pairs = ids.flatMap((a, i) => ids.slice(i + 1).filter((b) => b !== a).map((b) => tieKey(a, b)))
  const fresh = pairs.filter((key, i) => !state.seenTogether.includes(key) && pairs.indexOf(key) === i)
  return fresh.length === 0 ? state : { ...state, seenTogether: [...state.seenTogether, ...fresh] }
}

/** What two love interests are to each other as far as he knows it: nothing, until he has seen them together. */
export function knownRelation(state: Pick<GameState, 'rapport' | 'seenTogether'>, a: string, b: string): Relation | undefined {
  return state.seenTogether.includes(tieKey(a, b)) ? relationBetween(state, a, b) : undefined
}

/** Makes two love interests friends, enemies or neither, on both sides at once. */
export function setRelation<S extends Pick<GameState, 'rapport'>>(state: S, a: string, b: string, relation: Relation): S {
  if (a === b || relationBetween(state, a, b) === relation) return state
  const side = (id: string, other: string): Rapport => {
    const { friends, enemies } = state.rapport[id] ?? none()
    return {
      friends: [...friends.filter((x) => x !== other), ...(relation === 'friends' ? [other] : [])],
      enemies: [...enemies.filter((x) => x !== other), ...(relation === 'enemies' ? [other] : [])]
    }
  }
  return { ...state, rapport: { ...state.rapport, [a]: side(a, b), [b]: side(b, a) } }
}

/**
 * Who is friends with whom, and who can't stand whom, as a new game begins. What the
 * content says comes first, for anyone (the twins are friends in every game). Then each
 * student who has fewer is given friends and enemies among the other students at random,
 * up to a number of each of her own, so that no two games have the same circles.
 */
export function assignRapport(content: ContentPack, seed: number): GameState['rapport'] {
  const ids = content.loveInterests.map((li) => li.id)
  let state: Pick<GameState, 'rapport'> = { rapport: Object.fromEntries(ids.map((id) => [id, none()])) }
  for (const li of content.loveInterests) {
    for (const other of li.friends) if (ids.includes(other)) state = setRelation(state, li.id, other, 'friends')
    for (const other of li.enemies) if (ids.includes(other)) state = setRelation(state, li.id, other, 'enemies')
  }

  const next = random(seed)
  const between = ({ min, max }: { min: number; max: number }) => min + Math.floor(next() * (max - min + 1))
  const students = content.loveInterests.filter((li) => kindOf(li) === 'student').map((li) => li.id)
  const fill = (key: keyof Rapport, relation: Relation, limits: { min: number; max: number }) => {
    for (const id of students) {
      const wanted = between(limits)
      // Anyone she has nothing to do with yet, and who has room for one more.
      const open = students
        .filter((other) => other !== id && relationBetween(state, id, other) === 'neither' && state.rapport[other][key].length < limits.max)
        .map((other) => ({ other, order: next() }))
        .sort((x, y) => x.order - y.order)
      for (const { other } of open) {
        if (state.rapport[id][key].length >= wanted) break
        state = setRelation(state, id, other, relation)
      }
    }
  }
  fill('friends', 'friends', FRIENDS)
  fill('enemies', 'enemies', ENEMIES)
  return state.rapport
}

/**
 * Told to whoever writes a scene with more than one love interest in it: which of those
 * present are friends and which are enemies, so that they treat each other accordingly.
 */
export function describeRapport(content: ContentPack, state: GameState, presentIds: string[]): string[] {
  const first = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id
  const lines: string[] = []
  for (const [i, a] of presentIds.entries()) {
    for (const b of presentIds.slice(i + 1)) {
      const relation = relationBetween(state, a, b)
      if (relation === 'friends') lines.push(`${first(a)} and ${first(b)} are friends: easy with each other, on each other's side, quick to share a joke or a look.`)
      if (relation === 'enemies') lines.push(`${first(a)} and ${first(b)} are enemies: they dislike each other and it shows, in coldness, barbs or open quarrel, each in her own manner.`)
    }
  }
  return lines
}
