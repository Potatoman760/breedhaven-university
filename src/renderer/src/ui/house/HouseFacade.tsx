import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { builtTier, canBuild, factor, houseLayout, inRoom, nextWork, roomHeIsIn, spriteFor, viewImage, wornOutfit } from '../../../../shared/game'
import { Portrait } from '../Portrait'
import type { ContentPack, GameState, HousingConfig, Light, LoveInterest } from '../../../../shared/model'

// How tall a row of the plan is drawn, as a share of how wide a column is: as near the shape of the space the house has
// as rooms can be drawn, from a little squat to a little tall, so that a wide screen gets a wider, larger house.
const ROW_SHAPE = { least: 0.62, most: 0.9 }
// The shape the roof's picture is drawn at over the floor it covers, and how far its eaves reach past the walls, in percent.
const ROOF_SHAPE = 2.7
const EAVES = 4
// How tall the stone footing is, and a beam between floors, as shares of the front's width.
const FOOTING = 0.085
const BEAM = 0.022
// Where the chimneys stand on the roof's picture, for the smoke to rise from them.
const CHIMNEYS = [0.3, 0.7]

/** A picture of the pack as a CSS image, for what is tiled. */
const tile = (path: string | undefined) => (path ? `url("content://pack/${path}")` : undefined)

interface Props {
  content: ContentPack
  state: GameState
  config: HousingConfig
  light: Light
  picked: string | undefined
  /** A room just built, for the moment it is celebrated. */
  built?: string
  /** A room that was asked for and cannot be paid for: its price shakes. */
  refused?: string
  onPick: (key: string) => void
}

/** The picture her portrait is cut from in the house: what she is wearing today. */
export const wornSprite = (content: ContentPack, state: GameState, li: LoveInterest) => spriteFor(li, wornOutfit(content, state, li), undefined)

/**
 * The house seen from the front with its wall cut away: every room a window onto its own picture, floors stacked on
 * one another under a roof, built from the plan, so that a house of any rooms draws itself. What is not built yet is
 * dark and locked, with its price.
 */
export function HouseFacade({ content, state, config, light, picked, built, refused, onPick }: Props) {
  const layout = houseLayout(config)
  const house = content.locations.find((l) => l.id === config.locationId)
  const atHome = state.locationId === config.locationId
  const here = atHome ? roomHeIsIn(content, state)?.key : undefined
  const top = layout.floors[0]
  const roofWidth = top.width + EAVES * 2
  // What the roof and footing add to the building's height, for its width.
  const added = roofWidth / 100 / ROOF_SHAPE + FOOTING
  // The shape of the space the house is drawn in, kept up to date as the window changes.
  const building = useRef<HTMLDivElement>(null)
  const [space, setSpace] = useState(1.6)
  useLayoutEffect(() => {
    const stage = building.current?.parentElement
    if (!stage) return
    const measure = () => stage.clientHeight > 0 && setSpace(stage.clientWidth / stage.clientHeight)
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(stage)
    return () => watcher.disconnect()
  }, [])
  // The row shape that makes the whole building, with what is built on at its side, the shape of that space, within
  // what rooms can be drawn at. `lot` is how many times the front's width the house and its side together are.
  const shapeFor = (lot: number) => Math.min(ROW_SHAPE.most, Math.max(ROW_SHAPE.least, ((lot / space - added) * layout.columns) / layout.rows))
  // How far what is out of doors reaches past the house's left wall, as a share of the front's width: on each floor, a
  // square as tall as the floor's rooms for each, less what of it the floor is set in from the house's edge.
  const yardFor = (rowShape: number) =>
    Math.max(
      0,
      ...layout.floors.map((band) => {
        const count = layout.grounds.filter((key) => config.rooms.find((r) => r.key === key)?.plan.floor === band.floor).length
        const rows = (band.height / 100) * layout.rows
        return count * ((rows * rowShape) / layout.columns - (config.art.beam ? BEAM : 0)) - band.left / 100
      })
    )
  // The yard's size depends on the rows' shape and the rows' shape on the room the yard leaves, so it is settled twice.
  const yard = yardFor(shapeFor(1 + yardFor(shapeFor(1))))
  const rowShape = shapeFor(1 + yard)
  // The front's shape, and the whole building's with its roof, for it to be drawn as large as the space allows.
  const front = layout.columns / (layout.rows * rowShape)
  const whole = 1 / (1 / front + added)
  // Where a floor is wider than the one on it, the part of it that is open to the sky has a slope of roof of its own.
  const pents = layout.floors.slice(1).flatMap((floor, i) => {
    const above = layout.floors[i]
    const bottom = 100 - floor.top
    return [
      above.left > floor.left && { key: `${floor.floor}-l`, left: floor.left, width: above.left - floor.left, bottom, side: 'left' },
      above.left + above.width < floor.left + floor.width && { key: `${floor.floor}-r`, left: above.left + above.width, width: floor.left + floor.width - above.left - above.width, bottom, side: 'right' }
    ].filter((pent): pent is { key: string; left: number; width: number; bottom: number; side: string } => Boolean(pent))
  })

  const { art } = config
  // A beam's thickness on the front, which is taller than it is wide by the front's shape.
  const beam = BEAM * front * 100
  // Each floor's beam takes its own strip along the floor's top, and the rooms of the floor share what is left under
  // it, so that the beam never covers the edge of a room.
  const underBeam = (box: { floor: number; top: number; height: number }) => {
    const band = layout.floors.find((floor) => floor.floor === box.floor)
    if (!band || !art.beam) return { top: box.top, height: box.height }
    const share = (band.height - beam) / band.height
    return { top: band.top + beam + (box.top - band.top) * share, height: box.height * share }
  }

  /** One room's window: its own picture, who is in it, and its lock and price until it is built. */
  const roomWindow = (key: string, index: number, place: CSSProperties) => {
    const room = config.rooms.find((r) => r.key === key)!
    const tier = builtTier(state, room.key)
    const work = nextWork(config, state, room.key, factor(content, state, 'build'))
    const affordable = tier < 1 && canBuild(content, state, room.key).ok
    const view = house?.backgrounds.find((one) => one.id === room.viewId)
    const image = viewImage(view, light)
    const present = tier > 0 ? inRoom(content, state, room.key) : []
    const classes = [
      'room-window',
      tier < 1 ? 'locked' : 'lit',
      room.plan.outdoors && 'outdoors',
      affordable && 'affordable',
      picked === room.key && 'selected',
      built === room.key && 'building'
    ]
    return (
      <button
        key={room.key}
        type="button"
        className={classes.filter(Boolean).join(' ')}
        style={{ ...place, animationDelay: `${(index * 0.7) % 3}s` }}
        onClick={() => onPick(room.key)}
      >
        {image ? <img src={`content://pack/${image}`} alt="" /> : <span className="room-blank" />}
        <span className="room-glow" style={{ animationDelay: `${(index * 1.3) % 4}s` }} />
        {built === room.key && (
          <span className="room-raise" aria-hidden="true">
            <i className="scaffold" />
            {Array.from({ length: 10 }, (_, n) => (
              <i key={n} className="spark" style={{ '--angle': `${n * 36}deg` } as CSSProperties} />
            ))}
          </span>
        )}
        {tier < 1 && (
          <span className="room-lock" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
        )}
        {present.length > 0 && (
          <span className="room-faces">
            {present.map((li) => (
              <Portrait key={li.id} who={li} image={wornSprite(content, state, li)} size={52} className="room-face" />
            ))}
          </span>
        )}
        {here === room.key && <span className="room-you">You</span>}
        <span className="room-plate">
          <strong>{room.name}</strong>
          {tier < 1 && work && <span className={refused === room.key ? 'room-price refused' : 'room-price'}>${work.cost}</span>}
          {tier > 1 && <span>{room.tiers[tier - 2]?.name}</span>}
        </span>
      </button>
    )
  }

  return (
    <div ref={building} className="house-building" style={{ '--house-shape': whole, '--house-yard': yard, '--house-wall': tile(art.wall), '--house-shingles': tile(art.shingles) } as CSSProperties}>
      <div className="house-roof" style={{ marginLeft: `${top.left - EAVES}%`, width: `${roofWidth}%`, aspectRatio: ROOF_SHAPE }}>
        {art.roof && <img src={`content://pack/${art.roof}`} alt="" />}
        {/* The chimneys smoke. */}
        {CHIMNEYS.map((at) => (
          <span key={at} className="house-smoke" style={{ left: `${at * 100}%` }}>
            <i />
            <i />
            <i />
          </span>
        ))}
      </div>

      <div className="house-front" style={{ aspectRatio: front }}>
        {pents.map((pent) => (
          <span key={pent.key} className={`house-pent ${pent.side}`} style={{ left: `${pent.left}%`, width: `${pent.width}%`, bottom: `${pent.bottom}%` }} />
        ))}
        {/* Each floor's wall, as wide as its rooms, with a beam along its top. */}
        {layout.floors.map((floor) => (
          <div key={floor.floor} className="house-floor-band" style={{ top: `${floor.top}%`, height: `${floor.height}%`, left: `${floor.left}%`, width: `${floor.width}%` }} />
        ))}
        {art.beam &&
          layout.floors.map((floor) => (
            <img
              key={`beam-${floor.floor}`}
              className="house-beam"
              src={`content://pack/${art.beam}`}
              alt=""
              style={{ top: `${floor.top}%`, height: `${beam}%`, left: `${floor.left - 1}%`, width: `${floor.width + 2}%` }}
            />
          ))}

        {layout.rooms.map((box, index) => {
          const { top, height } = underBeam(box)
          return roomWindow(box.key, index, { left: `${box.left}%`, top: `${top}%`, width: `${box.width}%`, height: `${height}%` })
        })}

        {/* What is out of doors is built on against the left wall of its floor, as tall as that floor's rooms and as
            wide as it is tall, one after another outward. */}
        {layout.grounds.map((key, index) => {
          const floor = config.rooms.find((r) => r.key === key)!.plan.floor
          const band = layout.floors.find((one) => one.floor === floor) ?? layout.floors[layout.floors.length - 1]
          const { top, height } = underBeam({ floor: band.floor, top: band.top, height: band.height })
          const before = layout.grounds.slice(0, index).filter((other) => config.rooms.find((r) => r.key === other)!.plan.floor === floor).length
          // A square on the front, which is `front` times wider than it is tall.
          const width = height / front
          return roomWindow(key, layout.rooms.length + index, { right: `${100 - band.left + before * width}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` })
        })}
      </div>

      {/* The stone footing the house stands on, with steps up to its door. */}
      {art.footing && <img className="house-footing" src={`content://pack/${art.footing}`} alt="" style={{ aspectRatio: 1 / FOOTING }} />}
    </div>
  )
}
