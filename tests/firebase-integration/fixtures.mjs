import { freshData, address } from '../workspace-preview/model.mjs';
import { listingSubmission } from '../../src/business/workspaceModel.mjs';
export { address };
export function validRuleSubmission(ownerId) {
  const { logoFile, coverFile, ...payload } = listingSubmission(seedRecords()['businesses/pending']);
  return { ...payload, ownerId, status: 'pending', tier: 'free', abnVerified: false, foundingMember: false };
}
export const identities = Object.fromEntries(['member', 'customer', 'admin', 'super', 'inactive'].map(name => [name, {
  uid: `review-${name}`, email: `${name}@example.test`, phoneNumber: '+61400000000', isAnonymous: false,
}]));
export function seedRecords() {
  const records = {};
  for (const [name, user] of Object.entries(identities)) records[`users/${user.uid}`] = {
    fullName: `Test ${name}`, email: user.email, role: name === 'super' ? 'superAdmin' : name === 'admin' ? 'admin' : 'user',
    isActive: name !== 'inactive', accountStatus: 'active', defaultCity: 'sydney', adminCity: name === 'admin' ? 'sydney' : null,
    savedBusinesses: ['example'], savedEvents: [],
  };
  const data = freshData();
  for (const row of data.businesses) {
    const { id, ...record } = row;
    records[`businesses/${id}`] = { ...record, listingTermsVersion: '2026-09-08-community-connect' };
    if (record.status === 'approved' || record.hasPublishedVersion) {
      // Use a real projection shape, never the web view model as Firestore data.
      const { ownerId, referrer, abn, listingDeclarationAccepted, ...projection } = record;
      records[`publicBusinesses/${id}`] = { ...projection, status: 'approved', location: { ...record.location, fullAddress: 'Parramatta NSW 2150' } };
    }
  }
  for (const { id, ...row } of data.promotions) records[`businessPromotions/${id}`] = row;
  records['businessMessageThreads/thread'] = { type: 'business', businessId: 'example', businessName: 'Example Community Catering',
    ownerUid: 'review-member', senderUid: 'review-customer', senderName: 'Test customer', participantUids: ['review-member', 'review-customer'],
    blockedBy: {}, adminBlocked: false, unreadBy: { 'review-member': 1, 'review-customer': 0 }, lastMessage: 'Sample enquiry', updatedAt: new Date(),
  };
  records['businessMessageThreads/thread/messages/first'] = { senderUid: 'review-customer', senderName: 'Test customer', text: 'Sample enquiry', kind: 'text', createdAt: new Date() };
  records['userNotifications/notice'] = { recipientUid: 'review-member', title: 'Listing update', body: 'A synthetic review update.', read: false, destination: 'owner', createdAt: new Date() };
  records['businessModerationNotices/review-notice'] = { ownerUid: 'review-member', businessId: 'example', businessName: 'Example Community Catering',
    reportId: 'synthetic-report', decision: 'under-review', reason: 'Synthetic decision retained for appeal testing.', appealStatus: 'not-submitted', createdAt: new Date() };
  return records;
}
