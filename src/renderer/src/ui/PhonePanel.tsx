import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  addNote,
  answerInvite,
  applyForJob,
  attendees,
  bondOf,
  bossOf,
  canApply,
  currentJob,
  describeShift,
  excuseShift,
  hoursPerWeek,
  npcAsCharacter,
  quitJob,
  shiftClashes,
  childrenOf,
  courierThread,
  daysUntilDue,
  describeAge,
  describeBond,
  describeChildren,
  describeStudies,
  describeWhen,
  FACT_GROUP_NAMES,
  FACT_GROUPS,
  factsOf,
  feedOf,
  firstNames,
  handleOf,
  hasContact,
  hasMet,
  inviteStands,
  locationOf,
  markRead,
  pregnancyStage,
  revealedIds,
  revealFacts,
  stageFor,
  statusOf,
  tieLevel,
  tieOf,
  toDate,
  toggleLike,
  unreadNotes
} from '../../../shared/game'
import { METERS, STATS, type ContentPack, type GameState, type LoveInterest } from '../../../shared/model'
import { errorMessage } from '../errors'
import { Button } from './Button'
import { Overlay } from './Dialog'
import { BackIcon, ChatIcon, ChevronIcon, FeedIcon, FriendsIcon, HeartIcon, WorkIcon } from './icons'

interface Props {
  content: ContentPack
  state: GameState
  /** Applied to the newest state, since a reply can arrive after other things have changed. */
  onChange: (update: (state: GameState) => GameState) => void
  onClose: () => void
  /** Who to open on, in Friends. Left out, the phone opens on Chats. */
  initialId?: string
}

/**
 * The phone's apps, down its left edge. A new one is a line here and a branch where the
 * apps are drawn.
 */
const APPS = [
  { id: 'chats', label: 'Chats', Icon: ChatIcon },
  { id: 'friends', label: 'Friends', Icon: FriendsIcon },
  { id: 'updates', label: 'Updates', Icon: FeedIcon },
  { id: 'jobs', label: 'Jobs', Icon: WorkIcon }
] as const
type App = (typeof APPS)[number]['id']

/** A round crop of the character's face, from her neutral sprite. */
function Avatar({ li, size = 56 }: { li: LoveInterest; size?: number }) {
  const outfit = li.outfits.find((o) => o.id === li.defaultOutfitId)
  const sprite = (outfit?.sprites['neutral'] ?? Object.values(outfit?.sprites ?? {})[0])?.image
  return (
    <span
      className="avatar"
      role="img"
      aria-label={li.name}
      style={{
        width: size,
        height: size,
        ...(sprite ? { backgroundImage: `url("content://pack/${sprite}")`, backgroundPosition: `50% ${li.faceY}%` } : {})
      }}
    />
  )
}

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
      {where ? `At ${where.name}` : 'Whereabouts unknown'}
    </span>
  )
}

/**
 * The player's phone: Chats for messages, Friends to keep track of everyone he is getting
 * to know, Updates for what they post on Bloomr, and Jobs for work.
 */
export function PhonePanel({ content, state, onChange, onClose, initialId }: Props) {
  // Everyone who can be in his Chats: the love interests, and any NPC he has worked for.
  const people = messageable(content)
  const [app, setApp] = useState<App>(initialId === undefined ? 'chats' : 'friends')
  // Who the open chat is with, and whose page is open in Friends.
  const [chatId, setChatId] = useState<string | undefined>(() => people.find((li) => unreadNotes(state, li.id) > 0)?.id)
  // Only someone who has given him her Chats can be messaged.
  const canMessage = (id: string) => hasContact(state, id)
  const [friendId, setFriendId] = useState<string | undefined>(initialId)
  const message = (id: string) => {
    setChatId(id)
    setApp('chats')
  }

  return (
    <Overlay onClose={onClose}>
      <div className="phone">
        <nav className="phone-rail" role="tablist" aria-orientation="vertical">
          <button className="phone-back" aria-label="Put the phone away" onClick={onClose}>
            <BackIcon size={22} />
          </button>
          {APPS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={app === id}
              className={app === id ? 'phone-tab selected' : 'phone-tab'}
              onClick={() => setApp(id)}
            >
              <Icon size={26} />
              {label}
              {id === 'chats' && unreadNotes(state) > 0 && <span className="badge">{unreadNotes(state)}</span>}
            </button>
          ))}
        </nav>

        <div className={`phone-screen ${app}`}>
          {app === 'chats' && <Chats content={content} state={state} onChange={onChange} selectedId={chatId} onSelect={setChatId} />}
          {app === 'friends' && <Friends content={content} state={state} selectedId={friendId} onSelect={setFriendId} onMessage={message} canMessage={canMessage} />}
          {app === 'updates' && <Updates content={content} state={state} onChange={onChange} onMessage={message} canMessage={canMessage} />}
          {app === 'jobs' && <Jobs content={content} state={state} onChange={onChange} onMessage={message} />}
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
}

/** Chats: every conversation on the left, the open one on the right. */
function Chats({ content, state, onChange, selectedId, onSelect }: ChatsProps) {
  const today = toDate(content.calendar, state.time).dayIndex
  const stamp = (time: number) => {
    if (time === state.time) return 'Now'
    const date = toDate(content.calendar, time)
    return date.dayIndex === today ? `${String(date.hour).padStart(2, '0')}:00` : `${date.day} ${date.month.name.slice(0, 3)}`
  }
  // Only those who have given him their Chats. Whoever wrote or was written to last comes first; those never written to, after.
  const last = (li: LoveInterest) => courierThread(state, li.id).at(-1)
  const listed = messageable(content).filter((li) => hasContact(state, li.id)).sort((a, b) => (last(b)?.time ?? -1) - (last(a)?.time ?? -1))
  const selected = listed.find((li) => li.id === selectedId)

  return (
    <>
      <div className="chat-list">
        <h1 className="phone-title">Chats</h1>
        <div className="chat-rows">
          {listed.length === 0 && <p className="hint">Nobody has given you their Chats yet. Ask someone for it when you are with them.</p>}
          {listed.map((li) => {
            const note = last(li)
            const unread = unreadNotes(state, li.id)
            return (
              <button key={li.id} className={li.id === selectedId ? 'chat-row selected' : 'chat-row'} onClick={() => onSelect(li.id)}>
                <Avatar li={li} />
                <span className="chat-row-text">
                  <strong>{li.name}</strong>
                  <span className={unread > 0 ? 'preview unread' : 'preview'}>
                    {note ? `${note.from === 'player' ? 'You: ' : ''}${note.text}` : 'Say hello'}
                  </span>
                </span>
                {unread > 0 ? <span className="badge">{unread}</span> : note && <span className="caps stamp">{stamp(note.time)}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="chat-thread">
        {selected ? (
          <>
            <div className="chat-head">
              <Avatar li={selected} size={48} />
              <div>
                <strong>{selected.name}</strong>
                <span className="handle">{handleOf(selected)}</span>
              </div>
              <Presence content={content} state={state} li={selected} />
            </div>
            <Thread key={selected.id} content={content} state={state} li={selected} onChange={onChange} />
          </>
        ) : (
          <p className="hint phone-empty">{listed.length === 0 ? 'No conversations yet.' : 'Pick a conversation on the left to view it.'}</p>
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
}

/** The messages that have gone between the player and one love interest. */
function Thread({ content, state, li, onChange }: ThreadProps) {
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

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || waiting) return
    const sent = addNote(state, id, { from: 'player', text, read: true })
    onChange((current) => addNote(current, id, { from: 'player', text, read: true }))
    setDraft('')
    setNotice('')
    setWaiting(true)
    try {
      const reply = await window.api.courier({ state: sent, loveInterestId: id, invite: false })
      onChange((current) => {
        const answered = revealFacts(content, addNote(current, id, { from: 'them', text: reply.text, proposal: reply.proposal, read: false }), id, reply.revealed ?? [])
        // His boss has taken note that he will miss a shift.
        return reply.excused ? excuseShift(answered, reply.excused) : answered
      })
    } catch (error) {
      setNotice(`No answer came back: ${errorMessage(error)}`)
    } finally {
      setWaiting(false)
    }
  }

  return (
    <>
      <div className="chat-messages">
        {thread.length === 0 && <p className="hint center">No messages with {firstName} yet. Say hello.</p>}
        {thread.map((note, i) => {
          const sentOn = toDate(content.calendar, note.time)
          const before = i > 0 ? toDate(content.calendar, thread[i - 1].time) : undefined
          const plan = note.proposal
          return (
            <div key={i} className={note.from === 'player' ? 'message mine' : 'message'}>
              {/* The time is shown once for each run of messages sent in the same hour. */}
              {before?.dayIndex === sentOn.dayIndex && before.hour === sentOn.hour ? null : (
                <span className="caps stamp">
                  {sentOn.weekday} {sentOn.day} {sentOn.month.name.slice(0, 3)} · {String(sentOn.hour).padStart(2, '0')}:00
                </span>
              )}
              <p className="bubble">{note.text}</p>
              {plan && (
                <div className="proposal">
                  <div>
                    <strong>
                      {plan.title} with {firstNames(content, attendees(plan))}
                    </strong>
                    <span>
                      {describeWhen(content, plan.time)} · {content.locations.find((l) => l.id === plan.locationId)?.name}
                    </span>
                  </div>
                  {note.answer ? (
                    <span className="chip">{note.answer}</span>
                  ) : inviteStands(content, state, plan) ? (
                    <>
                      <button onClick={() => onChange((s) => answerInvite(content, s, id, i, true))}>Accept</button>
                      <button className="secondary" onClick={() => onChange((s) => answerInvite(content, s, id, i, false))}>
                        Decline
                      </button>
                    </>
                  ) : (
                    <span className="chip">no longer possible</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {waiting && (
          <div className="message">
            <p className="bubble typing" aria-label={`${firstName} is typing`}>
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
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={400}
          aria-label={`A message to ${firstName}`}
          placeholder={`Message ${firstName}...`}
          autoFocus
        />
        <button type="submit" disabled={!draft.trim() || waiting} aria-label="Send" className="icon">
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
            All friends
          </button>
          {canMessage(selected.id) ? (
            <button className="secondary" onClick={() => onMessage(selected.id)}>
              <ChatIcon size={18} />
              Message
            </button>
          ) : (
            <span className="hint">She has not given you her Chats yet.</span>
          )}
        </div>
        <div className="friend-banner">
          <Avatar li={selected} size={88} />
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
      <h1 className="phone-title">Friends</h1>
      <span className="caps">Contacts · {listed.length}</span>
      {listed.length === 0 && <p className="hint phone-empty">You have not met anyone yet. People appear here once you have spent time with them.</p>}
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
                <Avatar li={li} size={96} />
                <span className="friend-card-text">
                  <strong>{li.name}</strong>
                  <span className="handle">{handleOf(li)}</span>
                  <span className="caps">{describeStudies(li)}</span>
                  <Presence content={content} state={state} li={li} />
                </span>
                <span className={close ? 'chip madder' : 'chip'}>{standing}</span>
              </button>
              {canMessage(li.id) && (
                <Button variant="primary" className="friend-message" aria-label={`Message ${li.name}`} title={`Message ${li.name.split(' ')[0]}`} onClick={() => onMessage(li.id)}>
                  <ChatIcon size={20} />
                </Button>
              )}
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
}

/** Updates: Bloomr, the feed of what everyone has been posting, newest first. */
function Updates({ content, state, onChange, onMessage, canMessage }: UpdatesProps) {
  const posts = feedOf(state)
  return (
    <div className="feed">
      <h1 className="phone-title">Bloomr</h1>
      {posts.length === 0 && <p className="hint phone-empty">Nobody has posted yet. Look again tomorrow.</p>}
      {posts.map((post) => {
        const author = content.loveInterests.find((li) => li.id === post.authorId)
        if (!author) return null
        return (
          <article key={post.id} className="post">
            <header>
              <Avatar li={author} size={44} />
              <div>
                <strong>{author.name}</strong>
                <span className="handle">
                  {handleOf(author)} · {describeAge(content, { time: post.time, summary: '' }, state.time)}
                </span>
              </div>
            </header>
            {post.image && <img src={`content://pack/${post.image}`} alt="" />}
            <p>{post.text}</p>
            <footer>
              <button
                className={post.liked ? 'quiet like liked' : 'quiet like'}
                aria-pressed={post.liked}
                onClick={() => onChange((current) => toggleLike(current, post.id))}
              >
                <HeartIcon size={20} />
                {post.liked ? 'Liked' : 'Like'}
              </button>
              {canMessage(author.id) && (
                <button className="quiet" onClick={() => onMessage(author.id)}>
                  <ChatIcon size={20} />
                  Message
                </button>
              )}
            </footer>
          </article>
        )
      })}
    </div>
  )
}

interface JobsProps {
  content: ContentPack
  state: GameState
  onChange: (update: (state: GameState) => GameState) => void
  onMessage: (id: string) => void
}

/** Jobs: the board of work going around the University and the town, and the job he holds. */
function Jobs({ content, state, onChange, onMessage }: JobsProps) {
  const config = content.jobs
  const held = currentJob(content, state)
  const place = (id: string) => content.locations.find((l) => l.id === id)?.name ?? id
  // What he can be taken on for first, then by pay; a job he has left goes to the bottom.
  const openings = [...(config?.jobs ?? [])]
    .filter((job) => job.id !== held?.id)
    .sort((a, b) => Number(state.formerJobs.includes(a.id)) - Number(state.formerJobs.includes(b.id)) || Number(canApply(content, state, b.id).ok) - Number(canApply(content, state, a.id).ok) || b.hourlyRate - a.hourlyRate)

  return (
    <div className="feed jobs">
      <h1 className="phone-title">Jobs</h1>
      {held && state.job && config && (
        <article className="post job mine">
          <header>
            <div>
              <span className="caps">Your job</span>
              <strong>
                {held.title} · {place(held.locationId)}
              </strong>
              <span className="handle">
                {held.hourlyRate} an hour · {hoursPerWeek(held)} hours a week{held.trains ? ` · builds ${held.trains}` : ''} · {bossOf(content, held)?.name ?? 'the boss'}
              </span>
            </div>
            <span className={state.job.strikes > 0 ? 'chip madder' : 'chip'}>
              {state.job.strikes} of {config.strikes} strikes
            </span>
          </header>
          <div className="chips">
            {held.shifts.map((shift) => (
              <span key={describeShift(shift)} className="chip">
                {describeShift(shift)}
              </span>
            ))}
          </div>
          <p className="hint">
            Go to {place(held.locationId)} during a shift to clock in. A shift missed without a word is a strike. If you can't make one, message{' '}
            {bossOf(content, held)?.name.split(' ')[0] ?? 'your boss'} that day before it starts and it counts for half.
          </p>
          <footer>
            <button className="quiet" onClick={() => onMessage(held.bossId)}>
              <ChatIcon size={20} />
              Message {bossOf(content, held)?.name.split(' ')[0] ?? 'the boss'}
            </button>
            <button
              className="quiet"
              onClick={() => window.confirm(`Quit as ${held.title.toLowerCase()} at ${place(held.locationId)}? They will not take you back.`) && onChange((current) => quitJob(content, current))}
            >
              Quit
            </button>
          </footer>
        </article>
      )}
      {!config || config.jobs.length === 0 ? <p className="hint phone-empty">Nobody is hiring.</p> : <span className="caps">Openings · {openings.length}</span>}
      {openings.map((job) => {
        const check = canApply(content, state, job.id)
        const gone = state.formerJobs.includes(job.id)
        const clashes = shiftClashes(state, job)
        const needs = STATS.filter((stat) => job.requirements[stat] !== undefined)
        return (
          <article key={job.id} className={gone ? 'post job gone' : 'post job'}>
            <header>
              <div>
                <strong>
                  {job.title} · {place(job.locationId)}
                </strong>
                <span className="handle">
                  {job.hourlyRate} an hour · {hoursPerWeek(job)} hours a week{job.trains ? ` · builds ${job.trains}` : ''}
                </span>
              </div>
              <button disabled={!check.ok} onClick={() => onChange((current) => (canApply(content, current, job.id).ok ? applyForJob(content, current, job.id) : current))}>
                Apply
              </button>
            </header>
            <p>{job.description}</p>
            <div className="chips">
              {needs.length === 0 && <span className="chip">No requirements</span>}
              {needs.map((stat) => (
                <span key={stat} className={(state.player.stats[stat] ?? 0) >= (job.requirements[stat] ?? 0) ? 'chip' : 'chip madder'}>
                  {stat} {job.requirements[stat]}
                </span>
              ))}
              {job.shifts.map((shift) => (
                <span key={describeShift(shift)} className="chip unknown">
                  {describeShift(shift)}
                </span>
              ))}
            </div>
            {!check.ok && <span className="pin-note">{check.reasons.join(' · ')}</span>}
            {check.ok && clashes.length > 0 && <span className="pin-note">You can still take it, but: {clashes.join('; ')}.</span>}
          </article>
        )
      })}
    </div>
  )
}

/** Where things stand with her, and what the player has found out so far. */
function About({ content, state, li }: { content: ContentPack; state: GameState; li: LoveInterest }) {
  const rel = state.relationships[li.id] ?? { affection: 0, trust: 0, desire: 0 }
  const stage = stageFor(content.relationships, rel.affection)
  const memories = state.memories[li.id] ?? []
  const bond = bondOf(state, li.id)
  const expecting = pregnancyStage(content, state, li.id)
  const children = childrenOf(state, li.id)
  const facts = factsOf(content, li)
  const known = revealedIds(state, li.id)
  const first = li.name.split(' ')[0]
  const ties = content.loveInterests
    .filter((other) => other.id !== li.id && tieOf(content, state, li.id, other.id) > 0)
    .map((other) => ({ other, value: tieOf(content, state, li.id, other.id) }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="people-about">
      <div className="chips">
        <span className="chip madder">{stage.name}</span>
        {bond && (
          <span className="chip dark" title={statusOf(content, bond)?.description}>
            {describeBond(content, { ...bond, memberIds: bond.memberIds.filter((id) => id !== li.id) }).replace(/ with $/, '')}
          </span>
        )}
        {expecting && (
          <span className="chip madder" title={expecting.description}>
            Pregnant · {expecting.name} · due in {daysUntilDue(content, state, li.id)} days
          </span>
        )}
        {children.length > 0 && <span className="chip">Mother of {describeChildren(children)}</span>}
      </div>
      <p>{li.bio}</p>

      {METERS.map((meter) => (
        <div key={meter} className="meter-row">
          <span>{meter}</span>
          <div className={`meter ${meter}`}>
            <div style={{ width: `${(rel[meter] / content.relationships.meterMax) * 100}%` }} />
          </div>
          <strong>{rel[meter]}</strong>
        </div>
      ))}

      <h2>
        What you know of her
        <span className="hint">
          {' '}
          {known.length} of {facts.length} found out
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
                <span className="chip unknown" title={`Something ${first} has not told or shown you yet`}>
                  {found.length === 0 ? 'Not yet known' : `${hidden} more to find out`}
                </span>
              )}
            </div>
          </div>
        )
      })}
      <p className="hint">
        These come out in conversation, when she tells or shows you, and when a gift lands well or badly.
      </p>

      {ties.length > 0 && <h2>With the others</h2>}
      {ties.map(({ other, value }) => (
        <div key={other.id} className="meter-row">
          <span>{other.name.split(' ')[0]}</span>
          <div className="meter affection">
            <div style={{ width: `${(value / content.relationships.meterMax) * 100}%` }} />
          </div>
          <strong title={`${value}`}>{tieLevel(content, value)?.name ?? value}</strong>
        </div>
      ))}

      <h2>What {first} remembers</h2>
      {memories.length === 0 && <p className="hint">Nothing yet. Each scene you share becomes one short memory.</p>}
      {[...memories].reverse().map((m, i) => (
        <div key={i} className="card">
          <span className="hint">{describeAge(content, m, state.time)}</span>
          <span>{m.summary}</span>
        </div>
      ))}
    </div>
  )
}
