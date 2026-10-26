import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildCharacterPrompt,
  spriteFor,
  coursesInSession,
  createInitialState,
  eventsOn,
  isGameOver,
  toDate,
  weatherOn,
  weatherWeight
} from '../../shared/game'
import { loadContentPack } from './loader'

describe('the default content pack', () => {
  const dir = join(process.cwd(), 'content', 'default')
  const content = loadContentPack(dir)

  it('loads and validates', () => {
    expect(content.loveInterests.length).toBeGreaterThan(0)
    expect(content.codex.length).toBeGreaterThan(0)
    expect(content.calendar.months).toHaveLength(12)
  })

  it('runs an autumn term: mid-Goldenhay to Frostveil, nineteen weeks, the last a winter break', () => {
    const { calendar } = content
    const state = createInitialState(content)
    const first = toDate(calendar, 0)
    expect([first.day, first.month.name, first.weekday, first.hour]).toEqual([15, 'Goldenhay', 'Monday', 8])
    expect(calendar.lengthDays).toBe(19 * 7)
    const last = toDate(calendar, (calendar.lengthDays - 1) * calendar.hoursPerDay)
    expect([last.day, last.month.name, last.weekday]).toEqual([25, 'Frostveil', 'Sunday'])
    expect(isGameOver(calendar, calendar.lengthDays * calendar.hoursPerDay)).toBe(true)
    // A year is fifty-two weeks to the day, so a date falls on the same weekday every year.
    expect(calendar.months.reduce((sum, month) => sum + month.days, 0)).toBe(364)

    const names = (day: number) => eventsOn(content, { ...state, time: day * calendar.hoursPerDay }).map((e) => e.id)
    expect(names(0)).toEqual(['orientation-day'])
    // The break is exactly the last week, and nothing before it.
    for (let day = 0; day < calendar.lengthDays; day++) {
      expect(names(day).includes('winter-break')).toBe(day >= calendar.lengthDays - 7)
    }
  })

  it('has no classes in the winter break, and has them the week before', () => {
    const { calendar, coursework } = content
    const course = {
      id: 'c', number: 'X 101', title: 'X', professor: 'P', description: '', subject: 'X', code: 'X', level: 1, general: true,
      stats: ['wisdom' as const], studentIds: [], locationId: coursework!.locationId,
      meetings: [{ weekday: 'Tuesday', startHour: 10, hours: 2, kind: 'lecture' as const }]
    }
    const state = { ...createInitialState(content), courses: [course], enrolment: ['c'] }
    // Tuesdays are days 1, 8, 15...; hour 10 is two hours after the 08:00 the game starts at.
    const tuesday = (week: number) => ({ ...state, time: (week * 7 + 1) * calendar.hoursPerDay + 2 })
    expect(coursesInSession(content, tuesday(1))).toHaveLength(1)
    expect(coursesInSession(content, tuesday(17))).toHaveLength(1)
    expect(coursesInSession(content, tuesday(18))).toEqual([])
  })

  it('gives every month weather that adds up to all of its days, in a temperate pattern', () => {
    const { calendar } = content
    const share = (kind: string, month: string) => calendar.weather.find((w) => w.id === kind)?.chance?.[month] ?? 0
    for (const month of calendar.months) {
      expect(calendar.weather.reduce((sum, w) => sum + weatherWeight(w, month.id), 0)).toBe(100)
    }
    // Heat belongs to summer and snow to winter; autumn is the misty season.
    expect(share('heat', 'highsun')).toBeGreaterThan(share('heat', 'emberfall'))
    expect(share('heat', 'frostveil')).toBe(0)
    expect(share('snow', 'goldenhay')).toBe(0)
    expect(share('snow', 'deepwinter')).toBeGreaterThan(share('snow', 'frostveil'))
    expect(share('mist', 'mistmoon')).toBeGreaterThan(share('mist', 'goldenhay'))
    expect(share('clear', 'goldenhay')).toBeGreaterThan(share('clear', 'frostveil'))

    // Over many games, the first week of term is never snowed on and the break often is.
    const seen = (day: number) =>
      Array.from({ length: 300 }, (_, seed) => weatherOn(content, { ...createInitialState(content, undefined, seed), time: day * 24 })?.id)
    expect(seen(3)).not.toContain('snow')
    const snowy = seen(130).filter((id) => id === 'snow').length
    expect(snowy).toBeGreaterThan(20)
    expect(snowy).toBeLessThan(80)
  })

  it('produces a prompt for every love interest', () => {
    const state = createInitialState(content)
    for (const li of content.loveInterests) {
      expect(buildCharacterPrompt({ content, state, loveInterestId: li.id })).toContain(li.name)
    }
  })

  it('gives every love interest the four standard outfits, the pregnant two marked as such', () => {
    for (const li of content.loveInterests) {
      expect(li.outfits.slice(0, 4).map((o) => [o.id, o.pregnant]), li.id).toEqual([
        ['default', false],
        ['pregnant', true],
        ['nude', false],
        ['nude-pregnant', true]
      ])
      // Whatever she is wearing and however she feels, there is a picture to show.
      for (const outfit of li.outfits) expect(spriteFor(li, outfit, 'aroused'), `${li.id}/${outfit.id}`).toBeDefined()
    }
  })

  it('has a file on disk for every sprite and animation it names', () => {
    const missing = content.loveInterests.flatMap((li) =>
      [
        ...li.outfits.flatMap((outfit) => Object.values(outfit.sprites).map((s) => s.image)),
        ...(li.walkSprite ? [li.walkSprite] : []),
        ...li.animations.flatMap((animation) => [animation.image, animation.clip].filter((file): file is string => file !== undefined))
      ].filter((path) => !existsSync(join(dir, path)))
    )
    expect(missing).toEqual([])
  })

  it('has a file on disk for every background and the map', () => {
    const images = [
      ...content.locations.flatMap((l) => l.backgrounds.flatMap((b) => Object.values(b.images))),
      ...(content.map?.image ? [content.map.image] : [])
    ]
    expect(images.length).toBeGreaterThan(0)
    expect(images.filter((path) => !existsSync(join(dir, path)))).toEqual([])
  })
})
