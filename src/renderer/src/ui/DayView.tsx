import { useState } from 'react'
import { StatsDialog } from './StatsDialog'
import {
  SLEEP_HOURS,
  STAT_CAP,
  trainingToward,
  coursePoints,
  studyOuting,
  studyPlaces,
  studyPoints,
  DRILL_HOURS,
  drillOuting,
  eventOutings,
  suggestDrills,
  type Outing,
  shiftNow,
  appointmentsNow,
  attendees,
  coursesInSession,
  eventsOn,
  firstNames,
  isGameOver,
  approachableAt,
  meetingNow,
  npcsAt,
  orientationStep,
  summons,
  hasMet,
  formatTime,
  nextUp,
  examNow,
  roomHeIsIn,
  inRoom,
  spriteFor,
  wornOutfit,
  skillFor,
  skillProgress,
  focusOf,
  focusChoices,
  focusName,
  canGoTo,
  type Upcoming,
  stageFor,
  toDate,
  unreadNotes,
  weatherOn,
  roomBackdrop
} from '../../../shared/game'
import { MAX_SCENE_CAST, STAT_LABELS, STATS, type Activity, type ContentPack, type Focus, type GameState } from '../../../shared/model'
import { ActivityList } from './ActivityList'
import { Backdrop } from './Backdrop'
import {
  CalendarIcon,
  ChevronIcon,
  MapIcon,
  MenuIcon,
  BagIcon,
  PhoneIcon,
  WeatherIcon,
  JobIcon
} from './icons'
import type { Panel } from './panels'

interface Props {
  content: ContentPack
  state: GameState
  partnerId: string | undefined
  /** The view of the current location the player picked, if any. */
  backgroundId: string | undefined
  /** Waiting on the AI to work out something the player typed. */
  busy: boolean
  /** Something of the player's own devising: "invite Faye and Tink out for dinner". */
  onPropose: (text: string) => void
  /** Chooses what his spare hours go to, or nothing. */
  onFocus: (focus: Focus | undefined) => void
  /** Asks to go and do something that was suggested, such as a way of raising a stat. */
  onOuting: (outing: Outing) => void
  onActivity: (activity: Activity) => void
  /** Have a word with an NPC who is here. */
  onTalkNpc: (npcId: string) => void
  /** Go to the next part of orientation. */
  onOrientation: () => void
  /** Takes up a class, shift or plan of his: one that is on now, or the next to come today, skipping the time until it starts. He is taken to it. */
  onGoTo: (next: Upcoming) => void
  /** Ends the day early: the rest of it is let go, and he sleeps until morning. */
  onEndDay: () => void
  /** Browse the shops here, or go to the market (if there are none here) and browse its stalls. */
  onOpen: (panel: Panel) => void
}

/** Between scenes: where and when you are, and the choice of what to do next. */
export function DayView(props: Props) {
  const { content, state, partnerId, onActivity, onOpen } = props
  const { calendar } = content
  const [idea, setIdea] = useState('')
  // Whether the ways of raising each stat are laid out.
  const [showStats, setShowStats] = useState(false)
  // Whether his stats are laid out in full.
  const [statSheet, setStatSheet] = useState(false)
  // The course picked to study for; an empty string while the list of courses is open, and null with the menu shut.
  const [studying, setStudying] = useState<string | null>(null)
  const date = toDate(calendar, state.time)
  const location = content.locations.find((l) => l.id === state.locationId)
  const today = eventsOn(content, state)
  const over = isGameOver(calendar, state.time)
  const weather = weatherOn(content, state)
  // Whoever is here and can be gone up to: someone in class is left out, and met only by sitting it with her.
  const present = approachableAt(content, state, state.locationId)
  const npcsHere = npcsAt(content, state, state.locationId)
  // The player's own courses that are meeting right now.
  const classes = coursesInSession(content, state).filter((c) => state.enrolment?.includes(c.id))
  // The courses he takes, and the one he has picked to study for (empty while he is still choosing; null with the menu shut).
  const mine = state.courses.filter((c) => state.enrolment?.includes(c.id))
  const studied = mine.find((c) => c.id === studying)
  // The shift of his that is under way, if he has not clocked in for it.
  const shift = shiftNow(content, state)
  const { player } = state

  // Something of his that is on right now: taking it up takes him to it from wherever he is.
  const underWay = (kind: Upcoming['kind'], id: string, locationId: string): Upcoming => ({ kind, id, title: '', time: state.time, locationId })
  // Whether something of his is on right now that he can still take up: a class that has just begun counts from its first hour.
  const onNow =
    classes.some((course) => canGoTo(content, state, underWay(examNow(content, state, course) ? 'exam' : 'class', course.id, course.locationId)).ok) ||
    (shift !== undefined && canGoTo(content, state, underWay('work', shift.job.id, shift.job.locationId)).ok) ||
    appointmentsNow(state).some((plan) => canGoTo(content, state, underWay('plan', plan.id, plan.locationId)).ok)
  // The next class, shift or plan of his still to come today. Only one thing is put forward at a time: with something
  // on now, that is it, and what follows it waits its turn.
  const upcoming = onNow ? undefined : nextUp(content, state)
  // Whether a plan on his timetable is the birth of a child of his, which is said as what it is.
  const isBirth = (planId: string) => state.appointments.find((plan) => plan.id === planId)?.kind === 'birth'
  // While orientation has a part left, it is the only thing to do.
  const induction = over ? undefined : orientationStep(content, state)
  const inductionPlace = content.locations.find((l) => l.id === induction?.locationId)
  // Something he has been summoned to and is next on his day: until it is done, it is all there is to do, as with orientation.
  const summoned = over || induction ? undefined : summons(content, state)
  const locked = induction !== undefined || summoned !== undefined


  const ownRoom = roomBackdrop(state.inOwnRoom ? content.newGame.room : undefined, 'room-of-player')
  // At home, whoever of the household is in the room he is looking at is standing in it: the house is lived in, not a set of empty pictures.
  const here = roomHeIsIn(content, state)
  const inTheRoom = here ? inRoom(content, state, here.key).slice(0, MAX_SCENE_CAST) : []
  return (
    <main className="stage">
      {/* In his own room, the room is what is behind him, and not the building it is in. */}
      <Backdrop
        screen="day"
        weather={weather?.effect}
        location={location}
        periodId={date.period.id}
        light={date.period.light}
        backgroundId={ownRoom.viewId ?? props.backgroundId}
        room={ownRoom.room}
      />

      {inTheRoom.length > 0 && (
        <div className="cast home-cast">
          {inTheRoom.map((li) => {
            const image = spriteFor(li, wornOutfit(content, state, li), undefined)
            return (
              image && (
                <img
                  key={li.id}
                  src={`content://pack/${image}`}
                  alt={li.name}
                  style={li.stageHeight === 100 ? undefined : { transform: `scale(${li.stageHeight / 100})`, transformOrigin: '50% 100%' }}
                />
              )
            )
          })}
        </div>
      )}

      <div className="date-banner glass framed">
        <div className="weather" title={weather?.name}>
          <WeatherIcon kind={weather?.icon} size={28} />
        </div>
        <div>
          <div className="date-line">
            {date.weekday}, {date.day} {date.month.name} · {formatTime(date)}
          </div>
          <div className="caps">
            Day {date.dayIndex + 1} of {calendar.lengthDays}
            {today.map((e) => ` · ${e.name}`)}
            {location && ` · ${location.name}`}
          </div>
        </div>
      </div>

      <div className="plaque glass">
        <div className="caps underline">Money</div>
        <div className="plaque-value">${player.money}</div>
        <div className="caps">
          Energy {player.energy}/{player.maxEnergy}
        </div>
        <div className="meter">
          <div style={{ width: `${(player.energy / player.maxEnergy) * 100}%` }} />
        </div>
        <div className="caps">
          Carrying {Object.values(state.inventory).reduce((total, count) => total + count, 0)}
        </div>
        <button type="button" className="stat-grid" aria-label="Your stats in full" onClick={() => setStatSheet(true)}>
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
        </button>
      </div>
      {statSheet && <StatsDialog content={content} state={state} onClose={() => setStatSheet(false)} />}

      <div className="choices">
        {over && <h1 className="prompt glass">The season has ended.</h1>}

        {/* Who is here to be gone up to. With nobody, there is nothing to show. */}
        {(present.length > 0 || npcsHere.length > 0) && (
        <div className="partners glass">
          <span className="caps">Here</span>
          {present.map((li) => {
            const stage = stageFor(content.relationships, state.relationships[li.id].affection)
            return (
              <button
                key={li.id}
                className={hasMet(state, li.id) ? 'partner' : 'partner unmet'}
                title={`${li.name} · ${hasMet(state, li.id) ? stage.name : 'you have not met'}. Click to start a line about her below; right-click for what you know of her`}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onOpen({ kind: 'courier', id: li.id })
                }}
                onClick={() => setIdea(`Talk with ${li.name.split(' ')[0]}`)}
              >
                {li.name.split(' ')[0]}
              </button>
            )
          })}

          {npcsHere.map((npc) => (
            <button
              key={npc.id}
              className="partner npc"
              title={`Talk to ${npc.name}${npc.role ? `, ${npc.role}` : ''}`}
              disabled={locked || over}
              onClick={() => props.onTalkNpc(npc.id)}
            >
              {npc.name.split(' ')[0]}
            </button>
          ))}
        </div>
        )}

        {/* What the hours he skips go on: under who is here, where the day's choices begin. */}
        {!over && (
          <label className="focus-pick glass" title="When you skip ahead to your next class, shift or plan, the hours in between are spent on this: half of what a session of it would earn, for no energy.">
            <span className="caps">Focus</span>
            <select
              value={focusOf(state) ? `${focusOf(state)!.kind}:${focusOf(state)!.id}` : ''}
              onChange={(e) => {
                const [kind, ...id] = e.target.value.split(':')
                props.onFocus(kind === 'stat' || kind === 'course' ? { kind, id: id.join(':') } : undefined)
              }}
            >
              <option value="">Nothing</option>
              {focusChoices(state).map(({ focus, label }) => (
                <option key={`${focus.kind}:${focus.id}`} value={`${focus.kind}:${focus.id}`}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

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
        {summoned && (
          <p className="glass note">
            <strong>{summoned.title}.</strong> You are expected, and it will not wait. The rest of the day is yours once it is done.
          </p>
        )}

        {/* The next thing on his timetable today: taking it skips the hours until it starts and takes him there. */}
        {!induction && !over && upcoming && (
          canGoTo(content, state, upcoming).ok ? (
            <button className="featured" disabled={props.busy} onClick={() => props.onGoTo(upcoming)}>
              <span className="chip outline-light">{upcoming.kind === 'class' ? 'Next class' : upcoming.kind === 'exam' ? 'Exam' : upcoming.kind === 'work' ? 'Next shift' : isBirth(upcoming.id) ? 'Birth' : 'Next plan'}</span>
              <span className="featured-title">{upcoming.title}</span>
              <span>
                skip to {formatTime(toDate(calendar, upcoming.time))} · {content.locations.find((l) => l.id === upcoming.locationId)?.name}
                {focusName(state) && upcoming.time > state.time ? ` · ${upcoming.time - state.time}h on ${focusName(state)}` : ''}
              </span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p className="glass note">
              <strong>
                Next: {upcoming.title} at {formatTime(toDate(calendar, upcoming.time))}.
              </strong>{' '}
              {canGoTo(content, state, upcoming).reasons.join(' · ')}
            </p>
          )
        )}

        {/* What is on today that he could go to: an event that keeps hours, for as much of it as he likes. */}
        {!locked &&
          !over &&
          eventOutings(content, state).map(({ event, outing }) => (
            <button key={event.id} className="featured" disabled={props.busy} onClick={() => props.onOuting(outing)}>
              <span className="chip outline-light">Event</span>
              <span className="featured-title">{event.name}</span>
              <span>
                {content.locations.find((l) => l.id === outing.locationId)?.name} ·{' '}
                {outing.window && state.time < outing.window.from
                  ? `opens ${formatTime(toDate(calendar, outing.window.from))}`
                  : `until ${formatTime(toDate(calendar, outing.window?.until ?? state.time))}`}
              </span>
              <ChevronIcon size={18} />
            </button>
          ))}

        {!induction && appointmentsNow(state).map((plan) => {
          const item = underWay('plan', plan.id, plan.locationId)
          const check = canGoTo(content, state, item)
          const who = firstNames(content, attendees(plan))
          return check.ok ? (
            <button key={plan.id} className="featured" onClick={() => props.onGoTo(item)}>
              <span className="chip outline-light">{plan.kind === 'birth' ? 'Birth' : plan.kind === 'viewing' ? 'House' : plan.kind === 'below' ? 'Below' : 'Plan'}</span>
              <span className="featured-title">{plan.kind === 'birth' ? `${who} is giving birth` : plan.kind === 'viewing' ? plan.title : plan.kind === 'below' ? `${who} is waiting to show you something` : `${plan.title} with ${who}`}</span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p key={plan.id} className="glass note">
              <strong>
                {plan.kind === 'birth' ? `${who} is giving birth, and wants you there.` : plan.kind === 'viewing' ? `${plan.title}: the housing officer is waiting for you.` : plan.kind === 'below' ? `${who} is waiting to show you something.` : `${who} ${plan.companionIds.length > 0 ? 'are' : 'is'} waiting for you: ${plan.title}.`}
              </strong>{' '}
              {check.reasons.join(' · ')}
            </p>
          )
        })}

        {/* The way down, where it is, once he has been told of it. */}
        {!locked && !over && content.expedition && state.expedition.invited && state.locationId === content.expedition.entryLocationId && (
          <button className="featured" disabled={props.busy} onClick={() => onOpen({ kind: 'below' })}>
            <span className="chip outline-light">Below</span>
            <span className="featured-title">Go down into {content.expedition.name}</span>
            <span>
              {state.expedition.cleared} of {content.expedition.depths.length} anchors set
            </span>
            <ChevronIcon size={18} />
          </button>
        )}

        {!locked && shift && (
          canGoTo(content, state, underWay('work', shift.job.id, shift.job.locationId)).ok ? (
            <button className="featured" onClick={() => props.onGoTo(underWay('work', shift.job.id, shift.job.locationId))}>
              <span className="chip outline-light">Work</span>
              <span className="featured-title">Start your shift: {shift.job.title}</span>
              <span>until {String(shift.shift.startHour + shift.shift.hours).padStart(2, '0')}:00</span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p className="glass note">
              <strong>Your shift as {shift.job.title.toLowerCase()} is on now.</strong> {canGoTo(content, state, underWay('work', shift.job.id, shift.job.locationId)).reasons.join(' · ')}
            </p>
          )
        )}

        {!locked && classes.map((course) => {
          // An examination being sat is gone to like a class: he is taken to the hall and given its paper.
          const exam = examNow(content, state, course)
          if (exam) {
            const sitting = underWay('exam', course.id, course.locationId)
            const until = `${String(exam.meeting.startHour + exam.meeting.hours).padStart(2, '0')}:00`
            return canGoTo(content, state, sitting).ok ? (
              <button key={course.id} className="featured" disabled={props.busy} onClick={() => props.onGoTo(sitting)}>
                <span className="chip outline-light">{exam.kind === 'midterm' ? 'Midterm' : 'Final'}</span>
                <span className="featured-title">
                  Sit the {exam.kind}: {course.number}
                </span>
                <span>
                  until {until} · {content.locations.find((l) => l.id === course.locationId)?.name}
                </span>
                <ChevronIcon size={18} />
              </button>
            ) : (
              <p key={course.id} className="glass note">
                <strong>
                  The {exam.kind} in {course.number} is over at {until}.
                </strong>{' '}
                {canGoTo(content, state, sitting).reasons.join(' · ')}
              </p>
            )
          }
          const item = underWay('class', course.id, course.locationId)
          const check = canGoTo(content, state, item)
          return check.ok ? (
            <button key={course.id} className="featured" onClick={() => props.onGoTo(item)}>
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

        {!locked && <ActivityList content={content} state={state} partnerId={partnerId} onPick={onActivity} />}

        {!locked && !over && mine.length > 0 && (
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
                    {skillFor(content, course) && (
                      <span className="hint">
                        {skillProgress(state, skillFor(content, course)!).has ? `Taught you: ${skillFor(content, course)!.name}` : `Teaches ${skillFor(content, course)!.name} at ${skillFor(content, course)!.at} marks`}
                      </span>
                    )}
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
                  <button key={`${place.locationId}-${place.roomOf?.id ?? (place.own ? 'own' : '')}`} className="stat-option glass" disabled={props.busy} onClick={() => {
                    // Once it is chosen the bar folds away again.
                    setStudying(null)
                    props.onOuting(session)
                  }}>
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

        {!locked && !over && (
          <div className="stat-menu">
            <button className={showStats ? 'featured open' : 'featured'} aria-expanded={showStats} disabled={props.busy} onClick={() => setShowStats(!showStats)}>
              <span className="chip outline-light">Stats</span>
              <span className="featured-title">Work on yourself</span>
              <span>{showStats ? 'Close' : 'Six ways to get better'}</span>
              <ChevronIcon size={18} />
            </button>
            {showStats &&
              suggestDrills(content, state).map((suggestion) => (
                <button key={suggestion.stat} className="stat-option glass" disabled={props.busy} onClick={() => {
                  setShowStats(false)
                  props.onOuting(drillOuting(suggestion))
                }}>
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

        {!over && (
          <button className="featured slim" disabled={props.busy || locked} onClick={props.onEndDay}>
            <span className="featured-title">End the day</span>
            {/* Orientation has to be sat through first: the day cannot be ended while a part of it is left. */}
            <span>{induction ? 'once orientation is done' : summoned ? 'once you have been' : `until 0${SLEEP_HOURS.until}:00`}</span>
            <ChevronIcon size={18} />
          </button>
        )}


        <form
          className="free-text"
          onSubmit={(e) => {
            e.preventDefault()
            if (idea.trim() && !props.busy && !over && !locked) props.onPropose(idea.trim())
          }}
        >
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            disabled={props.busy || over || locked}
            maxLength={500}
            aria-label="Describe something else to do"
            placeholder={
              induction
                ? 'Orientation comes first today'
                : summoned
                  ? `${summoned.title} comes first`
                : props.busy
                  ? 'Working it out...'
                : 'Describe it: "spar at the tiltyard", "invite Faye and Tink to dinner", "sleep"...'
            }
          />
          <button type="submit" disabled={props.busy || over || !idea.trim() || locked} aria-label="Do this" className="danger icon">
            <ChevronIcon size={18} />
          </button>
        </form>
      </div>

      <div className="tiles">
        {/* His house, once he has one: its plan, who lives in it, and its accounts. */}
        {content.housing && state.housing.status === 'resident' && (
          <button className="tile glass home" onClick={() => onOpen({ kind: 'house' })}>
            <JobIcon name="house" size={30} />
            {content.housing.name}
            {state.housing.arrears > 0 && <span className="badge">!</span>}
          </button>
        )}
        <button className="tile glass" onClick={() => onOpen({ kind: 'map' })}>
          <MapIcon size={36} />
          Map
        </button>
        <button className="tile glass" onClick={() => onOpen({ kind: 'courier' })}>
          <PhoneIcon size={36} />
          Phone
          {unreadNotes(state) > 0 && <span className="badge">{unreadNotes(state)}</span>}
        </button>
        <button className="tile glass" onClick={() => onOpen({ kind: 'calendar' })}>
          <CalendarIcon size={36} />
          Calendar
        </button>
        {/* What he carries, can make and has brought up from below. */}
        <button className="tile glass" onClick={() => onOpen({ kind: 'bag' })}>
          <BagIcon size={36} />
          Bag
        </button>
        {/* The menu, for whoever does not reach for Escape: continue, save, load, settings, and the way out. Small, and last, so that it sits in the corner. */}
        <button className="tile-menu glass" title="Menu (Esc)" onClick={() => onOpen({ kind: 'menu' })}>
          <MenuIcon size={18} />
          Menu
        </button>
      </div>

    </main>
  )
}
