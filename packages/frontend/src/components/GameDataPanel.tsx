import { useState } from 'react'
import type { GameAnalysis } from '../api/client'
import type { GameState } from '@uttt/shared'
import styles from './GameDataPanel.module.css'

type View = 'winprob' | 'heatmap' | 'pv' | 'search'

const VIEWS: { value: View; label: string }[] = [
  { value: 'winprob', label: 'WIN PROBABILITY'    },
  { value: 'heatmap', label: 'MCTS HEATMAP'        },
  { value: 'pv',      label: 'PRINCIPAL VARIATION' },
  { value: 'search',  label: 'SEARCH INTERNALS'    },
]

interface Props {
  analysis:       GameAnalysis | null
  gameState:      GameState | null
  winProbHistory: number[]
  onClose:        () => void
}

export function GameDataPanel({ analysis, gameState, winProbHistory, onClose }: Props) {
  const [view, setView] = useState<View>('heatmap')

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <select
          className={styles.select}
          value={view}
          onChange={e => setView(e.target.value as View)}
        >
          {VIEWS.map(v => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.viewWrap}>
        {view === 'winprob' && <WinProbView history={winProbHistory} />}
        {view === 'heatmap' && <HeatmapView analysis={analysis} gameState={gameState} />}
        {view === 'pv'      && <PVView analysis={analysis} />}
        {view === 'search'  && <SearchView analysis={analysis} />}
      </div>
    </div>
  )
}

// ─── Win Probability ──────────────────────────────────────────────────────────

function WinProbView({ history }: { history: number[] }) {
  if (history.length === 0) {
    return <p className={styles.empty}>Win probability chart appears after the first AI move.</p>
  }

  const n       = history.length
  const current = history[n - 1]
  const pct     = Math.round(current * 100)

  // SVG layout constants
  const W = 200, H = 76, PX = 4, PY = 10
  const plotW = W - 2 * PX
  const plotH = H - 2 * PY
  const toX = (i: number) =>
    n === 1 ? PX + plotW / 2 : PX + (i / (n - 1)) * plotW
  const toY = (p: number) => PY + (1 - p) * plotH

  const polyPts = history.map((p, i) => `${toX(i)},${toY(p)}`).join(' ')
  const fillPts = `${toX(0)},${H - PY} ${polyPts} ${toX(n - 1)},${H - PY}`

  const color  = pct > 52 ? 'var(--x)' : pct < 42 ? 'var(--o)' : 'var(--text-muted)'
  const label  = pct > 65 ? 'AHEAD' : pct < 35 ? 'LOSING' : 'EVEN'
  const delta  = n > 1 ? Math.round((current - history[n - 2]) * 100) : null
  const peak   = Math.round(Math.max(...history) * 100)

  return (
    <div className={styles.winProbView}>
      <div className={styles.bigValue}>
        <span className={styles.bigNum} style={{ color }}>{pct}%</span>
        <div className={styles.bigMeta}>
          <span className={styles.bigLabel}>YOUR WIN CHANCE</span>
          <span className={styles.bigTag} style={{ color }}>{label}</span>
        </div>
      </div>

      <div className={styles.sparkWrap}>
        <svg
          className={styles.sparkSvg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            x1={PX} y1={toY(0.5)} x2={W - PX} y2={toY(0.5)}
            stroke="var(--border-mid)" strokeWidth="1" strokeDasharray="3,3"
          />
          {n > 1 && <polygon points={fillPts} fill="rgba(232,197,71,0.07)" />}
          {n > 1 && (
            <polyline
              points={polyPts}
              fill="none"
              stroke="var(--x)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          <circle cx={toX(n - 1)} cy={toY(current)} r="3" fill="var(--x)" />
        </svg>
        <div className={styles.sparkAxis}>
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
      </div>

      <div className={styles.sparkStats}>
        <div className={styles.sparkStat}>
          <span className={styles.sparkStatKey}>MOVE</span>
          <span>{n}</span>
        </div>
        <div className={styles.sparkStat}>
          <span className={styles.sparkStatKey}>CHANGE</span>
          <span style={{ color: delta === null ? 'var(--text-muted)' : delta >= 0 ? 'var(--x)' : 'var(--o)' }}>
            {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta}%`}
          </span>
        </div>
        <div className={styles.sparkStat}>
          <span className={styles.sparkStatKey}>PEAK</span>
          <span style={{ color: 'var(--x)' }}>{peak}%</span>
        </div>
      </div>
    </div>
  )
}

// ─── MCTS Heatmap ─────────────────────────────────────────────────────────────

function HeatmapView({ analysis, gameState }: { analysis: GameAnalysis | null; gameState: GameState | null }) {
  const [mode, setMode] = useState<'visits' | 'prior'>('visits')

  if (!analysis) {
    return <p className={styles.empty}>Loading hint analysis...</p>
  }

  const best = analysis.bestMove

  const cellMap = new Map<string, { visits: number; prior: number; isBest: boolean }>()
  for (const c of analysis.candidates) {
    cellMap.set(`${c.move[0]},${c.move[1]}`, {
      visits: c.visitShare,
      prior:  c.prior,
      isBest: c.isBest,
    })
  }

  // Opacity driven by whichever mode is active; both numbers always visible.
  const modeVal = (d: { visits: number; prior: number }) =>
    mode === 'visits' ? d.visits : d.prior
  const maxVal = Math.max(...Array.from(cellMap.values()).map(modeVal), 0.001)

  return (
    <div className={styles.heatmapView}>
      <div className={styles.heatToggleRow}>
        {(['visits', 'prior'] as const).map(m => (
          <button
            key={m}
            className={mode === m ? styles.heatOn : styles.heatOff}
            onClick={() => setMode(m)}
          >
            {m === 'visits' ? 'SEARCH' : 'PRIOR'}
          </button>
        ))}
      </div>

      <div className={styles.heatBoard}>
        {Array.from({ length: 9 }, (_, macro) => {
          const locked = (gameState?.macro[macro] ?? 0) !== 0
          return (
            <div
              key={macro}
              className={styles.heatMicro}
              style={{ opacity: locked ? 0.15 : 1 }}
            >
              {Array.from({ length: 9 }, (_, cell) => {
                const d = cellMap.get(`${macro},${cell}`)
                let bg      = 'var(--bg-elevated)'
                let outline: string | undefined

                if (d) {
                  const t = modeVal(d) / maxVal
                  if (d.isBest) {
                    bg      = `rgba(57,255,20,${(0.18 + t * 0.55).toFixed(2)})`
                    outline = '1px solid rgba(57,255,20,0.65)'
                  } else {
                    bg = `rgba(232,197,71,${(0.08 + t * 0.52).toFixed(2)})`
                  }
                }

                return (
                  <div
                    key={cell}
                    className={styles.heatCell}
                    style={{ background: bg, outline }}
                  >
                    {d && (
                      <div className={styles.heatCellData}>
                        <span className={styles.heatCellS}>{Math.round(d.visits * 100)}</span>
                        <span className={styles.heatCellP}>{Math.round(d.prior * 100)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className={styles.heatLegend}>
        <span><span style={{ color: 'var(--text-bright)' }}>■</span> best</span>
        <span><span style={{ color: 'var(--x)' }}>■</span> candidate</span>
        <span className={styles.heatLegendNote}>top=visits · btm=prior · opacity={mode === 'visits' ? 'visits' : 'prior'}</span>
      </div>

      <div className={styles.heatBestLine}>
        YOUR MOVE · macro {best[0]}, cell {best[1]}
      </div>
    </div>
  )
}

// ─── Principal Variation ──────────────────────────────────────────────────────

// X-perspective PV: index 0 = YOU PLAY, 1 = AI EXPECTS, alternating.
const PV_ROLES = [
  'YOU PLAY', 'AI EXPECTS', 'YOU WOULD', 'AI EXPECTS',
  'YOU WOULD', 'AI EXPECTS', 'YOU WOULD', 'AI EXPECTS',
]

function PVView({ analysis }: { analysis: GameAnalysis | null }) {
  if (!analysis) return <p className={styles.empty}>Loading hint analysis...</p>

  const pv = analysis.principalVariation
  if (pv.length === 0) return <p className={styles.empty}>No variation data available.</p>

  return (
    <div className={styles.pvView}>
      <div className={styles.pvHeading}>EXPECTED GAME LINE</div>
      <div className={styles.pvList}>
        {pv.map(([macro, cell], i) => {
          const isAiTurn = i % 2 === 1  // X plays at even indices, AI at odd
          return (
            <div
              key={i}
              className={`${styles.pvRow} ${i === 0 ? styles.pvSuggested : ''}`}
            >
              <span className={styles.pvIdx}>{i + 1}</span>
              <span className={styles.pvRole} style={{ color: isAiTurn ? 'var(--o)' : 'var(--x)' }}>
                {PV_ROLES[i] ?? (isAiTurn ? 'AI EXPECTS' : 'YOU WOULD')}
              </span>
              <span className={styles.pvCoord}>M{macro}·C{cell}</span>
            </div>
          )
        })}
      </div>
      <div className={styles.pvFooter}>
        DEPTH {pv.length} · {analysis.simsUsed.toLocaleString()} SIMS
      </div>
    </div>
  )
}

// ─── Search Internals ─────────────────────────────────────────────────────────

function SearchView({ analysis }: { analysis: GameAnalysis | null }) {
  if (!analysis) return <p className={styles.empty}>Loading hint analysis...</p>

  // X-perspective analysis: bestMove and isBest are X's best move.
  const top = analysis.candidates.slice(0, 7)

  return (
    <div className={styles.searchView}>
      <div className={styles.searchMeta}>
        <div className={styles.searchMetaRow}>
          <span className={styles.searchMetaKey}>SIMS</span>
          <span className={styles.searchMetaVal}>{analysis.simsUsed.toLocaleString()}</span>
        </div>
        <div className={styles.searchMetaRow}>
          <span className={styles.searchMetaKey}>CANDIDATES</span>
          <span className={styles.searchMetaVal}>{analysis.candidates.length}</span>
        </div>
        <div className={styles.searchMetaRow}>
          <span className={styles.searchMetaKey}>BEST MOVE</span>
          <span className={styles.searchMetaVal}>M{analysis.bestMove[0]}·C{analysis.bestMove[1]}</span>
        </div>
      </div>

      <div className={styles.candidateList}>
        {top.map((c, i) => {
          const visitPct = Math.round(c.visitShare * 100)
          const priorPct = Math.round(c.prior * 100)
          // Q-values are from X's perspective: positive = good for X (human).
          const qColor   = c.qValue > 0.1
            ? 'var(--x)'
            : c.qValue < -0.1
            ? 'var(--o)'
            : 'var(--text-muted)'

          return (
            <div
              key={i}
              className={`${styles.candidate} ${c.isBest ? styles.candidateBest : ''}`}
            >
              <div className={styles.candidateTop}>
                <span className={styles.candidateMove}>M{c.move[0]}·C{c.move[1]}</span>
                {c.isBest && <span className={styles.candidateBadge}>BEST</span>}
                <span className={styles.candidateQ} style={{ color: qColor }}>
                  {c.qValue >= 0 ? '+' : ''}{c.qValue.toFixed(2)}
                </span>
              </div>
              <div className={styles.candidateBars}>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${visitPct}%` }} />
                </div>
                <span className={styles.barPct}>{visitPct}%</span>
              </div>
              <div className={styles.candidateBottom}>
                <span className={styles.statPrior}>P {priorPct}%</span>
                <span className={styles.statVisits}>{c.visits.toLocaleString()} visits</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
