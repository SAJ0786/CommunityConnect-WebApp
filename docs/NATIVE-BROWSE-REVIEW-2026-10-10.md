# Native browsing UI review — 10 October 2026

The actual application read-only preview at http://localhost:5186/ has been rebuilt for this request. Refresh the existing tab; the user's existing server serves the new files. No Firebase deploy, hosting change, rules change, database mutation or native release was performed.

## Changes

- Businesses: compact logo/name/category/suburb cards. Click or keyboard-activate the summary to expand description, contacts, services, hours and the dedicated detail link. Missing/broken logos fall back to category artwork.
- Native Business Directory catalogue and labels used for the horizontal category rail and service selector. Quick access contains All, Open now, Near me, Favourites and Recently added. Open now uses supplied public schedules in the business city's timezone, including split and overnight hours; unknown hours remain unknown.
- Near me, Favourites and Recently added for Businesses are explicitly disabled. The current safe public projection lacks coordinates and publication dates; account favourite integration remains on hold. No private fields were added to public documents or the adapter.
- Events: Upcoming, Near Me, Today, Tomorrow, This Week and This Month strip, plus All/Prayers/Majlis/Milad and other supplied category tiles on mobile and desktop. Date boundaries match the native calendar presets. Near Me requests browser location only on click, sorts available event coordinates nearest first within the chosen city, and leaves records without coordinates last. Location is kept in component memory only. Denied/missing location is explained inline.
- Events retain image-led compact cards and inline expansion; an explicit keyboard-accessible expand/collapse control is now provided. Selected browse filters also apply to map input.
- Events naming applied to experience selection, navigation, the Events page heading and the auth experience default. Product branding remains Community Connect Australia.
- City picker retains its outlined closed appearance and uses a styled, viewport-positioned listbox: selected checkmark, arrow/Home/End/letter navigation, Enter/Space selection, Escape/outside dismissal and a scrollable menu. Shared by Events, Businesses and Promotions.

## Real-number sign-in

The user reported: "This app address could not be verified. Please open communityevents.siza.info and try again." This is the existing auth/invalid-app-credential mapping. Firebase documents that localhost is not supported as a hosted domain for phone authentication: https://firebase.google.com/docs/auth/web/phone-auth . A successful configured test number does not verify real SMS delivery.

The local-preview note and this error now explain using configured test numbers locally and an authorised hosted preview for real SMS testing. The outdated domain redirect was removed. No verification bypass, provider change, domain change or SMS was attempted. Actual SMS sign-in still needs validation on a separate authorised hosted preview before launch.

## Validation and limits

- All 67 Node tests passed, including six new filter, hours, coordinate, error-message and actual JSX render checks.
- Actual read-only preview build passed with all Firebase mutation guards retained.
- Standard build entry encountered the known Windows realpath/EPERM issue; the complete production compilation then passed using Vite preserveSymlinks, as the preview already does. This is compilation evidence, not a configured release candidate.
- git diff --check passed (existing line-ending warnings only).
- Public browser regression script updated for compact expansion and the city listbox, including keyboard interaction. It has not been run on this revision: browser startup remains unavailable in the agent's Windows environment. No screenshot or browser interaction pass is claimed.
- Earlier preview fingerprints are superseded by these UI edits. These checks do not constitute production launch acceptance or native app compatibility sign-off.

Manual review: refresh the existing preview tab, expand/collapse a Business card, scroll category strips, choose a city with mouse and keyboard, then inspect Events at phone and desktop widths. Check Today/This Week/category selections and location permission denial. Continue using a configured test account on localhost.
