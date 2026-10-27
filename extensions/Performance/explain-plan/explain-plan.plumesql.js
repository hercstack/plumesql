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
  // The node a SubPlan, InitPlan or CTE line belongs to: psql prints that
  // line at the indent of its OWNER's children, so the step that follows
  // it is the owner's, never the sibling printed just above it.
  /** @type {any} */
  let pendingOwner = null
  /** @type {{ planning: boolean, planBuf: string, settings: string, triggers: { name: string, time: number, calls: number }[], serialization: string }} */
  const runText = { planning: false, planBuf: '', settings: '', triggers: [], serialization: '' }
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
      // "Index Scan using idx on tbl t" names the index and the table;
      // "Bitmap Index Scan on idx" names the index alone; "Seq Scan on
      // tbl t" the table.
      const used = /^(.+?) using (\S+) on (.+)$/.exec(text)
      const onAt = text.search(/ on /)
      const head = used ? used[1] : onAt > 0 ? text.slice(0, onAt) : text
      const on = used ? used[3] : onAt > 0 ? text.slice(onAt + 4) : ''
      const indexOnly = !used && /Index Scan$/.test(head)
      const node = {
        type: head, label: head, target: indexOnly ? '' : on, index: used ? used[2] : indexOnly ? on : '',
        startup: Number(m[4]), cost: Number(m[5]), rows: Number(m[6]), width: Number(m[7]),
        aStart: m[8] ? Number(m[8]) : null, aTotal: m[9] ? Number(m[9]) : null, aRows: m[10] ? Number(m[10]) : null, loops: m[11] ? Number(m[11]) : m[12] ? 0 : null,
        never: !!m[12], props: [], rel: '', sub: pendingSub, parallel: false, children: []
      }
      pendingSub = ''
      if (pendingOwner) {
        while (stack.length && stack[stack.length - 1].node !== pendingOwner) stack.pop()
        pendingOwner = null
      } else while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
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
    if (sub && !trailer) {
      pendingSub = t
      const at = line.length - line.trimStart().length
      pendingOwner = null
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].indent < at) { pendingOwner = stack[i].node; break }
      continue
    }
    const top = /^(Planning Time|Execution Time|Planning time|Execution time):\s*([\d.]+)\s*ms/.exec(t)
    if (top) { times[top[1].toLowerCase().startsWith('planning') ? 'Planning Time' : 'Execution Time'] = Number(top[2]); continue }
    // JIT's own block closes the text form: its Timing line's Total is
    // the figure the summary shows, as the JSON form's JIT.Timing.Total.
    // The other lines at the left edge are the run's own: the settings
    // EXPLAIN (SETTINGS) names, the triggers that fired, the cost of
    // sending the rows (SERIALIZE) and what planning read.
    if (trailer) {
      const jit = /^Timing:.*\bTotal\s+([\d.]+)\s*ms/.exec(t)
      if (jit) times.jit = Number(jit[1])
      if (/^Planning:$/.test(t)) runText.planning = true
      else if (/^Buffers:/.test(t) && runText.planning) runText.planBuf = t.replace(/^Buffers:\s*/, '')
      else if (!/^\s/.test(line)) runText.planning = false
      const set = /^Settings:\s*(.+)$/.exec(t)
      if (set) runText.settings = set[1]
      const trg = /^Trigger (.+?): time=([\d.]+) calls=(\d+)/.exec(t)
      if (trg) runText.triggers.push({ name: trg[1], time: Number(trg[2]), calls: Number(trg[3]) })
      const ser = /^Serialization: (.+)$/.exec(t)
      if (ser) runText.serialization = ser[1]
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
  return root ? [{ Plan: null, node: root, 'Planning Time': times['Planning Time'], 'Execution Time': times['Execution Time'], jit: times.jit, run: runText }] : null
}

// The document from the result: a JSON cell, or the text lines.
// The run's own facts beside the tree, one shape for both forms: the
// settings that differ from the defaults (EXPLAIN SETTINGS), the triggers
// that fired and their time, the cost of sending the rows (SERIALIZE),
// and the buffers planning read.
/** @typedef {{ settings: string, triggers: { name: string, time: number, calls: number }[], serialization: string, planBuf: string }} RunFacts */
/** @param {any} top @returns {RunFacts} */
function runOfJson(top) {
  const set = top.Settings && typeof top.Settings === 'object' ? Object.entries(top.Settings).map(([k, v]) => k + ' = ' + JSON.stringify(v).replace(/^"|"$/g, "'")).join(', ') : ''
  const triggers = Array.isArray(top.Triggers) ? top.Triggers.map((/** @type {any} */ t) => ({ name: String(t['Trigger Name'] ?? '') + (t.Relation ? ' on ' + t.Relation : ''), time: Number(t.Time ?? 0), calls: Number(t.Calls ?? 0) })) : []
  const ser = top.Serialization && typeof top.Serialization === 'object' ? 'time=' + (top.Serialization.Time ?? '?') + ' ms  output=' + (top.Serialization['Output Volume'] ?? '?') + 'kB  format=' + (top.Serialization.Format ?? '') : ''
  const pb = top.Planning && typeof top.Planning === 'object' ? top.Planning : null
  const planBuf = pb && (pb['Shared Hit Blocks'] || pb['Shared Read Blocks']) ? 'shared hit=' + (pb['Shared Hit Blocks'] || 0) + ' read=' + (pb['Shared Read Blocks'] || 0) : ''
  return { settings: set, triggers, serialization: ser, planBuf }
}

/** @param {any[][]} rows @returns {{ node: any, planning: number|null, execution: number|null, extra: [string, unknown][], text: string, run: RunFacts } | null} */
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
    return { node: fromJson(top.Plan, false), planning: num(top['Planning Time']), execution: num(top['Execution Time']), extra, text: typeof first === 'string' ? first : JSON.stringify(doc, null, 2), run: runOfJson(top) }
  }
  const lines = rows.map((r) => String(r[0] ?? ''))
  const t = fromText(lines)
  if (!t) return null
  const r = t[0].run
  return { node: t[0].node, planning: t[0]['Planning Time'] ?? null, execution: t[0]['Execution Time'] ?? null, extra: t[0].jit ? [['JIT', { Timing: { Total: t[0].jit } }]] : [], text: lines.join('\n'), run: { settings: r.settings, triggers: r.triggers, serialization: r.serialization, planBuf: r.planBuf } }
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
    // Under a Limit a step stops early by design: fewer rows than planned
    // there is the Limit working, not a misestimate.
    n.limited = n.factor !== null && n.factor < 0 && (() => { for (let p = n.parent; p; p = p.parent) if (p.type === 'Limit') return true; return false })()
    n.buf = buffersOf(n)
    const kb = n.children.reduce((/** @type {any} */ s, /** @type {any} */ c) => { s.hit += c.buf.hit; s.read += c.buf.read; return s }, { hit: 0, read: 0 })
    n.bufExcl = Math.max(0, n.buf.hit + n.buf.read - kb.hit - kb.read)
    n.tempExcl = Math.max(0, n.buf.tempWritten - n.children.reduce((/** @type {number} */ s, /** @type {any} */ c) => s + c.buf.tempWritten, 0))
  }
  return { all, analyzed: isAnalyzed }
}

// What stands out: facts, each on the node it is about, the plan's own
// numbers and the server's parameters it ran under, nothing guessed; and
// beside a fact whose numbers point at a change, that change (advice):
// the statement to run and what it should do.
/** @typedef {{ sql?: string, text: string }} Advice */
/** @param {any[]} all @param {number} total @param {boolean} analyzed @param {RunSettings} [set] the server's parameters it ran under (runSettings) */
export function findings(all, total, analyzed, set = {}) {
  /** @type {{ node: any, level: 'red'|'amber'|'muted', text: string, weight: number, advice?: Advice }[]} */
  const out = []
  const fmt = (/** @type {number} */ x) => Math.round(x).toLocaleString()
  // The memory a sort or a hash had before it spilled, beside the spill.
  const wm = set.work_mem ? ' · work_mem ' + set.work_mem.shown : ''
  const mult = Number(set.hash_mem_multiplier?.value)
  const hashMem = wm && set.work_mem?.bytes && mult > 0 && mult !== 1 ? wm + ' × hash_mem_multiplier ' + set.hash_mem_multiplier?.shown + ' = ' + bytes((set.work_mem.bytes * mult) / 8192) : wm
  const offSwitches = switchesOff(set)
  for (const n of all) {
    if (analyzed && total > 0 && n.excl / total >= 0.2) out.push({ node: n, level: n.excl / total >= 0.5 ? 'red' : 'amber', text: pct(n.excl / total) + ' of the time is spent here', weight: 10 + n.excl / total })
    if (n.factor !== null && !n.limited && Math.abs(n.factor) >= 10 && Math.max(n.outRows, n.estRows) >= 100) {
      out.push({ node: n, level: Math.abs(n.factor) >= 100 ? 'red' : 'amber', text: 'rows ' + (n.factor > 0 ? 'under' : 'over') + 'estimated ×' + fmt(Math.abs(n.factor)) + ' (' + fmt(n.estRows) + ' planned, ' + fmt(n.outRows) + ' actual)', weight: 5 + Math.log10(Math.abs(n.factor)) })
    }
    const removed = Number(prop(n, 'Rows Removed by Filter') || 0) * Math.max(1, n.loops || 1)
    if (removed >= 1000 && n.outRows !== null && removed / (removed + n.outRows) >= 0.9) out.push({ node: n, level: 'amber', text: 'the filter discarded ' + pct(removed / (removed + n.outRows)) + ' of ' + fmt(removed + n.outRows) + ' rows read', weight: 4 + removed / 1e6 })
    if (/Seq Scan/.test(n.type) && n.outRows !== null && n.outRows + removed >= 100000 && !(removed >= 1000 && removed / (removed + n.outRows) >= 0.9)) out.push({ node: n, level: 'muted', text: 'reads the whole table, ' + fmt(n.outRows + removed) + ' rows', weight: 2 })
    const space = prop(n, 'Sort Space Type'), method = String(prop(n, 'Sort Method') || '').split(/\s{2,}/)[0]
    const sortSpill = space === 'Disk' || /external/.test(method)
    // What a sort wrote to disk, in kB: the JSON form's own key, or the
    // text form's "Sort Method: external merge  Disk: 23456kB".
    const diskKb = space === 'Disk' && prop(n, 'Sort Space Used') ? Number(prop(n, 'Sort Space Used')) : Number(/Disk:\s*(\d+)kB/.exec(String(prop(n, 'Sort Method') || ''))?.[1] || 0)
    // In memory a sort takes more than it wrote out: twice the disk.
    if (sortSpill) out.push({ node: n, level: 'red', text: 'the sort spilled to disk (' + (diskKb ? Math.round(diskKb / 1024) + ' MB, ' : '') + (method || 'external') + ')' + wm, weight: 6, advice: memAdvice(diskKb * 2048, set, 1, 'should let it sort in memory') })
    const batches = packed(n, 'Batches') || packed(n, 'Hash Batches') || packed(n, 'HashAgg Batches')
    // A hash in batches held one batch's worth at a time: all of them is
    // what it needed, and a hash may take work_mem times the multiplier.
    const peakKb = Number(prop(n, 'Peak Memory Usage') || 0) || packed(n, 'Memory Usage')
    if (/Hash|Aggregate/.test(n.type) && batches > 1) out.push({ node: n, level: 'amber', text: (/Aggregate/.test(n.type) ? 'the aggregate' : 'the hash') + ' spilled to disk in ' + batches + ' batches' + hashMem, weight: 5, advice: memAdvice(peakKb * 1024 * batches, set, mult > 0 ? mult : 1, 'should keep it in memory, in one batch') })
    else if (n.tempExcl > 0 && !sortSpill) out.push({ node: n, level: 'amber', text: bytes(n.tempExcl) + ' written to temporary files' + wm, weight: 4, advice: memAdvice(n.tempExcl * 8192 * 2, set, 1, 'should keep it in memory') })
    // A Gather that got fewer workers than it planned for: the server's
    // limits were taken by other work at the time.
    const planned = Number(prop(n, 'Workers Planned') ?? 0), launched = prop(n, 'Workers Launched')
    if (planned > 0 && launched !== undefined && Number(launched) < planned) {
      const limits = ['max_parallel_workers', 'max_worker_processes'].filter((k) => set[k]).map((k) => k + ' ' + set[k].shown).join(', ')
      const most = Number(set.max_parallel_workers?.value)
      out.push({
        node: n, level: 'amber', text: 'launched ' + Number(launched) + ' of ' + planned + ' planned workers' + (limits ? ' · ' + limits : ''), weight: 4,
        // Below what it planned, the session's own limit can rise (up to
        // max_worker_processes); at or above it, other queries held the
        // workers when it ran.
        advice: set.max_parallel_workers && most < planned
          ? { sql: 'SET max_parallel_workers = ' + planned, text: 'for this session lets it start them, within max_worker_processes' }
          : set.max_parallel_workers ? { text: "other queries held the server's workers when it ran; if it happens often, more of them takes a larger max_worker_processes and max_parallel_workers (a restart)" } : undefined
      })
    }
    if (analyzed && (n.loops || 0) >= 1000 && n.parent && /Nested Loop/.test(n.parent.type)) out.push({ node: n, level: 'amber', text: 'runs ' + fmt(n.loops) + ' times inside a nested loop', weight: 4 })
    // A SubPlan runs once for every row of the step it belongs to: a
    // correlated subquery, whose time is its run times that count.
    if (analyzed && /^SubPlan/.test(n.sub) && (n.loops || 0) >= 10) out.push({ node: n, level: total > 0 && n.incl / total >= 0.2 ? 'amber' : 'muted', text: 'a subquery run once per row, ' + fmt(n.loops) + ' times' + (total > 0 ? ', ' + pct(n.incl / total) + ' of the time with what it reads' : ''), weight: 3 + (total > 0 ? n.incl / total : 0) })
    const fetches = Number(prop(n, 'Heap Fetches') || 0)
    if (/Index Only Scan/.test(n.type) && fetches > 0 && n.outRows && fetches / n.outRows >= 0.1) out.push({ node: n, level: 'muted', text: fmt(fetches) + ' heap fetches in an index only scan', weight: 2 })
    // PostgreSQL 17 marks a step the planner was told to avoid (an
    // enable_* setting off) and used anyway, having no other way.
    if (prop(n, 'Disabled') === true || prop(n, 'Disabled') === 'true') out.push({ node: n, level: 'amber', text: 'a step the planner was told to avoid (' + (offSwitches.length ? offSwitches.join(', ') + ' off' : 'an enable_ setting is off') + ') and used anyway', weight: 3, advice: switchesAdvice(offSwitches, set) })
    if (Number(prop(n, 'Lossy Heap Blocks') || 0) > 0) out.push({ node: n, level: 'muted', text: 'the bitmap went lossy (' + fmt(Number(prop(n, 'Lossy Heap Blocks'))) + ' blocks rechecked)', weight: 2 })
  }
  return out.sort((a, b) => b.weight - a.weight)
}

// ----- the server's parameters -------------------------------------------------------

// What a plan is read against, from the server (ctx.settings, PlumeSQL
// 0.29.0 and later): the memory a sort or a hash may take before it
// spills, the JIT thresholds, the parallel worker limits, whether reads
// are timed, and the planner's enable_ switches. Facts beside the plan's
// own numbers, never advice.
const ENABLES = ['async_append', 'bitmapscan', 'distinct_reordering', 'gathermerge', 'group_by_reordering', 'hashagg', 'hashjoin', 'incremental_sort', 'indexonlyscan', 'indexscan', 'material', 'memoize', 'mergejoin', 'nestloop', 'parallel_append', 'parallel_hash', 'partition_pruning', 'partitionwise_aggregate', 'partitionwise_join', 'presorted_aggregate', 'self_join_elimination', 'seqscan', 'sort', 'tidscan'].map((k) => 'enable_' + k)
export const SETTING_NAMES = ['work_mem', 'hash_mem_multiplier', 'jit', 'jit_above_cost', 'jit_inline_above_cost', 'jit_optimize_above_cost', 'max_parallel_workers', 'max_parallel_workers_per_gather', 'max_worker_processes', 'track_io_timing', ...ENABLES]

/** @typedef {Record<string, { shown: string, value: string, bytes?: number, boot?: string, reset?: string }>} RunSettings */

// The planner's switches that were off for the run and are on out of the
// box (a few, the partitionwise ones, start off: those are no news).
/** @param {RunSettings} set */
const switchesOff = (set) => ENABLES.filter((k) => set[k]?.value === 'off' && set[k]?.boot !== 'off')

// The work_mem that keeps `need` bytes in memory (a hash may take it
// times `mult`), rounded up to a power of two, as people set it, and
// always above what it had. Past a gigabyte no session should take it:
// the query is the thing to change.
/** @param {number} need @param {RunSettings} set @param {number} mult @param {string} what @returns {Advice} */
function memAdvice(need, set, mult, what) {
  const had = set.work_mem?.bytes || 0
  let b = 1048576
  while (b * mult < need) b *= 2
  if (b <= had) b = had * 2
  if (b > 1073741824) return { text: 'that is more memory than a session should take; a query that keeps fewer rows here (a narrower filter, a LIMIT the step can stop at, an index already in order) is the way out' }
  const size = b >= 1073741824 ? b / 1073741824 + 'GB' : b / 1048576 + 'MB'
  return { sql: "SET work_mem = '" + size + "'", text: 'for this session ' + what + ' (it counts for each sort and hash, so keep it to the session)' }
}

// Switches off in the session that are on for the server: RESET gives the
// planner its choice back. One the server itself has off stays off.
/** @param {string[]} off @param {RunSettings} set @returns {Advice | undefined} */
function switchesAdvice(off, set) {
  const back = off.filter((k) => set[k]?.reset !== 'off')
  return back.length ? { sql: back.map((k) => 'RESET ' + k).join('; '), text: 'gives the planner its choice back' } : undefined
}

/** @type {Record<string, number>} */
const MEM_UNITS = { B: 1, kB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 }
// A memory amount as EXPLAIN SETTINGS writes it ('64MB'), in bytes.
/** @param {string} v */
const memBytes = (v) => { const m = /^(\d+(?:\.\d+)?)\s*(B|kB|MB|GB|TB)$/.exec(v.trim()); return m ? Number(m[1]) * MEM_UNITS[m[2]] : undefined }

// The parameters a plan ran under: the server's (the session's own, or
// what a new session starts with), and over them the plan's own word,
// EXPLAIN SETTINGS' list of what differed from the defaults, which alone
// knows a SET LOCAL inside the transaction it ran in.
/** @param {Record<string, any>} facts @param {string} planSettings @returns {RunSettings} */
export function runSettings(facts, planSettings) {
  /** @type {RunSettings} */
  const out = {}
  for (const [k, f] of Object.entries(facts || {})) {
    if (f && typeof f.shown === 'string') out[k] = { shown: f.shown, value: String(f.value ?? ''), ...(typeof f.bytes === 'number' ? { bytes: f.bytes } : {}), ...(typeof f.boot === 'string' ? { boot: f.boot } : {}), ...(typeof f.reset === 'string' ? { reset: f.reset } : {}) }
  }
  for (const m of String(planSettings || '').matchAll(/([A-Za-z_][\w.]*) = '([^']*)'/g)) {
    const b = memBytes(m[2])
    out[m[1].toLowerCase()] = { shown: m[2], value: m[2], ...(b !== undefined ? { bytes: b } : {}) }
  }
  return out
}

// The run's facts that take the server's parameters to read: the share
// JIT took and the thresholds the plan's cost crossed to get it, reads
// that are not timed, the planner's switches that were off (unless the
// plan's own Settings line already says so). Label and text, plain.
/** @param {any} plan @param {any[]} all @param {boolean} analyzed @param {RunSettings} set @returns {[string, string, Advice?][]} */
export function runFacts(plan, all, analyzed, set) {
  /** @type {[string, string, Advice?][]} */
  const out = []
  const jit = plan.extra.find((/** @type {[string, any]} */ e) => e[0] === 'JIT')
  const jitMs = Number(jit?.[1]?.Timing?.Total ?? 0)
  if (jitMs > 0 && plan.execution && jitMs / plan.execution >= 0.1) {
    const cost = plan.node.cost || 0
    const crossed = ['jit_above_cost', 'jit_inline_above_cost', 'jit_optimize_above_cost'].filter((k) => set[k] && Number(set[k].value) >= 0 && cost > Number(set[k].value))
    // Compiling pays off on a long run; a fifth of the run or more spent
    // on it is a query too short for it.
    out.push(['JIT', pct(jitMs / plan.execution) + ' of the run (' + time(jitMs) + ')' + (crossed.length ? ", the plan's cost " + Math.round(cost).toLocaleString() + ' past ' + crossed.map((k) => k + ' ' + Number(set[k].value).toLocaleString()).join(', ') : ''), jitMs / plan.execution >= 0.2 ? { sql: 'SET jit = off', text: 'for this session spares the compile on a query this short' } : undefined])
  }
  const timed = all.some((n) => n.props.some((/** @type {[string, unknown]} */ p) => /I\/O (?:Read )?Tim/.test(p[0])))
  if (analyzed && !timed && set.track_io_timing?.value === 'off' && all.some((n) => n.buf.read > 0)) out.push(['Reads', 'not timed: track_io_timing is off', { sql: 'SET track_io_timing = on', text: "times them in the next EXPLAIN (ANALYZE, BUFFERS); a superuser's session, or a role granted it" }])
  const off = switchesOff(set).filter((k) => !String(plan.run.settings || '').includes(k))
  if (off.length) out.push(['Off', off.join(', '), switchesAdvice(off, set)])
  return out
}

/** @param {number} f */
const pct = (f) => (f >= 0.995 ? '100' : f < 0.001 ? '<0.1' : (f * 100).toFixed(f < 0.1 ? 1 : 0)) + '%'
/** @param {number|null} ms */
const time = (ms) => (ms === null ? '' : ms >= 60000 ? (ms / 60000).toFixed(1) + ' min' : ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : ms >= 10 ? ms.toFixed(0) + ' ms' : ms >= 1 ? ms.toFixed(1) + ' ms' : ms.toFixed(3) + ' ms')
/** @param {number|null} n */
// Rounded where the unit rolls over, so 999,995 reads 1.0M, never 1000.0k.
const count = (n) => (n === null ? '' : n >= 999.95e6 ? (n / 1e9).toFixed(1) + 'B' : n >= 999.95e3 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString())
/** @param {number} blocks */
const bytes = (blocks) => { const b = blocks * 8192; return b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' kB' : b + ' B' }

// ----- drawing ------------------------------------------------------------------------

// A piece of advice, under its fact (block) or after a line of the run:
// its statement as a chip that copies itself, then what it should do.
/** @param {Advice | undefined} a @param {boolean} block */
const adviceHtml = (a, block) =>
  !a ? '' : '<span class="adv' + (block ? ' blk' : '') + '">→ ' + (a.sql ? '<code class="cp" tabindex="0" role="button" title="Copy the statement" data-copy="' + escapeHtml(a.sql + ';') + '">' + escapeHtml(a.sql) + '</code> ' : '') + escapeHtml(a.text) + '</span>'
// The same for the copied summary, as text.
/** @param {Advice | undefined} a */
const adviceText = (a) => (!a ? '' : ' → ' + (a.sql ? a.sql + '; ' : '') + a.text)

// The property rows worth reading first on the detail panel, the conditions
// and keys a plan hangs on; the rest follow as they came.
const LEAD = ['Filter', 'Index Cond', 'Recheck Cond', 'Hash Cond', 'Merge Cond', 'Join Filter', 'Sort Key', 'Group Key', 'Presorted Key', 'Output', 'Rows Removed by Filter', 'Rows Removed by Join Filter', 'Rows Removed by Index Recheck', 'Sort Method', 'Sort Space Used', 'Sort Space Type', 'Hash Buckets', 'Hash Batches', 'Peak Memory Usage', 'Heap Fetches', 'Workers Planned', 'Workers Launched']
const CODE_KEYS = /Cond|Filter$|Key$|^Output$/

let copyText = ''
let copySummary = ''
// How "Where it goes" draws, kept while the extension is loaded: the plan
// as a DIAGRAM (each step a card, the rows it passes up a line as thick
// as their number) or as BOXES (each step as wide as its share).
let face = 'diagram'

// A glyph per kind of step, drawn in the diagram's cards: what a step
// does at a glance, before its name is read.
/** @type {Record<string, string>} */
const ICON = {
  scan: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18"/>',
  index: '<path d="M4 6h9M4 12h6M4 18h3"/><path d="M17 4v16m0 0-3-3m3 3 3-3"/>',
  join: '<path d="M5 4v5a5 5 0 0 0 5 5h4a5 5 0 0 0 5-5V4"/><path d="M12 14v6"/>',
  hash: '<path d="M10 3 8 21M16 3l-2 18M4 9h16M3 15h16"/>',
  sort: '<path d="M7 4v16m0 0-3-3m3 3 3-3"/><path d="M17 20V4m0 0-3 3m3-3 3 3"/>',
  agg: '<path d="M18 5H6l6 7-6 7h12"/>',
  limit: '<path d="M4 12h11"/><path d="M19 5v14"/><path d="M12 9l3 3-3 3"/>',
  gather: '<path d="M4 5l7 7-7 7"/><path d="M11 12h9"/>',
  mat: '<rect x="4" y="4" width="16" height="5" rx="1"/><rect x="4" y="11" width="16" height="4" rx="1"/><rect x="4" y="17" width="16" height="3" rx="1"/>',
  sub: '<path d="M8 4c-3 1-3 5-3 8s0 7 3 8M16 4c3 1 3 5 3 8s0 7-3 8"/>',
  modify: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  other: '<circle cx="12" cy="12" r="7"/>'
}
/** @param {any} n */
const iconOf = (n) => {
  const t = String(n.type)
  if (/Index|Bitmap/.test(t)) return 'index'
  if (/(CTE|Subquery|Function|Values|Table Function|WorkTable|Named Tuplestore) Scan/.test(t)) return 'sub'
  if (/Scan/.test(t)) return 'scan'
  if (/Join|Nested Loop/.test(t)) return 'join'
  if (/^Hash$/.test(t)) return 'hash'
  if (/Sort/.test(t)) return 'sort'
  if (/Aggregate|Group|WindowAgg|Unique|SetOp/.test(t)) return 'agg'
  if (/Limit/.test(t)) return 'limit'
  if (/Gather/.test(t)) return 'gather'
  if (/Materialize|Memoize/.test(t)) return 'mat'
  if (/ModifyTable|^Insert|^Update|^Delete|^Merge/.test(t)) return 'modify'
  return 'other'
}
/** @param {string} s @param {number} max */
const clip = (s, max) => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)
// What tells a step from another of its kind: its table (and index), else
// what it works by, its condition or its key ("Hash Join (r.id = c.id)").
/** @param {any} n */
const whereOf = (n) => {
  if (n.target) return 'on ' + n.target + (n.index ? ' using ' + n.index : '')
  if (n.index) return 'using ' + n.index
  for (const k of ['Hash Cond', 'Merge Cond', 'Join Filter', 'Index Cond', 'Recheck Cond', 'Sort Key', 'Group Key', 'Presorted Key', 'Filter']) {
    const hit = n.props.find((/** @type {[string, unknown]} */ p) => p[0] === k)
    if (hit) return Array.isArray(hit[1]) ? hit[1].join(', ') : String(hit[1])
  }
  return ''
}

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
        // The whole plan is usually in hand already: ask the host for more
        // rows only when the result holds more than it handed over, and
        // never wait on that answer for good (a plan drawn from what came
        // is better than a pane that never draws).
        const have = data.rows || []
        // The server's parameters, asked beside the rows (an older PlumeSQL
        // has no ctx.settings), and never waited on for long either.
        const asked = typeof ctx.settings === 'function' ? Promise.race([ctx.settings(SETTING_NAMES).catch(() => ({})), new Promise((done) => setTimeout(() => done({}), 3000))]) : Promise.resolve({})
        const rows =
          ctx.rowCount && have.length >= ctx.rowCount
            ? have
            : await Promise.race([loadRows(data, ctx, 200000), new Promise((done) => setTimeout(() => done(have), 10000))])
        const known = /** @type {Record<string, any>} */ (await asked)
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
        const set = runSettings(known, plan.run.settings)
        const facts = findings(all, analyzed ? (plan.execution ?? plan.node.incl) : 0, analyzed, set)
        const more = runFacts(plan, all, analyzed, set)
        copyText = plan.text
        const totBuf = plan.node.buf
        copySummary = [
          analyzed ? 'Execution time: ' + time(plan.execution ?? plan.node.incl) : 'Total cost: ' + (plan.node.cost ?? 0).toFixed(2),
          plan.planning !== null ? 'Planning time: ' + time(plan.planning) : '',
          analyzed ? 'Rows: ' + count(plan.node.outRows) : 'Estimated rows: ' + count(plan.node.estRows),
          ...more.map(([k, v, a]) => k + ': ' + v + adviceText(a)),
          ...facts.slice(0, 8).map((f) => '- ' + f.node.label + (whereOf(f.node) ? ' ' + whereOf(f.node) : '') + ': ' + f.text + adviceText(f.advice))
        ].filter(Boolean).join('\n')

        // The metric the bars, the boxes and the diagram measure; the user
        // switches it.
        let metric = analyzed ? 'time' : 'cost'
        // The diagram's zoom (0 until the first draw fits it to the pane)
        // and where its cards were last laid out, for the keyboard walk and
        // the reveal of a selected card.
        let zoom = 0
        /** @type {{ W: number, H: number, pos: Map<number, { x: number, y: number }>, NW: number, NH: number } | null} */
        let lastLayout = null
        const collapsed = new Set()
        let selected = facts.length ? facts[0].node.id : 0
        // The step the detail beside showed at the last draw.
        let sideOf = -1
        // A step's colour is its own share: red from half, amber from a
        // fifth, the accent from a twentieth, a quiet tint of it below.
        const heat = (/** @type {number} */ f) => (f >= 0.5 ? c.red : f >= 0.2 ? c.amber : f >= 0.05 ? c.acc : 'color-mix(in srgb, ' + c.acc + ' 45%, ' + c.bg + ')')
        const metricOf = (/** @type {any} */ n) => (metric === 'time' ? n.excl : metric === 'rows' ? n.outRows ?? n.estRows : metric === 'buffers' ? n.bufExcl : n.costExcl)
        const inclOf = (/** @type {any} */ n) => (metric === 'time' ? n.incl : metric === 'cost' ? n.cost || 0 : metricOf(n))
        // One denominator for every share of the time, the run's own (so a
        // step's share reads the same in the facts, the boxes and Steps).
        const metricTotal = () => { if (metric === 'time' && analyzed && total > 0) return total; const t = all.reduce((s, n) => s + (metricOf(n) || 0), 0); return t || 1 }
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
          .adv{color:${c.mut};font-size:12px;margin-left:6px}
          .adv.blk{display:block;margin:3px 0 0}
          .cp{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:${c.ground};color:${c.fg};border:1px solid ${c.bd};border-radius:4px;padding:0 4px;cursor:copy}
          .cp:hover,.cp:focus-visible{border-color:${c.acc};outline:none}
          .cp.copied{border-color:${c.green}}
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
          .run{display:flex;flex-direction:column;gap:3px;margin:-4px 0 6px;font-size:12px;color:${c.mut}}
          .run b{color:${c.fg};font-weight:600;margin-right:4px}
          .find{display:flex;align-items:center;gap:8px;margin:0 0 8px}
          .find input{flex:1;max-width:340px;background:${c.ground};border:1px solid ${c.bd};border-radius:6px;color:${c.fg};font:inherit;font-size:12.5px;padding:4px 8px}
          .find input:focus{outline:2px solid ${c.acc};outline-offset:-1px}
          .seg button:disabled{opacity:.4;cursor:default}
          tr.dim td{opacity:.45}
          .col{flex:1;min-width:0}
          .zoom{display:inline-flex;gap:2px;margin-left:auto;text-transform:none;letter-spacing:0;font-weight:500}
          .zoom button{background:none;border:1px solid ${c.bd};border-radius:5px;color:${c.mut};font:inherit;font-size:11.5px;min-width:24px;padding:1px 6px;cursor:pointer}
          .zoom button:hover{color:${c.fg}}
          .dgv{border:1px solid ${c.bd};border-radius:8px;background:${c.ground};overflow:auto;max-height:68vh;cursor:grab;position:relative}
          .dgv.panning{cursor:grabbing}
          .dgv:focus-visible{outline:2px solid ${c.acc};outline-offset:-2px}
          .dgv svg{display:block;margin:0 auto}
          .dn{cursor:pointer}
          .dn .box{fill:${c.bg};stroke:${c.bd}}
          .dn:hover .box{stroke:${c.mut}}
          .dn.sel .box{stroke:${c.acc};stroke-width:2}
          .dn.never{opacity:.45}
          .dl{font:600 12.5px system-ui,-apple-system,sans-serif;fill:${c.fg}}
          .dt{font:11.5px system-ui,-apple-system,sans-serif;fill:${c.mut}}
          .dm{font:11.5px system-ui,-apple-system,sans-serif;fill:${c.fg};font-variant-numeric:tabular-nums}
          .dp{font:600 11.5px system-ui,-apple-system,sans-serif;font-variant-numeric:tabular-nums}
          .ds{font:600 10px system-ui,-apple-system,sans-serif;fill:${c.violet};letter-spacing:.02em}
          .el{font:10.5px system-ui,-apple-system,sans-serif;fill:${c.mut};paint-order:stroke;stroke:${c.ground};stroke-width:4px;stroke-linejoin:round;font-variant-numeric:tabular-nums}
          .dtog{cursor:pointer}
          .dtog circle{fill:${c.bg};stroke:${c.bd}}
          .dtog text{font:600 11px system-ui,-apple-system,sans-serif;fill:${c.mut}}
          @keyframes epnode{from{stroke-width:5}to{stroke-width:2}}
          .dn.flash .box{animation:epnode 1.2s ease-out}
          @media (prefers-reduced-motion: reduce){.dn.flash .box{animation:none}}
          @container (max-width: 900px){.main{flex-direction:column;align-items:stretch}.side{width:100%;position:static;max-height:none}.tg{max-width:160px}}
        `

        // The Steps search: what a step's row matches, its name, table,
        // index, subplan and every property (conditions, keys, output).
        let query = ''
        /** @type {Set<number>} */
        let hits = new Set()
        /** @type {Set<number>} */
        let kin = new Set()
        const search = (/** @type {string} */ q) => {
          query = q
          hits = new Set()
          kin = new Set()
          const w = q.trim().toLowerCase()
          if (!w) return
          for (const n of all) {
            const text = [n.label, n.target, n.index, n.sub, n.rel, ...n.props.map((/** @type {[string, unknown]} */ p) => p[0] + ' ' + (typeof p[1] === 'object' ? JSON.stringify(p[1]) : String(p[1])))].join(' ').toLowerCase()
            if (text.includes(w)) { hits.add(n.id); for (let p = n.parent; p; p = p.parent) kin.add(p.id) }
          }
        }
        const draw = () => {
          const hadRowFocus = !!root.ownerDocument.activeElement?.classList?.contains('row')
          const mt = metricTotal()
          const sel = all[selected] || all[0]
          // Summary cards: the whole run at a glance.
          const cards = []
          if (analyzed) cards.push(['Execution time', time(plan.execution ?? plan.node.incl)])
          const planBufBlocks = (plan.run.planBuf.match(/\d+/g) || []).reduce((a, x) => a + Number(x), 0)
          if (plan.planning !== null) cards.push(['Planning time', time(plan.planning) + (planBufBlocks ? '<span> · ' + bytes(planBufBlocks) + ' of buffers</span>' : '')])
          if (!analyzed) cards.push(['Total cost', (plan.node.cost ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })])
          cards.push([analyzed ? 'Rows returned' : 'Rows estimated', count(analyzed ? plan.node.outRows : plan.node.estRows)])
          if (totBuf.hit + totBuf.read > 0) cards.push(['Buffers', bytes(totBuf.hit + totBuf.read) + '<span> · ' + pct(totBuf.hit / (totBuf.hit + totBuf.read)) + ' cached</span>'])
          cards.push(['Steps', String(all.length)])
          const jit = plan.extra.find((e) => e[0] === 'JIT')
          if (jit && jit[1] && typeof jit[1] === 'object') { const t = /** @type {any} */ (jit[1]).Timing?.Total; if (t) cards.push(['JIT', time(Number(t))]) }
          let html = '<style>' + css + '</style><div class="ep"><div class="sum">' + cards.map(([k, v]) => '<div class="card"><span>' + escapeHtml(k) + '</span><b>' + v + '</b></div>').join('') + '</div>'
          // The run's own facts, when the EXPLAIN carried them.
          const runLines = []
          if (plan.run.settings) runLines.push('<b>Settings</b> ' + escapeHtml(plan.run.settings))
          for (const tr of plan.run.triggers) runLines.push('<b>Trigger</b> ' + escapeHtml(tr.name) + ': ' + escapeHtml(time(tr.time)) + ' in ' + tr.calls.toLocaleString() + ' call' + (tr.calls === 1 ? '' : 's'))
          if (plan.run.serialization) runLines.push('<b>Serialization</b> ' + escapeHtml(plan.run.serialization))
          for (const [k, v, a] of more) runLines.push('<b>' + escapeHtml(k) + '</b> ' + escapeHtml(v) + adviceHtml(a, false))
          if (runLines.length) html += '<div class="run">' + runLines.map((l) => '<div>' + l + '</div>').join('') + '</div>'

          // What stands out.
          if (facts.length) {
            html += '<h3>What stands out</h3><div class="facts">'
            for (const f of facts.slice(0, 7)) {
              html += '<div class="fact' + (f.node.id === selected ? ' cur' : '') + '" tabindex="0" title="Show this step in Steps" data-id="' + f.node.id + '"><span class="dot" style="background:' + (f.level === 'red' ? c.red : f.level === 'amber' ? c.amber : c.mut) + '"></span><span><b>' + escapeHtml(f.node.label) + '</b>' +
                (whereOf(f.node) ? ' <span class="on">' + escapeHtml(clip(whereOf(f.node), 60)) + '</span>' : '') + ': ' + escapeHtml(f.text) + adviceHtml(f.advice, true) + '</span><span class="go">Show step ↓</span></div>'
            }
            html += '</div>'
          } else if (analyzed) html += '<h3>What stands out</h3><div class="mut" style="padding:4px 8px">Nothing: no step dominates, no estimate is far off, nothing spilled.</div>'

          // The diagram: every step a card under the step that uses its
          // rows, the line between them as thick as the rows it carries (the
          // lines up to the selected card in the accent, its way to the
          // result); a card's bar and percentage are its OWN share, its
          // numbers what it did itself, and under its name what it is on or
          // what it works by (its table and index, else its condition or
          // key).
          const diagram = () => {
            const NW = 236, NH = 80, GX = 28, GY = 60, PAD = 18
            const kidsOf = (/** @type {any} */ n) => (collapsed.has(n.id) ? [] : n.children)
            /** @type {Map<number, number>} */
            const wOf = new Map()
            const span = (/** @type {any} */ n) => {
              const ks = kidsOf(n)
              const v = Math.max(NW, ks.reduce((/** @type {number} */ a, /** @type {any} */ k) => a + span(k), 0) + Math.max(0, ks.length - 1) * GX)
              wOf.set(n.id, v)
              return v
            }
            const W = span(plan.node) + PAD * 2
            /** @type {Map<number, { x: number, y: number }>} */
            const pos = new Map()
            let H = 0
            const put = (/** @type {any} */ n, /** @type {number} */ left, /** @type {number} */ y) => {
              const ww = wOf.get(n.id) || NW
              pos.set(n.id, { x: left + (ww - NW) / 2, y })
              H = Math.max(H, y + NH)
              const ks = kidsOf(n)
              const kw = ks.reduce((/** @type {number} */ a, /** @type {any} */ k) => a + (wOf.get(k.id) || NW), 0) + Math.max(0, ks.length - 1) * GX
              let cx = left + (ww - kw) / 2
              for (const k of ks) { put(k, cx, y + NH + GY); cx += (wOf.get(k.id) || NW) + GX }
            }
            put(plan.node, PAD, PAD + 12)
            H += PAD + 8
            lastLayout = { W, H, pos, NW, NH }
            const z = zoom || 1
            const maxRows = Math.max(1, ...all.map((n) => n.outRows ?? n.estRows ?? 0))
            // The selected card's way up to the result.
            const lineage = new Set()
            for (let q = all[selected]; q; q = q.parent) lineage.add(q.id)
            let edges = ''
            let cards = ''
            for (const n of all) {
              const p = pos.get(n.id)
              if (!p) continue
              const share = (metricOf(n) || 0) / mt
              if (n.parent && pos.get(n.parent.id)) {
                const q = /** @type {{ x: number, y: number }} */ (pos.get(n.parent.id))
                const x1 = q.x + NW / 2, y1 = q.y + NH, x2 = p.x + NW / 2, y2 = p.y, my = (y1 + y2) / 2
                const r = n.outRows ?? n.estRows ?? 0
                const sw = 1.5 + (8 * Math.log10(1 + r)) / Math.log10(1 + maxRows)
                const lit = lineage.has(n.id)
                const col = n.never ? c.bd : lit ? c.acc : c.mut
                edges += '<path d="M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + my + ' ' + x2 + ' ' + my + ' ' + x2 + ' ' + y2 + '" fill="none" stroke="' + col + '" stroke-opacity="' + (n.never ? 0.5 : lit ? 0.9 : 0.55) + '" stroke-width="' + sw.toFixed(1) + '"><title>' + escapeHtml(count(r) + ' rows' + (n.outRows === null ? ' planned' : '') + ' from ' + n.label + ' up to ' + n.parent.label) + '</title></path>'
                edges += '<text class="el" x="' + (x2 + sw / 2 + 5).toFixed(1) + '" y="' + (y2 - 9).toFixed(1) + '">' + escapeHtml(n.never ? 'never ran' : count(r) + (n.outRows === null ? ' est.' : '') + ' rows') + '</text>'
              }
              const fl = flagsOf(n)
              const worst = fl.some((f) => f.level === 'red') ? c.red : fl.some((f) => f.level === 'amber') ? c.amber : fl.length ? c.mut : ''
              const tag = n.sub || (n.rel && !['Outer', 'Inner', 'Member'].includes(n.rel) ? n.rel : '')
              const where = whereOf(n)
              const own = metric === 'time' ? (analyzed ? time(n.excl) + ' own' : '') : metric === 'buffers' ? bytes(n.bufExcl) + ' own' : metric === 'rows' ? '' : (n.costExcl || 0).toFixed(1) + ' own cost'
              const rowsTxt = (analyzed ? count(n.outRows) : count(n.estRows) + ' est.') + ' rows'
              const est = n.factor !== null && !n.limited && Math.abs(n.factor) >= 10
              const estCol = est && Math.abs(n.factor) >= 100 ? c.red : c.amber
              const loops = analyzed && (n.loops || 0) > 1 ? ' · ×' + count(n.loops) : ''
              const pctCol = share >= 0.05 ? heat(share) : c.mut
              cards += '<g class="dn' + (n.id === selected ? ' sel' : '') + (n.never ? ' never' : '') + '" data-id="' + n.id + '">' +
                '<title>' + escapeHtml(n.label + (where ? ' ' + where : '') + (fl.length ? '\n' + fl.map((f) => '• ' + f.text).join('\n') : '')) + '</title>' +
                (tag ? '<text class="ds" x="' + (p.x + 4) + '" y="' + (p.y - 6) + '">' + escapeHtml(clip(tag, 34)) + '</text>' : '') +
                '<rect class="box" x="' + p.x + '" y="' + p.y + '" width="' + NW + '" height="' + NH + '" rx="9"/>' +
                '<rect x="' + (p.x + 1) + '" y="' + (p.y + NH - 5) + '" width="' + Math.max(share > 0 ? 3 : 0, (NW - 2) * Math.min(1, share)).toFixed(1) + '" height="4" rx="2" fill="' + heat(share) + '"/>' +
                '<svg x="' + (p.x + 11) + '" y="' + (p.y + 10) + '" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + (share >= 0.05 ? heat(share) : c.acc) + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON[iconOf(n)] + '</svg>' +
                '<text class="dl" x="' + (p.x + 34) + '" y="' + (p.y + 23) + '">' + escapeHtml(clip(n.label, 22)) + '</text>' +
                '<text class="dp" text-anchor="end" x="' + (p.x + NW - 11) + '" y="' + (p.y + 23) + '" fill="' + pctCol + '">' + (metric === 'rows' ? '' : pct(share)) + '</text>' +
                '<text class="dt" x="' + (p.x + 12) + '" y="' + (p.y + 43) + '">' + escapeHtml(clip(where || (n.never ? 'never ran' : ''), 34)) + '</text>' +
                '<text class="dm" x="' + (p.x + 12) + '" y="' + (p.y + 63) + '">' + escapeHtml(own ? own + ' · ' : '') + escapeHtml(rowsTxt) +
                (est ? '<tspan fill="' + estCol + '" font-weight="600"> ×' + escapeHtml(count(Math.abs(n.factor))) + (n.factor > 0 ? '↑' : '↓') + '</tspan>' : '') + escapeHtml(loops) + '</text>' +
                (worst ? '<circle cx="' + (p.x + NW - 12) + '" cy="' + (p.y + 59) + '" r="4" fill="' + worst + '"><title>' + escapeHtml(fl.map((f) => f.text).join('\n')) + '</title></circle>' : '') +
                (n.children.length ? '<g class="dtog" data-toggle="' + n.id + '"><title>' + (collapsed.has(n.id) ? 'Show the ' + n.children.length + ' step' + (n.children.length === 1 ? '' : 's') + ' under it' : 'Fold the steps under it') + '</title><circle cx="' + (p.x + NW / 2) + '" cy="' + (p.y + NH) + '" r="8"/><text text-anchor="middle" x="' + (p.x + NW / 2) + '" y="' + (p.y + NH + 4) + '">' + (collapsed.has(n.id) ? '+' : '−') + '</text></g>' : '') +
                '</g>'
            }
            return '<div class="dgv" tabindex="0" aria-label="The plan as a diagram: arrows walk the steps, Enter shows the step in Steps, + and − zoom, 0 fits">' +
              '<svg width="' + Math.ceil(W * z) + '" height="' + Math.ceil(H * z) + '" viewBox="0 0 ' + W + ' ' + H + '">' + edges + cards + '</svg></div>'
          }
          // The icicle: every step as a box as wide as its share, children
          // under their parent, coloured by its own share.
          // Every metric is offered; one the plan cannot give says which
          // EXPLAIN option brings it.
          const hasBuf = all.some((n) => n.buf.hit + n.buf.read + n.buf.tempWritten > 0)
          const why = (/** @type {string} */ m) => (m === 'time' && !analyzed ? 'Needs EXPLAIN ANALYZE: a plain EXPLAIN does not run the query' : m === 'buffers' && !hasBuf ? 'Needs EXPLAIN (ANALYZE, BUFFERS)' : '')
          const seg = ['time', 'rows', 'cost', 'buffers'].map((m) => '<button data-metric="' + m + '" class="' + (m === metric ? 'on' : '') + '"' + (why(m) ? ' disabled title="' + escapeHtml(why(m)) + '"' : '') + '>' + m[0].toUpperCase() + m.slice(1) + '</button>').join('')
          const faceSeg = [['diagram', 'Diagram'], ['boxes', 'Boxes']].map(([k, l]) => '<button data-face="' + k + '" class="' + (k === face ? 'on' : '') + '" title="' + (k === 'diagram' ? 'Each step a card, the rows it passes up a line as thick as their number' : 'Each step as wide as its share, under the step that uses its rows') + '">' + l + '</button>').join('')
          html += '<div class="main"><div class="col"><h3>Where it goes <span class="seg">' + faceSeg + '</span><span class="seg">' + seg + '</span>' +
            (face === 'diagram' ? '<span class="zoom"><button data-zoom="out" title="Zoom out (−)" aria-label="Zoom out">−</button><button data-zoom="fit" title="Fit the plan in view (0)">Fit</button><button data-zoom="in" title="Zoom in (+)" aria-label="Zoom in">+</button></span>' : '') + '</h3>'
          if (face === 'diagram') html += diagram()
          else {
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
          }

          // The tree: every step in plan order, with its numbers.
          html += '<h3>Steps</h3><div class="find"><input type="search" class="q" placeholder="Find a step: its name, table, index or condition" value="' + escapeHtml(query) + '" aria-label="Find a step">' + (query ? '<span class="mut">' + hits.size + ' of ' + all.length + '</span>' : '') + '</div><div class="tree"><table><thead><tr><th>Step</th><th>' + (metric === 'time' ? 'Own time' : metric === 'buffers' ? 'Own buffers' : metric === 'rows' ? 'Rows' : 'Own cost') + '</th>' +
            (analyzed ? '<th class="num">In all</th>' : '') + '<th class="num">Rows</th>' + (analyzed ? '<th class="num">Loops</th>' : '') + '<th>Notes</th></tr></thead><tbody>'
          /** @param {any} n */
          const rowOf = (n) => {
            const share = (metricOf(n) || 0) / mt
            const hidden = (() => { for (let p = n.parent; p; p = p.parent) if (collapsed.has(p.id)) return true; return false })()
            if (hidden) return ''
            // A search keeps the matches and the steps above them (dimmed),
            // so a match is still read in its place.
            if (query && !hits.has(n.id) && !kin.has(n.id)) return ''
            const chev = n.children.length ? (collapsed.has(n.id) ? '▸' : '▾') : ''
            const est = n.factor !== null && !n.limited && Math.abs(n.factor) >= 10 ? '<span class="est" style="background:color-mix(in srgb, ' + (Math.abs(n.factor) >= 100 ? c.red : c.amber) + ' 22%, transparent);color:' + (Math.abs(n.factor) >= 100 ? c.red : c.amber) + '" title="' + (n.factor > 0 ? 'under' : 'over') + 'estimated: ' + count(n.estRows) + ' planned">×' + count(Math.abs(n.factor)) + (n.factor > 0 ? '↑' : '↓') + '</span>' : ''
            const chips = flagsOf(n).filter((f) => !/of the time is spent here|estimated/.test(f.text)).map((f) => { const col = f.level === 'red' ? c.red : f.level === 'amber' ? c.amber : c.mut; return '<span class="chip" style="color:' + col + ';border-color:' + col + '" title="' + escapeHtml(f.text) + '">' + escapeHtml(f.text.split(/[(,]/)[0].replace(/^the /, '').trim()) + '</span>' }).join('')
            return '<tr class="row' + (n.id === selected ? ' sel' : '') + (n.never ? ' never' : '') + (query && !hits.has(n.id) ? ' dim' : '') + '" tabindex="' + (n.id === selected ? '0' : '-1') + '" data-id="' + n.id + '"><td><div class="nm" style="padding-left:' + n.depth * 16 + 'px"><span class="chev" data-toggle="' + n.id + '">' + chev + '</span>' +
              (n.sub ? '<span class="sub">' + escapeHtml(n.sub) + '</span>' : n.rel && n.rel !== 'Outer' && n.rel !== 'Inner' && n.rel !== 'Member' ? '<span class="sub">' + escapeHtml(n.rel) + '</span>' : '') +
              '<span class="ty">' + escapeHtml(n.label) + '</span>' + (n.target ? '<span class="tg">&nbsp;on ' + escapeHtml(n.target) + (n.index ? ' using ' + escapeHtml(n.index) : '') + '</span>' : n.index ? '<span class="tg">&nbsp;using ' + escapeHtml(n.index) + '</span>' : '') + '</div></td>' +
              '<td><div class="bar"><div class="track"><div class="fill" style="width:' + Math.max(share > 0 ? 1.5 : 0, share * 100).toFixed(1) + '%;background:' + heat(share) + '"></div></div><span class="num" style="min-width:64px">' + (metric === 'time' ? time(n.excl) : metric === 'buffers' ? bytes(n.bufExcl) : metric === 'rows' ? count(n.outRows ?? n.estRows) : (n.costExcl || 0).toFixed(1)) + '</span><span class="mut" style="min-width:40px;text-align:right">' + pct(share) + '</span></div></td>' +
              (analyzed ? '<td class="num">' + (n.never ? '<span class="mut">never ran</span>' : time(n.incl)) + '</td>' : '') +
              '<td class="num">' + (analyzed ? count(n.outRows) : count(n.estRows)) + est + '</td>' + (analyzed ? '<td class="num">' + (n.loops ?? '') + '</td>' : '') + '<td>' + chips + '</td></tr>'
          }
          html += all.map(rowOf).join('') + '</tbody></table></div></div>'

          // The detail of the selected step.
          const lead = LEAD.map((k) => [k, prop(sel, k)]).filter((p) => p[1] !== undefined)
          const rest = sel.props.filter((/** @type {[string, unknown]} */ p) => !LEAD.includes(p[0]))
          const val = (/** @type {string} */ k, /** @type {unknown} */ v) => {
            const s = Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? JSON.stringify(v) : String(v)
            // What a removal count means: its share of the rows the step read.
            if (/^Rows Removed by/.test(k) && sel.aRows !== null && sel.aRows !== undefined) {
              const r = Number(v) || 0
              return escapeHtml(s) + (r + sel.aRows > 0 ? ' <span class="mut">(' + pct(r / (r + sel.aRows)) + ' of the rows read)</span>' : '')
            }
            return CODE_KEYS.test(k) ? '<code>' + escapeHtml(s) + '</code>' : escapeHtml(s)
          }
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
          // The view's scroll, the diagram's own and its focus outlive the
          // redraw: a click must not throw the view back to its top (WebKit,
          // the desktop app's engine, puts a scroller whose content is
          // replaced back at its start), nor the diagram to its corner. The
          // detail beside keeps its scroll while it shows the same step.
          const view = { left: root.scrollLeft, top: root.scrollTop }
          const oldSide = /** @type {HTMLElement|null} */ (root.querySelector('.side'))
          const sideTop = oldSide && sideOf === sel.id ? oldSide.scrollTop : 0
          const oldDg = /** @type {HTMLElement|null} */ (root.querySelector('.dgv'))
          const dgScroll = oldDg ? { left: oldDg.scrollLeft, top: oldDg.scrollTop } : null
          const hadDgFocus = !!oldDg && root.ownerDocument.activeElement === oldDg
          const hadFind = !!root.ownerDocument.activeElement?.classList?.contains('q')
          root.innerHTML = html
          root.scrollLeft = view.left
          root.scrollTop = view.top
          sideOf = sel.id
          const side = root.querySelector('.side')
          if (side && sideTop) side.scrollTop = sideTop
          const dg = /** @type {HTMLElement|null} */ (root.querySelector('.dgv'))
          if (dg && dgScroll) { dg.scrollLeft = dgScroll.left; dg.scrollTop = dgScroll.top }
          if (dg && hadDgFocus) dg.focus({ preventScroll: true })
          // The first diagram fits the pane: the whole plan at a glance, never
          // larger than life and never so small that a card cannot be read.
          if (dg && zoom === 0 && lastLayout) {
            zoom = Math.max(0.6, Math.min(1, (dg.clientWidth - 4) / lastLayout.W, (root.clientHeight * 0.68 - 4) / lastLayout.H))
            draw()
            return
          }
          if (hadFind) {
            const q = /** @type {HTMLInputElement|null} */ (root.querySelector('input.q'))
            if (q) { q.focus({ preventScroll: true }); q.setSelectionRange(q.value.length, q.value.length) }
          }
          // A redraw keeps the keyboard where it was: on the selected step
          // when a step had it, nowhere new otherwise.
          const active = root.ownerDocument.activeElement
          const row = /** @type {HTMLElement|null} */ (root.querySelector('tr.row.sel'))
          if (row && hadRowFocus && active !== row) row.focus({ preventScroll: true })
        }

        // revealCard brings a card into the diagram's view, scrolling the
        // diagram alone (never the page under it), centred when `center`.
        const revealCard = (/** @type {number} */ id, center = false) => {
          const dg = /** @type {HTMLElement|null} */ (root.querySelector('.dgv'))
          const p = lastLayout?.pos.get(id)
          if (!dg || !p || !lastLayout) return
          const z = zoom || 1
          const x = p.x * z, y = p.y * z, w = lastLayout.NW * z, h = lastLayout.NH * z
          if (center) {
            dg.scrollLeft = x + w / 2 - dg.clientWidth / 2
            dg.scrollTop = y + h / 2 - dg.clientHeight / 2
            return
          }
          if (x < dg.scrollLeft) dg.scrollLeft = x - 12
          else if (x + w > dg.scrollLeft + dg.clientWidth) dg.scrollLeft = x + w - dg.clientWidth + 12
          if (y < dg.scrollTop) dg.scrollTop = y - 24
          else if (y + h > dg.scrollTop + dg.clientHeight) dg.scrollTop = y + h - dg.clientHeight + 24
        }
        // setZoom zooms around the diagram's middle, so what was in view
        // stays in view.
        const setZoom = (/** @type {number} */ next) => {
          const dg = /** @type {HTMLElement|null} */ (root.querySelector('.dgv'))
          const old = zoom || 1
          const z = Math.max(0.3, Math.min(2.5, next))
          if (!dg) { zoom = z; draw(); return }
          const cx = (dg.scrollLeft + dg.clientWidth / 2) / old, cy = (dg.scrollTop + dg.clientHeight / 2) / old
          zoom = z
          draw()
          const nd = /** @type {HTMLElement|null} */ (root.querySelector('.dgv'))
          if (nd) { nd.scrollLeft = cx * z - nd.clientWidth / 2; nd.scrollTop = cy * z - nd.clientHeight / 2 }
        }
        const fit = () => {
          const dg = /** @type {HTMLElement|null} */ (root.querySelector('.dgv'))
          if (!dg || !lastLayout) return
          setZoom(Math.max(0.3, Math.min(1, (dg.clientWidth - 4) / lastLayout.W, (Math.max(dg.clientHeight, 240) - 4) / lastLayout.H)))
          const nd = /** @type {HTMLElement|null} */ (root.querySelector('.dgv'))
          if (nd) { nd.scrollLeft = 0; nd.scrollTop = 0 }
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
          // The diagram follows the selection, inside its own frame.
          revealCard(id, go)
          if (go) {
            const card = root.querySelector('.dn[data-id="' + id + '"]')
            if (card && !reduced) card.classList.add('flash')
          }
          const row = /** @type {HTMLElement|null} */ (root.querySelector('tr.row[data-id="' + id + '"]'))
          if (!row) return
          if (go) {
            row.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
            for (const el of [row, root.querySelector('.side')]) el?.classList.add('flash')
          } else row.scrollIntoView({ block: 'nearest' })
          if (focus) row.focus({ preventScroll: go })
        }
        // A card picked in the diagram is selected where it stands: the
        // detail beside it changes and flashes, the page does not move.
        const pick = (/** @type {number} */ id) => {
          selected = id
          draw()
          revealCard(id)
          const side = root.querySelector('.side')
          if (side && !reduced) side.classList.add('flash')
          const dg = /** @type {HTMLElement|null} */ (root.querySelector('.dgv'))
          dg?.focus({ preventScroll: true })
        }
        let dragged = false
        // A piece of advice's statement copies itself, and says so a beat.
        const copyChip = (/** @type {Element} */ el) => {
          ctx.copy(String(el.getAttribute('data-copy') || ''))
          el.classList.add('copied')
          setTimeout(() => el.classList.remove('copied'), 1200)
        }
        root.onclick = (e) => {
          const t = /** @type {HTMLElement} */ (e.target)
          if (dragged) { dragged = false; return }
          const chip = t.closest('[data-copy]')
          if (chip) { copyChip(chip); return }
          const metricBtn = t.closest('[data-metric]')
          if (metricBtn) { metric = String(metricBtn.getAttribute('data-metric')); draw(); return }
          const faceBtn = t.closest('[data-face]')
          if (faceBtn) { face = String(faceBtn.getAttribute('data-face')); draw(); if (face === 'diagram') revealCard(selected); return }
          const zoomBtn = t.closest('[data-zoom]')
          if (zoomBtn) { const k = zoomBtn.getAttribute('data-zoom'); if (k === 'fit') fit(); else setZoom((zoom || 1) * (k === 'in' ? 1.25 : 0.8)); return }
          const tog = t.closest('[data-toggle]')
          if (tog && tog.textContent) { const id = Number(tog.getAttribute('data-toggle')); if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id); draw(); return }
          const hit = t.closest('[data-id]')
          if (!hit) return
          if (hit.classList.contains('dn')) { pick(Number(hit.getAttribute('data-id'))); return }
          choose(Number(hit.getAttribute('data-id')), true, !hit.classList.contains('row'))
        }
        // Dragging the diagram's background pans it, as a map does; the
        // wheel keeps scrolling (the page, or the diagram's own bars), and
        // Ctrl or Cmd with the wheel zooms.
        /** @type {{ x: number, y: number, left: number, top: number } | null} */
        let pan = null
        root.onpointerdown = (e) => {
          const t = /** @type {HTMLElement} */ (e.target)
          const dg = /** @type {HTMLElement|null} */ (t.closest('.dgv'))
          if (!dg || e.button !== 0 || t.closest('.dn, .dtog')) return
          pan = { x: e.clientX, y: e.clientY, left: dg.scrollLeft, top: dg.scrollTop }
          dragged = false
        }
        root.onpointermove = (e) => {
          if (!pan) return
          const dg = /** @type {HTMLElement|null} */ (root.querySelector('.dgv'))
          if (!dg) return
          const dx = e.clientX - pan.x, dy = e.clientY - pan.y
          if (!dragged && Math.abs(dx) + Math.abs(dy) < 4) return
          dragged = true
          dg.classList.add('panning')
          dg.scrollLeft = pan.left - dx
          dg.scrollTop = pan.top - dy
        }
        root.onpointerup = () => {
          pan = null
          root.querySelector('.dgv')?.classList.remove('panning')
        }
        root.oninput = (e) => {
          const t = /** @type {HTMLInputElement} */ (e.target)
          if (!t.classList.contains('q')) return
          search(t.value)
          // The first match is selected, so its detail shows beside.
          const first = all.find((n) => hits.has(n.id))
          if (first) selected = first.id
          draw()
        }
        root.addEventListener('wheel', (e) => {
          if (!(e.ctrlKey || e.metaKey) || !(/** @type {HTMLElement} */ (e.target)).closest('.dgv')) return
          e.preventDefault()
          setZoom((zoom || 1) * (e.deltaY < 0 ? 1.1 : 0.9))
        }, { passive: false })
        // The keyboard: Up and Down walk the visible steps, Left folds or
        // goes to the parent, Right unfolds or goes to the first child, and
        // Enter on a fact goes to its step.
        root.onkeydown = (e) => {
          const t = /** @type {HTMLElement} */ (e.target)
          if (t.classList.contains('cp') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); copyChip(t); return }
          if (t.classList.contains('fact') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(Number(t.getAttribute('data-id')), true, true); return }
          // The diagram: Up to the step that uses this one's rows, Down to
          // its first input, Left and Right to the card beside it on the
          // same level; Enter shows the step in Steps; + and − zoom, 0 fits.
          if (t.classList.contains('dgv')) {
            const n = all[selected]
            const lay = lastLayout
            if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom((zoom || 1) * 1.25); return }
            if (e.key === '-') { e.preventDefault(); setZoom((zoom || 1) * 0.8); return }
            if (e.key === '0') { e.preventDefault(); fit(); return }
            if (e.key === 'Enter') { e.preventDefault(); choose(selected, true, true); return }
            if (!n || !lay) return
            let next = -1
            if (e.key === 'ArrowUp' && n.parent) next = n.parent.id
            else if (e.key === 'ArrowDown' && n.children.length && !collapsed.has(n.id)) next = n.children[0].id
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              const me = lay.pos.get(n.id)
              if (me) {
                const row = all.filter((m) => lay.pos.get(m.id)?.y === me.y).sort((a, b) => (lay.pos.get(a.id)?.x ?? 0) - (lay.pos.get(b.id)?.x ?? 0))
                const i = row.indexOf(n)
                const m = row[i + (e.key === 'ArrowLeft' ? -1 : 1)]
                if (m) next = m.id
              }
            }
            if (next >= 0) { e.preventDefault(); pick(next) }
            return
          }
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
