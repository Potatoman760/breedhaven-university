import { isPregnantPose, poseMedia, type Animation, type ContentPack, type GameState, type Group, type Scene } from '../model'
import { pregnancyStage } from './pregnancy'
import { sceneCast } from './scene'

const keyOf = (ids: readonly string[]): string => [...new Set(ids)].sort().join('|')

/** The group a scene is of: the one whose members are exactly the love interests in it now, and nobody else. */
export function sceneGroup(content: ContentPack, scene: Pick<Scene, 'loveInterestId' | 'companionIds' | 'npc'>): Group | undefined {
  if (scene.npc) return undefined
  const here = keyOf(sceneCast(scene))
  return content.groups.find((group) => keyOf(group.memberIds) === here)
}

/**
 * The sex-acts of the scene's group that can be shown now, with the group: those it has a picture or a clip for. None
 * while any of them is showing a pregnancy, since the group is drawn without one, or while any of them will not.
 */
export function groupActs(content: ContentPack, state: GameState, scene: Pick<Scene, 'loveInterestId' | 'companionIds' | 'npc'>, willing: (id: string) => boolean): { group: Group; acts: Animation[] } | undefined {
  const group = sceneGroup(content, scene)
  if (!group) return undefined
  if (group.memberIds.some((id) => pregnancyStage(content, state, id)?.showing === true)) return undefined
  if (!group.memberIds.every(willing)) return undefined
  const acts = group.animations.filter((act) => poseMedia(act).length > 0 && !isPregnantPose(act.id))
  return acts.length > 0 ? { group, acts } : undefined
}

/** The group's own sex-act for one the LLM asked for, by its id, when the group can show it. */
export function groupPose(content: ContentPack, state: GameState, scene: Pick<Scene, 'loveInterestId' | 'companionIds' | 'npc'>, actId: string | null | undefined, willing: (id: string) => boolean): { group: Group; pose: Animation } | undefined {
  if (!actId) return undefined
  const found = groupActs(content, state, scene, willing)
  const pose = found?.acts.find((act) => act.id.toLowerCase() === actId.toLowerCase())
  return found && pose ? { group: found.group, pose } : undefined
}
