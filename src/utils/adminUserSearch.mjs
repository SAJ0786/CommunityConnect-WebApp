export function normalisePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0061')) digits = digits.slice(2);
  if (digits.startsWith('61') && digits.length >= 10) digits = `0${digits.slice(2)}`;
  return digits;
}

export function isTransferMemberEligible(user) {
  // Older active profiles can contain a migration marker pointing to themselves.
  // Only a different destination means this account was migrated away.
  return user.isActive !== false && user.active !== false && (!user.migratedToUid || user.migratedToUid === user.id)
    && !user.bannedAt && !user.archivedAt && !user.accountDeletedAt
    && !['inactive','banned','deleted','archived','suspended'].includes(user.accountStatus);
}

export function userMatchesSearch(userRecord, queryText) {
  const textQuery = String(queryText || '').trim().toLowerCase();
  if (!textQuery) return true;

  const textFields = [
    userRecord.fullName,
    userRecord.displayName,
    userRecord.name,
    userRecord.email,
  ];
  if (textFields.some(value => String(value || '').toLowerCase().includes(textQuery))) return true;

  const phoneQuery = normalisePhone(textQuery);
  if (!phoneQuery) return false;
  return [userRecord.phone, userRecord.phoneNumber, userRecord.mobile, userRecord.mobileNumber]
    .some(value => normalisePhone(value).includes(phoneQuery));
}
