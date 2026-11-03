import { describe, expect, it } from 'vitest'
import { LooksSchema, PregnancyConfigSchema, posesOf, validateContentPack, type ContentPack, type Group, type Scene } from '../model'
import { groupNsfwPrompt } from '../comfy'
import { groupActs, groupPose, sceneGroup } from './groups'
import { conceive } from './pregnancy'
import { buildCharacterPrompt } from './prompt'
import { applyLook, leaveScene } from './scene'
import { createInitialState } from './state'
import { fixture } from './testFixture'
import { withSkinTone } from './skin'

const base = fixture()
const ana = base.loveInterests[0]
const bea = { ...ana, id: 'bea', name: 'Bea Moss' }
const cy = { ...ana, id: 'cy', name: 'Cy Fenn' }
const act = (id: string, media = true) => ({ id, name: id, description: '', loop: true, ...(media && { image: `sprites/group-pair/${id}.webp` }) })
const pair: Group = { id: 'pair', name: 'Ana & Bea', memberIds: ['ana', 'bea'], animations: [act('missionary'), act('doggy', false)], tonedAnimations: {} }
const content: ContentPack = {
  ...base,
  loveInterests: [ana, bea, cy],
  groups: [pair],
  pregnancy: PregnancyConfigSchema.parse({
    chance: 1,
    birthControlChance: 1,
    periodDays: 0,
    lengthDays: 10,
    recoveryDays: 3,
    daughterChance: 0.5,
    birthLocationId: 'shop',
    stages: [
      { id: 'early', name: 'newly with child', from: 0, description: 'Nothing shows yet.' },
      { id: 'showing', name: 'showing', from: 0.25, showing: true, description: 'Your belly has rounded.' }
    ]
  })
}
const met = { time: 0, summary: 'They met.', level: 'normal' as const }
const state = { ...createInitialState(content), memories: { ana: [met], bea: [met], cy: [met] } }
const scene = (companionIds: string[]): Pick<Scene, 'loveInterestId' | 'companionIds' | 'npc'> => ({ loveInterestId: 'ana', companionIds, npc: false })
const everyone = () => true

describe('the group a scene is of', () => {
  it('is the one of exactly the love interests in it, whoever leads', () => {
    expect(sceneGroup(content, scene(['bea']))?.id).toBe('pair')
    expect(sceneGroup(content, { loveInterestId: 'bea', companionIds: ['ana'], npc: false })?.id).toBe('pair')
  })

  it('is none with anyone more or fewer, or with an NPC', () => {
    expect(sceneGroup(content, scene([]))).toBeUndefined()
    expect(sceneGroup(content, scene(['bea', 'cy']))).toBeUndefined()
    expect(sceneGroup(content, { ...scene(['bea']), npc: true })).toBeUndefined()
  })
})

describe('a group sex-act', () => {
  it('is one the group has something to show for', () => {
    expect(groupActs(content, state, scene(['bea']), everyone)?.acts.map((one) => one.id)).toEqual(['missionary'])
    expect(groupPose(content, state, scene(['bea']), 'MISSIONARY', everyone)?.pose.id).toBe('missionary')
    expect(groupPose(content, state, scene(['bea']), 'doggy', everyone)).toBeUndefined()
    expect(groupPose(content, state, scene(['bea']), undefined, everyone)).toBeUndefined()
  })

  it("is the group's for the player's tone where it has that act drawn so, and the light one otherwise", () => {
    const dark = (id: string) => ({ ...act(id), image: `sprites/group-pair/nsfw-dark-${id}.webp` })
    const toned: ContentPack = { ...content, groups: [{ ...pair, animations: [act('missionary'), act('cowgirl')], tonedAnimations: { dark: [dark('missionary')] } }] }
    const seen = withSkinTone(toned, 'dark')
    expect(groupPose(seen, state, scene(['bea']), 'missionary', everyone)?.pose.image).toBe('sprites/group-pair/nsfw-dark-missionary.webp')
    expect(groupPose(seen, state, scene(['bea']), 'cowgirl', everyone)?.pose.image).toBe('sprites/group-pair/cowgirl.webp')
    expect(groupPose(withSkinTone(toned, 'medium'), state, scene(['bea']), 'missionary', everyone)?.pose.image).toBe('sprites/group-pair/missionary.webp')
    // Drawn for his tone, the man's skin is said.
    expect(groupNsfwPrompt([ana, bea], 'together', '', true, 'dark')).toContain('The man has dark brown skin.')
    expect(groupNsfwPrompt([ana, bea], 'together', '', false, 'dark')).not.toContain('The man')
  })

  it('is not shown while one of them will not, or once a pregnancy shows', () => {
    expect(groupActs(content, state, scene(['bea']), (id) => id !== 'bea')).toBeUndefined()
    const showing = { ...conceive(content, state, 'bea'), time: 4 * content.calendar.hoursPerDay }
    expect(groupActs(content, showing, scene(['bea']), everyone)).toBeUndefined()
  })

  it('stays on the scene, and comes down when any of them leaves', () => {
    const full: Scene = { ...(scene(['bea']) as Scene), baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 0, trust: 0, desire: 0 }, companions: {} }, nsfw: false, beats: [], messages: [], gifts: [], conceived: [], departed: [] }
    const up = applyLook(full, { animationId: 'missionary', animationOf: 'bea', animationGroup: 'pair' })
    expect(up).toMatchObject({ animationId: 'missionary', animationOf: 'bea', animationGroup: 'pair' })
    expect(applyLook(up, {}).animationGroup).toBeUndefined()
    expect(leaveScene(up, ['ana'], 'content', '')).toMatchObject({ animationId: undefined, animationGroup: undefined })
  })

  it('is offered to the LLM in a scene of exactly the group', () => {
    const together = buildCharacterPrompt({ content, state, loveInterestId: 'ana', companionIds: ['bea'], look: {} })
    expect(together).toContain('- All of you together, named for whichever of you it is most about: missionary (')
    expect(together).toContain('[SEX-ACT: Name=id]')
    expect(buildCharacterPrompt({ content, state, loveInterestId: 'ana', companionIds: ['bea', 'cy'], look: {} })).not.toContain('All of you together')
  })
})

describe('a group in the content', () => {
  it('is of love interests there are, each once, and no two groups of the same ones', () => {
    const check = (groups: Group[]) => () => validateContentPack({ ...content, groups })
    expect(check([pair])).not.toThrow()
    expect(check([{ ...pair, memberIds: ['ana', 'nobody'] }])).toThrow(/nobody/)
    expect(check([{ ...pair, memberIds: ['ana', 'ana'] }])).toThrow(/same love interest twice/)
    expect(check([pair, { ...pair, id: 'again', memberIds: ['bea', 'ana'] }])).toThrow(/same love interests/)
    expect(check([{ ...pair, memberIds: ['ana'] }])).toThrow()
  })
})

describe('what a group picture is asked for with', () => {
  it('is the act in its group wording, for every standard act', () => {
    for (const pose of posesOf(content.looks).poses) expect(pose.groupDraws?.trim(), pose.id).not.toBe('')
    expect(posesOf(content.looks).poses.every((pose) => pose.groupDraws !== pose.draws)).toBe(true)
  })

  it("is a custom act's own group wording, kept apart from what one woman is drawn with", () => {
    const looks = LooksSchema.parse({ acts: [{ id: 'spoons', name: 'Spoons', draws: 'she lies on her side', groupDraws: 'the women lie on their sides' }, { id: 'press', name: 'Press', draws: 'legs pinned back' }] })
    const [spoons, press] = posesOf(looks).poses.slice(-2)
    expect(spoons).toMatchObject({ draws: 'she lies on her side', groupDraws: 'the women lie on their sides' })
    expect(press.groupDraws).toBe('')
  })
})

describe('the man in a group picture', () => {
  const women = [ana, bea]
  it('is in it for the act, and out of it for what follows', () => {
    const shown = (id: string) => posesOf(content.looks).poses.find((pose) => pose.id === id)?.manShown
    expect(shown('missionary')).toBe(true)
    expect(shown('creampie')).toBe(false)
    expect(shown('facial')).toBe(false)
    expect(groupNsfwPrompt(women, 'together', '')).toMatch(/^An explicit picture of two women together with one man\./)
    expect(groupNsfwPrompt(women, 'together', '', false)).toMatch(/^An explicit picture of two women together\./)
    expect(LooksSchema.parse({ acts: [{ id: 'x', name: 'X' }] }).acts[0].manShown).toBe(true)
  })
})
