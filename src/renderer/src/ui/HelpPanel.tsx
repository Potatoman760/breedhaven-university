import { useState, type ReactNode } from 'react'
import { MEMORY_LEVEL_LABELS, type ContentPack, type GameState } from '../../../shared/model'
import { SLEEP_OVER_FROM_HOUR, STOOD_UP, describeAction, describeChange } from '../../../shared/game'
import { CodexBook } from './CodexBook'
import { Dialog } from './Dialog'

const TABS = ['Basics', 'Conversation', 'Stats and study', 'Relationships', 'Sex and pregnancy', 'House and children', 'Money and jobs', 'The Undercroft', 'The world'] as const
type Tab = (typeof TABS)[number]

interface Props {
  content: ContentPack
  state: GameState
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

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`

/**
 * How the game works, for the player: its rules in brief, a tab to a subject. The numbers are read from the content,
 * so that what it says is what the game does.
 */
// What a course is worth below, in a few words, by the kind of its modifier.
const BELOW: Record<string, string> = {
  might: 'Your strike does more',
  footing: 'Everyone can take more',
  anchoring: 'Empower gives her more',
  surge: 'A surge builds half as fast',
  spoils: 'More money found',
  grounding: 'Ground clears all of a surge',
  ambush: 'You always act first',
  steady: 'A hex on your party lasts half as long',
  insight: 'Shows what each enemy is weak to'
}

export function HelpPanel({ content, state, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('Basics')
  const { relationships, pregnancy, housing, jobs, calendar } = content
  const below = content.expedition
  const traitName = (id: string) => content.traits.find((trait) => trait.id === id)?.name ?? id
  const names = (ids: string[]) => ids.map(traitName).join(', ') || 'none'
  const rules = relationships.intimacy
  const max = relationships.meterMax

  return (
    <Dialog title="Help" onClose={onClose} wide ornate>
      <div className="help">
        <div className="tabs" role="tablist">
          {TABS.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'tab selected' : 'tab'} onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
        </div>

        {tab === 'The world' && <CodexBook content={content} state={state} />}

        {tab === 'Basics' && (
          <div className="help-page sheet">
            <h2>The term</h2>
            <ul>
              <li>The game runs for one term of {calendar.lengthDays} days. When the last day ends, the epilogue tells what became of you.</li>
              <li>Everything you do takes whole hours. Classes, shifts and plans happen at set hours whether you turn up or not.</li>
              <li>Pick a Focus on the day screen, under who is here: when you skip ahead to your next class, shift or plan, the hours in between are spent on it, at half the rate of a session and for no energy.</li>
              <li>Midnight to 06:00 is for sleep. End the day skips to 06:00 the next morning with full energy.</li>
            </ul>
            <h2>The day screen</h2>
            <Table
              head={['Button', 'What it does']}
              rows={[
                ['Map', `The town, with who is at each place beside it. Press Go on a place to walk there.${below ? ` Once you know of it, the way down into ${below.name} glows.` : ''}`],
                ['Phone', 'Friends, messages, the photo feed, the jobs board and the market.'],
                ['Calendar', 'Your week by the hour, or the month. Press anything on it to read about it; a class shows who is in it.'],
                ['Bag', 'What you carry, what you can make, and the relics you hold.'],
                ...(housing ? [[housing.name, 'Your house, once you have one.']] : []),
                ['Help', 'How the game works.'],
                ['Menu', 'Save, load, settings.']
              ]}
            />
            <h2>Scenes</h2>
            <ul>
              <li>Doing something with someone opens a scene. You type; she answers in her own voice.</li>
              <li>She decides when a scene ends, and can leave early if she is uncomfortable.</li>
              <li>Scroll up over the text box to go back to an earlier turn and say something else.</li>
              <li>While she is answering, the stop button beside the text box halts it.</li>
              <li>When a scene ends, a summary shows how her feelings changed and what she will remember.</li>
            </ul>
          </div>
        )}

        {tab === 'Conversation' && (
          <div className="help-page sheet">
            <h2>What talking gets you</h2>
            <ul>
              <li>Nearly everything between you and a woman is settled in what is said. There are no buttons for it: ask, offer, suggest, and she answers as herself.</li>
            </ul>
            <Table
              head={['You want', 'How', 'Good to know']}
              rows={[
                ['Her Bloomr contact', 'Ask her for it.', 'You cannot message her without it. She may refuse or put you off if she barely knows you, and offers it unasked once she is taken with you.'],
                ['To know her', 'Ask about her, and listen.', 'Her likes, dislikes, nature and what she is drawn to fill in on her phone profile as they come out.'],
                ['Her secrets', 'Earn them.', 'Each has its own condition, such as a stage or enough trust. Until then she deflects, however you ask.'],
                ['To see her again', 'Agree a day and a time.', `It goes on your calendar. Stand her up and she loses ${-STOOD_UP.affection} affection and ${-STOOD_UP.trust} trust, and remembers it.`],
                ['To go somewhere together', 'Suggest it.', 'If she agrees, the scene moves there and carries on, and the clock moves with it.'],
                ['Her company at an event', 'Ask whether she is going.', 'If she says she will be there, she is there when you go.'],
                ['A relationship', 'Raise it, or wait for her to.', 'She proposes an arrangement; you accept or decline. Each needs a stage first.'],
                ['Her off birth control', 'Talk about wanting a child.', 'It is her decision. She may also decide it on her own.'],
                ['The night together', `Be with her from ${SLEEP_OVER_FROM_HOUR}:00 on.`, 'If the scene ends with the two of you falling asleep, you wake there in the morning, rested.']
              ]}
            />
            <h2>Reading her</h2>
            <ul>
              <li>She decides when a scene is over, and says goodbye in her own way.</li>
              <li>Press her on something she does not want and she grows uneasy, changes the subject, and in the end leaves. Easing off brings her back.</li>
              <li>A class she has to get to pulls her away too.</li>
              <li>Give a gift from the Bag button in a scene. She reacts on the spot, and a gift she loves or hates tells you something about her.</li>
            </ul>
            <h2>Between scenes</h2>
            <ul>
              <li>Message anyone whose Bloomr you have from the phone. She answers when she is free, and may write to you first.</li>
              <li>Invitations arrive as messages: accept one and it is on your calendar.</li>
              <li>What she posts on her feed is hers to mention, and yours to like.</li>
            </ul>
          </div>
        )}

        {tab === 'Stats and study' && (
          <div className="help-page sheet">
            <h2>Stats</h2>
            <ul>
              <li>Six stats: strength, dexterity, endurance, intelligence, charisma, wisdom. 10 is ordinary; the cap is 30.</li>
              <li>They rise through work on them: classes, the Stats option on the day screen, and shifts at a job that builds one.</li>
              <li>A day&apos;s work on one stat counts less after the first few points, so stats are built over weeks. They never fall.</li>
            </ul>
            <Table
              head={['What stats do', 'How']}
              rows={[
                ['Jobs', 'Better jobs require higher stats, and pay a bonus for every point over the requirement.'],
                ['Appeal', 'Each woman admires up to three stats. The higher yours are, the faster her affection grows.'],
                ['Study', 'Studying in your own room earns more; a study at home adds to it.']
              ]}
            />
            <h2>Courses</h2>
            <ul>
              <li>Every class has one or two women you can know in it, counting the teacher: sitting it is a scene with them.</li>
              <li>Each course has 100 points to earn over the term: attending class earns most, studying earns the rest.</li>
              <li>Midterms and finals replace a class in their week, and ask about the classes you sat.</li>
              <li>80% of the marks is a B and 60% a C. Every answer right lifts either by a letter. Under 60%, or not turning up, is an F.</li>
            </ul>
            {content.societies && (
              <>
                <h2>Societies</h2>
                <ul>
                  <li>
                    Student clubs, each meeting for {content.societies.hours === 1 ? 'an hour' : `${content.societies.hours} hours`} once a week after classes. They open at{' '}
                    {content.calendar.events.find((event) => event.id === content.societies!.fairId)?.name ?? 'their fair'}; join or leave them on the phone after that.
                  </li>
                  <li>You can belong to {content.societies.maxJoined} at a time, and not two that meet at the same hour. A meeting can clash with a shift.</li>
                  {content.societies.fair && (
                    <li>At the fair, every student is at one of her society's tables. Saying hello costs nothing and counts as meeting her; stopping to talk takes an hour. Each table gives something away the first time you stop.</li>
                  )}
                  <li>A meeting is a scene with the students in it, and trains what the society is about, like a short class with no marks.</li>
                </ul>
              </>
            )}
            {content.skills.length > 0 && (
              <>
                <h2>Skills</h2>
                <ul>
                  <li>Every course teaches one thing once you have enough marks in it, for as long as you stay enrolled.</li>
                  <li>Some let you see something about a woman. Some change a number for good: wages, rent, how fast trust grows.</li>
                  <li>Some let you make or set off something, then wait days to do it again. Find those in your Bag, on the day screen or behind the Bag button in a scene.</li>
                  <li>What you brew is an item: drink it yourself, or use it on the woman you are with. The Bag shows what is in effect and for how long.</li>
                </ul>
                <Table
                  head={['Skill', 'Taught by', 'At', 'What it does']}
                  rows={content.skills.map((skill) => [skill.name, state.courses.find((course) => course.code === skill.code && (skill.level === undefined || course.level === skill.level))?.title ?? skill.code, `${skill.at} marks`, skill.description])}
                />
              </>
            )}
          </div>
        )}

        {tab === 'The Undercroft' && !below && (
          <div className="help-page sheet">
            <p className="hint">There is nothing under the University in this game.</p>
          </div>
        )}
        {tab === 'The Undercroft' && below && (
          <div className="help-page sheet">
            <h2>Getting in</h2>
            <ul>
              <li>From day {below.opensOnDay} someone asks to meet you at {content.locations.find((l) => l.id === below.entryLocationId)?.name}. It cannot be put off: once it is next on your day, it is all there is to do.</li>
              <li>After that meeting, <strong>Go down</strong> is offered there. A run takes {below.hours} hours of your day, however it ends.</li>
              <li>Pick a depth you have opened and up to {below.partySize} women. She must have met you, trust you ({below.trustNeeded}), be free for those hours, and not be about to give birth.</li>
            </ul>

            <h2>A run</h2>
            <Table
              head={['Stop', 'What happens']}
              rows={[
                ['Fight', 'Beat what is there to pick up what it was guarding.'],
                ['Find', 'Something lying about: picked up as you pass.'],
                ['Checkpoint', `What you have found so far is made safe, and everyone gets back ${Math.round(below.checkpointRest * 100)}% of their footing.`],
                ['Guardian', 'The last fight. Win it and you set the anchor.']
              ]}
            />
            <ul>
              <li>Setting an anchor for the first time gives you its relic and opens the next depth. There are {below.depths.length}.</li>
              <li>Turning back keeps only what was made safe at a checkpoint.</li>
              <li>Losing keeps the same, leaves you with no energy for the day, and costs the trust of whoever went down.</li>
              <li>Whoever came remembers it, and a win raises her trust.</li>
            </ul>

            <h2>A fight</h2>
            <ul>
              <li>You act first, then each woman, then the enemies. Without the right course, they get a free blow about half the time as a fight begins.</li>
              <li>Footing is health. At none she is down until the fight is over.</li>
              <li>A ward shows as a blue band on everyone's footing: it takes the next hits meant for any of you.</li>
              <li>The blue bar under your footing is energy, the same energy as above ground.</li>
              <li>Her affection makes her strike true more often, for half as much again.</li>
            </ul>
            <Table
              head={['On your turn', 'What it does']}
              rows={[
                ['Attack', 'Hits one enemy. Stronger with strength.'],
                ['Protect', 'The next hit meant for her lands on you, and less of it for your endurance.'],
                ['Empower', `Her next action is about ${Math.round((below.anchorPower - 1) * 100)}% stronger, more with wisdom. ${below.anchorEnergy} energy.`],
                ['Ground', `Takes ${below.grounds} off a pregnant woman's surge. ${below.groundEnergy} energy.`],
                ['An item', 'Something from your bag that works below.']
              ]}
            />
            <Table
              head={['Role', 'Footing', 'Action', 'What it does']}
              rows={below.roles.flatMap((role) => role.actions.map((action, index) => [index === 0 ? role.name : '', index === 0 ? role.footing : '', action.name, describeAction(action)]))}
            />

            <h2>Pregnancy</h2>
            <ul>
              <li>A woman who is carrying does more: {Object.entries(below.pregnancyPower).map(([stage, power]) => `x${power} ${content.pregnancy?.stages.find((one) => one.id === stage)?.name.toLowerCase() ?? stage}`).join(', ')}.</li>
              <li>Each thing she does adds to her surge, the orange bar under her footing. At {below.surgeLimit} it breaks loose: {below.misfire} from everyone, through any ward.</li>
              <li>Ground her, or use something that clears a surge, before it fills. Defending and taunting add nothing to it.</li>
            </ul>

            <h2>What you meet</h2>
            <Table
              head={['Marked', 'Meaning']}
              rows={[
                ['Sweeps', 'It hits all of you at once, for less each.'],
                ['Hexes', 'Its hit leaves her doing less for a couple of rounds.'],
                ['Faltering', 'Weakened by a hexer: it hits less hard for now.'],
                ['Weak to', 'One role does half as much again to it. Shown only with the right course.']
              ]}
            />

            <h2>What you bring up</h2>
            <ul>
              <li>Relics are kept for good and are listed in your Bag. Each changes a number of the game, as a course skill does.</li>
              <li>Money, and things to use in a fight, are yours once made safe.</li>
            </ul>
            <Table head={['Depth', 'Relic', 'What it does']} rows={below.depths.map((depth, index) => [`${index + 1}. ${depth.name}`, depth.relic.name, describeChange(depth.relic.modifier)])} />
            <Table
              head={['Item', 'In a fight']}
              rows={content.items.filter((item) => item.below).map((item) => [item.name, [item.below!.footing > 0 && `+${item.below!.footing} footing`, item.below!.calms && 'clears a surge'].filter(Boolean).join(', ')])}
            />

            <h2>Courses that help below</h2>
            <Table
              head={['Course', 'Below']}
              rows={content.skills.filter((skill) => skill.below).map((skill) => [state.courses.find((course) => course.code === skill.code && course.level === skill.level)?.title ?? skill.code, BELOW[skill.below!.kind] ?? skill.below!.kind])}
            />
          </div>
        )}

        {tab === 'Relationships' && (
          <div className="help-page sheet">
            <h2>Her three feelings</h2>
            <Table
              head={['Feeling', 'What it is for']}
              rows={[
                ['Affection', 'Sets the stage of the relationship.'],
                ['Trust', 'What she will tell you and agree to.'],
                ['Desire', 'Whether she will go to bed with you.']
              ]}
            />
            <ul>
              <li>Each runs from 0 to {max}. They change only when a scene ends, by up to 10 either way, as she judges the scene. Gifts also raise affection.</li>
            </ul>
            <h2>Stages</h2>
            <Table head={['Stage', 'Affection']} rows={relationships.stages.map((stage) => [stage.name, `${stage.minAffection}+`])} />
            <h2>What you agree to be</h2>
            <Table
              head={['Arrangement', 'Needs', 'What it is']}
              rows={relationships.statuses.map((status) => [status.name, relationships.stages.find((stage) => stage.id === status.minStage)?.name ?? 'Any stage', status.description])}
            />
            <ul>
              <li>She asks, or you raise it in a scene; you accept or decline.</li>
              <li>A woman with a claim on you may turn up in the middle of a scene with someone else. Jealous women do it more.</li>
            </ul>
            <h2>Memories</h2>
            <ul>
              <li>She keeps one short memory of each scene, rated {Object.values(MEMORY_LEVEL_LABELS).join(', ')}. You can edit both on the summary screen.</li>
              <li>In a scene she recalls at most eight: the most important first, then the most recent.</li>
            </ul>
          </div>
        )}

        {tab === 'Sex and pregnancy' && (
          <div className="help-page sheet">
            <h2>When she will</h2>
            <Table
              head={['Her nature', 'What it takes']}
              rows={[
                [`Easy (${names(rules.easyTraitIds)})`, 'Nothing: she may on the day you meet.'],
                ['Most women', `Not the day you meet, and desire of ${rules.minDesire} or more.`],
                [`Reluctant (${names(rules.reluctantTraitIds)})`, `Not the day you meet, and desire of ${rules.reluctantMinDesire} or more.`]
              ]}
            />
            <ul>
              <li>It is settled when the scene starts. A scene that begins too early stays that way however well it goes.</li>
              <li>With the right skill, her profile on the phone shows how much desire is still needed.</li>
            </ul>
            {pregnancy && (
              <>
                <h2>Conceiving</h2>
                <Table
                  head={['She is', 'Chance each day you finish inside her']}
                  rows={[
                    ['Off birth control', percent(pregnancy.chance)],
                    ['On birth control', percent(pregnancy.birthControlChance)],
                    [`On her period (${pregnancy.periodDays} days in every ${pregnancy.cycleDays})`, 'None'],
                    ['Already pregnant, or just delivered', 'None']
                  ]}
                />
                <ul>
                  <li>Most women start on birth control. She stops when she chooses to: ask her in a scene, or she may decide it herself.</li>
                  <li>With the right skills, her profile shows whether she is on it, and when she is on her period. See Stats and study.</li>
                  <li>
                    A pregnancy lasts {pregnancy.lengthDays} days. She cannot conceive again for {pregnancy.recoveryDays} days after a birth.
                  </li>
                  <li>
                    About {Math.round(pregnancy.daughterChance * 8)} children in 8 are daughters.
                  </li>
                </ul>
                <h2>The birth</h2>
                <ul>
                  <li>
                    {pregnancy.birthNoticeDays} days before she is due, the hour is set, it goes on your calendar and she messages you. It cannot be moved.
                  </li>
                  <li>Be there: the birth is a scene, she suggests a name, and you may choose another.</li>
                  <li>Miss it: the child is born anyway, she names it, and she takes a heavy and lasting loss of affection, trust and desire.</li>
                </ul>
              </>
            )}
          </div>
        )}

        {tab === 'House and children' && (
          <div className="help-page sheet">
            {housing ? (
              <>
                <h2>Getting the house</h2>
                <ul>
                  <li>Once a woman you have an arrangement with is carrying your child, the Sire Relations Office messages you an offer.</li>
                  <li>Accept, and the housing officer sets an hour to show you round. It goes on your calendar; if you miss it she sets another.</li>
                  <li>The house is yours once you have been shown it. It replaces your room in the Halls, and a live-in nanny comes with it.</li>
                </ul>
                <h2>What it costs</h2>
                <Table
                  head={['Cost', 'Amount', 'When']}
                  rows={[
                    ['Rent', `$${housing.rent}, less $${housing.rentRelief.perChild} a child, to no less than $${Math.min(housing.rent, housing.rentRelief.floor)}`, 'The 1st of each month'],
                    ['Each child in the house', `$${housing.babies.weeklyCost}`, 'The first day of each week'],
                    ['Rooms and upgrades', `$${Math.min(...housing.rooms.filter((room) => room.cost > 0).map((room) => room.cost))} to $${Math.max(...housing.rooms.flatMap((room) => [room.cost, ...room.tiers.map((tier) => tier.cost)]))} each`, 'When you build']
                  ]}
                />
                <ul>
                  <li>
                    Rent unpaid for {housing.graceDays} days loses the house for good: everyone goes home and the children go to the creche.
                  </li>
                </ul>
                <h2>Rooms</h2>
                <Table
                  head={['A room adds', 'What it is for']}
                  rows={[
                    ['Beds', 'Each bed lets one woman move in.'],
                    ['Cots', 'Each cot lets one child live at home.'],
                    ['Comfort', 'Sets how well children can do.'],
                    ['Study', 'Adds to what studying at home earns.']
                  ]}
                />
                <h2>Who can move in</h2>
                <ul>
                  <li>
                    A woman who is carrying your child or has borne one, has an arrangement with you, and has affection of {housing.invite.minAffection} or more. Pick a bedroom in the house and offer it to her.
                  </li>
                  <li>Asked to leave, she does not forgive it and does not come back.</li>
                </ul>
                <h2>Children</h2>
                <Table head={['Health', 'Level']} rows={housing.babies.levels.map((level, i) => [level.name, i === 0 ? 'Lowest: she leaves with the child' : i === housing.babies.startLevel ? 'Where a child starts' : ''])} />
                <ul>
                  <li>A child lives at home when its mother does and a cot is free. Otherwise it is at the creche, which costs nothing.</li>
                  <li>A week paid for: the child goes up a level, as far as the house&apos;s comfort allows.</li>
                  <li>A week not paid for: it drops a level and its mother thinks less of you.</li>
                  <li>No child is ever lost.</li>
                </ul>
              </>
            ) : (
              <p>This game has no housing.</p>
            )}
          </div>
        )}

        {tab === 'Money and jobs' && (
          <div className="help-page sheet">
            {jobs ? (
              <>
                <h2>Jobs</h2>
                <ul>
                  <li>The Jobs board is on the phone. You hold one job at a time, and are taken on at once if you meet its requirements.</li>
                  <li>A shift is a scene at the workplace. It costs {jobs.energyPerHour} energy an hour and pays when it ends.</li>
                  <li>A job you quit or lose will not take you back.</li>
                </ul>
                <Table
                  head={['Rule', 'How it works']}
                  rows={[
                    ['Stat bonus', `+${percent(jobs.bonusPerPoint)} pay for each point over a job's requirements, up to +${percent(jobs.bonusCap)}. Jobs with no requirements pay no bonus.`],
                    ['Missed shift', `${jobs.missedStrike} strike, or ${jobs.excusedStrike} if you messaged your boss that day beforehand.`],
                    ['Losing the job', `${jobs.strikes} strikes.`]
                  ]}
                />
              </>
            ) : (
              <p>This game has no jobs.</p>
            )}
            <h2>Spending</h2>
            <ul>
              <li>Gifts from the market and shops change affection: up for something she likes, more for something she loves, down for something she dislikes.</li>
              <li>What you spend during a scene is settled when it ends.</li>
              {housing && <li>The house is the main thing to save for: rent, the children&apos;s keep, and every room.</li>}
            </ul>
            {content.poker && (
              <>
                <h2>Cards</h2>
                <ul>
                  <li>
                    {content.poker.name} at {content.locations.find((l) => l.id === content.poker!.locationId)?.name}: Texas hold&apos;em with whoever is there, ${content.poker.smallBlind}/${content.poker.bigBlind}, and no more than ${content.poker.handCap} in a hand.
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
