import React,{useRef,useState} from 'react';
import RegistrationReview from './RegistrationReview';
import {registrationReviewDetail} from './registrationViewModel.mjs';

export default function SeriesApproval({api,event,onApproved,disabled}){
  const [rows,setRows]=useState(null),[selected,setSelected]=useState([]),[reviews,setReviews]=useState([]),[posters,setPosters]=useState({});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ack,setAck]=useState(false),[retry,setRetry]=useState(false);
  const lock=useRef(false),request=useRef(null),generation=useRef(0);
  React.useEffect(()=>()=>{generation.current++;},[]);
  async function run(work){if(lock.current||disabled)return;const token=generation.current;lock.current=true;setBusy(true);setError('');try{await work(()=>token===generation.current);}catch(e){if(token===generation.current)setError(e.message||'The request could not be confirmed.');}finally{if(token===generation.current){lock.current=false;setBusy(false);}}}
  const reset=ids=>{setSelected(ids);setReviews([]);setPosters({});setAck(false);request.current=null;setRetry(false);};
  const reload=()=>run(async valid=>{const detail=await api.load(event.id,false,true);if(valid()){setRows(detail.reviewOccurrences||[]);reset((detail.reviewOccurrences||[]).some(row=>row.eventId===event.id)?[event.id]:[]);}});
  const ready=reviews.length>0&&reviews.length===selected.length&&reviews.every(row=>registrationReviewDetail(row).form&&registrationReviewDetail(row).privateDetails&&(!registrationReviewDetail(row).privateDetails.hasPoster||posters[row.event.id]));
  if(!rows)return <><button className="btn-light" disabled={disabled||busy} onClick={reload}>Review series occurrences for approval</button>{error&&<p role="alert">{error}</p>}</>;
  return <section className="registration-occurrences registration-series-review" aria-label="Series approval"><h3>Approve series occurrences</h3><p>Approve this occurrence individually above, or select dates below. Review the submitted details, form and poster for every selected occurrence.</p>
    <fieldset disabled={disabled||busy||retry}><legend>Occurrences awaiting approval</legend>
      <label className="registration-check"><input type="checkbox" checked={rows.length>0&&selected.length===rows.length} onChange={()=>reset(selected.length===rows.length?[]:rows.map(row=>row.eventId))}/>Select all awaiting approval</label>
      {rows.map(row=><label className="registration-check" key={row.eventId}><input type="checkbox" checked={selected.includes(row.eventId)} onChange={()=>reset(selected.includes(row.eventId)?selected.filter(id=>id!==row.eventId):[...selected,row.eventId])}/>{row.date}{row.startTime?` · ${row.startTime}`:''} · {row.hasPendingChanges?'Submitted changes':'Unapproved'}</label>)}
      {!rows.length&&<p>No occurrences awaiting approval.</p>}
      <button className="btn-light" type="button" disabled={!selected.length} onClick={()=>run(async valid=>{const loaded=await Promise.all(selected.map(id=>api.load(id)));if(!valid())return;if(loaded.some(detail=>!detail.canApprove||detail.event.revision!==rows.find(row=>row.eventId===detail.event.id)?.revision))throw Error('The series changed. Reload the review list.');setReviews(loaded);setAck(false);setPosters({});})}>Review selected occurrences ({selected.length})</button>
    </fieldset>
    {reviews.map(row=><section className="registration-form-field" key={row.event.id}><RegistrationReview detail={registrationReviewDetail(row)} poster={posters[row.event.id]} busy={busy||retry} onPoster={()=>run(async valid=>{const image=await api.poster(row.event.id,row.pendingChanges?'pending':undefined);if(!['image/png','image/jpeg','image/webp'].includes(image.mime))throw Error('Unsupported poster format.');if(valid())setPosters(current=>({...current,[row.event.id]:`data:${image.mime};base64,${image.base64}`}));})}/></section>)}
    {reviews.length>0&&<><label className="registration-check"><input type="checkbox" checked={ack} disabled={busy||retry||!ready} onChange={e=>setAck(e.target.checked)}/>I have reviewed the submitted details, venue, form and poster for every selected occurrence.</label><button disabled={disabled||busy||!ready||!ack} onClick={()=>run(async valid=>{if(!request.current)request.current={eventId:event.id,requestId:crypto.randomUUID(),occurrences:reviews.map(row=>({eventId:row.event.id,expectedRevision:row.event.revision}))};setRetry(true);await api.approveSeries(request.current);if(valid()){setRows(null);reset([]);await onApproved?.();}})}>{retry?'Retry same approval':`Approve selected occurrences (${selected.length})`}</button></>}
    {retry&&!busy&&<p>The approval request is retained unchanged. Retry it or reload before making a different selection.</p>}
    {error&&<p role="alert">{error}</p>}<button className="btn-light" disabled={disabled||busy} onClick={reload}>Reload series review</button>
  </section>;
}
