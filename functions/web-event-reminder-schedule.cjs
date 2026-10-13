'use strict';
// Release candidate only: functions/index.js does not import or export this module.
const { createReminderHandlers } = require('./web-event-reminders.cjs');
exports.createReminderSweep = ({ db, FieldPath, handlers, deliver, now = Date.now, pageSize = 100, maxRecords = 1000, budgetMs = 45000 }) => async () => {
  const control = db.collection('webReminderWorkerState').doc('sweep');
  const started = now();
  let cursor = (await control.get()).data()?.cursor || '', examined = 0, acknowledged = 0;
  // Scan pending records as well as due records: an event can move earlier.
  // A persisted cursor bounds each invocation without starving later records.
  while (examined < maxRecords && now() - started < budgetMs) {
    const limit = Math.min(pageSize, maxRecords - examined);
    let query = db.collection('webEventReminders').where('status', 'in', ['pending','dispatching'])
      .orderBy(FieldPath.documentId()).limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) { cursor = ''; break; }
    for (const row of snapshot.docs) {
      const outcome = await handlers.process(row.id, deliver);
      examined += 1; if (outcome.delivered) acknowledged += 1; cursor = row.id;
      if (now() - started >= budgetMs) break;
    }
    await control.set({cursor,updatedAt:now()});
    if (snapshot.size < limit && cursor === snapshot.docs.at(-1).id) { cursor = ''; break; }
  }
  await control.set({cursor,updatedAt:now(),examined,acknowledged});
  return {examined,acknowledged,continuing:Boolean(cursor)};
};
exports.createReminderTransport = messaging => async payload => {
  // Data-only payload: one notification is rendered by our worker, avoiding
  // Firebase's automatic notification plus a second onBackgroundMessage display.
  return messaging.send({
    token:payload.token,
    data:{ type:'event-reminder', title:payload.title, body:payload.body,
      tag:payload.tag, eventId:payload.eventId, url:'/?event=' + encodeURIComponent(payload.eventId) },
    webpush:{headers:{TTL:String(Math.max(0,Math.min(3600,Math.floor(payload.ttlSeconds)))),Urgency:'high'}},
  });
};
exports.register = ({db,FieldPath,HttpsError,onCall,onSchedule,messaging,enabled = false}) => {
  if (!enabled) throw new Error('Web reminders require explicit backend activation.');
  const handlers = createReminderHandlers({db,HttpsError});
  const sweep = exports.createReminderSweep({db,FieldPath,handlers,deliver:exports.createReminderTransport(messaging)});
  const options = {region:'australia-southeast1'};
  return {
    getEventReminder:onCall(options,handlers.get),
    setEventReminder:onCall(options,handlers.set),
    removeEventReminder:onCall(options,handlers.remove),
    deliverWebEventReminders:onSchedule({...options,schedule:'every 1 minutes',timeZone:'UTC',
      timeoutSeconds:60,maxInstances:1,concurrency:1,retryCount:0},sweep),
  };
};
