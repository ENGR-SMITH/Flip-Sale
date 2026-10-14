import { useCreateJob, useCreateLead, useCreateWorker, useDeleteJob, useDeleteLead, useDeleteWorker, useGetDashboardSummary, useGetLead, useGetRecentActivity, useListJobs, useListLeads, useListWorkers, useListSources, useListLaunchSources, useUpdateJob, useUpdateLead, useUpdateWorker, getGetDashboardSummaryQueryKey, getGetLeadQueryKey, getGetRecentActivityQueryKey, getListJobsQueryKey, getListLeadsQueryKey, getListWorkersQueryKey, getListSourcesQueryKey, getListLaunchSourcesQueryKey } from '@workspace/api-client-react';
import type { ActivityItem, AssetClass, Job, JobInput, JobStatus, Lead, LeadDecision, LeadInput, LeadStage, RiskFlag, Worker, WorkerInput } from '@workspace/api-client-react';
import { AssetClass as AssetClassEnum, JobJobType, JobStatus as JobStatusEnum, LeadContactStatus, LeadDecision as LeadDecisionEnum, LeadStage as LeadStageEnum, RiskFlag as RiskFlagEnum } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode, FormEvent } from 'react';
import { ArrowUpRight, CalendarClock, Check, ChevronRight, CircleAlert, Clock3, ExternalLink, Filter, MapPin, Pencil, Plus, Search, Trash2, UsersRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { AssetLabel, Currency, EmptyState, ErrorState, FieldLabel, LoadingState, PageHeading, StatusPill, TableLeadActions } from '@/components/shell';
import { LeadEvidencePanel } from '@/components/lead-evidence';
import { EstateAuthorityReviewPanel } from '@/components/estate-authority-review';
import { LeadOutreachDraft } from '@/components/lead-outreach-draft';
import { launchMarket } from '@/lib/launch-market';
import { formatLaunchLocation, parseLaunchLocation } from '@workspace/api-zod';

const classNames: Record<string, string> = { estate: 'Estate / probate', storage: 'Storage', real_estate: 'Real estate', commercial: 'Commercial closure', junk: 'Junk / scrap', package: 'Multi-asset package' };
const stageNames: Record<string, string> = { detected: 'Detected', researched: 'Researched', contacted: 'Contacted', negotiating: 'Negotiating', under_contract: 'Under contract', monetizing: 'Monetizing', settled: 'Settled', dead: 'Dead' };
const scoreFields = new Set([
  'brandVisibility', 'containerComposition', 'facilityTier', 'scrapCoverage',
  'ownerContext', 'unitVisibility', 'cleanoutEase', 'auctionHorizon',
  'discountToMao', 'motivationScore', 'timelineScore', 'titleClarity',
  'buyerLiquidity', 'executorCooperation', 'resaleDensity', 'accessLogistics',
]);
const fieldLabels: Record<string, string> = {
  toolsEstimate: 'Estimated gross tools value ($)',
  electronicsEstimate: 'Estimated gross electronics value ($)',
  furnitureEstimate: 'Estimated gross furniture value ($)',
  householdEstimate: 'Estimated gross household value ($)',
  clothingEstimate: 'Estimated gross clothing value ($)',
  estimatedContentsEv: 'Contents gross value override ($)',
  executorCooperation: 'Executor urgency / cooperation score',
  resaleDensity: 'Resale density score',
  accessLogistics: 'Access / logistics score',
  timelineScore: 'Closing timeline score',
  cleanoutCost: 'Estimated cleanout cost ($)',
  dumpFees: 'Estimated disposal fees ($)',
};
const numericFields = [
  'businessSharePercent', 'brandVisibility', 'containerComposition', 'facilityTier', 'scrapCoverage', 'ownerContext', 'unitVisibility', 'cleanoutEase', 'auctionHorizon', 'resaleEstimate', 'resaleProbability', 'scrapFloor', 'cleanoutCost', 'dumpFees', 'arv', 'repairCost', 'contractPrice', 'discountToMao', 'motivationScore', 'timelineScore', 'titleClarity', 'buyerLiquidity', 'toolsEstimate', 'electronicsEstimate', 'furnitureEstimate', 'householdEstimate', 'clothingEstimate', 'estimatedContentsEv', 'executorCooperation', 'resaleDensity', 'accessLogistics', 'scrapEstimate', 'runnerPayout', 'serviceRadiusKm', 'distanceKm', 'latitude', 'longitude',
];
const nullableStringFields = new Set(['contactName', 'contactEmail', 'contactPhone', 'currencyCode', 'evidenceUrl']);
const leadInputFields: (keyof LeadInput)[] = [
  'title', 'assetClass', 'stage', 'location', 'source', 'sourceId', 'distressSignal', 'contactName', 'contactEmail', 'contactPhone',
  'contactStatus', 'currencyCode', 'riskFlags', 'businessSharePercent', 'resellableItemsFound', 'eventDate',
  'brandVisibility', 'containerComposition', 'facilityTier', 'scrapCoverage', 'ownerContext', 'unitVisibility',
  'cleanoutEase', 'auctionHorizon', 'resaleEstimate', 'resaleProbability', 'scrapFloor', 'cleanoutCost', 'dumpFees',
  'arv', 'repairCost', 'contractPrice', 'discountToMao', 'motivationScore', 'timelineScore', 'titleClarity',
  'buyerLiquidity', 'toolsEstimate', 'electronicsEstimate', 'furnitureEstimate', 'householdEstimate', 'clothingEstimate',
  'estimatedContentsEv', 'executorCooperation', 'resaleDensity', 'accessLogistics', 'scrapEstimate', 'runnerPayout',
  'serviceRadiusKm', 'distanceKm', 'latitude', 'longitude', 'evidenceUrl',
];
const blankLeadDraft: LeadDraft = {
  assetClass: 'estate',
  stage: 'detected',
  decision: 'review',
  contactStatus: 'unknown',
  title: '',
  location: '',
  source: '',
  distressSignal: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  currencyCode: 'USD',
  riskFlags: ['no_signed_authorization'],
  hardVetoes: [],
  eventDate: '',
  evidenceUrl: '',
};
function blankDraftForClass(assetClass: AssetClass): LeadDraft {
  return {
    ...blankLeadDraft,
    assetClass,
    riskFlags: assetClass === 'estate' ? ['no_signed_authorization'] : [],
  };
}
const fieldGroups: Record<string, { label: string; fields: string[] }[]> = {
  storage: [{ label: 'Unit signals', fields: ['brandVisibility', 'containerComposition', 'facilityTier', 'scrapCoverage', 'ownerContext', 'unitVisibility', 'cleanoutEase', 'auctionHorizon'] }, { label: 'Recovery estimate', fields: ['resaleEstimate', 'resaleProbability', 'scrapFloor', 'cleanoutCost', 'dumpFees'] }],
  real_estate: [{ label: 'Property underwriting', fields: ['arv', 'repairCost', 'contractPrice', 'discountToMao', 'motivationScore', 'timelineScore', 'titleClarity', 'buyerLiquidity'] }],
  estate: [{ label: 'Estate / probate review and recovery economics', fields: ['toolsEstimate', 'electronicsEstimate', 'furnitureEstimate', 'householdEstimate', 'clothingEstimate', 'estimatedContentsEv', 'executorCooperation', 'resaleDensity', 'accessLogistics', 'timelineScore', 'cleanoutCost', 'dumpFees'] }],
  commercial: [{ label: 'Commercial signals', fields: ['arv', 'repairCost', 'contractPrice', 'motivationScore', 'timelineScore', 'buyerLiquidity', 'scrapEstimate'] }],
  junk: [{ label: 'Recovery economics', fields: ['scrapEstimate', 'runnerPayout', 'cleanoutCost', 'dumpFees', 'accessLogistics', 'serviceRadiusKm'] }],
  package: [{ label: 'Package economics', fields: ['estimatedContentsEv', 'resaleEstimate', 'resaleProbability', 'scrapEstimate', 'runnerPayout', 'serviceRadiusKm'] }],
};
type LeadDraft = Partial<LeadInput> & { decision?: LeadDecision; expectedValue?: number | null; recommendedBid?: number | null; hardVetoes?: string[] };

function titleize(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function dateLabel(value?: string | null) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function Panel({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}

export function DashboardPage() {
  const summary = useGetDashboardSummary();
  const activity = useGetRecentActivity({ limit: 8 });
  const jobs = useListJobs({ status: 'open' });
  if (summary.isLoading) return <div><PageHeading eyebrow="FIELD DESK / 01" title="Operator overview" /><LoadingState rows={5} /></div>;
  if (summary.isError || !summary.data) return <><PageHeading eyebrow="FIELD DESK / 01" title="Operator overview" /><ErrorState retry={() => summary.refetch()} /></>;
  const data = summary.data;
  const maxStage = Math.max(...data.byStage.map((row) => row.count), 1);
  return (
    <div className="reveal">
      <PageHeading eyebrow="FIELD DESK / 01" title="Operator overview" description="A live read on opportunities, decisions, and field work." action={<Link href="/leads/new" className="button button-primary" data-testid="link-add-opportunity"><Plus size={15} /> Capture opportunity</Link>} />
      <LaunchFocusPanel />
      <div className="metric-grid">
        <Metric label="Tracked opportunities" value={data.totalLeads} note="Across all asset classes" icon="01" />
        <Metric label="Needs research" value={data.needsResearch} note="Evidence still incomplete" icon="02" tint="amber" />
        <Metric label="Awaiting review" value={data.awaitingReview} note="Human decision required" icon="03" tint="blue" />
        <Metric label="Active deals" value={data.activeDeals} note="In negotiation or execution" icon="04" tint="green" />
      </div>
      <div className="dashboard-grid">
        <Panel title="Decision pipeline" action={<span className="panel-kicker">BY CURRENT STAGE</span>} className="pipeline-panel">
          {data.byStage.length ? <div className="stage-chart">
            {data.byStage.map((row) => <div className="stage-row" key={row.stage}><span className="stage-label">{stageNames[row.stage] || row.stage}</span><div className="stage-track"><span style={{ width: `${Math.max(4, row.count / maxStage * 100)}%` }} /></div><strong className="mono">{row.count}</strong></div>)}
          </div> : <EmptyState title="No stage movement yet" detail="Newly captured opportunities will appear here." />}
          <div className="pipeline-total"><span>Expected pipeline value</span><strong>{data.expectedPipelineValueByCurrency.length ? data.expectedPipelineValueByCurrency.map((total) => <span key={total.currencyCode}><Currency value={total.amount} currencyCode={total.currencyCode} /></span>) : 'Not available'}</strong></div>
        </Panel>
        <Panel title="Asset mix" action={<span className="panel-kicker">PORTFOLIO</span>}>
          {data.byAssetClass.length ? <div className="asset-mix">{data.byAssetClass.map((row) => <Link href={`/leads/${row.assetClass === 'estate' ? 'estates' : row.assetClass === 'package' ? 'packages' : row.assetClass}`} className="asset-mix-row" key={row.assetClass}><AssetLabel value={row.assetClass} /><strong className="mono">{row.count}</strong><ChevronRight size={14} /></Link>)}</div> : <EmptyState title="No class data" detail="The portfolio is ready for its first lead." />}
          <div className="class-footnote"><span>Open field jobs</span><strong className="mono">{data.openJobs}</strong><span className="foot-divider" /><span>Available workers</span><strong className="mono">{data.availableWorkers}</strong></div>
        </Panel>
      </div>
      <div className="dashboard-grid lower-grid">
        <Panel title="Recent activity" action={<span className="panel-kicker">LATEST SIGNALS</span>}>
          {activity.isLoading ? <LoadingState rows={3} /> : activity.isError ? <ErrorState retry={() => activity.refetch()} /> : activity.data?.length ? <ActivityFeed items={activity.data} /> : <EmptyState title="Quiet on the desk" detail="Lead and job changes will be recorded here." />}
        </Panel>
        <Panel title="Open field work" action={<Link href="/jobs" className="panel-link">All jobs <ArrowUpRight size={14} /></Link>}>
          {jobs.isLoading ? <LoadingState rows={3} /> : jobs.isError ? <ErrorState retry={() => jobs.refetch()} /> : jobs.data?.length ? <div className="job-mini-list">{jobs.data.slice(0, 4).map((job) => <div className="job-mini" key={job.id}><div className="job-mini-icon"><MapPin size={15} /></div><div className="job-mini-copy"><strong>{job.title}</strong><span>{job.location} · {dateLabel(job.scheduledAt)}</span></div><StatusPill value={job.status} /></div>)}</div> : <EmptyState title="No open jobs" detail="Create a field assignment once an opportunity needs hands on site." action={<Link href="/jobs" className="text-action">Plan field work <ArrowUpRight size={14} /></Link>} />}
        </Panel>
      </div>
    </div>
  );
}

function LaunchFocusPanel() {
  const launchSources = useListLaunchSources({ query: { queryKey: getListLaunchSourcesQueryKey() } });
  const approvedCount = launchSources.data?.filter((source) => source.permissionStatus === 'approved').length ?? 0;
  const pendingCount = launchSources.data?.filter((source) => source.permissionStatus === 'pending').length ?? 0;
  return (
    <section className="panel launch-focus-panel" aria-labelledby="launch-focus-title">
      <div className="panel-heading">
        <div>
          <h2 id="launch-focus-title">Initial sourcing focus</h2>
          <p className="launch-focus-subtitle">Texas · {launchMarket.shortLabel} · {launchMarket.assetClassLabel}</p>
        </div>
        <span className="panel-kicker">HUMAN REVIEW</span>
      </div>
      <div className="launch-focus-grid">
        <div className="launch-area-grid">
          {launchMarket.areas.map((area) => (
            <section className="launch-area-card" key={area.label} aria-label={area.label}>
              <div className="launch-area-heading">
                <strong>{area.label}</strong>
                <span>{area.counties.length} counties</span>
              </div>
              <div className="launch-county-list">
                {area.counties.map((county) => (
                  <span className="launch-county-chip" key={county.value}>{county.name}</span>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="launch-source-box">
          <div className="launch-source-copy">
            <span className="launch-source-kicker">SOURCE REVIEW GATE</span>
            <strong>Estate and probate records</strong>
            <p>Confirm county court, probate, estate-sale, and partner sources individually. Record their access method and review terms before using them for lead capture.</p>
             <span className={`launch-source-status ${approvedCount ? 'launch-source-approved' : ''}`} data-testid="status-launch-source-review">
               {launchSources.isLoading
                 ? 'Checking source permissions…'
                 : launchSources.isError
                   ? 'Source registry unavailable · permission review required'
                   : approvedCount
                     ? `${approvedCount} approved source${approvedCount === 1 ? '' : 's'} · collection remains operator-controlled`
                     : pendingCount
                       ? `${pendingCount} source${pendingCount === 1 ? '' : 's'} awaiting permission review`
                       : 'No approved source access · manual entry remains available'}
             </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, note, icon, tint = '' }: { label: string; value: number; note: string; icon: string; tint?: string }) {
  return <div className={`metric-card ${tint}`}><div className="metric-top"><span>{label}</span><b>{icon}</b></div><strong className="metric-number mono">{value.toLocaleString()}</strong><span className="metric-note">{note}</span></div>;
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return <div className="activity-feed">{items.map((item) => <div className="activity-row" key={item.id}><span className={`activity-mark ${item.kind}`} /><div className="activity-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><time>{dateLabel(item.occurredAt)}</time></div>)}</div>;
}

function LeadsTable({ leads }: { leads: Lead[] }) {
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>Opportunity</th><th>Class</th><th>Stage</th><th>Signal</th><th>Decision</th><th>Value</th><th /></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} data-testid={`row-lead-${lead.id}`}><td><Link href={`/leads/${lead.id}`} className="lead-title-link">{lead.title}</Link><span className="table-sub">{lead.location || 'Location not set'}</span></td><td><AssetLabel value={lead.assetClass} /></td><td><StatusPill value={lead.stage} /></td><td className="signal-cell">{lead.distressSignal || '—'}</td><td><span className={`decision-label decision-${lead.decision}`}>{lead.decision.replaceAll('_', ' ')}</span><span className="table-sub">{lead.score === null ? 'Not scored' : `Score ${lead.score}`}</span></td><td><Currency value={lead.expectedValue} currencyCode={lead.currencyCode} /></td><td><TableLeadActions id={lead.id} /></td></tr>)}</tbody></table></div>;
}

export function LeadsPage({ classFilter }: { classFilter?: AssetClass }) {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [decision, setDecision] = useState('');
  const [path] = useLocation();
  const newLeadPath = classFilter ? `/leads/new?assetClass=${classFilter}` : '/leads/new';
  const title = classFilter ? `${classNames[classFilter]} intelligence` : 'Lead intelligence';
  const leads = useListLeads({ assetClass: classFilter, stage: stage ? stage as LeadStage : undefined, search: search.trim() || undefined });
  const visible = useMemo(() => (leads.data || []).filter((lead) => !decision || lead.decision === decision), [leads.data, decision]);
  const classStats = useMemo(() => ({
    signals: visible.filter((lead) => lead.stage === 'detected' || lead.stage === 'researched').length,
    evidence: visible.filter((lead) => Boolean(lead.evidenceUrl)).length,
    nextActions: visible.filter((lead) => Boolean(lead.nextAction)).length,
  }), [visible]);
  return <div className="reveal"><PageHeading eyebrow={classFilter ? `ASSET CLASS / ${classFilter.toUpperCase()}` : 'INTELLIGENCE / ALL OPPORTUNITIES'} title={title} description={classFilter ? `Evidence, review, and next actions across ${classNames[classFilter].toLowerCase()} opportunities.` : 'Every opportunity, anchored to its evidence and next decision.'} action={<Link href={newLeadPath} className="button button-primary"><Plus size={15} /> New lead</Link>} />
    {classFilter && <section className={`asset-desk-strip asset-desk-${classFilter}`} aria-label={`${classNames[classFilter]} desk summary`}>
      <div className="asset-desk-intro">
        <span className="panel-kicker">DEDICATED CLASS DESK</span>
        <strong>{classNames[classFilter]}</strong>
        <span>Live records only · no seeded opportunities</span>
      </div>
      <div className="asset-desk-stat"><span>OPEN SIGNALS</span><strong className="mono">{leads.isLoading ? '—' : classStats.signals}</strong></div>
      <div className="asset-desk-stat"><span>RECORDS WITH EVIDENCE</span><strong className="mono">{leads.isLoading ? '—' : classStats.evidence}</strong></div>
      <div className="asset-desk-stat"><span>NEXT ACTION RECORDED</span><strong className="mono">{leads.isLoading ? '—' : classStats.nextActions}</strong></div>
    </section>}
    <div className="workspace-toolbar"><div className="search-control"><Search size={16} /><input type="search" placeholder="Search title, signal, location..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-leads" /><kbd>/</kbd></div><div className="filter-wrap"><Filter size={15} /><select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage" data-testid="select-filter-stage"><option value="">All stages</option>{Object.values(LeadStageEnum).map((value) => <option key={value} value={value}>{stageNames[value]}</option>)}</select></div><div className="filter-wrap"><select value={decision} onChange={(e) => setDecision(e.target.value)} aria-label="Filter by decision" data-testid="select-filter-decision"><option value="">All decisions</option>{Object.values(LeadDecisionEnum).map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></div><span className="result-count mono">{leads.data?.length ?? '—'} RECORDS</span></div>
    {leads.isLoading ? <LoadingState rows={6} /> : leads.isError ? <ErrorState retry={() => leads.refetch()} /> : visible.length ? <LeadsTable leads={visible} /> : <EmptyState title={search || stage || decision ? 'No matching opportunities' : classFilter ? `No ${classNames[classFilter].toLowerCase()} leads yet` : 'No opportunities recorded'} detail={search || stage || decision ? 'Try widening the search or clearing one of the filters.' : 'Capture a lead to start collecting evidence and making a repeatable decision.'} action={<Link href={newLeadPath} className="button button-primary"><Plus size={15} /> Capture lead</Link>} />}
    <div className="table-foot"><span>Results reflect live operator records</span><span>{path.includes('/leads/') && classFilter ? classFilter.toUpperCase() : 'ALL CLASSES'} <i /></span></div>
  </div>;
}

function Input({ name, label, value, onChange, type = 'text', placeholder = '', step, hint, required = false }: { name: string; label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; step?: string; hint?: string; required?: boolean }) {
  return <label className="form-field"><FieldLabel hint={hint}>{label}</FieldLabel><input name={name} type={type} step={step} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} required={required} data-testid={`input-${name}`} /></label>;
}

function SelectField({ name, label, value, values, onChange }: { name: string; label: string; value: string; values: readonly string[]; onChange: (v: string) => void }) {
  return <label className="form-field"><FieldLabel>{label}</FieldLabel><select name={name} value={value} onChange={(e) => onChange(e.target.value)} data-testid={`select-${name}`}>{values.map((v) => <option key={v} value={v}>{classNames[v] || v.replaceAll('_', ' ')}</option>)}</select></label>;
}

export function LeadFormPage({ editing = false }: { editing?: boolean }) {
  const [, params] = useRoute('/leads/:id');
  const id = editing ? params?.id || '' : '';
  const requestedClass = new URLSearchParams(window.location.search).get('assetClass');
  const newAssetClass = requestedClass && Object.hasOwn(classNames, requestedClass) ? requestedClass as AssetClass : 'estate';
  const record = useGetLead(id, { query: { enabled: editing && Boolean(id), queryKey: getGetLeadQueryKey(id) } });
  const sourceRegistry = useListSources({ query: { queryKey: getListSourcesQueryKey() } });
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const create = useCreateLead();
  const update = useUpdateLead();
  const remove = useDeleteLead();
  const [form, setForm] = useState<LeadDraft>(() => blankDraftForClass(newAssetClass));
  const initializedForId = useRef<string | null>(null);
  useEffect(() => {
    if (!editing) {
      initializedForId.current = null;
      setForm(blankDraftForClass(newAssetClass));
      return;
    }
    if (record.data && id && initializedForId.current !== id) {
      initializedForId.current = id;
      setForm({ ...record.data });
    }
  }, [editing, id, record.data]);
  if (editing && record.isLoading) return <><PageHeading eyebrow="OPPORTUNITY / LOADING" title="Inspect lead" /><LoadingState rows={5} /></>;
  if (editing && (record.isError || !record.data)) return <><PageHeading eyebrow="OPPORTUNITY" title="Lead unavailable" /><ErrorState retry={() => record.refetch()} /></>;
  const lead = record.data;
  const set = (key: string, value: string) => setForm((old) => {
    const updated = { ...old, [key]: numericFields.includes(key) ? (value === '' ? null : Number(value)) : value };
    if (key === 'contactStatus' && old.contactStatus === 'do_not_contact' && value !== 'do_not_contact') {
      updated.contactName = '';
      updated.contactEmail = '';
      updated.contactPhone = '';
    }
    if (key === 'location' && old.sourceId) {
      const nextCounty = parseLaunchLocation(value)?.county.name
        .replace(/ County$/, '')
        .toLowerCase()
        .replace(/\s+/g, '_');
      const selectedSource = sourceRegistry.data?.find((source) => source.id === old.sourceId);
      if (nextCounty && selectedSource && !selectedSource.countyCoverage.some((county) => county === nextCounty)) {
        updated.sourceId = null;
        updated.source = 'Manual operator entry';
      }
    }
    if (key !== 'assetClass' || value === old.assetClass) return updated;

    const riskFlags = new Set<RiskFlag>(old.riskFlags || []);
    if (value === 'estate') riskFlags.add('no_signed_authorization');
    else if (old.assetClass === 'estate') riskFlags.delete('no_signed_authorization');
    return { ...updated, riskFlags: [...riskFlags] };
  });
  const locationParts = parseLaunchLocation(form.location || '');
  const locationLocality = locationParts?.locality ?? (form.location || '');
  const locationCounty = locationParts?.county.value ?? '';
  const sourceCounty = locationParts?.county.name
    .replace(/ County$/, '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  const approvedSources = (sourceRegistry.data || []).filter(
    (source) =>
      source.permissionStatus === 'approved' &&
      (!sourceCounty || source.countyCoverage.some((county) => county === sourceCounty)),
  );
  const busy = create.isPending || update.isPending || remove.isPending;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const payload = Object.fromEntries(leadInputFields.map((key) => {
      const value = form[key];
      if (key === 'eventDate') return [key, typeof value === 'string' && value ? new Date(value).toISOString() : null];
      if (nullableStringFields.has(key) && value === '') return [key, null];
      return [key, value];
    })) as unknown as LeadInput;
    if (!payload.sourceId) payload.source = 'Manual operator entry';
    if (editing && id) update.mutate({ id, data: payload }, { onSuccess: async (saved) => { await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) }); await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey({ limit: 8 }) }); setForm({ ...saved }); } });
    else create.mutate({ data: payload }, { onSuccess: async (saved) => { await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey({ limit: 8 }) }); setLocation(`/leads/${saved.id}`); } });
  };
  const confirmDelete = () => {
   if (id && window.confirm('Delete this lead and its recorded decision? This cannot be undone.')) remove.mutate({ id }, { onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey({ limit: 8 }) }); setLocation('/leads'); } });
  };
  const groups = fieldGroups[form.assetClass || 'estate'] || [];
  return <div className="reveal"><PageHeading eyebrow={editing ? `OPPORTUNITY / ${id.slice(0, 8).toUpperCase()}` : 'INTELLIGENCE / CAPTURE'} title={editing ? (lead?.title || 'Inspect opportunity') : 'Capture opportunity'} description={editing ? 'Review the source record, update evidence, and make the next step explicit.' : 'Start with the signal. Keep source evidence attached to the decision.'} action={editing ? <button className="button button-danger-outline" onClick={confirmDelete} disabled={busy} data-testid="button-delete-lead"><Trash2 size={15} /> Delete</button> : undefined} />
    {editing && lead && <div className="detail-identity"><div><AssetLabel value={lead.assetClass} /><span className="identity-separator">·</span><StatusPill value={lead.stage} /><span className="identity-separator">·</span><span className="mono identity-score">{lead.score === null ? 'UNSCORED' : `SCORE ${lead.score}`}</span></div><span className="identity-updated">Updated {dateLabel(lead.updatedAt)}</span></div>}
    <form onSubmit={submit} className="lead-edit-layout">
      <div className="lead-form-main">
        <Panel title="Opportunity record" action={<span className="panel-kicker">IDENTITY & EVIDENCE</span>}>
          <div className="form-grid">
            <Input name="title" label="Opportunity title" value={form.title || ''} onChange={(v) => set('title', v)} placeholder={form.assetClass === 'estate' ? 'e.g. Smith Estate — contents review' : 'e.g. Northgate Storage — unit 214'} required />
            <SelectField name="assetClass" label="Asset class" value={form.assetClass || 'estate'} values={Object.values(AssetClassEnum)} onChange={(v) => set('assetClass', v)} />
             <div className="form-field launch-location-field">
               <label className="field-label" htmlFor="lead-location-locality">City, area, or facility<small>Optional detail within your selected county</small></label>
               <input id="lead-location-locality" name="locationLocality" value={locationLocality} onChange={(event) => set('location', formatLaunchLocation(event.target.value, locationCounty))} placeholder="Houston, Katy, Dallas…" data-testid="input-location-locality" />
             </div>
             <div className="form-field launch-location-field">
               <label className="field-label" htmlFor="lead-location-county">Launch county<small>Texas launch area · Harris, Fort Bend, Dallas, or Tarrant</small></label>
               <select id="lead-location-county" name="launchCounty" value={locationCounty} required onChange={(event) => set('location', formatLaunchLocation(locationLocality, event.target.value))} data-testid="select-launch-county">
                 <option value="">Select a county</option>
                 {launchMarket.areas.map((area) => (
                   <optgroup key={area.label} label={area.label}>
                     {area.counties.map((county) => <option key={county.value} value={county.value}>{county.name}</option>)}
                   </optgroup>
                 ))}
               </select>
             </div>
             <label className="form-field">
               <FieldLabel>Source attribution</FieldLabel>
               <select value={form.sourceId || 'manual'} onChange={(event) => {
                 const selected = sourceRegistry.data?.find((source) => source.id === event.target.value);
                  if (selected) setForm((current) => ({ ...current, sourceId: selected.id, source: selected.name }));
                  else setForm((current) => ({ ...current, sourceId: null, source: 'Manual operator entry' }));
               }} data-testid="select-lead-source">
                 <option value="manual">Manual operator entry · not an automated feed</option>
                  {approvedSources.map((source) => <option key={source.id} value={source.id}>{source.name} · approved</option>)}
               </select>
                {sourceCounty && approvedSources.length === 0 && <small className="inline-field-note">No approved registry source covers this county. Manual operator entry is available.</small>}
                {sourceRegistry.isError && <small className="inline-field-note">Registry unavailable; manual operator entry remains available.</small>}
             </label>
            <div className="form-field full"><FieldLabel>Distress signal</FieldLabel><textarea name="distressSignal" value={form.distressSignal || ''} onChange={(e) => set('distressSignal', e.target.value)} placeholder="Record the observable reason this asset may be in distress" data-testid="input-distressSignal" rows={3} /></div>
            <Input name="evidenceUrl" label="Evidence URL" type="url" value={form.evidenceUrl || ''} onChange={(v) => set('evidenceUrl', v)} placeholder="https://" />
            <Input name="eventDate" label={form.assetClass === 'estate' ? 'Probate / closing deadline' : 'Relevant event date'} type="date" value={form.eventDate ? form.eventDate.slice(0, 10) : ''} onChange={(v) => set('eventDate', v)} />
          </div>
        </Panel>
         {editing && lead && <LeadEvidencePanel leadId={lead.id} />}
         {editing && lead?.assetClass === 'estate' && <EstateAuthorityReviewPanel lead={lead} />}
        <Panel title="Financial & location context" action={<span className="panel-kicker">OPERATOR INPUTS</span>}>
          <div className="form-grid">
            <Input name="currencyCode" label="Currency code" value={form.currencyCode || ''} onChange={(v) => set('currencyCode', v.toUpperCase())} placeholder="USD" hint="Three-letter currency" />
             <Input name="businessSharePercent" label={form.assetClass === 'estate' ? 'Agreed business share (%)' : 'Business share'} type="number" step="0.1" value={form.businessSharePercent ?? ''} onChange={(v) => set('businessSharePercent', v)} hint={form.assetClass === 'estate' ? 'Share of net estate value; needed to assess the $800 route minimum.' : 'Percent, 0–100'} />
            <label className="form-field">
              <FieldLabel>Resellable items found</FieldLabel>
              <select value={form.resellableItemsFound == null ? '' : String(form.resellableItemsFound)} onChange={(e) => setForm((old) => ({ ...old, resellableItemsFound: e.target.value === '' ? null : e.target.value === 'true' }))}>
                <option value="">Not recorded</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <Input name="latitude" label="Approximate latitude" type="number" step="any" value={form.latitude ?? ''} onChange={(v) => set('latitude', v)} />
            <Input name="longitude" label="Approximate longitude" type="number" step="any" value={form.longitude ?? ''} onChange={(v) => set('longitude', v)} />
            <Input name="distanceKm" label="Approximate distance (km)" type="number" step="0.1" value={form.distanceKm ?? ''} onChange={(v) => set('distanceKm', v)} />
          </div>
          <p className="field-inline-hint">Coordinates and distance are approximate context only, not live tracking.</p>
        </Panel>
        {groups.map((group) => <Panel key={group.label} title={group.label} action={<span className="panel-kicker">CLASS INPUTS</span>}><div className="form-grid score-fields">{group.fields.map((field) => <Input key={field} name={field} label={fieldLabels[field] || titleize(field)} type="number" step={field === 'resaleProbability' ? '0.01' : '1'} value={(form as Record<string, string | number | null>)[field] ?? ''} onChange={(v) => set(field, v)} hint={scoreFields.has(field) ? '0–100' : undefined} />)}</div></Panel>)}
          <Panel title="Contact context" action={<span className="panel-kicker">HUMAN REVIEW</span>}>
            <div className="form-grid">
              {form.contactStatus === 'do_not_contact' ? (
                <div className="contact-restriction">
                  <strong>Contact suppressed</strong>
                  <span>Contact details are hidden while this record is marked do not contact.</span>
                </div>
              ) : (
                <>
                  <Input name="contactName" label="Contact name" value={form.contactName || ''} onChange={(v) => set('contactName', v)} placeholder="Known owner or representative" />
                  <Input name="contactEmail" label="Contact email" type="email" value={form.contactEmail || ''} onChange={(v) => set('contactEmail', v)} placeholder="name@example.com" />
                  <Input name="contactPhone" label="Contact phone" type="tel" value={form.contactPhone || ''} onChange={(v) => set('contactPhone', v)} placeholder="Direct contact number" />
                </>
              )}
              <SelectField name="contactStatus" label="Contact status" value={form.contactStatus || 'unknown'} values={Object.values(LeadContactStatus)} onChange={(v) => set('contactStatus', v)} />
            </div>
            <div className="risk-block">
              <div>
                <strong>Risk flags</strong>
                <span>{form.assetClass === 'estate' ? 'Representative authority is tracked in the dedicated review below, not by an editable risk flag.' : 'Document safety, contact, title, and jurisdiction constraints.'}</span>
              </div>
              <div className="risk-grid">
                {Object.values(RiskFlagEnum).filter((flag) => form.assetClass !== 'estate' || flag !== 'no_signed_authorization').map((flag) => (
                  <label key={flag} className="check-option">
                    <input type="checkbox" checked={(form.riskFlags || []).includes(flag as RiskFlag)} onChange={(e) => setForm((old) => ({ ...old, riskFlags: e.target.checked ? [...(old.riskFlags || []), flag as RiskFlag] : (old.riskFlags || []).filter((item) => item !== flag) }))} data-testid={`checkbox-risk-${flag}`} />
                    <span>{flag.replaceAll('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          </Panel>
      </div>
      <aside className="lead-form-aside">
          <Panel title="Decision" action={<span className="review-stamp">OPERATOR REVIEW</span>}><p className="aside-description">Routing is calculated from the recorded inputs. Stage remains an operator-controlled workflow field.</p><div className="stack-fields"><div className="decision-summary"><span>Current decision</span><strong className={`decision-label decision-${form.decision || 'review'}`}>{editing ? (form.decision || 'review').replaceAll('_', ' ') : 'Calculated on save'}</strong></div><SelectField name="stage" label="Current stage" value={form.stage || 'detected'} values={Object.values(LeadStageEnum)} onChange={(v) => set('stage', v)} /><div className="decision-summary"><span>Expected value</span><strong>{form.expectedValue == null ? 'Calculated on save' : <Currency value={form.expectedValue} currencyCode={form.currencyCode || null} />}</strong></div><div className="decision-summary"><span>Net to business</span><strong>{lead?.netToBusinessValue == null ? '—' : <Currency value={lead.netToBusinessValue} currencyCode={lead.currencyCode} />}</strong></div><div className="decision-summary"><span>Recommended bid</span><strong>{form.recommendedBid == null ? 'Calculated on save' : <Currency value={form.recommendedBid} currencyCode={form.currencyCode || null} />}</strong></div><div className="decision-summary"><span>Maximum allowable offer</span><strong>{lead?.mao == null ? '—' : <Currency value={lead.mao} currencyCode={lead.currencyCode} />}</strong></div><div className="decision-summary"><span>Required assignment fee</span><strong>{lead?.requiredAssignmentFee == null ? '—' : <Currency value={lead.requiredAssignmentFee} currencyCode={lead.currencyCode} />}</strong></div><div className="form-field"><FieldLabel>Hard vetoes</FieldLabel>{form.hardVetoes?.length ? <div className="veto-list">{form.hardVetoes.map((veto) => <span key={veto}><CircleAlert size={12} />{veto}</span>)}</div> : <div className="calculated-note">Vetoes are derived from the risk flags and review inputs.</div>}</div><div className="form-field"><FieldLabel>Inputs still needed</FieldLabel>{lead?.missingInputs.length ? <div className="veto-list">{lead.missingInputs.map((input) => <span key={input}>{input.replaceAll('_', ' ')}</span>)}</div> : <div className="calculated-note">{editing ? 'No missing inputs reported.' : 'Scoring gaps will appear after the first save.'}</div>}</div></div><div className="decision-note"><CircleAlert size={15} /><span>Risk flags stay editable above. Confirm safety, authorization, title, and jurisdiction before action.</span></div></Panel>
         {editing && lead && <Panel title="Score record" action={<span className="panel-kicker">{lead.scoringVersion || 'CURRENT MODEL'}</span>}>{lead.scoreBreakdown.length ? <div className="score-breakdown">{lead.scoreBreakdown.map((item, index) => <div className="score-row" key={`${item.input}-${index}`}><span>{item.input.replaceAll('_', ' ')}</span><span>{item.score === null ? '—' : item.score}</span><strong className="mono">{item.contribution.toFixed(1)}</strong></div>)}</div> : <div className="calculated-note">No score contributions are available for this record.</div>}</Panel>}
        {editing && lead && <Panel title="Record details"><div className="record-details"><span>Created</span><strong>{dateLabel(lead.createdAt)}</strong><span>Last updated</span><strong>{dateLabel(lead.updatedAt)}</strong>{form.contactStatus === 'do_not_contact' ? <><span>Contact</span><strong>Suppressed · do not contact</strong></> : <><span>Contact email</span><strong>{lead.contactEmail || 'Not recorded'}</strong><span>Contact phone</span><strong>{lead.contactPhone || 'Not recorded'}</strong></>}<span>Risk flags</span><strong>{lead.riskFlags.length ? lead.riskFlags.map((flag) => flag.replaceAll('_', ' ')).join(', ') : 'None recorded'}</strong><span>Record ID</span><strong className="mono id-text">{lead.id}</strong></div>{lead.evidenceUrl && <a href={lead.evidenceUrl} target="_blank" rel="noreferrer" className="evidence-link"><ExternalLink size={14} /> Open source evidence</a>}</Panel>}
        {editing && lead && form.contactStatus === 'qualified' && <LeadOutreachDraft lead={lead} />}
        {(create.isError || update.isError || remove.isError) && <div className="inline-error">Could not save this change. Review the fields and try again.</div>}
        <button className="button button-primary button-wide" disabled={busy} type="submit" data-testid="button-save-lead">{busy ? 'Saving record…' : editing ? <><Check size={15} /> Save review</> : <><Plus size={15} /> Create lead</>}</button>
        <Link className="cancel-link" href="/leads">Cancel and return</Link>
      </aside>
    </form>
  </div>;
}

const workersSkillDefault = 'pickup, cleanout, loading';

export function WorkersPage() {
  const [jobId, setJobId] = useState('');
  const [editing, setEditing] = useState<Worker | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ displayName: '', homeArea: '', skills: workersSkillDefault, isAvailable: true, serviceRadiusKm: '25', latitude: '', longitude: '' });
  const queryClient = useQueryClient();
  const workers = useListWorkers(jobId ? { jobId } : {});
  const jobs = useListJobs({ status: 'open' });
  const create = useCreateWorker();
  const update = useUpdateWorker();
  const remove = useDeleteWorker();
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: getListWorkersQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey({ limit: 8 }) }); };
  const openNew = () => { setEditing(null); setForm({ displayName: '', homeArea: '', skills: workersSkillDefault, isAvailable: true, serviceRadiusKm: '25', latitude: '', longitude: '' }); setFormOpen(true); };
  const openEdit = (worker: Worker) => { setEditing(worker); setForm({ displayName: worker.displayName, homeArea: worker.homeArea, skills: worker.skills.join(', '), isAvailable: worker.isAvailable, serviceRadiusKm: String(worker.serviceRadiusKm), latitude: '', longitude: '' }); setFormOpen(true); };
  const save = (e: FormEvent) => { e.preventDefault(); const payload: WorkerInput = { displayName: form.displayName, homeArea: form.homeArea, skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean), isAvailable: form.isAvailable, serviceRadiusKm: Number(form.serviceRadiusKm), ...(form.latitude ? { latitude: Number(form.latitude) } : {}), ...(form.longitude ? { longitude: Number(form.longitude) } : {}) }; const onSuccess = () => { invalidate(); setFormOpen(false); }; if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess }); else create.mutate({ data: payload }, { onSuccess }); };
  const deleteWorker = (worker: Worker) => { if (window.confirm(`Remove ${worker.displayName} from the worker network?`)) remove.mutate({ id: worker.id }, { onSuccess: invalidate }); };
  const busy = create.isPending || update.isPending;
  return <div className="reveal"><PageHeading eyebrow="FIELD OPERATIONS / NETWORK" title="People network" description="Keep trusted field capacity close to the work. Proximity is approximate, never a live tracker." action={<button onClick={openNew} className="button button-primary" data-testid="button-add-worker"><Plus size={15} /> Add worker</button>} />
    <div className="workers-tools"><div className="tool-context"><UsersRound size={16} /><span>Match availability to a job</span></div><select value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Select job for worker proximity" data-testid="select-worker-job"><option value="">All workers</option>{(jobs.data || []).map((job) => <option key={job.id} value={job.id}>{job.title} · {job.location}</option>)}</select><span className="privacy-note"><MapPin size={13} /> Approximate distance only</span></div>
     {workers.isLoading ? <LoadingState rows={5} /> : workers.isError ? <ErrorState retry={() => workers.refetch()} /> : workers.data?.length ? <div className="worker-grid">{workers.data.map((worker) => <article className="worker-card" key={worker.id} data-testid={`card-worker-${worker.id}`}><div className="worker-card-top"><div className="worker-avatar">{worker.displayName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><div className="worker-main"><h3>{worker.displayName}</h3><span><MapPin size={13} />{worker.homeArea}</span></div><span className={`availability ${worker.isAvailable ? 'available' : ''}`}><i />{worker.isAvailable ? 'Available' : 'Unavailable'}</span></div><div className="worker-skills">{worker.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>{jobId && <div className="worker-match-context"><strong>{worker.eligibleForJob === null ? 'Match not evaluated' : worker.eligibleForJob ? 'Eligible for this job' : 'Outside current match'}</strong>{worker.matchReasons.map((reason) => <span key={reason}>{reason}</span>)}</div>}<div className="worker-card-footer"><span className="distance-detail">{jobId ? worker.distanceKm === null ? 'Distance unavailable' : `~${worker.distanceKm.toFixed(1)} km away` : `${worker.serviceRadiusKm} km service radius`} · {worker.locationConfigured ? 'location on file' : 'no coordinates'}</span><div><button className="icon-button" onClick={() => openEdit(worker)} aria-label={`Edit ${worker.displayName}`} data-testid={`button-edit-worker-${worker.id}`}><Pencil size={15} /></button><button className="icon-button danger" onClick={() => deleteWorker(worker)} aria-label={`Remove ${worker.displayName}`} data-testid={`button-delete-worker-${worker.id}`}><Trash2 size={15} /></button></div></div></article>)}</div> : <EmptyState title="No workers on the network" detail="Add a trusted local operator to begin planning field execution." action={<button onClick={openNew} className="button button-primary"><Plus size={15} /> Add first worker</button>} />}
    {(create.isError || update.isError || remove.isError) && <div className="inline-error">Worker record could not be saved. Try again.</div>}
    {formOpen && <Modal title={editing ? 'Edit worker profile' : 'Add a worker'} close={() => setFormOpen(false)}><form onSubmit={save} className="modal-form"><Input name="worker-name" label="Display name" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} required /><Input name="worker-area" label="Home area" value={form.homeArea} onChange={(v) => setForm({ ...form, homeArea: v })} required /><Input name="worker-skills" label="Skills" value={form.skills} onChange={(v) => setForm({ ...form, skills: v })} hint="Comma separated" /><div className="form-grid"><Input name="worker-radius" label="Service radius (km)" type="number" value={form.serviceRadiusKm} onChange={(v) => setForm({ ...form, serviceRadiusKm: v })} required /><label className="switch-field"><input type="checkbox" checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })} /> Available for work</label></div><div className="form-grid"><Input name="worker-latitude" label="Latitude (optional)" type="number" step="any" value={form.latitude} onChange={(v) => setForm({ ...form, latitude: v })} /><Input name="worker-longitude" label="Longitude (optional)" type="number" step="any" value={form.longitude} onChange={(v) => setForm({ ...form, longitude: v })} /></div>{(create.isError || update.isError) && <p className="inline-error">The profile could not be saved.</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setFormOpen(false)}>Cancel</button><button className="button button-primary" disabled={busy} data-testid="button-save-worker">{busy ? 'Saving…' : editing ? 'Save worker' : 'Add worker'}</button></div></form></Modal>}
  </div>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-heading"><header><div><span className="eyebrow">FIELD NETWORK</span><h2 id="modal-heading">{title}</h2></div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={18} /></button></header>{children}</section></div>;
}

export function JobsPage() {
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Job | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ leadId: '', title: '', jobType: 'pickup', location: '', scheduledAt: '', requiredSkills: '', estimatedHours: '', payoutAmount: '', currencyCode: '', payoutStructure: '', status: 'open', workerId: '', latitude: '', longitude: '' });
  const queryClient = useQueryClient();
  const jobs = useListJobs(status ? { status: status as JobStatus } : {});
  const leads = useListLeads();
  const workers = useListWorkers();
  const create = useCreateJob();
  const update = useUpdateJob();
  const remove = useDeleteJob();
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() }); await queryClient.invalidateQueries({ queryKey: getListWorkersQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey({ limit: 8 }) }); };
  const reset = () => { setEditing(null); setForm({ leadId: '', title: '', jobType: 'pickup', location: '', scheduledAt: '', requiredSkills: '', estimatedHours: '', payoutAmount: '', currencyCode: '', payoutStructure: '', status: 'open', workerId: '', latitude: '', longitude: '' }); setFormOpen(true); };
  const openEdit = (job: Job) => { setEditing(job); setForm({ leadId: job.leadId || '', title: job.title, jobType: job.jobType, location: job.location, scheduledAt: job.scheduledAt ? job.scheduledAt.slice(0, 16) : '', requiredSkills: job.requiredSkills.join(', '), estimatedHours: job.estimatedHours === null ? '' : String(job.estimatedHours), payoutAmount: job.payoutAmount === null ? '' : String(job.payoutAmount), currencyCode: job.currencyCode || '', payoutStructure: job.payoutStructure, status: job.status, workerId: job.workerId || '', latitude: job.latitude === null ? '' : String(job.latitude), longitude: job.longitude === null ? '' : String(job.longitude) }); setFormOpen(true); };
  const save = (e: FormEvent) => { e.preventDefault(); const payload: JobInput = { leadId: form.leadId || null, title: form.title, jobType: form.jobType as JobInput['jobType'], location: form.location, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null, requiredSkills: form.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean), estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null, payoutAmount: form.payoutAmount ? Number(form.payoutAmount) : null, currencyCode: form.currencyCode || null, payoutStructure: form.payoutStructure, status: form.status as JobStatus, workerId: form.workerId || null, latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null }; const onSuccess = async () => { await invalidate(); setFormOpen(false); }; if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess }); else create.mutate({ data: payload }, { onSuccess }); };
  const removeJob = (job: Job) => { if (window.confirm(`Delete field job “${job.title}”?`)) remove.mutate({ id: job.id }, { onSuccess: invalidate }); };
  const changeStatus = (job: Job, next: JobStatus) => update.mutate({ id: job.id, data: { status: next } }, { onSuccess: invalidate });
  const busy = create.isPending || update.isPending;
  return <div className="reveal"><PageHeading eyebrow="FIELD OPERATIONS / DISPATCH" title="Field operations" description="Turn a decision into a scheduled, assigned, and trackable physical action." action={<button onClick={reset} className="button button-primary" data-testid="button-plan-job"><Plus size={15} /> Plan a job</button>} />
    <div className="jobs-overview"><div><span>OPEN ASSIGNMENTS</span><strong className="mono">{jobs.data?.filter((j) => j.status === 'open').length ?? '—'}</strong></div><div><span>IN MOTION</span><strong className="mono">{jobs.data?.filter((j) => j.status === 'in_progress').length ?? '—'}</strong></div><div><span>CREW AVAILABLE</span><strong className="mono">{workers.data?.filter((w) => w.isAvailable).length ?? '—'}</strong></div><div className="jobs-filter"><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter jobs by status" data-testid="select-filter-job-status"><option value="">All statuses</option>{Object.values(JobStatusEnum).map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></div></div>
     {jobs.isLoading ? <LoadingState rows={5} /> : jobs.isError ? <ErrorState retry={() => jobs.refetch()} /> : jobs.data?.length ? <div className="job-list">{jobs.data.map((job) => <article className="job-card" key={job.id} data-testid={`card-job-${job.id}`}><div className="job-type-rail"><span>{job.jobType.replaceAll('_', ' ')}</span><strong>JOB</strong></div><div className="job-info"><div className="job-heading"><div><h3>{job.title}</h3><div className="job-meta"><span><MapPin size={13} />{job.location}</span><span><CalendarClock size={13} />{dateLabel(job.scheduledAt)}</span>{job.leadId && <Link href={`/leads/${job.leadId}`} className="job-lead-link">{leads.data?.find((lead) => lead.id === job.leadId)?.title || 'Linked opportunity'}</Link>}{job.latitude !== null && job.longitude !== null && <span>Approx. {job.latitude.toFixed(3)}, {job.longitude.toFixed(3)}</span>}</div></div><StatusPill value={job.status} /></div><div className="job-detail-row"><span><Clock3 size={13} />{job.estimatedHours === null ? 'Hours not estimated' : `${job.estimatedHours} hours`}</span><span><UsersRound size={13} />{job.workerName || 'Unassigned'}</span><span className="job-payout"><Currency value={job.payoutAmount} currencyCode={job.currencyCode} />{job.payoutStructure && <small>{job.payoutStructure}</small>}</span></div><div className="job-card-bottom"><div className="worker-skill-inline">{job.requiredSkills.length ? job.requiredSkills.map((skill) => <span key={skill}>{skill}</span>) : <span>No skills specified</span>}</div><div className="job-actions">{job.status === 'open' && <button className="text-action" onClick={() => changeStatus(job, 'invited')} data-testid={`button-invite-job-${job.id}`}>Mark invite recorded</button>}{job.status === 'invited' && <button className="text-action" onClick={() => changeStatus(job, 'assigned')} data-testid={`button-assign-job-${job.id}`}>Mark assigned</button>}{job.status === 'assigned' && <button className="text-action" onClick={() => changeStatus(job, 'in_progress')} data-testid={`button-start-job-${job.id}`}>Start job</button>}{job.status === 'in_progress' && <button className="text-action" onClick={() => changeStatus(job, 'completed')} data-testid={`button-complete-job-${job.id}`}>Complete job</button>}<button className="icon-button" onClick={() => openEdit(job)} aria-label={`Edit ${job.title}`} data-testid={`button-edit-job-${job.id}`}><Pencil size={14} /></button><button className="icon-button danger" onClick={() => removeJob(job)} aria-label={`Delete ${job.title}`} data-testid={`button-delete-job-${job.id}`}><Trash2 size={14} /></button></div></div></div></article>)}</div> : <EmptyState title="No field work planned" detail="Build an assignment with its job type, skills, payout, and an operator who can execute." action={<button onClick={reset} className="button button-primary"><Plus size={15} /> Plan first job</button>} />}
    {(create.isError || update.isError || remove.isError) && <div className="inline-error">The job change could not be completed. Please try again.</div>}
     {formOpen && <Modal title={editing ? 'Update field assignment' : 'Plan field assignment'} close={() => setFormOpen(false)}><form onSubmit={save} className="modal-form"><label className="form-field"><FieldLabel>Job title</FieldLabel><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required data-testid="input-job-title" /></label><div className="form-grid"><label className="form-field"><FieldLabel>Job type</FieldLabel><select value={form.jobType} onChange={(e) => setForm({ ...form, jobType: e.target.value })} data-testid="select-job-type">{Object.values(JobJobType).map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></label><label className="form-field"><FieldLabel>Status</FieldLabel><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="select-job-status">{Object.values(JobStatusEnum).map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></label></div><label className="form-field"><FieldLabel>Location</FieldLabel><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required data-testid="input-job-location" /></label><div className="form-grid"><label className="form-field"><FieldLabel>Scheduled at</FieldLabel><input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} data-testid="input-job-scheduledAt" /></label><label className="form-field"><FieldLabel>Linked opportunity</FieldLabel><select value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })} data-testid="select-job-lead"><option value="">Unlinked</option>{(leads.data || []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label></div><div className="form-grid"><label className="form-field"><FieldLabel>Assign worker</FieldLabel><select value={form.workerId} onChange={(e) => setForm({ ...form, workerId: e.target.value })} data-testid="select-job-worker"><option value="">Unassigned</option>{(workers.data || []).map((w) => <option key={w.id} value={w.id}>{w.displayName} · {w.homeArea}</option>)}</select></label><label className="form-field"><FieldLabel>Required skills <small>comma separated</small></FieldLabel><input value={form.requiredSkills} onChange={(e) => setForm({ ...form, requiredSkills: e.target.value })} data-testid="input-job-skills" /></label></div><div className="form-grid"><label className="form-field"><FieldLabel>Estimated hours</FieldLabel><input type="number" min="0" step="0.5" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} data-testid="input-job-hours" /></label><label className="form-field"><FieldLabel>Payout amount</FieldLabel><input type="number" min="0" value={form.payoutAmount} onChange={(e) => setForm({ ...form, payoutAmount: e.target.value })} data-testid="input-job-payout" /></label><label className="form-field"><FieldLabel>Currency code</FieldLabel><input value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })} placeholder="USD" data-testid="input-job-currency" /></label></div><label className="form-field"><FieldLabel>Payout structure</FieldLabel><input value={form.payoutStructure} onChange={(e) => setForm({ ...form, payoutStructure: e.target.value })} placeholder="Flat rate, per load, share..." data-testid="input-job-payoutStructure" /></label><div className="form-grid"><label className="form-field"><FieldLabel>Latitude</FieldLabel><input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} data-testid="input-job-latitude" /></label><label className="form-field"><FieldLabel>Longitude</FieldLabel><input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} data-testid="input-job-longitude" /></label></div>{(create.isError || update.isError) && <p className="inline-error">The job could not be saved.</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setFormOpen(false)}>Cancel</button><button className="button button-primary" disabled={busy} data-testid="button-save-job">{busy ? 'Saving…' : editing ? 'Save assignment' : 'Create assignment'}</button></div></form></Modal>}
  </div>;
}
