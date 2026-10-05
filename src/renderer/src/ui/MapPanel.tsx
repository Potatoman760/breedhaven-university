import { canTravel, loveInterestsAt, whereaboutsUnknown } from '../../../shared/game'
import type { ContentPack, GameState, LoveInterest } from '../../../shared/model'
import { Dialog, ToBeImplemented } from './Dialog'

// Faces shown on one pin before the rest collapse into a "+2".
const MAX_PORTRAITS = 3

interface Props {
  content: ContentPack
  state: GameState
  onTravel: (locationId: string) => void
  onClose: () => void
}

/** A face-sized crop of the character's neutral sprite. */
export function Portrait({ li }: { li: LoveInterest }) {
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
  const hours = `${map.travelHours} ${map.travelHours === 1 ? 'hour' : 'hours'}`

  return (
    <Dialog title={map.name} onClose={onClose} wide>
      <p className="hint">Going somewhere takes {hours}.</p>
      <div className={map.image ? 'map' : 'map plain'}>
        {map.image && <img src={`content://pack/${map.image}`} alt={`Map of ${map.name}`} />}
        {map.regions.map((region) => (
          <div
            key={region.name}
            className="region"
            style={{
              left: `${region.x}%`,
              top: `${region.y}%`,
              width: `${region.w}%`,
              height: `${region.h}%`
            }}
          >
            <span className="caps">{region.name}</span>
          </div>
        ))}
        {map.pins.map((pin) => {
          const location = content.locations.find((l) => l.id === pin.locationId)
          if (!location) return null
          const here = pin.locationId === state.locationId
          const check = canTravel(content, state, pin.locationId)
          const people = loveInterestsAt(content, state, pin.locationId)
          return (
            <div
              key={pin.locationId}
              className={here ? 'pin here' : 'pin'}
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            >
              <div className="pin-head">
                <span className="caps">{location.name.replace(/^the /, '')}</span>
                {here ? (
                  <span className="chip">You are here</span>
                ) : (
                  <button
                    disabled={!check.ok}
                    title={check.reasons.join(' · ')}
                    onClick={() => onTravel(pin.locationId)}
                  >
                    Go
                  </button>
                )}
              </div>
              {!here && !check.ok && <span className="pin-note">{check.reasons.join(' · ')}</span>}
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
        })}
      </div>
      {unknown.length > 0 && (
        <p className="hint">
          Whereabouts unknown: <strong>{unknown.map((li) => li.name.split(' ')[0]).join(', ')}</strong>
        </p>
      )}
    </Dialog>
  )
}
