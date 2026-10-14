import { getHealthCheckQueryKey, useHealthCheck } from '@workspace/api-client-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, ArrowUpRight, BriefcaseBusiness, ChevronDown, Command, LayoutDashboard, LogOut, Plus, Search, UsersRound, Warehouse, Database, Inbox } from 'lucide-react';
import { useClerk, useUser } from '@clerk/react';
import { useState } from 'react';
import { launchMarket } from '@/lib/launch-market';

const classes = [
  ['estate', 'Estate / probate'],
  ['storage', 'Storage'],
  ['real_estate', 'Real estate'],
  ['commercial', 'Commercial'],
  ['junk', 'Junk'],
  ['package', 'Packages'],
];

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Distress Intelligence home">
      <span className="brand-mark"><Command size={17} strokeWidth={2.4} /></span>
      {!compact && <span className="brand-word">distress<span> intelligence</span></span>}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [expanded, setExpanded] = useState(true);
  const { user } = useUser();
  const clerk = useClerk();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const mainLinks = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/leads', label: 'Lead intelligence', icon: Search },
    { href: '/jobs', label: 'Field operations', icon: BriefcaseBusiness },
    { href: '/workers', label: 'People network', icon: UsersRound },
    { href: '/sources', label: 'Source registry', icon: Database },
    { href: '/client-requests', label: 'Client requests', icon: Inbox },
  ];
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-top"><Brand /></div>
        <div className="workspace-label" title="Harris, Fort Bend, Dallas, and Tarrant counties">
          <span className="workspace-dot" /> {launchMarket.shortLabel.toUpperCase()} · {launchMarket.assetClassLabel.toUpperCase()}
        </div>
        <nav className="side-nav">
          {mainLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-item ${path === href || (href === '/leads' && path.startsWith('/leads/')) ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon size={17} />
              <span>{label}</span>
              {href === '/leads' && <span className="nav-hotkey">⌘ K</span>}
            </Link>
          ))}
        </nav>
        <button className="section-toggle" onClick={() => setExpanded(!expanded)} data-testid="button-toggle-asset-classes">
          <span>ASSET CLASSES</span>
          <ChevronDown size={14} className={expanded ? '' : 'rotate-180'} />
        </button>
        {expanded && <nav className="class-nav">
          {classes.map(([key, label]) => {
            const href = key === 'estate' ? '/leads/estates' : key === 'package' ? '/leads/packages' : `/leads/${key}`;
            return <Link key={key} href={href} className={`class-item ${path === href ? 'active' : ''}`} data-testid={`link-class-${key}`}>
              <span className={`class-square ${key}`} />
              {label}
            </Link>;
          })}
        </nav>}
        <div className="sidebar-bottom">
          <div className="system-status"><span className={`status-lamp ${health.isError ? 'offline' : ''}`} /><span>{health.isLoading ? 'Connecting' : health.isError ? 'API unavailable' : 'Systems operational'}</span><button onClick={() => health.refetch()} aria-label="Refresh system status" data-testid="button-refresh-health"><Activity size={14} /></button></div>
          <div className="operator">
            <div className="operator-avatar">{user?.firstName?.slice(0, 1) || 'O'}</div>
            <div className="operator-meta"><strong>{user?.fullName || 'Operator'}</strong><span>Decision desk</span></div>
            <button className="icon-button light" aria-label="Sign out" onClick={() => clerk.signOut({ redirectUrl: import.meta.env.BASE_URL || '/' })} data-testid="button-sign-out"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>
      <main className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>INTELLIGENCE</span><span className="crumb-divider">/</span><strong>{path === '/dashboard' ? 'Overview' : path.split('/').filter(Boolean).slice(-1)[0]?.replaceAll('_', ' ')}</strong></div>
          <div className="topbar-actions"><span className="date-stamp mono">{new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()).toUpperCase()}</span><Link href="/leads/new" className="button button-primary top-add" data-testid="link-create-lead"><Plus size={15} /> New lead</Link></div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="page-heading reveal">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-glyph"><Warehouse size={21} /></div><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton-list" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div className="skeleton-row" key={i}><i /><span /><b /></div>)}</div>;
}

export function ErrorState({ message, retry }: { message?: string; retry: () => void }) {
  return <div className="error-state"><div><strong>Could not load this view</strong><span>{message || 'The service did not respond. Your work has not been changed.'}</span></div><button className="button button-secondary" onClick={retry} data-testid="button-retry">Try again</button></div>;
}

export function StatusPill({ value }: { value: string }) {
  return <span className={`status-pill state-${value}`}>{value.replaceAll('_', ' ')}</span>;
}

export function AssetLabel({ value }: { value: string }) {
  const label = value === 'estate' ? 'Estate / probate' : value.replaceAll('_', ' ');
  return <span className="asset-label"><i className={`class-square ${value}`} />{label}</span>;
}

export function Currency({ value, currencyCode = 'USD' }: { value: number | null | undefined; currencyCode?: string | null }) {
  if (value === null || value === undefined) return <span className="muted-value">—</span>;
  if (currencyCode === null) return <span className="mono">{new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}</span>;
  try {
    return <span className="mono">{new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value)}</span>;
  } catch {
    return <span className="mono">{new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)} {currencyCode}</span>;
  }
}

export function TableLeadActions({ id }: { id: string }) {
  return <Link href={`/leads/${id}`} className="row-open" data-testid={`link-open-lead-${id}`}>Inspect <ArrowUpRight size={14} /></Link>;
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return <label className="field-label">{children}{hint && <small>{hint}</small>}</label>;
}

