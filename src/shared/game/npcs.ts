import type { ContentPack, GameState, LoveInterest, Npc, Scene } from '../model'
import type { PerformCheck } from './activities'
import { isGameOver, toDate } from './calendar'
import { workplaceNow } from './map'
import { sceneBaseline } from './scene'
import { scheduledLocationId } from './schedule'

// How many NPCs can have a part in someone else's scene.
const MAX_EXTRAS = 2
// How long a word with someone takes.
const TALK_HOURS = 1

/**
 * An NPC as the character she is. NPCs and love interests are written the same way, so
 * there is nothing to convert: this only says so where a scene, the prompt or a screen
 * takes whoever it is given.
 */
export function npcAsCharacter(npc: Npc): LoveInterest {
  return npc
}


export function npcOf(content: ContentPack, id: string): Npc | undefined {
  return content.npcs.find((npc) => npc.id === id)
}

/**
 * The content as a scene with the given NPC needs it: the NPC stands among the
 * characters, so everything that looks a scene's character up finds them.
 */
export function withNpc(content: ContentPack, npcId: string): ContentPack {
  const npc = npcOf(content, npcId)
  if (!npc || content.loveInterests.some((li) => li.id === npcId)) return content
  return { ...content, loveInterests: [...content.loveInterests, npcAsCharacter(npc)] }
}

/** Where an NPC is right now, if anywhere: at work for a shift of the job she gives, else where her own day has her. */
export function npcLocation(content: ContentPack, state: GameState, npc: Npc): string | undefined {
  return workplaceNow(content, state, npc.id) ?? scheduledLocationId(npcAsCharacter(npc), toDate(content.calendar, state.time))
}

/** NPCs who are at the given location right now. */
export function npcsAt(content: ContentPack, state: GameState, locationId: string): Npc[] {
  return content.npcs.filter((npc) => npcLocation(content, state, npc) === locationId)
}

/**
 * The NPCs who are around during a scene with love interests: whoever's schedule has them
 * where the scene is. They are not part of the company, but they are there to be spoken
 * to: the one who takes the order, minds the door, keeps the forge.
 */
export function sceneExtras(content: ContentPack, state: GameState, scene: Pick<Scene, 'npc' | 'shift'>): Npc[] {
  if (scene.npc) return []
  // On a shift his boss is there whatever her day says, and comes first.
  const bossId = content.jobs?.jobs.find((job) => job.id === scene.shift?.jobId)?.bossId
  const boss = content.npcs.filter((npc) => npc.id === bossId)
  return [...boss, ...npcsAt(content, state, state.locationId).filter((npc) => npc.id !== bossId)].slice(0, MAX_EXTRAS)
}

export function canTalkToNpc(content: ContentPack, state: GameState, npcId: string): PerformCheck {
  const npc = npcOf(content, npcId)
  if (!npc) return { ok: false, reasons: ['Nobody by that name'] }
  const reasons: string[] = []
  if (isGameOver(content.calendar, state.time)) reasons.push('The game is over')
  if (npcLocation(content, state, npc) !== state.locationId) reasons.push(`${npc.name} is not here`)
  return { ok: reasons.length === 0, reasons }
}

/** Has a word with an NPC who is where the player is: it takes a while, and opens a scene with them. */
export function talkToNpc(content: ContentPack, state: GameState, npcId: string): { state: GameState; scene: Scene } {
  const check = canTalkToNpc(content, state, npcId)
  if (!check.ok) throw new Error(`Cannot talk to "${npcId}": ${check.reasons.join('; ')}`)
  const npc = npcOf(content, npcId)!
  const place = content.locations.find((l) => l.id === state.locationId)
  return {
    state: { ...state, time: state.time + TALK_HOURS },
    scene: {
      loveInterestId: npc.id,
      companionIds: [],
      npc: true,
      nsfw: false,
      beats: [{ activityName: `A word with ${npc.name}`, locationName: place?.name, description: npc.bio || undefined }],
      messages: [],
      gifts: [],
      conceived: [], departed: [],
      baseline: sceneBaseline(state, npc.id)
    }
  }
}
