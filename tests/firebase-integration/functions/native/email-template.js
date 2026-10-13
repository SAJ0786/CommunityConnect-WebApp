'use strict';
// Delivery/rendering is intentionally unavailable in the isolated callable harness.
const disabled = () => { throw new Error('Email rendering and delivery are disabled in this rehearsal.'); };
module.exports = { renderEmail: disabled, detailRows: disabled, escapeHtml: disabled, emailBrand: disabled };
