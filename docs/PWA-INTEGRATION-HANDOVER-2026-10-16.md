# PWA candidate integration handover - 16 October 2026

Canonical repository: SAJ0786/CommunityConnect-WebApp, main. Native source is read-only reference in the sibling sdk51-package-backup checkout. Do not deploy Firebase or enable candidate gates as part of this work.

## Dynamic cities checkpoint

- Adopted native schemaVersion 1, bundled coordinates/timezones, stable IDs, disabled-ID retention, alias/postcode validation and last-known-good caching. Unknown cities are not rewritten to Sydney.
- Catalogue refresh is gated by VITE_DYNAMIC_CITY_CATALOGUE_ENABLED=false. Root refresh updates Events and public/member Business screens; city options, public business projection, opening hours, prayer locations and future-series selection use the catalogue. Hijri Today follows the selected city timezone. Rest of Australia remains an aggregate with an explicitly labelled Sydney prayer reference.
- Super Admin Add City is under Admin Dashboard > Tools and additionally gated by VITE_CITY_MANAGEMENT_ENABLED=false. Search, server preview, latitude/longitude/timezone review, code entry and confirmation use searchCatalogueCities, previewCatalogueCity and addCatalogueCity. Missing/invalid coordinates block Add. The server receives the preview fingerprint, not client-authoritative coordinates.
- No backend, rules, App Check, release configuration or production catalogue was changed. Required callable deployment/App Check acceptance and real-device/live acceptance remain release follow-ups.
- The legacy emulator archive fixtures remain pinned to their recorded deployed-source hashes. New native candidate code is checked separately by the web series-helper parity test; it is not substituted into those frozen fixtures.

## Registration

Registration integration is in progress. VITE_EVENT_REGISTRATION_ENABLED remains false. Isolated prototype remains separate from the production route. Do not infer a working production feature from prototype availability.
