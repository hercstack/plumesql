// @ts-check
// @description A schema change that cannot hold the database up: a lock wait with an end before ALTER TABLE, CREATE INDEX and the rest, and the memory an index build needs

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors). A schema change
// takes a lock on its table, and with lock_timeout at 0 (the default) it
// waits for that lock as long as it takes: behind one long query, and with
// every query that comes after it queued behind IT, so the table stops
// answering until the change gets through. The lightbulb on such a
// statement writes a lock_timeout above it, so the change gives up and can
// be run again instead. An index build also offers more maintenance_work_mem
// when the session's is small.
//
// It reads the statement and the session's own lock_timeout and
// maintenance_work_mem (ctx.settings, PlumeSQL 0.29.0 and later). Nothing
// is asked of the server.

// The statements that take a lock their table's other queries wait behind.
const LOCKING = /^\s*(?:alter\s+(?:table|index|materialized\s+view)|create\s+(?:unique\s+)?index(?!\s+concurrently)|drop\s+(?:table|index(?!\s+concurrently)|materialized\s+view)|truncate|reindex(?!\s+[^;]*\bconcurrently\b)|vacuum\s+(?:\([^)]*\bfull\b[^)]*\)|full)|cluster|refresh\s+materialized\s+view(?!\s+concurrently)|lock\s+table)\b/i
// And those an index build or a vacuum makes go faster with more memory.
const BUILDS = /^\s*(?:create\s+(?:unique\s+)?index|reindex|vacuum|cluster|alter\s+table\s+[^;]*\badd\s+(?:constraint\s+\S+\s+)?foreign\s+key)\b/i

/**
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function lockTimeout(statement, ctx) {
  if (typeof ctx.settings !== 'function' || !LOCKING.test(statement.text)) return []
  const t = ctx.settings(['lock_timeout']).lock_timeout
  if (!t || Number(t.value) !== 0) return []
  const wait = String(ctx.options.wait || '5s')
  return [
    {
      title: `Wait at most ${wait} for the lock: set lock_timeout above`,
      edits: [{ from: 0, to: 0, text: `set lock_timeout = '${wait}';\n` }]
    }
  ]
}

/**
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function buildMemory(statement, ctx) {
  if (typeof ctx.settings !== 'function' || !BUILDS.test(statement.text)) return []
  const m = ctx.settings(['maintenance_work_mem']).maintenance_work_mem
  const had = m?.bytes
  if (!had || had >= 256 * 1048576) return []
  // Four times what it has, up to 2GB: more than a session should take
  // without knowing the server's memory is the user's to write.
  const b = Math.min(2048 * 1048576, had * 4)
  const size = b >= 1073741824 ? b / 1073741824 + 'GB' : Math.round(b / 1048576) + 'MB'
  return [
    {
      title: `Build with more memory: set maintenance_work_mem to ${size} above (it is ${m?.shown})`,
      edits: [{ from: 0, to: 0, text: `set maintenance_work_mem = '${size}';\n` }]
    }
  ]
}

/** @type {PlumeSQLExtension} */
export default {
  options: [
    { key: 'wait', label: 'Longest lock wait', kind: 'text', default: '5s', description: 'What lock_timeout the lightbulb writes: long enough for a quick change to get its lock, short enough that the table never queues behind it for long.', refactor: 'lock-timeout' }
  ],
  refactors: [
    {
      id: 'lock-timeout',
      label: 'A lock wait with an end',
      description: 'ALTER TABLE, CREATE INDEX, DROP, TRUNCATE, REINDEX and the like take a lock their table waits behind. With lock_timeout at 0 (the default) the change waits for it as long as it takes, and every query after it queues behind the change. The lightbulb writes a lock_timeout above it. Reads the session’s lock_timeout, PlumeSQL 0.29.0 and later.',
      example: "set lock_timeout = '5s';",
      refactor: lockTimeout
    },
    {
      id: 'build-memory',
      label: 'More memory for an index build',
      description: 'CREATE INDEX, REINDEX, VACUUM and a foreign key check sort and gather in maintenance_work_mem (64MB by default). With less than 256MB, the lightbulb writes four times as much above the statement (up to 2GB). Reads the session’s maintenance_work_mem, PlumeSQL 0.29.0 and later.',
      example: "set maintenance_work_mem = '256MB';",
      refactor: buildMemory
    }
  ]
}
