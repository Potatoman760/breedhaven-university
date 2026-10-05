import { useState } from 'react'
import { canBuy, stallsAt, toDate } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import { ItemIcon } from './icons'

interface Props {
  content: ContentPack
  state: GameState
  onBuy: (itemId: string) => void
  onLeave: () => void
}

/** A visit to the market: one tab per stall, each listing the gifts it sells. */
export function MarketView({ content, state, onBuy, onLeave }: Props) {
  const stalls = stallsAt(content, state.locationId)
  const [stallId, setStallId] = useState(stalls[0]?.id)
  const stall = stalls.find((s) => s.id === stallId) ?? stalls[0]
  const location = content.locations.find((l) => l.id === state.locationId)
  const date = toDate(content.calendar, state.time)
  const carrying = Object.values(state.inventory).reduce((total, count) => total + count, 0)

  return (
    <main className="stage">
      <Backdrop location={location} periodId={date.period.id} />
      <div className="market glass framed">
        <div className="market-head">
          <div>
            <h1>{location?.name.replace(/^the /, 'The ') ?? 'Market'}</h1>
            <span className="hint">
              Buy gifts here and hand them over during any scene. Carrying {carrying}.
            </span>
          </div>
          <div className="purse">
            <span className="caps">Coin</span>
            <strong>{state.player.money}</strong>
          </div>
          <button className="secondary" onClick={onLeave}>
            Leave
          </button>
        </div>

        <div className="tabs" role="tablist">
          {stalls.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === stall?.id}
              className={s.id === stall?.id ? 'tab selected' : 'tab'}
              onClick={() => setStallId(s.id)}
            >
              <ItemIcon name={s.icon} size={22} />
              {s.name}
            </button>
          ))}
        </div>

        {stall ? (
          <div className="stall" role="tabpanel">
            {stall.description && <p className="hint">{stall.description}</p>}
            {stall.itemIds.map((itemId) => {
              const item = content.items.find((i) => i.id === itemId)
              if (!item) return null
              const check = canBuy(content, state, item.id)
              const owned = state.inventory[item.id] ?? 0
              return (
                <div key={item.id} className="ware">
                  <span className="ware-icon">
                    <ItemIcon name={item.icon} />
                  </span>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                  </div>
                  {owned > 0 && <span className="chip">Carrying {owned}</span>}
                  <button
                    disabled={!check.ok}
                    title={check.reasons.join(' · ')}
                    onClick={() => onBuy(item.id)}
                  >
                    Buy · {item.price}
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="hint">No stalls are trading here.</p>
        )}
      </div>
    </main>
  )
}
