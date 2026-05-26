import { motion } from 'framer-motion'
import type { GameState, PlayerAction } from '../../engines/types'
import { getEngine } from '../../engines'

interface Props {
  state: GameState
  onAction: (action: PlayerAction) => void
}

export function ActionBar({ state, onAction }: Props) {
  const engine = getEngine(state.variant)
  const { actions, betSize, callAmount } = engine.getValidActions(state)

  const currentPlayer = state.players[state.currentPlayerIndex]
  if (currentPlayer.isBot || state.isHandOver) return null

  const hasCheck = actions.includes('check')
  const hasCall = actions.includes('call')
  const hasFold = actions.includes('fold')
  const hasBet = actions.includes('bet')
  const hasRaise = actions.includes('raise')

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-center gap-3 py-4"
    >
      {/* Fold */}
      {hasFold && (
        <button
          onClick={() => onAction({ type: 'fold' })}
          className="h-14 px-8 rounded-xl border-2 border-accent-red text-accent-red font-display font-semibold text-base hover:bg-accent-red hover:text-white transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-red/50"
        >
          <span className="flex items-center gap-2">
            Fold
            <kbd className="text-xs opacity-50 bg-white/10 px-1.5 py-0.5 rounded">F</kbd>
          </span>
        </button>
      )}

      {/* Check / Call */}
      {(hasCheck || hasCall) && (
        <button
          onClick={() =>
            hasCheck
              ? onAction({ type: 'check' })
              : onAction({ type: 'call', amount: callAmount })
          }
          className="h-14 px-8 rounded-xl border-2 border-accent-green text-accent-green font-display font-semibold text-base hover:bg-accent-green hover:text-white transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-green/50"
        >
          <span className="flex items-center gap-2">
            {hasCheck ? 'Check' : `Call ${callAmount}`}
            <kbd className="text-xs opacity-50 bg-white/10 px-1.5 py-0.5 rounded">C</kbd>
          </span>
        </button>
      )}

      {/* Bet / Raise */}
      {(hasBet || hasRaise) && (
        <button
          onClick={() =>
            hasBet
              ? onAction({ type: 'bet', amount: betSize })
              : onAction({ type: 'raise', amount: betSize })
          }
          className="h-14 px-8 rounded-xl border-2 border-accent-purple text-accent-purple font-display font-semibold text-base hover:bg-accent-purple hover:text-white transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-purple/50"
        >
          <span className="flex items-center gap-2">
            {hasBet ? `Bet ${betSize}` : `Raise ${betSize}`}
            <kbd className="text-xs opacity-50 bg-white/10 px-1.5 py-0.5 rounded">R</kbd>
          </span>
        </button>
      )}
    </motion.div>
  )
}
