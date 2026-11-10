# Make lead-intake examples

These files illustrate the inquiry and replay cases described in the [pilot case study](../../case-studies/make-lead-intake.md). They are newly prepared fictional examples, not an export of the tested Make scenario or a claim that these exact field names were used in that scenario.

| Exercise | Expected behavior for the documented design |
| --- | --- |
| First accepted inquiry | One row is recorded and its reply remains a preview. |
| Replay the same event ID | A second row is prevented. |
| An inquiry with `privacy_cleared=false` | The privacy filter stops it. |
| A second distinct accepted event ID | A separate row is recorded. |

Before using these as executable inputs, map the field names to the actual scenario. The tested blueprint is not available in this repository; a sanitized export from the exact tested scenario is needed before it can be published as an importable template.

The original pilot remains inactive. These examples do not send messages or configure any account.
