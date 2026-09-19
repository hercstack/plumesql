# Network addresses

An address in the grid is its text, `10.20.0.7/16`, and what you want to know about it (which network, how big, is that a private range?) usually takes a subnet calculator. This extension reads `inet`, `cidr`, `macaddr` and `macaddr8` values where you meet them, with no query to the server.

## What it shows

For `inet` and `cidr`:

- **Hover** a cell: one line (`IPv4 /24 · 256 addresses · private`, `IPv6 host · link-local`) and a strip of the address's bits, the network part filled and the prefix written under it (32 bits in four octets, or the 128 bits of IPv6 in eight groups).
- **Peek** a cell (Space): the same line and strip above the value as stored.
- **Open Value in Tab**: the facts: the family, the address, the network, the broadcast address (IPv4) or the last address (IPv6), the netmask, how many addresses the network holds and, for IPv4, how many hosts (two fewer, except a /31 and a /32), and the kind of range with its RFC. The editor shows the address in another spelling: IPv4 in binary octet by octet, IPv6 expanded to eight groups of four digits. **Decode address** flips back to the text as stored (PostgreSQL's compressed form); **Copy** copies whichever is shown.
- **Edit a row** (F2): the field reads what is typed live (`IPv4 /24 · 256 addresses · private`), says `not an IP address` when it is not one, and for a `cidr` names the network when host bits are set right of the mask (`host bits set right of the /24 mask: the network is 192.168.1.0/24`), which the server would refuse.

The kinds of range: private (RFC 1918, and IPv6 unique local), loopback, link-local, multicast, documentation (the TEST-NETs and `2001:db8::/32`), shared (carrier grade NAT), benchmarking, translation (`64:ff9b::/96`), unspecified, broadcast, reserved, and public. An `inet` is classed by its address (`192.168.1.5/8` is a private host); a `cidr` by its whole network, and one that spans several kinds says `mixed`. An IPv4-mapped IPv6 address is classed by its IPv4 address. Counts are exact up to 2^32 and written as a power of two past it (`2^64 addresses`).

For `macaddr` and `macaddr8`: the width (EUI-48 or EUI-64), unicast, multicast or broadcast, universally or locally administered (the two flag bits of the first octet), the OUI of a universal address, the 48-bit address a `macaddr8` with `ff:fe` in the middle came from, and the IPv6 interface identifier (modified EUI-64) the address gives. There is no vendor table: nothing is looked up.

## Where it applies

Every column whose declared type is `inet`, `cidr`, `macaddr` or `macaddr8`, in every result, from the install on (a global scope you can change on its page). A text column holding an address is text and stays that way.

## Requirements

Nothing beyond PostgreSQL: the types are built in. Nothing runs on the server: the values are read from what the grid already holds.
