import Phaser from 'phaser'
import { useEffect, useRef } from 'react'
import type { FightEvent, FightFx } from '../../../shared/model'

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
  constructor() {
    super('below-fx')
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

  /** Plays one thing at a spot. */
  play(fx: FightFx, spot: Spot): void {
    const amount = fx.amount === undefined ? '' : String(Math.round(fx.amount))
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
        // A blow landing on one of the party: a red flash that opens out, and what it took.
        this.run(320, (g, t) => {
          g.fillStyle(RED, 0.55 * (1 - t))
          g.fillEllipse(spot.x, spot.y, spot.w * (0.3 + t * 0.7), spot.h * (0.3 + t * 0.6))
        })
        this.cut(spot, RED, true, 0, 8)
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
        this.rise(spot, `ward ${amount}`, BLUE, 26)
        break
      case 'ward':
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
        break
      case 'heal':
        this.motes(spot, GREEN, true)
        this.ring(spot, GREEN, 0.5, 1, 600)
        this.rise(spot, `+${amount}`, GREEN)
        break
      case 'guard':
        // She sets herself: a curved line of steel in front of her that holds and fades.
        this.run(700, (g, t) => {
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
        this.rise(spot, 'hexed', PURPLE, 24)
        break
      case 'weaken':
        this.motes(spot, PURPLE, false, 9)
        this.rise(spot, 'weakened', PURPLE, 24)
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
  /** Changes whenever there is something new to play, so that the same events are not played twice. */
  stamp: string
}

/**
 * The canvas the fight's effects are drawn on, over the whole stage and clear everywhere else. Each thing that
 * happened is played where whoever it happened to stands: the figure on the stage marked with her id (`data-fx`).
 */
export function BelowFx({ events, stamp }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const scene = useRef<FxScene | null>(null)

  useEffect(() => {
    if (!holder.current) return
    const made = new FxScene()
    const game = new Phaser.Game({
      type: Phaser.AUTO,
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
          scene.current.play(fx, { x: box.left - stage.left + box.width / 2, y: box.top - stage.top + box.height / 2, w: box.width, h: box.height })
          const move = MOVES[fx.kind]
          if (move && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) figure.animate(move, { duration: 260, easing: 'ease-out' })
        }
      }, index * EVENT_GAP_MS)
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
    // Played once for each new thing done: the events themselves are a new list on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])

  return <div ref={holder} className="below-fx" aria-hidden="true" />
}
