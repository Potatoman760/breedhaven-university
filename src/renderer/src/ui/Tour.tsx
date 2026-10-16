import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import type { LoveInterest } from '../../../shared/model'
import { Button } from './Button'

export interface TourStep {
  /** What she points at, as a selector. Left out, she speaks from the middle of the screen. */
  target?: string
  text: string
  /** The face she makes: one of her sprites, the neutral one if she has no such. */
  expression?: string
  /** Done as the step begins, to bring what it points at onto the screen. */
  before?: () => void
}

// How big she is, and the room her bubble takes beside her, so that she can be put where both fit.
const FACE = { width: 150, height: 172 }
const BUBBLE_WIDTH = 300
const GAP = 18
const MARGIN = 16
// How long the last step stays up before she goes.
const FAREWELL_MS = 2200
const LEAVE_MS = 400

/**
 * A guided tour of a screen: a character pops up beside one part of it after another, rings it, and says what it is
 * for in a speech bubble. A click anywhere goes on; the last step has no target and ends the tour by itself.
 */
export function Tour({ guide, steps, onDone }: { guide: LoveInterest; steps: TourStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [leaving, setLeaving] = useState(false)
  const step = steps[index]
  const last = index === steps.length - 1

  // What the step points at is found once the step has brought it onto the screen, and found again as the window changes.
  useLayoutEffect(() => {
    step.before?.()
    let frame = 0
    const measure = () => {
      const element = step.target ? document.querySelector(step.target) : null
      setRect(element ? element.getBoundingClientRect() : null)
    }
    frame = requestAnimationFrame(() => {
      if (step.target) document.querySelector(step.target)?.scrollIntoView({ block: 'nearest' })
      frame = requestAnimationFrame(measure)
    })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
    }
  }, [index])

  const finish = () => {
    setLeaving(true)
    window.setTimeout(onDone, LEAVE_MS)
  }
  const next = () => (last ? finish() : setIndex(index + 1))

  useEffect(() => {
    if (!last) return
    const timer = window.setTimeout(finish, FAREWELL_MS)
    return () => window.clearTimeout(timer)
  }, [last])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const outfit = guide.outfits.find((o) => o.id === guide.defaultOutfitId) ?? guide.outfits[0]
  const sprite = (outfit?.sprites[step.expression ?? 'neutral'] ?? outfit?.sprites['neutral'])?.image
  const { place, flip } = placeBeside(rect)

  return (
    <div className={leaving ? 'tour leaving' : 'tour'} onClick={next}>
      <div className={rect ? 'tour-ring' : 'tour-ring none'} style={rect ? { left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 } : undefined} />
      <div key={index} className={flip ? 'tour-guide flip' : 'tour-guide'} style={place}>
        <div
          className="tour-face"
          role="img"
          aria-label={guide.name}
          style={sprite ? { backgroundImage: `url("content://pack/${sprite}")`, backgroundPosition: `50% ${guide.faceY}%` } : undefined}
        />
        <div className="tour-bubble">
          <p>{step.text}</p>
          {!last && (
            <div className="tour-actions">
              <Button variant="quiet" size="small" onClick={(event) => (event.stopPropagation(), finish())}>
                Skip
              </Button>
              <Button size="small" onClick={(event) => (event.stopPropagation(), next())}>
                {index === steps.length - 2 ? 'Got it' : 'Next'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Where she stands: to the right of what she points at if there is room, else to its left, else in the corner
 * of the screen over it. With nothing to point at, in the middle. Flipped, her bubble is on her left.
 */
function placeBeside(rect: DOMRect | null): { place: CSSProperties; flip: boolean } {
  const width = FACE.width + BUBBLE_WIDTH + GAP
  if (!rect) return { place: { left: `calc(50% - ${width / 2}px)`, top: `calc(50% - ${FACE.height / 2}px)` }, flip: false }
  const top = Math.min(Math.max(MARGIN, rect.top + rect.height / 2 - FACE.height / 2), window.innerHeight - FACE.height - MARGIN)
  if (rect.right + GAP + width + MARGIN <= window.innerWidth) return { place: { left: rect.right + GAP, top }, flip: false }
  if (rect.left - GAP - width - MARGIN >= 0) return { place: { left: rect.left - GAP - width, top }, flip: true }
  return { place: { right: MARGIN * 2, bottom: MARGIN * 2 }, flip: true }
}
