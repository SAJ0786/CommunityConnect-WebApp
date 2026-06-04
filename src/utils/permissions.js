import { ROLES } from './constants';

export const isAdminRole = role => role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
export const canEditEvent  = (profile, event, uid) => isAdminRole(profile?.role) || event?.createdByUserId === uid;
export const canDeleteEvent = canEditEvent;
export const canManageUsers = profile => profile?.role === ROLES.SUPER_ADMIN;

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
