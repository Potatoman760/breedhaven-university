import { describeBeat, firstNames, sceneCast, sceneHours, sceneWitnesses, toDate, type Growth, type SceneOutcome } from '../../../shared/game'
import { useState } from 'react'
import { MEMORY_LEVEL_LABELS, MEMORY_LEVELS, type ContentPack, type GameState, type MemoryLevel, type Scene } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import { ChevronIcon, Sprig } from './icons'
import { t } from '../../../shared/i18n'

/** Everything the summary screen shows about a scene that has just ended. */
export interface SceneSummary {
  scene: Scene
  outcome: SceneOutcome | undefined
  /** The same for anyone else who was in the scene. */
  companions: { id: string; outcome: SceneOutcome | undefined }[]
  /** What each love interest in the scene will remember, by id. */
  memories: Record<string, string>
  /** How much each of those memories matters to her, by id. */
  levels: Record<string, MemoryLevel>
  /** Why what each love interest feels moved as it did, in her own judgement, by id. */
  reasons: Record<string, string>
  /** What he paid for in the scene, and what it came to. */
  spending?: { amount: number; on: string }
  /** What he found out over the scene, a line each: something about one of them, or a change between two of them. */
  learned: string[]
  /** Why a memory is a plain note instead of one written by the LLM, if any is. */
  memoryError?: string
}

interface Props {
  content: ContentPack
  state: GameState
  summary: SceneSummary
  backgroundId: string | undefined
  /** Called with the memories as the player leaves them, and how much each matters, by love interest id. */
  onContinue: (memories: Record<string, string>, levels: Record<string, MemoryLevel>) => void
}

function change({ from, to }: Growth): string {
  // To a tenth: training comes in fractions, and a difference of two of them is not a round number as the machine holds it.
  const delta = Math.round((to - from) * 10) / 10
  return delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : t('screens.summaryView.noChange')
}

/** Shown when a scene ends: what the player gained, how the relationship moved, and the memory kept. */
export function SummaryView({ content, state, summary, backgroundId, onContinue }: Props) {
  const { scene, outcome, memories, levels, memoryError } = summary
  const partner = content.loveInterests.find((li) => li.id === scene.loveInterestId)
  const group = scene.companionIds.length > 0
  const everyone = firstNames(content, sceneCast(scene))
  const name = group ? everyone : (partner?.name ?? t('screens.summaryView.them'))
  const firstName = partner?.name.split(' ')[0] ?? t('screens.summaryView.them')
  const date = toDate(content.calendar, state.time)
  const location = content.locations.find((l) => l.id === state.locationId)
  const max = content.relationships.meterMax
  const spent = sceneHours(state, scene)
  const left = (id: string) => t('screens.summaryView.leftEarly', { feeling: scene.departed.find((d) => d.id === id)?.feeling })
  // The memories as the player has reworded them. They are kept as they stand on leaving.
  const [drafts, setDrafts] = useState<Record<string, string>>(memories)
  // And how much each matters, as the player has set it.
  const [levelDrafts, setLevelDrafts] = useState<Record<string, MemoryLevel>>(levels)

  return (
    <main className="stage">
      <Backdrop screen="summary" location={location} periodId={date.period.id} light={date.period.light} backgroundId={backgroundId} />
      <div className="summary glass framed">
        <div className="summary-head">
          <span className="caps">
            {scene.beats.map(describeBeat).join(' · ')}
            {spent !== undefined && spent > 0 && t('screens.summaryView.hours', { n: spent })}
          </span>
          <h1>{t('screens.summaryView.title', { name })}</h1>
          <Sprig width={220} />
        </div>

        <div className={group ? 'summary-columns wide' : 'summary-columns'}>
          <section>
            <h2>{t('screens.summaryView.you')}</h2>
            {(!outcome || outcome.player.length === 0) && <p className="hint">{t('screens.summaryView.nothingChanged')}</p>}
            {outcome?.player.map((g) => (
              <div key={g.label} className="growth">
                <span>{g.label}</span>
                <span className="hint">
                  {g.label === 'money' && '$'}
                  {g.from} → {g.label === 'money' && '$'}
                  {g.to}
                </span>
                <strong className={g.to >= g.from ? 'up' : 'down'}>{change(g)}</strong>
              </div>
            ))}
            {summary.spending && (
              <p className="hint spent">
                {summary.spending.on
                  ? t('screens.summaryView.paidFor', { amount: summary.spending.amount, on: summary.spending.on })
                  : t('screens.summaryView.paid', { amount: summary.spending.amount })}
              </p>
            )}
          </section>

          {!scene.npc && <section>
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
            {!outcome && <p className="hint">{t('screens.summaryView.noRecord')}</p>}
            {summary.reasons[scene.loveInterestId] && <p className="hint">{summary.reasons[scene.loveInterestId]}</p>}
            {scene.gifts.filter((gift) => gift.recipientId === scene.loveInterestId).map((gift, i) => (
              <div key={i} className="growth">
                <span>{t('screens.summaryView.gift')}</span>
                <span>{gift.name}</span>
                <strong className={gift.reaction === 'disliked' ? 'down' : 'up'}>{t('screens.summaryView.reaction', { reaction: gift.reaction })}</strong>
              </div>
            ))}
          </section>}

          {summary.companions.map(({ id, outcome: theirs }) => (
            <section key={id}>
              <h2>{firstNames(content, [id])}</h2>
              {scene.departed.some((d) => d.id === id) && (
                <span className="hint">{left(id)}</span>
              )}
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
              {summary.reasons[id] && <p className="hint">{summary.reasons[id]}</p>}
              {scene.gifts
                .filter((gift) => gift.recipientId === id)
                .map((gift, i) => (
                  <div key={i} className="growth">
                    <span>{t('screens.summaryView.gift')}</span>
                    <span>{gift.name}</span>
                    <strong className={gift.reaction === 'disliked' ? 'down' : 'up'}>{t('screens.summaryView.reaction', { reaction: gift.reaction })}</strong>
                  </div>
                ))}
            </section>
          ))}
        </div>

        {scene.conceived.length > 0 && (
          <p className="agreed">
            {t('screens.summaryView.conceived', { names: firstNames(content, scene.conceived), many: scene.conceived.length > 1 })}
          </p>
        )}

        {/* An NPC keeps no memory of a scene: there is nothing of hers to read or reword. */}
        {(scene.npc ? [] : sceneWitnesses(scene)).map((id) => (
          <section key={id}>
            <h2>{t('screens.summaryView.willRemember', { name: firstNames(content, [id]) })}</h2>
            <textarea
              className="memory"
              rows={3}
              maxLength={600}
              aria-label={t('screens.summaryView.willRemember', { name: firstNames(content, [id]) })}
              value={drafts[id] ?? ''}
              placeholder={t('screens.summaryView.forget')}
              onChange={(e) => setDrafts({ ...drafts, [id]: e.target.value })}
            />
            <div className="memory-level">
              <label className="inline">
                {t('screens.summaryView.memory')}
                <select
                  aria-label={t('screens.summaryView.holdOn', { name: firstNames(content, [id]) })}
                  value={levelDrafts[id] ?? 'normal'}
                  onChange={(e) => setLevelDrafts({ ...levelDrafts, [id]: e.target.value as MemoryLevel })}
                >
                  {MEMORY_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {MEMORY_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </select>
              </label>
              {((drafts[id] ?? '') !== (memories[id] ?? '') || (levelDrafts[id] ?? 'normal') !== (levels[id] ?? 'normal')) && (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => (setDrafts({ ...drafts, [id]: memories[id] ?? '' }), setLevelDrafts({ ...levelDrafts, [id]: levels[id] ?? 'normal' }))}
                >
                  {t('screens.summaryView.putBack')}
                </button>
              )}
            </div>
          </section>
        ))}
        {!scene.npc && (
          <p className="hint">
            {t('screens.summaryView.memoryHint')}
          </p>
        )}
        {memoryError && <p className="hint">{t('screens.summaryView.plainNote', { error: memoryError })}</p>}
        {summary.learned.length > 0 && (
          <section className="learned">
            <span className="caps">{t('screens.summaryView.youLearned')}</span>
            <ul>
              {summary.learned.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}

        <button onClick={() => onContinue(drafts, levelDrafts)} autoFocus>
          {t('screens.sceneView.continue')}
          <ChevronIcon size={16} />
        </button>
      </div>
    </main>
  )
}
