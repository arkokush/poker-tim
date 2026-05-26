import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts'
import type { Player, PlayerAction, Card } from '../../engines/types'

interface HandRecord {
  handNumber: number
  winner: number | null
  winAmount: number
  actions: { playerIndex: number; action: PlayerAction; street: string }[]
  players: { id: number; name: string; stack: number; holeCards: Card[] }[]
  communityCards: Card[]
}

interface Props {
  handHistory: HandRecord[]
  players: Player[]
}

function cardStr(c: Card): string {
  const suitMap: Record<string, string> = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' }
  return `${c.rank}${suitMap[c.suit]}`
}

function actionStr(a: { playerIndex: number; action: PlayerAction }): string {
  const prefix = `P${a.playerIndex + 1}`
  switch (a.action.type) {
    case 'fold': return `${prefix} folds`
    case 'check': return `${prefix} checks`
    case 'call': return `${prefix} calls${a.action.amount ? ` ${a.action.amount}` : ''}`
    case 'bet': return `${prefix} bets${a.action.amount ? ` ${a.action.amount}` : ''}`
    case 'raise': return `${prefix} raises${a.action.amount ? ` to ${a.action.amount}` : ''}`
  }
}

type StatsTab = 'overview' | 'actions'

export function RightPane({ handHistory, players }: Props) {
  const [expandedHand, setExpandedHand] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<StatsTab>('overview')

  // Stack over time data
  const stackData = handHistory.map((h) => ({
    hand: h.handNumber,
    [players[0]?.name ?? 'P1']: h.players[0]?.stack ?? 0,
    [players[1]?.name ?? 'P2']: h.players[1]?.stack ?? 0,
  }))

  // Action distribution
  const actionDist = players.map((p) => {
    const counts: Record<string, number> = { fold: 0, check: 0, call: 0, bet: 0, raise: 0 }
    handHistory.forEach((h) => {
      h.actions.forEach((a) => {
        if (a.playerIndex === p.id) {
          counts[a.action.type] = (counts[a.action.type] || 0) + 1
        }
      })
    })
    return { name: p.name, ...counts }
  })

  return (
    <div className="w-[340px] flex flex-col h-full border-l border-border-subtle">
      {/* Hand History */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-text-tertiary text-xs uppercase tracking-[0.18em] font-medium mb-3">Hand History</p>

        {handHistory.length === 0 && (
          <p className="text-text-tertiary text-sm">No hands played yet</p>
        )}

        <div className="flex flex-col gap-1">
          {[...handHistory].reverse().map((h) => {
            const expanded = expandedHand === h.handNumber
            const winnerName = h.winner !== null ? h.players[h.winner]?.name : 'Split'
            return (
              <div key={h.handNumber}>
                <button
                  onClick={() => setExpandedHand(expanded ? null : h.handNumber)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-elevated text-left transition-colors cursor-pointer"
                >
                  {expanded ? <ChevronDown className="w-3 h-3 text-text-tertiary" /> : <ChevronRight className="w-3 h-3 text-text-tertiary" />}
                  <span className="text-text-tertiary text-xs font-mono">#{h.handNumber}</span>
                  <span className="text-text-primary text-sm flex-1">{winnerName} wins</span>
                  <span className="text-accent-green text-xs font-mono">+{h.winAmount}</span>
                </button>
                {expanded && (
                  <div className="ml-8 mb-2 px-3 py-2 rounded-lg bg-bg-elevated text-xs text-text-secondary space-y-1">
                    {h.players.map((p) => (
                      <div key={p.id}>
                        {p.name}: {p.holeCards.map(cardStr).join(' ')}
                      </div>
                    ))}
                    {h.communityCards.length > 0 && (
                      <div>Board: {h.communityCards.map(cardStr).join(' ')}</div>
                    )}
                    <div className="border-t border-border-subtle pt-1 mt-1">
                      {h.actions.map((a, i) => (
                        <div key={i}>{actionStr(a)}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="h-[300px] border-t border-border-subtle p-4">
        <div className="flex gap-1 mb-3">
          {(['overview', 'actions'] as StatsTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === tab
                  ? 'bg-accent-purple text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && stackData.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stackData}>
              <XAxis dataKey="hand" tick={{ fontSize: 10, fill: '#5C5C70' }} />
              <YAxis tick={{ fontSize: 10, fill: '#5C5C70' }} />
              <Tooltip
                contentStyle={{ background: '#14141E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#A1A1B5' }}
              />
              <Line type="monotone" dataKey={players[0]?.name ?? 'P1'} stroke="#8B5CF6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey={players[1]?.name ?? 'P2'} stroke="#22C55E" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'actions' && actionDist.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={actionDist}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5C5C70' }} />
              <YAxis tick={{ fontSize: 10, fill: '#5C5C70' }} />
              <Tooltip
                contentStyle={{ background: '#14141E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="fold" fill="#EF4444" stackId="a" />
              <Bar dataKey="check" fill="#22C55E" stackId="a" />
              <Bar dataKey="call" fill="#4ADE80" stackId="a" />
              <Bar dataKey="bet" fill="#8B5CF6" stackId="a" />
              <Bar dataKey="raise" fill="#A78BFA" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        )}

        {stackData.length === 0 && (
          <p className="text-text-tertiary text-sm text-center mt-8">Play some hands to see stats</p>
        )}
      </div>
    </div>
  )
}
