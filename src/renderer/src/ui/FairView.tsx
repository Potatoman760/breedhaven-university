import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { atTable, canJoinSociety, canTalkAtFair, fairCloses, fairNow, fairTables, helloDue, toDate } from '../../../shared/game'
import type { ContentPack, GameState, LoveInterest } from '../../../shared/model'
import { Button } from './Button'
import { BackButton } from './BackButton'
import { JobIcon } from './icons'
import { Ornate } from './Ornate'
import { Portrait } from './Portrait'
import { settle } from './pinLayout'

// The shape of the fair's picture, for it to cover the screen without being stretched.
const PICTURE_SHAPE = 1920 / 1080

interface Props {
  content: ContentPack
  state: GameState
  /** Says hello to everyone at a society's table, or to someone wandering the fair. */
  onHello: (ids: string[], societyId?: string) => void
  /** Stops to talk, for an hour, with those at a table or with someone wandering it. */
  onTalk: (ids: string[], societyId?: string) => void
  onJoin: (societyId: string) => void
  onLeave: () => void
}

const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/**
 * The societies' fair, laid out as the town map is: its picture filling the screen, and on it each society's table with
 * whoever is at it now, to say hello to, to stop and talk with, or to join; and the few who wander the fair without one.
 */
export function FairView({ content, state, onHello, onTalk, onJoin, onLeave }: Props) {
  const board = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (board.current) settle(board.current)
  })
  useLayoutEffect(() => {
    const element = board.current
    if (!element) return
    const watcher = new ResizeObserver(() => settle(element))
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.overlay, .tour')) onLeave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onLeave])

  const event = fairNow(content, state)
  const config = content.societies
  const fair = config?.fair
  const place = content.locations.find((l) => l.id === event?.locationId)
  const picture = place?.backgrounds.find((view) => view.id === config?.fairId)?.images.day
  const people = [...content.loveInterests, ...content.npcs] as LoveInterest[]
  const who = (id: string) => people.find((one) => one.id === id)
  const { hour } = toDate(content.calendar, state.time)

  /** Someone at a table or wandering: her portrait, with her name. */
  const face = (id: string) => {
    const one = who(id)
    if (!one) return null
    return <Portrait key={id} who={one} size="clamp(44px, 3.2vw, 64px)" className="map-face" caption />
  }

  /** Hello from the whole booth at once, while it has one for whoever is there. */
  const hello = (ids: string[], societyId?: string) =>
    helloDue(content, state, ids, societyId ?? ids[0]) && (
      <Button size="small" className="map-go" onClick={() => onHello(ids, societyId)}>
        Hello
      </Button>
    )

  const talk = (ids: string[], societyId?: string) => {
    const check = canTalkAtFair(content, state, ids)
    return (
      <Button variant="primary" size="small" className="map-go" disabled={!check.ok} title={check.ok ? 'An hour' : check.reasons.join(' · ')} onClick={() => onTalk(ids, societyId)}>
        Talk
      </Button>
    )
  }

  return (
    <main className="fair-screen map-screen">
      <div
        ref={board}
        className="map-board"
        style={{ '--map-shape': PICTURE_SHAPE } as CSSProperties}
        // It opens a little small: the tables are spread apart again once it is at its size, so none lies over another.
        onAnimationEnd={(event) => event.target === event.currentTarget && settle(event.currentTarget)}
      >
        {picture && <img className="map-art" src={`content://pack/${picture}`} alt={event?.name ?? 'The fair'} />}
        {fairTables(content).map(({ society, x, y }) => {
          const staff = atTable(content, state, society.id)
          const mine = state.societies.includes(society.id)
          const join = canJoinSociety(content, state, society.id)
          return (
            <div key={society.id} className={mine ? 'map-pin fair-table joined' : 'map-pin fair-table'} style={{ left: `${x}%`, top: `${y}%` }}>
              <span className="map-pin-head">
                <span className="map-medallion" title={society.description}>
                  <JobIcon name="columns" image={society.iconImage} size={20} />
                </span>
                <span className="map-plate" title={society.description}>
                  {society.name.replace(/^the /, '')}
                  <span className="fair-when">
                    {society.weekday}s {clock(society.startHour)}
                  </span>
                </span>
                {mine ? (
                  <span className="map-state">Joined</span>
                ) : (
                  <Button size="small" className="map-go" disabled={!join.ok} title={join.reasons.join(' · ') || undefined} onClick={() => onJoin(society.id)}>
                    Join
                  </Button>
                )}
                {hello(staff, society.id)}
                {staff.length > 0 && talk(staff, society.id)}
              </span>
              {staff.length > 0 && <span className="map-pin-people">{staff.map((id) => face(id))}</span>}
            </div>
          )
        })}
        {(fair?.visitors ?? []).map(({ id, x, y }) => {
          const one = who(id)
          if (!one) return null
          const isLoveInterest = content.loveInterests.some((li) => li.id === id)
          return (
            <div key={id} className="map-pin fair-visitor" style={{ left: `${x}%`, top: `${y}%` }}>
              <span className="map-pin-head">
                <span className="map-plate">{one.name}</span>
                {hello([id])}
                {isLoveInterest && talk([id])}
              </span>
              <span className="map-pin-people">{face(id)}</span>
            </div>
          )
        })}
      </div>

      <Ornate className="fair-plaque pin-keepout">
        <h2>{event?.name.replace(/^the /, 'The ') ?? 'The fair'}</h2>
        <span className="caps">
          {clock(hour)}
          {event && ` · until ${clock(fairCloses(event))}`} · {state.societies.length} of {config?.maxJoined} joined
        </span>
      </Ornate>

      <BackButton label="Leave" className="map-close pin-keepout" onClick={onLeave} />
    </main>
  )
}
