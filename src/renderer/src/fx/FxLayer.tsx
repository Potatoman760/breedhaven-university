import { useEffect, useRef, useState } from 'react'
import type { WeatherEffect } from '../../../shared/model'
import { stageFx, type Transition } from './stageFx'

/** What the stage is showing, so that a change of it can be given a transition. */
export interface StageView {
  /** Which screen: the day view, a scene, a summary... */
  screen: string
  locationId: string | undefined
  backgroundId: string | undefined
  periodId: string
}

// What was last on stage, kept across screens: each screen has a layer of its own.
let last: StageView | null = null

/** How to get from one view to the next, or null when nothing worth marking has changed. */
export function transitionBetween(from: StageView | null, to: StageView): Transition | null {
  if (!from) return null
  // Going somewhere is the largest change, then stepping into or out of a scene, then time passing.
  if (from.locationId !== to.locationId) return 'wipe'
  if (from.screen !== to.screen) return to.screen === 'scene' ? 'iris' : 'dissolve'
  if (from.periodId !== to.periodId) return 'fade'
  return null
}

interface Props {
  view: StageView
  /** What falls or drifts over the artwork. */
  weather: WeatherEffect
}

/**
 * Where the stage's effects are drawn: over the artwork and behind the characters,
 * except during a transition, when it comes in front of everything.
 */
export function FxLayer({ view, weather }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [covering, setCovering] = useState(false)
  // Players who ask their system for less motion get a still stage.
  const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (still || !host.current) return
    stageFx.attach(host.current)
    return stageFx.onTransition(setCovering)
  }, [still])

  useEffect(() => {
    if (!still) stageFx.setWeather(weather)
  }, [still, weather])

  const { screen, locationId, backgroundId, periodId } = view
  useEffect(() => {
    const next = { screen, locationId, backgroundId, periodId }
    const kind = transitionBetween(last, next)
    last = next
    if (kind && !still) stageFx.play(kind)
  }, [still, screen, locationId, backgroundId, periodId])

  return <div ref={host} className={covering ? 'fx-layer covering' : 'fx-layer'} aria-hidden="true" />
}
