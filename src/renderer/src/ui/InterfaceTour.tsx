import type { ContentPack, GameState, LoveInterest } from '../../../shared/model'
import type { Panel, PhoneApp } from './panels'
import { Tour, type TourStep } from './Tour'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  /** What is open over the day, for the step that waits on him to open the phone. */
  panel: Panel | null
  onOpen: (panel: Panel | null) => void
  /** Seen through to the end: the day's choices are shown next. */
  onDone: () => void
  /** Skipped: nothing more is shown. */
  onSkip: () => void
}

/**
 * The first look round the day's screen, given by whoever welcomed him: the phone, which he opens himself, and each of its
 * apps; the map, the bag and the calendar, each opened for him; and Help, for the rest. Skipped, it is over all the same.
 */
export function InterfaceTour({ content, state, panel, onOpen, onDone, onSkip }: Props) {
  const id = content.orientation?.intro?.speakerId
  const guide: LoveInterest | undefined = [...content.npcs, ...content.loveInterests].find((one) => one.id === id)
  if (!guide) return null
  const phone = (app: PhoneApp) => () => onOpen({ kind: 'courier', app })
  const close = () => onOpen(null)

  const steps: TourStep[] = [
    { text: t('shell.interfaceTour.welcome', { name: state.player.name }) },
    { target: '[data-tour="phone"]', waits: true, done: panel?.kind === 'courier', text: t('shell.interfaceTour.phone') },
    {
      target: '[data-tour="phone-chats"]',
      before: phone('chats'),
      text: t('shell.interfaceTour.chats')
    },
    { target: '[data-tour="phone-friends"]', before: phone('friends'), text: t('shell.interfaceTour.friends') },
    { target: '[data-tour="phone-updates"]', before: phone('updates'), text: t('shell.interfaceTour.updates') },
    {
      target: '[data-tour="phone-jobs"]',
      before: phone('jobs'),
      text: t('shell.interfaceTour.jobs')
    },
    ...(content.societies
      ? [
          {
            target: '[data-tour="phone-societies"]',
            before: phone('societies'),
            text: t('shell.interfaceTour.societies', { most: content.societies.maxJoined })
          }
        ]
      : []),
    { target: '[data-tour="phone-shop"]', before: phone('shop'), text: t('shell.interfaceTour.shop') },
    // Each of the other big buttons he presses himself too, with whatever was open put away first so that he can.
    { target: '[data-tour="map"]', before: close, waits: true, done: panel?.kind === 'map', text: t('shell.interfaceTour.map') },
    { target: '.map-pin.here', text: t('shell.interfaceTour.mapPin') },
    { target: '[data-tour="bag"]', before: close, waits: true, done: panel?.kind === 'bag', text: t('shell.interfaceTour.bag') },
    { target: '.bag-grid', text: t('shell.interfaceTour.bagGrid') },
    {
      target: '.bag .tabs [role="tab"]:nth-child(2)',
      text: t('shell.interfaceTour.relics')
    },
    { target: '[data-tour="calendar"]', before: close, waits: true, done: panel?.kind === 'calendar', text: t('shell.interfaceTour.calendar') },
    { target: '.calendar-sheet', text: t('shell.interfaceTour.calendarSheet') },
    {
      target: '[data-tour="help-menu"]',
      before: close,
      text: t('shell.interfaceTour.help')
    },
    { before: close, text: t('shell.interfaceTour.last') }
  ]

  return (
    <Tour
      guide={guide}
      steps={steps}
      onDone={() => {
        onOpen(null)
        onDone()
      }}
      onSkip={() => {
        onOpen(null)
        onSkip()
      }}
    />
  )
}
