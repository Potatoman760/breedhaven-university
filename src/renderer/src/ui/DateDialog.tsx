import { useState } from 'react'
import { dateChoices, spriteFor, wornOutfit } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { BackButton } from './BackButton'
import { Dialog } from './Dialog'
import { GrandButton } from './GrandButton'
import { HeartIcon } from './icons'
import { Portrait } from './Portrait'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  /** What the date is: "the Lantern Festival". */
  title: string
  /** The most he may take. */
  most: number
  onGo: (ids: string[]) => void
  onClose: () => void
}

/** Who he takes on a date: one, or up to `most`, of the women he knows. Whom he leaves out is his to answer for. */
export function DateDialog({ content, state, title, most, onGo, onClose }: Props) {
  const [taking, setTaking] = useState<string[]>([])
  const toggle = (id: string) => setTaking((now) => (now.includes(id) ? now.filter((one) => one !== id) : now.length < most ? [...now, id] : now))
  const choices = dateChoices(content, state)

  return (
    <Dialog title={t('screens.dateDialog.title')} note={title} onClose={onClose} noClose wide ornate>
      <div className="party-grid">
        {choices.map((li) => {
          const chosen = taking.includes(li.id)
          const full = !chosen && taking.length >= most
          return (
            <button key={li.id} type="button" aria-pressed={chosen} className={`party-card${chosen ? ' picked' : ''}`} disabled={full} title={full ? t('screens.dateDialog.noMoreThan', { most }) : undefined} onClick={() => toggle(li.id)}>
              <Portrait who={li} image={spriteFor(li, wornOutfit(content, state, li), 'neutral')} size="fill" className="party-face" />
              <strong>{li.name.split(' ')[0]}</strong>
            </button>
          )
        })}
      </div>
      <div className="actions party-actions">
        <BackButton label={t('screens.sceneView.notNow')} onClick={onClose} />
        <GrandButton label={t('screens.dateDialog.go')}icon={<HeartIcon size={24} />} disabled={taking.length === 0} onClick={() => onGo(taking)} />
      </div>
    </Dialog>
  )
}
