from pathlib import Path

from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)


BASE = Path("output/docs")
DOCX = BASE / "Community_Events_Australia_Project_Report_2026-V91.docx"
PDF = BASE / "Community_Events_Roadmap_A3_Landscape_Updated.pdf"


def set_para_text(paragraph, text):
    style = paragraph.style
    alignment = paragraph.alignment
    for run in list(paragraph.runs):
        run.text = ""
    run = paragraph.add_run(text)
    paragraph.style = style
    paragraph.alignment = alignment
    return paragraph


def replace_paragraphs(doc, replacements):
    for p in doc.paragraphs:
        original = p.text.strip()
        if original in replacements:
            set_para_text(p, replacements[original])


def replace_prefix(doc, prefix, text):
    for p in doc.paragraphs:
        if p.text.strip().startswith(prefix):
            set_para_text(p, text)
            return True
    return False


def replace_heading_block(doc, heading_text, new_items):
    start = None
    for i, p in enumerate(doc.paragraphs):
        if p.text.strip() == heading_text:
            start = i
            break
    if start is None:
        return

    # Replace following non-empty paragraphs until the next numbered section.
    idx = start + 1
    slots = []
    while idx < len(doc.paragraphs):
        text = doc.paragraphs[idx].text.strip()
        if text and text[:2].isdigit() and "." in text[:4]:
            break
        if text:
            slots.append(doc.paragraphs[idx])
        idx += 1

    for p, text in zip(slots, new_items):
        set_para_text(p, text)
    for p in slots[len(new_items):]:
        set_para_text(p, "")


def update_table_row(table, key, value):
    for row in table.rows:
        if row.cells[0].text.strip() == key:
            row.cells[1].text = value
            return True
    return False


def update_docx():
    doc = Document(DOCX)

    replacements = {
        "Version at Report": "Version at Report",
        "v90": "v91",
        "~11,000 lines (frontend) + ~2,400 lines (Cloud Functions)": "~11,000 lines (frontend) + streamlined Cloud Functions + native streaming relay",
        "Firebase Authentication handles all identity management. Two providers: Google OAuth (one-tap sign-in) and Phone number (OTP via SMS). Four roles: user, admin, superAdmin, guest. Guest mode allows browsing without login.":
            "Firebase Authentication now uses phone OTP as the only registered-user sign-in method. Google and Microsoft sign-in were removed, with an account migration flow that links existing email-based profiles to the new verified phone account. Four roles remain: user, admin, superAdmin, and guest. Guest mode uses anonymous authentication for safe browsing without access to restricted features.",
        "Maintain complete privacy controls — private events visible only to registered users, poster images hidden from guests.":
            "Maintain complete privacy controls — guests can browse event cards, but private-event full addresses, host phone numbers, uploaded posters, directions, and raw Firestore event documents are protected.",
        "src/services/ — 13 service modules: eventService, hijriService, imageService, organisationsService, hmsService, streamService, userService, youtubeService, etc.":
            "src/services/ — service modules for events, Hijri conversion, images, organisations, native streaming, notifications, settings, users, and YouTube integration. Obsolete 100ms/HMS and Daily streaming services have been removed.",
        "The backend is a single Firebase Cloud Functions file (functions/index.js, ~2,400 lines) exporting approximately 38 callable and scheduled functions. All functions use the v2 API deployed to australia-southeast1 for data residency and latency.":
            "The backend is a single Firebase Cloud Functions file (functions/index.js) exporting callable, scheduled, HTTP, and trigger functions. All active functions use the v2 API deployed to australia-southeast1 for data residency and latency. Obsolete 100ms/HMS functions have been removed.",
        "Event management — onEventCreated (auto-creates 100ms room), recalculateHijriEvents, transferEventOwnership":
            "Event management — onEventCreated notifications, recalculateHijriEvents, transferEventOwnership, safe public event listing for guests",
        "Streaming — startYouTubeStream, stopYouTubeStream, startHLSStream, stopHLSStream, hmsWebhook":
            "Streaming — nativeStreamStart, nativeStreamCheckHealth, nativeStreamEndEvent, cleanupStaleLiveEvents, Cloud Run relay health/session handling",
        "Events are stored as Firestore documents with a rich schema supporting single-day events, recurring series events, poster images, Hijri dates, speakers/reciters, audience types, and privacy controls.":
            "Events are stored as Firestore documents with a rich schema supporting single-day events, consecutive-day series events, poster images, Hijri dates, speakers/reciters, audience types, live-watch metadata, and privacy controls.",
        "Private events restrict poster image to logged-in users — guests always see the organisation fallback logo.":
            "Private events restrict full address, directions, host phone number, and poster image to registered users. Guests see suburb-level location and organisation fallback imagery only.",
        "The Hijri calendar uses community-set monthly overrides as anchors. Each override specifies the Gregorian date of the 1st of a Hijri month. Un-anchored months cascade 30 days from the most recent prior override.":
            "The Hijri calendar uses community-set monthly overrides as anchors. Each override stores the Gregorian date of the 1st of a Hijri month, preserving correction history so later monthly adjustments do not drift into impossible dates.",
        "On override save, recalculateHijriEvents Cloud Function recalculates all Hijri-entered events.":
            "On override save, recalculateHijriEvents recalculates Hijri-entered events while preserving their Hijri anchor. Gregorian-entered events keep their Gregorian anchor and receive recalculated displayed Hijri dates.",
        "Events entered as Hijri store hijriDay/Month/Year for floating Gregorian recalculation.":
            "Events entered as Hijri store hijriDay, hijriMonth, hijriYear, and enteredAsHijri for floating Gregorian recalculation after calendar correction.",
        "Client hijriService.js and server functions/index.js implement identical conversion algorithms.":
            "Client hijriService.js and server functions/index.js use the same override-anchor model and 30-day month cascade from the latest valid correction.",
        "Admin Repair tool for fixing series date mismatches using array index as offset.":
            "Admin repair tooling supports correction of Hijri-entered events and series records after monthly calendar adjustments.",
        "Live streaming uses a multi-layer architecture: 100ms.live (WebRTC), YouTube OAuth2 (broadcast creation), and RTMP beaming (YouTube ingest).":
            "Live streaming now uses the native browser streaming path: getUserMedia and MediaRecorder in the PWA, a WebSocket connection to the Cloud Run native-stream-relay, FFmpeg normalization, and YouTube RTMPS ingest.",
        "100ms.live Integration":
            "Native Relay Integration",
        "Each event has a dedicated 100ms room (liveRoomId) auto-created by onEventCreated. The broadcaster joins via an iframe using a JWT generated client-side with HMAC-SHA256 via the Web Crypto API.":
            "The host opens a camera pre-check frame, selects camera/microphone and portrait or landscape mode, then starts streaming. The browser sends media chunks to the native relay; no 100ms rooms, iframe meeting URLs, or client-side streaming provider tokens are used.",
        "YouTube Broadcasting":
            "YouTube Broadcasting",
        "When Go Live is tapped, startYouTubeStream Cloud Function: (1) refreshes OAuth token; (2) creates a YouTube LiveBroadcast with the event title; (3) creates a LiveStream resource; (4) binds them; (5) starts RTMP beam from 100ms; (6) stores liveWatchUrl on the event.":
            "When Go Live is tapped, nativeStreamStart refreshes the YouTube OAuth token, creates and binds the YouTube LiveBroadcast/LiveStream resources, creates a nativeStreamSessions document, and returns the relay WebSocket URL plus the YouTube watch URL.",
        "Stream Persistence & iOS Limitation":
            "Stream Lifecycle, Orientation, and Host Controls",
        "iOS Safari suspends camera/mic in invisible iframes. Off-screen CSS positioning (left: -99999px) keeps the iframe in the render tree while minimised. A prominent warning banner informs hosts to keep the screen open while live, as this is an iOS platform limitation.":
            "The host frame remains open after ending and shows the Stream Ended confirmation. During streaming, hosts receive an on-screen orientation warning if the phone is rotated away from the selected start orientation. The relay normalizes output to 16:9 YouTube ingest, improves audio quality, and preserves portrait content with side bars where appropriate.",
        "cleanupStaleLiveEvents runs every 10 minutes. hmsWebhook handles real-time cleanup on beam.stopped, session.close, and peer.leave events.":
            "cleanupStaleLiveEvents runs as a scheduled safety net. nativeStreamEndEvent clears event live state immediately when the host ends the stream, marks the session stopped, and attempts to complete the YouTube broadcast.",
        "AISearch uses the Anthropic Claude API for natural language event search. A Cloud Function passes the user query and all active events to Claude, which returns matching event IDs. The home page search bar provides smart keyword search (tokenised, stop-word filtered).":
            "AISearch uses the Anthropic Claude API for natural language event search. Guests receive the same privacy masking as event cards: private-event full address and host phone are omitted from the AI prompt and results.",
        "Events: public read (status == active, hidden != true). Admin write requires role check. Users: owner or admin read only. Organisations: public read, admin write.":
            "Events: registered users can read full event documents. Guests no longer read raw event documents directly; they use getPublicEvents, which returns a sanitized field set. Users: owner or admin read only. Organisations: public read, admin write.",
        "All sensitive functions use onCall with request.auth checks. Admin operations verify the caller's Firestore role. SuperAdmin protection prevents last active super admin from deleting their account.":
            "All sensitive functions use onCall with request.auth checks. Admin operations verify the caller's Firestore role. SuperAdmin protection prevents last active super admin deletion. Native stream session documents are server/relay controlled and denied to client reads/writes by Firestore rules.",
        "6.5 100ms JWT Generation":
            "6.5 Obsolete Provider Cleanup",
        "100ms room tokens generated client-side using HMAC-SHA256 via the Web Crypto API. App secret stored in Firebase Remote Config / environment secrets, not the client bundle.":
            "The obsolete 100ms/HMS and Daily streaming code paths, admin backfill action, old callable functions, and hardcoded provider credentials were removed. Active streaming now uses only the native relay and YouTube API.",
        "The technical architecture is deliberately lean — serverless Firebase backend, lightweight React frontend, no third-party state management or UI framework — making it fast to deploy, easy to understand, and cheap to operate. The most complex subsystems (Hijri date anchoring, image upload, live streaming, OAuth, reminders) are all isolated into service modules and callable functions.":
            "The technical architecture is deliberately lean — serverless Firebase backend, lightweight React frontend, no third-party state management or UI framework — making it fast to deploy, easy to understand, and cheap to operate. The most complex subsystems (Hijri date anchoring, phone-account migration, guest privacy, image upload, native streaming, OAuth, reminders) are isolated into service modules and callable functions.",
        "The application is live in production at communityevents.siza.info at version 90, actively used by the community, and represents a strong foundation for continued development.":
            "The application is live in production at communityevents.siza.info at version 91, actively used by the community, and represents a strong foundation for continued development.",
    }
    replace_paragraphs(doc, replacements)
    replace_prefix(doc, "At the time of this report the application is at version 90",
                   "At the time of this report the application is at version 91, representing over 90 iterative releases spanning initial development through a complete v2 GUI redesign, dynamic organisation management, phone-only login migration, guest privacy hardening, corrected Hijri override storage, and native YouTube live streaming.")
    replace_prefix(doc, "A complete visual redesign was undertaken across versions 67–90",
                   "A complete visual redesign and platform hardening cycle was undertaken across versions 67–91, transforming the original interface into a polished, image-led community app with stronger privacy, login, calendar, and streaming architecture.")
    replace_prefix(doc, "Google Play Store closed testing",
                   "Google Play Store closed testing — recruit 12 community testers for 14-day opt-in period to satisfy personal developer account requirement.")
    replace_prefix(doc, "100ms audio quality",
                   "Streaming observability — continue monitoring native relay logs, YouTube transition health, mobile audio quality, and host orientation prompts during live community events.")
    replace_prefix(doc, "Stale live cleanup speed",
                   "Guest privacy verification — periodically test event cards, AI search, share messages, calendar views, and Firestore rules to confirm guests only receive sanitized event data.")

    # Remove stale future-roadmap lines that are now complete/obsolete.
    replace_prefix(doc, "Event poster in reminder emails", "Event poster in reminder emails — include event poster image inline in daily HTML reminder emails.")

    # Update tables.
    t0, t1, t2, t3, t4, t5, t6 = doc.tables
    update_table_row(t0, "Version at Report", "v91")
    update_table_row(t0, "Total Codebase", "~11,000 lines frontend + Cloud Functions + native streaming relay")

    update_table_row(t1, "Auth", "Firebase Authentication — Phone OTP for registered users; anonymous guest mode; email-based profile migration for former Google/Microsoft users")
    update_table_row(t1, "Streaming", "Native browser stream → Cloud Run WebSocket relay → FFmpeg → YouTube RTMPS")
    update_table_row(t1, "Broadcasting", "YouTube Data API v3 + OAuth2 — auto-create broadcasts, bind streams, transition live/complete")

    update_table_row(t2, "events", "eventDate, eventType, hostName, audienceType, organiserType, isLive, liveWatchUrl, imageUrl, imagePath, hijriDate, hijriDay/Month/Year, enteredAsHijri, isSeries, hidden, status, createdByUserId")
    update_table_row(t2, "settings", "hijriSettings (monthly overrides[] including stored correction history)")

    update_table_row(t3, "Functions", "firebase deploy --only functions — Cloud Functions v2 in australia-southeast1")
    update_table_row(t3, "Firestore", "firebase deploy --only firestore:rules — registered-user raw event access; guest access via getPublicEvents")
    update_table_row(t3, "CORS", "gcloud storage buckets update gs://community-event-8b639.firebasestorage.app --cors-file=cors.json")

    update_table_row(t4, "iOS Safari suspends camera/mic in invisible iframes", "Native host stream frame stays active; hosts are warned to keep the app/screen open while live.")
    update_table_row(t4, "Hijri dates differ from astronomical calculations", "Community override-anchor history with latest prior correction; prevents impossible dates such as day numbers above 30.")
    update_table_row(t4, "YouTube beam succeeding but nothing showing on YouTube", "100ms beam removed. Native relay health checks transition YouTube broadcasts from ready/testing to live.")
    # Add recent challenge rows by reusing old JSX/compiler rows if present.
    update_table_row(t4, "iOS window.open() blocked after async call", "Phone-only login migration links former Google/Microsoft profiles to verified phone UIDs through secure Cloud Functions.")
    update_table_row(t4, "esbuild emoji parsing in JSX", "Guest privacy hardened with getPublicEvents and Firestore rules so anonymous users cannot read raw private event documents.")
    update_table_row(t4, "Inline regex > in JSX attributes", "Mobile portrait/landscape streaming normalized with canvas composition, orientation selection, and host-only rotate-back prompt.")

    update_table_row(t5, "100ms.live", "Native streaming relay")
    update_table_row(t5, "Web Crypto API", "Device Orientation API")
    # Rename table labels by editing first cell text.
    for row in t5.rows:
        if row.cells[0].text.strip() == "100ms.live":
            row.cells[0].text = "Native streaming relay"
            row.cells[1].text = "Browser MediaRecorder + WebSocket relay + FFmpeg output to YouTube RTMPS"
        if row.cells[0].text.strip() == "Web Crypto API":
            row.cells[0].text = "Device Orientation API"
            row.cells[1].text = "Host-only orientation mismatch detection for mobile streaming"

    update_table_row(t6, "v60 (baseline)", "Text-only event cards, basic Hijri calendar, early live streaming, YouTube OAuth")
    # Add v91 by replacing v90 row with a combined current summary.
    update_table_row(t6, "v90", "YouTube OAuth production mode fix, removed silent static-key fallback, iOS OAuth popup fix.")
    row = t6.add_row()
    row.cells[0].text = "v91"
    row.cells[1].text = "Phone-only login migration; duplicate migrated profiles filtered; guest privacy hardened with sanitized Cloud Function; Hijri correction history fixed; native streaming orientation/audio improvements; obsolete 100ms/HMS/Daily code removed; GitHub source pushed."

    doc.save(DOCX)


def para(text, style):
    return Paragraph(text, style)


def build_roadmap_pdf():
    page_size = landscape(A3)
    usable_width = page_size[0] - 24 * mm
    styles = getSampleStyleSheet()
    title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23, leading=26, textColor=colors.HexColor("#0f766e"), alignment=TA_CENTER, spaceAfter=4)
    subtitle = ParagraphStyle("Subtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, textColor=colors.HexColor("#334155"), alignment=TA_CENTER)
    h = ParagraphStyle("H", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=colors.white, alignment=TA_CENTER)
    cell_h = ParagraphStyle("CellH", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8.2, leading=10, textColor=colors.HexColor("#0f172a"), alignment=TA_CENTER)
    cell = ParagraphStyle("Cell", parent=styles["Normal"], fontName="Helvetica", fontSize=7.2, leading=9.2, textColor=colors.HexColor("#111827"), alignment=TA_LEFT)
    small = ParagraphStyle("Small", parent=styles["Normal"], fontName="Helvetica", fontSize=6.3, leading=7.5, textColor=colors.HexColor("#334155"), alignment=TA_LEFT)
    footer = ParagraphStyle("Footer", parent=styles["Normal"], fontName="Helvetica", fontSize=6.5, leading=8, textColor=colors.HexColor("#64748b"), alignment=TA_CENTER)

    doc = SimpleDocTemplate(
        str(PDF), pagesize=page_size, rightMargin=12*mm, leftMargin=12*mm,
        topMargin=10*mm, bottomMargin=9*mm
    )
    story = [
        para("COMMUNITY EVENTS APP - ROADMAP TO COMPLETE", title),
        para("communityevents.siza.info - communityeventssydney@gmail.com - June 2026 - Sydney, Australia", subtitle),
        Spacer(1, 5),
    ]

    columns = [
        ("1", "Foundation & Core", [
            "React 18 + Vite + PWA setup",
            "Firebase project & hosting live",
            "Firestore database structure",
            "Phone OTP authentication",
            "Anonymous guest browsing",
            "Role management: User/Admin/SuperAdmin",
            "Calendar sync (.ics export)",
            "Install as app (PWA)",
        ], "Completed"),
        ("2", "Events & Features", [
            "Event creation & editing",
            "Centre & Private event types",
            "Hijri calendar with stored monthly overrides",
            "Google Maps address autocomplete",
            "Filters, sorting & audience types",
            "Bulk share & series events",
            "Excel bulk import",
            "Privacy-safe share messages",
        ], "Completed"),
        ("3", "AI, Search & Notifications", [
            "AI Event Search (Claude API)",
            "Guest-safe AI prompt/results masking",
            "Smart keyword home search",
            "Voice search via microphone",
            "Push notifications (FCM)",
            "Daily email reminders",
            "Community update broadcast",
            "First-time walkthrough",
        ], "Completed"),
        ("4", "Native Live Streaming", [
            "Browser camera/mic pre-check frame",
            "Native WebSocket relay on Cloud Run",
            "FFmpeg to YouTube RTMPS",
            "YouTube OAuth2 Production mode",
            "Watch on YouTube button for viewers",
            "Host-only orientation warning",
            "Audio quality normalization",
            "Stale live cleanup safety net",
        ], "Completed"),
        ("5", "Android & iOS Apps", [
            "TWA APK for Android",
            "Google Play Store listing",
            "iOS App Store submission",
            "APN push notifications (iOS)",
            "Separate OAuth keys per platform",
            "App analytics integration",
            "Offline mode support",
            "Event RSVP",
            "Multi-language Arabic/Urdu",
        ], "Next Phase"),
    ]

    grid = []
    for num, heading, items, status in columns:
        body = [para(f"{num}", cell_h), para(heading, cell_h), Spacer(1, 2)]
        for item in items:
            body.append(para(f"- {item}", cell))
        body.extend([Spacer(1, 4), para(f"Status: {status}", cell_h)])
        grid.append(body)
    table = Table([grid], colWidths=[usable_width/5]*5)
    table.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ("BOX", (0,0), (-1,-1), 0.7, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0,0), (-1,-1), 0.4, colors.HexColor("#dbe3ea")),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ]))
    story.append(table)
    story.append(Spacer(1, 8))

    feature_rows = [
        ["Phone Login", "Phone OTP only; former Google/Microsoft users linked by verified phone + email match.", "Auth"],
        ["Guest Privacy", "Guests browse safe cards; private full address, phone, poster, directions, and raw event docs hidden.", "Security"],
        ["Hijri Calendar", "Stored monthly override history; Hijri/Gregorian anchor rules preserved after corrections.", "Calendar"],
        ["Native Streaming", "getUserMedia + WebSocket relay + FFmpeg + YouTube RTMPS; no 100ms/HMS dependency.", "Live"],
        ["Dynamic Orgs", "Admin-managed organisations and logos, no code deploy needed.", "Admin"],
        ["GitHub Source", "Updated app package committed and pushed to GitHub repository.", "DevOps"],
    ]
    feature_table = Table(
        [[para("FEATURE", h), para("CURRENT IMPLEMENTATION", h), para("AREA", h)]] +
        [[para(a, cell_h), para(b, cell), para(c, cell_h)] for a,b,c in feature_rows],
        colWidths=[32*mm, 130*mm, 28*mm]
    )
    feature_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0f766e")),
        ("BACKGROUND", (0,1), (-1,-1), colors.white),
        ("BOX", (0,0), (-1,-1), 0.7, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0,0), (-1,-1), 0.35, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))

    tech_rows = [
        ["FRONTEND", "React 18 + Vite + PWA", "DATABASE", "Firebase Firestore"],
        ["AUTH", "Firebase Phone OTP + anonymous guests", "BACKEND", "Cloud Functions v2"],
        ["HOSTING", "Firebase Hosting", "STORAGE", "Firebase Storage"],
        ["LIVE STREAM", "Native relay + YouTube RTMPS", "YOUTUBE", "Data API v3 + OAuth2"],
        ["AI SEARCH", "Claude API (Anthropic)", "MAPS", "Google Places API"],
        ["NOTIFICATIONS", "Firebase FCM + SMTP", "SOURCE CODE", "GitHub private repo"],
    ]
    tech_table = Table(
        [[para("TECH STACK", h), "", "", ""]] +
        [[para(a, cell_h), para(b, cell), para(c, cell_h), para(d, cell)] for a,b,c,d in tech_rows],
        colWidths=[30*mm, 60*mm, 30*mm, 60*mm]
    )
    tech_table.setStyle(TableStyle([
        ("SPAN", (0,0), (-1,0)),
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#c0392b")),
        ("BACKGROUND", (0,1), (-1,-1), colors.HexColor("#fff7ed")),
        ("BOX", (0,0), (-1,-1), 0.7, colors.HexColor("#fed7aa")),
        ("INNERGRID", (0,1), (-1,-1), 0.35, colors.HexColor("#fed7aa")),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))

    side = Table([[feature_table, tech_table]], colWidths=[195*mm, 190*mm])
    side.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 0),
    ]))
    story.append(side)
    story.append(Spacer(1, 8))
    story.append(para("Community Events Australia - React 18 + Vite + PWA - Firebase - Native relay - YouTube API v3 - Claude AI - Google Maps - communityevents.siza.info - v91 - June 2026", footer))
    story.append(PageBreak())

    story.append(para("NEXT STEPS - APP STORE AND OPERATIONS", title))
    story.append(para("Updated after phone-only login, guest privacy hardening, Hijri correction fixes, native streaming migration, and GitHub source push.", subtitle))
    story.append(Spacer(1, 8))

    next_steps = [
        ["Android App", "1. Finalise TWA AAB from current hosted PWA. 2. Confirm camera/mic permissions. 3. Upload to Google Play. 4. Complete 12 tester / 14 day closed testing. 5. Deploy web updates via Firebase Hosting."],
        ["iOS App", "1. Replace GoogleService-Info.plist placeholder. 2. Run CocoaPods and open workspace. 3. Configure signing and bundle ID. 4. Archive and upload to App Store Connect. 5. Add APN key for push notifications."],
        ["Operational Follow-up", "Monitor native relay logs, YouTube live transitions, guest privacy behaviour, Hijri monthly corrections, and phone-login profile migration after each production release."],
    ]
    steps_table = Table(
        [[para("NEXT STEPS", h), para("DETAILS", h)]] +
        [[para(a, cell_h), para(b, small)] for a,b in next_steps],
        colWidths=[45*mm, usable_width - 45*mm]
    )
    steps_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0f766e")),
        ("BACKGROUND", (0,1), (-1,-1), colors.HexColor("#f8fafc")),
        ("BOX", (0,0), (-1,-1), 0.7, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0,0), (-1,-1), 0.35, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(steps_table)
    story.append(Spacer(1, 5))
    story.append(para("Community Events Australia - React 18 + Vite + PWA - Firebase - Native relay - YouTube API v3 - Claude AI - Google Maps - communityevents.siza.info - v91 - June 2026", footer))
    doc.build(story)


if __name__ == "__main__":
    update_docx()
    build_roadmap_pdf()
    print(f"Updated {DOCX}")
    print(f"Updated {PDF}")
