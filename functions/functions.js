const admin      = require("firebase-admin");
const nodemailer = require("nodemailer");
const { onRequest, onCall } = require("firebase-functions/v2/https");
const { onSchedule }        = require("firebase-functions/v2/scheduler");
const { defineSecret }      = require("firebase-functions/params");

admin.initializeApp();
const db = admin.firestore();

const REGION = "australia-southeast1";

// ── Secrets ───────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const SMTP_HOST         = defineSecret("SMTP_HOST");
const SMTP_PORT         = defineSecret("SMTP_PORT");
const SMTP_USER         = defineSecret("SMTP_USER");
const SMTP_PASS         = defineSecret("SMTP_PASS");
const EMAIL_FROM        = defineSecret("EMAIL_FROM");

// ─── Health check ─────────────────────────────────────────────────────────────
exports.helloWorld = onRequest(
  { region: REGION },
  (req, res) => res.send("Community Events backend is running!")
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todaySydney(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return now.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

function buildTransporter(secrets) {
  const host = secrets.SMTP_HOST.value();
  const port = Number(secrets.SMTP_PORT.value() || 587);
  const user = secrets.SMTP_USER.value();
  const pass = secrets.SMTP_PASS.value();
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass }
  });
}

function toICSDate(dateStr, timeStr = "00:00") {
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Convert Excel time serial (decimal fraction) to HH:MM string
// Excel stores 19:30 as 0.8125, 21:00 as 0.875 etc.
function excelTimeToHHMM(val) {
  if (!val && val !== 0) return "";
  // Already a string like "19:30" — return as-is
  if (typeof val === "string") {
    const clean = val.trim();
    if (/^\d{1,2}:\d{2}$/.test(clean)) return clean.padStart(5, "0");
    return "";
  }
  // Number (Excel serial fraction)
  if (typeof val === "number") {
    const totalMins = Math.round(val * 24 * 60);
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  return "";
}

// Convert Excel date to YYYY-MM-DD — handles DD/MM/YYYY, serial numbers, YYYY-MM-DD
function excelDateToYYYYMMDD(val) {
  if (!val && val !== 0) return "";
  // Excel date serial number
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  // DD/MM/YYYY — standard Australian format
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

// Compute Hijri date string for a given Gregorian date and adjustment
function computeHijriDate(gregorianDate, adjustmentDays) {
  try {
    const d = new Date(gregorianDate + "T12:00:00");
    d.setDate(d.getDate() + Number(adjustmentDays || 0));
    return new Intl.DateTimeFormat("en-TN-u-ca-islamic", {
      day: "numeric", month: "long", year: "numeric"
    }).format(d);
  } catch {
    return "";
  }
}

function escICS(s = "") {
  return String(s)
    .replace(/\\/g, "\\\\").replace(/,/g, "\\,")
    .replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

// ─── LIVE CALENDAR FEED ────────────────────────────────────────────────────────
exports.calendarFeed = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    const uid = req.query.token;
    if (!uid) { res.status(400).send("Missing token"); return; }
    try { await admin.auth().getUser(uid); }
    catch { res.status(401).send("Invalid token"); return; }

    await db.collection("calendarSubscriptions").doc(uid)
      .set({ uid, lastPolled: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    const snap = await db.collection("events")
      .where("status", "==", "active")
      .orderBy("eventDate", "asc")
      .get();

    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//Community Events//EN", "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH", "X-WR-CALNAME:Community Events",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"
    ];

    snap.docs.forEach(doc => {
      const e    = doc.data();
      const stamp   = toICSDate(new Date().toISOString().slice(0, 10));
      const dtStart = toICSDate(e.eventDate, e.startTime || "00:00");
      const dtEnd   = toICSDate(e.eventDate, e.endTime   || e.startTime || "23:59");
      const addr    = e.address?.fullAddress || "";
      lines.push(
        "BEGIN:VEVENT",
        `UID:${doc.id}@community-events`,
        `DTSTAMP:${stamp}`, `DTSTART:${dtStart}`, `DTEND:${dtEnd}`,
        `SUMMARY:${escICS(`${e.eventType} – ${e.hostName}`)}`,
        `LOCATION:${escICS(addr)}`,
        `DESCRIPTION:${escICS(`Audience: ${e.audienceType}`)}`,
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Cache-Control", "no-cache, no-store");
    res.send(lines.join("\r\n"));
  }
);

// ─── Calendar subscriber count ────────────────────────────────────────────────
exports.getCalendarStats = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new Error("Unauthenticated");
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== "admin" && role !== "superAdmin") throw new Error("Insufficient permissions");
  const snap = await db.collection("calendarSubscriptions").get();
  return { count: snap.size };
});

// ─── AI EVENT SEARCH ──────────────────────────────────────────────────────────
exports.aiEventSearch = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    if (!request.auth) throw new Error("Unauthenticated");
    const { query: userQuery, isGuest = false } = request.data;
    if (!userQuery) throw new Error("Missing query");

    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY secret not configured. Run: firebase functions:secrets:set ANTHROPIC_API_KEY");

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

    const snap = await db.collection("events")
      .where("status", "==", "active")
      .orderBy("eventDate", "asc")
      .get();

    const events = snap.docs.map(d => {
      const e = d.data();
      // For guests: suburb only — no full address, no phone
      return {
        id:           d.id,
        eventType:    e.eventType,
        eventTypeDisplay: e.eventTypeDisplay || e.eventType,
        eventSubject: e.eventSubject || "",
        hostName:     e.hostName,
        eventDate:    e.eventDate,
        startTime:    e.startTime,
        audienceType: e.audienceType,
        organiserType: e.organiserType || "private",
        suburb:       e.address?.suburb   || "",
        state:        e.address?.state    || "",
        postcode:     e.address?.postcode || "",
        // Only include full address and phone for registered users
        fullAddress:  isGuest ? "" : (e.address?.fullAddress || ""),
        hostPhone:    isGuest ? "" : (e.hostPhone || ""),
        speakerName:  e.speakerName || "",
        reciters:     (e.reciters || []).filter(r => r.name)
                        .map(r => `${r.type}: ${r.name}`).join(", ")
      };
    });

    const systemPrompt = `You are an AI event search assistant for Community Events, a Muslim community app in Australia.
You receive the user's query and a JSON array of real events from the database.
Your job:
1. Understand what the user is looking for (event type, date range, suburb, audience type, speaker/reciter names)
2. Return ONLY the matching event IDs
3. Write a friendly 1-2 sentence summary

Date context: today=${today}

Respond ONLY in this exact JSON format, no markdown, no extra text:
{"matchedIds":["id1","id2"],"summary":"Here are the events I found..."}

If nothing matches: {"matchedIds":[],"summary":"I could not find any events matching that. Try different dates or suburbs."}

EVENTS DATABASE:
${JSON.stringify(events)}`;

    let resp;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model:      "claude-opus-4-5",
        max_tokens: 600,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userQuery }]
      })
    });

    } catch (fetchErr) {
      const { HttpsError } = require("firebase-functions/v2/https");
      throw new HttpsError("internal", `Network error calling Anthropic: ${fetchErr.message}`);
    }
    if (!resp.ok) {
      const errBody = await resp.text();
      let errMsg = `Anthropic API error ${resp.status}`;
      try {
        const parsed = JSON.parse(errBody);
        errMsg = parsed?.error?.message || errMsg;
      } catch {}
      // Use HttpsError so the message reaches the client
      const { HttpsError } = require("firebase-functions/v2/https");
      throw new HttpsError("internal", errMsg);
    }

    const data = await resp.json();
    const raw  = data.content?.[0]?.text || "{}";
    try {
      return JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      return { matchedIds: [], summary: "Sorry, I had trouble understanding that. Try rephrasing." };
    }
  }
);

// ─── DAILY EMAIL REMINDERS — 8 AM Sydney ──────────────────────────────────────
exports.dailyEmailReminders = onSchedule(
  { schedule: "0 19 * * *", timeZone: "Australia/Sydney", region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async () => {
    const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
    if (!transporter) { console.log("SMTP not configured."); return null; }

    // Send reminder for TOMORROW so users can plan ahead
    const date = todaySydney(1);
    const eventsSnap = await db.collection("events")
      .where("status", "==", "active")
      .where("eventDate", "==", date)
      .get();
    if (eventsSnap.empty) return null;

    const rows = eventsSnap.docs.map(d => {
      const e = d.data();
      const reciters = (e.reciters || []).filter(r => r.name)
        .map(r => `${r.type}: ${r.name}`).join(", ");
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.startTime || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.hostName || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.eventType || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.audienceType || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.address?.fullAddress || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.speakerName || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${reciters}</td>
      </tr>`;
    }).join("");

    const html = `<div style="font-family:sans-serif;max-width:700px">
      <div style="background:linear-gradient(135deg,#0f766e,#0b5d57);padding:24px;border-radius:16px 16px 0 0">
        <h2 style="color:white;margin:0">Community Events</h2>
        <p style="color:#e0f2fe;margin:4px 0 0">Tomorrow's Events — ${date}</p>
      </div>
      <table border="0" cellpadding="0" cellspacing="0"
        style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
        <thead><tr style="background:#0f766e">
          <th style="padding:10px;color:white;text-align:left">Time</th>
          <th style="padding:10px;color:white;text-align:left">Host</th>
          <th style="padding:10px;color:white;text-align:left">Type</th>
          <th style="padding:10px;color:white;text-align:left">Audience</th>
          <th style="padding:10px;color:white;text-align:left">Address</th>
          <th style="padding:10px;color:white;text-align:left">Speaker</th>
          <th style="padding:10px;color:white;text-align:left">Reciters</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#6b7280;font-size:12px;padding:16px">
        To opt out: Profile → Toggle Email Reminder off.
      </p></div>`;

    const usersSnap = await db.collection("users")
      .where("isActive", "==", true)
      .where("reminderEmailEnabled", "==", true)
      .get();

    let sent = 0;
    for (const doc of usersSnap.docs) {
      const u = doc.data();
      if (!u.email) continue;
      await transporter.sendMail({
        from: EMAIL_FROM.value() || SMTP_USER.value(),
        to: u.email,
        subject: `Community Events – Tomorrow's Events (${date})`,
        html
      });
      sent++;
    }
    console.log(`Sent ${sent} reminder emails for ${date}`);
    return null;
  }
);

// ─── DAILY ARCHIVE — 2 AM Sydney ──────────────────────────────────────────────
exports.dailyEventCleanup = onSchedule(
  { schedule: "0 2 * * *", timeZone: "Australia/Sydney", region: REGION },
  async () => {
    const cutoff = todaySydney(-7);
    const snap = await db.collection("events").where("eventDate", "<", cutoff).get();
    if (snap.empty) return null;

    const eligible = snap.docs.filter(doc => doc.data().isLive !== true);
    const archivedAt = admin.firestore.Timestamp.now();
    let archived = 0;
    for (let offset = 0; offset < eligible.length; offset += 240) {
      const batch = db.batch();
      const chunk = eligible.slice(offset, offset + 240);
      for (const eventDoc of chunk) {
        batch.set(db.collection("archivedEvents").doc(eventDoc.id), {
          ...eventDoc.data(),
          status: "inactive",
          archivedAt,
          archivedFromEventId: eventDoc.id,
          archiveReason: "event_date_expired",
        }, { merge: true });
        batch.delete(eventDoc.ref);
      }
      await batch.commit();
      archived += chunk.length;
    }
    console.log(`Archived ${archived} old events; skipped ${snap.size - eligible.length} live events`);
    return null;
  }
);

// ─── MONTHLY HIJRI REMINDER — 1st of month ────────────────────────────────────
exports.monthlyHijriReminder = onSchedule(
  { schedule: "0 8 1 * *", timeZone: "Australia/Sydney", region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async () => {
    const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
    if (!transporter) return null;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    const snap = await db.collection("users")
      .where("role", "==", "superAdmin")
      .where("isActive", "==", true)
      .get();
    for (const doc of snap.docs) {
      const u = doc.data();
      if (!u.email) continue;
      await transporter.sendMail({
        from: EMAIL_FROM.value() || SMTP_USER.value(),
        to: u.email,
        subject: "Community Events — Monthly Hijri Calendar Adjustment Reminder",
        html: `<div style="font-family:sans-serif;max-width:600px">
          <div style="background:linear-gradient(135deg,#0f766e,#0b5d57);padding:24px;border-radius:16px 16px 0 0">
            <h2 style="color:white;margin:0">Hijri Calendar Adjustment Required</h2>
          </div>
          <div style="padding:24px;border:1px solid #e5e7eb">
            <p>Hi ${u.fullName || "Super Admin"},</p>
            <p>This is your monthly reminder to verify the <strong>Hijri calendar adjustment</strong> in Community Events.</p>
            <p>Today is <strong>${today}</strong>. Please go to Admin Dashboard → Settings and enter the Gregorian date that corresponds to the 1st of the current Hijri month.</p>
          </div>
        </div>`
      });
    }
    return null;
  }
);

// ─── DELETE USER DATA (Callable) ──────────────────────────────────────────────
exports.deleteUserData = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const userDoc = await db.collection("users").doc(uid).get();
  if (userDoc.exists && userDoc.data().role === "superAdmin") {
    const saSnap = await db.collection("users")
      .where("role", "==", "superAdmin").where("isActive", "==", true).get();
    if (saSnap.size <= 1) throw new Error(
      "You are the only Super Admin. Assign another before deleting your account."
    );
  }
  const eventsSnap = await db.collection("events")
    .where("createdByUserId", "==", uid).get();
  let batch = db.batch(); let count = 0;
  for (const doc of eventsSnap.docs) {
    batch.delete(doc.ref); count++;
    if (count % 450 === 0) { await batch.commit(); batch = db.batch(); }
  }
  batch.delete(db.collection("users").doc(uid));
  batch.delete(db.collection("calendarSubscriptions").doc(uid));
  await batch.commit();
  return { deleted: count };
});

// ─── BULK IMPORT EVENTS (Callable) ────────────────────────────────────────────
exports.bulkImportEvents = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new Error("Unauthenticated");
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== "admin" && role !== "superAdmin") throw new Error("Admins only");

  const { events: rawEvents } = request.data;
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) throw new Error("No events provided");

  // Fetch Hijri adjustment setting
  const hijriSnap = await db.collection("settings").doc("hijriCalendar").get();
  const hijriAdj  = hijriSnap.exists ? (hijriSnap.data().adjustmentDays || 0) : 0;

  const VALID_TYPES    = ["Majlis", "Milad", "Birthday", "Informal get together", "Custom"];
  const VALID_AUDIENCE = ["Gents only", "Ladies only", "Kids only", "Mixed Audience"];
  const VALID_RECITERS = ["Soz", "Salam", "Manqebat", "Noha", "Reciter", "Peshkhani", "Other"];
  const REQUIRED       = ["hostName","eventDate","startTime","eventType","audienceType","street","suburb","state","postcode"];

  const created = []; const errors = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const row = rawEvents[i]; const rowErrors = [];

    // Convert Excel serial date/time to strings
    const eventDate = excelDateToYYYYMMDD(row.eventDate);
    const startTime = excelTimeToHHMM(row.startTime);
    const endTime   = excelTimeToHHMM(row.endTime);

    REQUIRED.forEach(f => {
      const val = f === 'eventDate' ? eventDate : f === 'startTime' ? startTime : row[f];
      if (!val?.toString().trim()) rowErrors.push(`${f} is required`);
    });
    if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) rowErrors.push("eventDate must be YYYY-MM-DD");
    if (startTime && !/^\d{2}:\d{2}$/.test(startTime))        rowErrors.push("startTime must be HH:MM");
    if (row.eventType    && !VALID_TYPES.includes(row.eventType))    rowErrors.push(`eventType must be one of: ${VALID_TYPES.join(", ")}`);
    if (row.audienceType && !VALID_AUDIENCE.includes(row.audienceType)) rowErrors.push(`audienceType must be one of: ${VALID_AUDIENCE.join(", ")}`);
    if (rowErrors.length > 0) { errors.push({ row: i + 1, errors: rowErrors }); continue; }

    const reciters = [];
    for (let r = 1; r <= 3; r++) {
      const rType = row[`reciter${r}Type`]?.toString().trim();
      const rName = row[`reciter${r}Name`]?.toString().trim();
      if (rName && rType) reciters.push({ type: VALID_RECITERS.includes(rType) ? rType : "Other", name: rName });
    }

      // Convert Hijri input to Gregorian if needed
      let resolvedDate = eventDate;
      if (row.enteredAsHijri && row.hijriDay && row.hijriMonth && row.hijriYear) {
        const converted = hijriToGregorianServer(Number(row.hijriDay), Number(row.hijriMonth), Number(row.hijriYear), hijriAdj);
        if (converted) { resolvedDate = converted; }
        else { rowErrors.push(`Cannot convert Hijri ${row.hijriDay}/${row.hijriMonth}/${row.hijriYear}`); errors.push({ row: i+1, errors: rowErrors }); continue; }
      }

    const isReligious = ["Majlis","Milad","Custom"].includes(row.eventType);
    const organiserType = row.organiserType?.toString().trim().toLowerCase() === "centre" ? "centre" : "private";
    const hijriDate   = computeHijriDate(eventDate, hijriAdj);
    const street      = row.street?.toString().trim() || "";
    const suburb      = row.suburb?.toString().trim() || "";
    const state       = row.state?.toString().trim()  || "";
    const postcode    = row.postcode?.toString().trim() || "";

    await db.collection("events").add({
      hostName:    row.hostName.toString().trim(),
      hostPhone:   row.hostPhone?.toString().trim() || "",
        eventDate:      resolvedDate,
        enteredAsHijri: !!row.enteredAsHijri,
        hijriDay:       row.enteredAsHijri ? Number(row.hijriDay)   : null,
        hijriMonth:     row.enteredAsHijri ? Number(row.hijriMonth) : null,
        hijriYear:      row.enteredAsHijri ? Number(row.hijriYear)  : null,
      eventType:        row.eventType.trim(),
      customEventType:  row.customEventType?.toString().trim() || "",
      eventSubject:     row.eventSubject?.toString().trim() || "",
      eventTypeDisplay: row.eventType.trim() === "Custom" && row.customEventType?.toString().trim()
                          ? row.customEventType.toString().trim() : row.eventType.trim(),
      audienceType: row.audienceType.trim(),
      isOnBehalfOf: true,   // Excel imports always on behalf of
      organiserType,
      hostContactOptional: row.hostContact?.toString().trim() || "",
      address: {
        street, suburb, state, postcode,
        fullAddress: `${street}, ${suburb} ${state} ${postcode}`.trim(),
        latitude: null, longitude: null
      },
      speakerName: isReligious ? (row.speakerName?.toString().trim() || "") : "",
      reciters:    isReligious ? reciters : [],
      status: "active",
      createdByUserId:    request.auth.uid,
      createdByUserEmail: userDoc.data()?.email || "",
      submittedByName:    userDoc.data()?.fullName || "",
      submittedByRole:    role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    created.push(i + 1);
  }

  return {
    created: created.length, errors,
    message: errors.length === 0
      ? `Successfully imported ${created.length} event(s).`
      : `Imported ${created.length} event(s). ${errors.length} row(s) had errors.`
  };
});

// ─── MANUAL REMINDER TRIGGER (Callable — Admin only) ─────────────────────────
// Allows admins to send today's reminder email on demand from the dashboard.
exports.sendRemindersNow = onCall(
  { region: REGION, secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (request) => {
    if (!request.auth) throw new Error("Unauthenticated");
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const role = userDoc.data()?.role;
    if (role !== "admin" && role !== "superAdmin") {
      throw new Error("Admin access required");
    }

    const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
    if (!transporter) {
      throw new Error("Email is not configured. Please set SMTP_HOST, SMTP_USER and SMTP_PASS secrets.");
    }

    const { mode, date, from, to, month } = request.data || {};
    const todaySyd = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

    // Build Firestore query based on mode
    let eventsQuery = db.collection("events").where("status", "==", "active");
    let label = "";

    if (mode === "range" && from && to) {
      eventsQuery = eventsQuery.where("eventDate", ">=", from).where("eventDate", "<=", to);
      label = `${from} to ${to}`;
    } else if (mode === "month" && month) {
      // month = "YYYY-MM"
      const [y, m] = month.split("-");
      const firstDay = `${y}-${m}-01`;
      const lastDay  = new Date(Number(y), Number(m), 0).toISOString().slice(0, 10);
      eventsQuery = eventsQuery.where("eventDate", ">=", firstDay).where("eventDate", "<=", lastDay);
      label = month;
    } else {
      // Single date (default)
      const targetDate = date || todaySyd;
      eventsQuery = eventsQuery.where("eventDate", "==", targetDate);
      label = targetDate;
    }

    const eventsSnap = await eventsQuery.get();

    if (eventsSnap.empty) {
      return { sent: 0, message: `No events found for ${label}. No emails sent.` };
    }

    const rows = eventsSnap.docs.map(d => {
      const e = d.data();
      const reciters = (e.reciters || []).filter(r => r.name)
        .map(r => `${r.type}: ${r.name}`).join(", ");
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.startTime || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.hostName || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.eventType || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.audienceType || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.address?.fullAddress || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${e.speakerName || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${reciters}</td>
      </tr>`;
    }).join("");

    const sentBy = userDoc.data()?.fullName || userDoc.data()?.email || "Admin";

    const html = `<div style="font-family:sans-serif;max-width:700px">
      <div style="background:linear-gradient(135deg,#0f766e,#0b5d57);padding:24px;border-radius:16px 16px 0 0">
        <h2 style="color:white;margin:0">Community Events</h2>
        <p style="color:#e0f2fe;margin:4px 0 0">Events for ${label}</p>
      </div>
      <table border="0" cellpadding="0" cellspacing="0"
        style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
        <thead><tr style="background:#0f766e">
          <th style="padding:10px;color:white;text-align:left">Time</th>
          <th style="padding:10px;color:white;text-align:left">Host</th>
          <th style="padding:10px;color:white;text-align:left">Type</th>
          <th style="padding:10px;color:white;text-align:left">Audience</th>
          <th style="padding:10px;color:white;text-align:left">Address</th>
          <th style="padding:10px;color:white;text-align:left">Speaker</th>
          <th style="padding:10px;color:white;text-align:left">Reciters</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#6b7280;font-size:12px;padding:16px">
        This reminder was manually sent by ${sentBy}.<br>
        To opt out of reminders: Profile → Toggle Email Reminder off.
      </p></div>`;

    const usersSnap = await db.collection("users")
      .where("isActive", "==", true)
      .where("reminderEmailEnabled", "==", true)
      .get();

    let sent = 0;
    const errors = [];
    for (const doc of usersSnap.docs) {
      const u = doc.data();
      if (!u.email) continue;
      try {
        await transporter.sendMail({
          from: EMAIL_FROM.value() || SMTP_USER.value(),
          to: u.email,
          subject: `Community Events – Events for ${label}`,
          html
        });
        sent++;
      } catch (e) {
        errors.push(u.email);
      }
    }

    return {
      sent,
      events: eventsSnap.size,
      message: `Sent to ${sent} user(s) · ${eventsSnap.size} event(s) included${errors.length > 0 ? ` · ${errors.length} failed` : ''}.`
    };
  }
);

// ─── RECALCULATE HIJRI EVENTS ─────────────────────────────────────────────────
// Called from Admin Dashboard when Hijri adjustment is saved.
// Updates eventDate (Gregorian) for all events entered as Hijri dates.
exports.recalculateHijriEvents = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new Error("Unauthenticated");
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const role = userDoc.data()?.role;
    if (role !== "admin" && role !== "superAdmin") throw new Error("Admin access required");

    const { adjustmentDays } = request.data;

    // Fetch all events entered as Hijri
    const snap = await db.collection("events")
      .where("enteredAsHijri", "==", true)
      .where("status", "==", "active")
      .get();

    if (snap.empty) return { updated: 0 };

    let batch   = db.batch();
    let count   = 0;

    for (const doc of snap.docs) {
      const e = doc.data();
      const { hijriDay, hijriMonth, hijriYear } = e;

      if (!hijriDay || !hijriMonth || !hijriYear) continue;

      // Recompute Gregorian date from stored Hijri components + new adjustment
      const newGreg = hijriToGregorianServer(hijriDay, hijriMonth, hijriYear, adjustmentDays);
      if (!newGreg) continue;

      // Recompute Hijri display string
      const hijriDate = computeHijriDate(newGreg, 0); // no additional offset — already baked in

      batch.update(doc.ref, {
        eventDate:  newGreg,
        hijriDate,
        updatedAt:  admin.firestore.FieldValue.serverTimestamp()
      });
      count++;

      if (count % 450 === 0) { await batch.commit(); batch = db.batch(); }
    }

    await batch.commit();
    console.log(`Recalculated ${count} Hijri events with adjustment ${adjustmentDays}`);
    return { updated: count };
  }
);

// Server-side Hijri → Gregorian conversion
function hijriToGregorianServer(hDay, hMonth, hYear, adjustmentDays = 0) {
  try {
    const approxYear = Math.round((hYear - 1) * 354.367 / 365.25) + 622;
    const ONE_DAY    = 86400000;
    const start      = new Date(approxYear - 1, 0, 1).getTime();
    const end        = new Date(approxYear + 2, 11, 31).getTime();

    // Linear search (Node.js doesn't always support binary search well with Intl)
    for (let t = start; t <= end; t += ONE_DAY) {
      const d     = new Date(t);
      // Apply inverse adjustment to find the "true" Hijri date
      d.setDate(d.getDate() - Number(adjustmentDays || 0));
      const fmt   = new Intl.DateTimeFormat('en-u-ca-islamic', {
        day: 'numeric', month: 'numeric', year: 'numeric'
      });
      const parts = fmt.formatToParts(d);
      const day   = parseInt(parts.find(p => p.type === 'day')?.value   || '0');
      const month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
      const year  = parseInt(parts.find(p => p.type === 'year')?.value  || '0');

      if (year === hYear && month === hMonth && day === hDay) {
        return new Date(t).toISOString().slice(0, 10);
      }
      // Early exit if we've passed the target year
      if (year > hYear + 1) break;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── ADMIN DELETE USER ────────────────────────────────────────────────────────
// Allows Super Admins to delete another user's account and all their data.
// Different from deleteUserData (which is self-deletion) — this is admin-initiated.
exports.adminDeleteUser = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new Error("Unauthenticated");

    // Only super admins can delete other users
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (callerDoc.data()?.role !== "superAdmin") {
      throw new Error("Only Super Admins can delete user accounts");
    }

    const { targetUid, ban = false } = request.data;
    if (!targetUid) throw new Error("Missing targetUid");
    if (targetUid === request.auth.uid) throw new Error("Cannot delete your own account this way");

    // Safety check — cannot delete the last super admin
    const targetDoc = await db.collection("users").doc(targetUid).get();
    const targetData = targetDoc.data() || {};
    if (targetData.role === "superAdmin") {
      const saSnap = await db.collection("users")
        .where("role", "==", "superAdmin")
        .where("isActive", "==", true)
        .get();
      if (saSnap.size <= 1) throw new Error("Cannot delete the only Super Admin");
    }

    // Delete all events by this user
    const eventsSnap = await db.collection("events")
      .where("createdByUserId", "==", targetUid).get();
    let batch = db.batch(); let count = 0;
    for (const doc of eventsSnap.docs) {
      batch.delete(doc.ref); count++;
      if (count % 450 === 0) { await batch.commit(); batch = db.batch(); }
    }

    // Delete user profile and calendar subscription
    batch.delete(db.collection("users").doc(targetUid));
    batch.delete(db.collection("calendarSubscriptions").doc(targetUid));

    // If banned — store email in bannedUsers collection
    if (ban && targetData.email) {
      batch.set(db.collection("bannedUsers").doc(targetData.email.toLowerCase().replace(/\./g,'_')), {
        email:     targetData.email.toLowerCase(),
        bannedAt:  admin.firestore.FieldValue.serverTimestamp(),
        bannedBy:  request.auth.uid,
        reason:    "Admin deletion with ban",
        fullName:  targetData.fullName || ""
      });
    }

    await batch.commit();

    // Delete the Firebase Auth account
    try {
      await admin.auth().deleteUser(targetUid);
    } catch (e) {
      console.warn("Could not delete auth account:", e.message);
    }

    console.log(`Admin ${request.auth.uid} deleted user ${targetUid}, events: ${count}, banned: ${ban}`);
    return { deleted: true, eventsRemoved: count, banned: ban };
  }
);
