import { canTravel, isOpen, loveInterestsAt, toDate, whereaboutsUnknown } from '../../../shared/game'
import type { ContentPack, GameState, LoveInterest } from '../../../shared/model'
import { Dialog, ToBeImplemented } from './Dialog'
import { PlaceIcon } from './icons'

// Faces shown on one pin before the rest collapse into a "+2".
const MAX_PORTRAITS = 6

interface Props {
  content: ContentPack
  state: GameState
  /** Goes to a place. Left out, the map is only to be looked at: nothing on it can be gone to, as in the middle of a scene. */
  onTravel?: (locationId: string) => void
  onClose: () => void
}

/** A face-sized crop of the character's neutral sprite. */
export function Portrait({ li }: { li: Pick<LoveInterest, 'name' | 'outfits' | 'defaultOutfitId' | 'faceY'> }) {
  const outfit = li.outfits.find((o) => o.id === li.defaultOutfitId)
  const sprite = (outfit?.sprites['neutral'] ?? Object.values(outfit?.sprites ?? {})[0])?.image
  const firstName = li.name.split(' ')[0]
  return (
    <div className="portrait">
      <div
        className="portrait-face"
        role="img"
        aria-label={li.name}
        style={
          sprite
            ? {
                backgroundImage: `url("content://pack/${sprite}")`,
                backgroundPosition: `50% ${li.faceY}%`
              }
            : undefined
        }
      />
      <span className="caps">{firstName}</span>
    </div>
  )
}

/** The town map: where everyone is right now, and a way to go there. */
export function MapPanel({ content, state, onTravel, onClose }: Props) {
  const { map } = content
  if (!map) {
    return (
      <Dialog title="Map" onClose={onClose} narrow>
        <ToBeImplemented note="This content pack has no map." />
      </Dialog>
    )
  }

  const unknown = whereaboutsUnknown(content, state)

  /** The card of one place: where it is put is given, as a share of whatever it is put in. */
  const pinCard = (pin: (typeof map.pins)[number], at: { x: number; y: number }) => {
    const location = content.locations.find((l) => l.id === pin.locationId)
    if (!location) return null
    const here = pin.locationId === state.locationId
    const check = canTravel(content, state, pin.locationId)
    // Shut by the time he would get there: it cannot be gone to, and says so above its name.
    const closed = !here && !isOpen(location, toDate(content.calendar, state.time).hour)
    const people = loveInterestsAt(content, state, pin.locationId)
    return (
      <div
        key={pin.locationId}
        className={here ? 'pin here' : closed ? 'pin closed' : 'pin'}
        style={{ left: `${at.x}%`, top: `${at.y}%` }}
      >
        {/* What kind of place it is and its name on one line; the way there on the next. */}
        <div className="pin-head">
          <span className="pin-icon">
            <PlaceIcon name={location.icon} size={22} />
          </span>
          <span className="caps pin-name">{location.name.replace(/^the /, '')}</span>
        </div>
        <div className="pin-go">
          {here ? (
            <span className="chip">You are here</span>
          ) : closed ? (
            <span className="caps pin-closed">Closed</span>
          ) : (
            <button
              disabled={!onTravel || !check.ok}
              title={onTravel ? check.reasons.join(' · ') : 'You are in the middle of something'}
              onClick={() => onTravel?.(pin.locationId)}
            >
              Go
            </button>
          )}
        </div>
        {people.length > 0 && (
          <div className="portraits">
            {people.slice(0, MAX_PORTRAITS).map((li) => (
              <Portrait key={li.id} li={li} />
            ))}
            {people.length > MAX_PORTRAITS && (
              <span
                className="chip"
                title={people
                  .slice(MAX_PORTRAITS)
                  .map((li) => li.name)
                  .join(', ')}
              >
                +{people.length - MAX_PORTRAITS}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  // On the plain chart each place belongs to the region it stands in, so that on a narrow screen a region can lay its places out in rows.
  const regionOf = (pin: { x: number; y: number }) => (map.image ? undefined : map.regions.find((r) => pin.x >= r.x && pin.x <= r.x + r.w && pin.y >= r.y && pin.y <= r.y + r.h))
  // Top to bottom and left to right, which is the order they are read in when laid out in rows.
  const inOrder = [...map.pins].sort((p, q) => p.y - q.y || p.x - q.x)

  return (
    <Dialog title={map.name} onClose={onClose} wide>
      <div className={map.image ? 'map' : 'map plain'}>
        {map.image && <img src={`content://pack/${map.image}`} alt={`Map of ${map.name}`} />}
        {map.regions.map((region) => (
          <div
            key={region.name}
            className={region.image ? 'region pictured' : 'region'}
            style={{
              left: `${region.x}%`,
              top: `${region.y}%`,
              width: `${region.w}%`,
              height: `${region.h}%`
            }}
          >
            {/* Its picture, faded, behind everything in it. */}
            {region.image && <img className="region-art" src={`content://pack/${region.image}`} alt="" />}
            <span className="caps">{region.name}</span>
            {/* The places in it, each put where it stands within the region. */}
            {inOrder
              .filter((pin) => regionOf(pin) === region)
              .map((pin) => pinCard(pin, { x: ((pin.x - region.x) / region.w) * 100, y: ((pin.y - region.y) / region.h) * 100 }))}
          </div>
        ))}
        {/* A place that stands in no region, and every place on a drawn map, is put on the map itself. */}
        {inOrder.filter((pin) => !regionOf(pin)).map((pin) => pinCard(pin, pin))}
      </div>
      {/* A place that is on no map but can be gone to all the same: his own house. */}
      {content.locations
        .filter((location) => !map.pins.some((pin) => pin.locationId === location.id))
        .map((location) => {
          const here = location.id === state.locationId
          const check = canTravel(content, state, location.id)
          const people = loveInterestsAt(content, state, location.id)
          return (
            <div key={location.id} className="map-rooms">
              <span className="caps">
                <PlaceIcon name={location.icon} size={18} /> {location.name}
              </span>
              {here ? (
                <span className="chip">You are here</span>
              ) : (
                <button disabled={!onTravel || !check.ok} title={onTravel ? check.reasons.join(' · ') : 'You are in the middle of something'} onClick={() => onTravel?.(location.id)}>
                  Go
                </button>
              )}
              <div className="portraits">
                {people.map((li) => (
                  <Portrait key={li.id} li={li} />
                ))}
              </div>
            </div>
          )
        })}
      {/* Those with nothing on their schedule are in their own rooms: shown, but not somewhere to go. */}
      {unknown.length > 0 && (
        <div className="map-rooms">
          <span className="caps">In her room</span>
          <div className="portraits">
            {unknown.map((li) => (
              <Portrait key={li.id} li={li} />
            ))}
          </div>
        </div>
      )}
    </Dialog>
  )
}
