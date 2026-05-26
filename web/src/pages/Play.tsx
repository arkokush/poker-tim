import { useEffect, useCallback, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGameStore } from '../stores/gameStore'
import { useUIStore } from '../stores/uiStore'
import { PokerTable } from '../components/table/PokerTable'
import { ActionBar } from '../components/table/ActionBar'
import { BvBController } from '../components/table/BvBController'
import { LeftPane } from '../components/table/LeftPane'
import { RightPane } from '../components/table/RightPane'
import { Volume2, VolumeX, LogOut } from 'lucide-react'
import type { PlayerAction } from '../engines/types'

export function Play() {
  const navigate = useNavigate()
  useParams()
  const session = useGameStore((s) => s.session)
  const { dealHand, playerAction, botAct, stepOneAction, stepOneHand, toggleRunning, setBvbSpeed, endSession } = useGameStore()
  const { soundEnabled, toggleSound } = useUIStore()
  const bvbTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Track last actions for animation labels
  const [lastActions, setLastActions] = useState<({ action: PlayerAction } | null)[]>([null, null])
  const prevActionCountRef = useRef(0)

  // Redirect if no session
  useEffect(() => {
    if (!session) {
      navigate('/')
    } else if (session.state && !session.state.isHandOver && session.state.handNumber === 0) {
      dealHand()
    }
  }, [session, navigate, dealHand])

  // Track action changes to show labels
  useEffect(() => {
    if (!session?.state) return
    const { actionHistory } = session.state
    if (actionHistory.length > prevActionCountRef.current && actionHistory.length > 0) {
      const latest = actionHistory[actionHistory.length - 1]
      setLastActions((prev) => {
        const next = [...prev] as ({ action: PlayerAction } | null)[]
        next[latest.playerIndex] = { action: latest.action }
        return next
      })
      // Clear after 1.5s
      setTimeout(() => {
        setLastActions([null, null])
      }, 1500)
    }
    prevActionCountRef.current = actionHistory.length
  }, [session?.state?.actionHistory.length])

  // Auto-act for bots in PvB mode
  useEffect(() => {
    if (!session?.state || session.state.isHandOver) return
    if (session.mode === 'pvb' || session.mode === 'pvp') {
      const currentPlayer = session.state.players[session.state.currentPlayerIndex]
      if (currentPlayer.isBot) {
        const timer = setTimeout(() => botAct(), 600)
        return () => clearTimeout(timer)
      }
    }
  }, [session?.state?.currentPlayerIndex, session?.state?.isHandOver, session?.mode, botAct])

  // Auto-deal next hand after a pause
  useEffect(() => {
    if (!session?.state || !session.state.isHandOver) return
    if (session.mode === 'pvp' || session.mode === 'pvb') {
      const handNum = session.state.handNumber
      if (handNum < session.config.handLimit) {
        const timer = setTimeout(() => dealHand(), 2000)
        return () => clearTimeout(timer)
      }
    }
  }, [session?.state?.isHandOver, session?.mode, dealHand])

  // BvB auto-play loop
  useEffect(() => {
    if (!session || session.mode !== 'bvb') return

    if (session.isRunning && session.bvbSpeed > 0) {
      const interval = Math.round(800 / session.bvbSpeed)
      bvbTimerRef.current = setInterval(() => {
        const s = useGameStore.getState().session
        if (!s || !s.state) return
        if (s.state.handNumber >= s.config.handLimit) {
          toggleRunning()
          return
        }
        if (s.state.isHandOver) {
          useGameStore.getState().dealHand()
        } else {
          useGameStore.getState().botAct()
        }
      }, interval)
      return () => {
        if (bvbTimerRef.current) clearInterval(bvbTimerRef.current)
      }
    } else if (session.isRunning && session.bvbSpeed === 0) {
      // Instant mode: run many hands at once
      const runBatch = () => {
        const batchSize = 50
        for (let i = 0; i < batchSize; i++) {
          useGameStore.getState().stepOneHand()
          const s = useGameStore.getState().session
          if (!s || s.state!.handNumber >= s.config.handLimit) {
            toggleRunning()
            return
          }
        }
        requestAnimationFrame(runBatch)
      }
      requestAnimationFrame(runBatch)
    }
  }, [session?.isRunning, session?.bvbSpeed, session?.mode])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!session?.state || session.state.isHandOver) return
      const currentPlayer = session.state.players[session.state.currentPlayerIndex]
      if (currentPlayer.isBot) return

      const { validActions } = session.state
      switch (e.key.toLowerCase()) {
        case 'f':
          if (validActions.includes('fold')) playerAction({ type: 'fold' })
          break
        case 'c':
          if (validActions.includes('check')) playerAction({ type: 'check' })
          else if (validActions.includes('call')) playerAction({ type: 'call', amount: session.state.betToCall })
          break
        case 'r':
          if (validActions.includes('bet')) playerAction({ type: 'bet', amount: session.state.currentBetSize })
          else if (validActions.includes('raise')) playerAction({ type: 'raise', amount: session.state.currentBetSize })
          break
      }
    },
    [session?.state, playerAction],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!session?.state) return null

  const state = session.state
  const variantLabel = session.config.variant === 'kuhn' ? 'Kuhn' : session.config.variant === 'leduc' ? 'Leduc' : 'Limit HE'
  const modeLabel = session.mode.toUpperCase()
  const isMatchOver = state.handNumber >= session.config.handLimit && state.isHandOver

  return (
    <div className="h-screen flex flex-col bg-bg-base">
      {/* Top Bar */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border-subtle bg-bg-elevated shrink-0">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded bg-accent-purple/20 text-accent-purple text-xs font-bold uppercase tracking-wider">
            {variantLabel}
          </span>
          <span className="text-text-secondary text-sm font-mono">
            Hand #{state.handNumber}
          </span>
          <span className="text-text-tertiary text-xs">{modeLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className="p-2 rounded-lg hover:bg-bg-overlay text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              endSession()
              navigate('/')
            }}
            className="p-2 rounded-lg hover:bg-bg-overlay text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left Pane */}
        <LeftPane players={state.players} handHistory={session.handHistory} />

        {/* Center */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <PokerTable state={state} lastActions={lastActions} />
          </div>

          {/* Match Over Banner */}
          {isMatchOver && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-4"
            >
              <p className="font-display text-xl font-bold text-text-primary mb-2">Match Complete</p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => navigate(`/review/${session.id}`)}
                  className="px-6 py-2 rounded-xl bg-accent-purple text-white font-medium text-sm cursor-pointer hover:shadow-[0_0_16px_var(--color-accent-purple-glow)] transition-shadow"
                >
                  Review
                </button>
                <button
                  onClick={() => { endSession(); navigate('/') }}
                  className="px-6 py-2 rounded-xl bg-bg-elevated border border-border-subtle text-text-primary font-medium text-sm cursor-pointer hover:border-border-strong transition-colors"
                >
                  New Match
                </button>
              </div>
            </motion.div>
          )}

          {/* Action Bar or BvB Controller */}
          {!isMatchOver && (
            <div className="shrink-0">
              {session.mode === 'bvb' ? (
                <BvBController
                  isRunning={session.isRunning}
                  speed={session.bvbSpeed}
                  handNumber={state.handNumber}
                  handLimit={session.config.handLimit}
                  onToggleRunning={toggleRunning}
                  onStepAction={stepOneAction}
                  onStepHand={stepOneHand}
                  onSetSpeed={setBvbSpeed}
                />
              ) : (
                <ActionBar state={state} onAction={playerAction} />
              )}
            </div>
          )}
        </div>

        {/* Right Pane */}
        <RightPane handHistory={session.handHistory} players={state.players} />
      </div>
    </div>
  )
}
