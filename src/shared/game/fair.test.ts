import { describe, expect, it } from 'vitest'
import { validateContentPack, type ContentPack, type GameState } from '../model'
import { sayHelloAll, atTable, helloDue, canTalkAtFair, fairDue, fairOpensLater, helloIntro, rivalryDue, saidHello, sawRivalry, sayHello, stopAtTable, visitFair } from './fair'
import { locationOf } from './map'
import { eventOutings } from './outing'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'

// The fixture's day is 20 hours from 06:00, and day 1 is the fair's first, from 10:00 to 14:00 at the shop: two days of
// it. Ana belongs to the chess club and the choir, and so takes turns at their tables; Bea is in the chess club only.
const raw = rawFixture()
const student = { studies: { subject: 'Riddles', code: 'RID', level: 1, stats: ['wisdom'], practical: false } }
const content: ContentPack = validateContentPack({
  ...raw,
  calendar: { ...raw.calendar, events: [...raw.calendar.events, { id: 'fair', name: 'the Fair', month: 'a', day: 3, durationDays: 2, locationId: 'shop', startHour: 10, hours: 4 }] },
  loveInterests: [
    { ...raw.loveInterests[0], ...student },
    { ...raw.loveInterests[0], ...student, id: 'bea', name: 'Bea Stone', schedule: [] },
    { ...raw.loveInterests[0], id: 'cora', name: 'Cora Vale', schedule: [], teaching: { department: 'the College of Riddles', title: 'Magistra', subjects: [{ subject: 'Riddles', code: 'RID', level: 1, stats: ['wisdom'], practical: false }] } }
  ],
  items: [{ id: 'pen', name: 'Free pen', price: 0 }],
  societies: {
    fairId: 'fair',
    societies: [
      { id: 'chess', name: 'the Chess Club', description: 'Chess.', locationId: 'home', weekday: 'Two', startHour: 15, stats: ['intelligence'], memberIds: ['ana', 'bea'] },
      { id: 'choir', name: 'the Choir', description: 'Singing.', locationId: 'home', weekday: 'One', startHour: 15, stats: ['charisma'], memberIds: ['ana'], sponsorId: 'cora' }
    ],
    fair: {
      tables: [
        { societyId: 'chess', x: 10, y: 10, gift: 'pen' },
        { societyId: 'choir', x: 50, y: 50 }
      ],
      hellos: {
        chess: [
          { cast: ['ana', 'bea'], lines: ['*Ana waves.*', 'Ana: Chess, {player}?', 'Bea: Hi.'] },
          { cast: ['bea'], lines: ['Bea: Hi.'] }
        ],
        choir: [{ cast: ['ana', 'cora'], lines: ['Ana: Sing with us.'] }]
      },
      rivalry: { societyIds: ['chess', 'choir'], intro: { speakerId: 'ana', scenes: [{ locationId: 'shop', lines: ['Well?'] }] } }
    }
  }
})
const at = (state: GameState, day: number, hour: number): GameState => ({ ...state, time: day * 20 + hour - 6 })
const start = createInitialState(content)

describe('the fair', () => {
  it('holds his first day of it until he has been, and only while its tables are out', () => {
    expect(fairDue(content, at(start, 1, 9))).toBe(false)
    expect(fairDue(content, at(start, 1, 10))).toBe(true)
    expect(fairDue(content, visitFair(at(start, 1, 10)))).toBe(false)
    expect(fairDue(content, at(start, 1, 14))).toBe(false)
    // Its second day is there to go to, not a summons.
    expect(fairDue(content, at(start, 2, 10))).toBe(false)
  })

  it('is gone to by its own screen, not as an outing, and before it opens is waited for', () => {
    expect(eventOutings(content, at(start, 1, 9)).map(({ event }) => event.id)).not.toContain('fair')
    expect(fairOpensLater(content, at(start, 1, 8))?.at).toBe(at(start, 1, 10).time)
    expect(fairOpensLater(content, at(start, 1, 11))).toBeUndefined()
  })

  it('has a student who belongs to two societies take turns at their tables, half a day at each', () => {
    expect(atTable(content, at(start, 1, 10), 'chess')).toEqual(['ana', 'bea'])
    // Its sponsor is at its table all the while.
    expect(atTable(content, at(start, 1, 10), 'choir')).toEqual(['cora'])
    expect(atTable(content, at(start, 1, 12), 'chess')).toEqual(['bea'])
    expect(atTable(content, at(start, 1, 12), 'choir')).toEqual(['ana', 'cora'])
    expect(atTable(content, at(start, 2, 10), 'chess')).toEqual(['ana', 'bea'])
    expect(atTable(content, at(start, 1, 15), 'chess')).toEqual([])
    // Whoever is at a table is at the fair, wherever her day would have her.
    expect(locationOf(content, at(start, 1, 12), content.loveInterests[1])).toBe('shop')
  })

  it('takes a hello as meeting her, once, and gives a table\'s freebie the first time he stops there', () => {
    const before = at(start, 1, 10)
    const { state, gift } = sayHello(content, before, 'ana', 'chess')
    expect(gift).toBe('pen')
    expect(state.time).toBe(before.time)
    expect(state.met).toContain('ana')
    expect(saidHello(state, 'ana', 'chess')).toBe(true)
    // A hello is the society's: at her other table she says it again, though she is not met twice.
    expect(saidHello(state, 'ana', 'choir')).toBe(false)
    const again = sayHello(content, state, 'ana', 'choir').state
    expect(again.memories['ana']).toHaveLength(state.memories['ana'].length)
    expect(state.memories['ana']?.at(-1)?.summary).toMatch(/at the Societies Fair, when he stopped at the Chess Club table/)
    expect(state.inventory['pen']).toBe(1)
    expect(stopAtTable(content, state, 'chess').gift).toBeUndefined()
  })

  it('takes hello from a whole booth, written for whoever stands at it, and the freebie once', () => {
    const before = at(start, 1, 10)
    expect(helloIntro(content, before, ['ana', 'bea'], 'chess')).toMatchObject({ speakerId: 'ana', scenes: [{ locationId: 'shop', backgroundId: 'fair', castIds: ['ana', 'bea'], lines: ['*Ana waves.*', 'Ana: Chess, {player}?', 'Bea: Hi.'] }] })
    // In the afternoon Bea has the table to herself, and her own hello for it.
    expect(helloIntro(content, at(start, 1, 12), ['bea'], 'chess')?.scenes[0].lines).toEqual(['Bea: Hi.'])
    const { state, gift } = sayHelloAll(content, before, ['ana', 'bea'], 'chess')
    expect(gift).toBe('pen')
    expect(state.inventory['pen']).toBe(1)
    expect(state.met).toEqual(expect.arrayContaining(['ana', 'bea']))
    expect(helloDue(content, state, ['ana', 'bea'], 'chess')).toBe(false)
    expect(helloDue(content, state, ['bea'], 'chess')).toBe(false)
    // At her other table, the hello is that society's, and hers to say again.
    expect(helloIntro(content, state, ['ana', 'cora'], 'choir')?.scenes[0].lines).toEqual(['Ana: Sing with us.'])
    // Nobody written for, no hello.
    expect(helloDue(content, start, ['cora'], 'choir')).toBe(false)
  })

  it('has the rival tables come to him once he has stopped at both, once', () => {
    const one = stopAtTable(content, at(start, 1, 10), 'chess').state
    expect(rivalryDue(content, one)).toBeUndefined()
    const both = stopAtTable(content, one, 'choir').state
    expect(rivalryDue(content, both)?.speakerId).toBe('ana')
    expect(rivalryDue(content, sawRivalry(both))).toBeUndefined()
  })

  it('lets him stop and talk while there is an hour left and someone to talk to', () => {
    expect(canTalkAtFair(content, at(start, 1, 12), ['bea']).ok).toBe(true)
    expect(canTalkAtFair(content, at(start, 1, 13), ['bea']).reasons).toEqual([])
    expect(canTalkAtFair(content, at(start, 1, 12), []).reasons).toEqual(['Nobody to talk to'])
    expect(canTalkAtFair(content, at(start, 1, 15), ['bea']).reasons).toEqual(['The fair is not on'])
  })
})
