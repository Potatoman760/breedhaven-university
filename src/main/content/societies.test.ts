import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { atTable, boothHello, fairNow, fairTables, isOpen } from '../../shared/game'
import { EXPRESSIONS, kindOf, type GameState } from '../../shared/model'
import { createInitialState } from '../../shared/game/state'
import { loadContentPack } from './loader'

// The societies are hand-written: whoever is added to the cast has to be put in one, and every meeting has to be somewhere open after classes.
describe('the societies of the default pack', () => {
  const content = loadContentPack(join(process.cwd(), 'content', 'default'))
  const config = content.societies!

  it('has every student in at least one society', () => {
    const students = content.loveInterests.filter((li) => kindOf(li) === 'student')
    expect(students.filter((li) => !config.societies.some((society) => society.memberIds.includes(li.id))).map((li) => li.id)).toEqual([])
  })

  it('meets after classes, on a teaching day, somewhere open for the whole meeting', () => {
    const coursework = content.coursework!
    for (const society of config.societies) {
      const place = content.locations.find((l) => l.id === society.locationId)!
      expect(coursework.weekdays, society.id).toContain(society.weekday)
      expect(society.startHour, society.id).toBeGreaterThanOrEqual(coursework.dayEnd)
      for (let hour = society.startHour; hour < society.startHour + config.hours; hour++) expect(isOpen(place, hour), `${society.id} at ${hour}`).toBe(true)
    }
  })

  it('has a hello written for every company that stands at a table during the fair', () => {
    const fair = content.calendar.events.find((event) => event.id === config.fairId)!
    const start = createInitialState(content)
    const missing: string[] = []
    let open = 0
    for (let time = 0; time < 24 * 120; time++) {
      const state: GameState = { ...start, time }
      if (!fairNow(content, state)) continue
      open++
      for (const { society } of fairTables(content)) {
        const staff = atTable(content, state, society.id)
        const hello = staff.length > 0 && boothHello(content, staff, society.id)
        if (staff.length > 0 && (!hello || hello.cast.length !== staff.length)) missing.push(`${society.id}: ${staff.join(', ')}`)
      }
    }
    expect(open).toBe(2 * (fair.hours ?? 1))
    expect([...new Set(missing)]).toEqual([])
  })

  it('has a topic for every meeting of the term, and two nights of its own at the third and the tenth, with everyone of it in them', () => {
    for (const society of config.societies) {
      expect(society.syllabus.length, society.id).toBeGreaterThanOrEqual(16)
      expect(society.adultEvents.map((event) => event.meeting), society.id).toEqual([3, 10])
      const people = [...society.memberIds, ...(society.sponsorId ? [society.sponsorId] : [])]
      for (const event of society.adultEvents) {
        expect(event.intro.scenes[0].locationId, `${society.id} ${event.name}`).toBe(society.locationId)
        expect([...(event.intro.scenes[0].castIds ?? [])].sort(), `${society.id} ${event.name}`).toEqual([...people].sort())
      }
    }
  })

  it('dresses and undresses only those on the stage of a night, in outfits and faces they have', () => {
    const tag = /^\[(OUTFIT|EXPRESSION):\s*([^=\]]+?)=([^\]]+)\]$/
    for (const society of config.societies) {
      const intros = society.adultEvents.flatMap((event) => [event.intro, ...event.reserved.flatMap((held) => (held.ifIntimate ? [held.ifIntimate.intro] : []))])
      for (const intro of intros) {
        const cast = (intro.scenes[0].castIds ?? []).map((id) => content.loveInterests.find((li) => li.id === id)!)
        for (const line of intro.scenes.flatMap((scene) => scene.lines).filter((one) => one.startsWith('['))) {
          const [, kind, name, value] = line.match(tag) ?? []
          const who = cast.find((li) => li.name.split(' ')[0] === name)
          expect(who, `${society.id}: ${line}`).toBeDefined()
          if (kind === 'OUTFIT') expect(who!.outfits.map((outfit) => outfit.id), `${society.id}: ${line}`).toContain(value)
          else expect(EXPRESSIONS as readonly string[], `${society.id}: ${line}`).toContain(value)
        }
      }
    }
  })
})

