import { motion } from 'framer-motion'
import { Seat } from './Seat'
import { CardComponent } from '../ui/CardComponent'
import { ChipStack } from '../ui/ChipStack'
import type { GameState, PlayerAction } from '../../engines/types'

interface Props {
  state: GameState
  lastActions: ({ action: PlayerAction } | null)[]
}

const streetLabels: Record<string, string> = {
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}

export function PokerTable({ state, lastActions }: Props) {
  const { players, communityCards, pot, currentPlayerIndex, winner, variant, street } = state

  const showStreetLabel = variant === 'limit_holdem' || variant === 'leduc'
  const maxCommunitySlots = variant === 'limit_holdem' ? 5 : variant === 'leduc' ? 1 : 0

  return (
    <div className="relative flex flex-col items-center justify-center h-full min-h-[520px]">
      {/* Felt background */}
      <div
        className="absolute inset-4 rounded-[50%] border-2 border-accent-purple/30"
        style={{
          background: 'radial-gradient(ellipse at center, var(--color-felt-deep) 0%, var(--color-felt-mid) 50%, var(--color-felt-edge) 100%)',
          boxShadow: '0 0 40px rgba(139, 92, 246, 0.15), inset 0 0 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Noise texture overlay */}
        <div className="absolute inset-0 rounded-[50%] opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Table content */}
      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-lg py-8">
        {/* Top player (player index 1) */}
        {players[1] && (
          <Seat
            player={players[1]}
            isActive={currentPlayerIndex === 1 && !state.isHandOver}
            isWinner={winner === 1}
            showCards={state.isHandOver || (!players[1].isBot && false)}
            position="top"
            lastAction={lastActions[1]}
          />
        )}

        {/* Community cards + pot */}
        <div className="flex flex-col items-center gap-3">
          {/* Street label */}
          {showStreetLabel && (
            <motion.div
              key={street}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-3 py-1 rounded-full bg-bg-overlay/80 text-text-secondary text-xs font-medium"
            >
              {streetLabels[street] || street}
            </motion.div>
          )}

          {/* Community cards */}
          {maxCommunitySlots > 0 && (
            <div className="flex gap-2 justify-center">
              {communityCards.map((card, i) => (
                <CardComponent key={`${card.rank}${card.suit}`} card={card} faceUp index={i} size="md" />
              ))}
              {Array.from({ length: maxCommunitySlots - communityCards.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="w-14 h-20 rounded-lg border border-border-subtle/20 bg-white/5"
                />
              ))}
            </div>
          )}

          {/* Pot */}
          {pot > 0 && (
            <motion.div
              className="flex items-center gap-2"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              <ChipStack amount={pot} color="purple" animate={false} />
            </motion.div>
          )}

          {/* Variant badge (Kuhn — show in center since no community cards) */}
          {variant === 'kuhn' && (
            <div className="text-text-tertiary/30 font-display text-3xl font-bold uppercase tracking-wider select-none">
              KUHN
            </div>
          )}
        </div>

        {/* Bottom player (player index 0 — "hero") */}
        {players[0] && (
          <Seat
            player={players[0]}
            isActive={currentPlayerIndex === 0 && !state.isHandOver}
            isWinner={winner === 0}
            showCards={!players[0].folded}
            position="bottom"
            lastAction={lastActions[0]}
          />
        )}
      </div>

      {/* Dealer button */}
      <motion.div
        className="absolute w-7 h-7 rounded-full bg-bg-overlay border-2 border-accent-purple/60 flex items-center justify-center text-xs font-bold text-accent-purple z-20"
        animate={{
          left: state.dealerIndex === 0 ? '35%' : '65%',
          top: state.dealerIndex === 0 ? '75%' : '25%',
        }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      >
        D
      </motion.div>
    </div>
  )
}
