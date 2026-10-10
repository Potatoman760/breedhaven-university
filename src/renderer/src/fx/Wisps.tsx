import { useEffect, useRef } from 'react'
import type Phaser from 'phaser'

// The canvas is drawn at this size and stretched over the screen it is on.
const WIDTH = 1280
const HEIGHT = 720
// Where the wisps circle: the middle of the screen, a little above it, where the logo stands.
const CENTRE = { x: WIDTH / 2, y: HEIGHT / 2 - 26 }
// The lights' colours: the pale greens and the gold of the logo.
const COLOURS = [0x9fe8c4, 0x7fd6e0, 0xf2e2a0, 0xb9f0a8, 0x8fe0d0]

/** One wisp's way round the logo: how wide, how fast, and where on it it starts. */
interface Path {
  rx: number
  ry: number
  speed: number
  phase: number
  wobble: number
}

/**
 * Wisps of light that drift round the middle of a loading screen, each leaving a trail
 * that fades, with motes rising slowly behind them. It is a small Phaser game of its own
 * with a transparent canvas, made when the screen comes up and thrown away when it goes.
 * Players who ask their system for less motion get none of it.
 */
export function Wisps() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const parent = host.current
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!parent || still) return
    let game: Phaser.Game | null = null
    let gone = false

    void import('phaser')
      .then(({ default: PhaserLib }) => {
        if (gone) return
        class WispScene extends PhaserLib.Scene {
          private wisps: { orb: Phaser.GameObjects.Image; path: Path }[] = []

          create(): void {
            // A soft round light, bright in the middle and gone at the edge.
            const canvas = this.textures.createCanvas('wisp-glow', 64, 64)
            if (!canvas) return
            const ctx = canvas.getContext()
            const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
            gradient.addColorStop(0, 'rgba(255,255,255,1)')
            gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)')
            gradient.addColorStop(1, 'rgba(255,255,255,0)')
            ctx.fillStyle = gradient
            ctx.fillRect(0, 0, 64, 64)
            canvas.refresh()

            // Motes rising across the whole screen, faint, behind the wisps.
            this.add.particles(0, 0, 'wisp-glow', {
              x: { min: 0, max: WIDTH },
              y: { min: HEIGHT * 0.2, max: HEIGHT + 20 },
              lifespan: { min: 4000, max: 7000 },
              speedY: { min: -38, max: -14 },
              speedX: { min: -10, max: 10 },
              scale: { min: 0.05, max: 0.16 },
              alpha: { start: 0, end: 0, ease: (t: number) => Math.sin(t * Math.PI) * 0.55 },
              tint: COLOURS,
              blendMode: PhaserLib.BlendModes.ADD,
              quantity: 1,
              frequency: 140
            })

            COLOURS.forEach((colour, i) => {
              const path: Path = {
                rx: 170 + i * 34,
                ry: 110 + ((i * 53) % 90),
                speed: (0.55 + i * 0.13) * (i % 2 === 0 ? 1 : -1),
                phase: (i / COLOURS.length) * Math.PI * 2,
                wobble: 0.6 + i * 0.17
              }
              const orb = this.add.image(CENTRE.x, CENTRE.y, 'wisp-glow').setTint(colour).setBlendMode(PhaserLib.BlendModes.ADD).setScale(0.55)
              // What it leaves behind it: small lights that drift a little and go out.
              const trail = this.add.particles(0, 0, 'wisp-glow', {
                lifespan: { min: 600, max: 1100 },
                speed: { min: 4, max: 26 },
                scale: { start: 0.38, end: 0 },
                alpha: { start: 0.6, end: 0 },
                tint: colour,
                blendMode: PhaserLib.BlendModes.ADD,
                quantity: 1,
                frequency: 22
              })
              trail.startFollow(orb)
              this.wisps.push({ orb, path })
            })
          }

          update(time: number): void {
            const t = time / 1000
            for (const { orb, path } of this.wisps) {
              const angle = t * path.speed + path.phase
              // Round the logo, the round itself swelling and shrinking, so that no two passes are the same.
              const swell = 1 + 0.28 * Math.sin(t * path.wobble + path.phase)
              orb.setPosition(CENTRE.x + Math.cos(angle) * path.rx * swell, CENTRE.y + Math.sin(angle * 1.3) * path.ry * swell)
              orb.setScale(0.5 + 0.14 * Math.sin(t * 3.1 + path.phase))
            }
          }
        }
        game = new PhaserLib.Game({
          type: PhaserLib.AUTO,
          parent,
          width: WIDTH,
          height: HEIGHT,
          transparent: true,
          banner: false,
          audio: { noAudio: true },
          input: { mouse: false, touch: false, keyboard: false, gamepad: false },
          scale: { mode: PhaserLib.Scale.NONE },
          scene: WispScene
        })
      })
      .catch((error: unknown) => {
        // The lights are decoration: without them the screen loads the same.
        console.warn('The loading lights are off:', error)
      })

    return () => {
      gone = true
      game?.destroy(true)
    }
  }, [])

  return <div ref={host} className="wisps" aria-hidden="true" />
}
