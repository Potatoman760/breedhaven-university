import { useState } from 'react'
import {
  appointmentsNow,
  attendees,
  canAttend,
  canKeep,
  coursesInSession,
  eventsOn,
  firstNames,
  isGameOver,
  loveInterestsAt,
  meetingNow,
  stageFor,
  toDate,
  unreadNotes,
  weatherOn
} from '../../../shared/game'
import { STAT_LABELS, STATS, type Activity, type ContentPack, type GameState } from '../../../shared/model'
import { ActivityList } from './ActivityList'
import { Backdrop } from './Backdrop'
import {
  CalendarIcon,
  ChevronIcon,
  LogIcon,
  MapIcon,
  MarketIcon,
  NoticeBoardIcon,
  SettingsIcon,
  WeatherIcon
} from './icons'
import type { Panel } from './panels'

interface Props {
  content: ContentPack
  state: GameState
  partnerId: string | undefined
  /** The view of the current location the player picked, if any. */
  backgroundId: string | undefined
  notice: string
  /** Waiting on the AI to work out something the player typed. */
  busy: boolean
  /** Something of the player's own devising: "invite Faye and Tink out for dinner". */
  onPropose: (text: string) => void
  onActivity: (activity: Activity) => void
  /** Turn up for a plan whose time has come. */
  onKeep: (appointmentId: string) => void
  /** Sit the class of a course that is meeting now. */
  onAttend: (courseId: string) => void
  /** Go to the market (if not already there) and browse its stalls. */
  onMarket: () => void
  onOpen: (panel: Panel) => void
  onExit: () => void
}

/** Between scenes: where and when you are, and the choice of what to do next. */
export function DayView(props: Props) {
  const { content, state, partnerId, notice, onActivity, onOpen, onExit } = props
  const { calendar } = content
  const date = toDate(calendar, state.time)
  const location = content.locations.find((l) => l.id === state.locationId)
  const today = eventsOn(content, state)
  const over = isGameOver(calendar, state.time)
  const weather = weatherOn(content, state)
  const present = loveInterestsAt(content, state, state.locationId)
  // The player's own courses that are meeting right now.
  const classes = coursesInSession(content, state).filter((c) => state.enrolment?.includes(c.id))
  const { player } = state

  const [idea, setIdea] = useState('')

  const tbi = (feature: string, note: string) => () => onOpen({ kind: 'tbi', feature, note })

  return (
    <main className="stage">
      <Backdrop location={location} periodId={date.period.id} backgroundId={props.backgroundId} />

      <div className="date-banner glass framed">
        <div className="weather" title={weather?.name}>
          <WeatherIcon kind={weather?.icon} size={28} />
        </div>
        <div>
          <div className="date-line">
            {date.weekday}, {date.day} {date.month.name} · {date.period.name}
          </div>
          <div className="caps">
            Day {date.dayIndex + 1} of {calendar.lengthDays}
            {weather && ` · ${weather.name}`}
            {today.map((e) => ` · ${e.name}`)}
            {location && ` · ${location.name}`}
          </div>
        </div>
      </div>

      <div className="plaque glass">
        <div className="caps underline">Coin</div>
        <div className="plaque-value">{player.money}</div>
        <div className="caps">
          Energy {player.energy}/{player.maxEnergy}
        </div>
        <div className="meter">
          <div style={{ width: `${(player.energy / player.maxEnergy) * 100}%` }} />
        </div>
        <div className="caps">
          Gifts carried {Object.values(state.inventory).reduce((total, count) => total + count, 0)}
        </div>
        <div className="stat-grid">
          {STATS.map((stat) => (
            <span key={stat} title={stat}>
              <span className="caps">{STAT_LABELS[stat]}</span> {player.stats[stat] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className="choices">
        <h1 className="prompt glass">
          {over ? 'The season has ended.' : 'What will you do?'}
        </h1>

        <div className="partners glass">
          <span className="caps">Here</span>
          {present.length === 0 && <span>No one you know. Check the map.</span>}
          {present.map((li) => {
            const stage = stageFor(content.relationships, state.relationships[li.id].affection)
            return (
              <button
                key={li.id}
                className="partner"
                title="Click to start a line about them below"
                onClick={() => setIdea(`Talk with ${li.name.split(' ')[0]}`)}
              >
                {li.name.split(' ')[0]} · {stage.name}
              </button>
            )
          })}

        </div>

        {appointmentsNow(state).map((plan) => {
          const check = canKeep(content, state, plan.id)
          const who = firstNames(content, attendees(plan))
          return check.ok ? (
            <button key={plan.id} className="featured" onClick={() => props.onKeep(plan.id)}>
              <span className="chip outline-light">Plan</span>
              <span className="featured-title">
                {plan.title} with {who}
              </span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p key={plan.id} className="glass note">
              <strong>
                {who} {plan.companionIds.length > 0 ? 'are' : 'is'} waiting for you: {plan.title}.
              </strong>{' '}
              {check.reasons.join(' · ')}
            </p>
          )
        })}

        {classes.map((course) => {
          const check = canAttend(content, state, course.id)
          return check.ok ? (
            <button key={course.id} className="featured" onClick={() => props.onAttend(course.id)}>
              <span className="chip outline-light">Class</span>
              <span className="featured-title">
                Attend {course.number}: {course.title}
              </span>
              <span>
                until{' '}
                {String(
                  (meetingNow(content, state, course)?.startHour ?? 0) + (content.coursework?.hours ?? 0)
                ).padStart(2, '0')}
                :00
              </span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p key={course.id} className="glass note">
              <strong>{course.number} is meeting now.</strong> {check.reasons.join(' · ')}
            </p>
          )
        })}

        <ActivityList content={content} state={state} partnerId={partnerId} onPick={onActivity} />

        {notice && <p className="notice">{notice}</p>}

        <form
          className="free-text"
          onSubmit={(e) => {
            e.preventDefault()
            if (idea.trim() && !props.busy && !over) props.onPropose(idea.trim())
          }}
        >
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={props.busy || over}
            maxLength={500}
            aria-label="Describe something else to do"
            placeholder={
              props.busy
                ? 'Working it out...'
                : 'Describe it: "spar at the tiltyard", "invite Faye and Tink to dinner", "sleep"...'
            }
          />
          <button type="submit" disabled={props.busy || over || !idea.trim()} aria-label="Do this" className="danger icon">
            <ChevronIcon size={18} />
          </button>
        </form>
      </div>

      <div className="tiles">
        <button className="tile glass" onClick={props.onMarket}>
          <MarketIcon size={36} />
          Market
        </button>
        <button className="tile glass" onClick={() => onOpen({ kind: 'map' })}>
          <MapIcon size={36} />
          Map
        </button>
        <button className="tile glass" onClick={() => onOpen({ kind: 'courier' })}>
          <NoticeBoardIcon size={36} />
          Courier
          {unreadNotes(state) > 0 && <span className="badge">{unreadNotes(state)}</span>}
        </button>
        <button className="tile glass" onClick={() => onOpen({ kind: 'calendar' })}>
          <CalendarIcon size={36} />
          Calendar
        </button>
      </div>

      <div className="corner">
        <button
          className="util glass"
          onClick={tbi('Log', 'A history of everything that has happened so far.')}
        >
          <LogIcon size={18} />
          Log
        </button>
        <button className="util glass" onClick={() => onOpen({ kind: 'save' })}>
          Save
        </button>
        <button className="util glass" onClick={() => onOpen({ kind: 'load' })}>
          Load
        </button>
        <button className="util glass" onClick={onExit}>
          Menu
        </button>
        <button
          className="util glass icon"
          aria-label="Settings"
          onClick={() => onOpen({ kind: 'settings' })}
        >
          <SettingsIcon size={20} />
        </button>
      </div>
    </main>
  )
}
