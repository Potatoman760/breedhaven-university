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
  canPlayPoker,
  nextEventPart,
  requiredEventPart,
  weatherOn,
  roomBackdrop,
  joinedSocieties,
  fairNow,
  fairDue,
  fairOpensLater,
  societyMeetingNow
} from '../../../shared/game'
import { MAX_SCENE_CAST, STAT_LABELS, STATS, type Activity, type ContentPack, type Focus, type GameState } from '../../../shared/model'
import { t } from '../../../shared/i18n'
import { ActivityList } from './ActivityList'
import { Backdrop } from './Backdrop'
import { DateBanner } from './DateBanner'
import { NavTiles } from './NavTiles'
import { ChevronIcon } from './icons'
import type { Panel } from './panels'
import { useBack } from '../mouseBack'
import { Portrait } from './Portrait'
import { Tour, type TourStep } from './Tour'

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
  /** Go to a scripted part of an event that is on now. */
  onEventPart: (eventId: string, partId: string) => void
  /** Takes up a class, shift or plan of his: one that is on now, or the next to come today, skipping the time until it starts. He is taken to it. */
  onGoTo: (next: Upcoming) => void
  /** Ends the day early: the rest of it is let go, and he sleeps until morning. */
  onEndDay: () => void
  /** Browse the shops here, or go to the market (if there are none here) and browse its stalls. */
  onOpen: (panel: Panel) => void
  /** Goes to the societies' fair, while it is on. */
  onFair: () => void
  /**
   * Whoever welcomed him is showing him round the day's choices, straight after the rest of the first look round. It is
   * orientation day, when they are not his to make: they are shown for it all the same, and hidden again after.
   */
  touring: boolean
  onToured: () => void
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
  useBack(studying === null ? undefined : () => setStudying(studying === '' ? null : ''))
  const date = toDate(calendar, state.time)
  const location = content.locations.find((l) => l.id === state.locationId)
  const today = eventsOn(content, state).filter((event) => !event.secret)
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
  // The societies' fair, while its tables are out, or later today.
  const later = fairOpensLater(content, state)
  const fair = fairNow(content, state) ?? later?.event
  // The meetings of his societies that are on right now.
  const meetings = joinedSocieties(content, state).filter((society) => societyMeetingNow(content, state, society))
  // The shift of his that is under way, if he has not clocked in for it.
  const shift = shiftNow(content, state)
  const { player } = state

  // Something of his that is on right now: taking it up takes him to it from wherever he is.
  const underWay = (kind: Upcoming['kind'], id: string, locationId: string): Upcoming => ({ kind, id, title: '', time: state.time, locationId })
  // Whether something of his is on right now that he can still take up: a class that has just begun counts from its first hour.
  const onNow =
    classes.some((course) => canGoTo(content, state, underWay(examNow(content, state, course) ? 'exam' : 'class', course.id, course.locationId)).ok) ||
    meetings.some((society) => canGoTo(content, state, underWay('society', society.id, society.locationId)).ok) ||
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
  // What is put forward to go to next: what he has been summoned to whenever there is that, so that the one thing he
  // is held to is always there to take, even with a class on at the same hour; otherwise the next thing of his.
  const offered: Upcoming | undefined = summoned
    ? { kind: 'plan', id: summoned.id, title: summoned.title, time: Math.max(summoned.time, state.time), locationId: summoned.locationId }
    : upcoming
  // A part of an event he has to go to holds the day as orientation does, until he has been or it is over.
  const mustAttend = over || induction ? undefined : requiredEventPart(content, state)
  // The first day of the societies' fair holds the day as orientation does, until he has been.
  const fairCall = over || induction ? false : fairDue(content, state)
  const locked = induction !== undefined || summoned !== undefined || mustAttend !== undefined || fairCall
  // Only the next of the day's parts is offered: the others come up as each is gone to or over.
  const next = over || induction ? undefined : nextEventPart(content, state)
  const parts = next ? [next] : []


  const ownRoom = roomBackdrop(state.inOwnRoom ? content.newGame.room : undefined, 'room-of-player', date.period.light)
  // At home, whoever of the household is in the room he is looking at is standing in it: the house is lived in, not a set of empty pictures.
  const here = roomHeIsIn(content, state)
  const inTheRoom = here ? inRoom(content, state, here.key).slice(0, MAX_SCENE_CAST) : []
  // Whoever welcomed him, to show him round the day's choices at the end of the first look round. She opens each menu
  // herself to show what is in it, and closes it again after.
  const guideId = content.orientation?.intro?.speakerId
  const guide = [...content.npcs, ...content.loveInterests].find((one) => one.id === guideId)
  const dayTour: TourStep[] = [
    { target: '.choices', before: () => setStudying(null), text: t('screens.dayView.tourChoices') },
    ...(present.length > 0
      ? [{ target: '.partners', text: t('screens.dayView.tourPartners') }]
      : []),
    ...(mine.length > 0
      ? [
          {
            target: '[data-tour="study"]',
            before: () => {
              setShowStats(false)
              setStudying('')
            },
            text: t('screens.dayView.tourStudy')
          }
        ]
      : []),
    {
      target: '[data-tour="stats"]',
      before: () => {
        setStudying(null)
        setShowStats(true)
      },
      text: t('screens.dayView.tourStats')
    },
    {
      target: '.focus-pick',
      before: () => setShowStats(false),
      text: t('screens.dayView.tourFocus'),
      expression: 'happy'
    },
    { target: '.free-text', text: t('screens.dayView.tourFreeText') },
    { target: '[data-tour="end-day"]', text: t('screens.dayView.tourEndDay') },
    { text: t('screens.dayView.tourDone'), expression: 'happy' }
  ]

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

      <DateBanner date={date} weather={weather} notes={[t('screens.dayView.dayOf', { day: date.dayIndex + 1, days: calendar.lengthDays }), ...today.map((e) => e.name), location?.name]} />

      <div className="plaque glass">
        <div className="caps underline">{t('screens.dayView.money')}</div>
        <div className="plaque-value">${player.money}</div>
        <div className="caps">
          {t('screens.dayView.energy', { energy: player.energy, max: player.maxEnergy })}
        </div>
        <div className="meter">
          <div style={{ width: `${(player.energy / player.maxEnergy) * 100}%` }} />
        </div>
        <button type="button" className="stat-grid" aria-label={t('screens.dayView.statsInFull')} onClick={() => setStatSheet(true)}>
          {STATS.map((stat) => (
            <span
              key={stat}
              className="stat-cell"
              title={
                (player.stats[stat] ?? 0) >= STAT_CAP
                  ? t('screens.dayView.statMaxed', { stat })
                  : t('screens.dayView.statTraining', { stat, banked: trainingToward(state, stat).banked, needed: trainingToward(state, stat).needed, next: (player.stats[stat] ?? 0) + 1 })
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
        {over && <h1 className="prompt glass">{t('screens.dayView.seasonEnded')}</h1>}

        {/* Who is here to be gone up to. With nobody, there is nothing to show. */}
        {(present.length > 0 || npcsHere.length > 0) && (
        <div className="partners glass">
          <span className="caps">{t('screens.dayView.here')}</span>
          {present.map((li) => {
            const stage = stageFor(content.relationships, state.relationships[li.id].affection)
            return (
              <button
                key={li.id}
                className={hasMet(state, li.id) ? 'partner face' : 'partner face unmet'}
                title={t('screens.dayView.partnerTitle', { name: li.name, met: hasMet(state, li.id), stage: stage.name })}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onOpen({ kind: 'courier', id: li.id })
                }}
                onClick={() => setIdea(t('screens.dayView.talkWith', { name: li.name.split(' ')[0] }))}
              >
                <Portrait who={li} size={72} caption />
              </button>
            )
          })}

          {npcsHere.map((npc) => (
            <button
              key={npc.id}
              className="partner face npc"
              title={npc.role ? t('screens.dayView.talkToRole', { name: npc.name, role: npc.role }) : t('screens.dayView.talkTo', { name: npc.name })}
              disabled={locked || over}
              onClick={() => props.onTalkNpc(npc.id)}
            >
              <Portrait who={npc} size={72} caption />
            </button>
          ))}
        </div>
        )}

        {/* What the hours he skips go on: under who is here, where the day's choices begin. */}
        {!over && (
          <label className="focus-pick glass" title={t('screens.dayView.focusTitle')}>
            <span className="caps">{t('screens.dayView.focus')}</span>
            <select
              value={focusOf(state) ? `${focusOf(state)!.kind}:${focusOf(state)!.id}` : ''}
              onChange={(e) => {
                const [kind, ...id] = e.target.value.split(':')
                props.onFocus(kind === 'stat' || kind === 'course' ? { kind, id: id.join(':') } : undefined)
              }}
            >
              <option value="">{t('screens.dayView.focusNothing')}</option>
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
            <span className="chip outline-light">{t('screens.dayView.orientationChip')}</span>
            <span className="featured-title">{t('screens.dayView.goTo', { name: induction.name })}</span>
            <span>
              {String(induction.startHour).padStart(2, '0')}:00 · {inductionPlace?.name}
            </span>
            <ChevronIcon size={18} />
          </button>
        )}
        {induction && (
          <p className="glass note">
            <strong>{t('screens.dayView.orientationDay')}</strong> {t('screens.dayView.orientationNote')}
          </p>
        )}
        {summoned && (
          <p className="glass note">
            <strong>{t('screens.dayView.summonedTitle', { title: summoned.title })}</strong> {t('screens.dayView.summonedNote')}
          </p>
        )}

        {/* The next thing on his timetable today: taking it skips the hours until it starts and takes him there. */}
        {!induction && !over && offered && (
          canGoTo(content, state, offered).ok ? (
            <button className="featured" disabled={props.busy} onClick={() => props.onGoTo(offered)}>
              <span className="chip outline-light">{offered.kind === 'class' ? t('screens.dayView.nextClass') : offered.kind === 'exam' ? t('screens.dayView.exam') : offered.kind === 'work' ? t('screens.dayView.nextShift') : isBirth(offered.id) ? t('screens.dayView.birth') : t('screens.dayView.nextPlan')}</span>
              <span className="featured-title">{offered.title}</span>
              <span>
                {t('screens.dayView.skipTo', { time: formatTime(toDate(calendar, offered.time)), place: content.locations.find((l) => l.id === offered.locationId)?.name ?? '' })}
                {focusName(state) && offered.time > state.time ? t('screens.dayView.skipFocus', { hours: offered.time - state.time, focus: focusName(state) }) : ''}
              </span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p className="glass note">
              <strong>
                {t('screens.dayView.nextAt', { title: offered.title, time: formatTime(toDate(calendar, offered.time)) })}
              </strong>{' '}
              {canGoTo(content, state, offered).reasons.join(' · ')}
            </p>
          )
        )}

        {/* What is on today that he could go to: an event that keeps hours, for as much of it as he likes. */}
        {!locked &&
          !over &&
          // An event with a part on today is gone to by its part: it is not offered a second time.
          eventOutings(content, state)
            .filter(({ event }) => !parts.some((now) => now.event.id === event.id))
            .map(({ event, outing }) => (
            <button key={event.id} className="featured" disabled={props.busy} onClick={() => props.onOuting(outing)}>
              <span className="chip outline-light">{t('screens.dayView.eventChip')}</span>
              <span className="featured-title">{event.name}</span>
              <span>
                {outing.window && state.time < outing.window.from
                  ? t('screens.dayView.placeOpens', { place: content.locations.find((l) => l.id === outing.locationId)?.name ?? '', time: formatTime(toDate(calendar, outing.window.from)) })
                  : t('screens.dayView.placeUntil', { place: content.locations.find((l) => l.id === outing.locationId)?.name ?? '', time: formatTime(toDate(calendar, outing.window?.until ?? state.time)) })}
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
              <span className="chip outline-light">{plan.kind === 'birth' ? t('screens.dayView.birth') : plan.kind === 'viewing' ? t('screens.dayView.house') : plan.kind === 'below' ? t('screens.dayView.below') : t('screens.dayView.plan')}</span>
              <span className="featured-title">{plan.kind === 'birth' ? t('screens.dayView.planBirth', { who }) : plan.kind === 'viewing' ? plan.title : plan.kind === 'below' ? t('screens.dayView.planBelow', { who }) : t('screens.dayView.planWith', { title: plan.title, who })}</span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p key={plan.id} className="glass note">
              <strong>
                {plan.kind === 'birth' ? t('screens.dayView.planBirthNote', { who }) : plan.kind === 'viewing' ? t('screens.dayView.planViewingNote', { title: plan.title }) : plan.kind === 'below' ? t('screens.dayView.planBelowNote', { who }) : t('screens.dayView.planWaitingNote', { who, many: plan.companionIds.length > 0, title: plan.title })}
              </strong>{' '}
              {check.reasons.join(' · ')}
            </p>
          )
        })}

        {/* The next scripted part of today's events, while it is still to come or under way. */}
        {parts.map(({ event, part }) => (
          <button key={`${event.id}:${part.id}`} className="featured" disabled={props.busy} onClick={() => props.onEventPart(event.id, part.id)}>
            <span className="chip outline-light">{part.required ? t('screens.dayView.now') : t('screens.dayView.eventChip')}</span>
            <span className="featured-title">
              {t('screens.dayView.eventPart', { event: event.name, part: part.name })}
            </span>
            <span>
              {/* From when to when: it can be joined until its last hour is over. */}
              {String(part.startHour).padStart(2, '0')}:00–{String((part.startHour + part.hours) % content.calendar.hoursPerDay).padStart(2, '0')}:00 · {content.locations.find((l) => l.id === (part.locationId ?? event.locationId))?.name}
            </span>
            <ChevronIcon size={18} />
          </button>
        ))}

        {/* The societies' fair: on its first day it is all there is to do until he has been; after that, it is there to go back to. */}
        {fair && (fairCall || (!locked && !over)) && (
          <button className="featured" disabled={props.busy} onClick={props.onFair}>
            <span className="chip outline-light">{fairCall ? t('screens.dayView.eventChip') : t('screens.dayView.societies')}</span>
            <span className="featured-title">{fairCall ? t('screens.dayView.goTo', { name: fair.name }) : t('screens.dayView.browseSocieties')}</span>
            <span>
              {later
                ? t('screens.dayView.placeOpens', { place: content.locations.find((l) => l.id === fair.locationId)?.name ?? '', time: `${String(fair.startHour ?? 0).padStart(2, '0')}:00` })
                : t('screens.dayView.placeJoined', { place: content.locations.find((l) => l.id === fair.locationId)?.name ?? '', joined: state.societies.length, max: String(content.societies?.maxJoined) })}
            </span>
            <ChevronIcon size={18} />
          </button>
        )}

        {/* Cards for money, where there is a game. */}
        {!locked && !over && content.poker && state.locationId === content.poker.locationId && (
          <button className="featured" disabled={props.busy || !canPlayPoker(content, state).ok} title={canPlayPoker(content, state).reasons.join(' · ') || content.poker.description} onClick={() => onOpen({ kind: 'poker' })}>
            <span className="chip outline-light">{t('screens.dayView.cards')}</span>
            <span className="featured-title">{content.poker.name}</span>
            <span>
              {t('screens.dayView.pokerStakes', { small: content.poker.smallBlind, big: content.poker.bigBlind, cap: content.poker.handCap })}
            </span>
            <ChevronIcon size={18} />
          </button>
        )}

        {/* The way down, where it is, once he has been told of it. */}
        {!locked && !over && content.expedition && state.expedition.invited && state.locationId === content.expedition.entryLocationId && (
          <button className="featured" data-tour="go-below" disabled={props.busy} onClick={() => onOpen({ kind: 'below' })}>
            <span className="chip outline-light">{t('screens.dayView.below')}</span>
            <span className="featured-title">{t('screens.dayView.goDown', { name: content.expedition.name })}</span>
            <span>
              {t('screens.dayView.anchors', { cleared: state.expedition.cleared, total: content.expedition.depths.length })}
            </span>
            <ChevronIcon size={18} />
          </button>
        )}

        {!locked && shift && (
          canGoTo(content, state, underWay('work', shift.job.id, shift.job.locationId)).ok ? (
            <button className="featured" onClick={() => props.onGoTo(underWay('work', shift.job.id, shift.job.locationId))}>
              <span className="chip outline-light">{t('screens.dayView.work')}</span>
              <span className="featured-title">{t('screens.dayView.startShift', { title: shift.job.title })}</span>
              <span>{t('screens.dayView.until', { time: `${String(shift.shift.startHour + shift.shift.hours).padStart(2, '0')}:00` })}</span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p className="glass note">
              <strong>{t('screens.dayView.shiftNow', { title: shift.job.title.toLowerCase() })}</strong> {canGoTo(content, state, underWay('work', shift.job.id, shift.job.locationId)).reasons.join(' · ')}
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
                <span className="chip outline-light">{exam.kind === 'midterm' ? t('screens.dayView.midterm') : t('screens.dayView.final')}</span>
                <span className="featured-title">
                  {t('screens.dayView.sitExam', { kind: exam.kind, number: course.number })}
                </span>
                <span>
                  {t('screens.dayView.untilAt', { time: until, place: content.locations.find((l) => l.id === course.locationId)?.name ?? '' })}
                </span>
                <ChevronIcon size={18} />
              </button>
            ) : (
              <p key={course.id} className="glass note">
                <strong>
                  {t('screens.dayView.examOver', { kind: exam.kind, number: course.number, time: until })}
                </strong>{' '}
                {canGoTo(content, state, sitting).reasons.join(' · ')}
              </p>
            )
          }
          const item = underWay('class', course.id, course.locationId)
          const check = canGoTo(content, state, item)
          return check.ok ? (
            <button key={course.id} className="featured" onClick={() => props.onGoTo(item)}>
              <span className="chip outline-light">{t('screens.dayView.class')}</span>
              <span className="featured-title">
                {t('screens.dayView.attend', { number: course.number, title: course.title })}
              </span>
              <span>
                {t('screens.dayView.until', {
                  time: `${String((meetingNow(content, state, course)?.startHour ?? 0) + (meetingNow(content, state, course)?.hours ?? 0)).padStart(2, '0')}:00`
                })}
              </span>
              <ChevronIcon size={18} />
            </button>
          ) : (
            <p key={course.id} className="glass note">
              <strong>{t('screens.dayView.meetingNow', { name: course.number })}</strong> {check.reasons.join(' · ')}
            </p>
          )
        })}

        {!locked &&
          meetings.map((society) => {
            const item = underWay('society', society.id, society.locationId)
            const check = canGoTo(content, state, item)
            return check.ok ? (
              <button key={society.id} className="featured" disabled={props.busy} onClick={() => props.onGoTo(item)}>
                <span className="chip outline-light">{t('screens.dayView.society')}</span>
                <span className="featured-title">{t('screens.dayView.goTo', { name: society.name })}</span>
                <span>
                  {t('screens.dayView.untilAt', {
                    time: `${String(society.startHour + (content.societies?.hours ?? 1)).padStart(2, '0')}:00`,
                    place: content.locations.find((l) => l.id === society.locationId)?.name ?? ''
                  })}
                </span>
                <ChevronIcon size={18} />
              </button>
            ) : (
              <p key={society.id} className="glass note">
                <strong>{t('screens.dayView.meetingNow', { name: society.name })}</strong> {check.reasons.join(' · ')}
              </p>
            )
          })}

        {!locked && <ActivityList content={content} state={state} partnerId={partnerId} onPick={onActivity} />}

        {(!locked || props.touring) && !over && mine.length > 0 && (
          <div className="stat-menu" data-tour="study">
            <button
              className={studying !== null ? 'featured open' : 'featured'}
              aria-expanded={studying !== null}
              disabled={props.busy}
              onClick={() => setStudying(studying === null ? '' : null)}
            >
              <span className="chip outline-light">{t('screens.dayView.study')}</span>
              <span className="featured-title">{studied ? t('screens.dayView.studyFor', { number: studied.number }) : t('screens.dayView.studyForAClass')}</span>
              <span>{studying === null ? t('screens.dayView.courses', { n: mine.length }) : t('screens.dayView.close')}</span>
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
                      {t('screens.dayView.coursePoints', { number: course.number, points: Math.round(coursePoints(state, course.id)), total: content.coursework?.grading.points ?? '' })}
                    </span>
                    <strong>{course.title}</strong>
                    {skillFor(content, course) && (
                      <span className="hint">
                        {skillProgress(state, skillFor(content, course)!).has ? t('screens.dayView.taughtYou', { skill: skillFor(content, course)!.name }) : t('screens.dayView.teaches', { skill: skillFor(content, course)!.name, at: skillFor(content, course)!.at })}
                      </span>
                    )}
                    <span className="hint">
                      {grades?.final ? t('screens.dayView.gradeFinal', { letter: grades.final.letter }) : grades?.midterm ? t('screens.dayView.gradeMidterm', { letter: grades.midterm.letter }) : t('screens.dayView.notGraded')}
                    </span>
                  </button>
                )
              })}
            {studied && (
              <button className="stat-option glass" disabled={props.busy} onClick={() => setStudying('')}>
                <span className="caps">{t('screens.dayView.back')}</span>
                <strong>{t('screens.dayView.anotherCourse')}</strong>
                <span className="hint">
                  {t('screens.dayView.soFar', { points: Math.round(coursePoints(state, studied.id)), total: content.coursework?.grading.points ?? '' })}
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
                    <span className="caps">{t('screens.dayView.plusPoints', { points: studyPoints(content, session) })}</span>
                    <strong>{place.name}</strong>
                    <span className="hint">
                      {t('screens.dayView.studyHours', { hours: session.hours, where: place.own ? 'own' : place.roomOf ? 'with' : 'none', name: place.roomOf?.name.split(' ')[0] })}
                    </span>
                  </button>
                )
              })}
          </div>
        )}

        {(!locked || props.touring) && !over && (
          <div className="stat-menu" data-tour="stats">
            <button className={showStats ? 'featured open' : 'featured'} aria-expanded={showStats} disabled={props.busy} onClick={() => setShowStats(!showStats)}>
              <span className="chip outline-light">{t('screens.dayView.stats')}</span>
              <span className="featured-title">{t('screens.dayView.workOnYourself')}</span>
              <span>{showStats ? t('screens.dayView.close') : t('screens.dayView.sixWays')}</span>
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
                    {t('screens.dayView.drillHint', {
                      place: suggestion.location.name,
                      hours: DRILL_HOURS,
                      banked: trainingToward(state, suggestion.stat).banked,
                      needed: trainingToward(state, suggestion.stat).needed,
                      next: (player.stats[suggestion.stat] ?? 0) + 1
                    })}
                  </span>
                </button>
              ))}
          </div>
        )}

        {!over && (
          <button className="featured slim" data-tour="end-day" disabled={props.busy || locked} onClick={props.onEndDay}>
            <span className="featured-title">{t('screens.dayView.endDay')}</span>
            {/* Orientation has to be sat through first: the day cannot be ended while a part of it is left. */}
            <span>{induction ? t('screens.dayView.onceOrientation') : summoned ? t('screens.dayView.onceBeen') : t('screens.dayView.until', { time: `0${SLEEP_HOURS.until}:00` })}</span>
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
            aria-label={t('screens.dayView.describeLabel')}
            placeholder={
              induction
                ? t('screens.dayView.orientationFirst')
                : summoned
                  ? t('screens.dayView.comesFirst', { title: summoned.title })
                : props.busy
                  ? t('screens.dayView.workingItOut')
                : t('screens.dayView.describePlaceholder')
            }
          />
          <button type="submit" disabled={props.busy || over || !idea.trim() || locked} aria-label={t('screens.dayView.doThis')} className="danger icon">
            <ChevronIcon size={18} />
          </button>
        </form>
      </div>

      <NavTiles content={content} state={state} onOpen={onOpen} home />

      {/* The second half of the first look round: the day's choices. */}
      {props.touring && !over && guide && (
        <Tour
          guide={guide}
          steps={dayTour}
          onDone={() => {
            setStudying(null)
            setShowStats(false)
            props.onToured()
          }}
        />
      )}

    </main>
  )
}
