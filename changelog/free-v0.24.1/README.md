# PlumeSQL 0.24.1

A signed and notarized Mac app, and an update check that always knows
the newest release.

## Highlights

- **macOS:** PlumeSQL is signed and notarized by Apple. It opens on the
  first double click.
- **Update check:** System shows a new release the moment it is out.

## What changed

### macOS opens PlumeSQL on the first double click

The Mac app now carries a Developer ID signature and Apple's
notarization. Open the DMG, drag PlumeSQL to Applications and start it:
no right click and Open, no warning about an unidentified developer.
If you cleared the quarantine flag by hand for an earlier release, you
no longer need to.

### The update check reads the releases themselves

**System > System information** asks GitHub for the latest release,
where every PlumeSQL release is published, and only falls back to
plumesql.com when GitHub does not answer. A new release shows up there
as soon as it is out.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
