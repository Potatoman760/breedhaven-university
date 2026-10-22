import { useState } from 'react'
import { dateChoices, spriteFor, wornOutfit } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { BackButton } from './BackButton'
import { Dialog } from './Dialog'
import { GrandButton } from './GrandButton'
import { HeartIcon } from './icons'
import { Portrait } from './Portrait'

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
    <Dialog title="Who will you take?" note={title} onClose={onClose} noClose wide ornate>
      <div className="party-grid">
        {choices.map((li) => {
          const chosen = taking.includes(li.id)
          const full = !chosen && taking.length >= most
          return (
            <button key={li.id} type="button" aria-pressed={chosen} className={`party-card${chosen ? ' picked' : ''}`} disabled={full} title={full ? `No more than ${most}` : undefined} onClick={() => toggle(li.id)}>
              <Portrait who={li} image={spriteFor(li, wornOutfit(content, state, li), 'neutral')} size="fill" className="party-face" />
              <strong>{li.name.split(' ')[0]}</strong>
            </button>
          )
        })}
      </div>
      <div className="actions party-actions">
        <BackButton label="Not now" onClick={onClose} />
        <GrandButton label="Go" icon={<HeartIcon size={24} />} disabled={taking.length === 0} onClick={() => onGo(taking)} />
      </div>
    </Dialog>
  )
}
