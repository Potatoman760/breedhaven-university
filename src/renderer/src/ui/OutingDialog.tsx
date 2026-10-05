import { checkOuting, describeOuting, describeWhen, firstNames, type Outing } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { Dialog } from './Dialog'

interface Props {
  content: ContentPack
  state: GameState
  outing: Outing
  /** Do it, after waiting the given hours. The outing may be a cut-down one, without whoever is busy. */
  onGo: (outing: Outing, waitHours: number) => void
  onClose: () => void
}

const hours = (n: number) => `${n} hour${n === 1 ? '' : 's'}`

/** Confirms something the player typed to do, and says what is in the way if it can't happen yet. */
export function OutingDialog({ content, state, outing, onGo, onClose }: Props) {
  const check = checkOuting(content, state, outing)
  const walk = outing.locationId === state.locationId ? 0 : (content.map?.travelHours ?? 0)
  const wait = check.waitHours

  return (
    <Dialog title={outing.title} onClose={onClose} narrow>
      <p>
        {describeOuting(content, outing)}
        {walk > 0 && `, after a walk of ${hours(walk)}`}.
      </p>
      {outing.withIds.length === 0 && (
        <p className="hint">Nobody was invited, so this passes the time without a scene.</p>
      )}

      {check.blockers.length > 0 && (
        <ul className="blockers">
          {check.blockers.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {wait === undefined && (
        <p className="notice">
          No time in the next day works for everyone. Ask them to make a plan for another day instead.
        </p>
      )}

      <div className="outing-options">
        {wait === 0 && (
          <button autoFocus onClick={() => onGo(outing, 0)}>
            Go
          </button>
        )}
        {wait !== undefined && wait > 0 && (
          <button autoFocus onClick={() => onGo(outing, wait)}>
            Wait {hours(wait)}, then go
            <span className="hint">Until {describeWhen(content, state.time + wait)}</span>
          </button>
        )}
        {check.freeNow.length > 0 && (
          <button className="secondary" onClick={() => onGo({ ...outing, withIds: check.freeNow }, 0)}>
            Go now with just {firstNames(content, check.freeNow)}
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          Never mind
        </button>
      </div>
    </Dialog>
  )
}
