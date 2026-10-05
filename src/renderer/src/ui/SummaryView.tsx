import { describeBeat, firstNames, sceneCast, toDate, type Growth, type SceneOutcome } from '../../../shared/game'
import type { ContentPack, GameState, Scene } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import { ChevronIcon, Sprig } from './icons'

/** Everything the summary screen shows about a scene that has just ended. */
export interface SceneSummary {
  scene: Scene
  outcome: SceneOutcome | undefined
  /** The same for anyone else who was in the scene. */
  companions: { id: string; outcome: SceneOutcome | undefined }[]
  /** What each love interest in the scene will remember, by id. */
  memories: Record<string, string>
  /** Why a memory is a plain note instead of one written by the LLM, if any is. */
  memoryError?: string
}

interface Props {
  content: ContentPack
  state: GameState
  summary: SceneSummary
  backgroundId: string | undefined
  onContinue: () => void
}

function change({ from, to }: Growth): string {
  const delta = to - from
  return delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : 'no change'
}

/** Shown when a scene ends: what the player gained, how the relationship moved, and the memory kept. */
export function SummaryView({ content, state, summary, backgroundId, onContinue }: Props) {
  const { scene, outcome, memories, memoryError } = summary
  const partner = content.loveInterests.find((li) => li.id === scene.loveInterestId)
  const group = scene.companionIds.length > 0
  const everyone = firstNames(content, sceneCast(scene))
  const name = group ? everyone : (partner?.name ?? 'them')
  const firstName = partner?.name.split(' ')[0] ?? 'them'
  const date = toDate(content.calendar, state.time)
  const location = content.locations.find((l) => l.id === state.locationId)
  const max = content.relationships.meterMax

  return (
    <main className="stage">
      <Backdrop location={location} periodId={date.period.id} backgroundId={backgroundId} />
      <div className="summary glass framed">
        <div className="summary-head">
          <span className="caps">{scene.beats.map(describeBeat).join(' · ')}</span>
          <h1>Your time with {name}</h1>
          <Sprig width={220} />
        </div>

        <div className={group ? 'summary-columns wide' : 'summary-columns'}>
          <section>
            <h2>You</h2>
            {(!outcome || outcome.player.length === 0) && <p className="hint">Nothing changed.</p>}
            {outcome?.player.map((g) => (
              <div key={g.label} className="growth">
                <span>{g.label}</span>
                <span className="hint">
                  {g.from} → {g.to}
                </span>
                <strong className={g.to >= g.from ? 'up' : 'down'}>{change(g)}</strong>
              </div>
            ))}
          </section>

          <section>
            <h2>{firstName}</h2>
            {outcome && (
              <div className="chips">
                {outcome.stageBefore !== outcome.stageAfter && (
                  <span className="chip">{outcome.stageBefore} →</span>
                )}
                <span className="chip madder">{outcome.stageAfter}</span>
              </div>
            )}
            {outcome?.meters.map((g) => (
              <div key={g.label} className="growth">
                <span>{g.label}</span>
                <div className={`meter ${g.label}`}>
                  <div style={{ width: `${(g.to / max) * 100}%` }} />
                </div>
                <strong className={g.to >= g.from ? 'up' : 'down'}>{change(g)}</strong>
              </div>
            ))}
            {!outcome && <p className="hint">No record of how things stood before this scene.</p>}
            {scene.gifts.filter((gift) => (gift.recipientId ?? scene.loveInterestId) === scene.loveInterestId).map((gift, i) => (
              <div key={i} className="growth">
                <span>Gift</span>
                <span>{gift.name}</span>
                <strong className={gift.reaction === 'disliked' ? 'down' : 'up'}>{gift.reaction}</strong>
              </div>
            ))}
          </section>

          {summary.companions.map(({ id, outcome: theirs }) => (
            <section key={id}>
              <h2>{firstNames(content, [id])}</h2>
              {theirs && (
                <div className="chips">
                  {theirs.stageBefore !== theirs.stageAfter && (
                    <span className="chip">{theirs.stageBefore} →</span>
                  )}
                  <span className="chip madder">{theirs.stageAfter}</span>
                </div>
              )}
              {theirs?.meters.map((g) => (
                <div key={g.label} className="growth">
                  <span>{g.label}</span>
                  <div className={`meter ${g.label}`}>
                    <div style={{ width: `${(g.to / max) * 100}%` }} />
                  </div>
                  <strong className={g.to >= g.from ? 'up' : 'down'}>{change(g)}</strong>
                </div>
              ))}
              {scene.gifts
                .filter((gift) => gift.recipientId === id)
                .map((gift, i) => (
                  <div key={i} className="growth">
                    <span>Gift</span>
                    <span>{gift.name}</span>
                    <strong className={gift.reaction === 'disliked' ? 'down' : 'up'}>{gift.reaction}</strong>
                  </div>
                ))}
            </section>
          ))}
        </div>

        {sceneCast(scene).map((id) => (
          <section key={id}>
            <h2>What {firstNames(content, [id])} will remember</h2>
            <p className="memory">{memories[id] ?? 'Nothing in particular.'}</p>
          </section>
        ))}
        {memoryError && <p className="hint">Saved as a plain note: {memoryError}</p>}

        <button onClick={onContinue} autoFocus>
          Continue
          <ChevronIcon size={16} />
        </button>
      </div>
    </main>
  )
}
