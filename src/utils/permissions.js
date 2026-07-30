import { ROLES } from './constants';
import { DEFAULT_CITY, getEventMetroArea, normalizeCity } from './cities';

export const isAdminRole = role => role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
export const isSuperAdminRole = role => role === ROLES.SUPER_ADMIN;
export const getAdminCity = profile => normalizeCity(profile?.adminCity || profile?.defaultCity || DEFAULT_CITY);
export const canAdminAccessEvent = (profile, event) => {
  if (isSuperAdminRole(profile?.role)) return true;
  if (profile?.role !== ROLES.ADMIN) return false;
  return getEventMetroArea(event) === getAdminCity(profile);
};
export const canAdminAccessUser = (profile, userRecord) => {
  if (isSuperAdminRole(profile?.role)) return true;
  if (profile?.role !== ROLES.ADMIN) return false;
  return normalizeCity(userRecord?.adminCity || userRecord?.defaultCity || DEFAULT_CITY) === getAdminCity(profile);
};
export const canManageHijriSettings = profile => isSuperAdminRole(profile?.role);
export const canEditEvent  = (profile, event, uid) => canAdminAccessEvent(profile, event) || event?.createdByUserId === uid;
export const canDeleteEvent = canEditEvent;
export const canManageUsers = profile => isAdminRole(profile?.role);

/**
 * Privacy matrix for SHARING (share message content):
 *
 * | Role        | Centre event       | Private event (own) | Private event (other) |
 * |-------------|-------------------|---------------------|----------------------|
 * | superadmin  | Full details       | Full details        | Full details          |
 * | admin       | Full details       | Full details        | Full details          |
 * | normal user | Full details       | Full details        | Suburb only, no phone |
 * | guest       | Suburb only, no phone | hidden           | hidden               |
 */
export function getSharePrivacy(profile, event, uid) {
  const role      = profile?.role;
  const isAdmin   = isAdminRole(role);
  const isGuest   = !uid;
  const isPrivate = event?.organiserType === 'private';
  const isOwner   = uid && event?.createdByUserId === uid;

  if (isGuest) {
    // Guest: never show private event address/phone
    return { showFullAddress: !isPrivate, showPhone: false };
  }
  if (isAdmin) {
    // Admin/SuperAdmin: always show everything
    return { showFullAddress: true, showPhone: true };
  }
  // Normal logged-in user
  if (!isPrivate || isOwner) {
    // Centre event or user's own private event → full details
    return { showFullAddress: true, showPhone: true };
  }
  // Other user's private event → suburb only, no phone
  return { showFullAddress: false, showPhone: false };
}

/**
 * Privacy matrix for DISPLAY (on-screen):
 *
 * | Role        | Any event type     |
 * |-------------|-------------------|
 * | logged in   | Full details shown |
 * | guest       | Suburb only, no phone |
 */
export function getDisplayPrivacy(isGuest) {
  return {
    showFullAddress: !isGuest,
    showPhone: !isGuest,
  };
}
