import {
  METERS,
  type ContentPack,
  type GameState,
  type LoveInterest,
  type Scene,
  type SceneBaseline
} from '../model'
import { stageFor } from './relationships'

/** The LLM puts this at the end of a reply to say the scene has reached its close. */
export const SCENE_END_TAG = '[END SCENE]'

/** Separates a reply from the scene-end tag, wherever and however the LLM wrote it. */
export function splitSceneEnd(reply: string): { text: string; ended: boolean } {
  const tag = /\[\s*END[\s_-]*SCENE\s*\]/gi
  const ended = tag.test(reply)
  return { text: reply.replace(tag, '').trim(), ended }
}

/**
 * A change to how the love interest appears, asked for by the LLM in a reply.
 * `animationId: null` means stop the animation and show the sprite again.
 */
export interface SceneLook {
  outfitId?: string
  expression?: string
  animationId?: string | null
}

export interface Directives extends SceneLook {
  /** The reply with every tag removed. */
  text: string
  ended: boolean
}

const LOOK_TAG = /\[\s*(OUTFIT|EXPRESSION|ANIMATION)\s*:\s*([^\]]*?)\s*\]/gi

/** Reads the tags the LLM may put in a reply: scene end, outfit, expression and animation. */
export function parseDirectives(reply: string): Directives {
  const look: SceneLook = {}
  const withoutLook = reply.replace(LOOK_TAG, (_tag, kind: string, value: string) => {
    if (kind.toUpperCase() === 'OUTFIT') look.outfitId = value
    else if (kind.toUpperCase() === 'EXPRESSION') look.expression = value
    else look.animationId = ['none', 'off', 'stop', ''].includes(value.toLowerCase()) ? null : value
    return ''
  })
  return { ...splitSceneEnd(withoutLook), ...look }
}

/**
 * Keeps only the parts of a requested look that this character can show: an outfit they
 * have, an expression drawn for the outfit they will be in, and an animation they have.
 */
export function validLook(
  look: SceneLook,
  li: LoveInterest,
  scene: Pick<Scene, 'outfitId'>
): SceneLook {
  // The LLM's spelling of an id may differ in case from the content's.
  const same = (id: string, asked: string | null | undefined) => id.toLowerCase() === asked?.toLowerCase()
  const valid: SceneLook = {}
  const outfit = li.outfits.find((o) => same(o.id, look.outfitId))
  if (outfit) valid.outfitId = outfit.id

  const wearing =
    outfit ?? li.outfits.find((o) => o.id === (scene.outfitId ?? li.defaultOutfitId))
  const expression = Object.keys(wearing?.sprites ?? {}).find((key) => same(key, look.expression))
  if (expression !== undefined) valid.expression = expression

  const animation = li.animations.find((a) => same(a.id, look.animationId))
  if (look.animationId === null) valid.animationId = null
  else if (animation) valid.animationId = animation.id
  return valid
}

/** Applies a look to the scene. Going back to an outfit or expression ends any animation. */
export function applyLook(scene: Scene, look: SceneLook): Scene {
  const backToSprite = look.outfitId !== undefined || look.expression !== undefined
  return {
    ...scene,
    outfitId: look.outfitId ?? scene.outfitId,
    // An expression belongs to the outfit it was chosen for.
    expression: look.expression ?? (look.outfitId !== undefined ? undefined : scene.expression),
    animationId:
      look.animationId === null
        ? undefined
        : (look.animationId ?? (backToSprite ? undefined : scene.animationId))
  }
}

/** Everyone in a scene, the lead first. */
export function sceneCast(scene: Pick<Scene, 'loveInterestId' | 'companionIds'>): string[] {
  return [scene.loveInterestId, ...scene.companionIds]
}

/** "Ana", "Ana and Bea", "Ana, Bea and Cy": first names, for headings and prompts. */
export function firstNames(content: ContentPack, ids: string[]): string {
  const names = ids.map((id) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id)
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** One beat of a reply as the text box shows it. */
export interface DialogueLine {
  /** An action or expression written between asterisks, shown as narration, not speech. */
  action: boolean
  text: string
  /** In a group scene, the id of whoever says the line, when the line names them. */
  speakerId?: string
}

/**
 * Splits a reply into the beats the player clicks through, one per line of text. In a
 * group scene each spoken line starts with its speaker's first name ("Ana: ..."); pass
 * the cast to have that read off the line.
 */
export function dialogueLines(reply: string, cast: Pick<LoveInterest, 'id' | 'name'>[] = []): DialogueLine[] {
  return reply
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const action = /^\*[^*]+\*$/.exec(line)
      if (action) return { action: true, text: line.slice(1, -1).trim() }
      const named = /^\**([^:*]{1,40}?)\**\s*:\s*(.+)$/.exec(line)
      const speaker =
        named &&
        cast.find((li) => [li.name, li.name.split(' ')[0]].some((n) => n.toLowerCase() === named[1].trim().toLowerCase()))
      return speaker && named
        ? { action: false, text: named[2], speakerId: speaker.id }
        : { action: false, text: line }
    })
}

const NO_RELATIONSHIP = { affection: 0, trust: 0, desire: 0 }

/** Recorded when a scene starts, before the activity that opens it takes effect. */
export function sceneBaseline(state: GameState, loveInterestId: string, companionIds: string[] = []): SceneBaseline {
  return {
    stats: state.player.stats,
    energy: state.player.energy,
    money: state.player.money,
    relationship: state.relationships[loveInterestId] ?? NO_RELATIONSHIP,
    companions: Object.fromEntries(companionIds.map((id) => [id, state.relationships[id] ?? NO_RELATIONSHIP]))
  }
}

export interface Growth {
  label: string
  from: number
  to: number
}

export interface SceneOutcome {
  /** Player stats, coin and energy that changed over the scene. */
  player: Growth[]
  /** All relationship meters, changed or not. */
  meters: Growth[]
  stageBefore: string
  stageAfter: string
}

/**
 * What changed for the player and the relationship between the baseline and now. For
 * someone other than the scene's lead, pass `companion` to measure from their own start.
 */
export function sceneOutcome(
  content: ContentPack,
  recorded: SceneBaseline,
  state: GameState,
  loveInterestId: string,
  companion = false
): SceneOutcome {
  const baseline = companion
    ? { ...recorded, relationship: recorded.companions[loveInterestId] ?? NO_RELATIONSHIP }
    : recorded
  const { player } = state
  const now = state.relationships[loveInterestId] ?? baseline.relationship
  const stats = [...new Set([...Object.keys(baseline.stats), ...Object.keys(player.stats)])]

  return {
    player: [
      ...stats.map((stat) => ({
        label: stat,
        from: baseline.stats[stat] ?? 0,
        to: player.stats[stat] ?? 0
      })),
      { label: 'coin', from: baseline.money, to: player.money },
      { label: 'energy', from: baseline.energy, to: player.energy }
    ].filter((g) => g.from !== g.to),
    meters: METERS.map((meter) => ({
      label: meter,
      from: baseline.relationship[meter],
      to: now[meter]
    })),
    stageBefore: stageFor(content.relationships, baseline.relationship.affection).name,
    stageAfter: stageFor(content.relationships, now.affection).name
  }
}
