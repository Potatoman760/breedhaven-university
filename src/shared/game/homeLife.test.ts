import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContentPack } from '../../main/content/loader'
import type { GameState } from '../model'
import { timeOn } from './agenda'
import { inRoom, movingInScene, roomHeIsIn, whereAtHome } from './homeLife'
import { buildRoom, goToRoom, invite, moveIn, withHousing } from './housing'
import { createInitialState } from './state'

/** The household about the house, on the game's own content: a resident, the nanny, and the hours of a day. */
describe('who is where in the house', () => {
  const written = loadContentPack(join(process.cwd(), 'content', 'default'))
  const housing = written.housing!
  const seen = (state: GameState) => withHousing(written, state)
  const start = createInitialState(seen(createInitialState(written)))
  const offered: GameState = { ...start, housing: { ...start.housing, status: 'offered' }, player: { ...start.player, money: 5000 } }
  const moved = moveIn(seen(offered), offered)
  // Tamsin carries his child, is his, and is fond enough to be asked: she takes the master bedroom with him.
  const fond: GameState = {
    ...moved,
    relationships: { ...moved.relationships, tamsin: { affection: 80, trust: 70, desire: 60 } },
    bonds: [{ statusId: 'open', memberIds: ['tamsin'], since: 0 }],
    pregnancies: { tamsin: { conceivedAt: 0, dueAt: 3000 } }
  }
  const master = housing.rooms.find((room) => room.role === 'master')!.key
  const nannyRoom = housing.rooms.find((room) => room.role === 'nanny')!.key
  const home = invite(seen(fond), fond, 'tamsin', master)
  // A free day, so that nobody has a class to be at.
  const at = (state: GameState, hour: number): GameState => ({ ...state, time: timeOn(written, 54, hour), locationId: housing.locationId })

  it('goes from her saying yes straight to an hour with her in the room she has moved into', () => {
    const shown = movingInScene(seen(home), home, 'tamsin', master)!
    expect(shown.state.housing.room).toBe(master)
    expect(shown.state.locationId).toBe(housing.locationId)
    expect(shown.scene).toMatchObject({ loveInterestId: 'tamsin', companionIds: [], npc: false })
    expect(shown.scene.viewId).toBe(housing.rooms.find((room) => room.key === master)!.viewId)
    expect(shown.scene.beats[0].direction).toMatch(/just said yes to moving in .*excited/)
    // Not for someone who does not live there, or not in that room.
    expect(movingInScene(seen(fond), fond, 'tamsin', master)).toBeUndefined()
  })

  it('has everyone in her own room at night', () => {
    expect(home.housing.residents['tamsin']).toBe(master)
    const night = at(home, 23)
    expect(whereAtHome(seen(night), night, 'tamsin')).toBe(master)
    expect(whereAtHome(seen(night), night, housing.nannyId)).toBe(nannyRoom)
    expect(inRoom(seen(night), night, master).map((li) => li.id)).toEqual(['tamsin'])
    // On the morning she goes to market she is not in the house at all.
    const marketMorning = at(home, 9)
    expect(whereAtHome(seen(marketMorning), marketMorning, housing.nannyId)).toBeUndefined()
  })

  it('has them about the built rooms by day, the same in the same hour, and never in a room that is not there', () => {
    const built = new Set(housing.rooms.filter((room) => room.startsBuilt).map((room) => room.key))
    const places = new Set<string>()
    // Over a fortnight of free days, so that the answer does not hang on one day's roll.
    for (const day of [5, 6, 12, 13, 19, 20, 26, 27, 33, 34, 40, 41, 47, 48]) for (let hour = 8; hour < 22; hour++) {
      const now: GameState = { ...home, time: timeOn(written, day, hour), locationId: housing.locationId }
      for (const id of ['tamsin', housing.nannyId]) {
        const where = whereAtHome(seen(now), now, id)
        if (where === undefined) continue
        expect(built.has(where), `${id} at ${hour}:00 in ${where}`).toBe(true)
        expect(whereAtHome(seen(now), now, id)).toBe(where)
        places.add(where)
      }
    }
    // Over those days they are not always in the one room.
    expect(places.size).toBeGreaterThan(1)
  })

  it('is nothing for someone who does not live there, or is out', () => {
    const noon = at(home, 12)
    expect(whereAtHome(seen(noon), noon, 'faye')).toBeUndefined()
    expect(whereAtHome(seen(start), start, housing.nannyId)).toBeUndefined()
  })

  it('knows the room he is looking at: the one he went to, or the one the house opens on', () => {
    const noon = at(home, 12)
    expect(roomHeIsIn(seen(noon), noon)?.viewId).toBe('default')
    const upstairs = goToRoom(seen(noon), noon, master)
    expect(roomHeIsIn(seen(upstairs), upstairs)?.key).toBe(master)
    expect(roomHeIsIn(seen(noon), { ...noon, locationId: 'market' })).toBeUndefined()
    // A room he builds is one they may then be found in.
    const nursery = housing.rooms.find((room) => room.cots > 0 && room.role === 'common')!.key
    expect(buildRoom(seen(noon), noon, nursery).housing.rooms[nursery]).toBe(1)
  })
})
