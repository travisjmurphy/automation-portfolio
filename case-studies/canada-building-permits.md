# Canada Building Permits

**Status:** published Apify Actor; documentation showcase.  
**Development:** built with Grokbot assistance as part of my Apify store.

[Open the Actor on Apify](https://apify.com/loudtzu/canada-building-permits)

## What it does

Brings together building permits from official open-data sources in 19 Canadian municipalities. Inputs include city or province selection, dates, project value, and text filters. Results include source attribution and licence information.

The current listing covers Halifax; Calgary, Edmonton, Red Deer, Lethbridge and Strathcona County; Winnipeg; Toronto, Mississauga, Oakville, Burlington, Kitchener, Waterloo and Kingston; Vancouver, Victoria, Surrey, Delta and Maple Ridge.

Potential uses include construction-market research, renovation trends, and housing-activity analysis.

## Try it

1. Open the linked Apify listing and review its current coverage, input fields, and pricing.
2. Choose your cities and filters. Start with a small result limit.
3. Review the output and any city-specific warnings before relying on the data.

## Important limits

- Montreal and municipalities not explicitly listed are not covered.
- Fields and filter support vary by municipality. Delta's date filter uses completion dates; Red Deer uses the source's permit date.
- Project addresses are now optional (`includeAddresses`, default true). Availability depends on the source. The listing describes conservative inclusion of clearly business-labelled contractor companies, while excluding applicant/owner names, emails, and phone numbers.
- Optional beta feeds add Calgary/Edmonton planning and business-licence records, federal contract awards, and CanadaBuys open tenders. Their coverage and event meanings differ. They do not form a verified company/contact list.

## Evidence and repository scope

This page documents the published Actor. The Actor's commercial source code is not included. A separate [Canadian Permit Explorer](../apps/canadian-permit-explorer) provides public application code and sample data for exploring exports.

The linked listing is the reference for current behaviour. Listing documentation reviewed November 10, 2026. This case study is not an independent execution or code audit of the Actor.
