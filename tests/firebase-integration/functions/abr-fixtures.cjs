'use strict';
// Checksum-valid identifier with deliberately synthetic names. Never an ABR claim.
exports.lookupAbrFixture = async abn => {
  if (abn !== '51824753556') throw new Error('Only the documented synthetic ABN fixture is available in this rehearsal.');
  return { Abn: abn, AbnStatus: 'Active', EntityName: 'Synthetic Directory Test Entity',
    BusinessName: ['Example Community Catering'], TradingName: [], AddressState: 'NSW', AddressPostcode: '2150' };
};
