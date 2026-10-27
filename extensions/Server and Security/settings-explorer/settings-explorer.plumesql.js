// @ts-check
// @description SHOW ALL or pg_settings as what matters: what this session changed, with the RESET that undoes it, what the server sets apart from the built-in values, and what waits for a restart

// A VIEW on a result of the server's configuration parameters (SHOW ALL,
// select * from pg_settings): the rows hold every parameter, three hundred
// and more, and the few that differ are what anyone opens them for. It asks
// PlumeSQL for the facts of the parameters the result names (ctx.settings,
// PlumeSQL 0.29.0 and later): each one's value in the session the result
// came from, what RESET gives and the built-in value, and groups them.

const esc = (/** @type {unknown} */ s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)
const CONTEXT = /** @type {Record<string, string>} */ ({ postmaster: 'restart', sighup: 'reload', superuser: 'superuser', 'superuser-backend': 'at connect', backend: 'at connect', user: 'any session', internal: 'fixed' })

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Settings',
      // SHOW ALL answers name, setting and description; pg_settings far more.
      when: (columns) => columns.some((c) => c.name === 'name') && columns.some((c) => c.name === 'setting'),
      ask: 'never',
      actions: [{ label: 'Copy the RESETs', icon: 'copy', run: (ctx) => ctx.copy(String(/** @type {any} */ (globalThis).__plumesqlSettingsResets || '')) }],
      render: async (root, data, ctx) => {
        const pal = ctx.palette
        const c = { bg: pal.surface, fg: pal.text, mut: pal.muted, bd: pal.border, acc: pal.accent, amber: pal.amber, red: pal.red, ground: pal.background }
        root.style.cssText = 'margin:0;height:100%;overflow:auto;background:' + c.bg + ';color:' + c.fg + ';font:13px system-ui,-apple-system,sans-serif'
        if (typeof ctx.settings !== 'function') {
          root.innerHTML = '<div style="padding:18px;color:' + c.mut + '">This view reads the parameters’ facts from PlumeSQL 0.29.0 and newer.</div>'
          return
        }
        const cols = data.columns.map((x) => x.name)
        const ni = cols.indexOf('name'), pi = cols.indexOf('pending_restart')
        let rows = data.rows
        if (ctx.rowCount > rows.length) rows = rows.concat(await ctx.rows(rows.length, ctx.rowCount - rows.length))
        const names = rows.map((r) => String(r[ni] ?? '')).filter(Boolean)
        const pending = new Set(pi < 0 ? [] : rows.filter((r) => r[pi] === true || r[pi] === 't' || r[pi] === 'true').map((r) => String(r[ni])))
        const facts = await ctx.settings(names)
        const all = names.map((n) => facts[n]).filter(Boolean)
        // What a SET of the session's own gave it (its source says so: a value
        // compared with RESET's reads unlike it through a show hook or a
        // client's startup parameter, though nobody changed it).
        const session = all.filter((f) => f.source === 'session')
        const server = all.filter((f) => f.reset !== undefined && f.boot !== undefined && f.reset !== f.boot)
        const resets = session.map((f) => 'RESET ' + f.name + ';').join('\n')
        ;/** @type {any} */ (globalThis).__plumesqlSettingsResets = resets
        const css = `
          .se{padding:14px 16px 24px}
          .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
          .card{border:1px solid ${c.bd};border-radius:8px;padding:8px 12px;min-width:120px}
          .card span{display:block;color:${c.mut};font-size:11px}
          .card b{font-size:20px;font-weight:600}
          h3{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${c.mut};margin:16px 0 6px;font-weight:600}
          .note{color:${c.mut};font-size:12px;margin:0 0 6px}
          table{border-collapse:collapse;width:100%}
          th{text-align:left;color:${c.mut};font-size:11px;font-weight:600;padding:4px 8px;border-bottom:1px solid ${c.bd};white-space:nowrap}
          td{padding:5px 8px;border-bottom:1px solid ${c.bd};vertical-align:baseline}
          td.v{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:nowrap}
          .badge{font-size:11px;border:1px solid ${c.bd};border-radius:10px;padding:0 6px;color:${c.mut};white-space:nowrap}
          .badge.restart{border-color:${c.amber};color:${c.amber}}
          .cp{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:${c.ground};border:1px solid ${c.bd};border-radius:4px;padding:0 4px;cursor:copy;white-space:nowrap}
          .cp:hover,.cp:focus-visible{border-color:${c.acc};outline:none}
          .q{width:260px;max-width:100%;padding:4px 8px;border:1px solid ${c.bd};border-radius:6px;background:${c.ground};color:${c.fg};font:inherit;margin-bottom:6px}
          .hide{display:none}`
        const badge = (/** @type {string} */ ctxName) => '<span class="badge' + (ctxName === 'postmaster' ? ' restart' : '') + '" title="Where it changes: ' + esc(ctxName) + '">' + esc(CONTEXT[ctxName] ?? ctxName) + '</span>'
        const row = (/** @type {any} */ f, /** @type {string} */ cellsHtml) => '<tr data-n="' + esc(f.name.toLowerCase()) + '"><td>' + esc(f.name) + '</td>' + cellsHtml + '</tr>'
        let html = '<style>' + css + '</style><div class="se"><div class="cards">' +
          '<div class="card"><span>Parameters</span><b>' + all.length + '</b></div>' +
          '<div class="card"><span>Changed in this session</span><b>' + session.length + '</b></div>' +
          '<div class="card"><span>Set for this server</span><b>' + server.length + '</b></div>' +
          (pi >= 0 ? '<div class="card"><span>Waiting for a restart</span><b>' + pending.size + '</b></div>' : '') +
          '</div><input class="q" type="search" placeholder="Find a parameter" aria-label="Find a parameter">'
        html += '<h3>Changed in this session</h3>'
        html += session.length
          ? '<p class="note">What a SET gave the session the result came from; RESET gives each back what the server sets.</p><table><tr><th>Parameter</th><th>Now</th><th>RESET gives</th><th>Changes</th><th></th></tr>' +
            session.map((f) => row(f, '<td class="v">' + esc(f.shown) + '</td><td class="v">' + esc(f.resetShown ?? f.reset) + '</td><td>' + badge(f.context) + '</td><td><code class="cp" tabindex="0" role="button" title="Copy the statement" data-copy="RESET ' + esc(f.name) + ';">RESET ' + esc(f.name) + '</code></td>')).join('') + '</table>'
          : '<p class="note">Nothing: every parameter has what RESET would give it' + (all.some((f) => f.from === 'session') ? '.' : ' (the result came from no session PlumeSQL read, so these are a new session’s values).') + '</p>'
        html += '<h3>Set for this server</h3>'
        html += server.length
          ? '<p class="note">What the configuration file, ALTER SYSTEM, the database or the role sets apart from the built-in value.</p><table><tr><th>Parameter</th><th>Set to</th><th>Built in</th><th>Changes</th>' + (pi >= 0 ? '<th></th>' : '') + '</tr>' +
            server.map((f) => row(f, '<td class="v">' + esc(f.resetShown ?? f.reset) + '</td><td class="v">' + esc(f.bootShown ?? f.boot) + '</td><td>' + badge(f.context) + '</td>' + (pi >= 0 ? '<td>' + (pending.has(f.name) ? '<span class="badge restart">waiting for a restart</span>' : '') + '</td>' : ''))).join('') + '</table>'
          : '<p class="note">Nothing: the server runs on the built-in values.</p>'
        html += '</div>'
        root.innerHTML = html
        const q = /** @type {HTMLInputElement | null} */ (root.querySelector('.q'))
        if (q) q.oninput = () => { const v = q.value.trim().toLowerCase(); for (const tr of root.querySelectorAll('tr[data-n]')) tr.classList.toggle('hide', !!v && !String(tr.getAttribute('data-n')).includes(v)) }
        const copy = (/** @type {Element} */ el) => ctx.copy(String(el.getAttribute('data-copy') || ''))
        root.onclick = (e) => { const el = /** @type {HTMLElement} */ (e.target).closest('[data-copy]'); if (el) copy(el) }
        root.onkeydown = (e) => { const t = /** @type {HTMLElement} */ (e.target); if (t.classList.contains('cp') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); copy(t) } }
      }
    }
  ]
}
