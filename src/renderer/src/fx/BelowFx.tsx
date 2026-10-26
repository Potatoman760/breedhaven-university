import Phaser from 'phaser'
import { useEffect, useRef } from 'react'
import type { FightEvent, FightFx } from '../../../shared/model'
import { t } from '../../../shared/i18n'

// How long after one line of what happened the next is played, so that they are read and seen in order.
export const EVENT_GAP_MS = 350

/** Where on the stage something stands: its middle, and how big it is. */
interface Spot {
  x: number
  y: number
  w: number
  h: number
}

const WHITE = 0xffffff
const GOLD = 0xf2c75c
const RED = 0xd9534a
const BLUE = 0x7fc4ff
const GREEN = 0x8fd46a
const PURPLE = 0xa77bd6
const ORANGE = 0xf0963a
const STEEL = 0xcfd6dc
const OCHRE = 0xc9972b

/**
 * What is seen of a fight below, drawn by Phaser on a clear canvas laid over the stage: a cut across an enemy that
 * is hit, a ward lighting up over whoever it covers, the numbers going up. Everything is drawn from lines and
 * circles, so it needs no pictures of its own.
 */
class FxScene extends Phaser.Scene {
  constructor(private effects: Record<string, string>) {
    super('below-fx')
  }

  preload(): void {
    for (const [name, path] of Object.entries(this.effects)) this.load.image(name, `content://pack/${path}`)
  }

  /** Whether there is a picture of the given name to draw with. */
  private has(name: string): boolean {
    return this.textures.exists(name)
  }

  /**
   * A picture laid over the fight for a while: grown or shrunk, turned and faded as it runs. One that glows is added
   * onto what is under it, so that its black is not seen.
   */
  private picture(
    name: string,
    spot: { x: number; y: number },
    size: number,
    options: { delay?: number; duration?: number; from?: number; to?: number; spin?: number; glow?: boolean; rise?: number; tall?: number } = {}
  ): void {
    if (!this.has(name)) return
    const { delay = 0, duration = 500, from = 0.6, to = 1.2, spin = 0, glow = true, rise = 0, tall = 1 } = options
    const image = this.add.image(spot.x, spot.y, name).setAlpha(0)
    const base = size / Math.max(image.width, image.height)
    if (glow) image.setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      delay,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0
        const scale = base * (from + (to - from) * t)
        image.setScale(scale, scale * tall).setAlpha(Math.sin(Math.PI * Math.min(1, t * 1.15))).setRotation(spin * t).setY(spot.y - rise * t)
      },
      onComplete: () => image.destroy()
    })
  }

  /** A picture flown from one spot to another, turned the way it goes. Answers how long it takes to land, in ms. */
  private fling(name: string, from: Spot, to: Spot, size: number, duration: number, arc = 0): number {
    if (!this.has(name)) return 0
    const image = this.add.image(from.x, from.y, name).setBlendMode(Phaser.BlendModes.ADD)
    image.setScale(size / Math.max(image.width, image.height))
    const at = (t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arc })
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Sine.easeIn',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0
        const here = at(t)
        const ahead = at(Math.min(1, t + 0.02))
        image.setPosition(here.x, here.y).setRotation(Math.atan2(ahead.y - here.y, ahead.x - here.x))
      },
      onComplete: () => image.destroy()
    })
    return duration
  }

  /** Draws something again and again as a number runs from 0 to 1, and clears it away at the end. */
  private run(duration: number, draw: (g: Phaser.GameObjects.Graphics, t: number) => void, delay = 0, ease = 'Cubic.easeOut'): void {
    const g = this.add.graphics()
    g.setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      delay,
      ease,
      onUpdate: (tween) => {
        g.clear()
        draw(g, tween.getValue() ?? 0)
      },
      onComplete: () => g.destroy()
    })
  }

  /** A number, or a word, that rises from a spot and fades. */
  private rise(spot: Spot, text: string, color: number, size = 34): void {
    const label = this.add
      .text(spot.x, spot.y - spot.h * 0.2, text, { fontFamily: 'Alegreya Sans, system-ui, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#0f130c', strokeThickness: 6 })
      .setOrigin(0.5)
    this.tweens.add({ targets: label, y: label.y - 70, alpha: { from: 1, to: 0 }, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => label.destroy() })
  }

  /** A cut: a bright line drawn fast from corner to corner, which then thins and goes. */
  private cut(spot: Spot, color: number, flip = false, delay = 0, width = 10): void {
    const dx = spot.w * 0.42 * (flip ? -1 : 1)
    const dy = spot.h * 0.32
    this.run(
      380,
      (g, t) => {
        const head = Math.min(1, t * 2.4)
        const tail = Math.max(0, t * 2.4 - 1.1)
        g.lineStyle(width * (1 - t * 0.7), color, 1 - t * 0.6)
        g.lineBetween(spot.x - dx + 2 * dx * tail, spot.y - dy + 2 * dy * tail, spot.x - dx + 2 * dx * head, spot.y - dy + 2 * dy * head)
        g.lineStyle(width * 0.3, WHITE, 1 - t)
        g.lineBetween(spot.x - dx + 2 * dx * tail, spot.y - dy + 2 * dy * tail, spot.x - dx + 2 * dx * head, spot.y - dy + 2 * dy * head)
      },
      delay
    )
  }

  /** A ring that grows or shrinks around a spot. */
  private ring(spot: Spot, color: number, from: number, to: number, duration: number, delay = 0, width = 6): void {
    this.run(
      duration,
      (g, t) => {
        const scale = from + (to - from) * t
        g.lineStyle(width, color, 1 - t)
        g.strokeEllipse(spot.x, spot.y, spot.w * scale, spot.h * scale)
      },
      delay
    )
  }

  /** Motes that drift up or down the length of a figure. */
  private motes(spot: Spot, color: number, up: boolean, count = 10): void {
    for (let i = 0; i < count; i++) {
      const x = spot.x + (Math.random() - 0.5) * spot.w * 0.7
      const from = spot.y + (up ? 0.4 : -0.3) * spot.h
      const to = spot.y + (up ? -0.35 : 0.45) * spot.h
      this.run(
        700 + Math.random() * 300,
        (g, t) => {
          g.fillStyle(color, Math.sin(Math.PI * t))
          g.fillCircle(x + Math.sin(t * 6 + i) * 6, from + (to - from) * t, 4 + (i % 3))
        },
        i * 45,
        'Sine.easeInOut'
      )
    }
  }

  /** A ball of light flying from one spot to another with a trail behind it. Answers how long it takes to land, in ms. */
  private bolt(from: Spot, to: Spot, color: number, size: number, duration: number, options: { arc?: number; wave?: number; core?: number } = {}): number {
    const { arc = 0, wave = 0, core = WHITE } = options
    const at = (t: number) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arc + Math.sin(t * Math.PI * 6) * wave
    })
    this.run(
      duration,
      (g, t) => {
        for (let i = 6; i >= 0; i--) {
          const p = at(Math.max(0, t - i * 0.035))
          g.fillStyle(color, (1 - i / 7) * 0.7)
          g.fillCircle(p.x, p.y, size * (1 - i / 9))
        }
        const head = at(t)
        g.fillStyle(core, 0.9)
        g.fillCircle(head.x, head.y, size * 0.45)
      },
      0,
      'Sine.easeIn'
    )
    return duration
  }

  /** Where something lands with force: a flash, rings going out, and sparks thrown off. */
  private burst(spot: Spot, color: number, scale: number, delay = 0): void {
    this.run(
      260,
      (g, t) => {
        g.fillStyle(WHITE, 0.6 * (1 - t))
        g.fillCircle(spot.x, spot.y, Math.min(spot.w, spot.h) * 0.25 * scale * (0.6 + t))
      },
      delay
    )
    this.ring(spot, color, 0.15 * scale, 0.9 * scale, 420, delay, 10)
    this.ring(spot, color, 0.1 * scale, 0.6 * scale, 360, delay + 80, 6)
    this.sparks(spot, color, Math.round(10 * scale), delay)
  }

  /** Sparks thrown out from a spot, falling as they go. */
  private sparks(spot: Spot, color: number, count: number, delay = 0): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4
      const reach = Math.min(spot.w, spot.h) * (0.35 + Math.random() * 0.25)
      this.run(
        500 + Math.random() * 250,
        (g, t) => {
          g.fillStyle(color, 1 - t)
          g.fillCircle(spot.x + Math.cos(angle) * reach * t, spot.y + Math.sin(angle) * reach * t + t * t * 40, 4 * (1 - t) + 1)
        },
        delay
      )
    }
  }

  /** Spikes of stone bursting up out of the floor under a spot, and the dust they raise. */
  private spikes(spot: Spot): void {
    const floor = spot.y + spot.h * 0.42
    for (let i = 0; i < 5; i++) {
      const x = spot.x + (i - 2) * spot.w * 0.16
      const tall = spot.h * (0.35 + (i % 2) * 0.2 + (i === 2 ? 0.15 : 0))
      this.run(
        620,
        (g, t) => {
          const up = Math.min(1, t * 3.5)
          const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
          g.fillStyle(0x8a6a44, fade)
          g.fillTriangle(x - 14, floor, x + 14, floor, x, floor - tall * up)
          g.lineStyle(3, 0xd9b98a, fade)
          g.lineBetween(x, floor, x, floor - tall * up)
        },
        i * 40
      )
    }
    this.run(600, (g, t) => {
      g.fillStyle(0xb39a78, 0.35 * (1 - t))
      g.fillEllipse(spot.x, floor, spot.w * (0.6 + t * 0.6), spot.h * 0.12 * (1 + t))
    })
  }

  /** A column of light falling on a spot from above. Answers when it lands. */
  private beam(spot: Spot, color: number): number {
    const top = spot.y - spot.h * 1.2
    this.run(
      560,
      (g, t) => {
        const down = Math.min(1, t * 3)
        const fade = t < 0.5 ? 1 : 1 - (t - 0.5) * 2
        const bottom = top + (spot.y + spot.h * 0.4 - top) * down
        g.fillStyle(color, 0.35 * fade)
        g.fillRect(spot.x - spot.w * 0.18, top, spot.w * 0.36, bottom - top)
        g.fillStyle(WHITE, 0.8 * fade)
        g.fillRect(spot.x - spot.w * 0.05, top, spot.w * 0.1, bottom - top)
      },
      0,
      'Cubic.easeIn'
    )
    return 190
  }

  /** A sigil drawn around a spot and turning: a circle and the star inside it. */
  private sigil(spot: Spot, color: number): void {
    const r = Math.min(spot.w, spot.h) * 0.42
    this.run(
      900,
      (g, t) => {
        const fade = Math.sin(Math.PI * t)
        g.lineStyle(4, color, fade)
        g.strokeCircle(spot.x, spot.y, r)
        g.beginPath()
        for (let i = 0; i <= 5; i++) {
          const angle = t * Math.PI + (i * 4 * Math.PI) / 5 - Math.PI / 2
          const x = spot.x + Math.cos(angle) * r
          const y = spot.y + Math.sin(angle) * r
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.strokePath()
      },
      0,
      'Sine.easeInOut'
    )
  }

  /** Motes drawn in, or flung out, in a spiral round a spot. */
  private vortex(spot: Spot, color: number, inward: boolean): void {
    for (let i = 0; i < 14; i++) {
      const start = (i / 14) * Math.PI * 2
      this.run(
        800,
        (g, t) => {
          const d = inward ? 1 - t : t
          const angle = start + t * Math.PI * 2.5
          const r = Math.min(spot.w, spot.h) * (0.15 + d * 0.5)
          g.fillStyle(color, Math.sin(Math.PI * t))
          g.fillCircle(spot.x + Math.cos(angle) * r, spot.y + Math.sin(angle) * r * 0.6, 5)
        },
        i * 25,
        'Sine.easeInOut'
      )
    }
  }

  /** Tongues of flame licking up in a ring round a spot. */
  private flames(spot: Spot): void {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const x = spot.x + Math.cos(angle) * spot.w * 0.42
      const base = spot.y + Math.sin(angle) * spot.h * 0.12 + spot.h * 0.3
      this.run(
        900,
        (g, t) => {
          const lick = Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(t * 20 + i))
          g.fillStyle(ORANGE, 0.75 * lick)
          g.fillTriangle(x - 12, base, x + 12, base, x, base - spot.h * 0.35 * lick)
          g.fillStyle(GOLD, 0.8 * lick)
          g.fillTriangle(x - 6, base, x + 6, base, x, base - spot.h * 0.18 * lick)
        },
        i * 30
      )
    }
  }

  /** Plates of stone closing round a spot and holding. */
  private plates(spot: Spot): void {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6
      this.run(900, (g, t) => {
        const close = Math.min(1, t * 3)
        const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
        const r = Math.min(spot.w, spot.h) * (0.75 - 0.3 * close)
        const x = spot.x + Math.cos(angle) * r
        const y = spot.y + Math.sin(angle) * r * 0.8
        g.fillStyle(0x9a8466, 0.85 * fade)
        g.fillRect(x - 16, y - 22, 32, 44)
        g.lineStyle(3, 0xd9c49a, fade)
        g.strokeRect(x - 16, y - 22, 32, 44)
      })
    }
  }

  /** Smoke curling up round a spot. */
  private smoke(spot: Spot, color: number): void {
    for (let i = 0; i < 10; i++) {
      const x = spot.x + (Math.random() - 0.5) * spot.w * 0.8
      const y = spot.y + (Math.random() - 0.2) * spot.h * 0.6
      this.run(
        1000,
        (g, t) => {
          g.fillStyle(color, 0.35 * Math.sin(Math.PI * t))
          g.fillCircle(x + Math.sin(t * 4 + i) * 12, y - t * 40, 16 + t * 22)
        },
        i * 50,
        'Sine.easeOut'
      )
    }
  }

  /** A number, or a word, that rises from a spot once something has landed there. */
  private riseLater(spot: Spot, text: string, color: number, size: number, delay: number): void {
    if (delay <= 0) return this.rise(spot, text, color, size)
    this.time.delayedCall(delay, () => this.rise(spot, text, color, size))
  }

  /**
   * Plays one thing at a spot, flying there from another where someone sent it. Answers how long until it lands, so
   * that the figure it lands on moves then and not before.
   */
  play(fx: FightFx, spot: Spot, from?: Spot): number {
    const amount = fx.amount === undefined ? '' : String(Math.round(fx.amount))
    const crit = fx.kind === 'crit'
    // A spell on an enemy, as the one who cast it casts it. His own blow, with no style, is the cut.
    if ((fx.kind === 'slash' || crit) && fx.style) {
      const source = from ?? { ...spot, x: spot.x - 500 }
      let lands = 0
      switch (fx.style) {
        case 'striker:strike':
          // Firebolt: a quick streak of fire, and a burst of embers where it strikes.
          lands = this.bolt(source, spot, ORANGE, 14, 320, { core: GOLD })
          this.fling('firebolt', source, spot, 90, 320)
          this.burst(spot, ORANGE, 1, lands)
          this.picture('explosion', spot, Math.min(spot.w, spot.h) * 0.7, { delay: lands, duration: 450 })
          break
        case 'striker:all-in':
          // Fireball: a great ball lobbed high, and an explosion.
          lands = this.bolt(source, spot, RED, 26, 480, { arc: 120, core: GOLD })
          this.fling('firebolt', source, spot, 160, 480, 120)
          this.burst(spot, ORANGE, 1.8, lands)
          this.burst(spot, RED, 1.2, lands + 120)
          this.picture('explosion', spot, Math.min(spot.w, spot.h) * 1.4, { delay: lands, duration: 650, from: 0.3, to: 1.3 })
          break
        case 'guard:bash':
          // Stone Spike: the floor heaves up under it.
          lands = 120
          if (this.has('stone-spikes'))
            this.picture('stone-spikes', { x: spot.x, y: spot.y + spot.h * 0.15 }, spot.w * 0.9, { duration: 700, from: 0.4, to: 1, glow: false, tall: 1 })
          else this.spikes(spot)
          break
        case 'hexer:unravel':
          // Shadow Bolt: a wavering dark bolt that collapses inward where it lands.
          lands = this.bolt(source, spot, PURPLE, 13, 380, { wave: 22, core: 0x2a1840 })
          this.fling('shadow-orb', source, spot, 100, 380)
          this.picture('shadow-orb', spot, Math.min(spot.w, spot.h) * 0.9, { delay: lands, duration: 500, from: 1.2, to: 0.2, spin: 2 })
          this.ring(spot, PURPLE, 1.2, 0.1, 420, lands, 8)
          this.ring(spot, 0x2a1840, 1, 0.1, 420, lands + 80, 12)
          break
        case 'hexer:hex':
          // Hex: a sigil turning round it.
          lands = 200
          if (this.has('hex-sigil')) this.picture('hex-sigil', spot, Math.min(spot.w, spot.h) * 0.95, { duration: 900, from: 0.7, to: 1, spin: Math.PI })
          else this.sigil(spot, PURPLE)
          break
        case 'warder:push':
          // Force Bolt: a blue shock that ripples out where it strikes.
          lands = this.bolt(source, spot, BLUE, 16, 280)
          this.fling('force-orb', source, spot, 90, 280)
          this.picture('force-orb', spot, Math.min(spot.w, spot.h) * 0.8, { delay: lands, duration: 460, from: 0.4, to: 1.6 })
          this.ring(spot, BLUE, 0.2, 1.3, 460, lands, 8)
          this.ring(spot, WHITE, 0.2, 1, 400, lands + 90, 4)
          break
        case 'healer:jolt':
          // Smite: light falling on it from above.
          lands = this.beam(spot, GOLD)
          this.picture('smite', { x: spot.x, y: spot.y - spot.h * 0.2 }, spot.h * 1.4, { duration: 700, from: 0.9, to: 1, tall: 1 })
          this.sparks(spot, GOLD, 12, lands)
          break
        default:
          this.cut(spot, WHITE)
      }
      if (crit) this.ring(spot, GOLD, 0.2, 1.2, 420, lands + 60, 8)
      this.riseLater(spot, crit ? `${amount}!` : amount, crit ? GOLD : WHITE, crit ? 44 : 34, lands)
      return lands
    }
    switch (fx.kind) {
      case 'slash':
        this.cut(spot, WHITE)
        this.rise(spot, amount, WHITE)
        break
      case 'crit':
        this.cut(spot, GOLD, false, 0, 14)
        this.cut(spot, GOLD, true, 110, 14)
        this.ring(spot, GOLD, 0.2, 1.1, 420, 120)
        this.rise(spot, `${amount}!`, GOLD, 44)
        break
      case 'hit':
        // A blow landing on one of the party: claws raked across her, or from one that hits them all, a wave rolling through.
        this.run(320, (g, t) => {
          g.fillStyle(RED, 0.5 * (1 - t))
          g.fillEllipse(spot.x, spot.y, spot.w * (0.3 + t * 0.7), spot.h * (0.3 + t * 0.6))
        })
        if (fx.style === 'sweep') {
          this.ring(spot, RED, 0.3, 1.4, 500, 0, 10)
          this.run(500, (g, t) => {
            g.lineStyle(6 * (1 - t), RED, 1 - t)
            g.lineBetween(spot.x - spot.w * (0.2 + t), spot.y + spot.h * 0.3, spot.x + spot.w * (0.2 + t), spot.y + spot.h * 0.3)
          })
        } else for (let i = -1; i <= 1; i++) this.cut({ ...spot, x: spot.x + i * spot.w * 0.12 }, RED, true, Math.abs(i) * 30, 6)
        this.rise(spot, `-${amount}`, RED)
        break
      case 'absorb':
        // The ward taking a blow: it flares where it was struck and holds.
        this.run(520, (g, t) => {
          g.lineStyle(8 * (1 - t) + 2, BLUE, 1 - t)
          g.strokeEllipse(spot.x, spot.y, spot.w * 0.95, spot.h * 0.95)
          g.fillStyle(BLUE, 0.3 * (1 - t))
          g.fillEllipse(spot.x, spot.y, spot.w * 0.95, spot.h * 0.95)
        })
        this.rise(spot, t('panels.belowFx.ward', { amount }), BLUE, 26)
        break
      case 'ward':
        this.picture('ward', spot, Math.max(spot.w, spot.h) * 0.95, { duration: 1000, from: 1.15, to: 0.95 })
        // A ward going up: a shell of light closes over her and glows for a moment.
        this.run(
          1100,
          (g, t) => {
            const glow = Math.sin(Math.PI * t)
            g.fillStyle(BLUE, 0.22 * glow)
            g.fillEllipse(spot.x, spot.y, spot.w * 0.95, spot.h * 0.98)
            g.lineStyle(4 + 4 * glow, BLUE, 0.9 * glow)
            g.strokeEllipse(spot.x, spot.y, spot.w * (1.25 - 0.3 * Math.min(1, t * 2)), spot.h * (1.2 - 0.22 * Math.min(1, t * 2)))
          },
          0,
          'Sine.easeInOut'
        )
        // The greater ward: a second shell, and the lattice of it showing for a moment.
        if (fx.style === 'warder:great-ward') {
          this.ring(spot, WHITE, 1.4, 0.95, 700, 120, 3)
          this.sigil(spot, BLUE)
        }
        break
      case 'heal':
        this.picture('heal', spot, Math.min(spot.w, spot.h) * (fx.style === 'healer:deep-mend' ? 1.1 : 0.8), { duration: 900, from: 0.8, to: 1.1, rise: 40 })
        this.motes(spot, GREEN, true, fx.style === 'healer:deep-mend' ? 18 : 10)
        this.ring(spot, GREEN, 0.5, 1, 600)
        // The greater heal: a second ring, and light falling on her.
        if (fx.style === 'healer:deep-mend') {
          this.ring(spot, WHITE, 0.3, 1.2, 700, 150, 4)
          this.beam(spot, GREEN)
        }
        this.rise(spot, `+${amount}`, GREEN)
        break
      case 'guard':
        // How each sets herself, as her magic does it.
        if (fx.style === 'guard:guard') this.plates(spot)
        else if (fx.style === 'guard:hold') this.vortex(spot, OCHRE, true)
        else if (fx.style === 'striker:guard') this.flames(spot)
        else if (fx.style === 'hexer:guard') this.smoke(spot, PURPLE)
        // Otherwise, a curved line of steel in front of her that holds and fades.
        else this.run(700, (g, t) => {
          g.lineStyle(10, STEEL, Math.sin(Math.PI * Math.min(1, t * 1.4)))
          g.beginPath()
          g.arc(spot.x, spot.y, Math.min(spot.w, spot.h) * 0.42, -Math.PI * 0.35, Math.PI * 0.35)
          g.strokePath()
        })
        break
      case 'anchor':
        // The Bloom settling around her: gold rings closing in, and motes rising.
        this.ring(spot, GOLD, 1.5, 0.7, 650)
        this.ring(spot, GOLD, 1.5, 0.7, 650, 160)
        this.motes(spot, GOLD, true, 8)
        break
      case 'ground':
        // The surge drawn down out of her and into the floor.
        this.motes(spot, OCHRE, false, 12)
        this.run(600, (g, t) => {
          g.lineStyle(5, OCHRE, 1 - t)
          g.strokeEllipse(spot.x, spot.y + spot.h * 0.45, spot.w * (0.3 + t), spot.h * 0.08 * (1 + t))
        })
        break
      case 'hex':
        // Three dark lights going round her.
        this.run(
          900,
          (g, t) => {
            for (let i = 0; i < 3; i++) {
              const angle = t * Math.PI * 3 + (i * Math.PI * 2) / 3
              g.fillStyle(PURPLE, Math.sin(Math.PI * t))
              g.fillCircle(spot.x + Math.cos(angle) * spot.w * 0.4, spot.y + Math.sin(angle) * spot.h * 0.15 - spot.h * 0.15 + t * spot.h * 0.3, 9)
            }
          },
          0,
          'Linear'
        )
        this.rise(spot, t('panels.belowFx.hexed'), PURPLE, 24)
        break
      case 'weaken':
        this.motes(spot, PURPLE, false, 9)
        this.rise(spot, t('panels.belowFx.weakened'), PURPLE, 24)
        break
      case 'misfire':
        // Her surge breaking loose: a burst outward from each of them.
        this.ring(spot, ORANGE, 0.2, 1.5, 480, 0, 10)
        this.run(420, (g, t) => {
          g.lineStyle(5 * (1 - t), ORANGE, 1 - t)
          for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2
            const from = Math.min(spot.w, spot.h) * 0.15 * (1 + t * 3)
            const to = Math.min(spot.w, spot.h) * 0.3 * (1 + t * 3)
            g.lineBetween(spot.x + Math.cos(angle) * from, spot.y + Math.sin(angle) * from, spot.x + Math.cos(angle) * to, spot.y + Math.sin(angle) * to)
          }
        })
        this.rise(spot, `-${amount}`, ORANGE)
        break
      case 'fall':
        // Going down: what held it together scatters and sinks.
        this.motes(spot, STEEL, false, 14)
        break
    }
    return 0
  }
}

/** How a figure itself moves when something happens to it, where it does: a jolt for a blow, a lift for something good. */
const MOVES: Partial<Record<FightFx['kind'], Keyframe[]>> = {
  slash: [{ transform: 'translateX(0)' }, { transform: 'translateX(14px)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(0)' }],
  crit: [{ transform: 'translateX(0)' }, { transform: 'translateX(22px)' }, { transform: 'translateX(-14px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
  hit: [{ transform: 'translateX(0)' }, { transform: 'translateX(-14px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
  misfire: [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }],
  heal: [{ transform: 'translateY(0)' }, { transform: 'translateY(-8px)' }, { transform: 'translateY(0)' }],
  anchor: [{ transform: 'translateY(0)' }, { transform: 'translateY(-8px)' }, { transform: 'translateY(0)' }]
}

interface Props {
  /** What the last thing done came to, in order. */
  events: FightEvent[]
  /** The pictures the effects are drawn with, by name. */
  effects?: Record<string, string>
  /** Changes whenever there is something new to play, so that the same events are not played twice. */
  stamp: string
}

/**
 * The canvas the fight's effects are drawn on, over the whole stage and clear everywhere else. Each thing that
 * happened is played where whoever it happened to stands: the figure on the stage marked with her id (`data-fx`).
 */
export function BelowFx({ events, stamp, effects = {} }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const scene = useRef<FxScene | null>(null)

  useEffect(() => {
    if (!holder.current) return
    const made = new FxScene(effects)
    const game = new Phaser.Game({
      // Drawn on a canvas and not with WebGL, which will not take the game's own pictures without their being shared across origins.
      type: Phaser.CANVAS,
      loader: { imageLoadType: 'HTMLImageElement' },
      parent: holder.current,
      transparent: true,
      banner: false,
      audio: { noAudio: true },
      input: { mouse: false, touch: false, keyboard: false },
      scale: { mode: Phaser.Scale.RESIZE, width: holder.current.clientWidth, height: holder.current.clientHeight },
      scene: made
    })
    scene.current = made
    return () => {
      scene.current = null
      game.destroy(true)
    }
  }, [])

  useEffect(() => {
    const timers = events.map((event, index) =>
      window.setTimeout(() => {
        const stage = holder.current?.getBoundingClientRect()
        if (!stage || !scene.current?.sys.isActive()) return
        for (const fx of event.fx) {
          const figure = document.querySelector<HTMLElement>(`[data-fx="${CSS.escape(fx.on)}"]`)
          // The picture itself where there is one, so that the effect is the size of her and not of the room she is given.
          const box = (figure?.querySelector<HTMLElement>('img, .below-card') ?? figure)?.getBoundingClientRect()
          if (!figure || !box) continue
          // Whoever sent it, for what flies from her: as she stands on the stage.
          const caster = fx.by ? document.querySelector<HTMLElement>(`[data-fx="${CSS.escape(fx.by)}"]`) : null
          const from = (caster?.querySelector<HTMLElement>('img') ?? caster)?.getBoundingClientRect()
          const spotOf = (rect: DOMRect) => ({ x: rect.left - stage.left + rect.width / 2, y: rect.top - stage.top + rect.height / 2, w: rect.width, h: rect.height })
          const lands = scene.current.play(fx, spotOf(box), from ? spotOf(from) : undefined)
          const move = MOVES[fx.kind]
          if (move && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) figure.animate(move, { duration: 260, delay: lands, easing: 'ease-out' })
        }
      }, index * EVENT_GAP_MS)
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
    // Played once for each new thing done: the events themselves are a new list on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])

  return <div ref={holder} className="below-fx" aria-hidden="true" />
}
