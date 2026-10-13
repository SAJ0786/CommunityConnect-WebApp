import { isAdmin } from './workspaceModel.mjs';

export const APP_SUPPORT_CATEGORIES = ['App feedback / suggestion', 'Technical problem', 'Account / login issue', 'Privacy enquiry', 'Other'];
export const BUSINESS_REPORT_CATEGORIES = ['Incorrect information', 'Misleading or unsafe conduct', 'Suspected fraud or impersonation', 'Inappropriate content', 'Business closed', 'Other'];
export const MODERATION_DECISIONS = { 'under-review': 'Under review', dismissed: 'Dismiss report', takedown: 'Take down business', 'conversation-blocked': 'Block reported conversation', 'conversation-unblocked': 'Remove administrator conversation block', closed: 'Close review' };
export const cleanCategoryName = value => String(value || '').trim().replace(/\s+/g, ' ');
const duplicateKey = value => cleanCategoryName(value).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'');
export const categorySlug = value => cleanCategoryName(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

export function categoryAddition(categories, { label: input, icon, categoryId }, subcategory = false) {
  const label = cleanCategoryName(input), id = categorySlug(label);
  const max = subcategory ? 80 : 60;
  if (label.length < 2 || label.length > max || !id) throw new Error(`Enter a name between 2 and ${max} characters.`);
  const parent = subcategory ? categories.find(row => row.id === categoryId) : null;
  if (subcategory && !parent) throw new Error('Choose an existing parent category.');
  if ((parent ? parent.subcategories : categories).some(row => row.id === id || duplicateKey(row.label) === duplicateKey(label))) throw new Error(`${label} already exists${parent ? ` under ${parent.label}` : ''}.`);
  return subcategory ? { id, label, custom: true, categoryId } : { id, label, icon: icon || '🏷️', custom: true, subcategories: [] };
}

export function supportPayload(form, business) {
  const senderName = String(form.senderName || '').trim();
  const senderEmail = String(form.senderEmail || '').trim();
  const message = String(form.message || '').trim();
  const categories = business ? BUSINESS_REPORT_CATEGORIES : APP_SUPPORT_CATEGORIES;
  if (!senderName || senderName.length > 100 || senderEmail.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderEmail) || message.length < 10 || message.length > 2500 || !categories.includes(form.category)) throw new Error('Enter your name, a valid email, a category and 10–2500 characters of detail.');
  return { kind: business ? 'business-report' : 'app-feedback', businessId: business?.id || '', category: form.category, senderName, senderEmail, message };
}

// City comes from the record supplied by an authorised adapter, not the reporter.
export function scopedOperations(rows = [], profile) {
  if (!isAdmin(profile)) return [];
  return profile.role === 'superAdmin' ? rows : rows.filter(row => row.city && row.city === (profile.adminCity || profile.defaultCity));
}

export function moderationOptions(report, businesses, threads) {
  if (Array.isArray(report.availableDecisions)) return report.availableDecisions.filter(value => Object.hasOwn(MODERATION_DECISIONS,value));
  const options = ['under-review','dismissed'];
  if (businesses.some(row => row.id === report.businessId && !['archived','deleted'].includes(row.status))) options.push('takedown');
  if (threads.some(row => row.id === report.reportedThreadId && row.businessId === report.businessId && !row.adminBlocked)) options.push('conversation-blocked');
  return [...options,'closed'];
}

// Explicit projection for copying diagnostics. Never serialize whole workspace data.
export function diagnosticSummary(data, profile, feedState) {
  const metadata = data.diagnostics || {};
  const count = value => Array.isArray(value) ? value.length : 0;
  return { diagnosticSession: String(metadata.sessionId || 'Unavailable'), build: String(metadata.build || 'Unavailable'), environment: String(metadata.environment || 'Not supplied'), feedState,
    counts: { listings: count(scopedOperations(data.businesses.map(row => ({ city: row.location?.city })),profile)), promotions: count(data.promotions.filter(row => scopedOperations(data.businesses.map(b => ({ id:b.id,city:b.location?.city })),profile).some(b => b.id === row.businessId))), categories: count(data.categories), supportRecords: count(scopedOperations(data.supportRequests,profile)), moderationCases: count(scopedOperations(data.moderationCases,profile)) } };
}
