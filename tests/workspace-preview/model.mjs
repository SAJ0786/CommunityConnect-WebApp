import { toPublicBusiness } from '../../src/utils/publicBusinesses.mjs';
import { toPublicPromotion } from '../../src/utils/publicPromotions.mjs';
import { published, historical, isAdmin } from '../../src/business/workspaceModel.mjs';
import { freshOperations, applyOperations } from './operations.mjs';

const date = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0,10);
export const address = { fullAddress: '10 Example Street, Parramatta NSW 2150', suburb: 'Parramatta', state: 'NSW', postcode: '2150', city: 'sydney', latitude: -33.81, longitude: 151, publicDisplay: 'suburb' };
export function freshData() {
  const base = { ownerId: 'review-member', status: 'approved', hidden: false, tier: 'free', abnStatus: 'none', abn: '', category: 'Food & Catering', categories: ['Food & Catering'], categoryIds: ['food'], subcategoryIds: ['catering'], subcategories: ['Catering'], description: 'Synthetic community catering with fresh family meals and event catering services.', contact: { email: 'business@example.test', phone: '+61400000000', website: '', whatsapp: '' }, social: {}, location: address, hours: { mon: { open: '09:00', close: '17:00' } }, referrer: { name: 'Example Referrer', phone: '0400000000', location: 'Parramatta', consentConfirmed: true }, listingDeclarationAccepted: true };
  const businesses = [
    { ...base, id: 'example', name: 'Example Community Catering' },
    { ...base, id: 'pending', name: 'Example Home Kitchen', status: 'pending' },
    { ...base, id: 'changes', name: 'Example Family Meals', status: 'rejected', rejectionReason: 'Please clarify the delivery area and opening hours.' },
    { ...base, id: 'archive', name: 'Example Former Kitchen', status: 'archived' },
    { ...base, id: 'proposed', name: 'Example Event Catering', status: 'pending', hasPublishedVersion: true, description: 'Proposed updated description awaiting administrator review.' },
    { ...base, id: 'melbourne', ownerId: 'other', name: 'Example Melbourne Services', location: { ...address, city: 'melbourne', suburb: 'Coburg', state: 'VIC', postcode: '3058' }, category: 'Home Services', categories: ['Home Services'] },
  ];
  const offer = { ownerId: 'review-member', businessId: 'example', title: 'Community catering offer', briefText: 'A seasonal offer for community events.', discountText: '15% off orders over $150', fullDetails: 'Mention COMMUNITY when ordering. Available on confirmed orders during the displayed period, subject to availability.', startDate: date(-1), endDate: date(20), status: 'active', hidden: false };
  const promotions = [{ ...offer, id: 'offer' }, { ...offer, id: 'review-offer', title: 'Weekend family meal special', status: 'pending' }, { ...offer, id: 'rejected-offer', title: 'Collection meal offer', status: 'rejected', rejectionReason: 'Please include collection times.' }];
  return {
    ...freshOperations(),
    businesses, promotions,
    publicBusinesses: businesses.filter(published).map(row => toPublicBusiness(row.id, { ...row, status: 'approved', ...(row.id === 'proposed' ? { description: 'Previously approved event catering description remains public.' } : {}) })),
    publicPromotions: promotions.map(row => toPublicPromotion(row.id,row)).filter(Boolean),
    savedIds: ['example'],
    notifications: [
      { id: 'notice', title: 'Changes requested for Example Family Meals', body: 'Please clarify the delivery area and opening hours.', date: 'Today', read: false, destination: 'owner' },
      { id: 'reply', title: 'New reply in Business Inbox', body: 'Example Community Catering replied to your enquiry.', date: 'Today', read: false, destination: 'inbox', targetId: 'thread' },
      { id: 'moderation', title: 'Listing moderation decision', body: 'Example Former Kitchen was archived following a review.', date: 'Yesterday', read: false, moderation: true },
    ],
    threads: [{ id: 'thread', businessId: 'example', businessName: 'Example Community Catering', ownerUid: 'other-owner', senderUid: 'review-member', senderName: 'Example Member', date: 'Today', updatedMillis: 100, unread: 1, messages: [{ id: 'm1', senderUid: 'review-member', text: 'Do you cater for community events with 40 guests?', date: '10:00 am' }, { id: 'm2', senderUid: 'other-owner', text: 'Yes, we can help. Which date do you have in mind?', date: '10:15 am' }] }, { id: 'customer', businessId: 'example', businessName: 'Example Community Catering', ownerUid: 'review-member', senderUid: 'customer', senderName: 'Example Customer', date: 'Yesterday', updatedMillis: 90, unread: 0, messages: [{ id: 'm3', senderUid: 'customer', text: 'Can I arrange collection on Saturday?', date: 'Yesterday' }] }],
    members: [{ id: 'review-member', fullName: 'Example Member', email: 'member@example.test', phone: '+61400000000', role: 'user', defaultCity: 'sydney', registeredAt: { seconds: 1790800000 }, isActive: true }, { id: 'new-member', fullName: 'Recent Member', email: 'recent@example.test', phone: '+61400000001', role: 'user', defaultCity: 'sydney', registeredAt: { seconds: 1790850000 }, isActive: true }, { id: 'other', fullName: 'Melbourne Member', email: 'melbourne@example.test', phone: '+61400000002', role: 'user', defaultCity: 'melbourne', createdAt: { seconds: 1790700000 }, isActive: true }, { id: 'legacy', fullName: 'Legacy Member', email: 'legacy@example.test', phone: '', role: 'user', isActive: true }],
    statistics: [{ id: 'example', pageViews: 320, enquiries: 18, actions: { call: 42, website: 26, share: 15, favourite: 9 } }, { id: 'proposed', pageViews: 90, enquiries: 4, actions: { call: 10, website: 8 } }, { id: 'melbourne', pageViews: 210, enquiries: 11, actions: { call: 20, website: 12 } }], audit: [],
  };
}

// In-memory/session-only simulation; this file must never enter production.
export function applyDemoAction(current, type, payload, profile) {
  if (!profile) throw new Error('Use a member preview to perform this action.');
  const next = structuredClone(current);
  if (/^(category\.|support\.|moderation\.)/.test(type)) {
    const result = applyOperations(next,type,payload,profile);
    next.audit.push({type,id:payload.id || result.reference || ''});
    return {next,result};
  }
  const business = next.businesses.find(row => row.id === payload.id);
  const offer = next.promotions.find(row => row.id === payload.id);
  const adminAction = /^(business\.(approve|reject|archive|restore|visibility|verify)|promotion\.(approve|reject)|member\.)/.test(type);
  if (adminAction && !isAdmin(profile)) throw new Error('Administrator preview required.');
  const id = `demo-${Date.now()}-${next.audit.length}`;
  let result;
  const syncBusiness = row => { next.publicBusinesses = next.publicBusinesses.filter(item => item.id !== row.id); if (published(row)) next.publicBusinesses.push(toPublicBusiness(row.id, { ...row, status: 'approved' })); };
  switch (type) {
    case 'saved.add': next.savedIds = [...new Set([...next.savedIds,payload.id])]; break;
    case 'saved.remove': next.savedIds = next.savedIds.filter(item => item !== payload.id); break;
    case 'notifications.clear': next.notifications = next.notifications.filter(row => row.moderation); break;
    case 'notification.read': next.notifications = next.notifications.map(row => row.id === payload.id ? { ...row, read: true } : row); break;
    case 'notification.appeal': {
      const notice=next.notifications.find(row=>row.id===payload.id);
      if(!notice || notice.appealStatus==='submitted') throw new Error('This appeal is unavailable.');
      const business=next.businesses.find(row=>row.id===(notice.businessId || 'archive'));
      next.notifications=next.notifications.map(row=>row.id===payload.id?{...row,appealStatus:'submitted',read:true}:row);
      next.moderationCases.unshift({id,category:'business-appeal',subject:`Appeal: ${business.name}`,businessId:business.id,businessName:business.name,city:business.location.city,message:payload.reason,originalDecision:notice.decision || notice.body,reporterName:profile.fullName || 'Example Member',reporterEmail:profile.email || 'member@example.test',moderationStatus:'submitted',date:'Preview session',history:[]}); break;
    }
    case 'thread.read': next.threads.find(row => row.id === payload.id).unread = 0; break;
    case 'thread.reply': {
      const thread = next.threads.find(row => row.id === payload.id);
      if (thread.blocked || thread.adminBlocked || thread.blockedByOther) throw new Error('This conversation is blocked.');
      thread.messages.push({ id, senderUid: profile.uid, text: payload.text, date: 'Just now' }); thread.updatedMillis = Date.now(); break;
    }
    case 'thread.create': {
      const target = next.publicBusinesses.find(row => row.id === payload.businessId); if (!target) throw new Error('Business unavailable.');
      next.threads.unshift({ id, businessId: target.id, businessName: target.name, senderUid: profile.uid, ownerUid: 'fixture-owner', date: 'Just now', updatedMillis: Date.now(), unread: 0, messages: [{ id: `${id}-message`, senderUid: profile.uid, text: payload.text, date: 'Just now' }] }); result = { id }; break;
    }
    case 'thread.block': next.threads.find(row => row.id === payload.id).blocked = payload.blocked; break;
    case 'thread.report': {
      const thread=next.threads.find(row=>row.id===payload.id);
      const business=next.businesses.find(row=>row.id===thread.businessId);
      next.moderationCases.unshift({id,category:'business-conversation-report',subject:'Conversation conduct report',businessId:business.id,businessName:business.name,city:business.location.city,reportedThreadId:thread.id,message:payload.reason,reporterName:profile.fullName || 'Example Member',reporterEmail:profile.email || 'member@example.test',moderationStatus:'submitted',date:'Preview session',history:[]}); break;
    }
    case 'business.save': {
      if (business && (historical(business) || business.ownerId !== profile.uid)) throw new Error('This listing cannot be edited.');
      const { logoFile, coverFile, ...fields } = payload;
      const row = { ...business, ...fields, id: business?.id || id, ownerId: profile.uid, status: 'pending', hasPublishedVersion: business ? published(business) : false };
      next.businesses = [...next.businesses.filter(item => item.id !== row.id), row]; break;
    }
    case 'promotion.save': {
      const target = next.businesses.find(row => row.id === payload.businessId && row.ownerId === profile.uid && published(row)); if (!target) throw new Error('An approved public business is required.');
      const { imageFile, ...fields } = payload;
      const row = { ...offer, ...fields, id: offer?.id || id, ownerId: profile.uid, status: 'pending' };
      next.promotions = [...next.promotions.filter(item => item.id !== row.id),row]; next.publicPromotions = next.publicPromotions.filter(item => item.id !== row.id); break;
    }
    case 'promotion.archive': offer.status = 'archived'; next.publicPromotions = next.publicPromotions.filter(row => row.id !== offer.id); break;
    case 'promotion.approve': {
      if (!published(next.businesses.find(row => row.id === offer.businessId))) throw new Error('Publish the business first.');
      offer.status = 'active'; offer.boosted = payload.boosted; offer.rejectionReason = ''; next.publicPromotions = [...next.publicPromotions.filter(row => row.id !== offer.id),toPublicPromotion(offer.id,offer)]; break;
    }
    case 'promotion.reject': offer.status = 'rejected'; offer.rejectionReason = payload.reason; next.publicPromotions = next.publicPromotions.filter(row => row.id !== offer.id); break;
    case 'business.verify': business.abrVerification = { status: 'verified' }; break;
    case 'business.approve':
      if (!payload.referrerConfirmed || !(business.abn ? business.abrVerification?.status === 'verified' : payload.publishWithoutAbn)) throw new Error('Complete the review checks.');
      Object.assign(business, { status: 'approved', hidden: false, tier: payload.tier, hasPublishedVersion: true, rejectionReason: '', foundingMember: payload.foundingMember }); syncBusiness(business); break;
    case 'business.reject': business.status = 'rejected'; business.rejectionReason = payload.reason; break;
    case 'business.visibility': business.hidden = payload.hidden; syncBusiness(business); break;
    case 'business.archive': business.status = 'archived'; business.hasPublishedVersion = false; syncBusiness(business); next.promotions.filter(row => row.businessId === business.id).forEach(row => { row.status = 'archived'; }); next.publicPromotions = next.publicPromotions.filter(row => row.businessId !== business.id); break;
    case 'business.restore': business.status = 'pending'; business.hasPublishedVersion = false; business.hidden = true; syncBusiness(business); break;
    case 'member.update': {
      if (profile.role !== 'superAdmin' || payload.id === profile.uid) throw new Error('This account cannot be changed.');
      Object.assign(next.members.find(row => row.id === payload.id), { role: payload.role, isActive: payload.isActive }); break;
    }
    default: throw new Error('Unknown preview action.');
  }
  next.audit.push({ type, id: payload.id || id });
  return { next, result };
}
