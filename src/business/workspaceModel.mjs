import { validateBusinessHours } from './businessHours.mjs';
import { safeWebsite } from '../utils/publicBusinesses.mjs';
import { BUSINESS_CATEGORIES } from './categories.mjs';
import { LEGAL_DOCUMENT_VERSION } from '../config/legal.mjs';
export const historical = row => ['archived', 'deleted'].includes(row?.status);
export const published = row => !!row && !historical(row) && !row.hidden && (row.status === 'approved' || row.hasPublishedVersion === true);
export const statusLabel = status => ({ pending: 'Pending review', approved: 'Approved', rejected: 'Changes required', active: 'Active', archived: 'Archived', deleted: 'Deleted record', draft: 'Draft' })[status] || status;
export const isAdmin = profile => ['admin', 'superAdmin'].includes(profile?.role);
export const validAbn = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return /^\d{11}$/.test(digits) && [10,1,3,5,7,9,11,13,15,17,19].reduce((sum, weight, i) => sum + (Number(digits[i]) - (i === 0 ? 1 : 0)) * weight, 0) % 89 === 0;
};
export function listingErrors(form) {
  const errors = {};
  if (form.name.trim().length < 2) errors.name = 'Enter the business name.';
  if (form.abnStatus === 'has' && !validAbn(form.abn)) errors.abn = 'Enter a valid 11-digit ABN.';
  if (!form.categoryIds.length || !form.subcategoryIds.length) errors.categories = 'Choose at least one category and service.';
  if (form.description.trim().length < 40) errors.description = 'Describe the business in at least 40 characters.';
  if (form.contact.phone.replace(/\D/g, '').length < 8) errors.phone = 'Enter a valid business phone.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact.email)) errors.email = 'Enter a valid business email.';
  if (!form.location.fullAddress || !form.location.suburb || !form.location.postcode || !form.location.state || form.location.latitude == null || form.location.longitude == null) errors.location = 'Select an address from the suggestions.';
  if (form.referrer.name.trim().length < 2 || !/^04\d{8}$/.test(form.referrer.phone.replace(/\D/g, '').replace(/^61/, '0')) || form.referrer.location.trim().length < 2 || !form.referrer.consentConfirmed) errors.referrer = 'Complete the referrer details and confirm their consent.';
  if (!form.listingDeclarationAccepted) errors.declaration = 'Accept the listing declaration.';
  const hours = validateBusinessHours(form.hours); if (hours) errors.hours = hours;
  if ([form.contact.website, ...Object.values(form.social)].some(value => value && !safeWebsite(value))) errors.links = 'Use valid http or https website and social links.';
  return errors;
}
export function promotionErrors(form) {
  const errors = {};
  if (!form.businessId) errors.businessId = 'Choose an approved business.';
  if (form.title.trim().length < 3) errors.title = 'Enter a promotion title.';
  if (form.briefText.trim().length < 10) errors.briefText = 'Add a summary of at least 10 characters.';
  if (form.fullDetails.trim().length < 20) errors.fullDetails = 'Add full terms and conditions (at least 20 characters).';
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(form.startDate) || !valid(form.endDate) || form.endDate < form.startDate) errors.dates = 'Choose valid dates with the end on or after the start.';
  if (!form.declaration) errors.declaration = 'Confirm the promotion declaration.';
  return errors;
}
export function emptyListing(initial = {}) {
  return { name: '', abnStatus: 'none', abn: '', description: '', categoryIds: [], subcategoryIds: [], hours: {}, hoursSummary: '', ...initial,
    contact: { phone: '', email: '', website: '', whatsapp: '', ...initial.contact },
    social: { facebook: '', instagram: '', twitter: '', ...initial.social },
    location: { fullAddress: '', suburb: '', state: '', postcode: '', city: 'sydney', publicDisplay: 'suburb', ...initial.location },
    referrer: { name: '', phone: '', location: '', ...initial.referrer, consentConfirmed: false }, listingDeclarationAccepted: false };
}
export function listingSubmission(form, catalogue = BUSINESS_CATEGORIES) {
  const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key]]));
  return { ...pick(form, ['name','abnStatus','description','categoryIds','subcategoryIds','hours','hoursSummary','listingDeclarationAccepted','logoFile','coverFile','logoUrl','coverUrl']),
    categoryId: form.categoryIds[0] || '',
    category: catalogue.find(row => row.id === form.categoryIds[0])?.label || '',
    categories: catalogue.filter(row => form.categoryIds.includes(row.id)).map(row => row.label),
    subcategories: catalogue.filter(row => form.categoryIds.includes(row.id)).flatMap(row => row.subcategories).filter(row => form.subcategoryIds.includes(row.id)).map(row => row.label),
    abn: form.abnStatus === 'has' ? form.abn : '',
    listingTermsVersion: LEGAL_DOCUMENT_VERSION,
    listingConsentAtClient: new Date().toISOString(),
    contact: pick(form.contact,['phone','email','website','whatsapp']),
    social: pick(form.social,['facebook','instagram','twitter']),
    location: pick(form.location,['fullAddress','suburb','state','postcode','city','latitude','longitude','publicDisplay']),
    referrer: pick(form.referrer,['name','phone','location','consentConfirmed']) };
}
export function promotionSubmission(form) {
  return Object.fromEntries(['businessId','title','briefText','discountText','fullDetails','startDate','endDate','imageFile','imageUrl'].map(key => [key,form[key]]));
}
export function scopedBusinesses(rows, profile) {
  return profile?.role === 'superAdmin' ? rows : rows.filter(row => row.location?.city === (profile?.adminCity || profile?.defaultCity));
}
export function aggregateStatistics(businesses, statistics) {
  const ids = new Set(businesses.filter(published).map(row => row.id));
  return statistics.filter(row => ids.has(row.id)).reduce((sum, row) => ({ pageViews: sum.pageViews + Number(row.pageViews || 0), enquiries: sum.enquiries + Number(row.enquiries || 0), actions: Object.fromEntries([...new Set([...Object.keys(sum.actions), ...Object.keys(row.actions || {})])].map(key => [key, Number(sum.actions[key] || 0) + Number(row.actions?.[key] || 0)])) }), { pageViews: 0, enquiries: 0, actions: {} });
}
