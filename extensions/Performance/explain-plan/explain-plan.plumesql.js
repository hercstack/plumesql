// @ts-check
// @description The plan of an EXPLAIN as a picture you can read: where the time goes, what was misestimated, what spilled, step by step
// @color amber
import { loadRows, escapeHtml } from '$ext/stats-core/stats-core.plumesql.js'

// ----- reading the plan ------------------------------------------------------------
//
// One shape for both of EXPLAIN's forms: FORMAT JSON (one cell holding the
// whole document) and the text psql prints (one row per line). A node:
// { type, label, target, startup, cost, rows, width, aStart, aTotal, aRows,
//   loops, never, props, children, rel, sub, parallel }.

const STRUCTURAL = new Set(['Plans', 'Node Type', 'Startup Cost', 'Total Cost', 'Plan Rows', 'Plan Width', 'Actual Startup Time', 'Actual Total Time', 'Actual Rows', 'Actual Loops', 'Parent Relationship', 'Subplan Name', 'Relation Name', 'Schema', 'Alias', 'Index Name', 'CTE Name', 'Function Name', 'Join Type', 'Strategy', 'Partial Mode', 'Parallel Aware', 'Async Capable', 'Operation'])

/** @param {any} p @param {boolean} parallel @returns {any} */
function fromJson(p, parallel) {
  const type = String(p['Node Type'] || '?')
  const par = parallel || /^Gather/.test(type)
  const on = p['Relation Name'] ? (p.Schema ? p.Schema + '.' : '') + p['Relation Name'] + (p.Alias && p.Alias !== p['Relation Name'] ? ' ' + p.Alias : '')
    : p['CTE Name'] ? p['CTE Name'] + (p.Alias && p.Alias !== p['CTE Name'] ? ' ' + p.Alias : '')
      : p['Function Name'] ? p['Function Name'] + '()' : ''
  // The name psql prints: GroupAggregate for a sorted Aggregate, Partial
  // and Finalize for the two halves of a parallel one, the join type and
  // the command of a ModifyTable in front.
  const agg = /** @type {Record<string, string>} */ ({ Sorted: 'GroupAggregate', Hashed: 'HashAggregate', Mixed: 'MixedAggregate' })
  const jt = p['Join Type'] && p['Join Type'] !== 'Inner' ? p['Join Type'] : ''
  const base = type === 'Aggregate' && agg[p.Strategy] ? agg[p.Strategy] : type === 'SetOp' && p.Strategy === 'Hashed' ? 'HashSetOp' : type === 'ModifyTable' && p.Operation ? p.Operation
    : jt && / Join$/.test(type) ? type.replace(/ Join$/, ' ' + jt + ' Join') : jt && type === 'Nested Loop' ? 'Nested Loop ' + jt + ' Join' : type
  const head = (p['Partial Mode'] && p['Partial Mode'] !== 'Simple' ? p['Partial Mode'] + ' ' : '') + (p['Parallel Aware'] ? 'Parallel ' : '') + base
  /** @type {[string, unknown][]} */
  const props = []
  for (const k of Object.keys(p)) if (!STRUCTURAL.has(k)) props.push([k, p[k]])
  return {
    type,
    label: head,
    target: on,
    index: p['Index Name'] || '',
    startup: num(p['Startup Cost']), cost: num(p['Total Cost']), rows: num(p['Plan Rows']), width: num(p['Plan Width']),
    aStart: num(p['Actual Startup Time']), aTotal: num(p['Actual Total Time']), aRows: num(p['Actual Rows']), loops: num(p['Actual Loops']),
    never: p['Actual Loops'] === 0,
    props,
    rel: p['Parent Relationship'] || '',
    sub: p['Subplan Name'] || '',
    parallel: par,
    children: (p.Plans || []).map((/** @type {any} */ c) => fromJson(c, par))
  }
}

/** @param {unknown} v */
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v))

// The text form, line by line: a node line carries (cost=...) and maybe
// (actual ...), a child opens with "->", and every other line is a property
// of the nearest node above it that it is indented under.
const NODE_RE = /^(\s*)(->\s+)?(.+?)\s+\(cost=([\d.]+)\.\.([\d.]+) rows=(\d+) width=(\d+)\)(?:\s+\((?:actual time=([\d.]+)\.\.([\d.]+) rows=([\d.]+) loops=(\d+)|(never executed))\))?\s*$/
/** @param {string[]} lines */
function fromText(lines) {
  /** @type {{ node: any, indent: number }[]} */
  const stack = []
  /** @type {any} */
  let root = null
  /** @type {Record<string, number>} */
  const times = {}
  let pendingSub = ''
  // After the tree, psql prints the run's own lines at the left edge
  // (Planning:, Planning Time, Triggers, JIT); nothing there is a step's.
  let trailer = false
  for (const raw of lines) {
    const line = String(raw ?? '')
    if (!line.trim()) continue
    const m = NODE_RE.exec(line)
    if (m) {
      const indent = m[1].length + (m[2] ? m[2].length : 0)
      const text = m[3].trim()
      const onAt = text.search(/ (on|using) /)
      const node = {
        type: text.replace(/ (on|using) .*$/, ''), label: onAt > 0 ? text.slice(0, onAt) : text, target: onAt > 0 ? text.slice(onAt).replace(/^ (on|using) /, '') : '', index: '',
        startup: Number(m[4]), cost: Number(m[5]), rows: Number(m[6]), width: Number(m[7]),
        aStart: m[8] ? Number(m[8]) : null, aTotal: m[9] ? Number(m[9]) : null, aRows: m[10] ? Number(m[10]) : null, loops: m[11] ? Number(m[11]) : m[12] ? 0 : null,
        never: !!m[12], props: [], rel: '', sub: pendingSub, parallel: false, children: []
      }
      pendingSub = ''
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
      const parent = stack.length ? stack[stack.length - 1].node : null
      if (parent) {
        parent.children.push(node)
        if (parent.parallel || /^Gather/.test(parent.type)) node.parallel = true
      } else if (!root) root = node
      stack.push({ node, indent })
      continue
    }
    const t = line.trim()
    if (root && !/^\s/.test(line)) trailer = true
    const sub = /^(InitPlan|SubPlan|CTE)\s+(.+)$/.exec(t)
    if (sub) { pendingSub = t; continue }
    const top = /^(Planning Time|Execution Time|Planning time|Execution time):\s*([\d.]+)\s*ms/.exec(t)
    if (top) { times[top[1].toLowerCase().startsWith('planning') ? 'Planning Time' : 'Execution Time'] = Number(top[2]); continue }
    // JIT's own block closes the text form: its Timing line's Total is
    // the figure the summary shows, as the JSON form's JIT.Timing.Total.
    if (trailer) {
      const jit = /^Timing:.*\bTotal\s+([\d.]+)\s*ms/.exec(t)
      if (jit) times.jit = Number(jit[1])
      continue
    }
    const kv = /^([A-Za-z][A-Za-z0-9 /-]*?):\s+(.*)$/.exec(t)
    const indent = line.length - line.trimStart().length
    let owner = null
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].indent < indent) { owner = stack[i].node; break }
    if (!owner) continue
    if (kv) owner.props.push([kv[1], kv[2]])
    else owner.props.push(['', t])
  }
  return root ? [{ Plan: null, node: root, 'Planning Time': times['Planning Time'], 'Execution Time': times['Execution Time'], jit: times.jit }] : null
}

// The document from the result: a JSON cell, or the text lines.
/** @param {any[][]} rows @returns {{ node: any, planning: number|null, execution: number|null, extra: [string, unknown][], text: string } | null} */
export function readPlan(rows) {
  if (!rows.length) return null
  const first = rows[0]?.[0]
  let doc = null
  if (typeof first === 'string' && /^\s*[[{]/.test(first)) {
    try { doc = JSON.parse(first) } catch { doc = null }
  } else if (first && typeof first === 'object') doc = first
  if (doc) {
    const top = Array.isArray(doc) ? doc[0] : doc
    if (!top || !top.Plan) return null
    /** @type {[string, unknown][]} */
    const extra = []
    for (const k of Object.keys(top)) if (k !== 'Plan' && k !== 'Planning Time' && k !== 'Execution Time') extra.push([k, top[k]])
    return { node: fromJson(top.Plan, false), planning: num(top['Planning Time']), execution: num(top['Execution Time']), extra, text: typeof first === 'string' ? first : JSON.stringify(doc, null, 2) }
  }
  const lines = rows.map((r) => String(r[0] ?? ''))
  const t = fromText(lines)
  if (!t) return null
  return { node: t[0].node, planning: t[0]['Planning Time'] ?? null, execution: t[0]['Execution Time'] ?? null, extra: t[0].jit ? [['JIT', { Timing: { Total: t[0].jit } }]] : [], text: lines.join('\n') }
}

// ----- measuring ----------------------------------------------------------------------

/** @param {any} n @param {string} key */
const prop = (n, key) => { const hit = n.props.find((/** @type {[string, unknown]} */ p) => p[0] === key); return hit ? hit[1] : undefined }

// A number the text form packs into another property's line ("Buckets:
// 1024  Batches: 4  Memory Usage: 39kB"), or the JSON form's own key.
/** @param {any} n @param {string} key */
const packed = (n, key) => {
  const own = prop(n, key)
  if (own !== undefined) return parseFloat(String(own)) || 0
  const re = new RegExp('(?:^|\\s)' + key.replace(/ /g, ' ') + ':\\s*(\\d+)')
  for (const [, v] of n.props) { const m = typeof v === 'string' ? re.exec(v) : null; if (m) return Number(m[1]) }
  return 0
}

// The text form's "Buffers: shared hit=1 read=2, temp written=3" as numbers.
/** @param {any} n */
function buffersOf(n) {
  const b = { hit: 0, read: 0, dirtied: 0, written: 0, tempRead: 0, tempWritten: 0 }
  const j = (/** @type {string} */ k) => Number(prop(n, k) || 0)
  b.hit = j('Shared Hit Blocks'); b.read = j('Shared Read Blocks'); b.dirtied = j('Shared Dirtied Blocks'); b.written = j('Shared Written Blocks')
  b.tempRead = j('Temp Read Blocks'); b.tempWritten = j('Temp Written Blocks')
  const text = prop(n, 'Buffers')
  if (typeof text === 'string') {
    for (const part of text.split(',')) {
      const scope = /^\s*(shared|temp|local)/.exec(part)?.[1] || ''
      for (const m of part.matchAll(/(hit|read|dirtied|written)=(\d+)/g)) {
        const v = Number(m[2])
        if (scope === 'shared') { if (m[1] === 'hit') b.hit += v; else if (m[1] === 'read') b.read += v; else if (m[1] === 'dirtied') b.dirtied += v; else b.written += v }
        if (scope === 'temp') { if (m[1] === 'read') b.tempRead += v; else if (m[1] === 'written') b.tempWritten += v }
      }
    }
  }
  return b
}

// Every node gets its numbers: inclusive and exclusive time (ms), rows out,
// the misestimate, exclusive cost and buffers, and its depth and id.
/** @param {any} root */
export function measure(root) {
  /** @type {any[]} */
  const all = []
  const analyzed = (/** @type {any} */ n) => n.aTotal !== null && n.aTotal !== undefined
  let isAnalyzed = false
  /** @param {any} n @param {number} depth @param {any} parent */
  const walk = (n, depth, parent) => {
    n.id = all.length
    n.depth = depth
    n.parent = parent
    all.push(n)
    if (analyzed(n)) isAnalyzed = true
    for (const c of n.children) walk(c, depth + 1, n)
  }
  walk(root, 0, null)
  for (let i = all.length - 1; i >= 0; i--) {
    const n = all[i]
    // A parallel worker's times are per loop and the loops are the workers:
    // the wall clock is the per-loop time, not the product.
    n.incl = n.never ? 0 : analyzed(n) ? n.aTotal * (n.parallel ? 1 : Math.max(1, n.loops || 1)) : 0
    const kids = n.children.reduce((/** @type {number} */ s, /** @type {any} */ c) => s + c.incl, 0)
    n.excl = Math.max(0, n.incl - kids)
    n.costExcl = Math.max(0, (n.cost || 0) - n.children.reduce((/** @type {number} */ s, /** @type {any} */ c) => s + (c.cost || 0), 0))
    n.outRows = analyzed(n) ? (n.aRows || 0) * Math.max(1, n.loops || 1) : null
    n.estRows = (n.rows || 0) * (analyzed(n) ? Math.max(1, n.loops || 1) : 1)
    n.factor = n.outRows === null || n.never ? null : (() => { const a = Math.max(n.outRows, 1), e = Math.max(n.estRows, 1); return a >= e ? a / e : -(e / a) })()
    n.buf = buffersOf(n)
    const kb = n.children.reduce((/** @type {any} */ s, /** @type {any} */ c) => { s.hit += c.buf.hit; s.read += c.buf.read; return s }, { hit: 0, read: 0 })
    n.bufExcl = Math.max(0, n.buf.hit + n.buf.read - kb.hit - kb.read)
    n.tempExcl = Math.max(0, n.buf.tempWritten - n.children.reduce((/** @type {number} */ s, /** @type {any} */ c) => s + c.buf.tempWritten, 0))
  }
  return { all, analyzed: isAnalyzed }
}

// What stands out: facts, each on the node it is about, the plan's own
// numbers and nothing guessed. The free face says WHAT; advice with a
// weight is PlumeSQL's paid one.
/** @param {any[]} all @param {number} total @param {boolean} analyzed */
export function findings(all, total, analyzed) {
  /** @type {{ node: any, level: 'red'|'amber'|'muted', text: string, weight: number }[]} */
  const out = []
  const fmt = (/** @type {number} */ x) => Math.round(x).toLocaleString()
  for (const n of all) {
    if (analyzed && total > 0 && n.excl / total >= 0.2) out.push({ node: n, level: n.excl / total >= 0.5 ? 'red' : 'amber', text: pct(n.excl / total) + ' of the time is spent here', weight: 10 + n.excl / total })
    // Under a Limit a step stops early by design: fewer rows than planned
    // there is the Limit working, not a misestimate.
    const limited = n.factor !== null && n.factor < 0 && (() => { for (let p = n.parent; p; p = p.parent) if (p.type === 'Limit') return true; return false })()
    if (n.factor !== null && !limited && Math.abs(n.factor) >= 10 && Math.max(n.outRows, n.estRows) >= 100) {
      out.push({ node: n, level: Math.abs(n.factor) >= 100 ? 'red' : 'amber', text: 'rows ' + (n.factor > 0 ? 'under' : 'over') + 'estimated ×' + fmt(Math.abs(n.factor)) + ' (' + fmt(n.estRows) + ' planned, ' + fmt(n.outRows) + ' actual)', weight: 5 + Math.log10(Math.abs(n.factor)) })
    }
    const removed = Number(prop(n, 'Rows Removed by Filter') || 0) * Math.max(1, n.loops || 1)
    if (removed >= 1000 && n.outRows !== null && removed / (removed + n.outRows) >= 0.9) out.push({ node: n, level: 'amber', text: 'the filter discarded ' + pct(removed / (removed + n.outRows)) + ' of ' + fmt(removed + n.outRows) + ' rows read', weight: 4 + removed / 1e6 })
    if (/Seq Scan/.test(n.type) && n.outRows !== null && n.outRows + removed >= 100000 && !(removed >= 1000 && removed / (removed + n.outRows) >= 0.9)) out.push({ node: n, level: 'muted', text: 'reads the whole table, ' + fmt(n.outRows + removed) + ' rows', weight: 2 })
    const space = prop(n, 'Sort Space Type'), method = String(prop(n, 'Sort Method') || '').split(/\s{2,}/)[0]
    const sortSpill = space === 'Disk' || /external/.test(method)
    if (sortSpill) out.push({ node: n, level: 'red', text: 'the sort spilled to disk (' + (space === 'Disk' && prop(n, 'Sort Space Used') ? Math.round(Number(prop(n, 'Sort Space Used')) / 1024) + ' MB, ' : '') + (method || 'external') + ')', weight: 6 })
    const batches = packed(n, 'Batches') || packed(n, 'Hash Batches') || packed(n, 'HashAgg Batches')
    if (/Hash|Aggregate/.test(n.type) && batches > 1) out.push({ node: n, level: 'amber', text: (/Aggregate/.test(n.type) ? 'the aggregate' : 'the hash') + ' spilled to disk in ' + batches + ' batches', weight: 5 })
    else if (n.tempExcl > 0 && !sortSpill) out.push({ node: n, level: 'amber', text: bytes(n.tempExcl) + ' written to temporary files', weight: 4 })
    if (analyzed && (n.loops || 0) >= 1000 && n.parent && /Nested Loop/.test(n.parent.type)) out.push({ node: n, level: 'amber', text: 'runs ' + fmt(n.loops) + ' times inside a nested loop', weight: 4 })
    const fetches = Number(prop(n, 'Heap Fetches') || 0)
    if (/Index Only Scan/.test(n.type) && fetches > 0 && n.outRows && fetches / n.outRows >= 0.1) out.push({ node: n, level: 'muted', text: fmt(fetches) + ' heap fetches in an index only scan', weight: 2 })
    if (Number(prop(n, 'Lossy Heap Blocks') || 0) > 0) out.push({ node: n, level: 'muted', text: 'the bitmap went lossy (' + fmt(Number(prop(n, 'Lossy Heap Blocks'))) + ' blocks rechecked)', weight: 2 })
  }
  return out.sort((a, b) => b.weight - a.weight)
}

/** @param {number} f */
const pct = (f) => (f >= 0.995 ? '100' : f < 0.001 ? '<0.1' : (f * 100).toFixed(f < 0.1 ? 1 : 0)) + '%'
/** @param {number|null} ms */
const time = (ms) => (ms === null ? '' : ms >= 60000 ? (ms / 60000).toFixed(1) + ' min' : ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : ms >= 10 ? ms.toFixed(0) + ' ms' : ms >= 1 ? ms.toFixed(1) + ' ms' : ms.toFixed(3) + ' ms')
/** @param {number|null} n */
const count = (n) => (n === null ? '' : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString())
/** @param {number} blocks */
const bytes = (blocks) => { const b = blocks * 8192; return b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' kB' : b + ' B' }

// ----- drawing ------------------------------------------------------------------------

// The property rows worth reading first on the detail panel, the conditions
// and keys a plan hangs on; the rest follow as they came.
const LEAD = ['Filter', 'Index Cond', 'Recheck Cond', 'Hash Cond', 'Merge Cond', 'Join Filter', 'Sort Key', 'Group Key', 'Presorted Key', 'Output', 'Rows Removed by Filter', 'Rows Removed by Join Filter', 'Rows Removed by Index Recheck', 'Sort Method', 'Sort Space Used', 'Sort Space Type', 'Hash Buckets', 'Hash Batches', 'Peak Memory Usage', 'Heap Fetches', 'Workers Planned', 'Workers Launched']
const CODE_KEYS = /Cond|Filter$|Key$|^Output$/

let copyText = ''
let copySummary = ''

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Plan',
      // Opens by itself on an EXPLAIN result: it is the point of one.
      open: true,
      ask: 'never',
      // EXPLAIN answers one column named QUERY PLAN, JSON or text.
      when: (columns) => columns.length === 1 && /^query plan$/i.test(String(columns[0].name)),
      actions: [
        { label: 'Copy plan', run: (ctx) => ctx.copy(copyText) },
        { label: 'Copy summary', run: (ctx) => ctx.copy(copySummary) }
      ],
      render: async (root, data, ctx) => {
        const rows = await loadRows(data, ctx, 200000)
        const plan = readPlan(rows)
        const pal = ctx.palette
        const dark = ctx.theme !== 'light'
        const c = {
          bg: pal?.surface || (dark ? '#1a1b26' : '#ffffff'), ground: pal?.background || (dark ? '#16161e' : '#f4f5f8'), fg: pal?.text || (dark ? '#c8d3f5' : '#2f3542'),
          mut: pal?.muted || (dark ? '#8a92a6' : '#6b7280'), bd: pal?.border || (dark ? '#2a2e3f' : '#e3e5ea'), acc: pal?.accent || (dark ? '#7aa2f7' : '#3d6fe0'),
          red: pal?.red || (dark ? '#f7768e' : '#d9485f'), amber: pal?.amber || (dark ? '#e0af68' : '#b7791f'), green: pal?.green || (dark ? '#9ece6a' : '#2e9e5b'), violet: pal?.violet || (dark ? '#bb9af7' : '#7c5cd6')
        }
        root.style.cssText = 'margin:0;height:100%;overflow:auto;background:' + c.bg + ';color:' + c.fg + ';font:13px system-ui,-apple-system,sans-serif'
        if (!plan) {
          root.innerHTML = '<div style="padding:18px;color:' + c.mut + '">This result does not read as an EXPLAIN plan. Run EXPLAIN (FORMAT JSON), or the lens’s Explain on a statement.</div>'
          return
        }
        const { all, analyzed } = measure(plan.node)
        const total = analyzed ? (plan.execution ?? plan.node.incl) : plan.node.cost || 0
        const facts = findings(all, analyzed ? (plan.execution ?? plan.node.incl) : 0, analyzed)
        copyText = plan.text
        const totBuf = plan.node.buf
        copySummary = [
          analyzed ? 'Execution time: ' + time(plan.execution ?? plan.node.incl) : 'Total cost: ' + (plan.node.cost ?? 0).toFixed(2),
          plan.planning !== null ? 'Planning time: ' + time(plan.planning) : '',
          analyzed ? 'Rows: ' + count(plan.node.outRows) : 'Estimated rows: ' + count(plan.node.estRows),
          ...facts.slice(0, 8).map((f) => '- ' + f.node.label + (f.node.target ? ' on ' + f.node.target : '') + ': ' + f.text)
        ].filter(Boolean).join('\n')

        // The metric the bars and the icicle measure; the user switches it.
        let metric = analyzed ? 'time' : 'cost'
        const collapsed = new Set()
        let selected = facts.length ? facts[0].node.id : 0
        // A step's colour is its own share: red from half, amber from a
        // fifth, the accent from a twentieth, a quiet tint of it below.
        const heat = (/** @type {number} */ f) => (f >= 0.5 ? c.red : f >= 0.2 ? c.amber : f >= 0.05 ? c.acc : 'color-mix(in srgb, ' + c.acc + ' 45%, ' + c.bg + ')')
        const metricOf = (/** @type {any} */ n) => (metric === 'time' ? n.excl : metric === 'rows' ? n.outRows ?? n.estRows : metric === 'buffers' ? n.bufExcl : n.costExcl)
        const inclOf = (/** @type {any} */ n) => (metric === 'time' ? n.incl : metric === 'cost' ? n.cost || 0 : metricOf(n))
        const metricTotal = () => { const t = all.reduce((s, n) => s + (metricOf(n) || 0), 0); return t || 1 }
        const flagsOf = (/** @type {any} */ n) => facts.filter((f) => f.node === n)

        const css = `
          *{box-sizing:border-box}
          .ep{padding:14px 16px 24px;max-width:100%}
          .sum{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}
          .card{background:${c.ground};border:1px solid ${c.bd};border-radius:10px;padding:10px 14px;min-width:120px}
          .card b{display:block;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}
          .card span{color:${c.mut};font-size:11.5px}
          h3{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${c.mut};margin:16px 0 8px;font-weight:700;display:flex;align-items:center;gap:10px}
          .facts{display:flex;flex-direction:column;gap:4px}
          .fact{display:flex;gap:8px;align-items:baseline;padding:5px 8px;border-radius:6px;cursor:pointer;border:1px solid transparent}
          .fact:hover,.fact:focus-visible{background:${c.ground};border-color:${c.bd};outline:none}
          .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;transform:translateY(-1px)}
          .fact .on{color:${c.mut}}
          .fact.cur{background:color-mix(in srgb, ${c.acc} 12%, transparent);border-color:color-mix(in srgb, ${c.acc} 45%, transparent)}
          .fact .go{margin-left:auto;color:${c.mut};font-size:11px;white-space:nowrap;opacity:0}
          .fact:hover .go,.fact:focus-visible .go{opacity:1}
          @keyframes epflash{from{background:color-mix(in srgb, ${c.acc} 45%, transparent)}to{background:color-mix(in srgb, ${c.acc} 16%, transparent)}}
          @keyframes epflashside{from{box-shadow:0 0 0 2px ${c.acc}}to{box-shadow:0 0 0 0 transparent}}
          tr.row.flash td{animation:epflash 1.2s ease-out}
          .side.flash{animation:epflashside 1.2s ease-out}
          @media (prefers-reduced-motion: reduce){tr.row.flash td,.side.flash{animation:none}}
          .ice{position:relative;border:1px solid ${c.bd};border-radius:8px;background:${c.ground};overflow:hidden}
          .ib{position:absolute;height:20px;border-radius:3px;font-size:11px;line-height:20px;padding:0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;color:${c.bg};border:1px solid ${c.bg}}
          .ib.sel{outline:2px solid ${c.fg};outline-offset:-1px;z-index:2}
          .seg{display:inline-flex;border:1px solid ${c.bd};border-radius:6px;overflow:hidden;text-transform:none;letter-spacing:0;font-weight:500}
          .seg button{background:none;border:0;color:${c.mut};font:inherit;font-size:11.5px;padding:2px 8px;cursor:pointer}
          .seg button.on{background:${c.acc};color:${c.bg}}
          .main{display:flex;gap:14px;align-items:flex-start}
          .tree{flex:1;min-width:0;width:100%;border:1px solid ${c.bd};border-radius:8px;overflow:auto}
          table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
          th{position:sticky;top:0;background:${c.ground};color:${c.mut};font-size:11px;font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid ${c.bd};white-space:nowrap}
          td{padding:4px 8px;border-bottom:1px solid ${c.bd};white-space:nowrap;vertical-align:middle}
          tr.row{cursor:pointer}
          tr.row:hover td{background:${c.ground}}
          tr.row.sel td{background:color-mix(in srgb, ${c.acc} 16%, transparent)}
          tr.row:focus-visible{outline:2px solid ${c.acc};outline-offset:-2px}
          tr.never td{opacity:.45}
          .nm{display:flex;align-items:center;gap:4px;min-width:260px}
          .chev{width:14px;color:${c.mut};flex-shrink:0;text-align:center;user-select:none}
          .ty{font-weight:600}
          .tg{color:${c.mut};overflow:hidden;text-overflow:ellipsis;max-width:320px}
          .sub{font-size:10.5px;color:${c.violet};border:1px solid ${c.violet};border-radius:4px;padding:0 4px;margin-right:4px}
          .bar{display:flex;align-items:center;gap:6px;min-width:150px}
          .track{flex:1;height:8px;border-radius:4px;background:${c.ground};overflow:hidden;min-width:60px}
          .fill{height:100%;border-radius:4px}
          .num{text-align:right;color:${c.fg}}
          .mut{color:${c.mut}}
          .chip{display:inline-block;font-size:10.5px;border-radius:4px;padding:0 5px;margin-right:3px;border:1px solid}
          .est{font-size:10.5px;border-radius:4px;padding:0 4px;margin-left:4px}
          .side{width:360px;flex-shrink:0;border:1px solid ${c.bd};border-radius:8px;background:${c.ground};padding:12px 14px;position:sticky;top:0;max-height:calc(100vh - 40px);overflow:auto}
          .side h4{margin:0 0 2px;font-size:14px}
          .kv{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin-top:10px;font-size:12px}
          .kv .k{color:${c.mut};white-space:nowrap}
          .kv .v{word-break:break-word}
          .kv code{font:11.5px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;color:${c.fg}}
          .ep{container-type:inline-size}
          @container (max-width: 900px){.main{flex-direction:column}.side{width:100%;position:static;max-height:none}.tg{max-width:160px}}
        `

        const draw = () => {
          const hadRowFocus = !!root.ownerDocument.activeElement?.classList?.contains('row')
          const mt = metricTotal()
          const sel = all[selected] || all[0]
          // Summary cards: the whole run at a glance.
          const cards = []
          if (analyzed) cards.push(['Execution time', time(plan.execution ?? plan.node.incl)])
          if (plan.planning !== null) cards.push(['Planning time', time(plan.planning)])
          if (!analyzed) cards.push(['Total cost', (plan.node.cost ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })])
          cards.push([analyzed ? 'Rows returned' : 'Rows estimated', count(analyzed ? plan.node.outRows : plan.node.estRows)])
          if (totBuf.hit + totBuf.read > 0) cards.push(['Buffers', bytes(totBuf.hit + totBuf.read) + '<span> · ' + pct(totBuf.hit / (totBuf.hit + totBuf.read)) + ' cached</span>'])
          cards.push(['Steps', String(all.length)])
          const jit = plan.extra.find((e) => e[0] === 'JIT')
          if (jit && jit[1] && typeof jit[1] === 'object') { const t = /** @type {any} */ (jit[1]).Timing?.Total; if (t) cards.push(['JIT', time(Number(t))]) }
          let html = '<style>' + css + '</style><div class="ep"><div class="sum">' + cards.map(([k, v]) => '<div class="card"><span>' + escapeHtml(k) + '</span><b>' + v + '</b></div>').join('') + '</div>'

          // What stands out.
          if (facts.length) {
            html += '<h3>What stands out</h3><div class="facts">'
            for (const f of facts.slice(0, 7)) {
              html += '<div class="fact' + (f.node.id === selected ? ' cur' : '') + '" tabindex="0" title="Show this step in Steps" data-id="' + f.node.id + '"><span class="dot" style="background:' + (f.level === 'red' ? c.red : f.level === 'amber' ? c.amber : c.mut) + '"></span><span><b>' + escapeHtml(f.node.label) + '</b>' +
                (f.node.target ? ' <span class="on">on ' + escapeHtml(f.node.target) + '</span>' : '') + ': ' + escapeHtml(f.text) + '</span><span class="go">Show step ↓</span></div>'
            }
            html += '</div>'
          } else if (analyzed) html += '<h3>What stands out</h3><div class="mut" style="padding:4px 8px">Nothing: no step dominates, no estimate is far off, nothing spilled.</div>'

          // The icicle: every step as a box as wide as its share, children
          // under their parent, coloured by its own share.
          const seg = (analyzed ? ['time', 'rows', 'cost', 'buffers'] : ['cost', 'rows']).map((m) => '<button data-metric="' + m + '" class="' + (m === metric ? 'on' : '') + '">' + m[0].toUpperCase() + m.slice(1) + '</button>').join('')
          html += '<h3>Where it goes <span class="seg">' + seg + '</span></h3>'
          const maxDepth = all.reduce((d, n) => Math.max(d, n.depth), 0)
          let ice = '<div class="ice" style="height:' + ((maxDepth + 1) * 22 + 4) + 'px">'
          /** @param {any} n @param {number} x @param {number} w */
          const place = (n, x, w) => {
            if (w < 0.15) return
            const share = (metricOf(n) || 0) / mt
            const name = n.label + (n.target ? ' ' + n.target : '')
            ice += '<div class="ib' + (n.id === selected ? ' sel' : '') + '" data-id="' + n.id + '" title="' + escapeHtml(name + ' · ' + metricText(n) + ' · ' + pct(share) + ' of the ' + metric) + '" style="left:' + x.toFixed(3) + '%;width:' + w.toFixed(3) + '%;top:' + (2 + n.depth * 22) + 'px;background:' + heat(share) + '">' + (w > 6 ? escapeHtml(name) : '') + '</div>'
            const kids = n.children.filter((/** @type {any} */ k) => (inclOf(k) || 0) > 0)
            const sum = kids.reduce((/** @type {number} */ s, /** @type {any} */ k) => s + inclOf(k), 0)
            const own = inclOf(n) || sum || 1
            let cx = x
            for (const k of kids) { const kw = (w * inclOf(k)) / Math.max(own, sum); place(k, cx, kw); cx += kw }
          }
          const metricText = (/** @type {any} */ n) => (metric === 'time' ? time(n.excl) + ' own, ' + time(n.incl) + ' in all' : metric === 'rows' ? count(n.outRows ?? n.estRows) + ' rows' : metric === 'buffers' ? bytes(n.bufExcl) + ' own' : (n.costExcl || 0).toFixed(1) + ' own cost')
          if (metric === 'rows') {
            // Rows are not additive down a plan: every step gets its row.
            const maxR = Math.max(1, ...all.map((n) => n.outRows ?? n.estRows ?? 0))
            for (const n of all) {
              const w = Math.max(0.6, (100 * Math.log10(1 + (n.outRows ?? n.estRows ?? 0))) / Math.log10(1 + maxR))
              ice += '<div class="ib' + (n.id === selected ? ' sel' : '') + '" data-id="' + n.id + '" title="' + escapeHtml(n.label + ' · ' + count(n.outRows ?? n.estRows) + ' rows') + '" style="left:0;width:' + w + '%;top:' + (2 + n.depth * 22) + 'px;background:' + c.acc + ';opacity:.85">' + (w > 8 ? escapeHtml(n.label + ' · ' + count(n.outRows ?? n.estRows)) : '') + '</div>'
            }
          } else place(plan.node, 0, 100)
          html += ice + '</div>'

          // The tree: every step in plan order, with its numbers.
          html += '<h3>Steps</h3><div class="main"><div class="tree"><table><thead><tr><th>Step</th><th>' + (metric === 'time' ? 'Own time' : metric === 'buffers' ? 'Own buffers' : metric === 'rows' ? 'Rows' : 'Own cost') + '</th>' +
            (analyzed ? '<th class="num">In all</th>' : '') + '<th class="num">Rows</th>' + (analyzed ? '<th class="num">Loops</th>' : '') + '<th>Notes</th></tr></thead><tbody>'
          /** @param {any} n */
          const rowOf = (n) => {
            const share = (metricOf(n) || 0) / mt
            const hidden = (() => { for (let p = n.parent; p; p = p.parent) if (collapsed.has(p.id)) return true; return false })()
            if (hidden) return ''
            const chev = n.children.length ? (collapsed.has(n.id) ? '▸' : '▾') : ''
            const est = n.factor !== null && Math.abs(n.factor) >= 10 ? '<span class="est" style="background:color-mix(in srgb, ' + (Math.abs(n.factor) >= 100 ? c.red : c.amber) + ' 22%, transparent);color:' + (Math.abs(n.factor) >= 100 ? c.red : c.amber) + '" title="' + (n.factor > 0 ? 'under' : 'over') + 'estimated: ' + count(n.estRows) + ' planned">×' + count(Math.abs(n.factor)) + (n.factor > 0 ? '↑' : '↓') + '</span>' : ''
            const chips = flagsOf(n).filter((f) => !/of the time is spent here|estimated/.test(f.text)).map((f) => { const col = f.level === 'red' ? c.red : f.level === 'amber' ? c.amber : c.mut; return '<span class="chip" style="color:' + col + ';border-color:' + col + '" title="' + escapeHtml(f.text) + '">' + escapeHtml(f.text.split(/[(,]/)[0].replace(/^the /, '').trim()) + '</span>' }).join('')
            return '<tr class="row' + (n.id === selected ? ' sel' : '') + (n.never ? ' never' : '') + '" tabindex="' + (n.id === selected ? '0' : '-1') + '" data-id="' + n.id + '"><td><div class="nm" style="padding-left:' + n.depth * 16 + 'px"><span class="chev" data-toggle="' + n.id + '">' + chev + '</span>' +
              (n.sub ? '<span class="sub">' + escapeHtml(n.sub) + '</span>' : n.rel && n.rel !== 'Outer' && n.rel !== 'Inner' && n.rel !== 'Member' ? '<span class="sub">' + escapeHtml(n.rel) + '</span>' : '') +
              '<span class="ty">' + escapeHtml(n.label) + '</span>' + (n.target ? '<span class="tg">&nbsp;on ' + escapeHtml(n.target) + (n.index ? ' using ' + escapeHtml(n.index) : '') + '</span>' : n.index ? '<span class="tg">&nbsp;using ' + escapeHtml(n.index) + '</span>' : '') + '</div></td>' +
              '<td><div class="bar"><div class="track"><div class="fill" style="width:' + Math.max(share > 0 ? 1.5 : 0, share * 100).toFixed(1) + '%;background:' + heat(share) + '"></div></div><span class="num" style="min-width:64px">' + (metric === 'time' ? time(n.excl) : metric === 'buffers' ? bytes(n.bufExcl) : metric === 'rows' ? count(n.outRows ?? n.estRows) : (n.costExcl || 0).toFixed(1)) + '</span><span class="mut" style="min-width:40px;text-align:right">' + pct(share) + '</span></div></td>' +
              (analyzed ? '<td class="num">' + (n.never ? '<span class="mut">never ran</span>' : time(n.incl)) + '</td>' : '') +
              '<td class="num">' + (analyzed ? count(n.outRows) : count(n.estRows)) + est + '</td>' + (analyzed ? '<td class="num">' + (n.loops ?? '') + '</td>' : '') + '<td>' + chips + '</td></tr>'
          }
          html += all.map(rowOf).join('') + '</tbody></table></div>'

          // The detail of the selected step.
          const lead = LEAD.map((k) => [k, prop(sel, k)]).filter((p) => p[1] !== undefined)
          const rest = sel.props.filter((/** @type {[string, unknown]} */ p) => !LEAD.includes(p[0]))
          const val = (/** @type {string} */ k, /** @type {unknown} */ v) => { const s = Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v); return CODE_KEYS.test(k) ? '<code>' + escapeHtml(s) + '</code>' : escapeHtml(s) }
          const facts2 = flagsOf(sel)
          html += '<div class="side"><h4>' + escapeHtml(sel.label) + '</h4>' + (sel.target ? '<div class="mut">on ' + escapeHtml(sel.target) + (sel.index ? ' using ' + escapeHtml(sel.index) : '') + '</div>' : '') +
            (facts2.length ? '<div style="margin-top:8px">' + facts2.map((f) => '<div style="display:flex;gap:6px;align-items:baseline"><span class="dot" style="background:' + (f.level === 'red' ? c.red : f.level === 'amber' ? c.amber : c.mut) + '"></span>' + escapeHtml(f.text) + '</div>').join('') + '</div>' : '') +
            '<div class="kv">' +
            (analyzed ? '<span class="k">Own time</span><span class="v">' + time(sel.excl) + ' · ' + pct(total ? sel.excl / total : 0) + '</span><span class="k">In all</span><span class="v">' + time(sel.incl) + '</span>' : '') +
            '<span class="k">Rows</span><span class="v">' + (analyzed ? count(sel.outRows) + ' actual · ' : '') + count(sel.estRows) + ' planned</span>' +
            (analyzed ? '<span class="k">Loops</span><span class="v">' + (sel.loops ?? '') + '</span>' : '') +
            '<span class="k">Cost</span><span class="v">' + (sel.startup ?? 0).toFixed(2) + ' .. ' + (sel.cost ?? 0).toFixed(2) + ' · ' + (sel.costExcl || 0).toFixed(2) + ' own</span>' +
            (sel.buf.hit + sel.buf.read > 0 ? '<span class="k">Buffers</span><span class="v">' + bytes(sel.buf.hit) + ' cached, ' + bytes(sel.buf.read) + ' read' + (sel.buf.tempWritten ? ', ' + bytes(sel.buf.tempWritten) + ' temp' : '') + '</span>' : '') +
            lead.concat(rest).map((p) => '<span class="k">' + escapeHtml(p[0] || '·') + '</span><span class="v">' + val(String(p[0]), p[1]) + '</span>').join('') +
            '</div></div></div></div>'
          root.innerHTML = html
          // A redraw keeps the keyboard where it was: on the selected step
          // when a step had it, nowhere new otherwise.
          const active = root.ownerDocument.activeElement
          const row = /** @type {HTMLElement|null} */ (root.querySelector('tr.row.sel'))
          if (row && hadRowFocus && active !== row) row.focus({ preventScroll: true })
        }

        // choose selects a step. From the keyboard walk it only keeps the
        // row in view; from a fact or the icicle (`go`) it GOES there: the
        // folded steps above it open, the row comes to the middle of the
        // view and it and its detail flash once, so the click always shows
        // where it went, even on the step already selected.
        const reduced = !!root.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        const choose = (/** @type {number} */ id, /** @type {boolean} */ focus, go = false) => {
          selected = id
          if (go) for (let p = all[id]?.parent; p; p = p.parent) collapsed.delete(p.id)
          draw()
          const row = /** @type {HTMLElement|null} */ (root.querySelector('tr.row[data-id="' + id + '"]'))
          if (!row) return
          if (go) {
            row.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
            for (const el of [row, root.querySelector('.side')]) el?.classList.add('flash')
          } else row.scrollIntoView({ block: 'nearest' })
          if (focus) row.focus({ preventScroll: go })
        }
        root.onclick = (e) => {
          const t = /** @type {HTMLElement} */ (e.target)
          const metricBtn = t.closest('[data-metric]')
          if (metricBtn) { metric = String(metricBtn.getAttribute('data-metric')); draw(); return }
          const tog = t.closest('[data-toggle]')
          if (tog && tog.textContent) { const id = Number(tog.getAttribute('data-toggle')); if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id); draw(); return }
          const hit = t.closest('[data-id]')
          if (hit) choose(Number(hit.getAttribute('data-id')), true, !hit.classList.contains('row'))
        }
        // The keyboard: Up and Down walk the visible steps, Left folds or
        // goes to the parent, Right unfolds or goes to the first child, and
        // Enter on a fact goes to its step.
        root.onkeydown = (e) => {
          const t = /** @type {HTMLElement} */ (e.target)
          if (t.classList.contains('fact') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(Number(t.getAttribute('data-id')), true, true); return }
          if (!t.classList.contains('row')) return
          const visible = [...root.querySelectorAll('tr.row')].map((r) => Number(r.getAttribute('data-id')))
          const at = visible.indexOf(selected)
          const n = all[selected]
          if (e.key === 'ArrowDown' && at < visible.length - 1) { e.preventDefault(); choose(visible[at + 1], true) }
          else if (e.key === 'ArrowUp' && at > 0) { e.preventDefault(); choose(visible[at - 1], true) }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); if (n.children.length && !collapsed.has(n.id)) { collapsed.add(n.id); draw() } else if (n.parent) choose(n.parent.id, true) }
          else if (e.key === 'ArrowRight') { e.preventDefault(); if (collapsed.has(n.id)) { collapsed.delete(n.id); draw() } else if (n.children.length) choose(n.children[0].id, true) }
          else if (e.key === 'Home') { e.preventDefault(); choose(visible[0], true) }
          else if (e.key === 'End') { e.preventDefault(); choose(visible[visible.length - 1], true) }
        }
        draw()
      }
    }
  ]
}
