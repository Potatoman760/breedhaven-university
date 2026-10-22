import { useState } from 'react'
import { guessable, masked } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Portrait } from './Portrait'

interface Props {
  content: ContentPack
  state: GameState
  /** He goes up to one of them and names her. */
  onGuess: (dancerId: string, guessedId: string) => void
}

/**
 * The end of a masked ball: he picks one of the masked women he danced with, then names her from the women he knows.
 * The night is not over until he has.
 */
export function MasqueradeGuess({ content, state, onGuess }: Props) {
  const [chosen, setChosen] = useState<string | null>(null)
  const dancers = guessable(content, state).flatMap(({ id, mask }) => {
    const li = content.loveInterests.find((one) => one.id === id)
    return li ? [{ id, mask, shown: masked(li, mask, true) }] : []
  })
  const picked = dancers.find((one) => one.id === chosen)
  // Anyone he knows could be under a mask, but not the one who came without one.
  const standIns = new Set(state.masquerade?.dancers.filter((one) => !one.maskId).map((one) => one.id))
  const known = content.loveInterests.filter((li) => state.met.includes(li.id) && !standIns.has(li.id)).sort((a, b) => a.name.localeCompare(b.name))

  return picked ? (
    <Dialog title={`Who is ${picked.mask.name}?`} onClose={() => setChosen(null)} ornate wide>
      <div className="masquerade-names">
        {known.map((li) => (
          <Button key={li.id} className="masquerade-name" onClick={() => onGuess(picked.id, li.id)}>
            <Portrait who={li} size={40} />
            {li.name.split(' ')[0]}
          </Button>
        ))}
      </div>
    </Dialog>
  ) : (
    <Dialog title="Unmask one" onClose={() => undefined} ornate noClose>
      <div className="masquerade-dancers">
        {dancers.map((one) => (
          <Button key={one.id} className="masquerade-dancer" onClick={() => setChosen(one.id)}>
            <Portrait who={one.shown} size={96} />
            {one.mask.name}
          </Button>
        ))}
      </div>
    </Dialog>
  )
}
