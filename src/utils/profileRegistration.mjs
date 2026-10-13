import { LEGAL_DOCUMENT_VERSION } from '../config/legal.mjs';
import { cleanMemberName, cleanMemberEmail, validMemberName, validMemberEmail } from './memberProfile.mjs';

// Match the native profile-create contract. Roles and existing account records
// are server-owned; neither an entered email nor a migration hint grants access.
export function memberRegistrationPayload(user, data = {}) {
  if (!user?.uid || user.isAnonymous) throw new Error('A registered sign-in is required.');
  if (!/^\+614\d{8}$/.test(user.phoneNumber || '')) throw new Error('Verify your Australian mobile number first.');
  if (!validMemberName(data.fullName) || /[\u0000-\u001f\u007f]/.test(cleanMemberName(data.fullName)) || !validMemberEmail(data.email)) {
    throw new Error('Enter your full name (2–120 characters) and a valid email address.');
  }
  if (data.privacyAccepted !== true || data.termsAccepted !== true) throw new Error('Please accept the current policies.');
  // The callable owns UID, roles, verified phone and registration timestamps.
  return { fullName: cleanMemberName(data.fullName), email: cleanMemberEmail(data.email),
    privacyAccepted: true, termsAccepted: true, legalVersion: LEGAL_DOCUMENT_VERSION };
}
