import { useRef, useState } from 'react'
import { LIGHTS, type Light, type Location, type Room } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { ArtTool } from '../art/ArtTool'
import { Button } from '../Button'
import { Lightbox } from '../Lightbox'
import { t } from '../../../../shared/i18n'

type Props = {
  room: Room
  /** The place the room is in: any of its views can stand for the room, by day and by night. */
  place: Location | undefined
  /** Whose folder pictures are imported and drawn into. */
  owner: string
  disabled?: boolean
  onChange: (patch: Partial<Room>) => void
  onStatus: (message: string) => void
}

/** A room's pictures: one by day and one by night of its own, or a view of the place it is in. */
export function RoomPictures({ room, place, owner, disabled, onChange, onStatus }: Props) {
  const [viewing, setViewing] = useState<Light | null>(null)
  const [drawing, setDrawing] = useState(false)
  const views = place?.backgrounds ?? []
  const images = room.images ?? {}
  // The drawing tool hands back the day and the night one after the other, before the room it was given is redrawn.
  const latest = useRef(images)
  latest.current = images

  const setImage = (light: Light, image: string | undefined) => {
    const next = { ...latest.current, [light]: image }
    if (!image) delete next[light]
    latest.current = next
    onChange({ images: Object.keys(next).length > 0 ? next : undefined })
  }

  async function upload(light: Light) {
    onStatus('')
    try {
      const image = await window.api.editor.importAsset({ loveInterestId: owner, kind: 'image' })
      if (image) setImage(light, image)
    } catch (error) {
      onStatus(errorMessage(error))
    }
  }

  return (
    <>
      {views.length > 0 && (
        <label className="inline">
          {t('editor.room.picture')}
          <select value={room.viewId ?? ''} onChange={(e) => onChange({ viewId: e.target.value || undefined })}>
            <option value="">{t('editor.room.itsOwn')}</option>
            {views.map((view) => (
              <option key={view.id} value={view.id}>
                {t('editor.room.viewOption', { place: place?.name ?? '', view: view.name })}
              </option>
            ))}
          </select>
        </label>
      )}
      {room.viewId === undefined && (
        <div className="row checks">
          {LIGHTS.map((light) => {
            const image = images[light.id]
            return (
              <div key={light.id} className="room-slot">
                {image ? (
                  <button type="button" className="sprite-thumb room-thumb" title={t('editor.room.view', { light: light.name })} onClick={() => setViewing(light.id)}>
                    <img className="room-art" src={`content://pack/${image}`} alt={light.name} />
                  </button>
                ) : (
                  <span className="hint">{t('editor.room.none', { light: light.name.toLowerCase() })}</span>
                )}
                <div className="row checks">
                  <Button size="small" disabled={disabled} onClick={() => upload(light.id)}>
                    {image ? t('editor.room.replace', { light: light.name.toLowerCase() }) : t('editor.room.add', { light: light.name.toLowerCase() })}
                  </Button>
                  {image && (
                    <Button size="small" variant="quiet" onClick={() => setImage(light.id, undefined)}>
                      {t('editor.common.remove')}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
          <Button disabled={disabled} title={t('editor.room.generateTitle')} onClick={() => setDrawing(true)}>
            {t('editor.room.generate')}
          </Button>
        </div>
      )}
      {viewing && images[viewing] && <Lightbox image={images[viewing]!} name={room.name} onClose={() => setViewing(null)} />}
      {drawing && (
        <ArtTool
          target={{
            kind: 'background',
            // The room's name says whose it is ("her flat above the Honeyed Bee"), which is no use to an image model.
            location: { id: owner, name: '', appearance: room.description, indoors: true },
            title: room.name,
            periods: [...LIGHTS],
            onUse: (_view, image, period) => setImage(period === 'night' ? 'night' : 'day', image)
          }}
          onClose={() => setDrawing(false)}
        />
      )}
    </>
  )
}
