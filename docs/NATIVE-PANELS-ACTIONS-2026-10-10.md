# Native panel and event-action alignment — 10 October 2026

This pass follows NATIVE-BROWSE-REVIEW-2026-10-10.md. It updates the actual web components and the local read-only preview at http://localhost:5186/. No hosting, Firebase rules, backend deployment, database writes or native release was performed.

## Implemented

- Shared padded, rounded frames for horizontally scrolling filter and category strips. Mobile outer gutters are 16px. Category and action labels wrap inside their tiles.
- Business category icons retain the native catalogue. Quick-access filters now use matching icon tiles; unavailable public-data/account workflows remain disabled.
- A single Customised filters panel uses consistent styled dropdowns for event type, audience, organiser, host, suburb and time period. It stacks on narrow phones.
- Native-style compact event summary: poster/logo, date chip, calendar/live indicator, clock, location, organiser/type badges, favourite and expand controls.
- Expanded event actions include Share, Directions, Contact Host, Live/Watch, Reminder, Sync Calendar, Niaz Arrangement, Edit, Copy and Delete; series controls appear for series events. Buttons have icons, accessible labels and real disabled states.
- Availability follows guest/member status, ownership, city-scoped administration, connected callbacks and the read-only preview flag. Server rules remain authoritative. Missing user IDs can no longer accidentally match missing event-owner IDs.
- Calendar and favourite callbacks are consistent across Home, My Events, Favourites and Calendar where those existing workflows are available.
- Lighter labels, descriptions, header and desktop agenda typography. Desktop event cards retain the rounded corners used on mobile.

## Verification

- 68 Node tests passed, including availability checks for guest/member/owner/admin/read-only cases, missing-owner handling and rendered SVG/disabled controls.
- The separate two-test PWA rehearsal could not complete because the environment denied its ephemeral localhost fetches (EACCES). This is not a full PWA rehearsal pass.
- Actual read-only application build and synthetic visual-review build completed successfully. Existing module-format/dynamic-import warnings remain non-blocking.
- Browser inspection used the real public Businesses data and a separate offline synthetic Events fixture. No real write, message, consent, location or authentication action was performed during these checks.
- Events checked at 320, 390 and 1440px. Document widths were 315, 385 and 1435px respectively, with no page-level horizontal overflow. At 320px, strip frames ran from x=16 to x=299. Expanded action labels did not overflow their cells.
- Actual Businesses inspected at desktop and 320px, including an expanded listing. Logos, category icons, descriptions and contact/hour sections fit their panels.
- Styled Event type menu opened correctly; choosing Majlis reduced the synthetic list to its two Majlis cards. Guest and member/admin action states were inspected in the browser.
- git diff --check passed.

## Explicitly held or incomplete workflows

Contact Host, Reminder, Niaz Arrangement and series-management callbacks are not connected in this web preview. Their icons are visible and disabled. Read-only mode additionally disables existing data-changing actions, including favourites, edits, copy/delete and stream creation. This UI pass is not a claim of complete live backend workflow parity or production launch acceptance.

Real SMS validation still requires an authorised hosted preview as recorded in the earlier review. The production PWA remains untouched.

## Follow-up: whole words and event-type icons

- Category and quick-access labels now wrap at spaces only. Each complete word stays on one line, including hyphenated event-type names; tiles grow to fit their longest word while the strip scrolls within its padded frame.
- Both event-type filters and their matching logic now prefer the stored eventType over eventTypeDisplay/custom titles. Missing stored types still fall back to legacy display data. Custom remains a type rather than turning each custom title into a category.
- Test Event is excluded from filter options, per the user's explicit clarification. Records are not deleted or removed from the All feed.
- Relevant icons replace the generic calendar fallback: mosque for prayers, supplication hands for Dua/Tawassul, a book for Kumail, prayer beads for Prayers & Amal, cake for Birthday, rings for Marriage, and a tag for unmatched custom types.
- Ten focused browse tests passed and both preview builds passed. Browser checks at 1280px and 320px confirmed no word escaping its tile or page-level horizontal overflow. The synthetic Event types strip omitted Test Event while its record remained in All; selecting Dua-e-Tawassul returned the single matching fixture.
- Screenshots saved under the chat workspace output folder: business-whole-words.jpg and event-type-icons.jpg. No deployment or Firebase mutation occurred.
