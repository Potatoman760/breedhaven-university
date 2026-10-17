import { describe, expect, it } from 'vitest'
import { PregnancyConfigSchema, type ContentPack, type GameState } from '../model'
import { dayAgenda } from './agenda'
import { acceptProposal } from './appointments'
import { attendBirth, birthAppointment, birthSlot, MISSED_BIRTH, renameNewborn, scheduleBirths, settleBirths } from './births'
import { cancelAppointment, courierThread, hasContact, plansWith, settleAppointments, unreadNotes } from './courier'
import { conceive, namesOf, suggestName } from './pregnancy'
import { createInitialState } from './state'
import { fixture } from './testFixture'
import { nextUp } from './upcoming'

// A 20-hour day that starts at 06:00, so day 3 begins at hour 60 of the game. The shop, where children are born here,
// is open from 05:00 to 15:00. A pregnancy lasts three days, and the hour of the birth is set the day before.
const base = fixture()
const content: ContentPack = {
  ...base,
  loveInterests: [{ ...base.loveInterests[0], birthPicture: 'sprites/ana/birth.png', childNames: { daughters: ['Mab', 'Nell'], sons: ['Tam'] } }],
  locations: base.locations.map((l) => (l.id === 'shop' ? { ...l, backgrounds: [{ id: 'default', name: 'Default', images: {} }, { id: 'ward', name: 'The ward', images: {} }] } : l)),
  pregnancy: PregnancyConfigSchema.parse({ chance: 1, birthControlChance: 1, lengthDays: 3, recoveryDays: 1, birthLocationId: 'shop', birthViewId: 'ward', birthHours: 2, birthNoticeDays: 1, stages: [{ id: 'early', name: 'with child', from: 0 }] })
}
const start = createInitialState(content)
const pregnant = conceive(content, start, 'ana')
const at = (state: GameState, time: number): GameState => ({ ...state, time })
const plan = (time: number, hours = 2) => ({ loveInterestId: 'ana', companionIds: [], title: 'Tea', time, hours, locationId: 'home' })

describe('the hour of a birth', () => {
  it('is the earliest free stretch of the day, while the place is open and not in the past', () => {
    expect(pregnant.pregnancies['ana']).toEqual({ conceivedAt: 0, dueAt: 60 })
    expect(birthSlot(content, at(pregnant, 40), 3, 2)).toBe(60)
    // With the first hours of the day spoken for, it is put after them.
    expect(birthSlot(content, acceptProposal(at(pregnant, 40), plan(60)), 3, 2)).toBe(62)
    // On the day itself, only what is still to come.
    expect(birthSlot(content, at(pregnant, 63), 3, 2)).toBe(64)
    // The shop shuts at 15:00, so the last it can begin is 13:00, hour 67; after that the day has nothing left.
    expect(birthSlot(content, at(pregnant, 66), 3, 2)).toBe(67)
    expect(birthSlot(content, at(pregnant, 67), 3, 2)).toBeUndefined()
  })

  it('gives way to what matters more: an event is missed sooner than a plan', () => {
    const fair = { id: 'fair', name: 'The fair', description: '', month: 'b', day: 2, durationDays: 1, startHour: 5, hours: 10, noClasses: false, generated: true, program: [], secret: false }
    const busy = acceptProposal({ ...at(pregnant, 40), events: [fair] }, plan(60))
    expect(dayAgenda(content, busy, 3).filter((item) => item.startHour !== undefined).map((item) => item.kind)).toEqual(['event', 'plan'])
    // Every hour has the fair in it; the first two have the plan as well.
    expect(birthSlot(content, busy, 3, 2)).toBe(62)
  })
})

describe('a birth on the calendar', () => {
  it('is set a day ahead, once, and she writes to say when', () => {
    const early = at(pregnant, 10)
    expect(scheduleBirths(content, early)).toEqual({ state: early, scheduled: [] })
    expect(scheduleBirths(content, early).state).toBe(early)

    const near = at(pregnant, 40)
    const { state: set, scheduled } = scheduleBirths(content, near)
    expect(scheduled).toEqual([{ id: 'birth-ana', kind: 'birth', loveInterestId: 'ana', companionIds: [], title: 'The birth of your child', time: 60, hours: 2, locationId: 'shop' }])
    expect(birthAppointment(set, 'ana')?.time).toBe(60)
    expect(hasContact(set, 'ana')).toBe(true)
    expect(unreadNotes(set, 'ana')).toBe(1)
    expect(courierThread(set, 'ana')[0].text).toContain('I want you there, Pat')
    // Asked again, there is nothing more to set.
    expect(scheduleBirths(content, set).state).toBe(set)

    // On the calendar it is a birth at its hour, and no longer only a day she is due.
    expect(dayAgenda(content, set, 3)).toEqual([{ kind: 'birth', id: 'plan-birth-ana', title: 'Ana gives birth', detail: 'the Shop', startHour: 6, hours: 2 }])
    expect(dayAgenda(content, near, 3)).toEqual([{ kind: 'birth', id: 'birth-ana', title: 'Ana is due' }])
    // It is the next thing on his day, when the day comes.
    expect(nextUp(content, at(set, 59))).toMatchObject({ kind: 'plan', id: 'birth-ana', time: 60, locationId: 'shop' })
    // It cannot be called off, and is not one of the plans he has with her.
    expect(plansWith(set, 'ana')).toEqual([])
    expect(cancelAppointment(content, set, 'birth-ana')).toBe(set)
  })

  it('kept, is a scene in the room set aside for it, with the child born as it opens', () => {
    const set = scheduleBirths(content, at(pregnant, 40)).state
    const there = { ...at(set, 60), locationId: 'shop' }
    const { state: after, scene, child } = attendBirth(content, there, 'birth-ana')
    expect(child).toMatchObject({ motherId: 'ana', bornAt: 60 })
    expect(after.children).toEqual([child])
    expect(after.pregnancies).toEqual({})
    expect(after.appointments).toEqual([])
    expect(after.time).toBe(62)
    expect(scene).toMatchObject({ loveInterestId: 'ana', npc: false, nsfw: false, viewId: 'ward', picture: 'sprites/ana/birth.png' })
    expect(scene.beats[0].direction).toContain("You have just given birth to Pat's child")
    expect(scene.beats[0].description).toMatch(/your (daughter|son) in her arms/)
    // What the hour did to how she feels is for the scene to say: the baseline is from before it.
    expect(scene.baseline.time).toBe(60)
    expect(settleBirths(content, after)).toEqual({ state: after, missed: [] })
  })

  it('has a name of its mother\'s, which he can change while he is there, and she takes his', () => {
    const set = scheduleBirths(content, at(pregnant, 40)).state
    const { state: after, scene, child } = attendBirth(content, { ...at(set, 60), locationId: 'shop' }, 'birth-ana')
    expect(child!.daughter ? ['Mab', 'Nell'] : ['Tam']).toContain(child!.name)
    expect(scene.newborn).toBe(60)
    expect(scene.beats[0].description).toContain(`She would like to call ${child!.daughter ? 'her' : 'him'} ${child!.name}.`)
    expect(scene.beats[0].direction).toContain(`You want to call ${child!.daughter ? 'her' : 'him'} ${child!.name}`)

    const named = renameNewborn(content, after, scene, '  Wilhelmina   Rose ')
    expect(named.state.children).toEqual([{ ...child, name: 'Wilhelmina Rose' }])
    expect(named.scene.suggestedName).toBe(child!.name)
    expect(named.scene.beats[0].direction).toContain(`You had thought of ${child!.name} for a name; Pat has chosen Wilhelmina Rose instead, and you took to it at once and gladly.`)
    // A second thought still tells her what she first wanted.
    const again = renameNewborn(content, named.state, named.scene, 'Ida')
    expect(again.state.children[0].name).toBe('Ida')
    expect(again.scene.beats[0].direction).toContain(`You had thought of ${child!.name} for a name; Pat has chosen Ida instead`)
    // No name, the same name, and a scene that is not a birth change nothing.
    expect(renameNewborn(content, after, scene, '   ')).toEqual({ state: after, scene })
    expect(renameNewborn(content, after, scene, child!.name)).toEqual({ state: after, scene })
    expect(renameNewborn(content, after, { ...scene, newborn: undefined }, 'Ida')).toEqual({ state: after, scene: { ...scene, newborn: undefined } })
  })

  it('names each child something no other has, from her names, then the pack\'s, then its own', () => {
    const none = { children: [] }
    expect(suggestName(content, none, 'ana', true, 0)).toBe('Mab')
    expect(suggestName(content, none, 'ana', true, 0.99)).toBe('Nell')
    expect(suggestName(content, none, 'ana', false, 0.5)).toBe('Tam')
    const one = { children: [{ motherId: 'ana', bornAt: 0, daughter: true, name: 'mab' }] }
    expect(suggestName(content, one, 'ana', true, 0)).toBe('Nell')
    const both = { children: [...one.children, { motherId: 'ana', bornAt: 1, daughter: true, name: 'Nell' }] }
    const pack: ContentPack = { ...content, pregnancy: { ...content.pregnancy!, names: { daughters: ['Ivy'], sons: [] } } }
    expect(suggestName(pack, both, 'ana', true, 0)).toBe('Ivy')
    // With nothing written anywhere, there is still a name.
    expect(suggestName(content, both, 'ana', true, 0)).toBe('Hope')
    expect(namesOf([])).toBe('')
    expect(namesOf(both.children)).toBe('mab and Nell')
    expect(namesOf([...both.children, { name: 'Ivy' }])).toBe('mab, Nell and Ivy')
  })

  it('missed, happens without him, and she holds it against him as she holds nothing else', () => {
    const fond = { ...pregnant, relationships: { ana: { affection: 50, trust: 50, desire: 50 } } }
    const set = scheduleBirths(content, at(fond, 40)).state
    const late = at(set, 63)
    // It is not an ordinary plan stood up.
    expect(settleAppointments(content, late)).toEqual({ state: late, missed: [] })
    const { state: after, missed } = settleBirths(content, late)
    expect(missed).toHaveLength(1)
    expect(missed[0].child).toMatchObject({ motherId: 'ana', bornAt: 62 })
    expect(after.children).toHaveLength(1)
    expect(after.pregnancies).toEqual({})
    expect(after.appointments).toEqual([])
    expect(after.relationships['ana']).toEqual({ affection: 50 + MISSED_BIRTH.affection, trust: 50 + MISSED_BIRTH.trust, desire: 50 + MISSED_BIRTH.desire })
    expect(after.memories['ana'].at(-1)).toMatchObject({ level: 'core' })
    expect(after.memories['ana'].at(-1)?.summary).toMatch(/^Pat was not there when you gave birth to his (daughter|son) at the Shop\./)
    expect(courierThread(after, 'ana').at(-1)?.text).toContain("You weren't here.")
    // Reckoned once.
    expect(settleBirths(content, after)).toEqual({ state: after, missed: [] })

    // Feelings do not go below nothing.
    const cold = settleBirths(content, at(scheduleBirths(content, at(pregnant, 40)).state, 63)).state
    expect(cold.relationships['ana']).toEqual({ affection: 0, trust: 0, desire: 0 })
  })
})
