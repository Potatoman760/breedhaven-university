import { describe, expect, it } from 'vitest'
import { PregnancyConfigSchema, type ContentPack, type GameState } from '../model'
import { desireNeeded, describeSexGate, isEasy, onBirthControl, sexGate, stopBirthControl } from './intimacy'
import { parseDirectives } from './scene'
import { conceive } from './pregnancy'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const base = fixture()
const [ana] = base.loveInterests
const content: ContentPack = {
  ...base,
  loveInterests: [
    { ...ana, traitIds: [] },
    { ...ana, id: 'bea', name: 'Bea Stone', traitIds: ['wild'] }
  ],
  relationships: {
    ...base.relationships,
    statuses: [
      { id: 'casual', name: 'Lovers', description: '', guidance: '', minMembers: 1, maxMembers: 1, mutual: false, exclusive: false, committed: false, minTie: 0 },
      { id: 'couple', name: 'A couple', description: '', guidance: '', minMembers: 1, maxMembers: 1, mutual: false, exclusive: true, committed: true, minTie: 0 }
    ],
    intimacy: { easyTraitIds: ['wild'], minDesire: 25, reluctantTraitIds: ['prim'], reluctantMinDesire: 50 }
  },
  pregnancy: PregnancyConfigSchema.parse({ chance: 1, birthControlChance: 0, birthLocationId: 'shop', stages: [{ id: 'early', name: 'with child', from: 0 }] })
}
const start = createInitialState(content)
const known = (state: GameState, id: string, desire: number): GameState => ({
  ...state,
  memories: { ...state.memories, [id]: [{ time: 0, summary: 'They met.', level: 'normal' as const }] },
  relationships: { ...state.relationships, [id]: { affection: 20, trust: 20, desire } }
})
const [a, b] = content.loveInterests

describe('whether she will', () => {
  it('is never on the day they meet, and not before she wants him enough', () => {
    expect(sexGate(content, start, a)).toEqual({ open: false, why: 'first' })
    // Wanting him is not enough the first time.
    expect(sexGate(content, { ...start, relationships: { ...start.relationships, ana: { affection: 0, trust: 0, desire: 90 } } }, a)).toEqual({ open: false, why: 'first' })
    expect(sexGate(content, known(start, 'ana', 24), a)).toEqual({ open: false, why: 'desire' })
    // An old friend he has not yet had a scene with is no stranger: only what she feels holds her back.
    const friend = (desire: number) => ({ ...start, relationships: { ...start.relationships, ana: { affection: 35, trust: 45, desire } } })
    expect(sexGate(content, friend(10), a)).toEqual({ open: false, why: 'desire' })
    expect(describeSexGate(content, friend(10), a)[0]).toContain('You do not want Pat enough yet')
    expect(sexGate(content, friend(30), a)).toEqual({ open: true })
    expect(sexGate(content, known(start, 'ana', 25), a)).toEqual({ open: true })
  })

  it('asks more of a woman who holds back, and nothing of one who is easy', () => {
    const prim = { ...a, traitIds: ['prim'] }
    expect(desireNeeded(content, start, a)).toBe(25)
    expect(desireNeeded(content, start, prim)).toBe(50)
    expect(sexGate(content, known(start, 'ana', 40), prim)).toEqual({ open: false, why: 'desire' })
    expect(sexGate(content, known(start, 'ana', 50), prim)).toEqual({ open: true })
    expect(isEasy(content, b)).toBe(true)
    expect(desireNeeded(content, start, b)).toBe(0)
    expect(sexGate(content, start, b)).toEqual({ open: true })
    // Easy wins over holding back.
    expect(sexGate(content, start, { ...b, traitIds: ['prim', 'wild'] })).toEqual({ open: true })
  })

  it('is told to her as a rule of the scene, and to an easy woman not at all', () => {
    expect(describeSexGate(content, start, a)[0]).toContain('You have only just met Pat')
    expect(describeSexGate(content, known(start, 'ana', 5), a)[0]).toContain('You do not want Pat enough yet')
    expect(describeSexGate(content, known(start, 'ana', 5), a)[0]).toContain('turn him down in your own way')
    expect(describeSexGate(content, start, b)).toHaveLength(1)
    const prompt = buildCharacterPrompt({ content, state: start, loveInterestId: 'ana', sceneBeats: [{ activityName: 'Tea' }] })
    expect(prompt).toContain('## Sex with Pat')
    expect(prompt).toContain('You have only just met Pat')
  })
})

describe('what she takes against the Bloom', () => {
  it('is taken by a woman who began the game taking it, until she chooses to stop', () => {
    expect(onBirthControl(content, start, 'ana')).toBe(true)
    expect(describeSexGate(content, start, a).at(-1)).toContain('write [STOPS BIRTH CONTROL] on a line of its own')
    expect(describeSexGate(content, start, a, true).at(-1)).toContain('[STOPS BIRTH CONTROL: Name]')
    const stopped = stopBirthControl(content, start, 'ana')
    expect(stopped.offBirthControl).toEqual(['ana'])
    expect(onBirthControl(content, stopped, 'ana')).toBe(false)
    expect(stopped.memories['ana'].at(-1)).toMatchObject({ level: 'core', summary: expect.stringContaining('You stopped taking your contraceptive draught for Pat') })
    expect(describeSexGate(content, stopped, a).at(-1)).toContain('You take nothing against the Bloom')
    // Once is all there is to it.
    expect(stopBirthControl(content, stopped, 'ana')).toBe(stopped)
  })

  it('is not taken at all by a woman written without it', () => {
    const free: ContentPack = { ...content, loveInterests: [{ ...a, birthControl: false }, b] }
    expect(onBirthControl(free, start, 'ana')).toBe(false)
    expect(stopBirthControl(free, start, 'ana')).toBe(start)
    expect(conceive(free, start, 'ana').pregnancies['ana']).toBeDefined()
  })

  it('sets the chance of a child', () => {
    // Nothing comes of it while she takes it, here; everything once she has stopped.
    expect(conceive(content, start, 'ana').pregnancies).toEqual({})
    expect(conceive(content, stopBirthControl(content, start, 'ana'), 'ana').pregnancies['ana']).toBeDefined()
  })

  it('is stopped by a line in her reply, which is taken out of it', () => {
    expect(parseDirectives('Then I will stop.\n[STOPS BIRTH CONTROL]')).toMatchObject({ text: 'Then I will stop.', stopsControl: [''] })
    expect(parseDirectives('Bea: Yes.\n[stop birth-control: Bea]').stopsControl).toEqual(['Bea'])
    expect(parseDirectives('Hello.').stopsControl).toEqual([])
  })
})
