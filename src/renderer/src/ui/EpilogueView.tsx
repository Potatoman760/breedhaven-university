import { useEffect, useMemo, useState } from 'react'
import { buildEpilogue } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { ChevronIcon } from './icons'

interface Props {
  content: ContentPack
  state: GameState
  /** Back to the title screen, once it has been read. */
  onExit: () => void
}

/**
 * The epilogue: what became of him, a screen at a time, once the last day of the calendar
 * is over. Each screen fades in over a placeholder backdrop for its kind (pictures come
 * later); a click, Space, Enter or the right arrow goes on to the next, and the left arrow
 * goes back.
 */
export function EpilogueView({ content, state, onExit }: Props) {
  const screens = useMemo(() => buildEpilogue(content, state), [content, state])
  const [at, setAt] = useState(0)
  const index = Math.min(at, screens.length - 1)
  const screen = screens[index]
  const last = index === screens.length - 1

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
    <main className={`stage epilogue of-${screen.kind}${screen.standing ? ` ${screen.standing}` : ''}`} onClick={() => !last && setAt(index + 1)}>
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
