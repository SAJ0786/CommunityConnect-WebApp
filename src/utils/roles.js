export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'superAdmin'
};

export function canEditEvent(user, event) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.SUPER_ADMIN || event?.createdByUserId === user?.uid;
}

export function canManageUsers(user) {
  return user?.role === ROLES.SUPER_ADMIN;
}
