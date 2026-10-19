import { useEffect, useMemo, useState } from 'react'
import { buildEpilogue, spriteFor, wornOutfit } from '../../../shared/game'
import type { ContentPack, GameState, LoveInterest } from '../../../shared/model'
import { ChevronIcon } from './icons'

interface Props {
  content: ContentPack
  state: GameState
  /** Back to the title screen, once it has been read. */
  onExit: () => void
}

/**
 * The epilogue: what became of him, a screen at a time, once the last day of the calendar
 * is over. Each screen fades in over the picture the title screen has, tinted for its kind,
 * with whoever it is about standing in it; a click, Space, Enter or the right arrow goes on to the next, and the left arrow
 * goes back.
 */
export function EpilogueView({ content, state, onExit }: Props) {
  const screens = useMemo(() => buildEpilogue(content, state), [content, state])
  const [at, setAt] = useState(0)
  const index = Math.min(at, screens.length - 1)
  const screen = screens[index]
  const last = index === screens.length - 1
  // Whoever the screen is about, as she looks when the year ends, smiling if she has a smile drawn.
  const about = (screen.loveInterestIds ?? []).flatMap((id) => {
    const li = content.loveInterests.find((c) => c.id === id)
    const sprite = li && spriteFor(li, wornOutfit(content, state, li), 'happy')
    return li && sprite ? [{ li, sprite }] : []
  })
  // A picture whose file is not there is left out, and the screen is told without it.
  const [missing, setMissing] = useState<string[]>([])
  const shown = about.filter(({ sprite }) => !missing.includes(sprite))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A dialog over it (the menu) has the keys while it is up.
      if (document.querySelector('.overlay')) return
      if ([' ', 'Enter', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        setAt((n) => Math.min(n + 1, screens.length - 1))
      } else if (event.key === 'ArrowLeft') setAt((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screens.length])

  return (
    <main
      className={`stage epilogue of-${screen.kind}${screen.standing ? ` ${screen.standing}` : ''}${shown.length > 0 ? ' with-cast' : ''}${screen.image ? ' with-art' : ''}`}
      // A screen with a picture of its own is told over it, lightly shaded, instead of over the title screen's.
      style={screen.image ? { backgroundImage: `linear-gradient(var(--scrim), var(--scrim)), url("content://pack/${screen.image}")` } : undefined}
      onClick={() => !last && setAt(index + 1)}
    >
      {/* Whoever it is about stands behind the words, side by side when there is more than one. */}
      {shown.length > 0 && (
        <div key={`cast-${index}`} className="epilogue-cast" aria-hidden="true">
          {shown.map(({ li, sprite }: { li: LoveInterest; sprite: string }) => (
            <img key={li.id} src={`content://pack/${sprite}`} alt="" onError={() => setMissing((gone) => [...gone, sprite])} />
          ))}
        </div>
      )}
      {/* Keyed by the screen, so that each one fades in afresh over the one before. */}
      <div key={index} className="epilogue-screen">
        <span className="caps epilogue-heading">{screen.heading}</span>
        <p className="epilogue-text">{screen.text}</p>
        {screen.details && screen.details.length > 0 && (
          <ul className="epilogue-details">
            {screen.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {last && (
          <button
            className="epilogue-exit"
            autoFocus
            onClick={(event) => {
              event.stopPropagation()
              onExit()
            }}
          >
            Return to the title
          </button>
        )}
      </div>
      <div className="epilogue-foot">
        <span>
          {index + 1} / {screens.length}
        </span>
        {!last && (
          <span className="epilogue-next">
            Continue <ChevronIcon size={14} />
          </span>
        )}
      </div>
    </main>
  )
}
