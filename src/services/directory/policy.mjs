import { memberEntryState } from '../../utils/memberProfile.mjs';

export const DIRECTORY_TEST_PROJECT = 'demo-community-connect-web';
export const DIRECTORY_TEST_HOST = '127.0.0.1';
export const DIRECTORY_TEST_PORT = 8089;
export const DIRECTORY_STORAGE_PORT = 9198;
export const DIRECTORY_STORAGE_BUCKET = `${DIRECTORY_TEST_PROJECT}.appspot.com`;

// A deliberately narrow release boundary. There is no production-write switch.
export function assertDirectoryTestEnvironment({ projectId, hostname, host, port }) {
  if (projectId !== DIRECTORY_TEST_PROJECT || !['localhost', '127.0.0.1'].includes(hostname)
      || host !== DIRECTORY_TEST_HOST || port !== DIRECTORY_TEST_PORT) {
    throw new Error('Business workflow testing requires the isolated local Firebase emulator.');
  }
}

export function requireDirectoryMember(user, profile) {
  if (memberEntryState(user, profile, false) !== 'ready') {
    throw new Error('An active, complete member account is required.');
  }
  return profile;
}

export function requireDirectoryAdmin(profile, business, { superOnly = false } = {}) {
  if (!['admin', 'superAdmin'].includes(profile?.role) || superOnly && profile.role !== 'superAdmin') {
    throw new Error(superOnly ? 'Super Admin access is required.' : 'Administrator access is required.');
  }
  if (business && profile.role !== 'superAdmin'
      && business.location?.city !== (profile.adminCity || profile.defaultCity)) {
    throw new Error('This business is outside your administration city.');
  }
}

export function requireBusinessParticipant(thread, uid) {
  if (!uid || !thread?.participantUids?.includes(uid)
      || ![thread.ownerUid, thread.senderUid].includes(uid)) {
    throw new Error('This conversation is not available to your account.');
  }
}

export function replyText(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 2000) throw new Error('Write a message of 1 to 2000 characters.');
  return text;
}
