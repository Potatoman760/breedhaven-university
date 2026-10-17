import type { Scene } from '../model'

/**
 * How long a scene of each kind usually runs, in the player's turns. Past it, she is asked to find a reason to go and
 * end the scene: left to herself a model answers whatever he says next and never does.
 */
export const SCENE_LENGTHS = { class: 12, shift: 8, society: 10, date: 16, other: 8 } as const

type Paced = Pick<Scene, 'lesson' | 'shift' | 'societyId' | 'planned' | 'messages' | 'animationId' | 'comfort' | 'loveInterestId' | 'newborn'>

export function usualLength(scene: Paced): number {
  if (scene.lesson) return SCENE_LENGTHS.class
  if (scene.shift) return SCENE_LENGTHS.shift
  if (scene.societyId) return SCENE_LENGTHS.society
  if (scene.planned) return SCENE_LENGTHS.date
  return SCENE_LENGTHS.other
}

/** How many times he has spoken in the scene. */
export function exchanges(scene: Pick<Scene, 'messages'>): number {
  return scene.messages.filter((message) => message.role === 'user').length
}

/**
 * Whether it is time she wound the scene down: it has run past what one like it usually does, and nothing is holding
 * it. Not while a sex-act is under way, not while she is as glad as she can be to be there, and never at a birth.
 */
export function windingDown(scene: Paced): boolean {
  if (scene.newborn !== undefined || scene.animationId) return false
  if (scene.comfort?.[scene.loveInterestId]?.level === 5) return false
  return exchanges(scene) >= usualLength(scene)
}
