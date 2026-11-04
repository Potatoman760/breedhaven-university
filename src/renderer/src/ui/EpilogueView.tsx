import { useEffect, useMemo, useState } from 'react'
import { buildEpilogue, spriteFor, wornOutfit } from '../../../shared/game'
import { SIGNATURES } from '../../../shared/game/epilogue'
import type { ContentPack, GameState, LoveInterest } from '../../../shared/model'
import { ChevronIcon } from './icons'
import { playSong, stopSong } from '../sound'
import { t } from '../../../shared/i18n'

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
  // Its own music, once through in place of the place's loop (the file fades out at its end), and faded away as he leaves.
  const music = content.sounds.music.epilogue?.file
  useEffect(() => {
    if (!music) return
    stopSong()
    playSong(music)
    return stopSong
  }, [music])
  const screens = useMemo(() => buildEpilogue(content, state), [content, state])
  const [at, setAt] = useState(0)
  const index = Math.min(at, screens.length - 1)
  const screen = screens[index]
  const last = index === screens.length - 1
  // Whoever the screen is about, as she looks when the year ends, smiling if she has a smile drawn: not over her birth
  // picture, which already shows her with the child, but before any other picture, as at the arch.
  const about = (screen.kind === 'child' && screen.image ? [] : (screen.loveInterestIds ?? [])).flatMap((id) => {
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
      {/* The year's studies, as the University would put them: a certificate with his name on it. */}
      {screen.kind === 'academics' ? (
        <div key={index} className={`certificate ${screen.standing ?? ''}`}>
          <span className="certificate-crest">{t('screens.epilogue.certUniversity')}</span>
          <h1 className="certificate-title">{t(`screens.epilogue.certTitle.${screen.standing ?? 'gettingBy'}` as const)}</h1>
          <span className="certificate-certifies">{t('screens.epilogue.certCertifies')}</span>
          <span className="certificate-name">{state.player.name}</span>
          <p className="certificate-text">{screen.text}</p>
          {screen.grades && screen.grades.length > 0 && (
            <table className="certificate-grades">
              <tbody>
                {screen.grades.map((grade) => (
                  <tr key={grade.course}>
                    <td>{grade.course}</td>
                    <td className={`certificate-letter grade-${grade.letter.toLowerCase()}`}>{grade.letter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="certificate-foot">
            <span className="certificate-signer">
              <img className="certificate-signature" src={`content://pack/${SIGNATURES.chancellor}`} alt="" draggable={false} />
              <span className="certificate-signed">{t('screens.epilogue.certSigned')}</span>
            </span>
            <span className="certificate-seal" aria-hidden="true">
              {t('screens.epilogue.certSeal')}
            </span>
            <span className="certificate-signer">
              <img className="certificate-signature" src={`content://pack/${SIGNATURES.registrar}`} alt="" draggable={false} />
              <span className="certificate-signed">{t('screens.epilogue.certRegistrar')}</span>
            </span>
          </div>
        </div>
      ) : (
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
            {t('screens.epilogue.returnToTitle')}
          </button>
        )}
      </div>
      )}
      <div className="epilogue-foot">
        <span>
          {index + 1} / {screens.length}
        </span>
        {!last && (
          <span className="epilogue-next">
            {t('screens.sceneView.continue')} <ChevronIcon size={14} />
          </span>
        )}
      </div>
    </main>
  )
}
