// Local proposal only. The reference and deployable rules files remain untouched.
export function buildRuleCandidate(reference) {
  function replaceOnce(before, after) {
    if (reference.split(before).length !== 2) throw new Error('Reference rules changed; review the candidate patch before applying it.');
    reference = reference.replace(before, after);
  }
  replaceOnce('    function isBusinessOwner(data) {', `    // Candidate: tolerate older profiles without status fields, but honour
    // explicit inactive, archived and banned states independently of the UI.
    function isActiveDirectoryMember() {
      return isRegistered()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && userDoc().data.get('isActive', true) == true
        && userDoc().data.get('active', true) == true
        && !(userDoc().data.get('accountStatus', 'active') in ['archived', 'banned', 'deleted']);
    }
    function isBusinessOwner(data) {`);
  replaceOnce(`      allow create: if isRegistered()
                      && request.resource.data.ownerId == request.auth.uid
                      && validBusinessCreate(request.resource.data)`, `      allow create: if isActiveDirectoryMember()
                      && request.resource.data.ownerId == request.auth.uid
                      && validBusinessCreate(request.resource.data)`);
  // Keep authority fields immutable without dereferencing fields absent on older
  // listings. Do not let an owner add defaults, remove fields or change a value.
  replaceOnce(`                          && request.resource.data.tier == resource.data.tier
                          && request.resource.data.foundingMember == resource.data.foundingMember`,
    `                          && !request.resource.data.diff(resource.data).affectedKeys()
                            .hasAny(['tier', 'foundingMember'])`);
  replaceOnce(`    match /publicBusinesses/{businessId} {
      allow read: if true;
      allow create, update: if isAdmin();
      allow delete: if isAdmin()
                    || (isRegistered()
                        && get(/databases/$(database)/documents/businesses/$(businessId)).data.ownerId
                          == request.auth.uid);
    }`, `    // Check the authoritative private record before and after an atomic write.
    // A forged public city cannot grant authority over another city's business.
    function cityAdminOwnsProjectionScope(businessId, projection) {
      return isCityAdminForBusiness(
          get(/databases/$(database)/documents/businesses/$(businessId)).data,
          getAfter(/databases/$(database)/documents/businesses/$(businessId)).data)
        && businessCity(projection) == adminCity();
    }
    match /publicBusinesses/{businessId} {
      allow read: if true;
      allow create: if isActiveDirectoryMember()
        && (isSuperAdmin() || cityAdminOwnsProjectionScope(businessId, request.resource.data));
      allow update: if isActiveDirectoryMember()
        && (isSuperAdmin()
          || (cityAdminOwnsProjectionScope(businessId, request.resource.data)
            && businessCity(resource.data) == adminCity()));
      allow delete: if isActiveDirectoryMember()
        && (isSuperAdmin()
          || cityAdminOwnsProjectionScope(businessId, resource.data)
          || get(/databases/$(database)/documents/businesses/$(businessId)).data.ownerId == request.auth.uid);
    }`);
  replaceOnce(`    function isHostThreadParticipant(data) {
      return isRegistered()
        && request.auth.uid in data.participantUids;
    }`,
  `    function isHostThreadParticipant(data) {
      return isActiveDirectoryMember()
        && request.auth.uid in data.participantUids;
    }
    function hostThreadMatchesEvent(data) {
      let event = get(/databases/$(database)/documents/events/$(data.eventId)).data;
      let host = event.get('createdByUserId', '') != '' ? event.createdByUserId
        : event.get('ownerUid', '') != '' ? event.ownerUid
        : event.get('createdByUid', '') != '' ? event.createdByUid : event.get('userId', '');
      return data.hostUid == host && event.get('hidden', false) == false
        && !(event.get('status', 'active') in ['inactive', 'archived', 'deleted', 'cancelled']);
    }`);
  replaceOnce(`      allow create: if isRegistered()
        && request.resource.data.type == 'host'`,
  `      allow create: if isActiveDirectoryMember()
        && hostThreadMatchesEvent(request.resource.data)
        && request.resource.data.type == 'host'`);
  replaceOnce(`          getAfter(/databases/$(database)/documents/hostMessageThreads/$(threadId)).data
        ) && request.resource.data.senderUid == request.auth.uid;`,
  `          getAfter(/databases/$(database)/documents/hostMessageThreads/$(threadId)).data
        ) && request.resource.data.senderUid == request.auth.uid
          && request.resource.data.text is string
          && request.resource.data.text.size() > 0
          && request.resource.data.text.size() <= 2000;`);
  replaceOnce(`    function businessThreadAdminModerationOnly() {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([`, `    function businessThreadAdminModerationOnly() {
      let business = get(/databases/$(database)/documents/businesses/$(resource.data.businessId)).data;
      return isActiveDirectoryMember()
        && (isSuperAdmin() || isCityAdminForBusiness(business, business))
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([`);
  return '// EMULATOR-ONLY CANDIDATE — NOT APPROVED FOR DEPLOYMENT\n' + reference;
}
