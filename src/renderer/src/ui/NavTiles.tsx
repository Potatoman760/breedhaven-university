import type { ReactNode } from 'react'
import { unreadNotes } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { BagIcon, CalendarIcon, HelpIcon, JobIcon, MapIcon, MenuIcon, PhoneIcon } from './icons'
import type { Panel } from './panels'

interface Props {
  content: ContentPack
  state: GameState
  onOpen: (panel: Panel) => void
  /** Whose thread the phone opens on: in a scene, hers. Left out, the list of threads. */
  phoneId?: string
  /** What the bag opens: in a scene, what can be given to her. */
  bag?: Panel
  bagDisabled?: boolean
  /** His house, once he has one. Only out of a scene, where it can be gone into. */
  home?: boolean
  /** Small buttons of the screen's own, put to the left of the menu's and drawn like it. */
  extras?: ReactNode
}

/** The big buttons in the bottom right corner, the same on the day's screen and in a scene. */
export function NavTiles({ content, state, onOpen, phoneId, bag = { kind: 'bag' }, bagDisabled, home, extras }: Props) {
  return (
    <div className="tiles">
      {/* His house, once he has one: its plan, who lives in it, and its accounts. */}
      {home && content.housing && state.housing.status === 'resident' && (
        <button className="tile glass home" onClick={() => onOpen({ kind: 'house' })}>
          <JobIcon name="house" size={30} />
          {content.housing.name}
          {state.housing.arrears > 0 && <span className="badge">!</span>}
        </button>
      )}
      <button className="tile glass" data-tour="map" onClick={() => onOpen({ kind: 'map' })}>
        <MapIcon size={32} />
        Map
      </button>
      <button className="tile glass" data-tour="phone" onClick={() => onOpen({ kind: 'courier', id: phoneId })}>
        <PhoneIcon size={32} />
        Phone
        {unreadNotes(state) > 0 && <span className="badge">{unreadNotes(state)}</span>}
      </button>
      <button className="tile glass" data-tour="calendar" onClick={() => onOpen({ kind: 'calendar' })}>
        <CalendarIcon size={32} />
        Calendar
      </button>
      {/* What he carries, can make and has brought up from below. */}
      <button className="tile glass" data-tour="bag" disabled={bagDisabled} onClick={() => onOpen(bag)}>
        <BagIcon size={32} />
        Bag
      </button>
      {/* The menu, for whoever does not reach for Escape: continue, save, load, settings, and the way out. Small, and last, so that it sits in the corner. */}
      <div className="tile-row">
        {extras}
        {/* How the game works, a click away from the day and from a scene alike. */}
        <button className="tile-menu glass" data-tour="help-menu" onClick={() => onOpen({ kind: 'help' })}>
          <HelpIcon size={18} />
          Help
        </button>
        <button className="tile-menu glass" title="Menu (Esc)" onClick={() => onOpen({ kind: 'menu' })}>
          <MenuIcon size={18} />
          Menu
        </button>
      </div>
    </div>
  )
}
