import React from 'react';
import { UsersRound, CalendarDays, Building2, Settings, Import, Wrench, ShieldCheck, Store, BarChart3, Tags, Activity, Mail, ChevronRight } from 'lucide-react';
import '../styles/navigation.css';
const icons = { users: UsersRound, events: CalendarDays, orgs: Building2, settings: Settings, import: Import, repair: Wrench, reviews: ShieldCheck, manage: Store, members: UsersRound, statistics: BarChart3, tools: Tags, diagnostics: Activity, deliveries: Mail, moderation: ShieldCheck, messaging: Mail, troubleshooting: Activity };
export default function AdminActionPanels({ groups, onSelect }) {
  return <div className="cc-admin-groups">{groups.map(group => <section key={group.title}><h2>{group.title}</h2><div className="cc-admin-actions">{group.items.map(([key, title, description]) => {
    const Icon = icons[key] || Wrench;
    return <button className={`cc-admin-action tone-${key}`} key={key} onClick={() => onSelect(key)}><span className="cc-admin-icon"><Icon size={25} strokeWidth={1.7} aria-hidden="true"/></span><span className="cc-admin-copy"><strong>{title}</strong><span>{description}</span></span><ChevronRight size={18} aria-hidden="true"/></button>;
  })}</div></section>)}</div>;
}
