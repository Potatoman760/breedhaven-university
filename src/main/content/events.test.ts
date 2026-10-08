import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteEvent, loadWithAddons, saveEvent } from './addons'

// The game's own pack is the base; each test gets an empty add-on folder of its own.
const packDir = join(process.cwd(), 'content', 'default')
const addons = () => join(mkdtempSync(join(tmpdir(), 'bh-events-')), 'addons')
const base = loadWithAddons(packDir, addons())
const month = base.content.calendar.months[0]
const fair = { id: 'kite-fair', name: 'the Kite Fair', description: 'Kites over the Great Court.', month: month.id, day: 3, durationDays: 2 }

describe('events as add-ons', () => {
  it('joins the calendar, can be changed, and can be taken off again', () => {
    const dir = addons()
    expect(Object.values(base.info.events).every((origin) => origin === 'base')).toBe(true)
    expect(saveEvent(dir, base.content, { ...fair, generated: true, year: 412 })).toEqual([])
    const { content, info } = loadWithAddons(packDir, dir)
    expect(content.calendar.events.length).toBe(base.content.calendar.events.length + 1)
    // What the editor makes comes round every year, and is not marked as made up in play.
    expect(content.calendar.events.at(-1)).toMatchObject({ id: 'kite-fair', name: 'the Kite Fair', durationDays: 2, generated: false, noClasses: false })
    expect(content.calendar.events.at(-1)?.year).toBeUndefined()
    expect(info.events['kite-fair']).toBe('addon')
    expect(info.issues).toEqual([])

    expect(saveEvent(dir, content, { ...fair, noClasses: true })).toEqual([])
    expect(loadWithAddons(packDir, dir).content.calendar.events.filter((event) => event.id === 'kite-fair')).toMatchObject([{ noClasses: true }])

    expect(deleteEvent(dir, 'kite-fair')).toEqual([])
    expect(loadWithAddons(packDir, dir).content.calendar.events).toEqual(base.content.calendar.events)
    expect(deleteEvent(dir, 'kite-fair')).toEqual(['That event is not an add-on.'])
  })

  it('takes the place of one of the game’s own with its id, and cannot delete the game’s own', () => {
    const dir = addons()
    const [first] = base.content.calendar.events
    expect(saveEvent(dir, base.content, { ...first, description: 'Changed.' })).toEqual([])
    const { content, info } = loadWithAddons(packDir, dir)
    expect(content.calendar.events.length).toBe(base.content.calendar.events.length)
    expect(content.calendar.events[0]).toMatchObject({ id: first.id, description: 'Changed.' })
    expect(info.events[first.id]).toBe('override')
    expect(deleteEvent(addons(), first.id)).toEqual(['That event is not an add-on.'])
  })

  it('is refused when the game could not load with it', () => {
    const dir = addons()
    expect(saveEvent(dir, base.content, { ...fair, name: '  ' })).toEqual(['A name is needed.'])
    expect(saveEvent(dir, base.content, { ...fair, id: 'Not An Id' })[0]).toMatch(/lower-case/)
    expect(saveEvent(dir, base.content, { ...fair, month: 'nomonth' })[0]).toMatch(/nomonth/)
    expect(saveEvent(dir, base.content, { ...fair, day: month.days + 1 })[0]).toMatch(/only/)
    expect(saveEvent(dir, base.content, { ...fair, locationId: 'nowhere' })[0]).toMatch(/nowhere/)
    expect(loadWithAddons(packDir, dir).content.calendar.events).toEqual(base.content.calendar.events)
  })
})

describe('events of the game itself', () => {
  it('are written into its own calendar when that is what is being edited, and any of them can be deleted', () => {
    // A copy of the pack's calendar, so that the real one is left alone.
    const dir = mkdtempSync(join(tmpdir(), 'bh-calendar-'))
    copyFileSync(join(packDir, 'calendar.json'), join(dir, 'calendar.json'))
    const read = () => (JSON.parse(readFileSync(join(dir, 'calendar.json'), 'utf8')) as { events: { id: string; name: string }[]; months: unknown[] })
    const before = read()

    expect(saveEvent(dir, base.content, fair, true)).toEqual([])
    expect(read().events.map((event) => event.id)).toEqual([...before.events.map((event) => event.id), 'kite-fair'])
    // The rest of the calendar is as it was.
    expect(read().months).toEqual(before.months)

    const [first] = before.events
    expect(deleteEvent(dir, first.id, true)).toEqual([])
    expect(read().events.some((event) => event.id === first.id)).toBe(false)
    expect(deleteEvent(dir, first.id, true)).toEqual(['There is no such event.'])
  })
})
