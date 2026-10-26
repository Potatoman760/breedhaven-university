import { useState, type ReactNode } from 'react'
import { MEMORY_LEVEL_LABELS, courseOf, type ContentPack, type GameState } from '../../../shared/model'
import { SLEEP_OVER_FROM_HOUR, STOOD_UP, describeAction } from '../../../shared/game'
import { t, type MessageKey } from '../../../shared/i18n'
import { CodexBook } from './CodexBook'
import { Dialog } from './Dialog'

const TABS = ['Basics', 'Conversation', 'Stats and study', 'Relationships', 'Sex and pregnancy', 'House and children', 'Money and jobs', 'The Undercroft', 'The world'] as const
export type HelpTab = (typeof TABS)[number]
type Tab = HelpTab

// What each tab is called on screen: the tabs themselves are known by these English names wherever Help is opened on one.
const TAB_LABELS: Record<Tab, MessageKey> = {
  Basics: 'shell.help.tabBasics',
  Conversation: 'shell.help.tabConversation',
  'Stats and study': 'shell.help.tabStats',
  Relationships: 'shell.help.tabRelationships',
  'Sex and pregnancy': 'shell.help.tabSex',
  'House and children': 'shell.help.tabHouse',
  'Money and jobs': 'shell.help.tabMoney',
  'The Undercroft': 'shell.help.tabUndercroft',
  'The world': 'shell.help.tabWorld'
}

interface Props {
  content: ContentPack
  state: GameState
  /** The subject it opens on. Left out, the basics. */
  tab?: HelpTab
  onClose: () => void
}

/** A table of plain cells: a heading row, then the rest. */
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table>
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell}>{cell}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const percent = (fraction: number) => t('shell.help.percent', { n: Math.round(fraction * 100) })

/**
 * How the game works, for the player: its rules in brief, a tab to a subject. The numbers are read from the content,
 * so that what it says is what the game does.
 */
// What a course is worth below, in a few words, by the kind of its modifier.
const BELOW: Record<string, MessageKey> = {
  might: 'shell.help.belowMight',
  footing: 'shell.help.belowFooting',
  anchoring: 'shell.help.belowAnchoring',
  surge: 'shell.help.belowSurge',
  spoils: 'shell.help.belowSpoils',
  grounding: 'shell.help.belowGrounding',
  ambush: 'shell.help.belowAmbush',
  steady: 'shell.help.belowSteady',
  insight: 'shell.help.belowInsight'
}

export function HelpPanel({ content, state, tab: opening = 'Basics', onClose }: Props) {
  const [tab, setTab] = useState<Tab>(opening)
  const { relationships, pregnancy, housing, jobs, calendar } = content
  const below = content.expedition
  const traitName = (id: string) => content.traits.find((trait) => trait.id === id)?.name ?? id
  const names = (ids: string[]) => ids.map(traitName).join(', ') || t('shell.help.none')
  const rules = relationships.intimacy
  const max = relationships.meterMax

  return (
    <Dialog title={t('shell.help.title')} onClose={onClose} wide ornate>
      <div className="help">
        <div className="tabs" role="tablist">
          {TABS.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'tab selected' : 'tab'} onClick={() => setTab(name)}>
              {t(TAB_LABELS[name])}
            </button>
          ))}
        </div>

        {tab === 'The world' && <CodexBook content={content} state={state} />}

        {tab === 'Basics' && (
          <div className="help-page sheet">
            <h2>{t('shell.help.termHeading')}</h2>
            <ul>
              <li>{t('shell.help.termLength', { days: calendar.lengthDays })}</li>
              <li>{t('shell.help.termHours')}</li>
              <li>{t('shell.help.termFocus')}</li>
              <li>{t('shell.help.termSleep')}</li>
            </ul>
            <h2>{t('shell.help.dayHeading')}</h2>
            <Table
              head={[t('shell.help.dayButton'), t('shell.help.dayDoes')]}
              rows={[
                [t('shell.help.dayMap'), t('shell.help.dayMapDoes', { below: below !== undefined, name: below?.name ?? '' })],
                [t('shell.help.dayPhone'), t('shell.help.dayPhoneDoes')],
                [t('shell.help.dayCalendar'), t('shell.help.dayCalendarDoes')],
                [t('shell.help.dayBag'), t('shell.help.dayBagDoes')],
                ...(housing ? [[housing.name, t('shell.help.dayHouseDoes')]] : []),
                [t('shell.help.dayHelp'), t('shell.help.dayHelpDoes')],
                [t('shell.help.dayMenu'), t('shell.help.dayMenuDoes')]
              ]}
            />
            <h2>{t('shell.help.scenesHeading')}</h2>
            <ul>
              <li>{t('shell.help.scenesOpen')}</li>
              <li>{t('shell.help.scenesEnd')}</li>
              <li>{t('shell.help.scenesScroll')}</li>
              <li>{t('shell.help.scenesStop')}</li>
              <li>{t('shell.help.scenesSummary')}</li>
            </ul>
          </div>
        )}

        {tab === 'Conversation' && (
          <div className="help-page sheet">
            <h2>{t('shell.help.talkHeading')}</h2>
            <ul>
              <li>{t('shell.help.talkIntro')}</li>
            </ul>
            <Table
              head={[t('shell.help.talkWant'), t('shell.help.talkHow'), t('shell.help.talkKnow')]}
              rows={[
                [t('shell.help.contactWant'), t('shell.help.contactHow'), t('shell.help.contactKnow')],
                [t('shell.help.knowWant'), t('shell.help.knowHow'), t('shell.help.knowKnow')],
                [t('shell.help.secretsWant'), t('shell.help.secretsHow'), t('shell.help.secretsKnow')],
                [t('shell.help.againWant'), t('shell.help.againHow'), t('shell.help.againKnow', { affection: -STOOD_UP.affection, trust: -STOOD_UP.trust })],
                [t('shell.help.goWant'), t('shell.help.goHow'), t('shell.help.goKnow')],
                [t('shell.help.eventWant'), t('shell.help.eventHow'), t('shell.help.eventKnow')],
                [t('shell.help.bondWant'), t('shell.help.bondHow'), t('shell.help.bondKnow')],
                [t('shell.help.controlWant'), t('shell.help.controlHow'), t('shell.help.controlKnow')],
                [t('shell.help.nightWant'), t('shell.help.nightHow', { hour: SLEEP_OVER_FROM_HOUR }), t('shell.help.nightKnow')]
              ]}
            />
            <h2>{t('shell.help.readingHeading')}</h2>
            <ul>
              <li>{t('shell.help.readingEnd')}</li>
              <li>{t('shell.help.readingPress')}</li>
              <li>{t('shell.help.readingClass')}</li>
              <li>{t('shell.help.readingGift')}</li>
            </ul>
            <h2>{t('shell.help.betweenHeading')}</h2>
            <ul>
              <li>{t('shell.help.betweenMessage')}</li>
              <li>{t('shell.help.betweenInvites')}</li>
              <li>{t('shell.help.betweenFeed')}</li>
            </ul>
          </div>
        )}

        {tab === 'Stats and study' && (
          <div className="help-page sheet">
            <h2>{t('shell.help.statsHeading')}</h2>
            <ul>
              <li>{t('shell.help.statsSix')}</li>
              <li>{t('shell.help.statsRise')}</li>
              <li>{t('shell.help.statsSlow')}</li>
            </ul>
            <Table
              head={[t('shell.help.statsDo'), t('shell.help.statsHow')]}
              rows={[
                [t('shell.help.statsJobs'), t('shell.help.statsJobsHow')],
                [t('shell.help.statsAppeal'), t('shell.help.statsAppealHow')],
                [t('shell.help.statsStudy'), t('shell.help.statsStudyHow')]
              ]}
            />
            <h2>{t('shell.help.coursesHeading')}</h2>
            <ul>
              <li>{t('shell.help.coursesClass')}</li>
              <li>{t('shell.help.coursesPoints')}</li>
              <li>{t('shell.help.coursesExams')}</li>
              <li>{t('shell.help.coursesGrades')}</li>
            </ul>
            {content.societies && (
              <>
                <h2>{t('shell.help.societiesHeading')}</h2>
                <ul>
                  <li>
                    {t('shell.help.societiesMeet', {
                      hours: content.societies.hours,
                      fair: content.calendar.events.find((event) => event.id === content.societies!.fairId)?.name ?? t('shell.help.societiesTheirFair')
                    })}
                  </li>
                  <li>{t('shell.help.societiesMost', { most: content.societies.maxJoined })}</li>
                  {content.societies.fair && <li>{t('shell.help.societiesFair')}</li>}
                  <li>{t('shell.help.societiesScene')}</li>
                </ul>
              </>
            )}
            {content.skills.length > 0 && (
              <>
                <h2>{t('shell.help.skillsHeading')}</h2>
                <ul>
                  <li>{t('shell.help.skillsTaught')}</li>
                  <li>{t('shell.help.skillsKinds')}</li>
                  <li>{t('shell.help.skillsAbilities')}</li>
                  <li>{t('shell.help.skillsBrews')}</li>
                </ul>
                <Table
                  head={[t('shell.help.skillsSkill'), t('shell.help.skillsBy'), t('shell.help.skillsAt'), t('shell.help.skillsDoes')]}
                  rows={content.skills.flatMap((skill) => {
                    const course = state.courses.find((one) => courseOf(one) === skill.courseId)?.title ?? skill.code
                    const first = [skill.name, course, t('shell.help.marks', { n: skill.at }), skill.description]
                    return skill.upgrade ? [first, [t('shell.common.skillTwo', { name: skill.name }), course, t('shell.help.marks', { n: skill.upgrade.at }), skill.upgrade.description]] : [first]
                  })}
                />
              </>
            )}
          </div>
        )}

        {tab === 'The Undercroft' && !below && (
          <div className="help-page sheet">
            <p className="hint">{t('shell.help.belowNone')}</p>
          </div>
        )}
        {tab === 'The Undercroft' && below && (
          <div className="help-page sheet">
            <h2>{t('shell.help.belowInHeading')}</h2>
            <ul>
              <li>{t('shell.help.belowFromDay', { day: below.opensOnDay, place: content.locations.find((l) => l.id === below.entryLocationId)?.name ?? '' })}</li>
              <li>
                {t('shell.help.belowGoDownBefore')}
                <strong>{t('shell.help.belowGoDown')}</strong>
                {t('shell.help.belowGoDownAfter', { hours: below.hours })}
              </li>
              <li>{t('shell.help.belowParty', { most: below.partySize, trust: below.trustNeeded })}</li>
            </ul>

            <h2>{t('shell.help.runHeading')}</h2>
            <Table
              head={[t('shell.help.runStop'), t('shell.help.runHappens')]}
              rows={[
                [t('shell.help.runFight'), t('shell.help.runFightDoes')],
                [t('shell.help.runFind'), t('shell.help.runFindDoes')],
                [t('shell.help.runCheckpoint'), t('shell.help.runCheckpointDoes', { n: Math.round(below.checkpointRest * 100) })],
                [t('shell.help.runGuardian'), t('shell.help.runGuardianDoes')]
              ]}
            />
            <ul>
              <li>{t('shell.help.runAnchor', { n: below.depths.length })}</li>
              <li>{t('shell.help.runTurnBack')}</li>
              <li>{t('shell.help.runLose')}</li>
              <li>{t('shell.help.runRemember')}</li>
            </ul>

            <h2>{t('shell.help.fightHeading')}</h2>
            <ul>
              <li>{t('shell.help.fightOrder')}</li>
              <li>{t('shell.help.fightFooting')}</li>
              <li>{t('shell.help.fightWard')}</li>
              <li>{t('shell.help.fightEnergy')}</li>
              <li>{t('shell.help.fightAffection')}</li>
            </ul>
            <Table
              head={[t('shell.help.turnHeading'), t('shell.help.turnDoes')]}
              rows={[
                [t('shell.help.turnAttack'), t('shell.help.turnAttackDoes')],
                [t('shell.help.turnProtect'), t('shell.help.turnProtectDoes')],
                [t('shell.help.turnEmpower'), t('shell.help.turnEmpowerDoes', { n: Math.round((below.anchorPower - 1) * 100), energy: below.anchorEnergy })],
                [t('shell.help.turnGround'), t('shell.help.turnGroundDoes', { n: below.grounds, energy: below.groundEnergy })],
                [t('shell.help.turnItem'), t('shell.help.turnItemDoes')]
              ]}
            />
            <Table
              head={[t('shell.help.roleRole'), t('shell.help.roleFooting'), t('shell.help.roleAction'), t('shell.help.roleDoes')]}
              rows={below.roles.flatMap((role) => role.actions.map((action, index) => [index === 0 ? role.name : '', index === 0 ? role.footing : '', action.name, describeAction(action)]))}
            />

            <h2>{t('shell.help.pregnancyHeading')}</h2>
            <ul>
              <li>
                {t('shell.help.pregnancyPower', {
                  list: Object.entries(below.pregnancyPower)
                    .map(([stage, power]) => t('shell.help.pregnancyPowerEach', { power, stage: content.pregnancy?.stages.find((one) => one.id === stage)?.name.toLowerCase() ?? stage }))
                    .join(', ')
                })}
              </li>
              <li>{t('shell.help.pregnancySurge', { limit: below.surgeLimit, misfire: below.misfire })}</li>
              <li>{t('shell.help.pregnancyGround')}</li>
            </ul>

            <h2>{t('shell.help.meetHeading')}</h2>
            <Table
              head={[t('shell.help.meetMarked'), t('shell.help.meetMeaning')]}
              rows={[
                [t('shell.help.meetSweeps'), t('shell.help.meetSweepsMeans')],
                [t('shell.help.meetHexes'), t('shell.help.meetHexesMeans')],
                [t('shell.help.meetFaltering'), t('shell.help.meetFalteringMeans')],
                [t('shell.help.meetWeak'), t('shell.help.meetWeakMeans')]
              ]}
            />

            <h2>{t('shell.help.upHeading')}</h2>
            <ul>
              <li>{t('shell.help.upRelics')}</li>
              <li>{t('shell.help.upMoney')}</li>
            </ul>
            <Table
              head={[t('shell.help.upDepth'), t('shell.help.upRelic'), t('shell.help.upDoes')]}
              rows={below.depths.map((depth, index) => [t('shell.help.upDepthRow', { n: index + 1, name: depth.name }), depth.relic.name, depth.relic.description])}
            />
            <Table
              head={[t('shell.help.upItem'), t('shell.help.upInFight')]}
              rows={content.items
                .filter((item) => item.below)
                .map((item) => [item.name, [item.below!.footing > 0 && t('shell.help.upFooting', { n: item.below!.footing }), item.below!.calms && t('shell.help.upCalms')].filter(Boolean).join(', ')])}
            />

            <h2>{t('shell.help.coursesBelowHeading')}</h2>
            <Table
              head={[t('shell.help.coursesBelowCourse'), t('shell.help.coursesBelowBelow')]}
              rows={content.skills
                .filter((skill) => skill.below)
                .map((skill) => {
                  const kind = BELOW[skill.below!.kind]
                  return [state.courses.find((course) => courseOf(course) === skill.courseId)?.title ?? skill.code, kind ? t(kind) : skill.below!.kind]
                })}
            />
          </div>
        )}

        {tab === 'Relationships' && (
          <div className="help-page sheet">
            <h2>{t('shell.help.feelingsHeading')}</h2>
            <Table
              head={[t('shell.help.feelingsFeeling'), t('shell.help.feelingsFor')]}
              rows={[
                [t('shell.help.feelingsAffection'), t('shell.help.feelingsAffectionFor')],
                [t('shell.help.feelingsTrust'), t('shell.help.feelingsTrustFor')],
                [t('shell.help.feelingsDesire'), t('shell.help.feelingsDesireFor')]
              ]}
            />
            <ul>
              <li>{t('shell.help.feelingsRange', { max })}</li>
            </ul>
            <h2>{t('shell.help.stagesHeading')}</h2>
            <Table
              head={[t('shell.help.stagesStage'), t('shell.help.stagesAffection')]}
              rows={relationships.stages.map((stage) => [stage.name, t('shell.help.stagesFrom', { n: stage.minAffection })])}
            />
            <h2>{t('shell.help.bondsHeading')}</h2>
            <Table
              head={[t('shell.help.bondsArrangement'), t('shell.help.bondsNeeds'), t('shell.help.bondsIs')]}
              rows={relationships.statuses.map((status) => [
                status.name,
                relationships.stages.find((stage) => stage.id === status.minStage)?.name ?? t('shell.help.bondsAnyStage'),
                status.description
              ])}
            />
            <ul>
              <li>{t('shell.help.bondsAsk')}</li>
              <li>{t('shell.help.bondsJealous')}</li>
            </ul>
            <h2>{t('shell.help.memoriesHeading')}</h2>
            <ul>
              <li>{t('shell.help.memoriesOne', { levels: Object.values(MEMORY_LEVEL_LABELS).join(', ') })}</li>
              <li>{t('shell.help.memoriesRecall')}</li>
            </ul>
          </div>
        )}

        {tab === 'Sex and pregnancy' && (
          <div className="help-page sheet">
            <h2>{t('shell.help.willHeading')}</h2>
            <Table
              head={[t('shell.help.willNature'), t('shell.help.willTakes')]}
              rows={[
                [t('shell.help.willEasy', { traits: names(rules.easyTraitIds) }), t('shell.help.willEasyTakes')],
                [t('shell.help.willMost'), t('shell.help.willDesire', { n: rules.minDesire })],
                [t('shell.help.willReluctant', { traits: names(rules.reluctantTraitIds) }), t('shell.help.willDesire', { n: rules.reluctantMinDesire })]
              ]}
            />
            <ul>
              <li>{t('shell.help.willSettled')}</li>
              <li>{t('shell.help.willSkill')}</li>
            </ul>
            {pregnancy && (
              <>
                <h2>{t('shell.help.conceiveHeading')}</h2>
                <Table
                  head={[t('shell.help.conceiveShe'), t('shell.help.conceiveChance')]}
                  rows={[
                    [t('shell.help.conceiveOff'), percent(pregnancy.chance)],
                    [t('shell.help.conceiveOn'), percent(pregnancy.birthControlChance)],
                    [t('shell.help.conceivePeriod', { days: pregnancy.periodDays, cycle: pregnancy.cycleDays }), t('shell.help.conceiveNone')],
                    [t('shell.help.conceivePregnant'), t('shell.help.conceiveNone')]
                  ]}
                />
                <ul>
                  <li>{t('shell.help.conceiveStart')}</li>
                  <li>{t('shell.help.conceiveSkills')}</li>
                  <li>{t('shell.help.conceiveLength', { days: pregnancy.lengthDays, recovery: pregnancy.recoveryDays })}</li>
                  <li>{t('shell.help.conceiveDaughters', { n: Math.round(pregnancy.daughterChance * 8) })}</li>
                </ul>
                <h2>{t('shell.help.birthHeading')}</h2>
                <ul>
                  <li>{t('shell.help.birthNotice', { days: pregnancy.birthNoticeDays })}</li>
                  <li>{t('shell.help.birthThere')}</li>
                  <li>{t('shell.help.birthMiss')}</li>
                </ul>
              </>
            )}
          </div>
        )}

        {tab === 'House and children' && (
          <div className="help-page sheet">
            {housing ? (
              <>
                <h2>{t('shell.help.houseHeading')}</h2>
                <ul>
                  <li>{t('shell.help.houseOffer')}</li>
                  <li>{t('shell.help.houseViewing')}</li>
                  <li>{t('shell.help.houseYours')}</li>
                </ul>
                <h2>{t('shell.help.costHeading')}</h2>
                <Table
                  head={[t('shell.help.costCost'), t('shell.help.costAmount'), t('shell.help.costWhen')]}
                  rows={[
                    [
                      t('shell.help.costRent'),
                      t('shell.help.costRentAmount', { rent: housing.rent, perChild: housing.rentRelief.perChild, floor: Math.min(housing.rent, housing.rentRelief.floor) }),
                      t('shell.help.costRentWhen')
                    ],
                    [t('shell.help.costChild'), t('shell.help.costChildAmount', { n: housing.babies.weeklyCost }), t('shell.help.costChildWhen')],
                    [
                      t('shell.help.costRooms'),
                      t('shell.help.costRoomsAmount', {
                        min: Math.min(...housing.rooms.filter((room) => room.cost > 0).map((room) => room.cost)),
                        max: Math.max(...housing.rooms.flatMap((room) => [room.cost, ...room.tiers.map((tier) => tier.cost)]))
                      }),
                      t('shell.help.costRoomsWhen')
                    ]
                  ]}
                />
                <ul>
                  <li>{t('shell.help.costGrace', { days: housing.graceDays })}</li>
                </ul>
                <h2>{t('shell.help.roomsHeading')}</h2>
                <Table
                  head={[t('shell.help.roomsAdds'), t('shell.help.roomsFor')]}
                  rows={[
                    [t('shell.help.roomsBeds'), t('shell.help.roomsBedsFor')],
                    [t('shell.help.roomsCots'), t('shell.help.roomsCotsFor')],
                    [t('shell.help.roomsComfort'), t('shell.help.roomsComfortFor')],
                    [t('shell.help.roomsStudy'), t('shell.help.roomsStudyFor')]
                  ]}
                />
                <h2>{t('shell.help.moveHeading')}</h2>
                <ul>
                  <li>{t('shell.help.moveWho', { n: housing.invite.minAffection })}</li>
                  <li>{t('shell.help.moveLeave')}</li>
                </ul>
                <h2>{t('shell.help.childrenHeading')}</h2>
                <Table
                  head={[t('shell.help.childrenHealth'), t('shell.help.childrenLevel')]}
                  rows={housing.babies.levels.map((level, i) => [
                    level.name,
                    i === 0 ? t('shell.help.childrenLowest') : i === housing.babies.startLevel ? t('shell.help.childrenStart') : ''
                  ])}
                />
                <ul>
                  <li>{t('shell.help.childrenHome')}</li>
                  <li>{t('shell.help.childrenPaid')}</li>
                  <li>{t('shell.help.childrenUnpaid')}</li>
                  <li>{t('shell.help.childrenLost')}</li>
                </ul>
              </>
            ) : (
              <p>{t('shell.help.noHousing')}</p>
            )}
          </div>
        )}

        {tab === 'Money and jobs' && (
          <div className="help-page sheet">
            {jobs ? (
              <>
                <h2>{t('shell.help.jobsHeading')}</h2>
                <ul>
                  <li>{t('shell.help.jobsBoard')}</li>
                  <li>{t('shell.help.jobsShift', { energy: jobs.energyPerHour })}</li>
                  <li>{t('shell.help.jobsQuit')}</li>
                </ul>
                <Table
                  head={[t('shell.help.jobsRule'), t('shell.help.jobsHow')]}
                  rows={[
                    [t('shell.help.jobsBonus'), t('shell.help.jobsBonusHow', { bonus: percent(jobs.bonusPerPoint), cap: percent(jobs.bonusCap) })],
                    [t('shell.help.jobsMissed'), t('shell.help.jobsMissedHow', { strike: jobs.missedStrike, excused: jobs.excusedStrike })],
                    [t('shell.help.jobsLose'), t('shell.help.jobsLoseHow', { strikes: jobs.strikes })]
                  ]}
                />
              </>
            ) : (
              <p>{t('shell.help.noJobs')}</p>
            )}
            <h2>{t('shell.help.spendingHeading')}</h2>
            <ul>
              <li>{t('shell.help.spendingGifts')}</li>
              <li>{t('shell.help.spendingScene')}</li>
              {housing && <li>{t('shell.help.spendingHouse')}</li>}
            </ul>
            {content.poker && (
              <>
                <h2>{t('shell.help.cardsHeading')}</h2>
                <ul>
                  <li>
                    {t('shell.help.cardsTable', {
                      name: content.poker.name,
                      place: content.locations.find((l) => l.id === content.poker!.locationId)?.name ?? '',
                      small: content.poker.smallBlind,
                      big: content.poker.bigBlind,
                      cap: content.poker.handCap
                    })}
                  </li>
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
