import type Phaser from 'phaser'
import type { WeatherEffect } from '../../../shared/model'

/** How one view of the stage gives way to the next. */
export type Transition = 'fade' | 'wipe' | 'iris' | 'dissolve'

// The canvas is drawn at this size and stretched to the window, like the stage's artwork.
const WIDTH = 1280
const HEIGHT = 720
// The colour a transition covers the screen with: the game's deep wood.
const CURTAIN = 0x25301f
const DISSOLVE_COLUMNS = 16
const DISSOLVE_ROWS = 9
// No transition takes as long as this; one still running then has stalled.
const LONGEST_TRANSITION_MS = 1800

type Listener = (running: boolean) => void

/** Draws a small texture with the 2D canvas, for particles. */
function texture(scene: Phaser.Scene, key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return
  const canvas = scene.textures.createCanvas(key, width, height)
  if (!canvas) return
  draw(canvas.getContext())
  canvas.refresh()
}

/**
 * The stage's effects: weather that falls and drifts over the artwork, and the
 * transitions that carry one view into the next. It is one Phaser game with a
 * transparent canvas, kept for the life of the window and moved to whichever stage is on
 * screen. Everything else in the game is ordinary DOM.
 */
class StageFx {
  private game: Phaser.Game | null = null
  private scene: Phaser.Scene | null = null
  private starting: Promise<void> | null = null
  private weather: WeatherEffect = 'none'
  private shown: WeatherEffect = 'none'
  private emitters: Phaser.GameObjects.GameObject[] = []
  private timers: Phaser.Time.TimerEvent[] = []
  private transitions = 0
  private listeners = new Set<Listener>()
  private pending: Transition | null = null

  /** Puts the canvas in the given element, starting Phaser the first time. */
  attach(host: HTMLElement): void {
    if (this.game) {
      host.appendChild(this.game.canvas)
      return
    }
    this.starting ??= this.start(host).catch((error) => {
      // Effects are decoration: without them the game plays the same.
      console.warn('Stage effects are off:', error)
    })
    // If the stage changes while Phaser is loading, the newest host wins.
    void this.starting.then(() => this.game && host.isConnected && host.appendChild(this.game.canvas))
  }

  private async start(host: HTMLElement): Promise<void> {
    const { default: PhaserLib } = await import('phaser')
    const fx = this
    class FxScene extends PhaserLib.Scene {
      create(): void {
        fx.scene = this
        texture(this, 'fx-drop', 3, 22, (ctx) => {
          const gradient = ctx.createLinearGradient(0, 0, 0, 22)
          gradient.addColorStop(0, 'rgba(210,225,240,0)')
          gradient.addColorStop(1, 'rgba(210,225,240,0.9)')
          ctx.fillStyle = gradient
          ctx.fillRect(1, 0, 1.5, 22)
        })
        texture(this, 'fx-flake', 12, 12, (ctx) => {
          const gradient = ctx.createRadialGradient(6, 6, 0, 6, 6, 6)
          gradient.addColorStop(0, 'rgba(255,255,255,1)')
          gradient.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, 12, 12)
        })
        // A wisp of mist: long and low, made of soft overlapping blobs so that no two edges are the same.
        texture(this, 'fx-wisp', 512, 160, (ctx) => {
          let seed = 7
          const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
          for (let i = 0; i < 14; i++) {
            const x = 70 + next() * 372
            const y = 80 + (next() - 0.5) * 50
            const r = 40 + next() * 50
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
            gradient.addColorStop(0, 'rgba(236,240,236,0.32)')
            gradient.addColorStop(1, 'rgba(236,240,236,0)')
            ctx.fillStyle = gradient
            ctx.fillRect(0, 0, 512, 160)
          }
        })
        texture(this, 'fx-leaf', 14, 8, (ctx) => {
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.ellipse(7, 4, 7, 3, 0, 0, Math.PI * 2)
          ctx.fill()
        })
        fx.applyWeather()
        if (fx.pending) fx.play(fx.pending)
      }
    }
    this.game = new PhaserLib.Game({
      type: PhaserLib.AUTO,
      parent: host,
      width: WIDTH,
      height: HEIGHT,
      transparent: true,
      banner: false,
      audio: { noAudio: true },
      input: { mouse: false, touch: false, keyboard: false, gamepad: false },
      scale: { mode: PhaserLib.Scale.NONE },
      scene: FxScene
    })
  }

  setWeather(effect: WeatherEffect): void {
    this.weather = effect
    this.applyWeather()
  }

  private applyWeather(): void {
    const scene = this.scene
    if (!scene || this.shown === this.weather) return
    for (const emitter of this.emitters) emitter.destroy()
    for (const timer of this.timers) timer.remove()
    this.emitters = []
    this.timers = []
    this.shown = this.weather
    const keep = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      this.emitters.push(object)
      return object
    }
    const across = { min: -200, max: WIDTH + 200 }

    const rain = (heavy: boolean) => {
      keep(scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x1c2733, heavy ? 0.28 : 0.12))
      keep(
        scene.add.particles(0, 0, 'fx-drop', {
          x: across,
          y: -30,
          lifespan: heavy ? 650 : 900,
          speedY: heavy ? { min: 1300, max: 1600 } : { min: 850, max: 1050 },
          speedX: heavy ? { min: -420, max: -340 } : { min: -160, max: -110 },
          rotate: heavy ? 15 : 8,
          scaleY: heavy ? { min: 1.2, max: 2 } : { min: 0.7, max: 1.2 },
          alpha: heavy ? { min: 0.45, max: 0.8 } : { min: 0.3, max: 0.6 },
          quantity: heavy ? 9 : 3,
          frequency: 16
        })
      )
    }

    switch (this.weather) {
      case 'rain':
        rain(false)
        break
      case 'storm': {
        rain(true)
        const flash = keep(scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0xeef3ff, 0))
        const strike = () => {
          scene.tweens.add({ targets: flash, alpha: { from: 0.55, to: 0 }, duration: 380, ease: 'Cubic.easeOut' })
          this.timers = [scene.time.delayedCall(4000 + Math.random() * 7000, strike)]
        }
        this.timers = [scene.time.delayedCall(2500, strike)]
        break
      }
      case 'snow':
        keep(
          scene.add.particles(0, 0, 'fx-flake', {
            x: across,
            y: -20,
            lifespan: 11000,
            speedY: { min: 55, max: 120 },
            speedX: { min: -35, max: 25 },
            scale: { min: 0.3, max: 1 },
            alpha: { min: 0.5, max: 0.95 },
            quantity: 1,
            frequency: 45
          })
        )
        break
      case 'mist': {
        keep(scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0xdfe4dc, 0.08))
        // Each wisp comes up out of nothing and goes back to it: its alpha runs from 0 up to `most` and down again.
        const swell = (most: number) => ({ start: 0, end: 1, ease: (t: number) => Math.sin(t * Math.PI) * most })
        // A bank lying low and thick, drifting slowly...
        keep(
          scene.add.particles(0, 0, 'fx-wisp', {
            x: { min: -500, max: WIDTH },
            y: { min: HEIGHT * 0.62, max: HEIGHT + 40 },
            lifespan: 18000,
            speedX: { min: 10, max: 26 },
            scaleX: { min: 2.2, max: 3.6 },
            scaleY: { min: 1.2, max: 2 },
            alpha: swell(0.85),
            quantity: 1,
            frequency: 900,
            advance: 18000
          })
        )
        // ...and thinner wisps higher up, faster, crossing in front of the scene.
        keep(
          scene.add.particles(0, 0, 'fx-wisp', {
            x: { min: -500, max: WIDTH },
            y: { min: HEIGHT * 0.15, max: HEIGHT * 0.7 },
            lifespan: 14000,
            speedX: { min: 30, max: 60 },
            scaleX: { min: 1.4, max: 2.4 },
            scaleY: { min: 0.6, max: 1.1 },
            alpha: swell(0.5),
            quantity: 1,
            frequency: 1400,
            advance: 14000
          })
        )
        break
      }
      case 'wind':
        keep(
          scene.add.particles(0, 0, 'fx-leaf', {
            x: -30,
            y: { min: -40, max: HEIGHT },
            lifespan: 2600,
            speedX: { min: 520, max: 880 },
            speedY: { min: -60, max: 140 },
            rotate: { start: 0, end: 720 },
            scale: { min: 0.6, max: 1.4 },
            alpha: { min: 0.55, max: 0.9 },
            tint: [0x6f8a4a, 0x9a7a2e, 0xb8873a, 0x4c6a3a],
            quantity: 1,
            frequency: 150
          })
        )
        break
      case 'motes':
        keep(
          scene.add.particles(0, 0, 'fx-flake', {
            x: { min: 0, max: WIDTH },
            y: { min: 0, max: HEIGHT },
            lifespan: 7000,
            speedX: { min: -8, max: 14 },
            speedY: { min: -16, max: -4 },
            scale: { min: 0.15, max: 0.45 },
            alpha: { start: 0, end: 1, ease: (t: number) => Math.sin(t * Math.PI) * 0.55 },
            tint: 0xf4dca0,
            quantity: 1,
            frequency: 260
          })
        )
        break
      case 'none':
        break
    }
  }

  /** Hears when a transition starts and when the last one running has finished. */
  onTransition(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Covers the screen at once and then reveals it in the given manner. The view beneath
   * has already changed, so what is revealed is the new one.
   */
  play(kind: Transition): void {
    const scene = this.scene
    if (!scene) {
      // Phaser is still loading: play it as soon as it is ready, if that is soon.
      this.pending = kind
      return
    }
    this.pending = null
    this.transitions++
    for (const listener of this.listeners) listener(true)
    let finished = false
    let made: Phaser.GameObjects.GameObject[] = []
    const done = (objects: Phaser.GameObjects.GameObject[]) => {
      if (finished) return
      finished = true
      window.clearTimeout(watchdog)
      for (const object of objects) object.destroy()
      this.transitions--
      if (this.transitions === 0) for (const listener of this.listeners) listener(false)
    }
    // A browser stops drawing frames for a window that is covered or minimised, and a
    // transition that never draws never ends. The clock ends it regardless, so the cover
    // can't be left over the game.
    const watchdog = window.setTimeout(() => done(made), LONGEST_TRANSITION_MS)
    const track = <T extends Phaser.GameObjects.GameObject>(objects: T[]): T[] => {
      made = [...made, ...objects]
      return objects
    }
    const cx = WIDTH / 2
    const cy = HEIGHT / 2

    if (kind === 'fade') {
      const [cover] = track([scene.add.rectangle(cx, cy, WIDTH, HEIGHT, CURTAIN, 1).setDepth(100)])
      scene.tweens.add({ targets: cover, alpha: 0, duration: 650, ease: 'Sine.easeInOut', onComplete: () => done([cover]) })
    } else if (kind === 'wipe') {
      // A slanted curtain drawn off to the right, with a few paler bands for a soft edge.
      const slant = 0.32
      const reach = WIDTH + HEIGHT
      const curtain = scene.add.rectangle(cx, cy, reach * 1.6, reach, CURTAIN, 1).setRotation(slant).setDepth(100)
      const bands = [0.55, 0.3, 0.12].map((alpha, i) =>
        scene.add
          .rectangle(cx - reach * 0.8 - 22 * (i + 0.5), cy, 22, reach, CURTAIN, alpha)
          .setRotation(slant)
          .setDepth(100)
      )
      track([curtain, ...bands])
      scene.tweens.add({
        targets: [curtain, ...bands],
        x: `+=${reach * 1.75}`,
        duration: 900,
        ease: 'Cubic.easeInOut',
        onComplete: () => done([curtain, ...bands])
      })
    } else if (kind === 'iris') {
      // A ring whose hole grows from the middle: its stroke is thick enough to cover the rest.
      const farthest = Math.hypot(cx, cy) + 20
      const [ring] = track([scene.add.graphics().setDepth(100)])
      const hole = { radius: 0 }
      const draw = () => {
        ring.clear()
        ring.lineStyle(farthest * 2, CURTAIN, 1)
        ring.strokeCircle(cx, cy, hole.radius + farthest)
      }
      draw()
      scene.tweens.add({
        targets: hole,
        radius: farthest,
        duration: 800,
        ease: 'Cubic.easeOut',
        onUpdate: draw,
        onComplete: () => done([ring])
      })
    } else {
      // Tiles that let go one after another, in no order.
      const w = WIDTH / DISSOLVE_COLUMNS
      const h = HEIGHT / DISSOLVE_ROWS
      const tiles: Phaser.GameObjects.Rectangle[] = []
      for (let column = 0; column < DISSOLVE_COLUMNS; column++) {
        for (let row = 0; row < DISSOLVE_ROWS; row++) {
          tiles.push(scene.add.rectangle(column * w + w / 2, row * h + h / 2, w + 1, h + 1, CURTAIN, 1).setDepth(100))
        }
      }
      track(tiles)
      let left = tiles.length
      for (const tile of tiles) {
        scene.tweens.add({
          targets: tile,
          alpha: 0,
          scale: 0.6,
          delay: Math.random() * 520,
          duration: 300,
          onComplete: () => {
            left--
            if (left === 0) done(tiles)
          }
        })
      }
    }
  }
}

export const stageFx = new StageFx()
