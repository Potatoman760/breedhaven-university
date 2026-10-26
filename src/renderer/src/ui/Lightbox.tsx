import { useEffect, useRef } from 'react'
import { Button } from './Button'
import { Overlay } from './Dialog'
import { ChevronIcon } from './icons'
import { t } from '../../../shared/i18n'

interface Props {
  image: string
  /** What it is, for the caption and for anyone who cannot see it. */
  name: string
  onClose: () => void
  /** Where it stands among others that can be stepped through: "2 of 7". Left out, it stands alone. */
  position?: string
  /** Moves to the picture before (-1) or after (1). Left out, there are no arrows. */
  onStep?: (by: number) => void
}

/**
 * A picture opened to be looked at whole. A click anywhere closes it; with others to step
 * through, there is an arrow either side and the left and right keys do the same.
 */
export function Lightbox({ image, name, onClose, position, onStep }: Props) {
  const step = useRef(onStep)
  step.current = onStep
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') step.current?.(-1)
      if (event.key === 'ArrowRight') step.current?.(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const arrow = (by: number, label: string) =>
    onStep && (
      <Button
        className={by < 0 ? 'lightbox-step flip' : 'lightbox-step next'}
        aria-label={label}
        title={by < 0 ? t('screens.lightbox.leftArrow', { label }) : t('screens.lightbox.rightArrow', { label })}
        onClick={(event) => {
          event.stopPropagation()
          onStep(by)
        }}
      >
        <ChevronIcon size={22} />
      </Button>
    )
  return (
    <Overlay onClose={onClose}>
      <figure className="lightbox" onClick={onClose}>
        {arrow(-1, t('screens.lightbox.before'))}
        <img src={`content://pack/${image}`} alt={name} />
        {arrow(1, t('screens.lightbox.after'))}
        <figcaption>
          {name}
          {position && ` (${position})`} · <code>{image}</code>
        </figcaption>
      </figure>
    </Overlay>
  )
}
