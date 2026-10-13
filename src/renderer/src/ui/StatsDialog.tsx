import { describeModifier, describeStat, STAT_CAP, STAT_TIERS, statOf, skillProgress, trainingToward } from '../../../shared/game'
import { STATS, type ContentPack, type GameState } from '../../../shared/model'
import { Dialog } from './Dialog'

/** The player's stats in full: each score, how far he is toward its next point, and where it stands on the scale of what a score is called. */
export function StatsDialog({ content, state, onClose }: { content: ContentPack; state: GameState; onClose: () => void }) {
  return (
    <Dialog title="Stats" onClose={onClose}>
      <div className="stat-sheet">
        {STATS.map((stat) => {
          const score = statOf(state, stat)
          const capped = score >= STAT_CAP
          const { banked, needed } = trainingToward(state, stat)
          return (
            <section key={stat} className="stat-row">
              <header>
                <strong className="stat-name">{stat}</strong>
                <span className="stat-score">{score}</span>
                <span className="caps">
                  {describeStat(score)} · {describeModifier(score)}
                </span>
              </header>
              {/* What each stretch of the scale is called, and where he is on it. */}
              <div className="stat-scale">
                {STAT_TIERS.map((tier, i) => {
                  const until = STAT_TIERS[i + 1]?.from ?? STAT_CAP
                  const reached = score >= tier.from
                  return (
                    <div key={tier.name} className={describeStat(score) === tier.name ? 'tier current' : reached ? 'tier reached' : 'tier'} style={{ flexGrow: until - tier.from }}>
                      <span className="tier-name">{tier.name}</span>
                    </div>
                  )
                })}
                <i className="stat-mark" style={{ left: `${(Math.min(score, STAT_CAP) / STAT_CAP) * 100}%` }} />
              </div>
              {/* The scores the names begin at, under the scale like the marks of a ruler. */}
              <div className="stat-ruler">
                {[...STAT_TIERS.map((tier) => tier.from), STAT_CAP].map((mark) => (
                  <span key={mark} style={{ left: `${(mark / STAT_CAP) * 100}%` }}>
                    {mark}
                  </span>
                ))}
              </div>
              {/* How far he is toward the next point. */}
              <div className="stat-progress">
                <div className="meter">
                  <div style={{ width: `${capped ? 100 : Math.min(100, (banked / needed) * 100)}%` }} />
                </div>
                <span>{capped ? 'As high as it goes' : `${banked} of ${needed} training points toward ${score + 1}`}</span>
              </div>
            </section>
          )
        })}
      </div>
      {content.skills.length > 0 && (
        <div className="skill-list">
          <h2>Skills</h2>
          {content.skills.map((skill) => {
            const { has, marks, at } = skillProgress(state, skill)
            const course = state.courses.find((one) => one.code === skill.code)
            return (
              <p key={skill.id} className={has ? 'skill has' : 'skill'}>
                <strong>{skill.name}</strong> {skill.description}{' '}
                <span className="hint">
                  {has ? 'Learnt.' : `${course ? `${course.number}, ${course.title}` : skill.code} teaches it at ${at} marks${marks > 0 ? `: you have ${Math.round(marks)}` : ''}.`}
                </span>
              </p>
            )
          })}
        </div>
      )}
    </Dialog>
  )
}
