'use strict';
// Native decisions; ABR transport is injected and cannot access a real secret.
exports.register = function ({ admin, db, onCall, HttpsError, REGION, lookupAbrByAbn }) {
const exports = {};
const ABR_AUTH_GUID = null;
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

function normalizeAbn(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function isValidAbn(value) {
  const abn = normalizeAbn(value);
  if (abn.length !== 11) return false;
  const digits = abn.split("").map(Number);
  digits[0] -= 1;
  return digits.reduce((sum, digit, index) => sum + digit * ABN_WEIGHTS[index], 0) % 89 === 0;
}

function normalizeAbrName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
function abrBusinessNames(payload = {}) {
  const values = Array.isArray(payload.BusinessName)
    ? payload.BusinessName
    : payload.BusinessName
      ? [payload.BusinessName]
      : [];
  return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
}

function abrTradingNames(payload = {}) {
  const values = Array.isArray(payload.TradingName)
    ? payload.TradingName
    : payload.TradingName
      ? [payload.TradingName]
      : [];
  return [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
}

// â”€â”€â”€ Health check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function enforceAbrLookupRateLimit(uid) {
  const reference = db.collection("abrLookupRateLimits").doc(uid);
  const now = admin.firestore.Timestamp.now();
  const dayKey = now.toDate().toISOString().slice(0, 10);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.data() || {};
    const lastLookupMillis = current.lastLookupAt?.toMillis?.() || 0;
    if (lastLookupMillis && now.toMillis() - lastLookupMillis < 3000) {
      throw new HttpsError("resource-exhausted", "Please wait a few seconds before checking another ABN.");
    }
    const dailyCount = current.dayKey === dayKey ? Number(current.dailyCount || 0) : 0;
    if (dailyCount >= 50) {
      throw new HttpsError("resource-exhausted", "The daily ABN lookup limit has been reached. Please try again tomorrow.");
    }
    transaction.set(reference, {
      dayKey,
      dailyCount: dailyCount + 1,
      lastLookupAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

// Authenticated prefill lookup for business submission forms. This returns
// public ABR fields only; the secret GUID never leaves the server.
exports.lookupBusinessAbnForSubmission = onCall(
  { region: REGION, secrets: [ABR_AUTH_GUID], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth?.uid || request.auth.token.firebase?.sign_in_provider === "anonymous") {
      throw new HttpsError("unauthenticated", "Please sign in before looking up an ABN.");
    }

    const abn = normalizeAbn(request.data?.abn);
    if (!isValidAbn(abn)) {
      throw new HttpsError("invalid-argument", "Enter a valid 11-digit ABN.");
    }

    await enforceAbrLookupRateLimit(request.auth.uid);
    const abr = await lookupAbrByAbn(abn);
    const returnedAbn = normalizeAbn(abr.Abn);
    if (returnedAbn !== abn) {
      throw new HttpsError("failed-precondition", "The ABR response did not match the submitted ABN.");
    }

    const entityName = String(abr.EntityName || "").trim();
    const businessNames = abrBusinessNames(abr);
    const tradingNames = abrTradingNames(abr);
    const officialNames = [...new Set([...businessNames, ...tradingNames, entityName].filter(Boolean))];
    const abnStatus = String(abr.AbnStatus || "").trim();

    return {
      abn,
      active: abnStatus.toLowerCase() === "active",
      abnStatus,
      abnStatusEffectiveFrom: String(abr.AbnStatusEffectiveFrom || "").trim(),
      entityName,
      businessNames,
      tradingNames,
      officialNames,
      suggestedName: businessNames[0] || tradingNames[0] || entityName,
      entityTypeCode: String(abr.EntityTypeCode || "").trim(),
      entityTypeName: String(abr.EntityTypeName || "").trim(),
      state: String(abr.AddressState || "").trim(),
      postcode: String(abr.AddressPostcode || "").trim(),
      source: "Australian Business Register",
      checkedAt: new Date().toISOString(),
    };
  }
);
exports.verifyBusinessAbn = onCall(
  { region: REGION, secrets: [ABR_AUTH_GUID], timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth?.uid || request.auth.token.firebase?.sign_in_provider === "anonymous") {
      throw new HttpsError("unauthenticated", "Please sign in first.");
    }

    const businessId = String(request.data?.businessId || "").trim();
    if (!businessId || businessId.length > 160 || businessId.includes("/")) {
      throw new HttpsError("invalid-argument", "A valid business reference is required.");
    }

    const [callerSnapshot, businessSnapshot] = await Promise.all([
      db.collection("users").doc(request.auth.uid).get(),
      db.collection("businesses").doc(businessId).get(),
    ]);
    const caller = callerSnapshot.data() || {};
    if (!callerSnapshot.exists || !["admin", "superAdmin"].includes(caller.role)) {
      throw new HttpsError("permission-denied", "Business administrator access is required.");
    }
    if (!businessSnapshot.exists) {
      throw new HttpsError("not-found", "This business listing could not be found.");
    }

    const business = businessSnapshot.data() || {};
    const abn = normalizeAbn(business.abn);
    if (!isValidAbn(abn)) {
      throw new HttpsError("invalid-argument", "The submitted ABN does not pass the official ABN checksum.");
    }

    const abr = await lookupAbrByAbn(abn);
    const returnedAbn = normalizeAbn(abr.Abn);
    const entityName = String(abr.EntityName || "").trim();
    const businessNames = abrBusinessNames(abr);
    const tradingNames = abrTradingNames(abr);
    const officialNames = [entityName, ...businessNames, ...tradingNames].filter(Boolean);
    const submittedName = String(business.name || "").trim();
    const normalizedSubmittedName = normalizeAbrName(submittedName);
    const matchedName = officialNames.find(name => normalizeAbrName(name) === normalizedSubmittedName) || "";
    const active = String(abr.AbnStatus || "").trim().toLowerCase() === "active";
    const verified = returnedAbn === abn && active && Boolean(matchedName);
    const checkedAt = admin.firestore.Timestamp.now();
    const status = verified
      ? "verified"
      : !active
        ? "inactive"
        : returnedAbn !== abn
          ? "abn_mismatch"
          : "name_review_required";
    const verification = {
      status,
      source: "ABR Lookup web service",
      abn,
      abnStatus: String(abr.AbnStatus || "").trim(),
      abnStatusEffectiveFrom: String(abr.AbnStatusEffectiveFrom || "").trim(),
      entityName,
      businessNames,
      tradingNames,
      entityTypeCode: String(abr.EntityTypeCode || "").trim(),
      entityTypeName: String(abr.EntityTypeName || "").trim(),
      state: String(abr.AddressState || "").trim(),
      postcode: String(abr.AddressPostcode || "").trim(),
      submittedName,
      matchedName,
      checkedAt,
      checkedBy: request.auth.uid,
    };

    const batch = db.batch();
    batch.update(db.collection("businesses").doc(businessId), {
      abnVerified: verified,
      verificationBadge: verified ? "ABN Verified" : "Pending ABN verification",
      abnCheckedAt: checkedAt,
      abrVerification: verification,
      ...(!verified && business.status === "approved" ? {
        status: "pending",
        hidden: true,
        previousStatus: "approved",
      } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (!verified) {
      batch.delete(db.collection("publicBusinesses").doc(businessId));
      batch.delete(db.collection("businessContactRoutes").doc(businessId));
    }
    batch.set(db.collection("businessAudit").doc(), {
      actorId: request.auth.uid,
      actorEmail: request.auth.token.email || "",
      businessId,
      action: verified ? "business.abn_verified" : "business.abn_verification_failed",
      details: {
        status,
        abn,
        submittedName,
        matchedName,
        entityName,
        businessNames,
        tradingNames,
        abnStatus: verification.abnStatus,
      },
      createdAt: checkedAt,
    });
    await batch.commit();

    return {
      verified,
      status,
      abn,
      abnStatus: verification.abnStatus,
      entityName,
      businessNames,
      tradingNames,
      matchedName,
      state: verification.state,
      postcode: verification.postcode,
      checkedAt: checkedAt.toDate().toISOString(),
    };
  }
);
return exports;
};
