// @ts-check
// @description A table statistics result (pg_stat_user_tables) as how near each table is to its next autovacuum and autoanalyze, by the server's own thresholds

// A VIEW on a result of the tables' statistics (pg_stat_user_tables,
// pg_stat_all_tables): autovacuum vacuums a table once its dead rows pass
//   autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor x its rows
// (capped by autovacuum_vacuum_max_threshold, PostgreSQL 18), vacuums it for
// its inserts past the insert threshold alike (PostgreSQL 13), and analyzes
// it once its changed rows pass the analyze threshold. The view reads those
// from the server (ctx.settings, PlumeSQL 0.29.0 and later) and draws each
// table's way there. A table's own storage parameters (ALTER TABLE ... SET
// (autovacuum_vacuum_scale_factor = ...)) override them, which a statistics
// result does not show: the view says so.

const esc = (/** @type {unknown} */ s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)
const NAMES = ['autovacuum', 'track_counts', 'autovacuum_naptime', 'autovacuum_vacuum_threshold', 'autovacuum_vacuum_scale_factor', 'autovacuum_vacuum_max_threshold', 'autovacuum_vacuum_insert_threshold', 'autovacuum_vacuum_insert_scale_factor', 'autovacuum_analyze_threshold', 'autovacuum_analyze_scale_factor']
const fmt = (/** @type {number} */ n) => Math.round(n).toLocaleString()
// The server's timestamp as it wrote it, to the second.
const when = (/** @type {unknown} */ v) => String(v).replace(/\.\d+/, '')

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Autovacuum',
      when: (columns) => ['relname', 'n_live_tup', 'n_dead_tup'].every((n) => columns.some((c) => c.name === n)),
      ask: 'never',
      render: async (root, data, ctx) => {
        const pal = ctx.palette
        const c = { bg: pal.surface, fg: pal.text, mut: pal.muted, bd: pal.border, acc: pal.accent, amber: pal.amber, red: pal.red, green: pal.green, ground: pal.background }
        root.style.cssText = 'margin:0;height:100%;overflow:auto;background:' + c.bg + ';color:' + c.fg + ';font:13px system-ui,-apple-system,sans-serif'
        if (typeof ctx.settings !== 'function') {
          root.innerHTML = '<div style="padding:18px;color:' + c.mut + '">This view reads the server’s autovacuum settings from PlumeSQL 0.29.0 and newer.</div>'
          return
        }
        const s = await ctx.settings(NAMES)
        const num = (/** @type {string} */ k, /** @type {number} */ d) => { const v = Number(s[k]?.value); return Number.isFinite(v) ? v : d }
        const on = (/** @type {string} */ k) => s[k]?.value !== 'off'
        const cols = data.columns.map((x) => x.name)
        const at = (/** @type {string} */ n) => cols.indexOf(n)
        const iSchema = at('schemaname'), iName = at('relname'), iLive = at('n_live_tup'), iDead = at('n_dead_tup'), iIns = at('n_ins_since_vacuum'), iMod = at('n_mod_since_analyze'), iLastV = at('last_autovacuum'), iLastM = at('last_vacuum')
        let rows = data.rows
        if (ctx.rowCount > rows.length) rows = rows.concat(await ctx.rows(rows.length, Math.min(ctx.rowCount, 20000) - rows.length))
        // The thresholds, each for the table's own rows (its live rows, the
        // statistics' word for pg_class.reltuples here).
        const vacBase = num('autovacuum_vacuum_threshold', 50), vacScale = num('autovacuum_vacuum_scale_factor', 0.2), vacMax = num('autovacuum_vacuum_max_threshold', -1)
        const insBase = num('autovacuum_vacuum_insert_threshold', 1000), insScale = num('autovacuum_vacuum_insert_scale_factor', 0.2)
        const anaBase = num('autovacuum_analyze_threshold', 50), anaScale = num('autovacuum_analyze_scale_factor', 0.1)
        const tables = rows.map((r) => {
          const live = Number(r[iLive]) || 0
          let vac = vacBase + vacScale * live
          if (vacMax > 0) vac = Math.min(vac, vacMax)
          const ins = iIns >= 0 && insBase >= 0 ? insBase + insScale * live : 0
          const ana = anaBase + anaScale * live
          const dead = Number(r[iDead]) || 0, inserted = iIns >= 0 ? Number(r[iIns]) || 0 : 0, changed = iMod >= 0 ? Number(r[iMod]) || 0 : 0
          const parts = [{ what: 'vacuum', n: dead, of: vac, word: 'dead' }, ...(ins > 0 ? [{ what: 'vacuum for inserts', n: inserted, of: ins, word: 'inserted' }] : []), ...(iMod >= 0 ? [{ what: 'analyze', n: changed, of: ana, word: 'changed' }] : [])]
          const top = parts.reduce((a, b) => (b.n / b.of > a.n / a.of ? b : a))
          return { name: (iSchema >= 0 ? r[iSchema] + '.' : '') + r[iName], live, parts, top, share: top.n / top.of, lastV: iLastV >= 0 ? r[iLastV] : null, lastM: iLastM >= 0 ? r[iLastM] : null }
        }).sort((a, b) => b.share - a.share)
        const bar = (/** @type {number} */ f) => {
          const w = Math.min(1, f) * 100
          const col = f >= 1 ? c.red : f >= 0.8 ? c.amber : c.acc
          return '<span class="bar"><span style="width:' + w.toFixed(1) + '%;background:' + col + '"></span></span>'
        }
        const css = `
          .av{padding:14px 16px 24px}
          .warn{border:1px solid ${c.red};color:${c.red};border-radius:6px;padding:8px 10px;margin-bottom:10px}
          .facts{color:${c.mut};font-size:12px;margin-bottom:10px;line-height:1.6}
          .facts code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:${c.fg}}
          table{border-collapse:collapse;width:100%}
          th{text-align:left;color:${c.mut};font-size:11px;font-weight:600;padding:4px 8px;border-bottom:1px solid ${c.bd};white-space:nowrap}
          td{padding:6px 8px;border-bottom:1px solid ${c.bd};vertical-align:middle}
          td.n{white-space:nowrap}
          td.mut{white-space:nowrap}
          .bar{display:inline-block;width:48px;height:6px;border-radius:3px;background:${c.ground};vertical-align:middle;margin-right:8px;overflow:hidden}
          .bar span{display:block;height:100%}
          .p{white-space:nowrap;font-variant-numeric:tabular-nums}
          .mut{color:${c.mut};font-size:12px}`
        let html = '<style>' + css + '</style><div class="av">'
        if (!on('autovacuum')) html += '<div class="warn">autovacuum is off on this server: no table is vacuumed or analyzed on its own, whatever its numbers.</div>'
        if (!on('track_counts')) html += '<div class="warn">track_counts is off: the statistics below are not counted, and autovacuum cannot tell when a table needs it.</div>'
        html += '<div class="facts">A table is vacuumed past <code>' + fmt(vacBase) + ' + ' + vacScale + ' × its rows</code> dead rows' + (vacMax > 0 ? ' (at most <code>' + fmt(vacMax) + '</code>)' : '') +
          (iIns >= 0 && insBase >= 0 ? ', past <code>' + fmt(insBase) + ' + ' + insScale + ' × its rows</code> inserted ones' : '') +
          ', and analyzed past <code>' + fmt(anaBase) + ' + ' + anaScale + ' × its rows</code> changed ones; the launcher looks every <code>' + esc(s.autovacuum_naptime?.shown ?? '1min') + '</code>. A table’s own storage parameters override these, which this result does not show.</div>'
        html += '<table><tr><th>Table</th><th>Rows</th><th>Nearest</th><th>Dead</th>' + (iIns >= 0 ? '<th>Inserted</th>' : '') + (iMod >= 0 ? '<th>Changed</th>' : '') + '<th>Last vacuum</th></tr>'
        for (const t of tables) {
          const cell = (/** @type {{ n: number, of: number, word: string }} */ p) => '<td class="p" title="' + fmt(p.n) + ' ' + p.word + ' of ' + fmt(p.of) + '">' + bar(p.n / p.of) + Math.round((p.n / p.of) * 100) + '%</td>'
          const find = (/** @type {string} */ w) => t.parts.find((p) => p.what === w)
          html += '<tr><td class="n">' + esc(t.name) + '</td><td class="p">' + fmt(t.live) + '</td><td class="mut">' + (t.share >= 1 ? esc(t.top.what) + ' due' : esc(t.top.what) + ' at ' + Math.round(t.share * 100) + '%') + '</td>' +
            cell(/** @type {any} */ (find('vacuum'))) + (iIns >= 0 ? (find('vacuum for inserts') ? cell(/** @type {any} */ (find('vacuum for inserts'))) : '<td class="mut">off</td>') : '') + (iMod >= 0 ? cell(/** @type {any} */ (find('analyze'))) : '') +
            '<td class="mut">' + esc(t.lastV != null ? when(t.lastV) : t.lastM != null ? when(t.lastM) + ' (by hand)' : 'never') + '</td></tr>'
        }
        html += '</table></div>'
        root.innerHTML = html
      }
    }
  ]
}
