import { Play, Pause, SkipForward, FastForward, Zap } from 'lucide-react'

interface Props {
  isRunning: boolean
  speed: number
  handNumber: number
  handLimit: number
  onToggleRunning: () => void
  onStepAction: () => void
  onStepHand: () => void
  onSetSpeed: (speed: number) => void
}

const speeds = [0.5, 1, 2, 4]

export function BvBController({
  isRunning,
  speed,
  handNumber,
  handLimit,
  onToggleRunning,
  onStepAction,
  onStepHand,
  onSetSpeed,
}: Props) {
  const progress = handLimit > 0 ? Math.min((handNumber / handLimit) * 100, 100) : 0

  return (
    <div className="flex flex-col gap-3 py-4">
      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onToggleRunning}
          className="h-12 w-12 rounded-xl bg-accent-purple text-white flex items-center justify-center hover:shadow-[0_0_16px_var(--color-accent-purple-glow)] transition-shadow cursor-pointer"
        >
          {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>

        <button
          onClick={onStepAction}
          disabled={isRunning}
          className="h-12 px-4 rounded-xl bg-bg-elevated border border-border-subtle text-text-primary flex items-center gap-2 text-sm font-medium hover:border-border-strong transition-colors cursor-pointer disabled:opacity-30"
        >
          <SkipForward className="w-4 h-4" />
          Step
        </button>

        <button
          onClick={onStepHand}
          disabled={isRunning}
          className="h-12 px-4 rounded-xl bg-bg-elevated border border-border-subtle text-text-primary flex items-center gap-2 text-sm font-medium hover:border-border-strong transition-colors cursor-pointer disabled:opacity-30"
        >
          <FastForward className="w-4 h-4" />
          Hand
        </button>

        <div className="h-12 flex items-center gap-1 ml-4 bg-bg-elevated border border-border-subtle rounded-xl px-2">
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                speed === s
                  ? 'bg-accent-purple text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {s}x
            </button>
          ))}
          <button
            onClick={() => onSetSpeed(0)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
              speed === 0
                ? 'bg-accent-purple text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Zap className="w-3 h-3" />
            Instant
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-bg-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-accent-purple transition-all duration-300 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-text-tertiary text-xs text-center font-mono">
        Hand {handNumber} / {handLimit >= 999999 ? '\u221E' : handLimit}
      </p>
    </div>
  )
}
