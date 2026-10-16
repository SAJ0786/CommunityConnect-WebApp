// UI checks are guidance; the callable verifies the current request and authority again.
export function promotionApprovalPayload(promotionId, promotion, options = {}) {
  if (options.confirmAudience !== true) throw new Error('Explicitly confirm the promotion audience.');
  if (!['local', 'australia'].includes(options.audience)) throw new Error('Choose local city or Australia-wide.');
  if (options.audience === 'australia' && promotion.requestedAudience !== 'australia') {
    throw new Error('A local request cannot be approved Australia-wide.');
  }
  return { promotionId, audience: options.audience, confirmAudience: true, boosted: Boolean(options.boosted) };
}
