'use strict';
const { randomBytes, createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const inactive = p => !p || p.isActive === false || p.active === false || p.bannedAt || p.archivedAt || p.accountDeletedAt || ['inactive','banned','archived','deleted','suspended'].includes(p.accountStatus);
const escape = value => String(value || '').replace(/\\/g,'\\\\').replace(/[\r\n]+/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
const stamp = value => new Date(value).toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
function serialize(lines) {
  return lines.flatMap(line => { const folded=[];let part='';for(const char of line){if(Buffer.byteLength(part+char)>74){folded.push(part);part=' '+char;}else part+=char;}folded.push(part);return folded; }).join('\r\n')+'\r\n';
}
const empty = () => serialize(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Community Connect Australia//Calendar//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:Community Connect Australia','END:VCALENDAR']);

function createCalendarHandlers({db,auth,HttpsError,serverTimestamp,now=()=>new Date(),cityModel=()=>import('./calendar-cities.mjs'),scheduleModel=()=>import('./calendar-schedule.mjs')}) {
  const fail=(code,message)=>{throw new HttpsError(code,message);};
  async function resolver() {
    const model=await cityModel(),settings=await db.collection('settings').doc('cityCatalogue').get();
    return model.createCityResolver(settings.exists ? settings.data() : model.BUNDLED_CITY_CATALOGUE);
  }
  async function account(uid) {
    let user;try {user=await auth.getUser(uid);}catch(e){if(e.code==='auth/user-not-found')return null;throw e;}
    if(user.disabled)return null;
    const snapshot=await db.collection('users').doc(uid).get(),profile=snapshot.data();
    return inactive(profile)?null:profile;
  }
  async function create(request) {
    const uid=request.auth?.uid;
    if(!uid || request.auth.token?.firebase?.sign_in_provider==='anonymous')fail('unauthenticated','Sign in before syncing your calendar.');
    const profile=await account(uid),cities=await resolver();
    if(!profile)fail('permission-denied','An active member account is required.');
    if(!profile.defaultCity || !cities.enabled(profile.defaultCity))fail('failed-precondition','Choose an available default city in Profile before syncing your calendar.');
    const secret=randomBytes(32).toString('base64url'),tokenRef=db.collection('calendarFeedTokens').doc(hash(secret));
    const subscription=db.collection('calendarSubscriptions').doc(uid),limit=db.collection('calendarFeedIssueLimits').doc(uid);
    await db.runTransaction(async tx=>{
      const [current,quota,member]=await Promise.all([tx.get(subscription),tx.get(limit),tx.get(db.collection('users').doc(uid))]);
      if(inactive(member.data()) || !member.data().defaultCity || !cities.enabled(member.data().defaultCity))fail('failed-precondition','Choose an available default city before syncing.');
      const hour=now().toISOString().slice(0,13),saved=quota.data()||{},count=saved.hour===hour?Number(saved.count)||0:0;
      if(count>=10)fail('resource-exhausted','Too many new calendar links. Please try again later.');
      tx.set(tokenRef,{uid,active:true,createdAt:serverTimestamp()});
      tx.set(limit,{hour,count:count+1,updatedAt:serverTimestamp()});
      const prior=current.data()||{};
      // Only already-used legacy feeds keep UID access. New subscribers never get it.
      tx.set(subscription,{active:true,legacyEnabled:prior.legacyEnabled===true || (prior.legacyEnabled!==false && Boolean(prior.lastPolled)),updatedAt:serverTimestamp()},{merge:true});
    });
    return {url:'https://communityevents.siza.info/cal?s='+secret};
  }
  async function feed(req,res) {
    res.set('Content-Type','text/calendar; charset=utf-8');res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
    const unavailable=()=>res.status(200).send(empty());
    try {
      let uid;
      if(typeof req.query.s==='string' && /^[A-Za-z0-9_-]{43}$/.test(req.query.s)) {
        const token=(await db.collection('calendarFeedTokens').doc(hash(req.query.s)).get()).data();
        if(!token || token.active!==true)return unavailable();uid=token.uid;
      } else {
        const old=req.query.t || req.query.token;
        if(typeof old!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(old))return unavailable();
        const subscription=(await db.collection('calendarSubscriptions').doc(old).get()).data();
        if(!subscription || subscription.active===false || subscription.legacyEnabled===false || (!subscription.lastPolled && subscription.legacyEnabled!==true))return unavailable();
        uid=old;
      }
      const [profile,cities,subscription]=await Promise.all([account(uid),resolver(),db.collection('calendarSubscriptions').doc(uid).get()]);
      if(!profile || subscription.data()?.active===false || !profile.defaultCity || !cities.enabled(profile.defaultCity))return unavailable();
      const city=profile.defaultCity;
      const [ordinary,registrations]=await Promise.all([db.collection('events').where('status','==','active').get(),db.collection('registrationEvents').where('status','==','approved').get()]);
      const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Community Connect Australia//Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Community Connect Australia','REFRESH-INTERVAL;VALUE=DURATION:PT1H','X-PUBLISHED-TTL:PT1H'];
      const schedule=await scheduleModel();
      const rows=[...ordinary.docs.map(d=>({id:d.id,...d.data()})),...registrations.docs.map(d=>({...d.data(),id:d.id,registrationOnly:true}))];
      rows.sort((a,b)=>String(a.eventDate||a.date).localeCompare(String(b.eventDate||b.date)));
      for(const event of rows) {
        if(event.hidden || event.deletedAt || (event.registrationOnly?event.city:cities.getEventMetroArea(event))!==city)continue;
        const date=event.eventDate||event.date,time=event.startTime,end=event.endTime;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))continue;
        const day=new Date(date+'T00:00:00Z');if(!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10)!==date)continue;
        const entry=['BEGIN:VEVENT','UID:'+(event.registrationOnly?'registration-':'')+escape(event.id)+'@community-events','DTSTAMP:'+stamp(now())];
        try {
          if(time){const zone=cities.cities.find(c=>c.id===city)?.timeZone || event.timeZone || event.prayerTimeZone;if(!zone)continue;
            const start=schedule.registrationInstant(date,time,zone);entry.push('DTSTART:'+stamp(start));
            if(end){let endDate=date;if(end<time){const next=new Date(day);next.setUTCDate(next.getUTCDate()+1);endDate=next.toISOString().slice(0,10);}const finish=schedule.registrationInstant(endDate,end,zone);if(Date.parse(finish)>Date.parse(start))entry.push('DTEND:'+stamp(finish));}
          }else{entry.push('DTSTART;VALUE=DATE:'+date.replaceAll('-',''));day.setUTCDate(day.getUTCDate()+1);entry.push('DTEND;VALUE=DATE:'+day.toISOString().slice(0,10).replaceAll('-',''));}
        }catch{continue;}
        entry.push('SUMMARY:'+escape(event.title || [event.eventType||'Event',event.hostName].filter(Boolean).join(' - ')));
        const suburb=event.suburb || event.address?.suburb;if(suburb)entry.push('LOCATION:'+escape(suburb));
        // No free-form notes, full address, host contact, answers, URLs to private media or pending drafts.
        entry.push('DESCRIPTION:Open the event in Community Connect Australia for current details.','URL:https://communityconnect.siza.info/?'+(event.registrationOnly?'registration=':'event=')+encodeURIComponent(event.id),'END:VEVENT');
        lines.push(...entry);
      }
      // Recheck changes that occurred while the feed was being assembled.
      const latest=await account(uid),latestSubscription=(await db.collection('calendarSubscriptions').doc(uid).get()).data();
      if(!latest || latest.defaultCity!==city || latestSubscription?.active===false)return unavailable();
      if(req.query.s){const latestToken=(await db.collection('calendarFeedTokens').doc(hash(req.query.s)).get()).data();if(latestToken?.active!==true)return unavailable();}
      // A read cannot reactivate a revoked subscription or recreate its eligibility.
      await db.collection('calendarSubscriptions').doc(uid).set({lastPolled:serverTimestamp()},{merge:true});
      return res.status(200).send(serialize([...lines,'END:VCALENDAR']));
    }catch(error){return res.status(503).send('Calendar temporarily unavailable. Please retry later.');}
  }
  return {create,feed};
}
module.exports={createCalendarHandlers,serialize,empty};
