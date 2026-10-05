import { useState } from 'react'
import { backgroundFor } from '../../../shared/game'
import type { Location } from '../../../shared/model'

interface Props {
  location: Location | undefined
  periodId: string
  /** A view the player picked, if any. */
  backgroundId?: string
}

/** The location artwork that fills the stage, or a note when there is none. */
export function Backdrop({ location, periodId, backgroundId }: Props) {
  const background = location && backgroundFor(location, periodId, backgroundId)
  const [failed, setFailed] = useState<string | null>(null)

  if (!background || failed === background.image) {
    return (
      <div className="stage-art">
        {background ? background.image : `No background set for ${location?.name ?? 'here'}`}
        <span>{background ? 'Background file not found' : 'Add one to locations.json'}</span>
      </div>
    )
  }
  return (
    <img
      className="backdrop"
      src={`content://pack/${background.image}`}
      alt=""
      onError={() => setFailed(background.image)}
    />
  )
}
