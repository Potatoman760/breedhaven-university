import { describe, expect, it } from 'vitest'
import { validateContentPack, type ContentPack, type GameState } from '../model'
import { dayAgenda } from './agenda'
import { locationOf } from './map'
import { attendSociety, canAttendSociety, canJoinSociety, joinSociety, leaveSociety, societiesOpen, societyMeetingNow } from './societies'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'
import { nextUp } from './upcoming'

// The fixture's week is One, Two, Three on a 20-hour day that starts at 06:00, and the game begins on a Two: day 1 is a
// Three. The societies' fair opens at 10:00 that day. The chess club meets at home on Threes at noon, with Ana in it;
// the choir meets at the same hour, and the walkers an hour later.
const raw = rawFixture()
const content: ContentPack = validateContentPack({
  ...raw,
  calendar: { ...raw.calendar, events: [...raw.calendar.events, { id: 'fair', name: 'the Fair', month: 'a', day: 3, startHour: 10, hours: 4 }] },
  loveInterests: raw.loveInterests.map((li) => ({ ...li, studies: { subject: 'Riddles', code: 'RID', level: 1, stats: ['wisdom'], practical: false } })),
  societies: {
    fairId: 'fair',
    maxJoined: 2,
    energy: 5,
    societies: [
      { id: 'chess', name: 'the Chess Club', description: 'Chess.', locationId: 'home', weekday: 'Three', startHour: 12, stats: ['intelligence'], memberIds: ['ana'] },
      { id: 'choir', name: 'the Choir', description: 'Singing.', locationId: 'shop', weekday: 'Three', startHour: 12, stats: ['charisma'] },
      { id: 'walkers', name: 'the Walkers', description: 'Walking.', locationId: 'shop', weekday: 'Three', startHour: 13, stats: ['endurance', 'wisdom'] }
    ]
  }
})
const at = (state: GameState, day: number, hour: number, locationId = state.locationId): GameState => ({ ...state, time: day * 20 + hour - 6, locationId })
const start = createInitialState(content)
const ana = content.loveInterests[0]

describe('joining a society', () => {
  it('opens at the fair, and not before', () => {
    expect(societiesOpen(content, at(start, 1, 9))).toBe(false)
    expect(canJoinSociety(content, at(start, 1, 9), 'chess').reasons).toEqual(['The societies sign up new members at their fair'])
    expect(canJoinSociety(content, at(start, 1, 10), 'chess').ok).toBe(true)
    // After the fair, as well.
    expect(canJoinSociety(content, at(start, 4, 8), 'chess').ok).toBe(true)
  })

  it('takes no more societies than he may belong to, and none that meets when one of his does', () => {
    const open = at(start, 1, 10)
    const one = joinSociety(content, open, 'chess')
    expect(one.societies).toEqual(['chess'])
    expect(canJoinSociety(content, one, 'choir').reasons).toEqual(['It meets when the Chess Club does'])
    const two = joinSociety(content, one, 'walkers')
    expect(two.societies).toEqual(['chess', 'walkers'])
    expect(canJoinSociety(content, leaveSociety(two, 'walkers'), 'walkers').ok).toBe(true)
    expect(canJoinSociety(content, { ...two, societies: ['walkers', 'x'] }, 'chess').reasons).toEqual(['You can belong to 2 societies at most'])
  })
})

describe('a meeting', () => {
  const member = joinSociety(content, at(start, 1, 10), 'chess')

  it('is on its day at its hour, once the societies are open, and has its members there', () => {
    expect(societyMeetingNow(content, at(member, 1, 12), content.societies!.societies[0])).toBe(true)
    expect(societyMeetingNow(content, at(member, 1, 13), content.societies!.societies[0])).toBe(false)
    // The same hour of the week before the fair is not a meeting.
    expect(societyMeetingNow(content, at(member, -2, 12), content.societies!.societies[0])).toBe(false)
    expect(locationOf(content, at(member, 1, 12), ana)).toBe('home')
    expect(locationOf(content, at(member, 1, 11), ana)).toBe('shop')
  })

  it('is on his calendar and next on his day', () => {
    expect(dayAgenda(content, member, 1).find((item) => item.kind === 'society')).toMatchObject({ title: 'the Chess Club', startHour: 12, hours: 1 })
    expect(nextUp(content, at(member, 1, 11))).toMatchObject({ kind: 'society', id: 'chess', locationId: 'home' })
  })

  it('is been to once, there, for its hour and its energy', () => {
    expect(canAttendSociety(content, at(member, 1, 12, 'shop'), 'chess').reasons).toEqual(['the Chess Club meets at Home'])
    const there = at(member, 1, 12, 'home')
    const after = attendSociety(content, there, 'chess')
    expect(after.time).toBe(there.time + 1)
    expect(after.player.energy).toBe(there.player.energy - 5)
    expect(canAttendSociety(content, { ...after, time: there.time }, 'chess').reasons).toEqual(['You have been to this meeting'])
    expect(canAttendSociety(content, at(start, 1, 12, 'home'), 'chess').reasons).toEqual(['You do not belong to the Chess Club'])
  })
})
