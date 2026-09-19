## What this adds or changes

<!-- The extension's id and kind, and one or two sentences: what question it answers or what it does. For a change to an existing extension, what changed and why. -->

## Checklist

- [ ] One extension in this pull request, under `extensions/<Category>/<id>/`, the main file named after the id
- [ ] `manifest.json` complete, `version` bumped if any installed file changed
- [ ] `README.md` follows the template in `extensions/README.md`, with a screenshot or clip under `media/`
- [ ] A discussion thread exists under the Extensions category, titled with the id, and its number is in the manifest
- [ ] `node extensions/tools/catalog.mjs --check` passes locally
- [ ] Nothing changes or deletes data without a `@confirm`; every reference is schema-qualified; the password never leaves `@env`
- [ ] Every external library the code loads is listed in `externals`, every referenced extension in `dependencies`
