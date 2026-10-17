import { useState, type ReactNode } from 'react'
import { canBuy, priceOf } from '../../../shared/game'
import type { ContentPack, GameState, Stall } from '../../../shared/model'
import { Button } from './Button'
import { ItemIcon } from './icons'
import { ItemSquare } from './ItemSquare'

interface Props {
  content: ContentPack
  state: GameState
  /** The stalls to choose between: a row each, down the left. */
  stalls: Stall[]
  /** Ordered from his phone: from any stall, wherever he is and whatever the hour. */
  byPhone?: boolean
  /** Said in place of the stalls' wares when nothing can be bought just now, and why. */
  closed?: ReactNode
  onBuy: (itemId: string) => void
}

/**
 * The market as it is on his phone, laid out as his DMs are: the stalls down the left, and
 * on the right what the one picked sells, with the way to buy it.
 */
export function Stalls({ content, state, stalls, byPhone = false, closed, onBuy }: Props) {
  const [stallId, setStallId] = useState(stalls[0]?.id)
  const stall = stalls.find((s) => s.id === stallId) ?? stalls[0]
  const carrying = Object.values(state.inventory).reduce((total, count) => total + count, 0)

  return (
    <>
      <div className="chat-list">
        <div className="chat-rows">
          {stalls.length === 0 && <p className="hint">No stalls are trading.</p>}
          {stalls.map((s) => (
            <button key={s.id} className={s.id === stall?.id ? 'chat-row selected' : 'chat-row'} onClick={() => setStallId(s.id)}>
              <span className="ware-icon">
                <ItemIcon name={s.icon} image={s.iconImage} />
              </span>
              <span className="chat-row-text">
                <strong>{s.name}</strong>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="chat-thread">
        {stall ? (
          <>
            {/* The stall is named in its row on the left: here, only what he has on him. */}
            <div className="chat-head">
              <div>
                <span className="caps">Carrying</span>
                <strong>
                  {carrying} gift{carrying === 1 ? '' : 's'}
                </strong>
              </div>
              <div className="purse">
                <span className="caps">Money</span>
                <strong>${state.player.money}</strong>
              </div>
            </div>
            <div className="stall" role="tabpanel">
              {stall.description && <p className="hint">{stall.description}</p>}
              {closed ?? (
                <div className="ware-grid">
                  {stall.itemIds.map((itemId) => {
                    const item = content.items.find((i) => i.id === itemId)
                    if (!item) return null
                    const check = canBuy(content, state, item.id, byPhone)
                    return (
                      <div key={item.id} className="bag-cell">
                        <ItemSquare icon={item.icon} image={item.image} count={state.inventory[item.id]} title={item.description} />
                        <span className="bag-name">{item.name}</span>
                        <Button variant="primary" size="small" disabled={!check.ok} title={check.reasons.join(' · ')} onClick={() => onBuy(item.id)}>
                          ${priceOf(content, state, item)}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="hint phone-empty">This content pack has no market stalls.</p>
        )}
      </div>
    </>
  )
}
