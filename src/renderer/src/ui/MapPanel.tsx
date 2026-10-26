import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { canTravel, isOpen, loveInterestsAt, mapDressingAt, toDate, wayDownAt, whereaboutsUnknown } from '../../../shared/game'
import type { ContentPack, GameState, Location, MapPin } from '../../../shared/model'
import { Button } from './Button'
import { Dialog, Overlay, ToBeImplemented } from './Dialog'
import { GrandButton } from './GrandButton'
import { PlaceIcon } from './icons'
import { BackButton } from './BackButton'
import { Ornate } from './Ornate'
import { Portrait } from './Portrait'
import { settle } from './pinLayout'
import { t } from '../../../shared/i18n'

// Faces shown beside a pin before the rest collapse into a "+2".
const MAX_FACES = 3
// The shape of the map's picture, for it to be drawn as large as the screen allows.
const MAP_SHAPE = 1920 / 1088

interface Props {
  content: ContentPack
  state: GameState
  /** Goes to a place. Left out, the map is only to be looked at: nothing on it can be gone to, as in the middle of a scene. */
  onTravel?: (locationId: string) => void
  /** Who is in the scene that is open: they are with him, wherever their own day would have them. */
  withHim?: string[]
  onClose: () => void
}

const placeName = (location: Location) => location.name.replace(/^the /, '')

/** The town map: where everyone is right now, and a way to go there. */
export function MapPanel({ content, state, onTravel, withHim = [], onClose }: Props) {
  const { map } = content
  const board = useRef<HTMLDivElement>(null)
  // Laid out again after every change to what is on it, and whenever the map is drawn at another size.
  useLayoutEffect(() => {
    if (board.current) settle(board.current)
  })
  useLayoutEffect(() => {
    const element = board.current
    if (!element) return
    const watcher = new ResizeObserver(() => settle(element))
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [])
  if (!map) {
    return (
      <Dialog title={t('screens.navTiles.map')} onClose={onClose} narrow>
        <ToBeImplemented note={t('screens.map.noMap')} />
      </Dialog>
    )
  }

  const hour = toDate(content.calendar, state.time).hour
  // Those in the scene are where he is, and nowhere else; everyone else is where her day has her.
  const unknown = whereaboutsUnknown(content, state).filter((li) => !withHim.includes(li.id))
  const peopleAt = (locationId: string) => [
    ...loveInterestsAt(content, state, locationId).filter((li) => !withHim.includes(li.id)),
    ...(locationId === state.locationId ? content.loveInterests.filter((li) => withHim.includes(li.id)) : [])
  ]
  const wayDown = wayDownAt(content, state)
  const elsewhere = content.locations.filter((location) => !location.eventOnly && !map.pins.some((pin) => pin.locationId === location.id))

  /** Where a place stands for him now: here, shut, or somewhere to go (and if not, why not). */
  const standing = (location: Location) => {
    const here = location.id === state.locationId
    const check = canTravel(content, state, location.id)
    return {
      here,
      closed: !here && !isOpen(location, hour),
      ok: Boolean(onTravel) && check.ok,
      why: onTravel ? check.reasons.join(' · ') : t('screens.map.busy')
    }
  }

  const go = (locationId: string) => onTravel?.(locationId)

  const pin = (spot: MapPin) => {
    const location = content.locations.find((l) => l.id === spot.locationId)
    if (!location) return null
    const { here, closed, ok, why } = standing(location)
    const people = peopleAt(location.id)
    const portal = location.id === wayDown
    const dressing = mapDressingAt(content, state, location)
    const classes = ['map-pin', here && 'here', closed && 'closed', portal && 'portal']
    return (
      <div key={location.id} className={classes.filter(Boolean).join(' ')} style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
        <span className="map-pin-head">
          <span className="map-medallion" title={portal ? t('screens.map.wayDown', { place: location.name, below: String(content.expedition?.name) }) : location.name}>
            {/* The way down: a ring of runes turning around it. */}
            {portal && <span className="map-runes" aria-hidden="true" />}
            <PlaceIcon name={location.icon} image={location.iconImage} size={20} />
            {/* Dressed for the day: a wreath around it at the Feast of First Frost. */}
            {dressing && <img className="map-dressing" src={`content://pack/${dressing}`} alt="" aria-hidden="true" />}
          </span>
          <span className="map-plate">{placeName(location)}</span>
          {portal && <span className="map-below">{content.expedition?.name.replace(/^the /, '')}</span>}
          {here ? (
            <span className="map-state">{t('screens.dayView.here')}</span>
          ) : closed ? (
            <span className="map-state">{t('screens.map.closed')}</span>
          ) : (
            <Button variant="primary" size="small" className="map-go" disabled={!ok} title={why || undefined} onClick={() => go(location.id)}>
              {t('screens.dateDialog.go')}
            </Button>
          )}
        </span>
        {people.length > 0 && (
          <span className="map-pin-people">
            {people.slice(0, MAX_FACES).map((li) => (
              <Portrait key={li.id} who={li} size="clamp(44px, 3.2vw, 64px)" className="map-face" />
            ))}
            {people.length > MAX_FACES && (
              <span
                className="map-more"
                title={people
                  .slice(MAX_FACES)
                  .map((li) => li.name)
                  .join(', ')}
              >
                +{people.length - MAX_FACES}
              </span>
            )}
          </span>
        )}
      </div>
    )
  }

  return (
    <Overlay onClose={onClose}>
      <div className="map-screen">
        <div
          ref={board}
          className="map-board"
          style={{ '--map-shape': MAP_SHAPE } as CSSProperties}
          // It opens a little small: measured again once it is at its size.
          onAnimationEnd={(event) => event.target === event.currentTarget && settle(event.currentTarget)}
        >
          <img className="map-art" src={`content://pack/${map.image}`} alt={t('screens.map.mapOf', { name: map.name })} />
          {map.regions.map((region) => (
            <span key={region.name} className="map-region" style={{ left: `${region.x}%`, top: `${region.y}%` }}>
              {region.name}
            </span>
          ))}
          {map.pins.map(pin)}
        </div>

        {/* Those with nothing on their schedule are in their own rooms: shown, but not somewhere to go. */}
        {unknown.length > 0 && (
          <Ornate title={t('screens.map.inHerRoom')} className="map-rooms">
            <div className="portraits">
              {unknown.map((li) => (
                <Portrait key={li.id} who={li} size="clamp(56px, 4vw, 80px)" caption />
              ))}
            </div>
          </Ornate>
        )}

        {elsewhere.length > 0 && (
          <Ornate className="map-elsewhere">
            {/* A place that is on no map but can be gone to all the same: his own house. */}
            {elsewhere.map((location) => {
              const { here, ok, why } = standing(location)
              const people = peopleAt(location.id)
              return (
                <div key={location.id} className="map-off">
                  <PlaceIcon name={location.icon} image={location.iconImage} size={18} />
                  <strong>{location.name}</strong>
                  <span className="map-faces">
                    {people.map((li) => (
                      <Portrait key={li.id} who={li} size="clamp(34px, 2.5vw, 50px)" className="map-face" />
                    ))}
                  </span>
                  {here ? <span className="chip">{t('screens.map.youAreHere')}</span> : <GrandButton label={t('screens.dateDialog.go')} chevron disabled={!ok} tip={why} onClick={() => go(location.id)} />}
                </div>
              )
            })}
          </Ornate>
        )}

        <BackButton className="map-close pin-keepout" onClick={onClose} />
      </div>
    </Overlay>
  )
}
