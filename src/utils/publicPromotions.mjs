import { PROMOTION_AUDIENCE_ENABLED } from '../config/releaseGates.mjs';
import { safeWebsite } from './publicBusinesses.mjs';

const text = value => typeof value === 'string' ? value.trim() : '';
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const millis = value => {
  const result = typeof value?.toMillis === 'function' ? value.toMillis() : Number(value?.seconds) * 1000;
  return Number.isFinite(result) ? result : 0;
};

// Match the native app's UTC calendar-day eligibility, including open-ended legacy offers.
export function promotionIsActive(promotion, today = new Date().toISOString().slice(0, 10)) {
  return promotion.status === 'active' && promotion.hidden !== true
    && (!promotion.startDate || validDate(promotion.startDate) && promotion.startDate <= today)
    && (!promotion.endDate || validDate(promotion.endDate) && promotion.endDate >= today)
    && !(promotion.startDate && promotion.endDate && promotion.startDate > promotion.endDate);
}

// Explicit public projection: no owner, moderation, storage-path or submission fields.
export function toPublicPromotion(id, data = {}) {
  if (data.status !== 'active' || data.hidden === true || !text(data.businessId) || !text(data.title)) return null;
  if (['startDate', 'endDate'].some(key => data[key] != null && typeof data[key] !== 'string')) return null;
  return {
    id: text(id), businessId: text(data.businessId), title: text(data.title),
    briefText: text(data.briefText), discountText: text(data.discountText), fullDetails: text(data.fullDetails),
    startDate: text(data.startDate), endDate: text(data.endDate), imageUrl: safeWebsite(data.imageUrl),
    approvedAudience: data.approvedAudience === 'australia' ? 'australia' : 'local',
    status: 'active', hidden: false, boosted: data.boosted === true,
    updatedMillis: millis(data.updatedAt) || millis(data.approvedAt),
  };
}

export function activePublicPromotions(promotions, businesses, { city, businessId, today, audienceEnabled = PROMOTION_AUDIENCE_ENABLED } = {}) {
  const visible = new Map(businesses.map(business => [business.id, business]));
  return promotions.filter(promotion => promotionIsActive(promotion, today))
    .filter(promotion => visible.has(promotion.businessId)
      && (!city || audienceEnabled && promotion.approvedAudience === 'australia' || visible.get(promotion.businessId).city === city)
      && (!businessId || promotion.businessId === businessId))
    .map(promotion => ({ ...promotion, business: visible.get(promotion.businessId) }))
    .sort((a, b) => Number(b.boosted) - Number(a.boosted) || b.updatedMillis - a.updatedMillis || a.id.localeCompare(b.id));
}
