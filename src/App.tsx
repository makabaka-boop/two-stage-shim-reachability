import { useMemo, useState } from 'react'
import { parseInput, solve, type ShimInput } from './lib/solver'

export interface Row {
  index: number
  target: number
  reachable: boolean
}

const ROW_HEIGHT = 30
const OVERSCAN = 8

/**
 * 窗口化结果列表：最多 100000 行结论，只渲染可视区附近的行，
 * 避免一次性挂载海量 DOM 节点导致浏览器冻结。
 */
export function ResultTable({ rows }: { rows: Row[] }) {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(() => ({
    height: typeof window !== 'undefined' ? Math.min(600, window.innerHeight - 260) : 480,
  }))

  const total = rows.length * ROW_HEIGHT
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.ceil(viewport.height / ROW_HEIGHT) + OVERSCAN * 2
  const end = Math.min(rows.length, start + visibleCount)
  const slice = rows.slice(start, end)

  return (
    <div
      className="table-scroll"
      ref={(el) => {
        if (el) {
          const h = el.clientHeight
          if (h > 0 && Math.abs(h - viewport.height) > 2) setViewport({ height: h })
        }
      }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: total, position: 'relative' }}>
        <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
          {slice.map((row) => (
            <div
              key={row.index}
              className={`result-row ${row.reachable ? 'yes' : 'no'}`}
              style={{ height: ROW_HEIGHT }}
            >
              <span className="col-idx">#{row.index + 1}</span>
              <span className="col-target">{row.target}</span>
              <span className="col-flag">{row.reachable ? 'true · 可达' : 'false · 不可达'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 供界面展示的计算状态。 */
export type ComputeState =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | {
      kind: 'ok'
      rows: Row[]
      reachableCount: number
      uniqueA: number
      uniqueB: number
      elapsedMs: number
      targetCount: number
    }

export function App() {
  const [text, setText] = useState('')

  const state = useMemo<ComputeState>(() => {
    if (text.trim() === '') return { kind: 'empty' }
    const parsed = parseJson(text)
    if (!parsed) return { kind: 'invalid' }
    const { reachable, uniqueA, uniqueB, elapsedMs } = solveParsed(parsed)
    let reachableCount = 0
    const rows: Row[] = new Array(parsed.targets.length)
    for (let i = 0; i < parsed.targets.length; i++) {
      if (reachable[i]) reachableCount++
      rows[i] = { index: i, target: parsed.targets[i], reachable: reachable[i] }
    }
    return {
      kind: 'ok',
      rows,
      reachableCount,
      uniqueA,
      uniqueB,
      elapsedMs,
      targetCount: parsed.targets.length,
    }
  }, [text])

  return (
    <main className="page">
      <header>
        <h1>垫片补偿可达性判定</h1>
        <p className="subtitle">
          A、B 两级垫片各选一片，精确判断每个目标补偿量 t 是否可由 a + b 组成。
          重复垫片按同一规格处理；重复目标结论一致。
        </p>
      </header>

      <section className="io">
        <div className="pane">
          <div className="pane-head">
            <label htmlFor="json-input">粘贴输入 JSON</label>
            <button
              type="button"
              className="ghost"
              onClick={() => setText(SAMPLE)}
              title="填入包含零值、最大边界与重复目标的示例"
            >
              填入示例
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setText('')}
              disabled={text === ''}
            >
              清空
            </button>
          </div>
          <textarea
            id="json-input"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'{\n  "a": [0, 100, 200000],\n  "b": [0, 50, 200000],\n  "targets": [0, 150, 400000, 150, 399999]\n}'}
          />
        </div>

        <div className="pane">
          <div className="pane-head">判定结果（按目标原序）</div>
          {state.kind === 'empty' && (
            <div className="placeholder">等待输入：粘贴 JSON 后即时计算。</div>
          )}
          {state.kind === 'invalid' && <div className="invalid">INVALID_INPUT</div>}
          {state.kind === 'ok' && (
            <>
              <div className="summary">
                <span>
                  目标 <b>{state.targetCount}</b>
                </span>
                <span className="dot">·</span>
                <span className="yes-text">
                  可达 <b>{state.reachableCount}</b>
                </span>
                <span className="dot">·</span>
                <span className="no-text">
                  不可达 <b>{state.targetCount - state.reachableCount}</b>
                </span>
                <span className="dot">·</span>
                <span>
                  规格 A <b>{state.uniqueA}</b> / B <b>{state.uniqueB}</b>
                </span>
                <span className="dot">·</span>
                <span>{state.elapsedMs.toFixed(1)} ms</span>
              </div>
              <ResultTable rows={state.rows} />
            </>
          )}
        </div>
      </section>

      <footer>
        边界：a/b/targets 各 1–100000 个整数；垫片 0–200000，目标 0–400000；
        根对象仅允许 a、b、targets 三个字段。任何非法输入一律显示 INVALID_INPUT。
      </footer>
    </main>
  )
}

const SAMPLE = JSON.stringify(
  {
    a: [0, 100, 200, 200000, 100],
    b: [0, 50, 200000, 50],
    targets: [0, 150, 400000, 150, 399999, 200000, 100, 0],
  },
  null,
  2,
)

// 计算完全由真实求解器完成，无任何假接口/固定响应。
function parseJson(text: string): ShimInput | null {
  const r = parseInput(text)
  return r.ok ? r.value : null
}
function solveParsed(input: ShimInput) {
  return solve(input)
}
