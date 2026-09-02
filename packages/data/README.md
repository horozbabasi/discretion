# @privacyshield/data

Generated data tables for [`@privacyshield/core`](https://www.npmjs.com/package/@privacyshield/core).

**You almost certainly do not want to install this directly.** It is a
dependency of `@privacyshield/core`, published separately only so that core can
pin it at an exact version. Install core.

## What is in it

| export | what it is |
| --- | --- |
| `CONFUSABLES` | Unicode confusable-character mappings, used by Stage 0 homoglyph folding |
| `TRIGGER_LEXICONS` | Per-language context trigger terms for Stage 3 scoring |
| `DOMAIN_LEXICONS` | Vocabulary used to profile a document's domain |
| `GAZETTEERS` | Name, organisation and place lists for Stage 2b |
| `SECRET_PROVIDERS` | API-key prefix table — the reason a new provider needs no code change |
| `SEVERITY_WEIGHTS`, `CATEGORY_OF`, `TYPE_FACTORS` | Exposure scoring inputs |
| `CALIBRATION_MODEL` | The fitted confidence calibration curves |

## These are generated, and their values are not stable

Every table here is produced by a generator, from a Unicode release, a corpus,
or an evaluation run. **A value can change in a patch release**: a confusables
entry, a gazetteer name, or a calibration curve refitted after a corpus
change.

The package version tracks the *type* surface, which follows
[VERSIONING.md](https://github.com/horozbabasi/privacyshield/blob/main/VERSIONING.md).
Do not build anything that depends on a specific numeric value in
`CALIBRATION_MODEL` or a specific entry in `CONFUSABLES` surviving an upgrade.

Regenerating requires network access (`npm run generate`). The generated
modules are committed so that building the project does not.

## Licence

MIT, except the Unicode-derived data, which is under the Unicode licence.
Attribution and terms are in `THIRD_PARTY_NOTICES.md` in this package.
