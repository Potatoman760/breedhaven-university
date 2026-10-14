import { useState } from 'react'
import { canGoBelow, depthsOpen, describeChange, outingMisses, partyChoices, pregnancyPower, relicsHeld, spriteFor, wornOutfit } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Facts } from './Facts'
import { ChevronIcon } from './icons'

interface Props {
  content: ContentPack
  state: GameState
  /** Goes below, to a depth, with these women. */
  onGo: (partyIds: string[], depth: number) => void
  onClose: () => void
}

/** Before going below: how deep, and who comes. */
export function PartyDialog({ content, state, onGo, onClose }: Props) {
  const config = content.expedition!
  const open = depthsOpen(content, state)
  const [depth, setDepth] = useState(open - 1)
  const [party, setParty] = useState<string[]>([])
  const choices = partyChoices(content, state)
  const check = canGoBelow(content, state, party, depth)
  const relics = relicsHeld(content, state)
  // What going would cost him of his day: a class, a shift or a plan in those hours.
  const missed = outingMisses(content, state, { title: config.name, description: '', withIds: party, locationId: config.entryLocationId, hours: config.hours })
  const shown = config.depths[depth]
  const toggle = (id: string) => setParty(party.includes(id) ? party.filter((one) => one !== id) : party.length < config.partySize ? [...party, id] : party)

  return (
    <Dialog title="Go below" note={config.name} onClose={onClose} noClose wide>
      <Facts
        facts={[
          { label: 'Takes', value: `${config.hours} hours` },
          { label: 'Anchors set', value: `${state.expedition.cleared} of ${config.depths.length}` },
          { label: 'Relics', value: relics.length, title: relics.map((relic) => `${relic.name}: ${describeChange(relic.modifier)}`).join('\n') || undefined },
          { label: 'Party', value: `${party.length} of ${config.partySize}` }
        ]}
      />

      {/* One depth at a time, with room for its picture, and a way to the one above or below it among those he has opened. It opens on the deepest. */}
      <h2 className="party-heading">Depth</h2>
      <div className="depth-carousel">
        <Button variant="secondary" className="flip" aria-label="The depth above" disabled={depth <= 0} onClick={() => setDepth(depth - 1)}>
          <ChevronIcon size={16} />
        </Button>
        <div className="depth-card">
          <span className="depth-art" style={shown.image ? { backgroundImage: `url("content://pack/${shown.image}")` } : undefined}>
            {!shown.image && <span className="depth-number">{depth + 1}</span>}
          </span>
          <strong>
            {depth + 1}. {shown.name}
          </strong>
          <span className="caps">
            {depth < state.expedition.cleared ? 'Anchor set' : 'Anchor unset'} · {depth + 1} of {config.depths.length}
          </span>
        </div>
        <Button variant="secondary" aria-label="The depth below" disabled={depth >= open - 1} title={depth >= open - 1 && open < config.depths.length ? 'Set this anchor to open the next' : undefined} onClick={() => setDepth(depth + 1)}>
          <ChevronIcon size={16} />
        </Button>
      </div>

      <h2 className="party-heading">Who comes</h2>
      <div className="party-grid">
        {choices.map(({ li, role, reason }) => {
          const power = pregnancyPower(content, state, li.id) ?? 1
          const chosen = party.includes(li.id)
          const full = !chosen && party.length >= config.partySize
          const sprite = spriteFor(li, wornOutfit(content, state, li), 'neutral')
          return (
            <button key={li.id} type="button" aria-pressed={chosen} className={`party-card${chosen ? ' picked' : ''}`} disabled={reason !== undefined || full} title={reason ?? (full ? `No more than ${config.partySize} can come` : power > 1 ? `Carrying: x${power} power, and a surge to ground` : undefined)} onClick={() => toggle(li.id)}>
              <span className="party-face" style={sprite ? { backgroundImage: `url("content://pack/${sprite}")`, backgroundPosition: `50% ${li.faceY}%` } : undefined} />
              <strong>{li.name.split(' ')[0]}</strong>
              <span className="caps">{role.name}</span>
              {power > 1 && !reason && <span className="party-badge">x{power}</span>}
            </button>
          )
        })}
        {choices.length === 0 && <p className="hint">Nobody you have met could come.</p>}
      </div>

      {!check.ok && <p className="notice">{check.reasons.join(' · ')}</p>}
      {check.ok && missed.length > 0 && <p className="notice">You would miss {missed.join('; ')}.</p>}
      <div className="actions end">
        <Button variant="quiet" onClick={onClose}>
          Not now
        </Button>
        <Button variant="primary" disabled={!check.ok} onClick={() => onGo(party, depth)}>
          Go down
        </Button>
      </div>
    </Dialog>
  )
}
