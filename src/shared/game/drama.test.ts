import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContentPack } from '../../main/content/loader'
import type { GameState, Scene } from '../model'
import { arrivalCue, describeDrama, dramaChance, dramaDue, dramaHooks, fireDrama, inPrivate, planDrama } from './drama'
import { buildCharacterPrompt } from './prompt'
import { setRelation } from './rapport'
import { sceneBaseline } from './scene'
import { createInitialState } from './state'

const content = loadContentPack(join(process.cwd(), 'content', 'default'))

/** A game in which nobody is anybody's friend or enemy yet, and the player is somewhere public, so that each test sets up only what it is about. */
function fresh(seed = 1): GameState {
  const state = createInitialState(content, 'Pat', seed)
  return { ...state, locationId: 'lumen', rapport: Object.fromEntries(Object.keys(state.rapport).map((id) => [id, { friends: [], enemies: [] }])) }
}
const feels = (state: GameState, id: string, affection: number, desire = 0): GameState => ({
  ...state,
  relationships: { ...state.relationships, [id]: { affection, trust: 0, desire } }
})
const sceneWith = (state: GameState, leadId: string, patch: Partial<Scene> = {}): Scene => ({
  loveInterestId: leadId,
  npc: false,
  companionIds: [],
  nsfw: false,
  beats: [{ activityName: 'See a film' }],
  messages: [],
  gifts: [],
  departed: [],
  conceived: [],
  baseline: sceneBaseline(state, leadId),
  ...patch
})
const DATE = { tags: ['social', 'date'] }
const hookFor = (state: GameState, leadId: string, actorId: string, kind: string, ctx = DATE) =>
  dramaHooks(content, state, sceneWith(state, leadId), ctx).find((hook) => hook.actorId === actorId && hook.kind === kind)

describe('what could interrupt a scene', () => {
  it('is nothing when nobody has a claim on him or anything to do with his date', () => {
    const state = fresh()
    expect(dramaHooks(content, state, sceneWith(state, 'faye'), DATE)).toEqual([])
    expect(dramaChance(content, [])).toBe(0)
    expect(planDrama(content, state, sceneWith(state, 'faye'), DATE).drama).toBeUndefined()
  })

  it('is a friend dropping in, an enemy turning up, or someone with a claim walking in', () => {
    const friends = setRelation(fresh(), 'faye', 'tink', 'friends')
    expect(hookFor(friends, 'faye', 'tink', 'friend')?.reasons.join(' ')).toContain("She is a friend of Faye's")
    expect(hookFor(friends, 'faye', 'tink', 'friend')?.reasons.join(' ')).toContain('Faye introduces them')

    const enemies = setRelation(fresh(), 'faye', 'tink', 'enemies')
    expect(hookFor(enemies, 'faye', 'tink', 'rival')).toBeDefined()
    expect(hookFor(enemies, 'faye', 'tink', 'friend')).toBeUndefined()

    // Someone he is dating minds; someone he barely knows does not.
    const dating = feels(fresh(), 'isolde', 65)
    expect(hookFor(dating, 'faye', 'isolde', 'confrontation')?.reasons[0]).toContain('are dating')
    expect(hookFor(fresh(), 'faye', 'isolde', 'confrontation')).toBeUndefined()
    // Nobody interrupts a scene she is already in.
    expect(dramaHooks(content, dating, sceneWith(dating, 'faye', { companionIds: ['isolde'] }), DATE)).toEqual([])
  })

  it('weighs a promise, her nature, and what she is to his date', () => {
    const score = (state: GameState, actorId: string, ctx = DATE) => hookFor(state, 'faye', actorId, 'confrontation', ctx)?.score ?? 0
    const dating = (id: string) => feels(fresh(), id, 65)
    const promised = (id: string): GameState => ({ ...dating(id), bonds: [{ statusId: 'exclusive', memberIds: [id], since: 0 }] })
    const open = (id: string): GameState => ({ ...dating(id), bonds: [{ statusId: 'open', memberIds: [id], since: 0 }] })

    // A promise to see only her counts for most, an arrangement that lets him see others for least.
    expect(score(promised('isolde'), 'isolde')).toBeGreaterThan(score(dating('isolde'), 'isolde'))
    expect(score(dating('isolde'), 'isolde')).toBeGreaterThan(score(open('isolde'), 'isolde'))
    // Jealous Elowen minds more than Isolde does; easygoing Maren, less.
    expect(score(dating('elowen'), 'elowen')).toBeGreaterThan(score(dating('isolde'), 'isolde'))
    expect(score(dating('maren'), 'maren')).toBeLessThan(score(dating('isolde'), 'isolde'))
    expect(hookFor(dating('elowen'), 'faye', 'elowen', 'confrontation')?.reasons.join(' ')).toContain('She is jealous')
    // Worse if they are enemies already, and a date provokes more than a chat.
    expect(score(setRelation(dating('isolde'), 'isolde', 'faye', 'enemies'), 'isolde')).toBeGreaterThan(score(dating('isolde'), 'isolde'))
    expect(score(dating('isolde'), 'isolde', { tags: ['social'] })).toBeLessThan(score(dating('isolde'), 'isolde'))
    // It need not be a date at all: any time spent with someone can be interrupted.
    expect(score(dating('isolde'), 'isolde', { tags: ['study'] })).toBeGreaterThan(0)
  })

  it('turns into a chance that is small for a plain date and large when he is juggling lovers', () => {
    const plain = setRelation(fresh(), 'faye', 'tink', 'friends')
    const plainChance = dramaChance(content, dramaHooks(content, plain, sceneWith(plain, 'faye'), DATE))
    expect(plainChance).toBeGreaterThan(0.04)
    expect(plainChance).toBeLessThan(0.16)

    // Promised to jealous Elowen, and dating three more who do not know.
    const juggling: GameState = {
      ...['yelena', 'seraphine', 'isolde'].reduce((state, id) => feels(state, id, 65, 40), feels(fresh(), 'elowen', 90, 60)),
      bonds: [{ statusId: 'exclusive', memberIds: ['elowen'], since: 0 }]
    }
    const hooks = dramaHooks(content, juggling, sceneWith(juggling, 'faye'), DATE)
    expect(hooks.filter((hook) => hook.kind === 'confrontation')).toHaveLength(4)
    const chance = dramaChance(content, hooks)
    expect(chance).toBeGreaterThanOrEqual(0.4)
    expect(chance).toBeLessThanOrEqual(0.5)
  })
})

describe('planning and firing', () => {
  // Enough simmering that some moments are interrupted and some are not.
  const tense: GameState = {
    ...['yelena', 'seraphine', 'isolde'].reduce((state, id) => feels(state, id, 65, 40), feels(fresh(), 'elowen', 90, 60)),
    bonds: [{ statusId: 'exclusive', memberIds: ['elowen'], since: 0 }]
  }
  const planned = Array.from({ length: 400 }, (_, hour) => ({ ...tense, time: hour })).map((state) => ({ state, scene: planDrama(content, state, sceneWith(state, 'faye'), DATE) }))
  const hit = planned.filter(({ scene }) => scene.drama !== undefined)

  it('interrupts about as often as the chance says, and the same moment always the same way', () => {
    const chance = dramaChance(content, dramaHooks(content, tense, sceneWith(tense, 'faye'), DATE))
    expect(hit.length / planned.length).toBeGreaterThan(chance - 0.1)
    expect(hit.length / planned.length).toBeLessThan(chance + 0.1)
    expect(planDrama(content, hit[0].state, sceneWith(hit[0].state, 'faye'), DATE).drama).toEqual(hit[0].scene.drama)
    for (const { scene } of hit) {
      // Someone with a claim, or an enemy, arrives part-way through; only a friend is ever there from the start.
      expect(scene.drama!.afterLines).toBeGreaterThanOrEqual(scene.drama!.kind === 'friend' ? 0 : 1)
      expect(scene.drama!.afterLines).toBeLessThanOrEqual(3)
      expect(scene.drama!.fired).toBe(false)
    }
    // The strongest pull is the likeliest to be the one who comes.
    const elowen = hit.filter(({ scene }) => scene.drama!.actorId === 'elowen').length
    expect(elowen).toBeGreaterThan(hit.length / 4)
  })

  it('leaves alone scenes with an NPC, a full company, or too soon after the last time', () => {
    // A moment late enough in the game for there to have been a last time.
    const { state } = hit.find(({ state }) => state.time >= 96)!
    expect(planDrama(content, state, sceneWith(state, 'faye', { npc: true }), DATE).drama).toBeUndefined()
    expect(planDrama(content, state, sceneWith(state, 'faye', { companionIds: ['tink', 'lira'] }), DATE).drama).toBeUndefined()
    const today = Math.floor(state.time / 24)
    expect(planDrama(content, { ...state, dramaDay: today - 1 }, sceneWith(state, 'faye'), DATE).drama).toBeUndefined()
    expect(planDrama(content, { ...state, dramaDay: today - 3 }, sceneWith(state, 'faye'), DATE).drama).toBeDefined()
  })

  it('never happens in private: a residence hall, or a room of someone\'s own', () => {
    const { state, scene } = hit.find(({ scene }) => scene.drama!.afterLines > 0)!
    expect(content.locations.find((l) => l.id === 'dormitories')?.private).toBe(true)
    expect(content.locations.filter((l) => l.private).map((l) => l.id)).toEqual(['dormitories', 'sire-house'])
    const inHalls = { ...state, locationId: 'dormitories' }
    expect(inPrivate(content, inHalls, scene)).toBe(true)
    expect(planDrama(content, inHalls, sceneWith(inHalls, 'faye'), DATE).drama).toBeUndefined()
    expect(planDrama(content, state, sceneWith(state, 'faye', { roomOf: 'faye' }), DATE).drama).toBeUndefined()
    // Someone on her way does not follow them indoors: she arrives only if they are still somewhere public.
    const said = { ...scene, messages: Array.from({ length: 3 }, () => ({ role: 'user' as const, content: 'Hello.' })) }
    expect(dramaDue(content, state, said)).toBe(true)
    expect(dramaDue(content, inHalls, said)).toBe(false)
    expect(dramaDue(content, state, { ...said, roomOf: 'faye' })).toBe(false)
  })

  it('may be no more than her bringing a friend along, there from the start', () => {
    // Nothing romantic anywhere: he is studying with Faye, who has friends.
    const calm = ['tink', 'isolde', 'dinah'].reduce((state, id) => setRelation(state, 'faye', id, 'friends'), fresh())
    const outings = Array.from({ length: 600 }, (_, hour) => ({ ...calm, time: hour })).map((state) => ({ state, scene: planDrama(content, state, sceneWith(state, 'faye'), { tags: ['social', 'study'] }) }))
    const came = outings.filter(({ scene }) => scene.drama !== undefined)
    expect(came.length).toBeGreaterThan(20)
    expect(came.every(({ scene }) => scene.drama!.kind === 'friend')).toBe(true)
    const along = came.filter(({ scene }) => scene.drama!.afterLines === 0)
    expect(along.length).toBeGreaterThan(came.length / 4)
    expect(along.length).toBeLessThan((came.length * 3) / 4)

    // Brought along, she is in the scene before anyone has said a word.
    const { state, scene } = along[0]
    const opened = fireDrama(content, state, scene)
    expect(opened.scene.companionIds).toEqual([scene.drama!.actorId])
    expect(opened.notice).toMatch(/^Faye has brought \w+ along\.$/)
    expect(opened.scene.beats.at(-1)!.direction).toContain('are here together from the start')
    // One who is to turn up later is not there yet.
    const later = came.find(({ scene }) => scene.drama!.afterLines > 0)!
    expect(fireDrama(content, later.state, later.scene).scene).toBe(later.scene)
  })

  it('has her arrive once the player has said his lines, and tells the LLM who and why', () => {
    const { state, scene } = hit.find(({ scene }) => scene.drama!.kind === 'confrontation')!
    const drama = scene.drama!
    expect(dramaDue(content, state, scene)).toBe(false)
    const said = { ...scene, messages: Array.from({ length: drama.afterLines }, () => ({ role: 'user' as const, content: 'Hello.' })) }
    expect(dramaDue(content, state, said)).toBe(true)

    const arrived = fireDrama(content, state, said)
    expect(arrived.scene.companionIds).toEqual([drama.actorId])
    expect(arrived.scene.drama?.fired).toBe(true)
    expect(arrived.scene.baseline.companions[drama.actorId]).toEqual(state.relationships[drama.actorId])
    expect(arrived.state.dramaDay).toBe(Math.floor(state.time / 24))
    expect(arrived.notice).toContain('walks in on you')
    // She comes once.
    expect(dramaDue(content, arrived.state, arrived.scene)).toBe(false)
    expect(fireDrama(content, arrived.state, arrived.scene).scene).toBe(arrived.scene)

    const direction = arrived.scene.beats.at(-1)!.direction!
    expect(direction).toBe(describeDrama(content, state, said, drama))
    expect(direction).toContain('has just walked in and found Pat here with Faye')
    expect(direction).toContain('on what is plainly a date')
    expect(direction).toContain('is in the scene now and speaks as herself')
    expect(direction).not.toContain('..')
    // Her entrance is asked for beside his line as she walks in, where it is not missed.
    expect(arrivalCue(content, drama)).toContain('walks in on them as he says this. Open your reply with her arrival')
    // It reaches whoever writes the scene, which is now one with two of them in it.
    const prompt = buildCharacterPrompt({
      content,
      state: arrived.state,
      loveInterestId: arrived.scene.loveInterestId,
      companionIds: arrived.scene.companionIds,
      sceneBeats: arrived.scene.beats,
      look: arrived.scene
    })
    expect(prompt).toContain(direction)
  })

  it('does nothing in a content pack with no drama settings', () => {
    const off = { ...content, drama: undefined }
    const { state } = hit[0]
    expect(dramaHooks(off, state, sceneWith(state, 'faye'), DATE)).toEqual([])
    expect(planDrama(off, state, sceneWith(state, 'faye'), DATE).drama).toBeUndefined()
  })
})
