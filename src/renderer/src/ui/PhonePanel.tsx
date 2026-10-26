import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  addNote,
  answerInvite,
  canGoToInvite,
  clearUntil,
  buy,
  canBuy,
  isOrientationDay,
  describeIntimacy,
  addEventGoers,
  cancelAppointment,
  plansWith,
  applyForJob,
  attendees,
  bondOf,
  bossOf,
  canApply,
  currentJob,
  excuseShift,
  hoursPerWeek,
  hasSkill,
  trustOf,
  skillGranting,
  periodDay,
  onBirthControl,
  payBonus,
  npcAsCharacter,
  quitJob,
  weekAgainst,
  childrenOf,
  courierThread,
  daysUntilDue,
  describeAge,
  bondName,
  describeBond,
  describeChildren,
  describeStudies,
  describeWhen,
  FACT_GROUP_NAMES,
  FACT_GROUPS,
  factsOf,
  FEED_PAGE,
  feedOf,
  firstNames,
  handleOf,
  hasContact,
  hasMet,
  inviteStands,
  locationOf,
  inClass,
  markRead,
  addGroupNote,
  markGroupRead,
  unreadInGroup,
  pregnancyOf,
  answerHousingOffer,
  canTakeHouse,
  pregnancyStage,
  revealedIds,
  revealFacts,
  stageFor,
  statusOf,
  tieLevel,
  tieOf,
  toDate,
  toggleLike,
  unreadNotes,
  unreadPosts,
  markFeedSeen,
  viewImage,
  weatherOn,
  canJoinSociety,
  knownRelation,
  joinSociety,
  leaveSociety
} from '../../../shared/game'
import { Button } from './Button'
import { useModelName } from '../modelName'
import type { PhoneApp } from './panels'
import { Portrait } from './Portrait'
import { MEMORY_LEVEL_LABELS, METERS, STATS, type ContentPack, type GameState, type Job, type LoveInterest, type SkillGrant, type Stat } from '../../../shared/model'
import { errorMessage } from '../errors'
import { Overlay } from './Dialog'
import { useConfirm } from './Confirm'
import { BackIcon, BatteryIcon, CalendarIcon, ChatIcon, ChevronIcon, ClockIcon, CoinIcon, HeartIcon, PregnantIcon, SignalIcon, TagIcon, WeatherIcon, WifiIcon } from './icons'
import crest from '../../../assets/phone/crest.png'
import star from '../../../assets/phone/star.png'
import chatsArt from '../../../assets/phone/apps/chats.png'
import friendsArt from '../../../assets/phone/apps/friends.png'
import updatesArt from '../../../assets/phone/apps/updates.png'
import jobsArt from '../../../assets/phone/apps/jobs.png'
import societiesArt from '../../../assets/phone/apps/societies.png'
import shopArt from '../../../assets/phone/apps/shop.png'
import { Stalls } from './MarketView'
import { BackButton } from './BackButton'
import { useBack } from '../mouseBack'
import { EmojiPicker } from './EmojiPicker'
import { t, type MessageKey } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  /** Applied to the newest state, since a reply can arrive after other things have changed. */
  onChange: (update: (state: GameState) => GameState) => void
  onClose: () => void
  /** Who to open on, in Friends. Left out, the phone opens on his DMs. */
  initialId?: string
  /** The chat to open on in his DMs: a love interest's id, or a group chat's as `group:<id>`. */
  initialChat?: string
  /** The app to open on, and to turn to whenever it changes: as a tour of the phone does. */
  app?: PhoneApp
  /** Goes straight to the plan an invitation is for, accepting it first if it is still to be answered. Left out when he cannot leave: in a scene. */
  onGoToInvite?: (loveInterestId: string, noteIndex: number) => void
  /** Whether something offered to him in a message can be taken up now: not in the middle of a scene. */
  canAct?: boolean
  /** Why today's posts could not be made, when they could not: said at the top of the feed. */
  feedError?: string
}

/**
 * The phone's apps, down its left edge. A new one is a line here and a branch where the
 * apps are drawn.
 */
const APPS = [
  { id: 'chats', label: 'panels.phone.app.chats', title: 'panels.phone.app.chatsTitle', art: chatsArt },
  { id: 'friends', label: 'panels.phone.app.friends', title: 'panels.phone.app.friendsTitle', art: friendsArt },
  { id: 'updates', label: 'panels.phone.app.updates', title: 'panels.phone.app.updatesTitle', art: updatesArt },
  { id: 'jobs', label: 'panels.phone.app.jobs', title: 'panels.phone.app.jobsTitle', art: jobsArt },
  { id: 'societies', label: 'panels.phone.app.societies', title: 'panels.phone.app.societiesTitle', art: societiesArt },
  { id: 'shop', label: 'panels.phone.app.shop', title: 'panels.phone.app.shopTitle', art: shopArt }
] as const satisfies readonly { id: string; label: MessageKey; title: MessageKey; art: string }[]
type App = (typeof APPS)[number]['id']

/** An ability's name as the phone writes it, in lower case. */
const statName = (stat: Stat) => t(`panels.common.stat.${stat}` as const)

// How an answer to something offered in a message is said on its chip.
const ANSWERS: Record<'accepted' | 'declined' | 'lapsed' | 'cancelled', MessageKey> = { accepted: 'panels.phone.answer.accepted', declined: 'panels.phone.answer.declined', lapsed: 'panels.phone.answer.lapsed', cancelled: 'panels.phone.answer.cancelled' }

/** Everyone a conversation can be had with: the love interests, and NPCs, who are written to as their boss's or anyone's would be. */
function messageable(content: ContentPack): LoveInterest[] {
  return [...content.loveInterests, ...content.npcs.map(npcAsCharacter)]
}

/** Where she is right now, with a dot that is lit when she can be found. */
function Presence({ content, state, li }: { content: ContentPack; state: GameState; li: LoveInterest }) {
  const where = content.locations.find((l) => l.id === locationOf(content, state, li))
  return (
    <span className={where ? 'presence' : 'presence away'}>
      <i />
      {where ? t(inClass(content, state, li) ? 'panels.phone.inClassAt' : 'panels.phone.at', { place: where.name }) : t('panels.phone.whereaboutsUnknown')}
    </span>
  )
}

/**
 * The player's phone: his Bloomr DMs for messages, Friends to keep track of everyone he is
 * getting to know, the Bloomr feed for what they post, and Jobs for work.
 */
export function PhonePanel({ content, state, onChange, onClose, initialId, initialChat, app: shown, onGoToInvite, canAct = true, feedError }: Props) {
  // Everyone who can be in his DMs: the love interests, and any NPC he has worked for.
  const people = messageable(content)
  const [app, setApp] = useState<App>(shown ?? (initialId === undefined ? 'chats' : 'friends'))
  useEffect(() => {
    if (shown) setApp(shown)
  }, [shown])
  // Looking at the feed is seeing what is on it: its count is cleared while it is open, and whatever goes up meanwhile with it.
  const newPosts = unreadPosts(state)
  useEffect(() => {
    if (app === 'updates' && newPosts > 0) onChange(markFeedSeen)
  }, [app, newPosts, onChange])
  // Who the open chat is with, and whose page is open in Friends.
  const [chatId, setChatId] = useState<string | undefined>(() => initialChat ?? people.find((li) => unreadNotes(state, li.id) > 0)?.id)
  // Only someone who has given him her Bloomr can be messaged.
  const canMessage = (id: string) => hasContact(state, id)
  const [friendId, setFriendId] = useState<string | undefined>(initialId)
  useBack(app === 'friends' && friendId !== undefined ? () => setFriendId(undefined) : undefined, 1)
  const message = (id: string) => {
    setChatId(id)
    setApp('chats')
  }
  const date = toDate(content.calendar, state.time)
  const weather = weatherOn(content, state)
  const clock = `${String(date.hour).padStart(2, '0')}:00`

  return (
    <Overlay onClose={onClose} sounds={['phoneOn', 'phoneOff']}>
      <div className="phone">
        <div className="phone-glass">
        <div className="phone-status" aria-hidden="true">
          <span className="phone-status-marks">
            <SignalIcon size={16} />
            <WifiIcon size={16} />
            <BatteryIcon size={14} />
          </span>
        </div>
        <nav className="phone-rail" role="tablist" aria-orientation="vertical">
          <img className="phone-crest" src={crest} alt="" draggable={false} />
          {APPS.map(({ id, label, art }) => (
            <button
              key={id}
              role="tab"
              aria-selected={app === id}
              className={app === id ? 'phone-tab selected' : 'phone-tab'}
              data-tour={`phone-${id}`}
              // Nothing is bought in the middle of a scene.
              disabled={id === 'shop' && !canAct}
              title={id === 'shop' && !canAct ? t('panels.phone.disabledInScene') : undefined}
              onClick={() => setApp(id)}
            >
              <img className="app-icon" src={art} alt="" draggable={false} />
              {t(label)}
              {id === 'chats' && unreadNotes(state) > 0 && <span className="badge">{unreadNotes(state)}</span>}
              {id === 'updates' && unreadPosts(state) > 0 && <span className="badge">{unreadPosts(state)}</span>}
            </button>
          ))}
          <BackButton className="phone-back" label={t('panels.phone.putAway')} onClick={onClose} />
        </nav>

        <div className="phone-main">
        <header className="phone-head">
          <h1 className="phone-title">
            <img src={star} alt="" draggable={false} />
            {t(APPS.find((one) => one.id === app)!.title)}
          </h1>
          <span className="phone-money" title={t('panels.phone.money')}>
            <CoinIcon size={20} />${state.player.money}
          </span>
          <span className="phone-date" title={weather?.name}>
            <CalendarIcon size={20} />
            <span>
              {t('panels.phone.date', { weekday: date.weekday, day: date.day, month: date.month.name })}
              <strong>{clock}</strong>
            </span>
            <WeatherIcon kind={weather?.icon} image={weather?.iconImage} size={26} />
          </span>
        </header>

        <div className={`phone-screen ${app}`}>
          {app === 'chats' && <Chats content={content} state={state} onChange={onChange} selectedId={chatId} onSelect={setChatId} onGoToInvite={onGoToInvite} canAct={canAct} />}
          {app === 'friends' && <Friends content={content} state={state} selectedId={friendId} onSelect={setFriendId} onMessage={message} canMessage={canMessage} />}
          {app === 'updates' && <Updates content={content} state={state} onChange={onChange} onMessage={message} canMessage={canMessage} error={feedError} />}
          {app === 'jobs' && <Jobs content={content} state={state} onChange={onChange} onMessage={message} />}
          {app === 'societies' && <Societies content={content} state={state} onChange={onChange} />}
          {app === 'shop' && <Market content={content} state={state} onChange={onChange} />}
        </div>
        </div>
        </div>
      </div>
    </Overlay>
  )
}

interface ChatsProps {
  content: ContentPack
  state: GameState
  onChange: (update: (state: GameState) => GameState) => void
  selectedId: string | undefined
  onSelect: (id: string) => void
  onGoToInvite?: (loveInterestId: string, noteIndex: number) => void
  canAct: boolean
}

/** His Bloomr DMs: every conversation on the left, the open one on the right. */
function Chats({ content, state, onChange, selectedId, onSelect, onGoToInvite, canAct }: ChatsProps) {
  const today = toDate(content.calendar, state.time).dayIndex
  const stamp = (time: number) => {
    if (time === state.time) return t('panels.phone.now')
    const date = toDate(content.calendar, time)
    return date.dayIndex === today ? `${String(date.hour).padStart(2, '0')}:00` : t('panels.phone.stampDay', { day: date.day, month: date.month.name.slice(0, 3) })
  }
  // Only those who have given him their Bloomr. Whoever wrote or was written to last comes first; those never written to, after.
  const last = (li: LoveInterest) => courierThread(state, li.id).at(-1)
  const listed = messageable(content).filter((li) => hasContact(state, li.id)).sort((a, b) => (last(b)?.time ?? -1) - (last(a)?.time ?? -1))
  const selected = listed.find((li) => li.id === selectedId)
  // His group chats, above the rest: each with those in it, newest first.
  const groups = Object.entries(state.groupChats).sort(([, a], [, b]) => (b.notes.at(-1)?.time ?? -1) - (a.notes.at(-1)?.time ?? -1))
  const group = groups.find(([id]) => `${GROUP}${id}` === selectedId)
  const nameOf = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id

  return (
    <>
      <div className="chat-list">
        <div className="chat-rows">
          {listed.length === 0 && groups.length === 0 && <p className="hint">{t('panels.phone.noContacts')}</p>}
          {groups.map(([id, chat]) => {
            const note = chat.notes.at(-1)
            const unread = unreadInGroup(state, id)
            const members = chat.memberIds.flatMap((one) => content.loveInterests.find((li) => li.id === one) ?? [])
            return (
              <button key={id} className={`${GROUP}${id}` === selectedId ? 'chat-row group selected' : 'chat-row group'} onClick={() => onSelect(`${GROUP}${id}`)}>
                <span className="avatar group-avatar">
                  {members.slice(0, 2).map((li) => (
                    <Portrait key={li.id} who={li} size={38} />
                  ))}
                </span>
                <span className="chat-row-text">
                  <strong>{chat.name}</strong>
                  <span className={unread > 0 ? 'preview unread' : 'preview'}>{note ? t('panels.phone.groupPreview', { name: note.from === 'player' ? t('panels.phone.you') : nameOf(note.speakerId ?? ''), text: note.text }) : t('panels.phone.sayHello')}</span>
                </span>
                {unread > 0 ? <span className="badge">{unread}</span> : note && <span className="caps stamp">{stamp(note.time)}</span>}
              </button>
            )
          })}
          {listed.map((li) => {
            const note = last(li)
            const unread = unreadNotes(state, li.id)
            return (
              <button key={li.id} className={li.id === selectedId ? 'chat-row selected' : 'chat-row'} onClick={() => onSelect(li.id)}>
                <Portrait who={li} size={56} className="avatar" />
                <span className="chat-row-text">
                  <strong>{li.name}</strong>
                  <span className={unread > 0 ? 'preview unread' : 'preview'}>
                    {note ? (note.from === 'player' ? t('panels.phone.previewYou', { text: note.text }) : note.text) : t('panels.phone.sayHello')}
                  </span>
                </span>
                {unread > 0 ? <span className="badge">{unread}</span> : note && <span className="caps stamp">{stamp(note.time)}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="chat-thread">
        {group ? (
          <>
            <div className="chat-head">
              <span className="avatar group-avatar">
                {group[1].memberIds.flatMap((one) => content.loveInterests.find((li) => li.id === one) ?? []).slice(0, 2).map((li) => (
                  <Portrait key={li.id} who={li} size={34} />
                ))}
              </span>
              <div>
                <strong>{group[1].name}</strong>
                <span className="handle">{t('panels.phone.groupMembers', { names: group[1].memberIds.map(nameOf).join(t('panels.phone.and')) })}</span>
              </div>
            </div>
            <GroupThread key={group[0]} content={content} state={state} chatId={group[0]} onChange={onChange} />
          </>
        ) : selected ? (
          <>
            <div className="chat-head">
              <Portrait who={selected} size={48} className="avatar" />
              <div>
                <strong>{selected.name}</strong>
                <span className="handle">{handleOf(selected)}</span>
              </div>
              <Presence content={content} state={state} li={selected} />
            </div>
            <Thread key={selected.id} content={content} state={state} li={selected} onChange={onChange} onGoToInvite={onGoToInvite} canAct={canAct} />
          </>
        ) : (
          <p className="hint phone-empty">{listed.length === 0 ? t('panels.phone.noConversations') : t('panels.phone.pickConversation')}</p>
        )}
      </div>
    </>
  )
}

interface ThreadProps {
  content: ContentPack
  state: GameState
  li: LoveInterest
  onChange: (update: (state: GameState) => GameState) => void
  onGoToInvite?: (loveInterestId: string, noteIndex: number) => void
  canAct: boolean
}

/** The messages that have gone between the player and one love interest. */
function Thread({ content, state, li, onChange, onGoToInvite, canAct }: ThreadProps) {
  const { model, look } = useModelName()
  const [draft, setDraft] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [notice, setNotice] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const thread = courierThread(state, li.id)
  const firstName = li.name.split(' ')[0]
  const id = li.id

  // Opening a thread reads it, and keeps its newest message in view.
  useEffect(() => {
    if (unreadNotes(state, id) > 0) onChange((current) => markRead(current, id))
    end.current?.scrollIntoView({ block: 'end' })
  }, [id, thread.length, waiting, state, onChange])

  // Where he is writing, so that an emoji goes in where the cursor is and he can go on typing after it.
  const compose = useRef<HTMLInputElement>(null)
  function addEmoji(emoji: string) {
    const box = compose.current
    const at = box?.selectionStart ?? draft.length
    const until = box?.selectionEnd ?? at
    const next = (draft.slice(0, at) + emoji + draft.slice(until)).slice(0, 400)
    setDraft(next)
    // Once it has been drawn, the cursor is put after what was added.
    requestAnimationFrame(() => {
      box?.focus()
      box?.setSelectionRange(at + emoji.length, at + emoji.length)
    })
  }

  // The plans with her still to come: each can be called off here, which is a message to her.
  const plans = plansWith(state, id)

  function send(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || waiting) return
    setDraft('')
    void say((current) => addNote(current, id, { from: 'player', text, read: true }))
  }

  /** Says something to her, by whatever it does to the game, and waits for her answer. */
  async function say(apply: (state: GameState) => GameState) {
    const sent = apply(state)
    onChange(apply)
    setNotice('')
    setWaiting(true)
    try {
      const reply = await window.api.courier({ state: sent, loveInterestId: id, invite: false })
      onChange((current) => {
        const answered = revealFacts(content, addNote(current, id, { from: 'them', text: reply.text, proposal: reply.proposal, read: false }), id, reply.revealed ?? [])
        // Whoever said she would be at an event is put down for it.
        const going = (reply.attending ?? []).reduce((next, said) => addEventGoers(next, said.eventId, said.ids), answered)
        // His boss has taken note that he will miss a shift.
        return reply.excused ? excuseShift(going, reply.excused) : going
      })
    } catch (error) {
      setNotice(t('panels.phone.noAnswer', { error: errorMessage(error) }))
    } finally {
      setWaiting(false)
    }
  }

  return (
    <>
      <div className="chat-messages">
        {thread.length === 0 && <p className="hint center">{t('panels.phone.noMessages', { name: firstName })}</p>}
        {thread.map((note, i) => {
          const sentOn = toDate(content.calendar, note.time)
          const before = i > 0 ? toDate(content.calendar, thread[i - 1].time) : undefined
          const plan = note.proposal
          // Going now skips the hours until it starts: not offered when that would carry him past a class, a shift or another plan of his.
          const goNow = onGoToInvite !== undefined && plan !== undefined && canGoToInvite(content, state, note) && clearUntil(content, state, plan.time)
          return (
            <div key={i} className={note.from === 'player' ? 'message mine' : 'message'}>
              {/* The time is shown once for each run of messages sent in the same hour. */}
              {before?.dayIndex === sentOn.dayIndex && before.hour === sentOn.hour ? null : (
                <span className="caps stamp">
                  {t('panels.phone.messageStamp', { weekday: sentOn.weekday, day: sentOn.day, month: sentOn.month.name.slice(0, 3), time: `${String(sentOn.hour).padStart(2, '0')}:00` })}
                </span>
              )}
              <p className="bubble">{note.text}</p>
              {/* A house offered to him: taken or left here, and one that was left can still be taken. */}
              {note.offer === 'housing' && content.housing && (
                <div className="proposal">
                  <div>
                    <strong>{t('panels.phone.housingOffer', { name: content.housing.name })}</strong>
                    <span>
                      {t('panels.phone.housingTerms', { rent: content.housing.rent })}
                    </span>
                  </div>
                  {canTakeHouse(content, state) ? (
                    <>
                      <button disabled={!canAct} title={canAct ? undefined : t('panels.phone.busy')} onClick={() => onChange((s) => answerHousingOffer(content, s, i, true))}>
                        {note.answer === 'declined' ? t('panels.phone.takeAfterAll') : t('panels.phone.accept')}
                      </button>
                      {!note.answer && (
                        <button className="secondary" onClick={() => onChange((s) => answerHousingOffer(content, s, i, false))}>
                          {t('panels.phone.decline')}
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="chip">{state.housing.status === 'evicted' ? t('panels.phone.takenBack') : t(ANSWERS[note.answer ?? 'accepted'])}</span>
                  )}
                </div>
              )}
              {plan && (
                <div className="proposal">
                  <div>
                    <strong>{t('panels.phone.planWith', { title: plan.title, names: firstNames(content, attendees(plan)) })}</strong>
                    <span>
                      {describeWhen(content, plan.time)} · {content.locations.find((l) => l.id === plan.locationId)?.name}
                    </span>
                  </div>
                  {/* One for today can be gone to at once: the hours until it starts are skipped, and it begins. */}
                  {goNow && <button onClick={() => onGoToInvite?.(id, i)}>{t('panels.phone.goNow')}</button>}
                  {note.answer ? (
                    <span className="chip">{t(ANSWERS[note.answer])}</span>
                  ) : inviteStands(content, state, plan) ? (
                    <>
                      <button className={goNow ? 'secondary' : undefined} onClick={() => onChange((s) => answerInvite(content, s, id, i, true))}>
                        {goNow ? t('panels.phone.later') : t('panels.phone.accept')}
                      </button>
                      <button className="secondary" onClick={() => onChange((s) => answerInvite(content, s, id, i, false))}>
                        {t('panels.phone.decline')}
                      </button>
                    </>
                  ) : (
                    <span className="chip">{t('panels.phone.noLongerPossible')}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {waiting && (
          <div className="message">
            <p className="bubble typing" aria-label={t('panels.phone.typing', { name: firstName })}>
              <i />
              <i />
              <i />
            </p>
          </div>
        )}
        <div ref={end} />
      </div>

      {notice && <p className="notice">{notice}</p>}
      {plans.map((plan) => (
        <div key={plan.id} className="proposal upcoming">
          <div>
            <strong>{t('panels.phone.planWith', { title: plan.title, names: firstNames(content, attendees(plan)) })}</strong>
            <span>
              {describeWhen(content, plan.time)} · {content.locations.find((l) => l.id === plan.locationId)?.name}
            </span>
          </div>
          {/* Calling it off is a message: it comes off the calendar, and nothing is held against him for missing it. */}
          <button className="secondary" disabled={waiting} onClick={() => void say((current) => cancelAppointment(content, current, plan.id))}>
            {t('panels.phone.cancelPlan')}
          </button>
        </div>
      ))}
      <form className="chat-compose" onSubmit={send}>
        <EmojiPicker onPick={addEmoji} />
        <input
          ref={compose}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={400}
          aria-label={t('panels.phone.messageTo', { name: firstName })}
          placeholder={t('panels.phone.messagePlaceholder', { name: firstName })}
          autoFocus
        />
        <button type="submit" disabled={!draft.trim() || waiting} aria-label={t('panels.phone.send')} className="icon" title={model || undefined} onMouseEnter={look}>
          <ChevronIcon size={18} />
        </button>
      </form>
    </>
  )
}

// How a group chat's id is told from a love interest's, where either can be the open chat.
const GROUP = 'group:'

/** A group chat: what he and they have said in it, each line with who said it, and his answer to the rest. */
function GroupThread({ content, state, chatId, onChange }: { content: ContentPack; state: GameState; chatId: string; onChange: (update: (state: GameState) => GameState) => void }) {
  const { model, look } = useModelName()
  const [draft, setDraft] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [notice, setNotice] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const chat = state.groupChats[chatId]
  const notes = chat?.notes ?? []
  const who = (id: string | undefined) => content.loveInterests.find((li) => li.id === id)

  // Opening it reads it, and keeps its newest message in view.
  useEffect(() => {
    if (unreadInGroup(state, chatId) > 0) onChange((current) => markGroupRead(current, chatId))
    end.current?.scrollIntoView({ block: 'end' })
  }, [chatId, notes.length, waiting, state, onChange])

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || waiting || !chat) return
    setDraft('')
    const sent = addGroupNote(state, chatId, { from: 'player', text, read: true })
    onChange((current) => addGroupNote(current, chatId, { from: 'player', text, read: true }))
    setNotice('')
    setWaiting(true)
    try {
      const history = (sent.groupChats[chatId]?.notes ?? []).map((note) => ({ speaker: note.from === 'player' ? state.player.name : (who(note.speakerId)?.name.split(' ')[0] ?? t('panels.phone.someone')), text: note.text }))
      const { lines } = await window.api.momentLines({ state: sent, ids: chat.memberIds, moment: 'group', history })
      onChange((current) => lines.reduce((next, line) => addGroupNote(next, chatId, { from: 'them', speakerId: line.speakerId, text: line.text, read: false }), current))
    } catch (error) {
      setNotice(t('panels.phone.noAnswer', { error: errorMessage(error) }))
    } finally {
      setWaiting(false)
    }
  }

  return (
    <>
      <div className="chat-messages">
        {notes.map((note, i) => {
          const speaker = note.from === 'them' ? who(note.speakerId) : undefined
          return (
            <div key={i} className={note.from === 'player' ? 'message mine' : 'message from-group'}>
              {speaker && (
                <span className="group-speaker">
                  <Portrait who={speaker} size={26} />
                  {speaker.name.split(' ')[0]}
                </span>
              )}
              <p className="bubble">{note.text}</p>
            </div>
          )
        })}
        {waiting && (
          <div className="message">
            <p className="bubble typing" aria-label={t('panels.phone.someoneTyping')}>
              <i />
              <i />
              <i />
            </p>
          </div>
        )}
        <div ref={end} />
      </div>
      {notice && <p className="notice">{notice}</p>}
      <form className="chat-compose" onSubmit={send}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={400} aria-label={t('panels.phone.messageTo', { name: chat?.name ?? t('panels.phone.theGroup') })} placeholder={t('panels.phone.messagePlaceholder', { name: chat?.name ?? t('panels.phone.theGroup') })} autoFocus />
        <button type="submit" disabled={!draft.trim() || waiting} aria-label={t('panels.phone.send')} className="icon" title={model || undefined} onMouseEnter={look}>
          <ChevronIcon size={18} />
        </button>
      </form>
    </>
  )
}

interface FriendsProps {
  content: ContentPack
  state: GameState
  selectedId: string | undefined
  onSelect: (id: string | undefined) => void
  onMessage: (id: string) => void
  canMessage: (id: string) => boolean
}

/** Friends: a card for everyone the player has met, and a page on each of them behind it. */
function Friends({ content, state, selectedId, onSelect, onMessage, canMessage }: FriendsProps) {
  const affection = (li: LoveInterest) => state.relationships[li.id]?.affection ?? 0
  // Closest first; among equals, as the content lists them.
  const listed = content.loveInterests.filter((li) => hasMet(state, li.id)).sort((a, b) => affection(b) - affection(a))
  const selected = listed.find((li) => li.id === selectedId)

  if (selected) {
    return (
      <div className="friend-page">
        <div className="friend-page-head">
          <button className="quiet" onClick={() => onSelect(undefined)}>
            <BackIcon size={18} />
            {t('panels.phone.allFriends')}
          </button>
          {canMessage(selected.id) ? (
            <button className="secondary" onClick={() => onMessage(selected.id)}>
              <ChatIcon size={18} />
              {t('panels.phone.message')}
            </button>
          ) : (
            <span className="hint">{t('panels.phone.noBloomr')}</span>
          )}
        </div>
        <div className="friend-banner">
          <Portrait who={selected} size={88} className="avatar" />
          <div>
            <h1>{selected.name}</h1>
            <span className="handle">{handleOf(selected)}</span>
            <span className="caps">{describeStudies(selected)}</span>
            <Presence content={content} state={state} li={selected} />
          </div>
        </div>
        <About content={content} state={state} li={selected} />
      </div>
    )
  }

  return (
    <div className="friend-list">
      <span className="caps">{t('panels.phone.contacts', { n: listed.length })}</span>
      {listed.length === 0 && <p className="hint phone-empty">{t('panels.phone.noFriends')}</p>}
      <div className="friend-grid">
        {listed.map((li) => {
          const stage = stageFor(content.relationships, affection(li))
          const bond = bondOf(state, li.id)
          // Anything agreed between them is said in place of the stage, and stands out.
          const standing = bond ? (statusOf(content, bond)?.name ?? stage.name) : stage.name
          const close = bond !== undefined || stage.id === content.relationships.stages.at(-1)?.id
          return (
            <div key={li.id} className="friend-card">
              <button className="friend-open" onClick={() => onSelect(li.id)}>
                <Portrait who={li} size={96} className="avatar" />
                <span className="friend-card-text">
                  <strong>{li.name}</strong>
                  <span className="handle">{handleOf(li)}</span>
                  <span className="caps">{describeStudies(li)}</span>
                  <Presence content={content} state={state} li={li} />
                </span>
                <span className={close ? 'chip madder' : 'chip'}>{standing}</span>
              </button>
              {/* Lit when she is with child, and faint when she is not. */}
              <span
                className={pregnancyOf(state, li.id) ? 'friend-pregnant on' : 'friend-pregnant'}
                role="img"
                aria-label={pregnancyOf(state, li.id) ? t('panels.phone.isPregnant', { name: li.name }) : t('panels.phone.isNotPregnant', { name: li.name })}
                title={pregnancyOf(state, li.id) ? t('panels.phone.isPregnant', { name: li.name.split(' ')[0] }) : t('panels.phone.notPregnant')}
              >
                <PregnantIcon size={22} />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface UpdatesProps {
  content: ContentPack
  state: GameState
  onChange: (update: (state: GameState) => GameState) => void
  onMessage: (id: string) => void
  canMessage: (id: string) => boolean
  error?: string
}

/** The feed: Bloomr, the selfies everyone has been posting, newest first, a few at a time. */
function Updates({ content, state, onChange, onMessage, canMessage, error }: UpdatesProps) {
  const posts = feedOf(state)
  // Only a page of posts is drawn; reaching the bottom brings in the next.
  const [shown, setShown] = useState(FEED_PAGE)
  const list = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLDivElement>(null)
  const rest = posts.length > shown
  useEffect(() => {
    if (!rest || !more.current) return
    const watcher = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setShown((count) => count + FEED_PAGE), {
      root: list.current,
      rootMargin: '200px'
    })
    watcher.observe(more.current)
    return () => watcher.disconnect()
  }, [rest, shown])
  const everyone = [...content.loveInterests, ...content.npcs]
  return (
    <div className="feed" ref={list}>
      {error && <p className="notice feed-error">{error}</p>}
      {posts.length === 0 && (
        <p className="hint phone-empty">{t('panels.phone.noPosts')}</p>
      )}
      {posts.slice(0, shown).map((post) => {
        const author = content.loveInterests.find((li) => li.id === post.authorId)
        if (!author) return null
        const friend = everyone.find((other) => other.id === post.withId)
        return (
          <article key={post.id} className="post">
            <header>
              <Portrait who={author} size={44} className="avatar" />
              <div>
                <strong>{author.name}</strong>
                <span className="handle">
                  {handleOf(author)} · {describeAge(content, { time: post.time }, state.time)}
                  {/* Whoever is in the picture with her is tagged as the app would: her name and her handle. */}
                  {friend && t('panels.phone.postWith', { name: friend.name.split(' ')[0], handle: handleOf(friend) })}
                </span>
              </div>
            </header>
            {post.image && <img src={`content://pack/${post.image}`} alt="" loading="lazy" />}
            <p>{post.text}</p>
            <footer>
              <button
                className={post.liked ? 'quiet like liked' : 'quiet like'}
                aria-pressed={post.liked}
                onClick={() => onChange((current) => toggleLike(content, current, post.id))}
              >
                <HeartIcon size={20} />
                {post.liked ? t('panels.phone.liked') : t('panels.phone.like')}
              </button>
              {canMessage(author.id) && (
                <button className="quiet" onClick={() => onMessage(author.id)}>
                  <ChatIcon size={20} />
                  {t('panels.phone.message')}
                </button>
              )}
            </footer>
          </article>
        )
      })}
      {rest && <div ref={more} className="feed-more" aria-hidden="true" />}
    </div>
  )
}

/** The market on his phone: every stall's gifts, ordered from wherever he is and carried at once. */
function Market({ content, state, onChange }: { content: ContentPack; state: GameState; onChange: (update: (state: GameState) => GameState) => void }) {
  return (
    <Stalls
      content={content}
      state={state}
      stalls={content.stalls}
      byPhone
      // There is no shopping on orientation day.
      closed={isOrientationDay(content, state) ? <p className="notice">{t('panels.phone.orientationClosed')}</p> : undefined}
      onBuy={(itemId) => onChange((current) => (canBuy(content, current, itemId, true).ok ? buy(content, current, itemId, true) : current))}
    />
  )
}

interface JobsProps {
  content: ContentPack
  state: GameState
  onChange: (update: (state: GameState) => GameState) => void
  onMessage: (id: string) => void
}

/**
 * A job's shifts beside his week. Pointing at the button (or tabbing to it) lays the job
 * over the calendar he already has: his classes and any job he holds in grey, the job's
 * shifts in bright green where they are clear, and in red where they fall on something of his.
 */
function CalendarCompare({ content, state, job }: { content: ContentPack; state: GameState; job: Job }) {
  const week = weekAgainst(content, state, job)
  return (
    <span className="compare">
      <button type="button" className={week.clashes > 0 ? 'compare-button clash' : 'compare-button'} aria-describedby={`compare-${job.id}`}>
        {t('panels.phone.compare')}
        <span>{week.clashes === 0 ? t('panels.phone.noConflicts') : t('panels.phone.conflicts', { n: week.clashes })}</span>
      </button>
      <div className="compare-pop" role="tooltip" id={`compare-${job.id}`}>
        <div className="compare-grid" style={{ gridTemplateColumns: `44px repeat(${week.days.length}, minmax(0, 1fr))` }}>
          <span />
          {week.days.map((day) => (
            <span key={day} className="caps compare-day">
              {day.slice(0, 3)}
            </span>
          ))}
          {week.hours.map((hour) => [
            <span key={`h-${hour}`} className="compare-hour">
              {String(hour).padStart(2, '0')}:00
            </span>,
            ...week.days.map((day) => {
              const { mine, shift } = week.at(day, hour)
              const kind = shift && mine ? 'clash' : shift ? 'shift' : mine ? 'mine' : ''
              return (
                <span key={`${day}-${hour}`} className={`compare-cell ${kind}`} title={shift && mine ? t('panels.phone.clashesWith', { what: mine }) : (mine ?? (shift ? job.title : undefined))}>
                  {mine ?? ''}
                </span>
              )
            })
          ])}
        </div>
        <div className="compare-key">
          <span className="compare-cell mine" /> {t('panels.phone.keyYours')}
          <span className="compare-cell shift" /> {t('panels.phone.keyJob')}
          <span className="compare-cell clash" /> {t('panels.phone.keyConflict')}
        </div>
      </div>
    </span>
  )
}

/** Jobs: the board of work going around the University and the town, and the job he holds. */
function Jobs({ content, state, onChange, onMessage }: JobsProps) {
  const config = content.jobs
  const held = currentJob(content, state)
  const place = (id: string) => content.locations.find((l) => l.id === id)?.name ?? id
  const { ask, dialog } = useConfirm()
  // What he would be paid over a job's rate as he is now, said beside the rate: " +12%".
  const bonusNote = (job: Job) => {
    const bonus = Math.round(payBonus(content, state, job) * 100)
    return bonus > 0 ? t('panels.phone.bonus', { bonus }) : ''
  }
  // What he can be taken on for first, then by pay; a job he has left goes to the bottom.
  const openings = [...(config?.jobs ?? [])]
    .filter((job) => job.id !== held?.id)
    .sort((a, b) => Number(state.formerJobs.includes(a.id)) - Number(state.formerJobs.includes(b.id)) || Number(canApply(content, state, b.id).ok) - Number(canApply(content, state, a.id).ok) || b.hourlyRate - a.hourlyRate)

  return (
    <div className="feed jobs">
      {dialog}
      {held && state.job && config && (
        <article className="post job mine">
          <PlaceThumb content={content} locationId={held.locationId} ribbon={t('panels.phone.yourJob')} />
          <div className="job-body">
            <header>
              <h3>
                {held.title} <span>· {place(held.locationId)}</span>
              </h3>
              <span className={state.job.strikes > 0 ? 'chip madder' : 'chip'}>
                {t('panels.phone.strikes', { n: state.job.strikes, max: config.strikes })}
              </span>
            </header>
            <JobFacts pay={t('panels.phone.pay', { rate: held.hourlyRate, bonus: bonusNote(held) })} hours={hoursPerWeek(held)} builds={held.trains && statName(held.trains)} extra={bossOf(content, held)?.name} />
            <p className="job-note">
              {t('panels.phone.jobNote', { place: place(held.locationId), boss: bossOf(content, held)?.name.split(' ')[0] ?? t('panels.phone.yourBoss') })}
            </p>
            <div className="job-actions">
              <Button size="small" onClick={() => onMessage(held.bossId)}>
                <ChatIcon size={18} />
                {t('panels.phone.messageBoss', { name: bossOf(content, held)?.name.split(' ')[0] ?? t('panels.phone.theBoss') })}
              </Button>
              <Button
                size="small"
                onClick={async () =>
                  (await ask({ title: t('panels.phone.quitTitle', { job: held.title.toLowerCase() }), detail: t('panels.phone.quitDetail', { place: place(held.locationId) }), confirm: t('panels.phone.quit'), cancel: t('panels.phone.stay'), grave: true })) &&
                  onChange((current) => quitJob(content, current))
                }
              >
                {t('panels.phone.quit')}
              </Button>
              <CalendarCompare content={content} state={state} job={held} />
            </div>
          </div>
        </article>
      )}
      {!config || config.jobs.length === 0 ? <p className="hint phone-empty">{t('panels.phone.noJobs')}</p> : <SectionRule>{t('panels.phone.openings', { n: openings.length })}</SectionRule>}
      {openings.map((job) => {
        const check = canApply(content, state, job.id)
        const gone = state.formerJobs.includes(job.id)
        const needs = STATS.filter((stat) => job.requirements[stat] !== undefined)
        return (
          <article key={job.id} className={gone ? 'post job gone' : 'post job'}>
            <PlaceThumb content={content} locationId={job.locationId} />
            <div className="job-body">
            <header>
              <h3>
                {job.title} <span>· {place(job.locationId)}</span>
              </h3>
              <Button variant="primary" size="small" disabled={!check.ok} onClick={() => onChange((current) => (canApply(content, current, job.id).ok ? applyForJob(content, current, job.id) : current))}>
                {t('panels.phone.apply')}
              </Button>
            </header>
            <JobFacts pay={t('panels.phone.pay', { rate: job.hourlyRate, bonus: bonusNote(job) })} hours={hoursPerWeek(job)} builds={job.trains && statName(job.trains)} />
            <p>{job.description}</p>
            <div className="chips job-asks">
              {needs.length === 0 && <span className="chip">{t('panels.phone.noRequirements')}</span>}
              {needs.map((stat) => (
                <span key={stat} className={(state.player.stats[stat] ?? 0) >= (job.requirements[stat] ?? 0) ? 'chip' : 'chip madder'}>
                  {t('panels.phone.requirement', { stat: statName(stat), n: job.requirements[stat] })}
                </span>
              ))}
              <CalendarCompare content={content} state={state} job={job} />
            </div>
            {!check.ok && <span className="pin-note">{check.reasons.join(' · ')}</span>}
            </div>
          </article>
        )
      })}
    </div>
  )
}

/** The picture of where a job or a society is, at the head of its card: the place's first view, by day. */
function PlaceThumb({ content, locationId, ribbon, emblem }: { content: ContentPack; locationId: string; ribbon?: string; emblem?: string }) {
  const picture = viewImage(content.locations.find((l) => l.id === locationId)?.backgrounds[0], 'day')
  return (
    <figure className="job-thumb">
      {picture && <img src={`content://pack/${picture}`} alt="" draggable={false} />}
      {emblem && <img className="job-emblem" src={`content://pack/${emblem}`} alt="" draggable={false} />}
      {ribbon && <figcaption>{ribbon}</figcaption>}
    </figure>
  )
}

/** A card's figures in a row, each with its mark: pay, hours, what it builds. */
function JobFacts({ pay, hours, builds, when, extra }: { pay?: string; hours?: number; builds?: string; when?: string; extra?: string }) {
  return (
    <div className="job-facts">
      {pay && (
        <span>
          <CoinIcon size={16} />
          {pay}
        </span>
      )}
      {hours !== undefined && (
        <span>
          <ClockIcon size={16} />
          {t('panels.phone.hoursPerWeek', { hours })}
        </span>
      )}
      {when && (
        <span>
          <ClockIcon size={16} />
          {when}
        </span>
      )}
      {builds && (
        <span>
          <TagIcon size={16} />
          {t('panels.phone.builds', { what: builds })}
        </span>
      )}
      {extra && <span>{extra}</span>}
    </div>
  )
}

/** A heading across a list, with a sprig before it and a rule after. */
function SectionRule({ children }: { children: ReactNode }) {
  return (
    <h2 className="section-rule">
      <span>{children}</span>
    </h2>
  )
}

/** The student societies: the ones he belongs to first, each with who is in it, when and where it meets, and the way to join or leave. */
function Societies({ content, state, onChange }: { content: ContentPack; state: GameState; onChange: (update: (state: GameState) => GameState) => void }) {
  const config = content.societies
  const place = (id: string) => content.locations.find((l) => l.id === id)?.name ?? id
  const { ask, dialog } = useConfirm()
  const all = [...(config?.societies ?? [])].sort((a, b) => Number(state.societies.includes(b.id)) - Number(state.societies.includes(a.id)))
  return (
    <div className="feed jobs">
      {dialog}
      {!config || all.length === 0 ? (
        <p className="hint phone-empty">{t('panels.phone.noSocieties')}</p>
      ) : (
        <SectionRule>
          {t('panels.phone.joinedOf', { n: state.societies.length, max: config.maxJoined })}
        </SectionRule>
      )}
      {all.map((society) => {
        const mine = state.societies.includes(society.id)
        const check = canJoinSociety(content, state, society.id)
        const members = society.memberIds.flatMap((id) => content.loveInterests.find((li) => li.id === id) ?? [])
        const sponsor = content.loveInterests.find((li) => li.id === society.sponsorId)
        return (
          <article key={society.id} className={mine ? 'post job mine society' : 'post job society'}>
            <PlaceThumb content={content} locationId={society.locationId} ribbon={mine ? t('panels.phone.joined') : undefined} emblem={society.iconImage} />
            <div className="job-body">
            <header>
              <h3>
                {society.name.replace(/^the /, '')} <span>· {place(society.locationId)}</span>
              </h3>
              {mine ? (
                <Button
                  variant="quiet"
                  size="small"
                  onClick={async () =>
                    (await ask({ title: t('panels.phone.leaveTitle', { name: society.name }), confirm: t('panels.phone.leave'), cancel: t('panels.phone.stay') })) && onChange((current) => leaveSociety(current, society.id))
                  }
                >
                  {t('panels.phone.leave')}
                </Button>
              ) : (
                <Button variant="primary" size="small" disabled={!check.ok} title={check.reasons.join(' · ') || undefined} onClick={() => onChange((current) => joinSociety(content, current, society.id))}>
                  {t('panels.phone.join')}
                </Button>
              )}
            </header>
            <JobFacts when={t('panels.phone.meets', { weekday: society.weekday, time: `${String(society.startHour).padStart(2, '0')}:00` })} builds={society.stats.map(statName).join(t('panels.phone.and'))} extra={sponsor && t('panels.phone.sponsor', { name: sponsor.name })} />
            <p>{society.description}</p>
            {members.length + (sponsor ? 1 : 0) > 0 && (
              <div className="portraits">
                {[...members, ...(sponsor ? [sponsor] : [])].map((li) => (
                  <Portrait key={li.id} who={li} size={64} caption />
                ))}
              </div>
            )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

/** Where things stand with her, and what the player has found out so far. */
function About({ content, state, li }: { content: ContentPack; state: GameState; li: LoveInterest }) {
  const rel = state.relationships[li.id] ?? { affection: 0, trust: 0, desire: 0 }
  // Trust as she counts it, with whatever he has that adds to it.
  const shown = (meter: (typeof METERS)[number]) => (meter === 'trust' ? trustOf(content, state, li.id) : rel[meter])
  const stage = stageFor(content.relationships, rel.affection)
  const memories = state.memories[li.id] ?? []
  const bond = bondOf(state, li.id)
  const expecting = pregnancyStage(content, state, li.id)
  const children = childrenOf(state, li.id)
  const facts = factsOf(content, li)
  const known = revealedIds(state, li.id)
  const first = li.name.split(' ')[0]
  // A pack with no skills hides nothing: there would be no way to learn to see it.
  const can = (grant: SkillGrant) => skillGranting(content, grant) === undefined || hasSkill(content, state, grant)
  const unknown = (label: string) => <span className="chip unknown">{t('panels.phone.unknown', { label })}</span>
  // Everyone she is close to, and everyone he has seen her with: what they are to each other shows once he has.
  const ties = content.loveInterests
    .filter((other) => other.id !== li.id && (tieOf(content, state, li.id, other.id) > 0 || knownRelation(state, li.id, other.id) !== undefined))
    .map((other) => ({ other, value: tieOf(content, state, li.id, other.id), relation: knownRelation(state, li.id, other.id) }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="people-about">
      <div className="chips">
        <span className="chip madder">{stage.name}</span>
        {/* What he can only tell of her once he has learnt how: without the skill, the chip says where it is learnt. */}
        {content.pregnancy && !can('cycle')
          ? unknown(t('panels.phone.cycle'))
          : periodDay(content, state, li.id) !== undefined && (
              <span className="chip" title={t('panels.phone.periodTitle')}>
                {t('panels.phone.period', { day: periodDay(content, state, li.id), days: content.pregnancy?.periodDays })}
              </span>
            )}
        {content.pregnancy && !can('contraception') && unknown(t('panels.phone.birthControl'))}
        {content.pregnancy && can('contraception') && (
          <span className="chip" title={onBirthControl(content, state, li.id) ? t('panels.phone.onControlTitle') : t('panels.phone.offControlTitle')}>
            {onBirthControl(content, state, li.id) ? t('panels.phone.onControl') : t('panels.phone.offControl')}
          </span>
        )}
        {bond && (
          <span className="chip dark" title={statusOf(content, bond)?.description}>
            {bond.memberIds.some((id) => id !== li.id) ? describeBond(content, { ...bond, memberIds: bond.memberIds.filter((id) => id !== li.id) }) : bondName(content, bond)}
          </span>
        )}
        {expecting && (
          <span className="chip madder" title={expecting.description}>
            {t('panels.phone.pregnant', { stage: expecting.name, days: daysUntilDue(content, state, li.id) })}
          </span>
        )}
        {children.length > 0 && <span className="chip">{t('panels.phone.motherOf', { children: describeChildren(children) })}</span>}
        <span className="chip">{describeIntimacy(state, li.id)}</span>
      </div>
      <p>{li.bio}</p>

      {METERS.map((meter) => (
        <div key={meter} className="meter-row">
          <span>{t(`panels.common.meter.${meter}` as const)}</span>
          <div className={`meter ${meter}`}>
            <div style={{ width: `${(shown(meter) / content.relationships.meterMax) * 100}%` }} />
          </div>
          <strong>{shown(meter)}</strong>
        </div>
      ))}

      <h2>
        {t('panels.phone.whatYouKnow')}
        <span className="hint">
          {' '}
          {t('panels.phone.foundOut', { n: known.length, total: facts.length })}
        </span>
      </h2>
      {FACT_GROUPS.map((group) => {
        const all = facts.filter((fact) => fact.group === group)
        if (all.length === 0) return null
        const found = all.filter((fact) => known.includes(fact.id))
        const hidden = all.length - found.length
        return (
          <div key={group} className="fact-group">
            <span className="caps">{FACT_GROUP_NAMES[group]}</span>
            <div className="chips">
              {found.map((fact) => (
                <span key={fact.id} className={group === 'dislikes' ? 'chip fact disliked' : 'chip fact'} title={fact.detail}>
                  {fact.label}
                </span>
              ))}
              {hidden > 0 && (
                <span className="chip unknown" title={t('panels.phone.hiddenTitle', { name: first })}>
                  {found.length === 0 ? t('panels.phone.notYetKnown') : t('panels.phone.moreToFind', { n: hidden })}
                </span>
              )}
            </div>
          </div>
        )
      })}
      <p className="hint">{t('panels.phone.factsHint')}</p>

      {ties.length > 0 && <h2>{t('panels.phone.withOthers')}</h2>}
      {ties.map(({ other, value, relation }) => (
        <div key={other.id} className="meter-row">
          <span>{other.name.split(' ')[0]}</span>
          <div className="meter affection">
            <div style={{ width: `${(value / content.relationships.meterMax) * 100}%` }} />
          </div>
          <span className="tie-said">
            <strong title={`${value}`}>{tieLevel(content, value)?.name ?? value}</strong>
            {relation === 'friends' && <span className="chip fact">{t('panels.phone.friends')}</span>}
            {relation === 'enemies' && <span className="chip fact disliked">{t('panels.phone.enemies')}</span>}
          </span>
        </div>
      ))}

      <h2>{t('panels.phone.remembers', { name: first })}</h2>
      {memories.length === 0 && <p className="hint">{t('panels.phone.noMemories')}</p>}
      {[...memories].reverse().map((m, i) => (
        <div key={i} className="card">
          <span className="hint">
            {describeAge(content, m, state.time)} · {MEMORY_LEVEL_LABELS[m.level]}
          </span>
          <span>{m.summary}</span>
        </div>
      ))}
    </div>
  )
}
