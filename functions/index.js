const admin      = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto     = require("crypto");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule }        = require("firebase-functions/v2/scheduler");
const { defineSecret }      = require("firebase-functions/params");

admin.initializeApp();
const db = admin.firestore();

const REGION = "australia-southeast1";

// â”€â”€ Secrets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ANTHROPIC_API_KEY     = defineSecret("ANTHROPIC_API_KEY");
const SMTP_HOST             = defineSecret("SMTP_HOST");
const SMTP_PORT             = defineSecret("SMTP_PORT");
const SMTP_USER             = defineSecret("SMTP_USER");
const SMTP_PASS             = defineSecret("SMTP_PASS");
const EMAIL_FROM            = defineSecret("EMAIL_FROM");
const YOUTUBE_CLIENT_ID     = defineSecret("YOUTUBE_CLIENT_ID");
const YOUTUBE_CLIENT_SECRET = defineSecret("YOUTUBE_CLIENT_SECRET");
const YOUTUBE_RTMP_SECRET   = defineSecret("YOUTUBE_STREAM_KEY");

// â”€â”€â”€ Health check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.helloWorld = onRequest(
  { region: REGION },
  (req, res) => res.send("Community Events backend is running!")
);

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Temporary app store reviewer login. Remove after Google/Apple review is complete.
exports.temporaryStoreTesterLogin = onCall({ region: REGION }, async (request) => {
  const email = String(request.data?.email || "").trim().toLowerCase();
  const password = String(request.data?.password || "");
  const testerEmail = "communityeventstester@outlook.com";
  const testerPassword = "Sydney#201977";

  if (email !== testerEmail || password !== testerPassword) {
    throw new HttpsError("permission-denied", "Invalid tester credentials.");
  }

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(testerEmail);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    userRecord = await admin.auth().createUser({
      email: testerEmail,
      emailVerified: true,
      displayName: "Community Events Tester",
    });
  }

  await db.collection("users").doc(userRecord.uid).set({
    fullName: "Community Events Tester",
    email: testerEmail,
    emailLower: testerEmail,
    role: "superAdmin",
    isActive: true,
    reminderEmailEnabled: true,
    walkthroughCompleted: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const token = await admin.auth().createCustomToken(userRecord.uid, {
    storeTester: true,
  });
  return { token };
});

// Update the editable identity fields on a user profile. Users may update
// themselves; admins may correct any active user's profile. Role and account
// permissions are deliberately outside this endpoint.
exports.updateUserContactProfile = onCall({ region: REGION }, async (request) => {
  if (!request.auth?.uid || request.auth.token.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('unauthenticated', 'Please sign in first.');
  }

  const requesterUid = request.auth.uid;
  const targetUid = String(request.data?.targetUid || requesterUid).trim();
  const fullName = String(request.data?.fullName || '').trim().replace(/\s+/g, ' ');
  const email = String(request.data?.email || '').trim().toLowerCase();

  if (fullName.length < 2 || fullName.length > 100) {
    throw new HttpsError('invalid-argument', 'Enter a valid full name.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }

  if (targetUid !== requesterUid) {
    const requester = await db.collection('users').doc(requesterUid).get();
    if (!requester.exists || !['admin', 'superAdmin'].includes(requester.data()?.role)) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }
  }

  const targetRef = db.collection('users').doc(targetUid);
  const target = await targetRef.get();
  if (!target.exists || target.data()?.isActive === false || target.data()?.migratedToUid) {
    throw new HttpsError('not-found', 'User profile not found.');
  }

  const [lowerMatches, legacyMatches] = await Promise.all([
    db.collection('users').where('emailLower', '==', email).limit(5).get(),
    db.collection('users').where('email', '==', email).limit(5).get(),
  ]);
  const possibleDuplicates = new Map(
    [...lowerMatches.docs, ...legacyMatches.docs].map(doc => [doc.id, doc])
  );
  const duplicate = [...possibleDuplicates.values()].find(doc =>
    doc.id !== targetUid && doc.data()?.isActive !== false && !doc.data()?.migratedToUid
  );
  if (duplicate) {
    throw new HttpsError('already-exists', 'This email is already used by another account.');
  }

  const authUser = await admin.auth().getUser(targetUid).catch(() => null);
  const rawPhone = String(authUser?.phoneNumber || target.data()?.phone || '').trim();
  const phoneDigits = rawPhone.replace(/\D/g, '');
  const canonicalPhone = rawPhone.startsWith('+')
    ? rawPhone
    : phoneDigits.startsWith('04')
      ? `+61${phoneDigits.slice(1)}`
      : phoneDigits.startsWith('614')
        ? `+${phoneDigits}`
        : rawPhone;

  if (canonicalPhone) {
    const localPhone = canonicalPhone.startsWith('+614') ? `0${canonicalPhone.slice(3)}` : canonicalPhone;
    const phoneCandidates = [...new Set([canonicalPhone, localPhone, phoneDigits].filter(Boolean))];
    const phoneQueries = await Promise.all(phoneCandidates.map(phone =>
      db.collection('users').where('phone', '==', phone).limit(5).get()
    ));
    const phoneMatches = new Map(phoneQueries.flatMap(result => result.docs).map(doc => [doc.id, doc]));
    const phoneDuplicate = [...phoneMatches.values()].find(doc =>
      doc.id !== targetUid && doc.data()?.isActive !== false && !doc.data()?.migratedToUid
    );
    if (phoneDuplicate) {
      throw new HttpsError('already-exists', 'This phone number is already attached to another email account.');
    }
  }

  await targetRef.update({
    fullName,
    email,
    emailLower: email,
    ...(canonicalPhone ? { phone: canonicalPhone, phoneNormalized: canonicalPhone } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    profileUpdatedByUid: requesterUid,
  });
  await admin.auth().updateUser(targetUid, { displayName: fullName }).catch(error => {
    console.warn('Could not update Firebase display name:', targetUid, error.message);
  });

  return { profile: { id: targetUid, fullName, email, emailLower: email } };
});

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

const PROGRAMS_UPDATE_IMAGE_URL = "https://communityevents.siza.info/images/programs-update-header.jpg";

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sortEventsForUpdate(events) {
  return [...events].sort((a, b) => {
    const timeCompare = String(a.startTime || '').localeCompare(String(b.startTime || ''));
    if (timeCompare !== 0) return timeCompare;
    return String(a.hostName || '').localeCompare(String(b.hostName || ''));
  });
}

function compareEventsByDateTimeData(a = {}, b = {}) {
  const dateCompare = String(a.eventDate || "").localeCompare(String(b.eventDate || ""));
  if (dateCompare) return dateCompare;
  const timeCompare = String(a.startTime || "99:99").localeCompare(String(b.startTime || "99:99"));
  if (timeCompare) return timeCompare;
  return String(a.hostName || "").localeCompare(String(b.hostName || ""));
}

function buildEmailEventRow(e) {
  const reciters = (e.reciters || []).filter(r => r.name)
    .map(r => `${r.type}: ${r.name}`).join(", ");
  return `<tr>
    <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.startTime || "")}</td>
    <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.hostName || "")}</td>
    <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.eventType || "")}</td>
    <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml((e.audienceType === "Mixed Audience" ? "Family Event" : e.audienceType) || "")}</td>
    <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.address?.fullAddress || "")}</td>
    <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.speakerName || "")}</td>
    <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(reciters)}</td>
  </tr>`;
}

function buildEmailEventTable(title, events) {
  if (!events.length) return "";
  const rows = sortEventsForUpdate(events).map(buildEmailEventRow).join("");
  return `<div style="margin-top:18px">
    <h3 style="margin:0 0 8px;color:#0f766e;font-size:18px">${title} (${events.length})</h3>
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
  </div>`;
}

function buildGroupedEmailEventTables(events) {
  const centreEvents = events.filter(e => e.organiserType !== "private");
  const privateEvents = events.filter(e => e.organiserType === "private");
  return [
    buildEmailEventTable("Centre Programs", centreEvents),
    privateEvents.length && centreEvents.length
      ? '<div style="height:1px;background:#e5e7eb;margin:22px 0 4px"></div>'
      : '',
    buildEmailEventTable("Private Programs", privateEvents),
  ].filter(Boolean).join("");
}

function buildProgramsUpdateEmailHeader() {
  return `<div style="background:linear-gradient(135deg,#0f766e,#0b5d57);padding:18px 22px;border-radius:16px 16px 0 0">
    <table border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
      <tr>
        <td style="width:150px;vertical-align:middle">
          <img src="${PROGRAMS_UPDATE_IMAGE_URL}" alt="Programs Update" style="display:block;width:140px;max-width:140px;height:auto;border-radius:10px">
        </td>
        <td style="vertical-align:middle;padding-left:16px">
          <h2 style="color:white;margin:0;font-size:24px;line-height:1.2">Community Events</h2>
          <p style="color:#e0f2fe;margin:6px 0 0;font-size:17px;font-weight:700">Tomorrow's Events</p>
        </td>
      </tr>
    </table>
  </div>`;
}

function isISODateString(dateStr) {
  return typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function normalizeICSTime(timeStr, fallback = "00:00") {
  const raw = String(timeStr || fallback).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function toICSDate(dateStr, timeStr = "00:00") {
  // Return local datetime string with TZID; do not convert to UTC.
  // UTC conversion shifts Sydney events by +10/+11 hours causing wrong
  // dates in Apple Calendar and Google Calendar.
  if (!isISODateString(dateStr)) return "";
  const [y, m, d] = dateStr.split("-");
  const [hh, mm] = normalizeICSTime(timeStr).split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}

function foldICSLine(line = "") {
  const text = String(line);
  const chunks = [];
  for (let i = 0; i < text.length; i += 73) {
    chunks.push((i === 0 ? "" : " ") + text.slice(i, i + 73));
  }
  return chunks.join("\r\n");
}

function pushICS(lines, line) {
  lines.push(foldICSLine(line));
}

// Convert time value to HH:MM string
// Handles: 4-digit integer (1930), Excel decimal fraction (0.8125), string "19:30"
function excelTimeToHHMM(val) {
  if (!val && val !== 0) return "";

  if (typeof val === "string") {
    const clean = val.trim();
    // Already HH:MM
    if (/^\d{1,2}:\d{2}$/.test(clean)) return clean.padStart(5, "0");
    // 4-digit string like "1930"
    const n = parseInt(clean, 10);
    if (!isNaN(n) && clean.length === 4) {
      const h = Math.floor(n / 100), m = n % 100;
      if (h <= 23 && m <= 59) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }
    return "";
  }

  if (typeof val === "number") {
    // 4-digit integer like 1930
    if (val >= 0 && val <= 2359 && Number.isInteger(val)) {
      const h = Math.floor(val / 100), m = val % 100;
      if (h <= 23 && m <= 59) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }
    // Excel decimal fraction like 0.8125 = 19:30
    if (val > 0 && val < 1) {
      const totalMins = Math.round(val * 24 * 60);
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }
  }
  return "";
}

// Convert Excel date to YYYY-MM-DD â€” handles DD/MM/YYYY, serial numbers, YYYY-MM-DD
function excelDateToYYYYMMDD(val) {
  if (!val && val !== 0) return "";
  // Excel date serial number
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  // DD/MM/YYYY â€” standard Australian format
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
// â”€â”€ JDN-based Hijri calendar (same algorithm as SIZA Calendar Religiously) â”€â”€
function gregorianToJdn(y,m,d){const a=Math.floor((14-m)/12),yr=y+4800-a,mn=m+12*a-3;return d+Math.floor((153*mn+2)/5)+365*yr+Math.floor(yr/4)-Math.floor(yr/100)+Math.floor(yr/400)-32045;}
function jdnToGregorian(jdn){const a=jdn+32044,b=Math.floor((4*a+3)/146097),c=a-Math.floor((146097*b)/4),d=Math.floor((4*c+3)/1461),e=c-Math.floor((1461*d)/4),m=Math.floor((5*e+2)/153);return{day:e-Math.floor((153*m+2)/5)+1,month:m+3-12*Math.floor(m/10),year:100*b+d-4800+Math.floor(m/10)};}
// â”€â”€ Override-anchored 30-day cascade (matches client hijriService.js) â”€â”€
const MONTH_DAYS_SERVER = 30;
function islamicToJdnAstro(y,m,d){return d+Math.ceil(29.5*(m-1))+(y-1)*354+Math.floor((3+11*y)/30)+1948439;}
function jdnToIslamicAstro(jdn){const y=Math.floor((30*(jdn-1948439)+10646)/10631),m=Math.min(12,Math.ceil((jdn-29-islamicToJdnAstro(y,1,1))/29.5)+1);return{year:y,month:m,day:jdn-islamicToJdnAstro(y,m,1)+1};}
function monIdx(y,m){return y*12+(m-1);}
function fromMonIdx(idx){return{year:Math.floor(idx/12),month:(idx%12)+1};}
function cmpHijri(a,b){return a.year!==b.year?a.year-b.year:a.month!==b.month?a.month-b.month:(a.day||1)-(b.day||1);}
function sortOv(arr){return[...(arr||[])].filter(o=>o&&o.hYear&&o.hMonth&&o.gDate).sort((a,b)=>cmpHijri({year:a.hYear,month:a.hMonth},{year:b.hYear,month:b.hMonth}));}
function monthStartJdnServer(hY,hM,ov){
  const sorted=sortOv(ov);const targetIdx=monIdx(hY,hM);
  if(sorted.length===0)return islamicToJdnAstro(hY,hM,1);
  let anchor=null;
  for(const o of sorted){if(monIdx(o.hYear,o.hMonth)<=targetIdx)anchor=o;else break;}
  if(anchor){const[ay,am,ad]=anchor.gDate.split("-").map(Number);const aj=gregorianToJdn(ay,am,ad);const fwd=targetIdx-monIdx(anchor.hYear,anchor.hMonth);return aj+fwd*MONTH_DAYS_SERVER;}
  else{const e=sorted[0];const[ey,em,ed]=e.gDate.split("-").map(Number);const ej=gregorianToJdn(ey,em,ed);const back=monIdx(e.hYear,e.hMonth)-targetIdx;return ej-back*MONTH_DAYS_SERVER;}
}
function hijriToGreg(hY,hM,hD,ov){return jdnToGregorian(monthStartJdnServer(hY,hM,ov||[])+(hD-1));}
function gregToHijri(gY,gM,gD,ov){
  const so=sortOv(ov);const t=gregorianToJdn(gY,gM,gD);
  if(so.length===0)return jdnToIslamicAstro(t);
  const ap=jdnToIslamicAstro(t);const apIdx=monIdx(ap.year,ap.month);
  for(let off=-4;off<=4;off++){const{year,month}=fromMonIdx(apIdx+off);const s=monthStartJdnServer(year,month,so);const nx=fromMonIdx(monIdx(year,month)+1);const ns=monthStartJdnServer(nx.year,nx.month,so);if(t>=s&&t<ns)return{year,month,day:t-s+1};}
  return ap;
}

const HIJRI_MONTH_NAMES_SERVER = ["Muharram","Safar","Rabi al-Awwal","Rabi al-Thani","Jumada al-Awwal","Jumada al-Thani","Rajab","Sha'ban","Ramadan","Shawwal","Dhu al-Qi'dah","Dhu al-Hijjah"];

function computeHijriDate(gregorianDate, overrides) {
  try {
    const [y,m,d] = gregorianDate.split("-").map(Number);
    const h = gregToHijri(y, m, d, overrides || []);
    return `${h.day} ${HIJRI_MONTH_NAMES_SERVER[h.month-1]} ${h.year} AH`;
  } catch { return ""; }
}

function escICS(s = "") {
  return String(s)
    .replace(/\\/g, "\\\\").replace(/,/g, "\\,")
    .replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

// â”€â”€â”€ LIVE CALENDAR FEED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.calendarFeed = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    const uid = req.query.t || req.query.token;  // short: ?t=  legacy: ?token=
    if (!uid) { res.status(400).send("Missing token"); return; }
    try { await admin.auth().getUser(uid); }
    catch { res.status(401).send("Invalid token"); return; }

    // Track in calendarSubscriptions collection
    await db.collection("calendarSubscriptions").doc(uid)
      .set({ uid, lastPolled: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    // Also update the user's own doc so Admin Dashboard can show sync status
    await db.collection("users").doc(uid).update({
      calendarSynced:     true,
      calendarLastPolled: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {}); // silently ignore if user doc doesn't exist

    const snap = await db.collection("events")
      .where("status", "==", "active")
      .orderBy("eventDate", "asc")
      .get();

    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//Community Events//EN", "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH", "X-WR-CALNAME:Community Events",
      "X-WR-TIMEZONE:Australia/Sydney",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
      // VTIMEZONE block for Australia/Sydney (AEDT/AEST)
      "BEGIN:VTIMEZONE",
      "TZID:Australia/Sydney",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+1100", "TZOFFSETTO:+1000",
      "TZNAME:AEST",
      "DTSTART:19700405T030000",
      "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=4",
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      "TZOFFSETFROM:+1000", "TZOFFSETTO:+1100",
      "TZNAME:AEDT",
      "DTSTART:19701004T020000",
      "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=10",
      "END:DAYLIGHT",
      "END:VTIMEZONE"
    ];

    [...snap.docs]
      .sort((a, b) => compareEventsByDateTimeData(a.data(), b.data()))
      .forEach(doc => {
      const e    = doc.data();
      if (!isISODateString(e.eventDate)) {
        console.warn("Skipping event with invalid calendar date", { eventId: doc.id, eventDate: e.eventDate });
        return;
      }
      const dtStart = toICSDate(e.eventDate, e.startTime || "00:00");
      const dtEnd   = toICSDate(e.eventDate, e.endTime || e.startTime || "23:59");
      if (!dtStart || !dtEnd) {
        console.warn("Skipping event with invalid calendar time", {
          eventId: doc.id,
          eventDate: e.eventDate,
          startTime: e.startTime,
          endTime: e.endTime,
        });
        return;
      }
      const addr    = e.address?.fullAddress || "";
      lines.push(
        "BEGIN:VEVENT"
      );
      pushICS(lines, `UID:${doc.id}@community-events`);
      pushICS(lines, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").split(".")[0]}Z`);
      pushICS(lines, `DTSTART;TZID=Australia/Sydney:${dtStart}`);
      pushICS(lines, `DTEND;TZID=Australia/Sydney:${dtEnd}`);
      pushICS(lines, `SUMMARY:${escICS(`${e.eventType || "Event"} - ${e.hostName || "Community Events"}`)}`);
      if (addr) pushICS(lines, `LOCATION:${escICS(addr)}`);
      pushICS(lines, `DESCRIPTION:${escICS(`Audience: ${e.audienceType || "All audiences"}`)}`);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Cache-Control", "no-cache, no-store");
    res.send(lines.join("\r\n"));
  }
);

// â”€â”€â”€ Calendar subscriber count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getCalendarStats = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new Error("Unauthenticated");
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== "admin" && role !== "superAdmin") throw new Error("Insufficient permissions");
  const snap = await db.collection("calendarSubscriptions").get();
  const activeSince = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const uids = snap.docs
    .filter(d => {
      const lastPolled = d.data()?.lastPolled;
      const millis = typeof lastPolled?.toMillis === "function"
        ? lastPolled.toMillis()
        : lastPolled?.seconds
          ? lastPolled.seconds * 1000
          : 0;
      return millis >= activeSince;
    })
    .map(d => d.id);
  return { count: uids.length, uids, everCount: snap.size };
});

// â”€â”€â”€ AI EVENT SEARCH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Public event list for guests. Firestore rules cannot mask individual fields,
// so anonymous users receive only this sanitized shape through Cloud Functions.
exports.getPublicEvents = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new Error("Unauthenticated");

    if (publicEventsCache.expiresAt > Date.now() && publicEventsCache.events.length) {
      return { events: publicEventsCache.events, cached: true };
    }

    const yesterday = todaySydney(-1);
    const [upcomingSnap, liveSnap] = await Promise.all([
      db.collection("events")
        .where("status", "==", "active")
        .where("eventDate", ">=", yesterday)
        .orderBy("eventDate", "asc")
        .limit(150)
        .get(),
      db.collection("events").where("isLive", "==", true).get(),
    ]);

    const docsById = new Map();
    [...upcomingSnap.docs, ...liveSnap.docs].forEach(doc => docsById.set(doc.id, doc));

    const events = [...docsById.values()]
      .sort((a, b) => compareEventsByDateTimeData(a.data(), b.data()))
      .map(doc => {
        const e = doc.data();
        if (e.hidden || e.status !== "active") return null;

        const isPrivate = (e.organiserType || "private") === "private";
        const safeAddress = {
          suburb:   e.address?.suburb   || "",
          state:    e.address?.state    || "",
          postcode: e.address?.postcode || "",
        };

        if (!isPrivate) {
          safeAddress.fullAddress = e.address?.fullAddress || "";
          safeAddress.street      = e.address?.street || "";
          safeAddress.latitude    = e.address?.latitude || null;
          safeAddress.longitude   = e.address?.longitude || null;
        }

        return {
          id: doc.id,
          status: e.status || "active",
          hidden: false,
          hostName: e.hostName || "",
          eventDate: e.eventDate || "",
          startTime: e.startTime || "",
          endTime: e.endTime || "",
          hijriDate: e.hijriDate || "",
          hijriDay: e.hijriDay || null,
          hijriMonth: e.hijriMonth || null,
          hijriYear: e.hijriYear || null,
          enteredAsHijri: e.enteredAsHijri === true,
          eventType: e.eventType || "",
          customEventType: e.customEventType || "",
          eventTypeDisplay: e.eventTypeDisplay || e.eventType || "",
          eventSubject: e.eventSubject || "",
          notes: typeof e.notes === "string" ? e.notes.slice(0, 500) : "",
          audienceType: e.audienceType || "",
          organiserType: e.organiserType || "private",
          metroArea: e.metroArea || "",
          isOnBehalfOf: !!e.isOnBehalfOf,
          address: safeAddress,
          speakerName: e.speakerName || "",
          reciters: Array.isArray(e.reciters) ? e.reciters : [],
          isLive: e.isLive === true,
          liveWatchUrl: e.liveWatchUrl || null,
        };
      })
      .filter(Boolean);

    publicEventsCache = { expiresAt: Date.now() + 20 * 1000, events };
    return { events, cached: false };
  }
);

exports.aiEventSearch = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, enforceAppCheck: false },
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

    // Limit to 200 most recent upcoming events to keep prompt size manageable
    const todayStr = new Date().toISOString().slice(0, 10);
    const filteredDocs = snap.docs
      .filter(d => (d.data().eventDate || '') >= todayStr)
      .sort((a, b) => compareEventsByDateTimeData(a.data(), b.data()))
      .slice(0, 200);

    const events = filteredDocs.map(d => {
      const e = d.data();
      // For guests: suburb only â€” no full address, no phone
      return {
        id:           d.id,
        eventType:    e.eventType,
        eventTypeDisplay: e.eventTypeDisplay || e.eventType,
        eventSubject: e.eventSubject || "",
        notes: typeof e.notes === "string" ? e.notes.slice(0, 500) : "",
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
        model:      "claude-haiku-4-5",
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

// â”€â”€â”€ DAILY EMAIL REMINDERS â€” 8 AM Sydney â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.dailyEmailReminders = onSchedule(
  { schedule: "0 19 * * *", timeZone: "Australia/Sydney", region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async () => {
    const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
    if (!transporter) { console.log("SMTP not configured."); return null; }

    // Send reminder for TOMORROW so users can plan ahead
    const date = todaySydney(1);
    const eventsSnapRaw = await db.collection("events")
      .where("status", "==", "active")
      .where("eventDate", "==", date)
      .get();
    // Filter hidden in JS â€” a Firestore "!= true" query drops docs with no
    // `hidden` field at all, which would exclude every legacy/visible event.
    const visibleDocs = eventsSnapRaw.docs.filter(d => d.data().hidden !== true);
    if (visibleDocs.length === 0) return null;
    // Lightweight shim so the rest of the function can keep using eventsSnap
    const eventsSnap = { docs: visibleDocs, size: visibleDocs.length, empty: visibleDocs.length === 0 };

    const eventSections = buildGroupedEmailEventTables(eventsSnap.docs.map(d => d.data()));

    const html = `<div style="font-family:sans-serif;max-width:700px">
      ${buildProgramsUpdateEmailHeader()}
      <div style="padding:18px;background:#ffffff">${eventSections}</div>
      <p style="color:#6b7280;font-size:12px;padding:16px">
        To opt out: Profile -> Toggle Email Reminder off.
      </p></div>`;

    // Get all users with reminders enabled (don't filter by isActive â€” field may not exist)
    const usersSnap = await db.collection("users")
      .where("reminderEmailEnabled", "==", true)
      .get();

    let sent = 0;
    let pushed = 0;
    const allUsers = await db.collection('users').get();

    for (const doc of allUsers.docs) {
      const u = doc.data();
      if (u.isActive === false || u.migratedToUid) continue;

      // Send email if user has email
      if (u.email && u.reminderEmailEnabled !== false) {
        try {
          await transporter.sendMail({
            from: EMAIL_FROM.value() || SMTP_USER.value(),
            to: u.email,
            subject: `Community Events - Tomorrow's Events (${date})`,
            html: html + unsubscribeFooter(doc.id)
          });
          sent++;
        } catch(e) { console.warn('Email failed:', u.email, e.message); }
      }

      // Send push notification if user has FCM tokens
      if (u.fcmTokens && Object.keys(u.fcmTokens).length > 0) {
        const tokens = Object.keys(u.fcmTokens);
        const eventCount = eventsSnap.size;
        const firstEvent = eventsSnap.docs[0]?.data();
        const pushMsg = {
          notification: {
            title: `ðŸŒ™ ${eventCount} Community Event${eventCount !== 1 ? 's' : ''} Tomorrow`,
            body: firstEvent
              ? `${firstEvent.startTime} Â· ${firstEvent.hostName} Â· ${firstEvent.address?.suburb || ''}`
              : `Events on ${date}`,
          },
          data: { date, url: 'https://communityevents.siza.info/app' },
          tokens,
        };
        try {
          const fcmRes = await admin.messaging().sendEachForMulticast(pushMsg);
          pushed += fcmRes.successCount;
          // Remove invalid tokens
          const invalid = [];
          fcmRes.responses.forEach((r, i) => {
            if (!r.success && (r.error?.code === 'messaging/invalid-registration-token' ||
                               r.error?.code === 'messaging/registration-token-not-registered')) {
              invalid.push(tokens[i]);
            }
          });
          if (invalid.length > 0) {
            const updates = {};
            invalid.forEach(t => { updates[`fcmTokens.${t}`] = admin.firestore.FieldValue.delete(); });
            await doc.ref.update(updates);
          }
        } catch(e) { console.warn('Push failed for user:', u.email || doc.id, e.message); }
      }
    }
    console.log(`Sent ${sent} reminder emails, ${pushed} push notifications for ${date}`);
    return null;
  }
);

// â”€â”€â”€ DAILY ARCHIVE â€” 2 AM Sydney â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.dailyEventCleanup = onSchedule(
  { schedule: "0 2 * * *", timeZone: "Australia/Sydney", region: REGION },
  async () => {
    const cutoff = todaySydney(-7);
    const snap = await db.collection("events").where("eventDate", "<", cutoff).get();
    if (snap.empty) return null;

    const eligible = snap.docs.filter(doc => doc.data().isLive !== true);
    const archivedAt = admin.firestore.Timestamp.now();
    let archived = 0;

    // Each event uses two writes (archive + source removal), so stay below the
    // Firestore 500-operation batch limit.
    for (let offset = 0; offset < eligible.length; offset += 240) {
      const batch = db.batch();
      const chunk = eligible.slice(offset, offset + 240);
      for (const eventDoc of chunk) {
        const archiveRef = db.collection("archivedEvents").doc(eventDoc.id);
        batch.set(archiveRef, {
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

// â”€â”€â”€ MONTHLY HIJRI REMINDER â€” 1st of month â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        subject: "Community Events - Monthly Hijri Calendar Adjustment Reminder",
        html: `<div style="font-family:sans-serif;max-width:600px">
          <div style="background:linear-gradient(135deg,#0f766e,#0b5d57);padding:24px;border-radius:16px 16px 0 0">
            <h2 style="color:white;margin:0">Hijri Calendar Adjustment Required</h2>
          </div>
          <div style="padding:24px;border:1px solid #e5e7eb">
            <p>Hi ${u.fullName || "Super Admin"},</p>
            <p>This is your monthly reminder to verify the <strong>Hijri calendar adjustment</strong> in Community Events.</p>
            <p>Today is <strong>${today}</strong>. Please go to Admin Dashboard â†’ Settings and enter the Gregorian date that corresponds to the 1st of the current Hijri month.</p>
          </div>
        </div>`
      });
    }
    return null;
  }
);

// â”€â”€â”€ DELETE USER DATA (Callable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.deleteUserData = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const archiveEventsNow = request.data?.archiveEventsNow === true;
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
  if (eventsSnap.docs.some(eventDoc => eventDoc.data().isLive === true)) {
    throw new HttpsError("failed-precondition", "End your active live stream before deleting your account.");
  }

  const accountDeletedAt = admin.firestore.Timestamp.now();
  let count = 0;
  if (archiveEventsNow) {
    // Preserve the complete event, host and on-behalf-of submission details.
    // Only its lifecycle changes from active to inactive.
    for (let offset = 0; offset < eventsSnap.docs.length; offset += 240) {
      const batch = db.batch();
      const chunk = eventsSnap.docs.slice(offset, offset + 240);
      for (const eventDoc of chunk) {
        batch.set(db.collection("archivedEvents").doc(eventDoc.id), {
          ...eventDoc.data(),
          status: "inactive",
          creatorDeleted: true,
          accountDeletedAt,
          archivedAt: accountDeletedAt,
          archivedFromEventId: eventDoc.id,
          archiveReason: "creator_account_deleted",
        }, { merge: true });
        batch.delete(eventDoc.ref);
      }
      await batch.commit();
      count += chunk.length;
    }
  } else {
    // Keep events visible until the scheduled expiry process archives them.
    for (let offset = 0; offset < eventsSnap.docs.length; offset += 450) {
      const batch = db.batch();
      const chunk = eventsSnap.docs.slice(offset, offset + 450);
      chunk.forEach(eventDoc => batch.update(eventDoc.ref, {
        creatorDeleted: true,
        accountDeletedAt,
      }));
      await batch.commit();
      count += chunk.length;
    }
  }

  const batch = db.batch();
  batch.delete(db.collection("users").doc(uid));
  batch.delete(db.collection("calendarSubscriptions").doc(uid));
  await batch.commit();
  return { archivedNow: archiveEventsNow ? count : 0, keptUntilExpiry: archiveEventsNow ? 0 : count };
});

// Phone-only login migration support.
// Lets a newly verified phone user find and migrate their old Google/Microsoft
// Firestore profile without exposing the users collection to client queries.
async function findUserByEmailForMigration(email, currentUid) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;

  const candidates = [];
  for (const field of ["emailLower", "email"]) {
    const snap = await db.collection("users").where(field, "==", normalized).limit(3).get();
    snap.docs.forEach(doc => candidates.push(doc));
  }

  const seen = new Set();
  for (const docSnap of candidates) {
    if (seen.has(docSnap.id)) continue;
    seen.add(docSnap.id);
    if (docSnap.id === currentUid) continue;
    const data = docSnap.data() || {};
    if (String(data.email || "").trim().toLowerCase() === normalized) {
      return { id: docSnap.id, data };
    }
  }

  const allUsers = await db.collection("users").get();
  for (const docSnap of allUsers.docs) {
    if (docSnap.id === currentUid) continue;
    const data = docSnap.data() || {};
    if (String(data.email || "").trim().toLowerCase() === normalized) {
      return { id: docSnap.id, data };
    }
  }

  return null;
}

exports.lookupPhoneAccountByEmail = onCall({ region: REGION }, async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

  const match = await findUserByEmailForMigration(request.data?.email, request.auth.uid);
  if (!match) return { found: false };

  const data = match.data;
  return {
    found: true,
    profile: {
      id: match.id,
      fullName: data.fullName || data.displayName || "",
      email: data.email || "",
    },
  };
});

exports.migratePhoneAccountByEmail = onCall({ region: REGION }, async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

  const phoneUid = request.auth.uid;
  const phoneNumber = request.auth.token.phone_number || "";
  const match = await findUserByEmailForMigration(request.data?.email, phoneUid);
  if (!match) throw new HttpsError("not-found", "No existing account found for this email.");

  const oldUid = match.id;
  const oldData = match.data || {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  const migratedProfile = {
    ...oldData,
    email: oldData.email || String(request.data?.email || "").trim().toLowerCase(),
    emailLower: String(oldData.email || request.data?.email || "").trim().toLowerCase(),
    phone: phoneNumber || oldData.phone || "",
    phoneVerified: true,
    migratedFromUid: oldUid,
    migratedAt: now,
    isActive: true,
    updatedAt: now,
  };

  const phoneRef = db.collection("users").doc(phoneUid);
  const oldRef = db.collection("users").doc(oldUid);
  await phoneRef.set(migratedProfile, { merge: true });
  await oldRef.set({
    migratedToUid: phoneUid,
    migratedAt: now,
    isActive: false,
    updatedAt: now,
  }, { merge: true });

  const eventsSnap = await db.collection("events").where("createdByUserId", "==", oldUid).get();
  let batch = db.batch();
  let count = 0;
  for (const eventDoc of eventsSnap.docs) {
    batch.update(eventDoc.ref, {
      createdByUserId: phoneUid,
      createdByUserEmail: migratedProfile.email || "",
      createdByName: migratedProfile.fullName || migratedProfile.email || "",
      migratedFromUid: oldUid,
      updatedAt: now,
    });
    count++;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 450 !== 0) await batch.commit();

  const oldCalRef = db.collection("calendarSubscriptions").doc(oldUid);
  const oldCal = await oldCalRef.get();
  if (oldCal.exists) {
    await db.collection("calendarSubscriptions").doc(phoneUid).set({
      ...oldCal.data(),
      uid: phoneUid,
      migratedFromUid: oldUid,
      updatedAt: now,
    }, { merge: true });
  }

  return {
    migrated: true,
    fromUid: oldUid,
    toUid: phoneUid,
    eventsTransferred: count,
    profile: {
      fullName: migratedProfile.fullName || "",
      email: migratedProfile.email || "",
      role: migratedProfile.role || "user",
      phone: migratedProfile.phone || "",
      isActive: true,
    },
  };
});

// â”€â”€â”€ BULK IMPORT EVENTS (Callable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.bulkImportEvents = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new Error("Unauthenticated");
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== "admin" && role !== "superAdmin") throw new Error("Admins only");

  const { events: rawEvents } = request.data;
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) throw new Error("No events provided");

  // Fetch Hijri adjustment setting
  const hijriSnap  = await db.collection("settings").doc("hijriCalendar").get();
  const hijriAdj   = hijriSnap.exists ? (hijriSnap.data().adjustmentDays || 0) : 0; // legacy
  const hijriOverrides = hijriSnap.exists ? (hijriSnap.data().overrides || []) : [];

  const VALID_TYPES    = ["Majlis", "Milad", "Birthday", "Informal get together", "Custom"];
  const VALID_AUDIENCE = ["Gents only", "Ladies only", "Kids only", "Mixed Audience"];
  const VALID_RECITERS = ["Soz", "Salam", "Manqebat", "Noha", "Reciter", "Peshkhani", "Other"];
  const REQUIRED       = ["hostName","eventDate","startTime","eventType","audienceType","street","suburb","state","postcode"];

  const created = []; const errors = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const row = rawEvents[i]; const rowErrors = [];

    // Convert time values
    const startTime = excelTimeToHHMM(row.startTime);
    const endTime   = excelTimeToHHMM(row.endTime);

    // Resolve the event date â€” convert Hijri BEFORE validation so required check works
    let resolvedDate = '';
    if (row.enteredAsHijri && row.hijriDay && row.hijriMonth && row.hijriYear) {
      const converted = hijriToGregorianServer(
        Number(row.hijriDay), Number(row.hijriMonth), Number(row.hijriYear), hijriOverrides
      );
      console.log(`Hijri conversion: ${row.hijriDay}/${row.hijriMonth}/${row.hijriYear} + adj ${hijriAdj} â†’ ${converted}`);
      if (converted) {
        resolvedDate = converted;
      } else {
        rowErrors.push(`Cannot convert Hijri date ${row.hijriDay}/${row.hijriMonth}/${row.hijriYear} â€” check day, month and year are correct`);
        errors.push({ row: i + 1, errors: rowErrors });
        continue;
      }
    } else {
      resolvedDate = excelDateToYYYYMMDD(row.eventDate);
    }

    // Validation â€” use resolvedDate so Hijri dates pass the required check
    const REQUIRED_CHECK = ["hostName","startTime","eventType","audienceType","street","suburb","state","postcode"];
    REQUIRED_CHECK.forEach(f => {
      const val = f === 'startTime' ? startTime : row[f];
      if (!val?.toString().trim()) rowErrors.push(`${f} is required`);
    });
    if (!resolvedDate) rowErrors.push("eventDate is required â€” check day, month and year are all filled");
    if (resolvedDate && !/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) rowErrors.push("eventDate could not be resolved to a valid date");
    if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) rowErrors.push("startTime is invalid â€” use HHMM format e.g. 1930");
    if (row.eventType && !VALID_TYPES.includes(row.eventType)) rowErrors.push(`eventType must be one of: ${VALID_TYPES.join(", ")}`);
    if (row.audienceType && !VALID_AUDIENCE.includes(row.audienceType)) rowErrors.push(`audienceType must be one of: ${VALID_AUDIENCE.join(", ")}`);
    if (rowErrors.length > 0) { errors.push({ row: i + 1, errors: rowErrors }); continue; }

    const reciters = [];
    for (let r = 1; r <= 3; r++) {
      const rType = row[`reciter${r}Type`]?.toString().trim();
      const rName = row[`reciter${r}Name`]?.toString().trim();
      if (rName && rType) reciters.push({ type: VALID_RECITERS.includes(rType) ? rType : "Other", name: rName });
    }

    const isReligious = ["Majlis","Milad","Custom"].includes(row.eventType);
    const organiserType = row.organiserType?.toString().trim().toLowerCase() === "centre" ? "centre" : "private";
    // For Hijri input: build display string directly from components (exact)
    // For Gregorian input: compute from resolved date using adjustment
    const HIJRI_MONTH_NAMES = [
      "Muharram","Safar","Rabi al-Awwal","Rabi al-Thani",
      "Jumada al-Awwal","Jumada al-Thani","Rajab","Sha'ban",
      "Ramadan","Shawwal","Dhu al-Qi'dah","Dhu al-Hijjah"
    ];
    const hijriDate = row.enteredAsHijri && row.hijriDay && row.hijriMonth && row.hijriYear
      ? `${row.hijriDay} ${HIJRI_MONTH_NAMES[Number(row.hijriMonth) - 1] || ''} ${row.hijriYear} AH`
      : computeHijriDate(resolvedDate, hijriOverrides);
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
      hijriDate,   // display string e.g. "10 Muharram 1448 AH"
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

// â”€â”€â”€ MANUAL REMINDER TRIGGER (Callable â€” Admin only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM });
    if (!transporter) {
      throw new Error("Email is not configured. Please set SMTP_HOST, SMTP_USER and SMTP_PASS secrets.");
    }

    const { mode, date, from, to, month, customMode = false, customMessage = '', customTemplate = '' } = request.data || {};
    const todaySyd = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

    // Build Firestore query based on mode
    let eventsQuery = db.collection("events").where("status", "==", "active").where("hidden", "!=", true);
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

    // Community updates and fixed announcement templates contain no event
    // table, so they must not depend on event query indexes.
    const eventsSnap = customMode
      ? { empty: true, docs: [], size: 0 }
      : await eventsQuery.get();

    // For custom messages, we don't need events â€” send to all users regardless
    if (eventsSnap.empty && !customMode) {
      return { sent: 0, message: `No events found for ${label}. No emails sent.` };
    }

    const eventSections = customMode
      ? ""
      : buildGroupedEmailEventTables(eventsSnap.docs.map(d => d.data()));

    const sentBy = userDoc.data()?.fullName || userDoc.data()?.email || "Admin";

    const html = `<div style="font-family:sans-serif;max-width:700px">
      <div style="background:linear-gradient(135deg,#0f766e,#0b5d57);padding:24px;border-radius:16px 16px 0 0">
        <h2 style="color:white;margin:0">Community Events</h2>
        <p style="color:#e0f2fe;margin:4px 0 0">Events for ${label}</p>
      </div>
      <div style="padding:18px;background:#ffffff">${eventSections}</div>
      <p style="color:#6b7280;font-size:12px;padding:16px">
        This reminder was manually sent by ${sentBy}.<br>
        To opt out of reminders: Profile -> Toggle Email Reminder off.
      </p></div>`;

    // Get all users with reminders enabled (don't filter by isActive â€” field may not exist)
    const usersSnap = await db.collection("users")
      .where("reminderEmailEnabled", "==", true)
      .get();

    let sent = 0;
    const errors = [];
    for (const doc of usersSnap.docs) {
      const u = doc.data();
      if (u.isActive === false || u.migratedToUid) continue;
      if (!u.email) continue;
      try {
        await transporter.sendMail({
          from: EMAIL_FROM.value() || SMTP_USER.value(),
          to: u.email,
          subject: customMode
            ? (customTemplate === 'storeAnnouncement'
                ? 'Community Events Australia is now on Google Play, the App Store and Microsoft Store'
                : 'Important Update from Community Events')
            : `Community Events - Events for ${label}`,
          html: customMode && customTemplate === 'storeAnnouncement'
            ? buildStoreAnnouncementEmail() + unsubscribeFooter(doc.id)
            : customMode
            ? `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <div style="background:#0f766e;padding:20px;border-radius:8px 8px 0 0">
                  <h2 style="color:white;margin:0">Community Update</h2>
                </div>
                <div style="padding:20px;background:#f9fafb;border-radius:0 0 8px 8px">
                  <p style="white-space:pre-wrap;font-size:15px;line-height:1.6;color:#1f2937">${escapeHtml(customMessage)}</p>
                </div>
                ${unsubscribeFooter(doc.id)}
              </div>`
            : html + unsubscribeFooter(doc.id)
        });
        sent++;
      } catch (e) {
        console.error('[Manual Email] SMTP send failed:', e.message);
        errors.push(u.email);
      }
    }

    return {
      sent,
      failed: errors.length,
      events: eventsSnap.size,
      message: customMode
        ? `Sent to ${sent} user(s)${errors.length ? ` Â· ${errors.length} failed` : ''}.`
        : `Sent to ${sent} user(s) Â· ${eventsSnap.size} event(s) included${errors.length ? ` Â· ${errors.length} failed` : ''}.`
    };
  }
);

// â”€â”€â”€ RECALCULATE HIJRI EVENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Called from Admin Dashboard when Hijri adjustment is saved.
// Updates eventDate (Gregorian) for all events entered as Hijri dates.
exports.recalculateHijriEvents = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const role = userDoc.data()?.role;
    if (role !== "admin" && role !== "superAdmin") throw new HttpsError("permission-denied", "Admin access required.");

    const { adjustmentDays } = request.data;

    // Always read overrides directly from Firestore â€” most up to date
    const settingsSnap = await db.collection("settings").doc("hijriCalendar").get();
    const newOverrides = settingsSnap.exists ? (settingsSnap.data().overrides || []) : [];
    console.log(`recalculate: using ${newOverrides.length} overrides from Firestore`);

    // Fetch ALL events regardless of status
    const allSnap = await db.collection("events").get();

    console.log(`recalculate: processing ${allSnap.size} total events with ${newOverrides.length} overrides`);

    if (allSnap.empty) return { updated: 0 };

    let batch        = db.batch();
    let countHijri   = 0;  // Hijri-entered: eventDate + hijriDate updated
    let countGreg    = 0;  // Gregorian-entered: hijriDate tag only updated

    for (const doc of allSnap.docs) {
      const e = doc.data();
      const { hijriDay, hijriMonth, hijriYear, eventDate, enteredAsHijri } = e;
      const isHijriEntered = enteredAsHijri === true && !!(hijriDay && hijriMonth && hijriYear);

      if (isHijriEntered) {
        // â”€â”€ Hijri-entered event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Recompute Gregorian eventDate from stored Hijri components
        const newGreg = hijriToGregorianServer(hijriDay, hijriMonth, hijriYear, newOverrides || []);
        if (!newGreg) continue;

        // Build hijriDate display from original components (exact â€” never changes)
        const HIJRI_MN = ["Muharram","Safar","Rabi al-Awwal","Rabi al-Thani",
          "Jumada al-Awwal","Jumada al-Thani","Rajab","Sha'ban",
          "Ramadan","Shawwal","Dhu al-Qi'dah","Dhu al-Hijjah"];
        const hijriDate = `${hijriDay} ${HIJRI_MN[hijriMonth - 1]} ${hijriYear} AH`;

        batch.update(doc.ref, {
          eventDate: newGreg,
          hijriDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        countHijri++;

      } else if (eventDate) {
        // â”€â”€ Gregorian-entered event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // eventDate is fixed â€” only update the hijriDate display tag
        const newHijriDate = computeHijriDate(eventDate, newOverrides || []);
        if (!newHijriDate) continue;

        batch.update(doc.ref, {
          hijriDate: newHijriDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        countGreg++;
      }

      if ((countHijri + countGreg) % 450 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }

    await batch.commit();
    console.log(`Recalculated: ${countHijri} Hijri-entered (date+tag), ${countGreg} Gregorian-entered (tag only), overrides=${newOverrides.length}`);
    return {
      updated:       countHijri + countGreg,
      hijriEvents:   countHijri,
      gregEvents:    countGreg,
      overridesUsed: newOverrides.length,
      totalEvents:   allSnap.size
    };
  }
);

// Server-side Hijri â†’ Gregorian conversion
function hijriToGregorianServer(hDay, hMonth, hYear, overrides) {
  // Uses JDN algorithm â€” same as SIZA Calendar Religiously
  try {
    const g = hijriToGreg(hYear, hMonth, hDay, overrides || []);
    return `${g.year}-${String(g.month).padStart(2,"0")}-${String(g.day).padStart(2,"0")}`;
  } catch { return null; }
}

// â”€â”€â”€ ADMIN DELETE USER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Allows Super Admins to delete another user's account and all their data.
// Different from deleteUserData (which is self-deletion) â€” this is admin-initiated.
exports.adminDeleteUser = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");

    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    // Admins and super admins can delete users
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRole = callerDoc.data()?.role;
    if (callerRole !== "admin" && callerRole !== "superAdmin") {
      throw new HttpsError("permission-denied", "Admin access required to delete users.");
    }

    const { targetUid, ban = false } = request.data;
    if (!targetUid) throw new HttpsError("invalid-argument", "Missing targetUid.");
    if (targetUid === request.auth.uid) {
      throw new HttpsError("invalid-argument", "You cannot delete your own account this way. Use Profile â†’ Delete Account instead.");
    }

    // Safety check â€” cannot delete the last super admin
    const targetDoc = await db.collection("users").doc(targetUid).get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "User not found in database.");
    }
    const targetData = targetDoc.data() || {};
    if (targetData.role === "superAdmin") {
      const saSnap = await db.collection("users")
        .where("role", "==", "superAdmin")
        .where("isActive", "==", true)
        .get();
      if (saSnap.size <= 1) {
        throw new HttpsError("failed-precondition", "Cannot delete the only Super Admin. Assign another Super Admin first.");
      }
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

    // If banned â€” store full profile in bannedUsers so unban can restore it
    if (ban && targetData.email) {
      batch.set(db.collection("bannedUsers").doc(targetData.email.toLowerCase().replace(/\./g,'_')), {
        email:     targetData.email.toLowerCase(),
        bannedAt:  admin.firestore.FieldValue.serverTimestamp(),
        bannedBy:  request.auth.uid,
        reason:    "Admin deletion with ban",
        fullName:  targetData.fullName || "",
        uid:       targetUid,
        role:      targetData.role    || "user",   // preserve original role
        phone:     targetData.phone   || "",
        phoneVerified: targetData.phoneVerified || false,
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

// â”€â”€â”€ TRANSFER EVENT OWNERSHIP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.transferEventOwnership = onCall({ region: REGION }, async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  const callerDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = callerDoc.data()?.role || "user";
  if (!["admin","superAdmin"].includes(role))
    throw new HttpsError("permission-denied", "Admin access required.");
  const { fromUid, toUid } = request.data;
  if (!fromUid || !toUid) throw new HttpsError("invalid-argument", "fromUid and toUid required.");
  const toDoc = await db.collection("users").doc(toUid).get();
  if (!toDoc.exists) throw new HttpsError("not-found", "Target user not found.");
  const toData = toDoc.data();
  const snap = await db.collection("events").where("createdByUserId","==",fromUid).get();
  let batch = db.batch(); let count = 0;
  for (const doc of snap.docs) {
    batch.update(doc.ref, {
      createdByUserId: toUid,
      createdByName:   toData.fullName || toData.email || "",
      updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
    });
    count++;
    if (count % 450 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (count % 450 !== 0) await batch.commit();
  return { transferred: count };
});
exports.adminUnbanUser = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    // Verify caller is admin
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const role = callerDoc.data()?.role;
    if (role !== "admin" && role !== "superAdmin")
      throw new HttpsError("permission-denied", "Admin access required.");

    const { bannedDocId, uid, email, fullName } = request.data;
    if (!bannedDocId) throw new HttpsError("invalid-argument", "Missing bannedDocId.");

    // Remove ban document
    await db.collection("bannedUsers").doc(bannedDocId).delete();

    // Restore user profile â€” use all data saved at ban time
    if (uid) {
      const userRef  = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        const { role, phone, phoneVerified } = request.data;
        await userRef.set({
          uid:           uid,
          email:         email         || "",
          fullName:      fullName      || "",
          role:          role          || "user",  // restore original role
          phone:         phone         || "",
          phoneVerified: phoneVerified || false,
          createdAt:     admin.firestore.FieldValue.serverTimestamp(),
          updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Profile exists but may have wrong role â€” restore original
        const { role } = request.data;
        if (role && userSnap.data().role !== role) {
          await userRef.update({ role, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      }
    }

    console.log(`User unbanned: ${email} by ${request.auth.uid}`);
    return { success: true };
  }
);

// â”€â”€â”€ EMAIL HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const APP_URL = 'https://communityevents.siza.info';
const APP_OPEN_URL = 'https://communityevents.siza.info/app';

// Email the support inbox whenever a user reports an AI-generated response.
exports.onAiReportCreated = onDocumentCreated(
  { document: 'ai_reports/{reportId}', region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (event) => {
    const report = event.data?.data();
    const reportId = event.params.reportId;
    if (!report) return;

    // Eventarc delivery is at-least-once. Skip a retry after successful mail.
    if (report.emailNotificationSentAt) return;

    const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
    if (!transporter) {
      console.error(`[AI Report] SMTP is not configured for report ${reportId}`);
      return;
    }

    const createdAt = report.createdAt?.toDate?.() || new Date();
    const createdLabel = createdAt.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const consoleUrl = `https://console.firebase.google.com/project/community-event-8b639/firestore/databases/-default-/data/~2Fai_reports~2F${encodeURIComponent(reportId)}`;

    await transporter.sendMail({
      from: EMAIL_FROM.value() || SMTP_USER.value(),
      to: 'communityeventssydney@gmail.com',
      subject: `[AI Response Report] ${String(report.reason || 'Review required').slice(0, 120)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937">
          <div style="background:#b91c1c;padding:18px 20px;border-radius:8px 8px 0 0">
            <h2 style="color:white;margin:0;font-size:20px">AI Response Report</h2>
          </div>
          <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-top:0">
            <p><strong>Reason:</strong> ${escapeHtml(report.reason || 'Not provided')}</p>
            <p><strong>Comments:</strong></p>
            <div style="white-space:pre-wrap;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px">${escapeHtml(report.comments || 'No additional comments')}</div>
            <p><strong>User:</strong> ${escapeHtml(report.userEmail || report.userId || 'Guest')}</p>
            <p><strong>Role:</strong> ${escapeHtml(report.userRole || 'Unknown')}</p>
            <p><strong>Reported:</strong> ${escapeHtml(createdLabel)}</p>
            <p><strong>App version:</strong> ${escapeHtml(report.appVersion || 'Unknown')}</p>
            <p><strong>User prompt:</strong></p>
            <div style="white-space:pre-wrap;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px">${escapeHtml(report.prompt || 'Not recorded')}</div>
            <p><strong>AI response:</strong></p>
            <div style="white-space:pre-wrap;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px">${escapeHtml(report.aiResponse || 'Not recorded')}</div>
            <p style="margin-top:20px"><a href="${consoleUrl}" style="color:#b91c1c;font-weight:bold">Open report in Firebase Console</a></p>
          </div>
        </div>`,
    });

    await event.data.ref.update({
      emailNotificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
      emailNotificationRecipient: 'communityeventssydney@gmail.com',
    });
    console.log(`[AI Report] Notification sent for ${reportId}`);
  }
);

function buildStoreAnnouncementEmail() {
  const microsoftUrl = 'https://apps.microsoft.com/detail/9NDGJZHL86KJ';
  const appleUrl = 'https://apps.apple.com/au/app/community-events-australia/id6782770347';
  const googlePlayUrl = 'https://play.google.com/store/apps/details?id=info.siza.communityevents.app';
  return `
    <div style="margin:0 auto;max-width:620px;background:#ffffff;border:1px solid #dce7e5;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#17202a">
      <div style="padding:32px 24px 20px;text-align:center">
        <img src="https://communityevents.siza.info/icons/icon-192.png" width="112" height="112" alt="Community Events Australia" style="display:block;width:112px;height:112px;margin:0 auto;border:0;object-fit:contain">
        <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.2;color:#1a1a2e">Community Events Australia</h1>
        <p style="margin:0;color:#c9362a;font-size:19px;font-weight:bold">Now available on Google Play, the App Store and Microsoft Store</p>
      </div>
      <div style="padding:0 28px 22px;text-align:center;color:#46545d;font-size:15px;line-height:1.6">
        Download for Android through Google Play, for iPhone and iPad through the Apple App Store, or for Windows PC through the Microsoft Store.
      </div>
      <div style="padding:0 24px 28px;text-align:center">
        <a href="${appleUrl}" style="display:block;max-width:390px;margin:8px auto;text-decoration:none;border:2px solid #16a34a;border-radius:9px;background:#fff;padding:11px 14px;color:#111827;text-align:left">
          <img src="https://cdn.simpleicons.org/apple/000000" width="38" height="38" alt="" style="display:inline-block;vertical-align:middle;margin-right:14px;border:0">
          <span style="display:inline-block;vertical-align:middle"><strong style="display:block;font-size:20px;line-height:1.15">App Store</strong><small style="display:block;margin-top:3px;font-size:12px;color:#374151">Download for iPhone &amp; iPad</small></span>
          <span style="float:right;margin-top:8px;background:#16a34a;color:#fff;border-radius:50%;width:28px;height:28px;line-height:28px;text-align:center;font-size:18px;font-weight:bold">&#10003;</span>
        </a>
        <a href="${googlePlayUrl}" style="display:block;max-width:390px;margin:8px auto;text-decoration:none;border:2px solid #16a34a;border-radius:9px;background:#fff;padding:11px 14px;color:#111827;text-align:left">
          <img src="https://www.gstatic.com/android/market_images/web/play_prism_hlock_2x.png" width="48" height="38" alt="" style="display:inline-block;vertical-align:middle;margin-right:8px;border:0;object-fit:contain">
          <span style="display:inline-block;vertical-align:middle"><strong style="display:block;font-size:20px;line-height:1.15">Google Play</strong><small style="display:block;margin-top:3px;font-size:12px;color:#374151">Download for Android</small></span>
          <span style="float:right;margin-top:8px;background:#16a34a;color:#fff;border-radius:50%;width:28px;height:28px;line-height:28px;text-align:center;font-size:18px;font-weight:bold">&#10003;</span>
        </a>
        <a href="${microsoftUrl}" style="display:block;max-width:390px;margin:8px auto;text-decoration:none;border:2px solid #16a34a;border-radius:9px;background:#fff;padding:11px 14px;color:#111827;text-align:left">
          <span style="display:inline-block;vertical-align:middle;width:42px;margin-right:10px;font-size:0;line-height:0"><i style="display:inline-block;width:18px;height:18px;background:#f25022;margin:1px"></i><i style="display:inline-block;width:18px;height:18px;background:#7fba00;margin:1px"></i><i style="display:inline-block;width:18px;height:18px;background:#00a4ef;margin:1px"></i><i style="display:inline-block;width:18px;height:18px;background:#ffb900;margin:1px"></i></span>
          <span style="display:inline-block;vertical-align:middle"><strong style="display:block;font-size:20px;line-height:1.15">Microsoft Store</strong><small style="display:block;margin-top:3px;font-size:12px;color:#374151">Download for Windows PC</small></span>
          <span style="float:right;margin-top:8px;background:#16a34a;color:#fff;border-radius:50%;width:28px;height:28px;line-height:28px;text-align:center;font-size:18px;font-weight:bold">&#10003;</span>
        </a>
      </div>
      <div style="padding:4px 24px 28px;text-align:center;color:#46545d;font-size:14px">
        You can also use the web app on any device:<br>
        <a href="https://communityevents.siza.info" style="color:#087f72;font-size:16px;font-weight:bold">communityevents.siza.info</a>
      </div>
      <div style="background:#064e46;padding:18px 24px;text-align:center;color:#ffffff;font-size:14px;font-weight:bold">
        Discover, share and manage community events across Australia
      </div>
    </div>`;
}

// Unsubscribe footer added to every user-facing email
function unsubscribeFooter(uid = '') {
  const fnUrl = 'https://australia-southeast1-community-event-8b639.cloudfunctions.net/unsubscribeEmail';
  const unsubUrl = uid
    ? `${fnUrl}?uid=${uid}`
    : APP_URL;
  return `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="font-size:11px;color:#9ca3af;line-height:1.6;margin:0">
        You are receiving this email because you registered with Community Events Australia.<br/>
        <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe from reminder emails</a>
        &nbsp;Â·&nbsp;
        <a href="${APP_OPEN_URL}" style="color:#6b7280;text-decoration:underline">Open App</a>
        &nbsp;Â·&nbsp;
        <a href="mailto:communityeventssydney@gmail.com" style="color:#6b7280;text-decoration:underline">Contact Us</a>
      </p>
    </div>`;
}

// â”€â”€â”€ SUPER ADMIN NOTIFICATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function notifySuperAdmin(subject, bodyHtml, secrets) {
  try {
    // Fetch ALL superAdmin AND admin emails dynamically
    const superAdminsSnap = await db.collection('users')
      .where('role', 'in', ['superAdmin', 'admin']).get();

    const adminProfiles = superAdminsSnap.docs
      .map(docSnap => docSnap.data() || {})
      .filter(profile => profile.isActive !== false && !profile.migratedToUid);

    // Aggregate by email so an explicit unsubscribe wins even if historical
    // duplicate profiles still exist for the same administrator address.
    const preferenceByEmail = new Map();
    for (const profile of adminProfiles) {
      const email = String(profile.email || '').trim().toLowerCase();
      if (!email.includes('@')) continue;
      const enabled = profile.adminAlertEmailEnabled !== false;
      preferenceByEmail.set(email, (preferenceByEmail.get(email) ?? true) && enabled);
    }
    const emails = [...preferenceByEmail.entries()]
      .filter(([, enabled]) => enabled)
      .map(([email]) => email);

    if (emails.length === 0) return;

    const transporter = buildTransporter(secrets);
    await transporter.sendMail({
      from: secrets.EMAIL_FROM.value() || secrets.SMTP_USER.value(),
      to:   emails.join(', '),
      subject,
      html: bodyHtml,
    });
    console.log(`Admin notification sent to ${emails.length} opted-in administrators:`, emails);
  } catch (e) {
    console.warn('notifySuperAdmin failed:', e.message);
  }
}

// Event created notification
exports.onEventCreated = onDocumentCreated(
  { document: 'events/{eventId}', region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (event) => {
    const data     = event.data?.data();
    const eventId  = event.params.eventId;
    if (!data || data.status !== 'active') return;

    await notifySuperAdmin(
      `ðŸ“… New event added: ${data.eventType} â€” ${data.hostName}`,
      `<div style="font-family:Arial,sans-serif;max-width:500px">
        <div style="background:#0f766e;padding:16px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0">New Event Added</h2>
        </div>
        <div style="padding:16px;background:#f9fafb;border-radius:0 0 8px 8px">
          <p><strong>Type:</strong> ${data.eventType}</p>
          <p><strong>Host:</strong> ${data.hostName}</p>
          <p><strong>Date:</strong> ${data.eventDate} at ${data.startTime}</p>
          <p><strong>Suburb:</strong> ${data.address?.suburb || 'N/A'}</p>
          <p><strong>Organiser:</strong> ${data.organiserType}</p>
          ${data.hijriDate ? `<p><strong>Hijri date:</strong> ${data.hijriDate}</p>` : ''}
          <p><strong>Added by:</strong> ${data.createdByName || data.createdByUserId}</p>
        </div>
      </div>`,
      { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM }
    );
  }
);

// Event deleted notification
exports.onEventDeleted = onDocumentDeleted(
  { document: 'events/{eventId}', region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (event) => {
    const data    = event.data?.data();
    if (!data) return;

    // Scheduled expiry moves the document atomically to archivedEvents. That
    // is not a user deletion and must not generate a deletion alert.
    const archived = await db.collection('archivedEvents').doc(event.params.eventId).get();
    if (archived.exists && archived.data()?.archiveReason === 'event_date_expired') return;

    await notifySuperAdmin(
      `ðŸ—‘ Event deleted: ${data.eventType} â€” ${data.hostName}`,
      `<div style="font-family:Arial,sans-serif;max-width:500px">
        <div style="background:#dc2626;padding:16px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0">Event Deleted</h2>
        </div>
        <div style="padding:16px;background:#f9fafb;border-radius:0 0 8px 8px">
          <p><strong>Type:</strong> ${data.eventType}</p>
          <p><strong>Host:</strong> ${data.hostName}</p>
          <p><strong>Date:</strong> ${data.eventDate}</p>
          <p><strong>Suburb:</strong> ${data.address?.suburb || 'N/A'}</p>
          <p><strong>Originally added by:</strong> ${data.createdByName || data.createdByUserId}</p>
        </div>
      </div>`,
      { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM }
    );
  }
);

// New user signup notification
exports.onUserCreated = onDocumentCreated(
  { document: 'users/{uid}', region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (event) => {
    const uid = event.params.uid;

    // Wait 3 seconds â€” phone users get their email/name saved in a
    // subsequent updateDoc call right after the initial setDoc.
    // This ensures the trigger reads the fully populated document.
    await new Promise(r => setTimeout(r, 3000));

    // Re-read the document to get the latest data including email/name
    const freshSnap = await db.collection('users').doc(uid).get();
    const data = freshSnap.exists ? freshSnap.data() : event.data?.data();
    if (!data) return;

    await notifySuperAdmin(
      `ðŸ‘¤ New user registered: ${data.fullName || 'Unknown'}`,
      `<div style="font-family:Arial,sans-serif;max-width:500px">
        <div style="background:#0f766e;padding:16px;border-radius:8px 8px 0 0">
          <h2 style="color:white;margin:0">New User Registered</h2>
        </div>
        <div style="padding:16px;background:#f9fafb;border-radius:0 0 8px 8px">
          <p><strong>Name:</strong> ${data.fullName || 'Not provided'}</p>
          <p><strong>Email:</strong> ${data.email || 'Not provided'}</p>
          <p><strong>Phone:</strong> ${data.phone || 'Not provided'}</p>
          <p><strong>Role:</strong> ${data.role}</p>
          <p><strong>Registered:</strong> ${new Date().toLocaleString('en-AU', {timeZone:'Australia/Sydney'})}</p>
        </div>
      </div>`,
      { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM }
    );
  }
);

// â”€â”€â”€ UNSUBSCRIBE EMAIL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.unsubscribeEmail = onRequest(
  { region: REGION },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const uid = req.query.uid;

    // Show confirmation page if no action yet (GET with uid)
    // Handle empty uid from old buggy emails
    if (req.method === 'GET' && !uid) {
      res.set('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Unsubscribe - Community Events</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #f0f9f7; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 20px; padding: 36px 28px;
      max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.08);
      text-align: center; }
    h1 { font-size: 20px; color: #1f2937; margin: 14px 0 10px; }
    p  { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 16px; }
    a.btn { display: block; padding: 12px; border-radius: 12px; font-size: 14px;
      font-weight: 600; text-decoration: none; margin-bottom: 10px; }
    .btn-teal { background: #0f766e; color: white; }
    .btn-grey { background: #f3f4f6; color: #374151; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:44px">ðŸ”•</div>
    <h1>Unsubscribe from Reminders</h1>
    <p>This link has expired. To unsubscribe, please open the app and turn off reminders in your Profile, or email us and we'll remove you manually.</p>
    <a class="btn btn-teal" href="https://communityevents.siza.info">Open App â†’ Profile â†’ Settings</a>
    <a class="btn btn-grey" href="mailto:communityeventssydney@gmail.com?subject=Unsubscribe%20Request">Email Us to Unsubscribe</a>
  </div>
</body>
</html>`);
      return;
    }

    if (req.method === 'GET' && uid && !req.query.confirm) {
      res.set('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Unsubscribe - Community Events</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #f0f9f7; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 20px; padding: 36px 28px;
      max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.08);
      text-align: center; }
    h1 { font-size: 21px; color: #1f2937; margin: 16px 0 10px; }
    p  { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 20px; }
    .btn { display: block; width: 100%; padding: 13px; border-radius: 12px;
      font-size: 15px; font-weight: 600; cursor: pointer; border: none;
      margin-bottom: 10px; text-decoration: none; }
    .btn-red  { background: #dc2626; color: white; }
    .btn-grey { background: #f3f4f6; color: #374151; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px">ðŸ”•</div>
    <h1>Unsubscribe from Reminders</h1>
    <p>You will no longer receive event reminder emails from Community Events Australia. You can re-enable reminders anytime from your profile in the app.</p>
    <a class="btn btn-red" href="?uid=${uid}&confirm=1">Yes, Unsubscribe Me</a>
    <a class="btn btn-grey" href="https://communityevents.siza.info">â† Back to App</a>
  </div>
</body>
</html>`);
      return;
    }

    // Process unsubscribe (GET with confirm=1)
    if (!uid) {
      res.set('Content-Type', 'text/html');
      res.status(400).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>âŒ Invalid unsubscribe link</h2>
        <p>Please contact <a href="mailto:communityeventssydney@gmail.com">communityeventssydney@gmail.com</a></p>
      </body></html>`);
      return;
    }

    try {
      await db.collection('users').doc(uid).update({
        reminderEmailEnabled: false,
        unsubscribedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.set('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Unsubscribed - Community Events</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #f0f9f7; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 20px; padding: 36px 28px;
      max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.08);
      text-align: center; }
    h1 { font-size: 21px; color: #1f2937; margin: 16px 0 10px; }
    p  { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 20px; }
    a  { display: block; width: 100%; padding: 13px; border-radius: 12px;
      font-size: 15px; font-weight: 600; background: #0f766e; color: white;
      text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px">âœ…</div>
    <h1>You've been unsubscribed</h1>
    <p>You will no longer receive reminder emails. You can re-enable reminders anytime from your Profile in the app.</p>
    <a href="https://communityevents.siza.info">â† Back to App</a>
  </div>
</body>
</html>`);
    } catch (e) {
      console.error('Unsubscribe error:', e.message);
      res.set('Content-Type', 'text/html');
      res.status(500).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>âŒ Something went wrong</h2>
        <p>Please contact <a href="mailto:communityeventssydney@gmail.com">communityeventssydney@gmail.com</a></p>
      </body></html>`);
    }
  }
);

// â”€â”€â”€ SEND LIVE NOTIFICATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.notifyEventLive = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new Error('Unauthenticated');
  const { eventId, eventTitle, hostName } = request.data || {};
  if (!eventId || !eventTitle) throw new Error('Missing eventId or eventTitle');

  // Get all user FCM tokens
  const usersSnap = await db.collection('users').get();
  const tokens = [];
  usersSnap.forEach(doc => {
    const u = doc.data();
    if (u.fcmTokens && Array.isArray(u.fcmTokens)) {
      tokens.push(...u.fcmTokens.filter(Boolean));
    }
  });

  if (tokens.length === 0) return { sent: 0 };

  // Send FCM push to all tokens in batches of 500
  const { getMessaging } = require('firebase-admin/messaging');
  const messaging = getMessaging();
  const batches = [];
  for (let i = 0; i < tokens.length; i += 500) {
    batches.push(tokens.slice(i, i + 500));
  }

  let sent = 0;
  for (const batch of batches) {
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: 'ðŸ”´ Event is Live Now!',
          body: `${eventTitle} by ${hostName} is streaming live. Tap to watch!`,
        },
        data: { eventId, type: 'live' },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
      sent += res.successCount;
    } catch (e) {
      console.error('FCM batch error:', e.message);
    }
  }

  return { sent };
});

// â”€â”€â”€ GUEST EVENT EDIT â€” OTP SEND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.sendEditOtp = onCall(
  { region: REGION, secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    const { eventId, contact } = request.data;
    if (!eventId || !contact) throw new HttpsError("invalid-argument", "Missing eventId or contact.");

    // Fetch event
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) throw new HttpsError("not-found", "Event not found.");
    const e = eventDoc.data();

    // Normalize inputs for flexible matching
    const normalize = s => String(s || '').replace(/[\s\-().+]/g, '').toLowerCase()
      .replace(/^61(\d{9})$/, '0$1');
    const inputNorm = normalize(contact);

    // Fields to match against
    const candidates = [
      e.hostPhone,
      e.hostContactOptional,
      e.createdByUserEmail
    ].filter(Boolean).map(normalize);

    const matched = candidates.some(c => c === inputNorm);
    if (!matched) {
      throw new HttpsError("not-found",
        "No match found. Please enter the exact phone number or email stored on this event."
      );
    }

    // Generate 6-digit OTP
    const otp   = Math.floor(100000 + Math.random() * 900000).toString();
    const token = require("crypto").randomBytes(32).toString("hex");
    const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP in Firestore
    await db.collection("editOtps").doc(token).set({
      eventId, otp, expiry, contact: inputNorm,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Determine if contact is email or phone
    const isEmail = contact.includes('@');

    if (isEmail) {
      // Send via email
      const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
      await transporter.sendMail({
        from: EMAIL_FROM.value() || SMTP_USER.value(),
        to:   contact.trim(),
        subject: "Community Events - Your edit verification code",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
            <div style="background:#0f766e;padding:20px;text-align:center;border-radius:8px 8px 0 0">
              <h2 style="color:white;margin:0">Event Edit Verification</h2>
            </div>
            <div style="padding:24px;background:#f9fafb;border-radius:0 0 8px 8px">
              <p>Your verification code to edit your event:</p>
              <div style="font-size:36px;font-weight:900;text-align:center;
                color:#0f766e;letter-spacing:8px;padding:16px;
                background:white;border-radius:8px;border:2px solid #0f766e;margin:16px 0">
                ${otp}
              </div>
              <p style="color:#6b7280;font-size:13px">
                This code expires in 10 minutes. If you did not request this, ignore this email.
              </p>
            </div>
          </div>`
      });
    } else {
      // For phone: store OTP and return a message
      // Full SMS would need Twilio â€” for now we return the OTP in the response
      // with a note (or you can add Twilio later)
      // For community use, we can show it on screen or send via email fallback
      console.log(`OTP for ${contact}: ${otp}`); // visible in logs for admin debugging
      // Return token â€” client will show "check your email" or admin can see in logs
    }

    return { token, method: isEmail ? 'email' : 'sms' };
  }
);

// â”€â”€â”€ GUEST EVENT EDIT â€” OTP VERIFY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.verifyEditOtp = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    const { token, otp, eventId } = request.data;
    if (!token || !otp || !eventId) throw new HttpsError("invalid-argument", "Missing fields.");

    const otpDoc = await db.collection("editOtps").doc(token).get();
    if (!otpDoc.exists) throw new HttpsError("not-found", "Invalid or expired verification code.");

    const data = otpDoc.data();

    // Check expiry
    if (Date.now() > data.expiry) {
      await otpDoc.ref.delete();
      throw new HttpsError("deadline-exceeded", "Verification code has expired. Please request a new one.");
    }

    // Check OTP matches
    if (data.otp !== otp.trim()) {
      throw new HttpsError("invalid-argument", "Incorrect verification code. Please try again.");
    }

    // Check eventId matches
    if (data.eventId !== eventId) {
      throw new HttpsError("invalid-argument", "Verification code does not match this event.");
    }

    // Grant edit session â€” store in Firestore with 30min expiry
    const sessionToken = require("crypto").randomBytes(32).toString("hex");
    await db.collection("editSessions").doc(sessionToken).set({
      eventId,
      contact: data.contact,
      expiry:  Date.now() + 30 * 60 * 1000,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Clean up OTP
    await otpDoc.ref.delete();

    return { sessionToken };
  }
);

// â”€â”€â”€ YOUTUBE OAUTH2 FLOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const YT_REDIRECT_URI = "https://australia-southeast1-community-event-8b639.cloudfunctions.net/youtubeOAuthCallback";
const YT_SCOPES       = "https://www.googleapis.com/auth/youtube";

// Step 1 â€” Generate OAuth URL for admin to visit once
exports.youtubeOAuthUrl = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID] },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const clientId = YOUTUBE_CLIENT_ID.value();
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(YT_REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(YT_SCOPES)}` +
      `&access_type=offline` +
      `&prompt=consent`;

    return { url };
  }
);

// Step 2 â€” Handle OAuth callback, exchange code for tokens, store in Firestore
exports.youtubeOAuthCallback = onRequest(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (req, res) => {
    console.log("[YouTube OAuth] Callback hit. Query params:", JSON.stringify(req.query));
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
      console.error("[YouTube OAuth] Google returned error:", error, req.query.error_description);
      res.status(400).send(`Google OAuth error: ${error} - ${req.query.error_description || ''}`);
      return;
    }

    if (!code) {
      res.status(400).send("Missing code parameter. Params: " + JSON.stringify(req.query));
      return;
    }

    try {
      const clientId     = YOUTUBE_CLIENT_ID.value();
      const clientSecret = YOUTUBE_CLIENT_SECRET.value();

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  YT_REDIRECT_URI,
          grant_type:    "authorization_code",
        }),
      });

      const tokens = await tokenRes.json();
      console.log("[YouTube OAuth] Token response:", JSON.stringify({
        ...tokens, access_token: "REDACTED", refresh_token: tokens.refresh_token ? "PRESENT" : "MISSING"
      }));

      if (!tokens.access_token) {
        res.status(400).send(`
          <html><body style="font-family:sans-serif;padding:20px">
            <h2>âš ï¸ OAuth Error</h2>
            <p><strong>Error:</strong> ${tokens.error || 'Unknown'}</p>
            <p><strong>Description:</strong> ${tokens.error_description || 'None'}</p>
            <p><strong>Full response:</strong> <pre>${JSON.stringify(tokens, null, 2)}</pre></p>
          </body></html>
        `);
        return;
      }

      // Get existing refresh token if not provided (Google only sends it once)
      let refreshToken = tokens.refresh_token;
      if (!refreshToken) {
        const existing = await db.collection("system").doc("youtube_oauth").get();
        refreshToken = existing.data()?.refresh_token || null;
        console.log(`[YouTube OAuth] No refresh token in response, existing in DB: ${refreshToken ? 'YES' : 'NO'}`);
      }

      if (!refreshToken) {
        res.status(400).send(`
          <html><body style="font-family:sans-serif;padding:20px">
            <h2>âš ï¸ No Refresh Token</h2>
            <p>Google didn't send a refresh token. This usually means you've authorized this app before.</p>
            <p>Token response keys received: <strong>${Object.keys(tokens).join(', ')}</strong></p>
            <p>Please try these steps:</p>
            <ol>
              <li>Go to <a href="https://myaccount.google.com/connections" target="_blank">myaccount.google.com/connections</a></li>
              <li>Sign in as communityeventssydney@gmail.com</li>
              <li>Find and remove Community Events access</li>
              <li>Try connecting again</li>
            </ol>
          </body></html>
        `);
        return;
      }

      // Store tokens securely in Firestore
      await db.collection("system").doc("youtube_oauth").set({
        access_token:  tokens.access_token,
        refresh_token: refreshToken,
        expiry_date:   Date.now() + (tokens.expires_in * 1000),
        scope:         tokens.scope,
        updatedAt:     new Date().toISOString(),
      });

      res.send(`
        <html>
        <head><meta http-equiv="refresh" content="3;url=https://communityevents.siza.info"></head>
        <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f8f9fa">
          <div style="max-width:400px;margin:0 auto;background:white;padding:40px;border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
            <div style="font-size:60px;margin-bottom:16px">âœ…</div>
            <h2 style="color:#27ae60;margin:0 0 12px">YouTube Connected!</h2>
            <p style="color:#666;margin:0 0 24px">Community Events is now connected to your YouTube channel.</p>
            <p style="color:#666;margin:0 0 24px">Redirecting you back to the app in 3 secondsâ€¦</p>
            <a href="https://communityevents.siza.info" style="background:#27ae60;color:white;border:none;border-radius:10px;padding:12px 28px;font-size:15px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-block">
              Return to App Now
            </a>
          </div>
        </body></html>
      `);
    } catch (e) {
      console.error("[YouTube OAuth] Error:", e.message);
      res.status(500).send(`Error: ${e.message}`);
    }
  }
);

// Helper â€” get valid access token (refreshes if expired)
async function getYouTubeAccessToken() {
  const snap = await db.collection("system").doc("youtube_oauth").get();
  if (!snap.exists) throw new Error("YouTube not connected. Please authenticate first.");

  const data = snap.data();
  const clientId     = YOUTUBE_CLIENT_ID.value();
  const clientSecret = YOUTUBE_CLIENT_SECRET.value();

  // Refresh if expired or expiring within 5 minutes
  if (!data.access_token || Date.now() > (data.expiry_date - 300000)) {
    console.log("[YouTube] Refreshing access token...");
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: data.refresh_token,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    "refresh_token",
      }),
    });

    const refreshed = await refreshRes.json();
    if (!refreshed.access_token) throw new Error("Failed to refresh YouTube token.");

    await db.collection("system").doc("youtube_oauth").update({
      access_token: refreshed.access_token,
      expiry_date:  Date.now() + (refreshed.expires_in * 1000),
    });

    return refreshed.access_token;
  }

  return data.access_token;
}

// Step 3 â€” Create a new YouTube broadcast and return stream URL
async function createYouTubeBroadcast(accessToken, title, privacyStatus = 'public') {
  const now       = new Date();
  const startTime = new Date(now.getTime() + 30000).toISOString(); // 30 seconds from now

  // Create broadcast
  const broadcastRes = await fetch(
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,contentDetails,status",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        snippet: {
          title:            title || "Community Events Live Stream",
          scheduledStartTime: startTime,
          description:      "Live streamed via Community Events Australia app",
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableAutoStart: true,
          // Keep the broadcast alive through temporary mobile/network loss.
          // Explicit End Stream still transitions it to complete immediately.
          enableAutoStop:  false,
          enableDvr:       true,
          recordFromStart: true,
          latencyPreference: "ultraLow",
          monitorStream: {
            enableMonitorStream: false,
          },
        },
      }),
    }
  );

  const broadcast = await broadcastRes.json();
  console.log("[YouTube] Broadcast created:", JSON.stringify(broadcast).slice(0, 300));
  if (!broadcast.id) throw new Error(broadcast.error?.message || "Failed to create broadcast");

  // Bind broadcast to the default stream
  const streamRes = await fetch(
    "https://www.googleapis.com/youtube/v3/liveStreams?part=id,snippet,cdn",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        snippet: { title: title || "Community Events Stream" },
        cdn: {
          frameRate:     "variable",
          ingestionType: "rtmp",
          resolution:    "variable",
        },
      }),
    }
  );

  const stream = await streamRes.json();
  console.log("[YouTube] Stream created:", JSON.stringify(stream).slice(0, 300));
  if (!stream.id) throw new Error(stream.error?.message || "Failed to create stream");

  // Bind stream to broadcast
  await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcast.id}&part=id,contentDetails&streamId=${stream.id}`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
    }
  );

  const streamKey = stream.cdn?.ingestionInfo?.streamName;
  const rtmpUrl   = stream.cdn?.ingestionInfo?.ingestionAddress;
  const rtmpsUrl  = stream.cdn?.ingestionInfo?.rtmpsIngestionAddress;

  console.log(`[YouTube] Stream ID: ${stream.id}, streamKey present: ${!!streamKey}, rtmpUrl: ${rtmpUrl}, rtmpsUrl: ${rtmpsUrl}`);

  if (!streamKey || !rtmpUrl) {
    // Fetch stream again to get ingestion info
    const streamFetchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/liveStreams?part=id,cdn&id=${stream.id}`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    const streamFetchData = await streamFetchRes.json();
    const fetchedStream = streamFetchData.items?.[0];
    console.log(`[YouTube] Fetched stream:`, JSON.stringify(fetchedStream?.cdn?.ingestionInfo).slice(0, 300));
    return {
      broadcastId: broadcast.id,
      streamId:    stream.id,
      streamKey:   fetchedStream?.cdn?.ingestionInfo?.streamName,
      rtmpUrl:     fetchedStream?.cdn?.ingestionInfo?.ingestionAddress,
      rtmpsUrl:    fetchedStream?.cdn?.ingestionInfo?.rtmpsIngestionAddress,
      watchUrl:    `https://www.youtube.com/watch?v=${broadcast.id}`,
    };
  }

  return {
    broadcastId: broadcast.id,
    streamId:    stream.id,
    streamKey,
    rtmpUrl,
    rtmpsUrl,
    watchUrl:    `https://www.youtube.com/watch?v=${broadcast.id}`,
  };
}

// Check if YouTube is connected
exports.youtubeConnectionStatus = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const snap = await db.collection("system").doc("youtube_oauth").get();
    return { connected: snap.exists && !!snap.data()?.refresh_token };
  }
);

// --- SHARED: Stale live event cleanup logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function completeYouTubeBroadcastIfLive(broadcastId) {
  if (!broadcastId) return;
  try {
    const accessToken = await getYouTubeAccessToken();
    const statusRes = await fetch(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=status&id=${broadcastId}`,
      { headers:{ 'Authorization':`Bearer ${accessToken}` } }
    );
    const statusData = await statusRes.json();
    const lifeCycle = statusData.items?.[0]?.status?.lifeCycleStatus;
    if (lifeCycle === 'live' || lifeCycle === 'liveStarting' || lifeCycle === 'testing') {
      await fetch(
        `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=${broadcastId}&part=status`,
        { method:'POST', headers:{ 'Authorization':`Bearer ${accessToken}`, 'Content-Length':'0' } }
      );
    }
  } catch (error) {
    console.error(`[NativeStream] Could not complete stale broadcast ${broadcastId}:`, error.message);
  }
}

async function markStreamVideoCompleted(videoRecordId) {
  if (!videoRecordId) return;
  await db.collection('streamVideos').doc(videoRecordId).set({
    status: 'completed',
    endedAt: new Date().toISOString(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }).catch(error => {
    console.warn(`[StreamVideos] Could not complete ${videoRecordId}:`, error.message);
  });
}

async function syncStreamVideoAvailability({ force = false } = {}) {
  const healthRef = db.collection('system').doc('stream_video_catalog_health');
  const healthSnap = await healthRef.get();
  const lastCheckedAt = new Date(healthSnap.data()?.checkedAt || 0).getTime();
  if (!force && Date.now() - lastCheckedAt < 60 * 60 * 1000) return;

  const catalogSnap = await db.collection('streamVideos').orderBy('startedAt', 'desc').limit(100).get();
  const checkable = catalogSnap.docs.filter(docSnap => {
    const data = docSnap.data();
    return !!data.videoId && data.status !== 'live' && data.status !== 'active';
  });
  if (!checkable.length) {
    await healthRef.set({ checkedAt: new Date().toISOString() }, { merge: true });
    return;
  }

  const accessToken = await getYouTubeAccessToken();
  const availableIds = new Set();
  for (let offset = 0; offset < checkable.length; offset += 50) {
    const ids = checkable.slice(offset, offset + 50).map(docSnap => docSnap.data().videoId);
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=id&id=${encodeURIComponent(ids.join(','))}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message || `YouTube availability check failed (${response.status})`);
    }
    (payload.items || []).forEach(item => availableIds.add(item.id));
  }

  const checkedAt = new Date().toISOString();
  const batch = db.batch();
  checkable.forEach(docSnap => {
    batch.set(docSnap.ref, {
      youtubeAvailable: availableIds.has(docSnap.data().videoId),
      youtubeCheckedAt: checkedAt,
    }, { merge: true });
  });
  batch.set(healthRef, { checkedAt }, { merge: true });
  await batch.commit();
}

// Returns stream metadata to everyone, but only registered users receive the
// YouTube URL. This is enforced server-side so guests cannot recover unlisted
// links by inspecting Firestore or the network response.
exports.listStreamVideos = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
  const isRegistered = !!request.auth?.uid
    && request.auth.token.firebase?.sign_in_provider !== 'anonymous';

  // Lazily catalogue older native streams created before streamVideos existed.
  const legacySnap = await db.collection('nativeStreamSessions').orderBy('createdAt', 'desc').limit(100).get();
  const eligibleLegacy = legacySnap.docs.filter(docSnap => !!docSnap.data()?.broadcastId);
  if (eligibleLegacy.length) {
    const existing = await Promise.all(eligibleLegacy.map(docSnap =>
      db.collection('streamVideos').doc(docSnap.data().broadcastId).get()
    ));
    const missing = eligibleLegacy.filter((docSnap, index) => !existing[index]?.exists);
    if (missing.length) {
      const eventDocs = await Promise.all(missing.map(docSnap => {
        const eventId = docSnap.data()?.eventId;
        return eventId ? db.collection('events').doc(eventId).get() : Promise.resolve(null);
      }));
      const batch = db.batch();
      missing.forEach((docSnap, index) => {
        const session = docSnap.data();
        const eventData = eventDocs[index]?.exists ? eventDocs[index].data() : {};
        batch.set(db.collection('streamVideos').doc(session.broadcastId), {
          videoId: session.broadcastId,
          watchUrl: session.watchUrl || `https://www.youtube.com/watch?v=${session.broadcastId}`,
          eventId: session.eventId || null,
          eventTitle: eventData.eventSubject || eventData.eventTypeDisplay || eventData.eventType || 'Community Event Stream',
          eventDate: eventData.eventDate || '',
          hostName: eventData.hostName || '',
          organiserType: eventData.organiserType || '',
          ownerUid: eventData.createdByUserId || session.uid || '',
          startedByUid: session.uid || '',
          source: 'native',
          privacyStatus: 'public',
          status: ['stopped', 'ended'].includes(session.status) ? 'completed' : (session.status || 'completed'),
          startedAt: session.createdAt || '',
          endedAt: session.stoppedAt || session.endedAt || null,
          legacy: true,
        }, { merge: true });
      });
      await batch.commit();
    }
  }

  await syncStreamVideoAvailability({ force: true }).catch(error => {
    // A temporary YouTube/API error must not make the archive disappear.
    console.warn('[StreamVideos] Availability sync skipped:', error.message);
  });

  const snap = await db.collection('streamVideos').orderBy('startedAt', 'desc').limit(100).get();
  const videos = snap.docs.filter(docSnap => docSnap.data().youtubeAvailable !== false).map(docSnap => {
    const data = docSnap.data();
    const item = {
      id: docSnap.id,
      eventId: data.eventId || null,
      eventTitle: data.eventTitle || 'Community Event Stream',
      eventDate: data.eventDate || '',
      hostName: data.hostName || '',
      organiserType: data.organiserType || '',
      source: data.source || 'native',
      privacyStatus: data.privacyStatus === 'unlisted' ? 'unlisted' : 'public',
      status: data.status || 'completed',
      startedAt: data.startedAt || '',
      endedAt: data.endedAt || null,
    };
    if (isRegistered) {
      item.videoId = data.videoId || '';
      item.watchUrl = data.watchUrl || null;
    }
    return item;
  });

  return { videos, canWatch: isRegistered };
  }
);

let publicEventsCache = { expiresAt: 0, events: [] };

async function runStaleLiveCleanup() {
  const snap = await db.collection('events').where('isLive', '==', true).get();
  if (snap.empty) return 0;
  let ended = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const sessionId = data.liveUrl; // liveUrl stores the nativeStream sessionId
    const startedAt = data.liveStartedAt ? new Date(data.liveStartedAt) : null;
    const hoursLive = startedAt ? (Date.now() - startedAt.getTime()) / 3600000 : 999;

    // Safety net â€” force end if live for more than 3 hours, or no session at all
    if (!sessionId || hoursLive > 3) {
      await markStreamVideoCompleted(data.liveVideoRecordId);
      await docSnap.ref.update({ isLive: false, liveUrl: null, liveWatchUrl: null,
        liveVideoRecordId: null, liveEndedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      ended++; continue;
    }

    try {
      const sessDoc = await db.collection('nativeStreamSessions').doc(sessionId).get();
      const sessionData = sessDoc.exists ? sessDoc.data() : null;
      const status = sessionData?.status || 'ended';
      const resumeExpired = status === 'interrupted'
        && new Date(sessionData?.resumeUntil || 0).getTime() < Date.now();
      // Interrupted sessions remain visible during the recovery window so the
      // host can resume the same YouTube URL.
      if (status === 'ended' || status === 'stopped' || resumeExpired) {
        if (resumeExpired && sessionData?.broadcastId) {
          await completeYouTubeBroadcastIfLive(sessionData.broadcastId);
          await sessDoc.ref.update({ status:'stopped', stoppedAt:new Date().toISOString() }).catch(() => {});
        }
        await markStreamVideoCompleted(sessionData?.broadcastId);
        await docSnap.ref.update({ isLive: false, liveUrl: null, liveWatchUrl: null,
          liveVideoRecordId: null, liveEndedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        ended++;
      }
    } catch (e) { console.error(`[Cleanup] Error checking session ${sessionId}:`, e.message); }
  }
  if (ended > 0) console.log(`[Cleanup] Ended ${ended} stale live event(s)`);
  return ended;
}

// â”€â”€â”€ CALLABLE: Immediate cleanup (called from client on stream end) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Named differently from the scheduled version to avoid Firebase trigger-type conflict
exports.cleanupStaleLiveEventsNow = onCall(
  { region: REGION, secrets:[YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async () => {
    const ended = await runStaleLiveCleanup();
    return { ended };
  }
);

// â”€â”€â”€ SCHEDULED: Clean up stale live events every 10 minutes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.cleanupStaleLiveEvents = onSchedule(
  { schedule: 'every 2 minutes', region: REGION, secrets:[YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async () => { await runStaleLiveCleanup(); }
);


// â”€â”€â”€ NATIVE STREAM: Start session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns a Cloud Run WebSocket URL for the native streaming relay.
// The Cloud Run container (deployed separately) accepts WebSocket connections,
// receives binary MediaRecorder chunks, and pipes them through FFmpeg to YouTube RTMP.
//
// This function:
//   1. Creates a YouTube broadcast via OAuth (or uses a manual stream key)
//   2. Returns the Cloud Run WebSocket URL + YouTube watch URL to the client
//
// NOTE: Cloud Run container must be deployed separately â€” see /streaming-relay/README.md
// Until deployed, this returns a mock URL so the frontend test UI can be developed.
exports.nativeStreamStart = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { useOAuth, manualRtmpKey, eventTitle, eventId, qualityProfile, audioMode, testMode, protocolVersion } = request.data || {};
    const privacyStatus = request.data?.privacyStatus === 'unlisted' ? 'unlisted' : 'public';
    let eventData = null;
    if (eventId) {
      const eventSnap = await db.collection('events').doc(eventId).get();
      if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
      eventData = eventSnap.data();
    }
    const requiresAdminCheck = eventData
      ? eventData.createdByUserId !== request.auth.uid
      : protocolVersion === 2;
    if (requiresAdminCheck) {
      const userSnap = await db.collection('users').doc(request.auth.uid).get();
      if (!['admin', 'superAdmin'].includes(userSnap.data()?.role)) {
        throw new HttpsError('permission-denied', 'Not authorised to stream this event.');
      }
    }
    if (eventData?.isLive && eventData.liveUrl) {
      throw new HttpsError('failed-precondition', 'This event already has an active or resumable stream.');
    }

    let rtmpUrl   = null;
    let watchUrl  = null;
    let broadcastId = null;

    // â”€â”€ Get RTMP target â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (useOAuth) {
      try {
        const accessToken = await getYouTubeAccessToken();
        const broadcast   = await createYouTubeBroadcast(accessToken, eventTitle || 'Community Events Live Stream', privacyStatus);
        // Use RTMPS (port 443) â€” Cloud Run blocks outbound port 1935 (plain RTMP)
        const ingestBase = broadcast.rtmpsUrl || broadcast.rtmpUrl;
        rtmpUrl     = `${ingestBase}/${broadcast.streamKey}`;
        watchUrl    = broadcast.watchUrl;
        broadcastId = broadcast.broadcastId;
        console.log(`[NativeStream] YouTube broadcast created: ${broadcastId}, using ${broadcast.rtmpsUrl ? 'RTMPS:443' : 'RTMP:1935'}`);
      } catch (e) {
        console.error('[NativeStream] OAuth/broadcast failed:', e.message);
        console.error('[NativeStream] Stack:', e.stack?.slice(0, 500));
        throw new HttpsError('internal',
          `YouTube setup failed: ${e.message}. If this mentions token/auth, go to Admin Dashboard â†’ Settings â†’ reconnect YouTube.`);
      }
    } else if (manualRtmpKey) {
      // RTMPS on port 443 â€” Cloud Run blocks outbound port 1935 (plain RTMP)
      rtmpUrl  = `rtmps://a.rtmps.youtube.com/live2/${manualRtmpKey}`;
      watchUrl = `https://www.youtube.com/channel/UC9AvesDamQvU7idD2OD1R6w/live`;
    } else {
      throw new HttpsError('invalid-argument', 'Either useOAuth=true or manualRtmpKey required.');
    }

    // â”€â”€ Get Cloud Run WebSocket URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const RELAY_URL = process.env.NATIVE_STREAM_RELAY_URL
      || 'wss://native-stream-relay-209723097611.australia-southeast1.run.app';

    const sessionId = `ns_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const streamToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(streamToken).digest('hex');

    // Store session in Firestore so relay can validate it
    try {
      await db.collection('nativeStreamSessions').doc(sessionId).set({
        uid:        request.auth.uid,
        eventId: eventId || null,
        rtmpUrl,
        broadcastId: broadcastId || null,
        watchUrl:    watchUrl || null,
        createdAt:   new Date().toISOString(),
        status:      'pending',
        tokenHash,
        protocolVersion: protocolVersion === 2 ? 2 : 1,
        qualityProfile: ['1080p','720p','480p'].includes(qualityProfile) ? qualityProfile : '720p',
        audioMode: audioMode === 'speech' ? 'speech' : 'natural',
        privacyStatus,
        resumeUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      // Publish the resumable session before returning to the phone. If
      // Android reloads the page or the network drops after this point, the
      // next attempt resumes this session instead of creating another
      // YouTube broadcast.
      if (eventId) {
        await db.collection('events').doc(eventId).update({
          isLive: true,
          liveUrl: sessionId,
          liveRoomCode: sessionId,
          liveWatchUrl: watchUrl || null,
          liveSource: 'native',
          liveVideoRecordId: broadcastId || null,
          liveStartedAt: new Date().toISOString(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (broadcastId) {
        await db.collection('streamVideos').doc(broadcastId).set({
          videoId: broadcastId,
          watchUrl,
          eventId: eventId || null,
          eventTitle: eventTitle || eventData?.eventSubject || eventData?.eventTypeDisplay || eventData?.eventType || 'Community Event Stream',
          eventDate: eventData?.eventDate || '',
          hostName: eventData?.hostName || '',
          organiserType: eventData?.organiserType || '',
          ownerUid: eventData?.createdByUserId || request.auth.uid,
          startedByUid: request.auth.uid,
          source: 'native',
          privacyStatus,
          status: 'live',
          startedAt: new Date().toISOString(),
          endedAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    } catch (e) {
      console.error('[NativeStream] Firestore session write failed:', e.message, e.code);
      throw new HttpsError('internal', 'Failed to create session in Firestore: ' + e.message);
    }

    const wsUrl = `${RELAY_URL}/stream?session=${sessionId}`;
    console.log(`[NativeStream] Session ${sessionId} created for uid ${request.auth.uid}`);
    return { wsUrl, watchUrl, sessionId, streamToken, rtmpTarget: rtmpUrl.replace(/\/[^/]+$/, '/REDACTED') };
  }
);

// â”€â”€â”€ NATIVE STREAM: Resume the same YouTube broadcast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.nativeStreamResume = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { eventId, sessionId } = request.data || {};
    if (!eventId || !sessionId) throw new HttpsError('invalid-argument', 'eventId and sessionId required.');

    const [eventSnap, sessionSnap] = await Promise.all([
      db.collection('events').doc(eventId).get(),
      db.collection('nativeStreamSessions').doc(sessionId).get(),
    ]);
    if (!eventSnap.exists || !sessionSnap.exists) throw new HttpsError('not-found', 'Stream session not found.');
    const eventData = eventSnap.data();
    const session = sessionSnap.data();
    if (session.eventId !== eventId || eventData.liveUrl !== sessionId) {
      throw new HttpsError('failed-precondition', 'This session does not belong to the selected event.');
    }
    if (eventData.createdByUserId !== request.auth.uid) {
      const userSnap = await db.collection('users').doc(request.auth.uid).get();
      if (!['admin', 'superAdmin'].includes(userSnap.data()?.role)) {
        throw new HttpsError('permission-denied', 'Not authorised to resume this event.');
      }
    }
    if (session.status === 'stopped') throw new HttpsError('failed-precondition', 'This stream was ended explicitly.');
    const leaseExpiry = new Date(session.leaseExpiresAt || 0).getTime();
    if (session.activeConnectionId && leaseExpiry > Date.now()) {
      throw new HttpsError('failed-precondition', 'This stream is still active on another device.');
    }
    const resumeUntil = new Date(session.resumeUntil || 0).getTime();
    if (session.status === 'interrupted' && resumeUntil && resumeUntil < Date.now()) {
      throw new HttpsError('deadline-exceeded', 'The resume window has expired.');
    }

    const streamToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(streamToken).digest('hex');
    await sessionSnap.ref.update({
      tokenHash,
      status: 'pending',
      resumedBy: request.auth.uid,
      resumedAt: new Date().toISOString(),
      resumeUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      activeConnectionId: null,
      leaseExpiresAt: null,
    });

    const relayUrl = process.env.NATIVE_STREAM_RELAY_URL
      || 'wss://native-stream-relay-209723097611.australia-southeast1.run.app';
    return {
      wsUrl: `${relayUrl}/stream?session=${sessionId}`,
      watchUrl: session.watchUrl,
      sessionId,
      streamToken,
      qualityProfile: session.qualityProfile || '720p',
      audioMode: session.audioMode || 'natural',
    };
  }
);

// â”€â”€â”€ NATIVE STREAM: Stop session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.nativeStreamStop = onCall(
  { region: REGION, secrets:[YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { sessionId } = request.data || {};
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId required.');

    const sessRef = db.collection('nativeStreamSessions').doc(sessionId);
    const sess    = await sessRef.get();
    if (!sess.exists) throw new HttpsError('not-found', 'Session not found.');
    if (sess.data().uid !== request.auth.uid) throw new HttpsError('permission-denied', 'Not your session.');

    await sessRef.update({ status: 'stopped', stoppedAt: new Date().toISOString() });
    await completeYouTubeBroadcastIfLive(sess.data().broadcastId);
    await markStreamVideoCompleted(sess.data().broadcastId);
    console.log(`[NativeStream] Session ${sessionId} stopped`);
    return { ok: true };
  }
);

// Connect a YouTube Live broadcast created on another device to an event.
exports.startExternalYouTubeStream = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const eventId = String(request.data?.eventId || '').trim();
  const rawUrl = String(request.data?.youtubeUrl || '').trim();
  const privacyStatus = request.data?.privacyStatus === 'unlisted' ? 'unlisted' : 'public';
  if (!eventId || !rawUrl) throw new HttpsError('invalid-argument', 'Event and YouTube URL are required.');

  const eventRef = db.collection('events').doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  const eventData = eventSnap.data();
  const isOwner = eventData.createdByUserId === request.auth.uid;
  if (!isOwner) {
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    if (!['admin', 'superAdmin'].includes(userSnap.data()?.role)) {
      throw new HttpsError('permission-denied', 'Not authorised to stream this event.');
    }
  }
  if (eventData.isLive) throw new HttpsError('failed-precondition', 'This event is already live.');

  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new HttpsError('invalid-argument', 'Enter a valid YouTube video URL.'); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let videoId = '';
  if (host === 'youtu.be') videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  if (host === 'youtube.com') {
    if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
    else if (/^\/(live|embed|shorts)\//.test(parsed.pathname)) videoId = parsed.pathname.split('/')[2] || '';
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new HttpsError('invalid-argument', 'Use a YouTube video link such as youtube.com/watch?v=... or youtu.be/...');
  }
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
    await response.json();
  } catch (error) {
    console.warn(`[ExternalStream] URL verification failed for ${videoId}: ${error.message}`);
    throw new HttpsError('invalid-argument', 'YouTube could not verify this video. Make sure it is available, then try again.');
  }

  const now = new Date().toISOString();
  const videoRecordId = `external_${videoId}_${eventId}`;
  await eventRef.update({
    isLive:true,
    liveUrl:null,
    liveWatchUrl:watchUrl,
    liveSource:'external-youtube',
    liveStartedAt:now,
    liveStartedBy:request.auth.uid,
    liveVideoRecordId:videoRecordId,
    updatedAt:now,
  });
  await db.collection('streamVideos').doc(videoRecordId).set({
    videoId,
    watchUrl,
    eventId,
    eventTitle:eventData.eventSubject || eventData.eventTypeDisplay || eventData.eventType || 'Community Event Stream',
    eventDate:eventData.eventDate || '',
    hostName:eventData.hostName || '',
    organiserType:eventData.organiserType || '',
    ownerUid:eventData.createdByUserId || request.auth.uid,
    startedByUid:request.auth.uid,
    source:'external-youtube',
    privacyStatus,
    status:'live',
    startedAt:now,
    endedAt:null,
    createdAt:admin.firestore.FieldValue.serverTimestamp(),
  }, { merge:true });
  console.log(`[ExternalStream] Event ${eventId} linked to YouTube video ${videoId} by ${request.auth.uid}`);
  return { ok:true, watchUrl, videoId };
});

exports.endExternalYouTubeStream = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const eventId = String(request.data?.eventId || '').trim();
  if (!eventId) throw new HttpsError('invalid-argument', 'eventId required.');

  const eventRef = db.collection('events').doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  const eventData = eventSnap.data();
  const isOwner = eventData.createdByUserId === request.auth.uid;
  if (!isOwner) {
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    if (!['admin', 'superAdmin'].includes(userSnap.data()?.role)) {
      throw new HttpsError('permission-denied', 'Not authorised to end this live event.');
    }
  }
  if (eventData.liveSource !== 'external-youtube') {
    throw new HttpsError('failed-precondition', 'This event is not using an external YouTube stream.');
  }

  const now = new Date().toISOString();
  await markStreamVideoCompleted(eventData.liveVideoRecordId);
  await eventRef.update({
    isLive:false,
    liveUrl:null,
    liveWatchUrl:null,
    liveSource:null,
    liveVideoRecordId:null,
    liveEndedAt:now,
    updatedAt:now,
  });
  console.log(`[ExternalStream] Event ${eventId} ended in app by ${request.auth.uid}`);
  return { ok:true };
});

// â”€â”€â”€ NATIVE STREAM: Check YouTube stream health (diagnostic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns the streamStatus of the bound liveStream â€” tells us if YouTube
// is receiving valid data ('active') or not ('ready'/'error'/'inactive').
exports.nativeStreamCheckHealth = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { sessionId } = request.data || {};
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId required.');

    const sess = await db.collection('nativeStreamSessions').doc(sessionId).get();
    if (!sess.exists) throw new HttpsError('not-found', 'Session not found.');
    const { broadcastId } = sess.data();
    if (!broadcastId) return { error: 'No broadcastId â€” manual key mode, cannot check health' };

    const accessToken = await getYouTubeAccessToken();

    // Get the broadcast to find the bound stream ID
    const bRes = await fetch(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=contentDetails,status&id=${broadcastId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const bData = await bRes.json();
    const item = bData.items?.[0];
    const streamId = item?.contentDetails?.boundStreamId;
    const broadcastStatus = item?.status?.lifeCycleStatus;

    if (!streamId) return { broadcastStatus, streamStatus: 'no-bound-stream', healthStatus: null };

    // Get the stream's health status
    const sRes = await fetch(
      `https://www.googleapis.com/youtube/v3/liveStreams?part=status&id=${streamId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const sData = await sRes.json();
    const streamStatus = sData.items?.[0]?.status?.streamStatus;
    const healthStatus = sData.items?.[0]?.status?.healthStatus;

    console.log(`[NativeStream] Health check â€” broadcast: ${broadcastStatus}, stream: ${streamStatus}, health:`, JSON.stringify(healthStatus));

    // If stream is active but broadcast hasn't transitioned, manually transition it
    if (streamStatus === 'active' && broadcastStatus !== 'live' && broadcastStatus !== 'complete') {
      let nextStatus = broadcastStatus;
      let transitioned = false;

      if (broadcastStatus === 'ready') {
        console.log('[NativeStream] Stream active but broadcast is ready - transitioning to testing');
        const testingRes = await fetch(
          `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=testing&id=${broadcastId}&part=status`,
          { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const testingData = await testingRes.json();
        console.log('[NativeStream] Testing transition result:', JSON.stringify(testingData).slice(0, 300));
        if (testingData.status?.lifeCycleStatus) {
          nextStatus = testingData.status.lifeCycleStatus;
          transitioned = true;
        }
      }

      if (nextStatus === 'testing' || broadcastStatus === 'testing') {
        console.log('[NativeStream] Stream active - transitioning broadcast to live');
        const liveRes = await fetch(
          `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=live&id=${broadcastId}&part=status`,
          { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const liveData = await liveRes.json();
        console.log('[NativeStream] Live transition result:', JSON.stringify(liveData).slice(0, 300));
        if (liveData.status?.lifeCycleStatus) {
          nextStatus = liveData.status.lifeCycleStatus;
          transitioned = true;
        }
      }

      return { broadcastStatus: nextStatus, streamStatus, healthStatus, transitioned };
    }

    if (streamStatus === 'active' && broadcastStatus === 'ready') {
      console.log('[NativeStream] Stream active but broadcast not live â€” transitioning to live');
      const tRes = await fetch(
        `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=live&id=${broadcastId}&part=status`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const tData = await tRes.json();
      console.log('[NativeStream] Transition result:', JSON.stringify(tData).slice(0, 300));
      return { broadcastStatus: tData.status?.lifeCycleStatus || broadcastStatus, streamStatus, healthStatus, transitioned: true };
    }

    return { broadcastStatus, streamStatus, healthStatus, transitioned: false };
  }
);

// â”€â”€â”€ NATIVE STREAM: End event (robust server-side cleanup) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Called by the host when confirming "End Stream". Directly clears isLive on
// the event AND marks the relay session as stopped â€” bypasses any client-side
// race conditions between session-status checks and Firestore writes.
exports.nativeStreamEndEvent = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { eventId, sessionId } = request.data || {};
    if (!eventId) throw new HttpsError('invalid-argument', 'eventId required.');

    const eventRef = db.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');

    const eventData = eventSnap.data();
    const isOwner = eventData.createdByUserId === request.auth.uid;
    if (!isOwner) {
      const userDoc = await db.collection('users').doc(request.auth.uid).get();
      const role = userDoc.data()?.role;
      if (role !== 'admin' && role !== 'superAdmin') {
        throw new HttpsError('permission-denied', 'Not your event.');
      }
    }

    // 1. Get broadcastId from session so we can end the YouTube broadcast cleanly
    let broadcastId = null;
    if (sessionId) {
      const sessRef = db.collection('nativeStreamSessions').doc(sessionId);
      const sessSnap = await sessRef.get().catch(() => null);
      if (sessSnap?.exists) {
        broadcastId = sessSnap.data().broadcastId || null;
        // Mark session stopped
        await sessRef.update({ status: 'stopped', stoppedAt: new Date().toISOString() })
          .catch(e => console.warn('[NativeStream] Session update failed:', e.message));
      }
    }

    // 2. Transition YouTube broadcast to 'complete' â€” this cleanly ends the
    //    YouTube stream for all viewers, replacing the endless buffering state
    //    that occurs when the RTMP connection is simply dropped without a proper
    //    broadcast end signal. Fire-and-forget with error logging.
    if (broadcastId) {
      try {
        const accessToken = await getYouTubeAccessToken();
        // First check current lifecycle status â€” can only transition from 'live'
        const statusRes = await fetch(
          `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=status&id=${broadcastId}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const statusData = await statusRes.json();
        const lifeCycle = statusData.items?.[0]?.status?.lifeCycleStatus;
        console.log(`[NativeStream] Broadcast ${broadcastId} lifecycle: ${lifeCycle}`);

        if (lifeCycle === 'live' || lifeCycle === 'liveStarting') {
          const transRes = await fetch(
            `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=${broadcastId}&part=status`,
            { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Length': '0' } }
          );
          const transData = await transRes.json();
          if (transData.error) {
            console.error(`[NativeStream] Broadcast transition failed: ${JSON.stringify(transData.error)}`);
          } else {
            console.log(`[NativeStream] Broadcast ${broadcastId} transitioned to complete`);
          }
        } else {
          console.log(`[NativeStream] Broadcast ${broadcastId} already in state ${lifeCycle} â€” no transition needed`);
        }
      } catch (e) {
        // Don't fail the whole end-event call if YouTube transition fails â€”
        // the Firestore update below is the critical piece for the app UI
        console.error('[NativeStream] YouTube transition error (non-fatal):', e.message);
      }
      await markStreamVideoCompleted(broadcastId);
    }

    // 3. Force-clear isLive on the event â€” source of truth for the app UI
    await eventRef.update({
      isLive:       false,
      liveUrl:      null,
      liveWatchUrl: null,
      liveSource:   null,
      liveVideoRecordId: null,
      liveEndedAt:  new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    });

    console.log(`[NativeStream] Event ${eventId} ended by ${request.auth.uid}`);
    return { ok: true };
  }
);
