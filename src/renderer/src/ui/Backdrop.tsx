import { useState } from 'react'
import { backgroundFor, isIndoors, viewImage } from '../../../shared/game'
import type { Location, WeatherEffect, Light } from '../../../shared/model'
import { FxLayer } from '../fx/FxLayer'
import { t } from '../../../shared/i18n'

interface Props {
  location: Location | undefined
  periodId: string
  /** Whether it is light or dark out: which of the view's two pictures is shown. */
  light: Light
  /** A view the player picked, if any. */
  backgroundId?: string
  /** Which screen this is the stage of, so that moving between screens can be given a transition. */
  screen: string
  /** Artwork to show in place of the location's: a love interest's own room. Always indoors. */
  room?: { image: string | undefined; key: string }
  /** What the weather looks like. Drawn only over views that are out of doors. */
  weather?: WeatherEffect
}

/** The location artwork that fills the stage, or a note when there is none. */
export function Backdrop({ location, periodId, light, backgroundId, screen, room, weather = 'none' }: Props) {
  const view = location && backgroundFor(location, backgroundId)
  // The view as it is at this time of day. In someone's room, her room's picture if she has one; until then, the place it is in.
  const shown = view && viewImage(view, light)
  const background =
    room?.image && view ? { ...view, id: room.key, image: room.image, indoors: true } : view && shown !== undefined ? { ...view, image: shown } : undefined
  const [failed, setFailed] = useState<string | null>(null)

  const fx = (
    <FxLayer
      view={{ screen, locationId: room ? room.key : location?.id, backgroundId: background?.id, periodId }}
      weather={room || isIndoors(location, background) ? 'none' : weather}
    />
  )

  if (!background || failed === background.image) {
    return (
      <>
        <div className="stage-art">
          {background ? background.image : location ? t('screens.backdrop.noBackgroundFor', { name: location.name }) : t('screens.backdrop.noBackgroundHere')}
          <span>{background ? t('screens.backdrop.fileNotFound') : t('screens.backdrop.noBackground')}</span>
        </div>
        {fx}
      </>
    )
  }
  // A view that moves plays its clip, silent, with its picture standing in until the clip is ready, or if it will not play.
  const clip = !room?.image && view?.clip && failed !== view.clip ? view.clip : undefined
  if (clip) {
    return (
      <>
        <video key={clip} className="backdrop" src={`content://pack/${clip}`} poster={`content://pack/${background.image}`} autoPlay loop muted playsInline onError={() => setFailed(clip)} />
        {fx}
      </>
    )
  }
  return (
    <>
      <img
        className="backdrop"
        src={`content://pack/${background.image}`}
        alt=""
        onError={() => setFailed(background.image)}
      />
      {fx}
    </>
  )
}
