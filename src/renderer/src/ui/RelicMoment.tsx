import { useEffect, useMemo, type CSSProperties } from 'react'
import type { Relic, RelicUse } from '../../../shared/model'
import { play } from '../sound'
import { ItemArt } from './ItemSquare'

const FX = (name: string) => `content://pack/sprites/fx/relic-${name}.png`

// How long the moment holds before the scene comes back, in milliseconds; a click cuts it short.
const LENGTH = 2800

// What flies about for each use: the pictures, how many, and whether they burst from the relic or rise from below.
const PARTICLES: Record<RelicUse, { art: string[]; count: number; motion: 'burst' | 'rise' }> = {
  unravel: { art: ['fabric'], count: 18, motion: 'burst' },
  stillness: { art: [], count: 0, motion: 'burst' },
  sapphic: { art: ['heart', 'petal', 'petal'], count: 22, motion: 'rise' },
  'minds-eye': { art: [], count: 0, motion: 'burst' },
  'first-seed': { art: ['blossom'], count: 14, motion: 'rise' }
}

// The great picture behind the relic, where its use has one: the clock that stops, the circle that opens a mind.
const HALO: Partial<Record<RelicUse, string>> = { stillness: 'clock', 'minds-eye': 'runes', 'first-seed': 'blossom' }

/** The moment a relic is used in a scene: it rises over the scene, and what it does plays out around it. */
export function RelicMoment({ relic, onDone }: { relic: Relic & { use: RelicUse }; onDone: () => void }) {
  useEffect(() => {
    play('relic')
    const timer = window.setTimeout(onDone, LENGTH)
    return () => window.clearTimeout(timer)
  }, [onDone])

  const { art, count, motion } = PARTICLES[relic.use]
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4
        const reach = 28 + Math.random() * 22
        return {
          art: art[i % art.length],
          style: {
            '--dx': `${Math.cos(angle) * reach}vw`,
            '--dy': `${Math.sin(angle) * reach}vh`,
            '--x': `${4 + Math.random() * 92}%`,
            '--sway': `${(Math.random() - 0.5) * 16}vw`,
            '--spin': `${(Math.random() - 0.5) * 900}deg`,
            '--size': `${36 + Math.random() * 44}px`,
            '--delay': `${motion === 'rise' ? Math.random() * 0.9 : Math.random() * 0.12}s`
          } as CSSProperties
        }
      }),
    [art, count, motion]
  )
  const halo = HALO[relic.use]

  return (
    <div className={`relic-moment relic-moment-${relic.use}`} onClick={onDone} role="presentation">
      <div className="relic-moment-tint" />
      {relic.use === 'stillness' || relic.use === 'minds-eye'
        ? [0, 1, 2].map((i) => <img key={i} className="relic-moment-ripple" src={FX(halo as string)} alt="" style={{ '--delay': `${0.3 + i * 0.45}s` } as CSSProperties} />)
        : null}
      {particles.map((one, i) => (
        <img key={i} className={`relic-moment-particle relic-moment-${motion}`} src={FX(one.art)} alt="" style={one.style} />
      ))}
      <div className="relic-moment-heart">
        {halo && <img className="relic-moment-halo" src={FX(halo)} alt="" />}
        <div className="relic-moment-art">
          <ItemArt icon={relic.icon} image={relic.image} size={168} />
        </div>
        <div className="relic-moment-name">{relic.name}</div>
      </div>
    </div>
  )
}
