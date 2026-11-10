# Sample data provenance

## Official Calgary snapshot

File: `public/samples/official-permits.json`.

- Publisher: City of Calgary.
- Dataset: [Building Permits](https://data.calgary.ca/Business-and-Economic-Activity/Building-Permits/c2es-76ed).
- Retrieved: **2026-11-10T04:34:50.828436+00:00**.
- Licence: [Open Government Licence – City of Calgary](https://data.calgary.ca/stories/s/Open-Calgary-Terms-of-Use/u45n-7awa).
- Required attribution carried in each record: “Contains information licensed under the Open Government Licence – City of Calgary.”
- Source query: the exact URL is in the JSON file's `metadata.sourceQuery` and linked in the app's Coverage & sources view.
- Scope: at most 40 records issued October 1 through November 10, 2026, sorted by issue date descending and permit number ascending. The newest returned date is November 8, 2026.
- Fields requested: `permitnum`, `statuscurrent`, `issueddate`, `completeddate`, `permittype`, `workclass`, `estprojectcost`.
- Addresses, applicant names, owner names and contractor fields were not requested or included.

This is a **bounded, field-projected snapshot normalized directly from the official public API**. It is **not** the result of an executed Apify Actor run and does not validate the Actor's end-to-end behavior. It is not a complete daily/city total or a live feed. Revisions and source delays may exist.

Normalization maps `permitnum → permitNumber`, `statuscurrent → status`, `issueddate → issuedDate`, `completeddate → completedDate`, `permittype → permitType`, `workclass → workType`, and `estprojectcost → estimatedValueCad`; it adds city/province and source/licence attribution. The original retrieval query and scope remain in the JSON metadata. No city endorsement is implied.

## Fictional multi-city fixtures

Files: `public/samples/fictional-permits.json` and `.csv`. The same logical sample is constructed by `lib/sample.ts`.

These 38 records are **invented examples**, two per supported municipality. They exist only to demonstrate filters, missing values, revisions/fields, and source date semantics. Every permit number starts `DEMO-`, every row names synthetic demonstration data as its source, and every JSON envelope declares `synthetic: true`. These are not leads or real municipal records. Fictional fixtures are made available under CC0-1.0.

## Compatibility reference

- [Canada Building Permits Actor README](https://apify.com/loudtzu/canada-building-permits)
- [Published output schema](https://apify.com/loudtzu/canada-building-permits/output-schema)

Reviewed November 10, 2026. Coverage consists of the 19 municipalities named in the application and README. Optional business licences, planning, tenders and award feeds are outside this explorer's scope. Supported coverage is not a promise that a given imported file contains every city or every record.
