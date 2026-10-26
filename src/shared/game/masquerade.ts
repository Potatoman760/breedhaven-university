import type { CalendarEvent, ContentPack, EventPart, GameState, LoveInterest, Mask, Scene } from '../model'
import { bondOf } from './bonds'
import { toDate } from './calendar'
import { applyFeelings } from './memory'
import { sceneBaseline } from './scene'
import { t } from '../i18n'

type Masquerade = NonNullable<EventPart['masquerade']>
type Dancer = NonNullable<GameState['masquerade']>['dancers'][number]

// The outfit a masked woman is in: the one the mask gives her, whatever she came in.
const GOWN = 'masquerade'
// A dance stays a dance: whatever she wants, it is on the dance floor, and what more there is waits for the terrace.
const noSex = () => t('scene.masquerade.noSex', { tag: '[SEX-ACT]' })

/** The ball a save is in the middle of: its event, its part and its masks. */
export function ballUnderway(content: ContentPack, state: GameState): { event: CalendarEvent; part: EventPart; ball: Masquerade } | undefined {
  const key = state.masquerade?.part
  for (const event of content.calendar.events) {
    for (const part of event.program) {
      if (part.masquerade && `${event.id}:${part.id}` === key) return { event, part, ball: part.masquerade }
    }
  }
  return undefined
}

/** A mask by its id, from whichever ball has it. */
export function maskById(content: ContentPack, maskId: string): Mask | undefined {
  for (const event of content.calendar.events) for (const part of event.program) {
    const mask = part.masquerade?.masks.find((one) => one.id === maskId)
    if (mask) return mask
  }
  return undefined
}

/** A repeatable number in [0, 1) for one game, one day and one draw. */
function roll(seed: number, day: number, draw: number): number {
  let x = (seed ^ Math.imul(day + 1, 0x9e3779b1) ^ Math.imul(draw + 1, 0x7f4a7c15)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000
}

/**
 * Who comes to dance with him: the women he knows who are closest to him (affection, trust and desire together) and in
 * no arrangement with him, as many as there are masks, in an order of their own, each in a mask. Too few, and the
 * stand-in comes too, as she is; with none at all she is the only one.
 */
export function masqueradeDancers(content: ContentPack, state: GameState, ball: Masquerade): Dancer[] {
  const score = (id: string) => {
    const rel = state.relationships[id]!
    return rel.affection + rel.trust + rel.desire
  }
  const free = content.loveInterests
    .filter((li) => li.id !== ball.standInId && state.met.includes(li.id) && state.relationships[li.id] !== undefined && !bondOf(state, li.id)?.statusId)
    .sort((a, b) => score(b.id) - score(a.id) || a.id.localeCompare(b.id))
    .slice(0, ball.masks.length)
  // Shuffled, the same way for the same game and day: who is first says nothing of who is closest.
  const day = toDate(content.calendar, state.time).dayIndex
  const order = free.map((li, i) => ({ li, at: roll(state.weatherSeed, day, i) })).sort((a, b) => a.at - b.at)
  const dancers: Dancer[] = order.map(({ li }, i) => ({ id: li.id, maskId: ball.masks[i].id }))
  const standIn = content.loveInterests.some((li) => li.id === ball.standInId)
  return dancers.length < ball.masks.length && standIn ? [...dancers, { id: ball.standInId }] : dancers
}

/** One dance: whoever is next comes to him out of the crowd, masked, or as she is. */
function danceScene(content: ContentPack, state: GameState, event: CalendarEvent, part: EventPart, dancer: Dancer, first: boolean): Scene {
  const mask = dancer.maskId ? maskById(content, dancer.maskId) : undefined
  const place = content.locations.find((one) => one.id === (part.locationId ?? event.locationId))
  const player = state.player.name
  const arrival = mask
    ? t('scene.masquerade.arrival', { mask: mask.description.split(',')[0] })
    : t('scene.masquerade.arrivalBare')
  const secret = mask
    ? t('scene.masquerade.secret', { description: mask.description, player, mask: mask.name })
    : t('scene.masquerade.secretBare', { player })
  return {
    loveInterestId: dancer.id,
    companionIds: [],
    nsfw: false,
    beats: [{ activityName: `${event.name}: ${part.name}`, locationName: place?.name, description: `${first && part.description ? `${part.description} ` : ''}${arrival}`, direction: `${part.direction} ${secret} ${noSex()}`.trim() }],
    viewId: part.viewId,
    ...(mask && { outfitId: GOWN, mask: { maskId: mask.id, revealed: false } }),
    dance: true,
    messages: [],
    gifts: [],
    conceived: [],
    departed: [],
    npc: false,
    baseline: sceneBaseline(state, dancer.id, [])
  }
}

/** The ball begins as he arrives: who dances with him is settled, and the first of them comes to him. */
export function beginMasquerade(content: ContentPack, state: GameState, event: CalendarEvent, part: EventPart): { state: GameState; scene: Scene | null } {
  const dancers = part.masquerade ? masqueradeDancers(content, state, part.masquerade) : []
  if (dancers.length === 0) return { state, scene: null }
  const next: GameState = { ...state, masquerade: { part: `${event.id}:${part.id}`, dancers, danced: 1, startedAt: state.time } }
  return { state: next, scene: danceScene(content, next, event, part, dancers[0], true) }
}

/** The next dance, once one is over: its hour, and her coming to him. Nothing when they have all danced. */
export function nextDance(content: ContentPack, state: GameState): { state: GameState; scene: Scene } | undefined {
  const now = ballUnderway(content, state)
  const ball = state.masquerade
  if (!now || !ball || ball.danced >= ball.dancers.length) return undefined
  const slot = Math.floor(now.part.hours / ball.dancers.length)
  const next: GameState = { ...state, time: Math.max(state.time, ball.startedAt + ball.danced * slot), masquerade: { ...ball, danced: ball.danced + 1 } }
  return { state: next, scene: danceScene(content, next, now.event, now.part, ball.dancers[ball.danced], false) }
}

/** Those he can try to name, once the dancing is over: the masked ones. None when the stand-in came alone. */
export function guessable(content: ContentPack, state: GameState): { id: string; mask: Mask }[] {
  const ball = state.masquerade
  if (!ball || ball.danced < ball.dancers.length) return []
  return ball.dancers.flatMap((dancer) => {
    const mask = dancer.maskId ? maskById(content, dancer.maskId) : undefined
    return mask ? [{ id: dancer.id, mask }] : []
  })
}

/** The ball is over for him without a guess: nobody was masked. */
export function endMasquerade(state: GameState): GameState {
  return { ...state, masquerade: undefined }
}

/**
 * He goes up to one of the masked women and names her. Wrong, and she is hurt that he did not know her. Right, and she
 * takes him out to somewhere quiet, still in her gown and mask, to make love to him. Either way the ball is over.
 */
export function guessDancer(content: ContentPack, state: GameState, dancerId: string, guessedId: string): { state: GameState; correct: boolean; scene?: Scene } {
  const now = ballUnderway(content, state)
  const dancer = state.masquerade?.dancers.find((one) => one.id === dancerId)
  const mask = dancer?.maskId ? maskById(content, dancer.maskId) : undefined
  if (!now || !dancer || !mask) throw new Error('She is not one of the masked dancers')
  const over = endMasquerade(state)
  if (guessedId !== dancerId) {
    return { correct: false, state: applyFeelings(content, over, dancerId, { affection: -now.ball.loss, trust: 0, desire: 0, reason: t('scene.masquerade.notKnown') }, true) }
  }
  const place = content.locations.find((one) => one.id === (now.part.locationId ?? now.event.locationId))
  const player = state.player.name
  return {
    correct: true,
    state: over,
    scene: {
      loveInterestId: dancerId,
      companionIds: [],
      nsfw: true,
      uninhibited: [dancerId],
      beats: [
        {
          activityName: t('scene.masquerade.foundOut', { event: now.event.name }),
          locationName: place?.name,
          description: t('scene.masquerade.named', { mask: mask.name }),
          direction: t('scene.masquerade.terrace', { event: now.event.name, player, description: mask.description })
        }
      ],
      viewId: now.ball.privateViewId,
      outfitId: GOWN,
      mask: { maskId: mask.id, revealed: true },
      messages: [],
      gifts: [],
      conceived: [],
      departed: [],
      npc: false,
      baseline: sceneBaseline(over, dancerId, [])
    }
  }
}

/** A woman as her mask shows her: in its gown, with its sex-acts, of a height with everyone else, and named for it until she is found out. */
export function masked(li: LoveInterest, mask: Mask, hideName: boolean): LoveInterest {
  return {
    ...li,
    name: hideName ? mask.name : li.name,
    outfits: [{ id: GOWN, name: t('scene.masquerade.gown'), description: mask.description, sprites: mask.sprites, pregnant: false }],
    defaultOutfitId: GOWN,
    animations: mask.animations,
    faceY: mask.faceY,
    // Her own walk would give her away on the loading screen: the gown's, or none.
    walkSprite: mask.walk,
    stageHeight: 100
  }
}

/**
 * The content as a scene at a masked ball has it: its lead in her mask. Shown to the player (`hideName`), she goes by
 * her mask's name until he has named her; told to the LLM, she is herself in it.
 */
export function inMasks(content: ContentPack, scene: Pick<Scene, 'loveInterestId' | 'mask'>, hideName: boolean): ContentPack {
  const mask = scene.mask && maskById(content, scene.mask.maskId)
  if (!mask) return content
  const hide = hideName && !scene.mask?.revealed
  return { ...content, loveInterests: content.loveInterests.map((li) => (li.id === scene.loveInterestId ? masked(li, mask, hide) : li)) }
}
