# Event creation confirmation and Home refresh — 30 October 2026

## Fix

Recurring creation wrote all event documents and then attempted a separate client write to `recurringEventSeries`, a collection without a client access rule. A failure in that later write reported the entire operation as failed, re-enabled creation, and displayed the error above the visible submit area. Each event already carries the series ID, rule, date range and occurrence index used by the existing series tools.

Creation now commits the recurring events in one atomic batch and does not attempt that extra metadata write. Rapid submissions are guarded synchronously. An uncertain batch result keeps the original payload and event references; the explicit Retry same save button reuses them instead of allocating another series. A successful save replaces the form with confirmation before invoking navigation. A failed navigation or feed refresh cannot reactivate creation. Single-event creation and the shared EventForm also guard repeated clicks and await the save operation.

The main app immediately navigates Home and displays a dismissible saved confirmation, independently of the feed request. Home refreshes on entry, every 60 seconds while visible and online, and on foreground/focus/reconnection. Requests coalesce while a refresh is pending; leaving Home removes its timer/listeners. Background refresh preserves currently displayed events and filters. Custom filters now re-evaluate refreshed rows rather than holding a stale array of event objects.

## Verification

- 325 root regression tests passed.
- 50 renderer/component tests passed, including the new save/refresh cases.
- The seven focused new tests were rerun after the final disabled-state refinement: all passed.
- Production web build and whitespace checks passed.
- Synthetic browser review: recurring form validation, then a successful four-event submission closed the creation form and navigated to the review harness's My Events destination. That harness uses mock writes; component tests verify the actual batch payload/reference and retry behaviour.
- No live test events, Firebase rules/functions changes, native builds, or deployment.

This does not remove any duplicates already created. Retry identity is retained within the open creation screen; after reloading or leaving an uncertain submission, check My Events before starting another series.
