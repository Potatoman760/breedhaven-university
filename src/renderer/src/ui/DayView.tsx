import { useState } from 'react'
import {
  STAT_CAP,
  trainingToward,
  coursePoints,
  studyOuting,
  studyPlaces,
  studyPoints,
  DRILL_HOURS,
  drillOuting,
  suggestDrills,
  type Outing,
  canWork,
  shiftNow,
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
  npcsAt,
  orientationStep,
  stageFor,
  toDate,
  stallsAt,
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
  ChatIcon,
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
  /** Asks to go and do something that was suggested, such as a way of raising a stat. */
  onOuting: (outing: Outing) => void
  onActivity: (activity: Activity) => void
  /** Turn up for a plan whose time has come. */
  onKeep: (appointmentId: string) => void
  /** Have a word with an NPC who is here. */
  onTalkNpc: (npcId: string) => void
  /** Go to the next part of orientation. */
  onOrientation: () => void
  /** Sit the class of a course that is meeting now. */
  onAttend: (courseId: string) => void
  /** Clocks in for the shift that is under way. */
  onWork: () => void
  /** Browse the shops here, or go to the market (if there are none here) and browse its stalls. */
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
  const npcsHere = npcsAt(content, state, state.locationId)
  // The player's own courses that are meeting right now.
  const classes = coursesInSession(content, state).filter((c) => state.enrolment?.includes(c.id))
  // The courses he takes, and the one he has picked to study for (empty while he is still choosing; null with the menu shut).
  const mine = state.courses.filter((c) => state.enrolment?.includes(c.id))
  const studied = mine.find((c) => c.id === studying)
  // The shift of his that is under way, if he has not clocked in for it.
  const shift = shiftNow(content, state)
  const { player } = state

  const [idea, setIdea] = useState('')

  // Whether the ways of raising each stat are laid out.

  const [showStats, setShowStats] = useState(false)

  // The course picked to study for; an empty string while the list of courses is open, and null with the menu shut.

  const [studying, setStudying] = useState<string | null>(null)
  // While orientation has a part left, it is the only thing to do.
  const induction = over ? undefined : orientationStep(content, state)
  const inductionPlace = content.locations.find((l) => l.id === induction?.locationId)

  const tbi = (feature: string, note: string) => () => onOpen({ kind: 'tbi', feature, note })

  return (
    <main className="stage">
      <Backdrop screen="day" weather={weather?.effect} location={location} periodId={date.period.id} light={date.period.light} backgroundId={props.backgroundId} />

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
            <span
              key={stat}
              className="stat-cell"
              title={
                (player.stats[stat] ?? 0) >= STAT_CAP
                  ? `${stat}: as high as it goes`
                  : `${stat}: ${trainingToward(state, stat).banked} of ${trainingToward(state, stat).needed} training points toward ${(player.stats[stat] ?? 0) + 1}`
              }
            >
              <span className="caps">{STAT_LABELS[stat]}</span> {player.stats[stat] ?? 0}
              {/* How far he is toward the next point. */}
              <i style={{ width: `${(player.stats[stat] ?? 0) >= STAT_CAP ? 100 : (trainingToward(state, stat).banked / trainingToward(state, stat).needed) * 100}%` }} />
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
          {present.length === 0 && npcsHere.length === 0 && <span>No one you know. Check the map.</span>}
          {present.map((li) => {
            const stage = stageFor(content.relationships, state.relationships[li.id].affection)
            return (
              <button
                key={li.id}
                className="partner"
                title="Click to start a line about her below; right-click for what you know of her"
                onContextMenu={(event) => {
                  event.preventDefault()
                  onOpen({ kind: 'courier', id: li.id })
                }}
                onClick={() => setIdea(`Talk with ${li.name.split(' ')[0]}`)}
              >
                {li.name.split(' ')[0]} · {stage.name}
              </button>
            )
          })}

          {npcsHere.map((npc) => (
            <button
              key={npc.id}
              className="partner npc"
              title={`Talk to ${npc.name}`}
              disabled={induction !== undefined || over}
              onClick={() => props.onTalkNpc(npc.id)}
            >
              {npc.name} · {npc.role}
            </button>
          ))}
        </div>

        {induction && (
          <button className="featured" onClick={props.onOrientation}>
            <span className="chip outline-light">Orientation</span>
            <span className="featured-title">Go to {induction.name}</span>
            <span>
              {String(induction.startHour).padStart(2, '0')}:00 · {inductionPlace?.name}
            </span>
            <ChevronIcon size={18} />
          </button>
        )}
        {induction && (
          <p className="glass note">
            <strong>Orientation Day.</strong> Every student has to attend. The rest of the day is yours once it is done.
          </p>
        )}

        {!induction && appointmentsNow(state).map((plan) => {
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

        {!induction && shift && (
          canWork(content, state).ok ? (
            <button className="featured" onClick={props.onWork}>
              <span className="chip outline-light">Work</span>
              <span className="featured-title">Start your shift: {shift.job.title}</span>
              <span>until {String(shift.shift.startHour + shift.shift.hours).padStart(2, '0')}:00</span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p className="glass note">
              <strong>Your shift as {shift.job.title.toLowerCase()} is on now.</strong> {canWork(content, state).reasons.join(' · ')}
            </p>
          )
        )}

        {!induction && classes.map((course) => {
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
                  (meetingNow(content, state, course)?.startHour ?? 0) + (meetingNow(content, state, course)?.hours ?? 0)
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

        {!induction && <ActivityList content={content} state={state} partnerId={partnerId} onPick={onActivity} />}

        {!induction && !over && mine.length > 0 && (
          <div className="stat-menu">
            <button
              className={studying !== null ? 'featured open' : 'featured'}
              aria-expanded={studying !== null}
              disabled={props.busy}
              onClick={() => setStudying(studying === null ? '' : null)}
            >
              <span className="chip outline-light">Study</span>
              <span className="featured-title">{studied ? `Study for ${studied.number}` : 'Study for a class'}</span>
              <span>{studying === null ? `${mine.length} course${mine.length === 1 ? '' : 's'}` : 'Close'}</span>
              <ChevronIcon size={18} />
            </button>
            {/* First the course, then where. */}
            {studying !== null &&
              !studied &&
              mine.map((course) => {
                const grades = state.grades[course.id]
                return (
                  <button key={course.id} className="stat-option glass" disabled={props.busy} onClick={() => setStudying(course.id)}>
                    <span className="caps">
                      {course.number} · {Math.round(coursePoints(state, course.id))} of {content.coursework?.grading.points}
                    </span>
                    <strong>{course.title}</strong>
                    <span className="hint">
                      {grades?.final ? `Final ${grades.final.letter}` : grades?.midterm ? `Midterm ${grades.midterm.letter}` : 'Not yet graded'}
                    </span>
                  </button>
                )
              })}
            {studied && (
              <button className="stat-option glass" disabled={props.busy} onClick={() => setStudying('')}>
                <span className="caps">Back</span>
                <strong>Another course</strong>
                <span className="hint">
                  {Math.round(coursePoints(state, studied.id))} of {content.coursework?.grading.points} so far
                </span>
              </button>
            )}
            {studied &&
              studyPlaces(content, state, studied).map((place) => {
                const session = studyOuting(content, studied, place)
                return (
                  <button key={`${place.locationId}-${place.roomOf?.id ?? (place.own ? 'own' : '')}`} className="stat-option glass" disabled={props.busy} onClick={() => props.onOuting(session)}>
                    <span className="caps">+{studyPoints(content, session)} points</span>
                    <strong>{place.name}</strong>
                    <span className="hint">
                      {session.hours} hours
                      {place.own ? ' · nothing to interrupt you' : place.roomOf ? ` · with ${place.roomOf.name.split(' ')[0]}` : ''}
                    </span>
                  </button>
                )
              })}
          </div>
        )}

        {!induction && !over && (
          <div className="stat-menu">
            <button className={showStats ? 'featured open' : 'featured'} aria-expanded={showStats} disabled={props.busy} onClick={() => setShowStats(!showStats)}>
              <span className="chip outline-light">Stats</span>
              <span className="featured-title">Work on yourself</span>
              <span>{showStats ? 'Close' : 'Six ways to get better'}</span>
              <ChevronIcon size={18} />
            </button>
            {showStats &&
              suggestDrills(content, state).map((suggestion) => (
                <button key={suggestion.stat} className="stat-option glass" disabled={props.busy} onClick={() => props.onOuting(drillOuting(suggestion))}>
                  <span className="caps">
                    {STAT_LABELS[suggestion.stat]} {player.stats[suggestion.stat] ?? 0}
                  </span>
                  <strong>{suggestion.drill.title}</strong>
                  <span className="hint">
                    {suggestion.location.name} · {DRILL_HOURS} hours · {trainingToward(state, suggestion.stat).banked} of {trainingToward(state, suggestion.stat).needed} toward{' '}
                    {(player.stats[suggestion.stat] ?? 0) + 1}
                  </span>
                </button>
              ))}
          </div>
        )}

        {notice && <p className="notice">{notice}</p>}

        <form
          className="free-text"
          onSubmit={(e) => {
            e.preventDefault()
            if (idea.trim() && !props.busy && !over && !induction) props.onPropose(idea.trim())
          }}
        >
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={props.busy || over || induction !== undefined}
            maxLength={500}
            aria-label="Describe something else to do"
            placeholder={
              induction
                ? 'Orientation comes first today'
                : props.busy
                  ? 'Working it out...'
                : 'Describe it: "spar at the tiltyard", "invite Faye and Tink to dinner", "sleep"...'
            }
          />
          <button type="submit" disabled={props.busy || over || !idea.trim() || induction !== undefined} aria-label="Do this" className="danger icon">
            <ChevronIcon size={18} />
          </button>
        </form>
      </div>

      <div className="tiles">
        <button className="tile glass" onClick={props.onMarket}>
          <MarketIcon size={36} />
          {stallsAt(content, state.locationId).length > 0 ? 'Shops' : 'Market'}
        </button>
        <button className="tile glass" onClick={() => onOpen({ kind: 'map' })}>
          <MapIcon size={36} />
          Map
        </button>
        <button className="tile glass" onClick={() => onOpen({ kind: 'courier' })}>
          <ChatIcon size={36} />
          Phone
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
