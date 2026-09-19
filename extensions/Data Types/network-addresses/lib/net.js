// @ts-check
// inet, cidr, macaddr and macaddr8 values arrive in the grid as their text
// (192.168.1.5/24, 2001:db8::1, 08:00:2b:01:02:03). This module reads that
// text WITHOUT any query and answers what the address is: its family, the
// network it sits in, how many addresses that network holds, what kind of
// range it belongs to (private, loopback, documentation, ...), and for a
// MAC address the two flag bits of its first octet. Addresses are BigInt
// throughout, so an IPv6 /0 counts exactly.

/**
 * A parsed IP address with its prefix length: `bits` 32 or 128, `value`
 * the address as an unsigned integer, `prefix` the netmask length (the
 * full width when the text carried none), `explicit` whether it did.
 * @typedef {{ family: 4 | 6, bits: number, value: bigint, prefix: number, explicit: boolean }} Ip
 */

/**
 * parseIPv4 reads a dotted quad; null for anything else.
 * @param {string} s
 * @returns {bigint | null}
 */
export function parseIPv4(s) {
  const parts = s.split('.')
  if (parts.length !== 4) return null
  let v = 0n
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    v = (v << 8n) | BigInt(n)
  }
  return v
}

/**
 * parseIPv6 reads the eight groups, with at most one `::` and an optional
 * dotted quad as the last 32 bits; null for anything else.
 * @param {string} s
 * @returns {bigint | null}
 */
export function parseIPv6(s) {
  if (!/^[0-9a-fA-F:.]+$/.test(s)) return null
  let tail = /** @type {bigint | null} */ (null)
  let text = s
  const dot = s.lastIndexOf(':')
  if (s.includes('.')) {
    tail = parseIPv4(s.slice(dot + 1))
    if (tail === null) return null
    text = s.slice(0, dot + 1) + '0:0'
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  /** @param {string} h */
  const groups = (h) => (h === '' ? [] : h.split(':'))
  const head = groups(halves[0])
  const back = halves.length === 2 ? groups(halves[1]) : []
  const missing = 8 - head.length - back.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...back]
  let v = 0n
  for (const g of all) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
    v = (v << 16n) | BigInt(parseInt(g, 16))
  }
  if (tail !== null) v = (v & ~0xffffffffn) | tail
  return v
}

/**
 * parseIp reads an inet or cidr text: an address, optionally `/prefix`.
 * @param {string} text
 * @returns {Ip | null}
 */
export function parseIp(text) {
  const m = /^([^/\s]+)(?:\/(\d{1,3}))?$/.exec(text.trim())
  if (!m) return null
  const v4 = parseIPv4(m[1])
  const value = v4 ?? parseIPv6(m[1])
  if (value === null) return null
  const bits = v4 !== null ? 32 : 128
  const prefix = m[2] === undefined ? bits : Number(m[2])
  if (prefix > bits) return null
  return { family: v4 !== null ? 4 : 6, bits, value, prefix, explicit: m[2] !== undefined }
}

/** @param {number} bits @param {number} prefix */
function maskOf(bits, prefix) {
  const all = (1n << BigInt(bits)) - 1n
  return all ^ ((1n << BigInt(bits - prefix)) - 1n)
}

/**
 * The network facts: the network and broadcast addresses (the last address
 * of the network: an IPv6 network has no broadcast, the caller says so),
 * the mask, and the address count.
 * @param {Ip} ip
 */
export function network(ip) {
  const mask = maskOf(ip.bits, ip.prefix)
  const net = ip.value & mask
  const size = 1n << BigInt(ip.bits - ip.prefix)
  return { network: net, last: net + size - 1n, mask, size, hostBits: ip.bits - ip.prefix }
}

/**
 * How many HOSTS the network holds: an IPv4 network gives up its network and
 * broadcast addresses, except a /31 (point to point, RFC 3021) and a /32.
 * @param {Ip} ip
 * @returns {bigint}
 */
export function hostCount(ip) {
  const { size } = network(ip)
  if (ip.family === 4 && ip.prefix <= 30) return size - 2n
  return size
}

/**
 * A count said the way it reads best: exact up to 2^32 (with separators),
 * a power of two past it ("2^64").
 * @param {bigint} n
 */
export function countText(n) {
  if (n <= 1n << 32n) return n.toLocaleString('en-US')
  const pow = n.toString(2).length - 1
  if (n === 1n << BigInt(pow)) return `2^${pow}`
  // Hosts of a big IPv4 network are 2^k - 2: never past 2^32.
  return n.toLocaleString('en-US')
}

/** @param {bigint} v */
export function formatIPv4(v) {
  return [24n, 16n, 8n, 0n].map((s) => String((v >> s) & 255n)).join('.')
}

/**
 * The eight groups of an IPv6 address, as numbers.
 * @param {bigint} v
 */
function groups6(v) {
  return Array.from({ length: 8 }, (_, i) => Number((v >> BigInt(112 - i * 16)) & 0xffffn))
}

/**
 * The expanded IPv6 form: eight groups of four hex digits.
 * @param {bigint} v
 */
export function expandIPv6(v) {
  return groups6(v)
    .map((g) => g.toString(16).padStart(4, '0'))
    .join(':')
}

/**
 * The compressed IPv6 form of RFC 5952 (what PostgreSQL prints): lowercase,
 * leading zeros dropped, the LONGEST run of two or more zero groups (the
 * first on a tie) as `::`, and an IPv4-mapped or -compatible address with
 * its last 32 bits as a dotted quad.
 * @param {bigint} v
 */
export function compressIPv6(v) {
  const g = groups6(v)
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible: the seventh group
  // set, so ::2 stays ::2, as PostgreSQL prints them).
  const top = g.slice(0, 5).every((x) => x === 0)
  if (top && (g[5] === 0xffff || (g[5] === 0 && g[6] !== 0))) {
    return `::${g[5] === 0xffff ? 'ffff:' : ''}${formatIPv4(v & 0xffffffffn)}`
  }
  let best = -1
  let bestLen = 1
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) {
      i++
      continue
    }
    let j = i
    while (j < 8 && g[j] === 0) j++
    if (j - i > bestLen) {
      best = i
      bestLen = j - i
    }
    i = j
  }
  const hex = g.map((x) => x.toString(16))
  if (best < 0) return hex.join(':')
  return `${hex.slice(0, best).join(':')}::${hex.slice(best + bestLen).join(':')}`
}

/**
 * An address in its family's usual spelling.
 * @param {4 | 6} family
 * @param {bigint} v
 */
export function formatIp(family, v) {
  return family === 4 ? formatIPv4(v) : compressIPv6(v)
}

// The special ranges, most specific first, [family, network, prefix, class,
// what it is]. The classes are the ones a person asks about; the second
// word says which block, for the facts.
/** @type {[4 | 6, string, number, string, string][]} */
const SPECIAL = [
  [4, '0.0.0.0', 32, 'unspecified', 'the unspecified address'],
  [4, '255.255.255.255', 32, 'broadcast', 'the limited broadcast address'],
  [4, '0.0.0.0', 8, 'reserved', '"this network" (RFC 791)'],
  [4, '10.0.0.0', 8, 'private', 'private (RFC 1918)'],
  [4, '100.64.0.0', 10, 'shared', 'shared address space, carrier grade NAT (RFC 6598)'],
  [4, '127.0.0.0', 8, 'loopback', 'loopback (RFC 1122)'],
  [4, '169.254.0.0', 16, 'link-local', 'link-local (RFC 3927)'],
  [4, '172.16.0.0', 12, 'private', 'private (RFC 1918)'],
  [4, '192.0.2.0', 24, 'documentation', 'documentation, TEST-NET-1 (RFC 5737)'],
  [4, '192.168.0.0', 16, 'private', 'private (RFC 1918)'],
  [4, '198.18.0.0', 15, 'benchmarking', 'benchmarking (RFC 2544)'],
  [4, '198.51.100.0', 24, 'documentation', 'documentation, TEST-NET-2 (RFC 5737)'],
  [4, '203.0.113.0', 24, 'documentation', 'documentation, TEST-NET-3 (RFC 5737)'],
  [4, '224.0.0.0', 4, 'multicast', 'multicast (RFC 5771)'],
  [4, '240.0.0.0', 4, 'reserved', 'reserved for future use (RFC 1112)'],
  [6, '::', 128, 'unspecified', 'the unspecified address'],
  [6, '::1', 128, 'loopback', 'loopback (RFC 4291)'],
  [6, '64:ff9b::', 96, 'translation', 'IPv4/IPv6 translation (RFC 6052)'],
  [6, '2001:db8::', 32, 'documentation', 'documentation (RFC 3849)'],
  [6, 'fc00::', 7, 'private', 'unique local (RFC 4193)'],
  [6, 'fe80::', 10, 'link-local', 'link-local (RFC 4291)'],
  [6, 'ff00::', 8, 'multicast', 'multicast (RFC 4291)']
]
const SPECIAL_PARSED = SPECIAL.map(([f, a, p, cls, what]) => {
  const bits = f === 4 ? 32 : 128
  return { family: f, net: /** @type {bigint} */ (f === 4 ? parseIPv4(a) : parseIPv6(a)), mask: maskOf(bits, p), prefix: p, cls, what }
})

/**
 * The class of an address: the special block holding it (for a network,
 * the block holding the WHOLE network), or public. An IPv4-mapped IPv6
 * address is classed by its IPv4 address.
 * @param {Ip} ip
 * @returns {{ cls: string, what: string, mapped: boolean }}
 */
export function classify(ip) {
  const mappedV4 = ip.family === 6 && ip.value >> 32n === 0xffffn
  const fam = mappedV4 ? 4 : ip.family
  const v = mappedV4 ? ip.value & 0xffffffffn : ip.value
  const plen = mappedV4 ? Math.max(0, ip.prefix - 96) : ip.prefix
  for (const s of SPECIAL_PARSED) {
    if (s.family !== fam || plen < s.prefix) continue
    if ((v & s.mask) === s.net) return { cls: s.cls, what: s.what, mapped: mappedV4 }
  }
  // A network wider than a block that lies inside it spans several kinds.
  const bits = fam === 4 ? 32 : 128
  const own = maskOf(bits, plen)
  if (SPECIAL_PARSED.some((s) => s.family === fam && plen < s.prefix && (s.net & own) === (v & own)))
    return { cls: 'mixed', what: 'spans special ranges and public ones', mapped: mappedV4 }
  if (fam === 6 && !((v >> 125n) === 1n)) return { cls: 'reserved', what: 'outside the global unicast space (2000::/3)', mapped: false }
  return { cls: 'public', what: fam === 4 ? 'public' : 'global unicast', mapped: mappedV4 }
}

/**
 * The netmask as the family writes it (255.255.255.0; ffff:ffff:ffff:ffff::).
 * @param {Ip} ip
 */
export function netmaskText(ip) {
  return formatIp(ip.family, maskOf(ip.bits, ip.prefix))
}

/**
 * Everything the inspector says about an inet or cidr value.
 * @param {Ip} ip
 * @param {'inet' | 'cidr'} type
 */
export function describeIp(ip, type) {
  const n = network(ip)
  // An inet is classed by its ADDRESS (192.168.1.5/8 is still a private
  // host), a cidr by its whole network.
  const c = classify(type === 'inet' ? { ...ip, prefix: ip.bits } : ip)
  const hosts = hostCount(ip)
  const isHost = ip.prefix === ip.bits
  const fam = `IPv${ip.family}`
  const netText = `${formatIp(ip.family, n.network)}/${ip.prefix}`
  const lineParts = [isHost ? `${fam} host` : `${fam} /${ip.prefix}`]
  if (!isHost) lineParts.push(`${countText(n.size)} ${n.size === 1n ? 'address' : 'addresses'}`)
  lineParts.push(c.cls)
  // An inet with host bits set names one address INSIDE its network.
  const hostInNet = type === 'inet' && !isHost && ip.value !== n.network
  /** @type {string[]} */
  const facts = [isHost ? `${fam} address` : `${fam} network /${ip.prefix}`]
  facts.push(`address ${formatIp(ip.family, ip.value)}`)
  if (!isHost) {
    facts.push(`network ${netText}`)
    if (ip.family === 4) facts.push(`broadcast ${formatIPv4(n.last)}`)
    else facts.push(`last address ${compressIPv6(n.last)}`)
    facts.push(`netmask ${netmaskText(ip)}`)
    facts.push(`${countText(n.size)} addresses`)
    if (ip.family === 4) facts.push(`${countText(hosts)} ${hosts === 1n ? 'host' : 'hosts'}`)
  }
  facts.push(c.what + (c.mapped ? ', IPv4-mapped' : ''))
  return { line: lineParts.join(' · '), facts, cls: c.cls, hostInNet, network: netText, net: n }
}

/**
 * A MAC address: 6 bytes (macaddr) or 8 (macaddr8), in any of the
 * spellings PostgreSQL accepts (colons, hyphens, dots every four digits,
 * or none).
 * @param {string} text
 * @returns {number[] | null}
 */
export function parseMac(text) {
  const s = text.trim().toLowerCase()
  let hex = ''
  if (/^[0-9a-f]{2}([:-])[0-9a-f]{2}(?:\1[0-9a-f]{2})+$/.test(s)) hex = s.replace(/[:-]/g, '')
  else if (/^[0-9a-f]{4}(?:\.[0-9a-f]{4})+$/.test(s)) hex = s.replace(/\./g, '')
  else if (/^[0-9a-f]{6}[:-]?[0-9a-f]{6}(?:[0-9a-f]{4})?$/.test(s)) hex = s.replace(/[:-]/g, '')
  else if (/^[0-9a-f]{12}$|^[0-9a-f]{16}$/.test(s)) hex = s
  if (hex.length !== 12 && hex.length !== 16) return null
  return hex.match(/../g)?.map((b) => parseInt(b, 16)) ?? null
}

/** @param {number[]} b */
const macText = (b) => b.map((x) => x.toString(16).padStart(2, '0')).join(':')

/**
 * What a MAC address says about itself, with no vendor table: the width,
 * the two flag bits of the first octet (I/G: unicast or multicast, U/L:
 * universally or locally administered), the OUI when universal, and the
 * modified EUI-64 interface identifier IPv6 derives from it.
 * @param {number[]} b
 */
export function describeMac(b) {
  const eui = b.length === 6 ? 'EUI-48' : 'EUI-64'
  const broadcast = b.every((x) => x === 0xff)
  const multicast = (b[0] & 1) === 1
  const local = (b[0] & 2) === 2
  const cast = broadcast ? 'broadcast' : multicast ? 'multicast' : 'unicast'
  const admin = local ? 'locally administered' : 'universally administered'
  const line = [eui, cast, local ? 'local' : 'universal'].join(' · ')
  const facts = [`${eui} (${b.length * 8} bits)`, cast, admin]
  if (!local && !multicast) facts.push(`OUI ${macText(b.slice(0, 3))}`)
  // The 64-bit form: a 48-bit address gets ff:fe in the middle, as
  // macaddr8 casts it; one that already carries it came from a 48-bit one.
  const e64 = b.length === 6 ? [...b.slice(0, 3), 0xff, 0xfe, ...b.slice(3)] : b
  if (b.length === 8 && b[3] === 0xff && b[4] === 0xfe) facts.push(`from the 48-bit ${macText([...b.slice(0, 3), ...b.slice(5)])}`)
  if (!multicast) {
    const iid = [e64[0] ^ 2, ...e64.slice(1)]
    const words = [0, 2, 4, 6].map((i) => ((iid[i] << 8) | iid[i + 1]).toString(16))
    facts.push(`IPv6 interface id ${words.join(':')}`)
  }
  return { line, facts, eui64: macText(e64) }
}
