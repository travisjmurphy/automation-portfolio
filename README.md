# Automation Portfolio

AI-assisted projects and practical workflow experiments by **Travis Murphy**.

This portfolio shows what each project does, its current status, and the limits of the available evidence. It includes documentation, not proprietary Actor source code or a production deployment package.

## Projects

### 1. Make lead-intake pilot

**Status: tested demonstration using fictional data; inactive.**

An authenticated webhook receives an inquiry, checks for an existing event, reserves it, writes a Google Sheets row with a reply preview marked `NOT_SENT`, and marks the event complete.

Two fictional inquiries were recorded once each. A duplicate replay was blocked, and an inquiry with `privacy_cleared=false` stopped at the filter. No email was sent.

[Read the workflow and test results](case-studies/make-lead-intake.md)

### 2. Canada Building Permits

**Status: published Apify Actor; documentation showcase.**

Combines official permit data from 14 Canadian cities for construction and housing-activity research.

[Read the project overview](case-studies/canada-building-permits.md) · [View on Apify](https://apify.com/loudtzu/canada-building-permits)

### 3. Shopify Store Products

**Status: published Apify Actor; documentation showcase.**

Exports product information from public Shopify storefront feeds for catalogue analysis and price or availability comparisons.

[Read the project overview](case-studies/shopify-store-products.md) · [View on Apify](https://apify.com/loudtzu/shopify-store-products)

## How I work

I use AI tools to help build, test, and document projects. My Apify work used Grokbot; other projects have used Codex, ChatGPT, and dot. The Make pilot was built and tested with AI assistance.

Each case study distinguishes observed results from intended uses. No client names, real leads, credentials, private account links, or unreviewed source exports are included.

## Skills in development

- Make, APIs, webhooks, and Google Sheets through small workflow pilots.
- n8n and Zapier as planned learning areas.
- Input validation, duplicate handling, human review, and clear operational documentation.

These examples do not claim client revenue, time savings, or production reliability.
