import type { ReactNode } from 'react'
import { phoneUnread, tripUnderway } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { HelpIcon, MenuIcon } from './icons'
import bagArt from '../../../assets/tiles/bag.png'
import calendarArt from '../../../assets/tiles/calendar.png'
import houseArt from '../../../assets/tiles/house.png'
import mapArt from '../../../assets/tiles/map.png'
import phoneArt from '../../../assets/tiles/phone.png'
import type { Panel, PhoneApp } from './panels'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  onOpen: (panel: Panel) => void
  /** Whose thread the phone opens on: in a scene, hers. Left out, the list of threads. */
  phoneId?: string
  /** Which app the phone opens on, where it is not hers or his DMs. */
  phoneApp?: PhoneApp
  /** What the bag opens: in a scene, what can be given to her. */
  bag?: Panel
  bagDisabled?: boolean
  /** His house, once he has one. Only out of a scene, where it can be gone into. */
  home?: boolean
  /** Small buttons of the screen's own, put to the left of the menu's and drawn like it. */
  extras?: ReactNode
}

/** The big buttons in the bottom right corner, the same on the day's screen and in a scene. */
/** A tile's picture, drawn and not an icon: the thing itself. */
const Art = ({ src }: { src: string }) => <img className="tile-art" src={src} alt="" draggable={false} />

export function NavTiles({ content, state, onOpen, phoneId, phoneApp, bag = { kind: 'bag' }, bagDisabled, home, extras }: Props) {
  // Away on a trip he booked, the house is not his to go into until the last of it is done.
  const away = tripUnderway(content, state) !== undefined
  return (
    <div className="tiles">
      {/* His house, once he has one: its plan, who lives in it, and its accounts. */}
      {home && content.housing && state.housing.status === 'resident' && (
        <button className="tile glass home" disabled={away} title={away ? t('screens.navTiles.away') : undefined} onClick={() => onOpen({ kind: 'house' })}>
          <Art src={houseArt} />
          {content.housing.name}
          {state.housing.arrears > 0 && <span className="badge">!</span>}
        </button>
      )}
      <button className="tile glass" data-tour="map" onClick={() => onOpen({ kind: 'map' })}>
        <Art src={mapArt} />
        {t('screens.navTiles.map')}
      </button>
      <button className="tile glass" data-tour="phone" onClick={() => onOpen({ kind: 'courier', id: phoneId, app: phoneApp })}>
        <Art src={phoneArt} />
        {t('screens.navTiles.phone')}
        {phoneUnread(state) > 0 && <span className="badge">{phoneUnread(state)}</span>}
      </button>
      <button className="tile glass" data-tour="calendar" onClick={() => onOpen({ kind: 'calendar' })}>
        <Art src={calendarArt} />
        {t('screens.calendar.title')}
      </button>
      {/* What he carries, can make and has brought up from below. */}
      <button className="tile glass" data-tour="bag" disabled={bagDisabled} onClick={() => onOpen(bag)}>
        <Art src={bagArt} />
        {t('screens.navTiles.bag')}
      </button>
      {/* The menu, for whoever does not reach for Escape: continue, save, load, settings, and the way out. Small, and last, so that it sits in the corner. */}
      <div className="tile-row">
        {extras}
        {/* How the game works, a click away from the day and from a scene alike. */}
        <button className="tile-menu glass" data-tour="help-menu" onClick={() => onOpen({ kind: 'help' })}>
          <HelpIcon size={18} />
          {t('screens.navTiles.help')}
        </button>
        <button className="tile-menu glass" title={t('screens.navTiles.menuTitle', { key: 'Esc' })} onClick={() => onOpen({ kind: 'menu' })}>
          <MenuIcon size={18} />
          {t('screens.navTiles.menu')}
        </button>
      </div>
    </div>
  )
}
