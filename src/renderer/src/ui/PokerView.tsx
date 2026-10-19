import { useEffect, useMemo, useRef, useState } from 'react'
import {
  betSize,
  canPlayPoker,
  cardLabel,
  dealHand,
  decide,
  equity,
  skillLevel,
  netFor,
  options,
  playMove,
  potOf,
  seatPlayers,
  spriteFor,
  wornOutfit,
  YOU,
  type Card,
  type PokerHand,
  type PokerMove,
  type PokerSeat
} from '../../../shared/game'
import { Portrait } from './Portrait'
import type { ContentPack, GameState } from '../../../shared/model'
import { play } from '../sound'
import { Button } from './Button'

interface Props {
  content: ContentPack
  state: GameState
  /** A hand is over: what came of it goes in his pocket. */
  onSettle: (hand: PokerHand) => void
  /** He gets up from the table, having played this many hands. */
  onLeave: (handsPlayed: number) => void
}

// How long each of the others takes over what she does, so that it can be followed.
const THINK_MS = 750
// How far out from the middle of the picture the seats stand, as a share of its width and height: on the rim of the table.
const SEAT_RADIUS = { x: 39, y: 36 }

/** Cards at the back tables: fixed-limit hold 'em against whoever is here, a hand at a time, for small stakes. */
export function PokerView({ content, state, onSettle, onLeave }: Props) {
  const config = content.poker!
  // Who sits down is settled as he does, and stays for the sitting.
  const [seed] = useState(() => Math.floor(Math.random() * 0x7fffffff))
  const [players] = useState(() => seatPlayers(content, state, seed))
  const [hand, setHand] = useState<PokerHand | null>(null)
  const [played, setPlayed] = useState(0)
  const check = canPlayPoker(content, state)

  function deal() {
    if (!check.ok) return
    // The deal goes round the table a seat a hand.
    setHand(dealHand(config, players, played % players.length, seed + played * 7919))
    play('cards')
  }

  /** A move made, with the sound of what it was: chips for money in, cards for a new street. */
  function move(next: PokerHand, before: PokerHand) {
    if (potOf(next) > potOf(before)) play('chips')
    if (next.board.length > before.board.length) play('cards')
    setHand(next)
  }

  // The others play in turn, each after a moment.
  useEffect(() => {
    if (!hand || hand.outcome || hand.seats[hand.toAct].id === YOU) return
    const timer = window.setTimeout(() => move(playMove(hand, config, decide(hand, config, Math.random)), hand), THINK_MS)
    return () => window.clearTimeout(timer)
  }, [hand])

  // A hand that is over is settled once.
  const settled = useRef<PokerHand | null>(null)
  useEffect(() => {
    if (!hand?.outcome || settled.current === hand) return
    settled.current = hand
    onSettle(hand)
    setPlayed((count) => count + 1)
  }, [hand])

  const yours = hand && !hand.outcome && hand.seats[hand.toAct].id === YOU
  const choice = yours ? options(hand, config) : undefined
  const choose = (what: PokerMove) => hand && move(playMove(hand, config, what), hand)
  const net = hand?.outcome ? netFor(hand, YOU) : 0
  // With the odds worked out, his chance of taking the pot against whoever is still in, as it stands on his turn.
  const reckons = skillLevel(content, state, 'odds') > 0
  const odds = useMemo(() => {
    if (!reckons || !yours || !hand) return undefined
    const me = hand.seats.find((seat) => seat.id === YOU)!
    const against = hand.seats.filter((seat) => seat.id !== YOU && !seat.folded).length
    return Math.round(equity(me.hole, hand.board, against, Math.random, 600) * 100)
  }, [reckons, yours, hand?.board.length, hand?.seats.filter((seat) => seat.folded).length, hand?.seats.find((seat) => seat.id === YOU)?.hole.join()])
  // Further on he knows what to do with them: raise what is likely to win, call what the pot pays for, let go of the rest.
  const advice = (() => {
    if (odds === undefined || !choice || !hand || skillLevel(content, state, 'odds') < 2) return undefined
    const chance = odds / 100
    if (chance >= 0.6 && choice.canRaise) return `${choice.raiseLabel.toLowerCase()} it`
    if (choice.toCall === 0) return 'check'
    return chance >= choice.toCall / (potOf(hand) + choice.toCall) ? 'call' : 'fold'
  })()
  const between = !hand || hand.outcome !== undefined

  // Everyone round the table, him at the bottom and the others clockwise from him, evenly.
  const seats = hand?.seats ?? players.map((player) => ({ ...player, hole: [], committed: 0, streetBet: 0, folded: false, acted: false }) as PokerSeat)
  const table = config.table ? `url("content://pack/${config.table}")` : undefined

  return (
    <main className="stage poker">
      {/* The table fills the screen whole; whatever the window has to spare around it is the same picture, blurred. */}
      <div className="poker-backdrop" style={{ backgroundImage: table }} />
      <div className="poker-stage" style={{ backgroundImage: table }}>
        {seats.map((seat, i) => {
          const angle = Math.PI / 2 + (i * 2 * Math.PI) / seats.length
          return (
            <div key={seat.id} className={seat.id === YOU ? 'poker-place you' : 'poker-place'} style={{ left: `${50 + SEAT_RADIUS.x * Math.cos(angle)}%`, top: `${50 + SEAT_RADIUS.y * Math.sin(angle)}%` }}>
              <Seat content={content} state={state} seat={seat} hand={hand} />
            </div>
          )
        })}
        <div className="poker-center">
          <div className="poker-board">
            {[0, 1, 2, 3, 4].map((i) => (hand?.board[i] !== undefined ? <PlayingCard key={i} card={hand.board[i]} /> : <span key={i} className="playing-card slot" />))}
          </div>
          <span className="poker-pot">Pot ${hand ? potOf(hand) : 0}</span>
          {hand && !hand.outcome && <span className="poker-street">{hand.street === 'preflop' ? 'Before the flop' : `The ${hand.street}`} · bets of ${betSize(config, hand.street)}</span>}
        </div>
      </div>

      <div className="poker-actions glass framed">
        {/* What he has left, beside what he can do with it. The stakes are in its tooltip. */}
        <span className="poker-purse" title={`Blinds $${config.smallBlind}/$${config.bigBlind} · bets $${config.smallBet}/$${config.bigBet} · $${config.handCap} a hand at most`}>
          ${state.player.money}
        </span>
        {hand?.outcome && (
          <p className="poker-result">
            {hand.outcome.winners.map((id) => hand.seats.find((seat) => seat.id === id)?.name).join(' and ')}{' '}
            {hand.outcome.winners.length > 1 ? 'split' : 'take'} the pot
            {hand.outcome.shown[hand.outcome.winners[0]] ? ` with ${hand.outcome.shown[hand.outcome.winners[0]].toLowerCase()}` : ''}.{' '}
            <strong className={net > 0 ? 'won' : net < 0 ? 'lost' : undefined}>{net > 0 ? `You win $${net}.` : net < 0 ? `You lose $${-net}.` : 'You break even.'}</strong>
          </p>
        )}
        {yours && choice && (
          <>
            {odds !== undefined && (
              <span className="poker-odds" title="Your chance of winning this hand">
                {odds}% to win{advice ? ` · ${advice}` : ''}
              </span>
            )}
            {choice.toCall > 0 && (
              <Button variant="quiet" onClick={() => choose('fold')}>
                Fold
              </Button>
            )}
            <Button onClick={() => choose(choice.toCall > 0 ? 'call' : 'check')}>{choice.toCall > 0 ? `Call $${choice.toCall}` : 'Check'}</Button>
            {choice.canRaise && (
              <Button variant="primary" onClick={() => choose('raise')}>
                {choice.raiseLabel} ${choice.raiseCost}
              </Button>
            )}
          </>
        )}
        {hand && !hand.outcome && !yours && <span className="hint">{hand.seats[hand.toAct].name} is thinking…</span>}
        {between && (
          <>
            <Button variant="quiet" onClick={() => onLeave(played)}>
              Leave the table
            </Button>
            <Button variant="primary" disabled={!check.ok} title={check.reasons.join(' · ') || undefined} onClick={deal}>
              {hand ? 'Deal again' : 'Deal me in'}
            </Button>
          </>
        )}
      </div>
    </main>
  )
}

/** One player at the table: her face or initial, her cards, what she has put in and what she did last. */
function Seat({ content, state, seat, hand }: { content: ContentPack; state: GameState; seat: PokerSeat; hand: PokerHand | null }) {
  const li = content.loveInterests.find((one) => one.id === seat.id)
  const you = seat.id === YOU
  // A love interest's face, or his own where the game has a picture of him.
  const sprite = li ? spriteFor(li, wornOutfit(content, state, li), undefined) : you ? content.newGame.look.sprite : undefined
  const faceY = li?.faceY ?? content.newGame.look.faceY
  // His own cards are always face up; the others' only when they are shown down at the end.
  const shown = you || hand?.outcome?.shown[seat.id] !== undefined
  const turn = hand && !hand.outcome && hand.seats[hand.toAct]?.id === seat.id
  const winner = hand?.outcome?.winners.includes(seat.id)
  const dealer = hand && hand.seats[hand.dealer]?.id === seat.id
  return (
    <div className={['poker-seat', seat.folded && 'folded', turn && 'turn', winner && 'winner'].filter(Boolean).join(' ')}>
      <Portrait who={{ name: seat.name, faceY }} image={sprite} size={you ? 144 : 124} className="poker-face" />
      <div className="poker-seat-info">
        <div className="poker-seat-name">
          {you ? 'You' : seat.name}
          {dealer && <span className="dealer-chip" title="Dealer">D</span>}
        </div>
        <div className="poker-hole">
          {seat.hole.map((card, i) => (shown && !seat.folded ? <PlayingCard key={i} card={card} /> : <span key={i} className={seat.folded ? 'playing-card down mucked' : 'playing-card down'} />))}
        </div>
        <div className="poker-seat-note">
          {hand?.outcome?.shown[seat.id] ?? seat.last ?? ' '}
        </div>
      </div>
    </div>
  )
}

function PlayingCard({ card }: { card: Card }) {
  const { rank, suit, red } = cardLabel(card)
  return (
    <span className={red ? 'playing-card red' : 'playing-card'}>
      <span>{rank}</span>
      <span>{suit}</span>
    </span>
  )
}
