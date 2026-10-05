import { bondOf, describeAge, describeBond, locationOf, stageFor, statusOf, tieLevel, tieOf } from '../../../shared/game'
import { METERS, type ContentPack, type GameState } from '../../../shared/model'
import { Dialog } from './Dialog'
import { Sprig } from './icons'

interface Props {
  content: ContentPack
  state: GameState
  loveInterestId: string
  onClose: () => void
}

/** What the player knows about a love interest: standing, traits and shared memories. */
export function CharPanel({ content, state, loveInterestId, onClose }: Props) {
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  if (!li) return null

  const rel = state.relationships[li.id]
  const stage = stageFor(content.relationships, rel.affection)
  const where = content.locations.find((l) => l.id === locationOf(content, state, li))
  const memories = state.memories[li.id] ?? []
  const bond = bondOf(state, li.id)
  // How she and the other love interests feel about each other, where there is anything to say.
  const ties = content.loveInterests
    .filter((other) => other.id !== li.id && tieOf(content, state, li.id, other.id) > 0)
    .map((other) => ({ other, value: tieOf(content, state, li.id, other.id) }))
    .sort((a, b) => b.value - a.value)

  return (
    <Dialog title={li.name} onClose={onClose} narrow>
      <div className="char">
        <div className="chips">
          <span className="chip madder">{stage.name}</span>
          {bond && (
            <span className="chip dark" title={statusOf(content, bond)?.description}>
              {describeBond(content, { ...bond, memberIds: bond.memberIds.filter((id) => id !== li.id) }).replace(/ with $/, '')}
            </span>
          )}
          {content.traits
            .filter((t) => li.traitIds.includes(t.id))
            .map((t) => (
              <span key={t.id} className="chip" title={t.definition}>
                {t.name}
              </span>
            ))}
        </div>
        <p>{li.bio}</p>
        <p className="hint">{where ? `Right now: at ${where.name}.` : 'Whereabouts unknown right now.'}</p>

        {METERS.map((meter) => (
          <div key={meter} className="meter-row">
            <span>{meter}</span>
            <div className={`meter ${meter}`}>
              <div style={{ width: `${(rel[meter] / content.relationships.meterMax) * 100}%` }} />
            </div>
            <strong>{rel[meter]}</strong>
          </div>
        ))}

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

        <Sprig width={300} />
        <h2>What {li.name.split(' ')[0]} remembers</h2>
        {memories.length === 0 && (
          <p className="hint">Nothing yet. Each scene you share becomes one short memory.</p>
        )}
        {[...memories].reverse().map((m, i) => (
          <div key={i} className="card">
            <span className="hint">{describeAge(content, m, state.time)}</span>
            <span>{m.summary}</span>
          </div>
        ))}
      </div>
    </Dialog>
  )
}
