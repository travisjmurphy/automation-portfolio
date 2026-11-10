# Verification notes

These notes distinguish automated logic checks, browser checks, and deployment confirmation. A passing build alone does not establish that every interaction or device has been tested.

## Local checks

Run these commands inside each `apps/<project>` directory:

```sh
npm ci
npm test
npm run build
```

The build includes a TypeScript check and produces the static application. The [CI workflow](../.github/workflows/ci.yml) runs the same commands separately for each project on Node.js 24.

| Project | What the tests cover | Release verification |
| --- | --- | --- |
| [Shopify Snapshot Compare](../apps/shopify-snapshot-compare/tests/compare.test.mjs) | Store isolation, variants, unknown currency/availability, missing and zero prices, snapshot coverage, malformed records, report escaping, and snapshot round trips. | 13 tests passed; standalone TypeScript/Vite build and hosted production build passed. |
| [Transcript Clip Planner](../apps/transcript-clip-planner/tests/transcript.test.mjs) | Subtitle parsing, millisecond timing, overlaps and gaps, reversed selections, project validation, round trips, and output escaping. | Clean install, 14 tests, standalone TypeScript/Vite build and hosted production build passed. |
| [Canadian Permit Explorer](../apps/canadian-permit-explorer/tests/permits.test.mjs) | Quoted CSV, invalid input, missing values, date meanings, mixed-source rows, revisions, filters, metadata, attribution, and output escaping. | Clean install, 15 tests, standalone TypeScript/Vite build and hosted production build passed. |

## Browser checks

The Shopify preview was checked for its sample counts, price filter, product/variant detail panel, missing-file state, and CSV/HTML downloads. The price filter returned the expected two products and the downloaded CSV contained two records.

The transcript planner was checked by selecting three cues, adding a clip, editing its title/hook/notes, reordering it, and exporting a Markdown brief. The downloaded brief retained the new title and notes. Reloading restored all three clips in the edited order. Pasting and importing a two-cue WebVTT transcript also passed.

The permit explorer was checked with the official 40-record Calgary sample. Filtering to commercial/multifamily permits returned 17 records; the downloaded CSV contained all 17 and retained attribution fields. The details panel displayed the source and licence. In the fictional dataset, filtering to Delta returned two records with completion dates and unreported values. Importing a quoted CSV field containing a comma and a missing value passed through the paste workflow.

The browser file-picker check stalled in the test environment, so file selection and drag-and-drop are not claimed as verified end to end. Parser tests and the transcript/permit paste workflows passed. These checks do not constitute an exhaustive device, accessibility, or large-file performance audit.

Screenshots in each app's `docs/` directory show the checked interface, not a design mockup.

## Published demos

All three production deployments succeeded on November 10, 2026, and their opening screens were checked in the browser:

- [Shopify Snapshot Compare](https://travis-shopify-snapshot-compare.divineburl2.chatgpt.site)
- [Transcript Clip Planner](https://travis-transcript-clip-planner.divineburl2.chatgpt.site)
- [Canadian Permit Explorer](https://travis-canadian-permit-explorer.divineburl2.chatgpt.site)

The GitHub Actions configuration is included for subsequent pushes and pull requests. Local checks above are recorded separately from remote CI results.

## Data and scope

- Shopify and transcript examples are fictional demonstration material.
- The Calgary permit sample came directly from the city's official public API. It is a 40-record bounded snapshot with a retrieval timestamp, query, source, and licence in its metadata. It is not evidence of a paid Apify Actor execution or a complete city dataset.
- The Make pilot's historical checks are described in its [case study](../case-studies/make-lead-intake.md). The new example input files are illustrative. No tested Make blueprint is included in this release.
- The app tests do not establish the operational reliability of external Actors or a production lead-intake workflow.
