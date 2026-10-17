import type { ContentPack, GameState, LoveInterest } from '../../../shared/model'
import type { Panel, PhoneApp } from './panels'
import { Tour, type TourStep } from './Tour'

interface Props {
  content: ContentPack
  state: GameState
  /** What is open over the day, for the step that waits on him to open the phone. */
  panel: Panel | null
  onOpen: (panel: Panel | null) => void
  onDone: () => void
}

/**
 * The first look round the day's screen, given by whoever welcomed him: the phone, which he opens himself, and each of its
 * apps; the map, the bag and the calendar, each opened for him; and Help, for the rest. Skipped, it is over all the same.
 */
export function InterfaceTour({ content, state, panel, onOpen, onDone }: Props) {
  const id = content.orientation?.intro?.speakerId
  const guide: LoveInterest | undefined = [...content.npcs, ...content.loveInterests].find((one) => one.id === id)
  if (!guide) return null
  const phone = (app: PhoneApp) => () => onOpen({ kind: 'courier', app })
  const close = () => onOpen(null)

  const steps: TourStep[] = [
    { text: `Before you go, ${state.player.name}, let me show you around. It'll only take a minute.` },
    { target: '[data-tour="phone"]', waits: true, done: panel?.kind === 'courier', text: "First, your phone. You'll use it more than anything else. Go ahead and open it." },
    {
      target: '[data-tour="phone-chats"]',
      before: phone('chats'),
      text: "These are your messages. When someone gives you her Bloomr contact, you can text her here. She'll reply when she's free, and sometimes she'll text you first."
    },
    { target: '[data-tour="phone-friends"]', before: phone('friends'), text: "This is everyone you've met, plus anything you've found out about them." },
    { target: '[data-tour="phone-updates"]', before: phone('updates'), text: "This is the feed, where people post photos. Like the ones you enjoy. They'll notice." },
    {
      target: '[data-tour="phone-jobs"]',
      before: phone('jobs'),
      text: "This is where you find work. A job is the main way to make money, and you'll need money for gifts, dates and rent. If you meet a job's requirements, you're hired on the spot, and you get paid after every shift."
    },
    ...(content.societies
      ? [
          {
            target: '[data-tour="phone-societies"]',
            before: phone('societies'),
            text: `These are the student societies. Each one meets for an hour a week after classes. You can join up to ${content.societies.maxJoined} at the Societies Fair, or any time after.`
          }
        ]
      : []),
    { target: '[data-tour="phone-shop"]', before: phone('shop'), text: 'And this is the market. You can buy gifts here and have them delivered.' },
    // Each of the other big buttons he presses himself too, with whatever was open put away first so that he can.
    { target: '[data-tour="map"]', before: close, waits: true, done: panel?.kind === 'map', text: 'Now put the phone away and open the map.' },
    { target: '.map-pin.here', text: "This is the map. It shows who's where right now. If you want to talk to someone, find her here and go to her." },
    { target: '[data-tour="bag"]', before: close, waits: true, done: panel?.kind === 'bag', text: 'Next, open your bag.' },
    { target: '.bag-grid', text: 'This is your bag. Anything you buy, get given or make ends up here, and you use it from here too.' },
    {
      target: '.bag .tabs [role="tab"]:nth-child(2)',
      text: 'Relics go here. You can only find them by adventuring under the University. Each one gives you a permanent bonus.'
    },
    { target: '[data-tour="calendar"]', before: close, waits: true, done: panel?.kind === 'calendar', text: 'Last one. Open your calendar.' },
    { target: '.calendar-sheet', text: 'This is your calendar. It shows your classes, work shifts, dates and any events coming up.' },
    {
      target: '[data-tour="help-menu"]',
      before: close,
      text: 'If you ever want to know how something works, or more about this world, check Help.'
    },
    { text: "That's everything. Now go on, orientation's about to start." }
  ]

  return (
    <Tour
      guide={guide}
      steps={steps}
      onDone={() => {
        onOpen(null)
        onDone()
      }}
    />
  )
}
