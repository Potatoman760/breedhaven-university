import { useState, type CSSProperties } from 'react'

// The passers-by, drawn as white cut-outs from the hips up, all facing left.
const CROWD = Object.values(import.meta.glob<string>('../../../assets/loading/crowd-*.webp', { eager: true, import: 'default' }))

// How far off each lane of the crowd is: the further, the smaller, fainter and slower, so that the street has depth.
const LANES = [
  { height: 44, opacity: 0.35, seconds: 30 },
  { height: 58, opacity: 0.6, seconds: 21 },
  { height: 72, opacity: 0.85, seconds: 14 }
] as const
// How many walk in each lane at once, far to near.
const PER_LANE = [4, 3, 3] as const

interface Passer {
  image: string
  lane: number
  /** How far into its walk across it is when the screen comes up, as a fraction: so the street is full from the start. */
  start: number
  /** Its own stride, a little off everyone else's. */
  stride: number
}

/** The crowd for one showing of the screen: picked when it comes up, and kept while it is up. */
function passers(): Passer[] {
  const pool = [...CROWD].sort(() => Math.random() - 0.5)
  let next = 0
  return PER_LANE.flatMap((count, lane) =>
    Array.from({ length: count }, (_, i) => ({
      image: pool[next++ % pool.length],
      lane,
      start: (i + Math.random() * 0.6) / count,
      stride: 0.5 + Math.random() * 0.2
    }))
  )
}

interface Props {
  /**
   * Her walking profile, from the hips up and facing right, and how tall she stands on stage, in percent: she walks the
   * other way through the crowd. Left out, the crowd alone.
   */
  walker?: { image: string; stageHeight: number }
  /** What is being waited for: "Loading", or where the scene is going. */
  label: string
  tip?: string
}

/**
 * The screen a scene opens behind while its first lines are written, or while it moves somewhere else: her, in colour,
 * walking right in step through a street of white passers-by who walk left past her. Only the bob of a stride moves
 * anyone: everyone is cut off at the hips, since legs that do not walk would give it away.
 */
export function LoadingScreen({ walker, label, tip }: Props) {
  const [crowd] = useState(passers)
  return (
    <div className="scene-loading" role="status" aria-label={label}>
      <div className="loading-street" aria-hidden="true">
        {crowd.map((one, i) => {
          const lane = LANES[one.lane]
          return (
            <div
              key={i}
              className="loading-passer"
              style={
                {
                  '--h': `${lane.height}vh`,
                  '--seconds': `${lane.seconds}s`,
                  '--delay': `${-one.start * lane.seconds}s`,
                  '--stride': `${one.stride}s`,
                  opacity: lane.opacity,
                  zIndex: one.lane + 1
                } as CSSProperties
              }
            >
              <img src={one.image} alt="" draggable={false} />
            </div>
          )
        })}
        {walker && (
          <img
            className="loading-walker"
            src={`content://pack/${walker.image}`}
            alt=""
            draggable={false}
            // As short or tall as she stands in a scene.
            style={{ '--scale': walker.stageHeight / 100 } as CSSProperties}
          />
        )}
      </div>
      <p className="loading-label">{label}</p>
      {tip && <span className="loading-tip">{tip}</span>}
    </div>
  )
}
