# Contributing

Everything about writing an extension and sending it in is in
[extensions/README.md](extensions/README.md): the three kinds, the
directory layout, `manifest.json`, the README template, the review and
the tools that check a directory before a pull request.

The specifications an extension is written against are in `docs/`:

- [ACTIONSPEC.md](docs/ACTIONSPEC.md), the comment annotation format a
  query or command extension declares itself with;
- [GRIDJSSPEC.md](docs/GRIDJSSPEC.md), the `.plumesql.js` module a grid
  extension exports, and [plumesql-extension.d.ts](docs/plumesql-extension.d.ts),
  the same types as the declarations the app's editors check against;
- [CATALOG.md](docs/CATALOG.md), the repository layout, the manifest, the
  published index and what the validator enforces.

One extension per pull request, the validator green
(`node extensions/tools/catalog.mjs --check`), a discussion thread opened
under the Extensions category with the id as its title, and a README
a reader can use the extension from without opening the code. The
review reads the code against the README and checks that nothing
changes or deletes without asking first.
