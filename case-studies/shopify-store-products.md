# Shopify Store Products

**Status:** published Apify Actor; documentation showcase.  
**Development:** built with Grokbot assistance as part of my Apify store.

[Open the Actor on Apify](https://apify.com/loudtzu/shopify-store-products)

## What it does

Reads public Shopify product feeds and returns one record per product, with prices, variants, availability, and product details. It accepts store or collection URLs.

Potential uses include catalogue analysis, price comparisons, and checking which variants are available.

## Try it

1. Open the linked Apify listing and check its current inputs and pricing.
2. Use a storefront you are permitted to query and start with a small product limit.
3. Review results and errors before using the export in another workflow.

## Important limits

- Access depends on the storefront making its product feed public.
- The published documentation describes robots.txt checks and skipping restricted stores. It does not bypass logins or paywalls.
- Prices use the store's currency. A missing currency value should not be treated as a currency conversion.
- Review the storefront's terms and your intended use of the data.

## Evidence and repository scope

This page documents the published Actor. The Actor's commercial source code is not included. The separate [Shopify Snapshot Compare](../apps/shopify-snapshot-compare) application contains public comparison logic, fictional example exports, and CSV/HTML reporting.

The linked listing is the reference for current behaviour. Listing documentation reviewed November 10, 2026. This case study is not an independent execution or code audit of the Actor.
