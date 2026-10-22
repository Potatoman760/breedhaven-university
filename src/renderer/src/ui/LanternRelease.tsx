import { useEffect, useState, type CSSProperties } from 'react'
import type { BanterLine } from '../../../shared/game'

// How long the lanterns take to go once they are let go, in milliseconds.
const RISE_MS = 5800
// How long the lines are waited for, and how long each is up: as long as it takes to read, and no less than this.
const WAIT_MS = 9000
const LINE_MS = 2600
const MS_PER_CHAR = 55

export interface LanternDate {
  id: string
  /** Her sprite, glad: standing, facing out. */
  image: string
  stageHeight: number
}

interface Props {
  dates: LanternDate[]
  /** What they say before they let go: asked for as it opens. Left out, they say nothing. */
  lines?: () => Promise<BanterLine[]>
  onDone: () => void
}

/**
 * The lanterns let go at the start of the festival date: she stands at the pond's edge (two of them stand at either
 * side) with her lantern, says a word or two in a balloon, lets it go, and the eye follows the lanterns up the sky
 * until they are lost in it. A click on a balloon goes on to the next; anywhere else, it is all over.
 */
export function LanternRelease({ dates, lines, onDone }: Props) {
  // One stands in the middle; two stand at either side.
  const places = dates.length > 1 ? [27, 73] : [50]
  const shown = dates.slice(0, places.length)
  const [said, setSaid] = useState<BanterLine[] | null>(lines ? null : [])
  const [at, setAt] = useState(0)
  const released = said !== null && at >= said.length

  // The lines, if they come in time; otherwise none.
  useEffect(() => {
    if (!lines) return
    let open = true
    const giveUp = window.setTimeout(() => open && setSaid((now) => now ?? []), WAIT_MS)
    lines().then(
      (got) => open && setSaid((now) => now ?? got),
      () => open && setSaid((now) => now ?? [])
    )
    return () => {
      open = false
      window.clearTimeout(giveUp)
    }
  }, [])
  // Each line is up for as long as it takes to read.
  const line = said && at < said.length ? said[at] : undefined
  useEffect(() => {
    if (!line) return
    const timer = window.setTimeout(() => setAt((n) => n + 1), Math.max(LINE_MS, line.text.length * MS_PER_CHAR))
    return () => window.clearTimeout(timer)
  }, [line])
  // Let go, they rise, and then it is over.
  useEffect(() => {
    if (!released) return
    const timer = window.setTimeout(onDone, RISE_MS)
    return () => window.clearTimeout(timer)
  }, [released, onDone])

  // Her balloon is by her head, on the side toward the middle.
  const speaker = line ? shown.findIndex((date) => date.id === line.speakerId) : -1
  const balloon = (): CSSProperties | undefined => {
    if (speaker < 0) return undefined
    const top = `calc(118vh - 96vh * ${shown[speaker].stageHeight / 100} + 4vh)`
    return places[speaker] > 50 ? { right: `calc(${100 - places[speaker]}% + 7vw)`, top } : { left: `calc(${places[speaker]}% + 7vw)`, top }
  }

  return (
    <div className={released ? 'lantern-release released' : 'lantern-release'} onClick={onDone} role="presentation">
      <div className="lantern-world">
        <img className="lantern-sky" src="content://pack/sprites/fx/lantern-sky.webp" alt="" />
        {shown.map((date, i) => (
          <img key={date.id} className="lantern-date" src={`content://pack/${date.image}`} alt="" style={{ '--x': `${places[i]}%`, '--scale': date.stageHeight / 100 } as CSSProperties} />
        ))}
      </div>
      {/* Each lantern is let go from in front of her, and drifts outward as it rises. */}
      {(shown.length > 0 ? shown : [undefined]).map((_, i) => (
        <img
          key={i}
          className="lantern-light"
          src="content://pack/sprites/fx/lantern.webp"
          alt=""
          style={{ '--x': `${shown.length === 0 ? 50 : places[i]}%`, '--scale': (shown[i]?.stageHeight ?? 100) / 100, '--drift': shown.length < 2 ? '0vw' : i === 1 ? '4vw' : '-4vw' } as CSSProperties}
        />
      ))}
      {line && speaker >= 0 && (
        <button
          key={at}
          type="button"
          className={places[speaker] > 50 ? 'below-balloon lantern-balloon toward-left' : 'below-balloon lantern-balloon'}
          style={balloon()}
          onClick={(event) => {
            event.stopPropagation()
            setAt((n) => n + 1)
          }}
        >
          {line.text}
        </button>
      )}
    </div>
  )
}
