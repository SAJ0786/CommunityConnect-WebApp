import { BUSINESS_CATEGORIES } from '../../src/business/categories.mjs';
import { categoryAddition, scopedOperations, moderationOptions, supportPayload } from '../../src/business/operationsModel.mjs';
import { isAdmin } from '../../src/business/workspaceModel.mjs';

export function freshOperations() {
  return { categories: structuredClone(BUSINESS_CATEGORIES), diagnostics:{sessionId:'synthetic-directory-session',build:'offline-ui-2026-10-07',environment:'Synthetic preview; no live connection'},
    supportRequests: [
      {reference:'support-example-app',kind:'app-feedback',category:'Technical problem',senderName:'Example Reporter',senderEmail:'reporter@example.test',message:'The event screen takes longer than expected to display.',deliveryStatus:'sent',date:'7 Oct 2026',city:''},
      {reference:'support-example-business',kind:'business-report',category:'Incorrect information',senderName:'Example Reporter',senderEmail:'reporter@example.test',message:'Please review the advertised opening hours.',businessId:'example',businessName:'Example Community Catering',deliveryStatus:'queued',date:'7 Oct 2026',city:'sydney',moderationId:'case-business'},
      {reference:'support-example-failed',kind:'business-report',category:'Business closed',senderName:'Another Reporter',senderEmail:'another@example.test',message:'The business appears to be closed at the listed location.',businessId:'melbourne',businessName:'Example Melbourne Services',deliveryStatus:'failed',date:'6 Oct 2026',city:'melbourne',moderationId:'case-melbourne'}
    ],
    moderationCases:[
      {id:'case-business',category:'business-report',subject:'Opening hours report',businessId:'example',businessName:'Example Community Catering',city:'sydney',message:'The advertised opening hours may be incorrect.',reporterName:'Example Reporter',reporterEmail:'reporter@example.test',moderationStatus:'submitted',date:'7 Oct 2026',history:[]},
      {id:'case-conversation',category:'business-conversation-report',subject:'Conversation conduct report',businessId:'example',businessName:'Example Community Catering',city:'sydney',reportedThreadId:'thread',message:'Please review conduct in this reported conversation.',reporterName:'Example Member',reporterEmail:'member@example.test',moderationStatus:'under-review',date:'7 Oct 2026',history:[{decision:'under-review',reason:'Report received and ready for staff assessment.',actorLabel:'Example administrator',date:'7 Oct 2026'}]},
      {id:'case-appeal',category:'business-appeal',subject:'Archived listing appeal',businessId:'archive',businessName:'Example Former Kitchen',city:'sydney',message:'The business has corrected its details and requests another review.',originalDecision:'Archived after listing review',reporterName:'Example Owner',reporterEmail:'owner@example.test',moderationStatus:'submitted',date:'7 Oct 2026',history:[]},
      {id:'case-melbourne',category:'business-report',subject:'Closed business report',businessId:'melbourne',businessName:'Example Melbourne Services',city:'melbourne',message:'The business appears to be closed.',reporterName:'Another Reporter',reporterEmail:'another@example.test',moderationStatus:'submitted',date:'6 Oct 2026',history:[]}
    ] };
}

export function applyOperations(next,type,payload,profile) {
  if(type.startsWith('category.')) {
    if(!isAdmin(profile)) throw new Error('Administrator access required.');
    const item=categoryAddition(next.categories,payload,type==='category.addService');
    if(type==='category.addService') next.categories.find(row=>row.id===payload.categoryId).subcategories.push(item);
    else next.categories.push(item);
    return {};
  }
  if(type==='support.submit') {
    const business=payload.businessId?next.publicBusinesses.find(row=>row.id===payload.businessId):undefined;
    if(payload.businessId&&!business) throw new Error('This business is not available.');
    const fields=supportPayload(payload,business);
    if(!/^support_[\w-]{10,100}$/.test(payload.requestId)) throw new Error('A support reference is required.');
    const fingerprint=JSON.stringify(fields);
    const existing=next.supportRequests.find(row=>row.reference===payload.requestId);
    if(existing&&existing.fingerprint!==fingerprint) throw new Error('The support reference belongs to a different request.');
    if(!existing) {
      const record={...fields,reference:payload.requestId,fingerprint,city:business?.city || '',businessName:business?.name || '',date:'Preview session',deliveryStatus:'queued'};
      if(business) { record.moderationId=`case-${payload.requestId}`; next.moderationCases.unshift({id:record.moderationId,category:'business-report',subject:fields.category,businessId:business.id,businessName:business.name,city:business.city,message:fields.message,reporterName:fields.senderName,reporterEmail:fields.senderEmail,moderationStatus:'submitted',date:'Preview session',history:[]}); }
      next.supportRequests.unshift(record);
    }
    return {reference:payload.requestId,receiptMessage:'Simulated submission recorded. No email was sent. Replies in the live workflow are handled by email.'};
  }
  if(type==='moderation.decide') {
    const report=scopedOperations(next.moderationCases,profile).find(row=>row.id===payload.id);
    if(!report) throw new Error('This case is not in your administrator scope.');
    const reason=String(payload.reason || '').trim();
    if(reason.length<10||reason.length>2500) throw new Error('Add a decision reason of 10–2500 characters.');
    if(!moderationOptions(report,next.businesses,next.threads).includes(payload.decision)) throw new Error('This moderation action is unavailable.');
    if(report.moderationStatus===payload.decision) throw new Error('This decision has already been recorded.');
    const business=next.businesses.find(row=>row.id===report.businessId);
    if(payload.decision==='takedown') {
      business.status='archived'; business.hasPublishedVersion=false;
      next.publicBusinesses=next.publicBusinesses.filter(row=>row.id!==business.id);
      next.promotions.filter(row=>row.businessId===business.id).forEach(row=>{row.status='archived';});
      next.publicPromotions=next.publicPromotions.filter(row=>row.businessId!==business.id);
    }
    if(payload.decision==='conversation-blocked') next.threads.find(row=>row.id===report.reportedThreadId).adminBlocked=true;
    report.moderationStatus=payload.decision;
    report.history.push({decision:payload.decision,reason,actorLabel:profile.fullName || 'Preview administrator',date:'Preview session'});
    if(business?.ownerId===profile.uid) next.notifications.unshift({id:`notice-${report.id}-${report.history.length}`,title:`Moderation decision: ${business.name}`,body:reason,date:'Preview session',read:false,moderation:true,businessId:business.id,reportId:report.id,decision:payload.decision});
    return {};
  }
  throw new Error('Unknown operations action.');
}
