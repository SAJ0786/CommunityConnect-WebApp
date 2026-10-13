import React, { useState } from 'react';
import { Badge, Panel, Metrics, Empty, ConfirmDialog } from './WorkspaceParts';
import { historical, published } from './workspaceModel.mjs';
export default function OwnerScreen({ businesses, promotions, onEdit, onAdd, onPromotion, onAction }) {
  const [remove, setRemove] = useState(null);
  return <><Metrics items={[["Listings",businesses.length],["Approved",businesses.filter(row => row.status === 'approved').length],["In review",businesses.filter(row => row.status === 'pending').length]]}/><div className="bw-actions"><button onClick={onAdd}>Add business</button></div>
    {!businesses.length && <Empty title="No businesses yet"><p>Add your first business and submit it for review.</p></Empty>}
    <div className="bw-grid">{businesses.map(row => <Panel key={row.id}><div className="bw-card-heading"><h2>{row.name}</h2><Badge status={row.status}/></div><p>{row.category || row.categories?.join(' · ')} · {row.location?.suburb}</p><p className="bw-muted">ABN: {row.abn || 'Not supplied'} · Tier: {row.tier || 'free'}</p>
      {historical(row) ? <p className="bw-notice">Read-only history. This listing is not public and cannot be edited.</p> : <>
        {row.status === 'pending' && <p className="bw-notice">{row.hasPublishedVersion ? 'Your approved listing remains public while these changes are reviewed.' : 'Your new listing is private while it is reviewed.'}</p>}
        {row.status === 'rejected' && <p className="bw-error">{row.rejectionReason || 'Review your details and resubmit.'}</p>}
        <div className="bw-actions"><button className="btn-light" onClick={() => onEdit(row)}>Edit listing</button>{published(row) && <button className="btn-light" onClick={() => onPromotion(null, row.id)}>Add promotion</button>}</div>
      </>}<p className="bw-muted">{published(row) ? 'Public listing' : 'Not public'}</p></Panel>)}</div>
    <h2>Your promotions</h2>{!promotions.length && <Empty title="No promotions yet"><p>Add an offer to an approved public business.</p></Empty>}
    <div className="bw-grid">{promotions.map(row => <Panel key={row.id}><div className="bw-card-heading"><h3>{row.title}</h3><Badge status={row.status}/></div><p>{businesses.find(b => b.id === row.businessId)?.name}</p><p>{row.discountText || row.briefText}</p><p>{row.startDate} to {row.endDate}</p>{row.rejectionReason && <p className="bw-error">{row.rejectionReason}</p>}{historical(row) ? <p>Read-only history</p> : <div className="bw-actions"><button className="btn-light" disabled={!businesses.some(b => b.id === row.businessId && published(b))} onClick={() => onPromotion(row)}>Edit promotion</button><button className="bw-danger" onClick={() => setRemove(row)}>Delete promotion</button></div>}</Panel>)}</div>
    {remove && <ConfirmDialog title="Delete promotion?" description="This removes the offer from public display and retains its history." confirmLabel="Delete promotion" onClose={() => setRemove(null)} onConfirm={() => onAction('promotion.archive', { id: remove.id })}/>}
  </>;
}
