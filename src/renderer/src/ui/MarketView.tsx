import { useState, type ReactNode } from 'react'
import { canBuy, priceOf } from '../../../shared/game'
import type { ContentPack, GameState, Stall } from '../../../shared/model'
import { ItemIcon } from './icons'

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
        <h1 className="phone-title">Market</h1>
        <div className="chat-rows">
          {stalls.length === 0 && <p className="hint">No stalls are trading.</p>}
          {stalls.map((s) => (
            <button key={s.id} className={s.id === stall?.id ? 'chat-row selected' : 'chat-row'} onClick={() => setStallId(s.id)}>
              <span className="ware-icon">
                <ItemIcon name={s.icon} />
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
              {closed ??
                stall.itemIds.map((itemId) => {
                  const item = content.items.find((i) => i.id === itemId)
                  if (!item) return null
                  const check = canBuy(content, state, item.id, byPhone)
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
                      <button disabled={!check.ok} title={check.reasons.join(' · ')} onClick={() => onBuy(item.id)}>
                        Buy · ${priceOf(content, state, item)}
                      </button>
                    </div>
                  )
                })}
            </div>
          </>
        ) : (
          <p className="hint phone-empty">This content pack has no market stalls.</p>
        )}
      </div>
    </>
  )
}
