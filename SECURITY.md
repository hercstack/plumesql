# Security

Extensions in this repository run where they are installed: a query
extension runs SQL on the user's database, a command extension runs a
program on the user's machine, a grid extension runs JavaScript over a
result in the app. Every one is reviewed before it is merged, and the
app fetches only what a reviewed commit contains, verified by hash. Even
so, a mistake or a malicious change can get through.

If you find an extension that does something its README does not say,
that writes or deletes without asking, that sends data anywhere it does
not declare, or that leaks a password into an argument, a file or a log,
please report it privately rather than in a public issue: use GitHub's
private vulnerability reporting on this repository (the Security tab,
"Report a vulnerability"). Say which extension and version, what it
does, and how you noticed.

A confirmed report is fixed in the extension or the extension is
retired (its id can never come back), the catalog is republished, and
installed copies update on the next check. The reporter is credited in
the extension's discussion thread unless they ask not to be.

A problem in PlumeSQL itself rather than in an extension goes the same
way: the private report reaches the same people.
