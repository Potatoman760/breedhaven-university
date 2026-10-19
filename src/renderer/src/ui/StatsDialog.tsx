import { describeModifier, describeStat, STAT_CAP, STAT_TIERS, statOf, skillFor, skillProgress, skillsOf, trainingToward } from '../../../shared/game'
import { STATS, type ContentPack, type GameState } from '../../../shared/model'
import { Dialog } from './Dialog'

/** The player's stats in full: each score, how far he is toward its next point, and where it stands on the scale of what a score is called. */
export function StatsDialog({ content, state, onClose }: { content: ContentPack; state: GameState; onClose: () => void }) {
  return (
    <Dialog title="Stats" onClose={onClose} wide ornate>
      <div className="stat-sheet">
        {STATS.map((stat) => {
          const score = statOf(state, stat)
          const capped = score >= STAT_CAP
          const { banked, needed } = trainingToward(state, stat)
          return (
            <section key={stat} className="stat-row sheet">
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
          {/* What he has learnt first, then what the courses he is taking are teaching him, then the rest. */}
          <div className="sheet">
          <table>
            <thead>
              <tr>
                <th>Skill</th>
                <th>What it does</th>
                <th>Taught by</th>
                <th>Marks</th>
              </tr>
            </thead>
            <tbody>
              {content.skills
                .map((skill) => {
                  // A course of his that teaches it, if he is taking one.
                  const taking = state.courses.find((one) => state.enrolment?.includes(one.id) && skillFor(content, one)?.id === skill.id)
                  return { skill, taking, ...skillProgress(state, skill) }
                })
                .sort((a, b) => Number(b.has) - Number(a.has) || Number(!!b.taking) - Number(!!a.taking) || b.marks - a.marks)
                .map(({ skill, taking, has, marks, at, level }) => {
                  const course = taking ?? state.courses.find((one) => one.id === skill.courseId)
                  // What it does as he has it; what it would do next is in the tooltip.
                  const now = skillsOf(content, state).find((one) => one.id === skill.id) ?? skill
                  const next = level === 1 && skill.upgrade ? `At ${skill.upgrade.at} marks: ${skill.upgrade.description}` : undefined
                  return (
                    <tr
                      key={skill.id}
                      className={level === 2 ? 'has second' : has ? 'has' : taking ? 'studying' : undefined}
                      title={!has && taking ? `You are learning this in ${taking.number}` : next}
                    >
                      <td>
                        <strong>{skill.name}</strong>
                        {level === 2 && <span className="skill-level">II</span>}
                      </td>
                      <td>{now.description}</td>
                      <td title={course?.title}>{course ? course.number : `${skill.code}, not given this term`}</td>
                      <td>{level === 2 ? 'Mastered' : has && skill.upgrade ? `${Math.round(marks)} of ${at} for II` : has ? 'Learnt' : `${Math.round(marks)} of ${at}`}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </Dialog>
  )
}
