import { describe, expect, it } from 'vitest'
import { dayIndexOf, daysRemaining, formatDate, formatTime, isGameOver, toDate } from './calendar'
import { fixture } from './testFixture'

const { calendar } = fixture()

describe('toDate', () => {
  it('starts at the configured moment', () => {
    const d = toDate(calendar, 0)
    expect(d).toMatchObject({ year: 1, day: 2, hour: 6, weekday: 'Two', dayIndex: 0 })
    expect(d.month.id).toBe('a')
    expect(d.period.id).toBe('day')
  })

  it('rolls over to the next day using the configured day length', () => {
    const d = toDate(calendar, 14)
    expect(d).toMatchObject({ day: 3, hour: 0, weekday: 'Three', dayIndex: 1 })
    expect(d.month.id).toBe('a')
  })

  it('assigns hours before the first period to the last one', () => {
    expect(toDate(calendar, 14).period.id).toBe('night')
    expect(toDate(calendar, 9).period.id).toBe('night')
    expect(toDate(calendar, 8).period.id).toBe('day')
  })

  it('rolls over months of unequal length and wraps the week', () => {
    const d = toDate(calendar, 34)
    expect(d).toMatchObject({ year: 1, day: 1, weekday: 'One', dayIndex: 2 })
    expect(d.month.id).toBe('b')
  })

  it('agrees with dayIndexOf, including dates before the start and in later years', () => {
    expect(dayIndexOf(calendar, 1, 'a', 2)).toBe(0)
    expect(dayIndexOf(calendar, 1, 'b', 1)).toBe(2)
    expect(dayIndexOf(calendar, 1, 'a', 1)).toBe(-1)
    expect(dayIndexOf(calendar, 2, 'a', 2)).toBe(5)
  })

  it('rolls over the year', () => {
    const d = toDate(calendar, 94)
    expect(d).toMatchObject({ year: 2, day: 2, dayIndex: 5 })
    expect(d.month.id).toBe('a')
  })
})

describe('game length', () => {
  it('ends after lengthDays days', () => {
    expect(isGameOver(calendar, 133)).toBe(false)
    expect(isGameOver(calendar, 134)).toBe(true)
    expect(daysRemaining(calendar, 0)).toBe(7)
    expect(daysRemaining(calendar, 500)).toBe(0)
  })
})

describe('formatting', () => {
  it('formats date and time', () => {
    const d = toDate(calendar, 0)
    expect(formatTime(d)).toBe('06:00')
    expect(formatDate(d)).toBe('Two, 2 A, Year 1')
  })
})
