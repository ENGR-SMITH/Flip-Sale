import {
  autoFillSourceObservation,
  getAutoFillSourceObservationQueryKey,
  getListSourceObservationsQueryKey,
  getListSourceReviewsQueryKey,
  getListSourceRunsQueryKey,
  getListSourcesQueryKey,
  getListLaunchSourcesQueryKey,
  getListLeadsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
  useAddSourceReview,
  useConvertSourceObservationToLead,
  useCreateSource,
  useListSourceObservations,
  useListSourceReviews,
  useListSourceRuns,
  useListSources,
  useRefreshSourceRun,
  useRunSourceCollection,
  useUpdateSource,
  useUpdateSourceCollection,
  useUpdateSourceObservation,
} from '@workspace/api-client-react';
import type {
  AssetClass,
  LeadInput,
  Source,
  SourceAccessMethod,
  SourceInput,
  SourceObservation,
  SourcePermissionStatus,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Clock3,
  Database,
  ExternalLink,
  FilePlus2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { AssetLabel, EmptyState, ErrorState, FieldLabel, LoadingState, PageHeading, StatusPill } from '@/components/shell';

const counties = [
  ['harris', 'Harris'],
  ['fort_bend', 'Fort Bend'],
  ['dallas', 'Dallas'],
  ['tarrant', 'Tarrant'],
] as const;

const assets: { value: AssetClass; label: string }[] = [
  { value: 'storage', label: 'Storage' },
  { value: 'real_estate', label: 'Real estate' },
  { value: 'estate', label: 'Estate / probate' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'junk', label: 'Junk / scrap' },
  { value: 'package', label: 'Packages' },
];

const methods: SourceAccessMethod[] = [
  'manual_entry',
  'public_download',
  'authorized_feed',
  'api',
  'approved_scraping_provider',
  'partner_submission',
  'other',
];

const blank: SourceInput = {
  name: '',
  sourceUrl: null,
  countyCoverage: [],
  sourceOwner: '',
  accessMethod: 'manual_entry',
  assetClasses: [],
  apifyActorId: null,
  collectionIntervalHours: 24,
  collectionMaxPages: 10,
  costRateNotes: '',
  retentionNotes: '',
};

function label(value: string) {
  return value.replaceAll('_', ' ');
}

function accessMethodLabel(method: SourceAccessMethod) {
  const labels: Record<SourceAccessMethod, string> = {
    manual_entry: 'Manual entry',
    public_download: 'Public download',
    authorized_feed: 'Authorized feed (RSS / Atom / JSON)',
    api: 'Public JSON API',
    approved_scraping_provider: 'Approved Apify provider',
    partner_submission: 'Partner submission',
    other: 'Other',
  };
  return labels[method];
}

function collectionChannel(source: Source) {
  if (source.accessMethod === 'authorized_feed') {
    return 'Authorized feed (RSS / Atom / JSON)';
  }
  if (source.accessMethod === 'api') {
    return 'Public JSON API';
  }
  if (source.accessMethod === 'approved_scraping_provider') {
    return source.apifyActorId || 'Apify actor not selected';
  }
  return 'Manual review only';
}

function canCollectSource(source: Source) {
  const hasSecureUrl = Boolean(source.sourceUrl?.startsWith('https://'));
  const hasApprovedMethod =
    source.accessMethod === 'authorized_feed' ||
    source.accessMethod === 'api' ||
    (source.accessMethod === 'approved_scraping_provider' && Boolean(source.apifyActorId));
  return source.permissionStatus === 'approved' && hasSecureUrl && hasApprovedMethod;
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

function SourceCard({
  source,
  onReview,
  onEdit,
  onHistory,
  onCollection,
  onRun,
  collectionBusy,
  runBusy,
}: {
  source: Source;
  onReview: (source: Source, status: SourcePermissionStatus) => void;
  onEdit: (source: Source) => void;
  onHistory: (source: Source) => void;
  onCollection: (source: Source, enabled: boolean) => void;
  onRun: (source: Source) => void;
  collectionBusy: boolean;
  runBusy: boolean;
}) {
  const canCollect = canCollectSource(source);

  return (
    <article className="source-card" data-testid={`card-source-${source.id}`}>
      <div className="source-card-head">
        <div className="source-mark"><Database size={17} /></div>
        <div className="source-card-title">
          <div className="source-kicker">{source.sourceOwner} <span>·</span> {accessMethodLabel(source.accessMethod)}</div>
          <h3>{source.name}</h3>
          <div className="source-url">
            {source.sourceUrl || 'No source URL recorded'}
            {source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open ${source.name}`}><ExternalLink size={12} /></a>}
          </div>
        </div>
        <StatusPill value={source.permissionStatus} />
      </div>
      <div className="source-counties">{source.countyCoverage.map((county) => <span key={county}>{county.replaceAll('_', ' ')}</span>)}</div>
      <div className="source-asset-list">{source.assetClasses.map((asset) => <AssetLabel key={asset} value={asset} />)}</div>
      <div className="source-notes-grid">
        <div><span>COST / RATE</span><p>{source.costRateNotes}</p></div>
        <div><span>RETENTION</span><p>{source.retentionNotes}</p></div>
      </div>
      {source.permissionReviewNotes && (
        <div className="source-review-note">
          <strong>Latest permission review</strong>
          <p>{source.permissionReviewNotes}</p>
          <small>Reviewed by {source.permissionReviewerId || 'operator'} · {dateTime(source.permissionReviewedAt)}</small>
        </div>
      )}
      <div className="collection-control">
        <div className="collection-control-copy">
          <span className="eyebrow">COLLECTION ACTIVATION</span>
          <strong>{source.collectionEnabled ? 'Scheduled collection active' : 'Collection paused'}</strong>
          <small>
            Permission: {label(source.permissionStatus)} · {collectionChannel(source)}
          </small>
        </div>
        <div className="collection-control-actions">
          {canCollect && (
            <>
              <button
                className="button button-secondary"
                disabled={collectionBusy}
                onClick={() => onCollection(source, !source.collectionEnabled)}
                data-testid={`button-collection-toggle-${source.id}`}
              >
                {source.collectionEnabled ? <Pause size={14} /> : <Play size={14} />}
                {source.collectionEnabled ? 'Pause' : 'Enable'}
              </button>
              <button
                className="button button-primary"
                disabled={runBusy}
                onClick={() => onRun(source)}
                data-testid={`button-run-source-${source.id}`}
              >
                <Play size={14} />
                {runBusy ? 'Starting…' : 'Collect now'}
              </button>
            </>
          )}
          {!canCollect && (
            <span className="collection-locked">
              {source.permissionStatus !== 'approved'
                ? 'Permission review required before collection'
                : source.accessMethod === 'approved_scraping_provider' && !source.apifyActorId
                  ? 'Select an approved Apify actor'
                  : 'Requires a secure source URL and supported access method'}
            </span>
          )}
        </div>
      </div>
      <div className="source-schedule">
        <span>Every {source.collectionIntervalHours} hours</span>
        <span>Up to {source.collectionMaxPages} pages</span>
        <span>Last run {dateTime(source.lastCollectedAt)}</span>
        <span>Next run {dateTime(source.nextCollectionAt)}</span>
      </div>
      <div className="source-card-actions">
        <button className="text-action" onClick={() => onHistory(source)} data-testid={`button-source-history-${source.id}`}>Review history <ArrowUpRight size={13} /></button>
        <button className="button button-secondary" onClick={() => onEdit(source)} data-testid={`button-edit-source-${source.id}`}>Edit details</button>
        {source.permissionStatus !== 'approved' && <button className="button button-primary" onClick={() => onReview(source, 'approved')} data-testid={`button-approve-source-${source.id}`}>Approve access</button>}
        {source.permissionStatus !== 'rejected' && <button className="button button-danger-outline" onClick={() => onReview(source, 'rejected')} data-testid={`button-reject-source-${source.id}`}>Reject</button>}
      </div>
    </article>
  );
}

function ObservationCard({
  observation,
  onDismiss,
  onConvert,
  busy,
}: {
  observation: SourceObservation;
  onDismiss: (observation: SourceObservation) => void;
  onConvert: (observation: SourceObservation) => void;
  busy: boolean;
}) {
  return (
    <article className="observation-card" data-testid={`card-observation-${observation.id}`}>
      <div className="observation-card-top">
        <AssetLabel value={observation.assetClass} />
        <span className="mono">{dateTime(observation.discoveredAt)}</span>
      </div>
      <h3>{observation.title || 'Untitled public update'}</h3>
      <p className="observation-summary">{observation.summary}</p>
      <div className="observation-origin">
        <span>FROM {observation.sourceName}</span>
        {observation.publishedAt && <span>Published {dateTime(observation.publishedAt)}</span>}
      </div>
      <a className="observation-link" href={observation.observedUrl} target="_blank" rel="noreferrer">
        Open observed public record <ExternalLink size={13} />
      </a>
      <div className="observation-actions">
        <button className="button button-secondary" disabled={busy} onClick={() => onDismiss(observation)} data-testid={`button-dismiss-observation-${observation.id}`}>Dismiss update</button>
        <button className="button button-primary" disabled={busy} onClick={() => onConvert(observation)} data-testid={`button-convert-observation-${observation.id}`}>Review as lead</button>
      </div>
    </article>
  );
}

export function SourcesPage() {
  const cache = useQueryClient();
  const sources = useListSources({ query: { queryKey: getListSourcesQueryKey(), refetchOnMount: 'always' } });
  const observationsParams = { reviewStatus: 'needs_review' as const, limit: 100 };
  const observations = useListSourceObservations(observationsParams, {
    query: { queryKey: getListSourceObservationsQueryKey(observationsParams), refetchOnMount: 'always' },
  });
  const runs = useListSourceRuns({ limit: 30 }, {
    query: { queryKey: getListSourceRunsQueryKey({ limit: 30 }), refetchOnMount: 'always', refetchInterval: 30000 },
  });
  const createSource = useCreateSource();
  const updateSource = useUpdateSource();
  const addReview = useAddSourceReview();
  const collectionUpdate = useUpdateSourceCollection();
  const runCollection = useRunSourceCollection();
  const refreshRun = useRefreshSourceRun();
  const updateObservation = useUpdateSourceObservation();
  const convertObservation = useConvertSourceObservationToLead();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [form, setForm] = useState<SourceInput>({ ...blank });
  const [extraCounties, setExtraCounties] = useState('');
  const [reviewTarget, setReviewTarget] = useState<{ source: Source; status: SourcePermissionStatus } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [historySource, setHistorySource] = useState<Source | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [convertTarget, setConvertTarget] = useState<SourceObservation | null>(null);
  const [conversionForm, setConversionForm] = useState({ location: '', nextAction: '' });
  const [autoFillBusy, setAutoFillBusy] = useState(false);
  const [autoFillNote, setAutoFillNote] = useState('');
  const [operationMessage, setOperationMessage] = useState('');
  const reviews = useListSourceReviews(historySource?.id || '', {
    query: { enabled: Boolean(historySource), queryKey: getListSourceReviewsQueryKey(historySource?.id || '') },
  });

  const invalidateSourceData = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: getListSourcesQueryKey() }),
      cache.invalidateQueries({ queryKey: getListLaunchSourcesQueryKey() }),
      cache.invalidateQueries({ queryKey: getListSourceRunsQueryKey() }),
      cache.invalidateQueries({ queryKey: getListSourceObservationsQueryKey() }),
    ]);
  };

  const startNew = () => {
    setEditing(null);
    setForm({ ...blank });
    setExtraCounties('');
    setFormOpen(true);
  };

  const startEdit = (source: Source) => {
    setEditing(source);
    setForm({
      name: source.name,
      sourceUrl: source.sourceUrl,
      countyCoverage: source.countyCoverage,
      sourceOwner: source.sourceOwner,
      accessMethod: source.accessMethod,
      assetClasses: source.assetClasses,
      apifyActorId: source.apifyActorId,
      collectionIntervalHours: source.collectionIntervalHours,
      collectionMaxPages: source.collectionMaxPages,
      costRateNotes: source.costRateNotes,
      retentionNotes: source.retentionNotes,
    });
      setExtraCounties(
        source.countyCoverage
          .filter((county) => !counties.some(([code]) => code === county))
          .join(', '),
      );
    setFormOpen(true);
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const extraList = extraCounties
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length >= 2);
    const countyCoverage = Array.from(
      new Set([...form.countyCoverage, ...extraList]),
    );
    const payload = { ...form, sourceUrl: form.sourceUrl || null, countyCoverage };
    const onSuccess = async () => {
      await invalidateSourceData();
      setFormOpen(false);
      setOperationMessage('Source details saved.');
    };
    if (editing) {
      updateSource.mutate({ id: editing.id, data: payload }, { onSuccess });
    } else {
      createSource.mutate({ data: payload }, { onSuccess });
    }
  };

  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewTarget || !reviewNote.trim()) {
      setReviewError('A review note is required to preserve the permission decision.');
      return;
    }
    setReviewError('');
    addReview.mutate(
      { id: reviewTarget.source.id, data: { status: reviewTarget.status, reviewNotes: reviewNote.trim() } },
      {
        onSuccess: async () => {
          await invalidateSourceData();
          setReviewTarget(null);
          setReviewNote('');
          setOperationMessage('Permission review recorded.');
        },
      },
    );
  };

  const changeCollection = (source: Source, enabled: boolean) => {
    collectionUpdate.mutate(
      { id: source.id, data: { enabled, intervalHours: source.collectionIntervalHours } },
      {
        onSuccess: async () => {
          await invalidateSourceData();
          setOperationMessage(enabled ? 'Scheduled collection enabled.' : 'Scheduled collection paused.');
        },
      },
    );
  };

  const startCollection = (source: Source) => {
    runCollection.mutate({ id: source.id }, {
      onSuccess: async () => {
        await invalidateSourceData();
        setOperationMessage(`Collection run started for ${source.name}.`);
      },
    });
  };

  const dismissObservation = (observation: SourceObservation) => {
    updateObservation.mutate(
      { id: observation.id, data: { reviewStatus: 'dismissed' } },
      {
        onSuccess: async () => {
          await cache.invalidateQueries({ queryKey: getListSourceObservationsQueryKey() });
          setOperationMessage('Update dismissed from the human review queue.');
        },
      },
    );
  };

  const runAutoFill = async (): Promise<void> => {
    if (!convertTarget || autoFillBusy) return;
    setAutoFillBusy(true);
    setAutoFillNote('');
    try {
      const suggestion = await cache.fetchQuery({
        queryKey: getAutoFillSourceObservationQueryKey(convertTarget.id),
        queryFn: () => autoFillSourceObservation(convertTarget.id),
      });
      setConversionForm((form) => ({
        ...form,
        location: suggestion.jurisdiction || form.location,
        nextAction: suggestion.nextAction || form.nextAction,
      }));
      setAutoFillNote(
        suggestion.jurisdiction
          ? `Suggested jurisdiction “${suggestion.jurisdiction}” (${
              suggestion.jurisdictionSource === 'census_geocoder'
                ? 'via US Census Geocoder'
                : suggestion.jurisdictionSource === 'census_geocoder_city_state'
                  ? 'city/state match from US Census Geocoder'
                  : 'taken from the record text'
            }); next action ${suggestion.nextActionSource === 'gemini' ? 'drafted by Gemini' : 'from the standard template'}. Review before saving.`
          : 'No address/jurisdiction could be resolved from this record — fill the fields manually. Next action filled from the standard template.',
      );
    } catch {
      setAutoFillNote('Auto Fill could not reach the suggestion services. Fill the fields manually or try again.');
    } finally {
      setAutoFillBusy(false);
    }
  };

  const submitConversion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!convertTarget) return;
    const data: LeadInput = {
      title: convertTarget.title || convertTarget.summary.slice(0, 180),
      assetClass: convertTarget.assetClass,
      stage: 'detected',
      location: conversionForm.location.trim(),
      source: convertTarget.sourceName,
      sourceId: convertTarget.sourceId,
      distressSignal: convertTarget.summary.slice(0, 500),
      nextAction: conversionForm.nextAction.trim(),
      nextActionDueAt: null,
      noNextActionReason: null,
      evidenceUrl: convertTarget.observedUrl,
    };
    convertObservation.mutate(
      { id: convertTarget.id, data },
      {
        onSuccess: async (result) => {
          await invalidateSourceData();
          await Promise.all([
            cache.invalidateQueries({ queryKey: getListLeadsQueryKey() }),
            cache.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }),
            cache.invalidateQueries({ queryKey: getGetRecentActivityQueryKey({ limit: 8 }) }),
          ]);
          setConvertTarget(null);
          setOperationMessage(`Reviewed observation converted to lead ${result.lead.id}.`);
        },
      },
    );
  };

  const collectionPendingFor = (source: Source) => collectionUpdate.isPending && collectionUpdate.variables?.id === source.id;
  const runPendingFor = (source: Source) => runCollection.isPending && runCollection.variables?.id === source.id;
  const busy = createSource.isPending || updateSource.isPending;
  const pendingObservations = observations.data || [];
  const activeRuns = runs.data || [];

  return (
    <div className="reveal">
      <PageHeading
        eyebrow="GOVERNANCE / SOURCE REGISTRY"
        title="Sources & collection"
        description="Record permission, configure bounded collection, then review every observed update before it becomes a lead."
        action={<button className="button button-primary" onClick={startNew} data-testid="button-register-source"><FilePlus2 size={15} /> Register source</button>}
      />
      <section className="source-gate">
        <div className="source-gate-icon"><ShieldCheck size={18} /></div>
        <div>
          <span className="source-gate-label">PERMISSION IS NOT ACTIVATION</span>
          <strong>{sources.data?.filter((item) => item.permissionStatus === 'approved').length ?? '—'} approved sources</strong>
          <p>Permission review records the lawful access basis. Collection remains a separate operator action, available only for approved sources with a supported HTTPS feed, public JSON API, or approved Apify actor.</p>
        </div>
        <div className="source-gate-status"><i /> Human review required</div>
      </section>
      <div className="source-summary">
        <div><span>REGISTERED</span><strong>{sources.data?.length ?? '—'}</strong></div>
        <div><span>PENDING PERMISSION</span><strong>{sources.data?.filter((item) => item.permissionStatus === 'pending').length ?? '—'}</strong></div>
        <div><span>COLLECTION ACTIVE</span><strong>{sources.data?.filter((item) => item.collectionEnabled).length ?? '—'}</strong></div>
        <div><span>AWAITING HUMAN REVIEW</span><strong>{observations.data?.length ?? '—'}</strong></div>
      </div>
      {operationMessage && <div className="operation-banner"><Check size={15} />{operationMessage}<button onClick={() => setOperationMessage('')} aria-label="Dismiss message">Dismiss</button></div>}
      {(() => {
        const mutationErrors = [
          createSource.error, updateSource.error, addReview.error,
          collectionUpdate.error, runCollection.error, updateObservation.error,
          convertObservation.error,
        ].filter(Boolean) as Array<{ error?: string }>;
        const detail = mutationErrors[0]?.error?.trim();
        if (!mutationErrors.length) return null;
        return (
          <div className="inline-error" data-testid="sources-error-banner">
            The requested change could not be completed. {detail || 'Check the source permission and try again.'}
          </div>
        );
      })()}
      <section className="sources-section">
        <div className="source-section-heading">
          <div><span className="eyebrow">REGISTER & GOVERN</span><h2>Registry records</h2></div>
          <span className="panel-kicker">NO SOURCES ARE PRE-APPROVED</span>
        </div>
        {sources.isLoading ? <LoadingState rows={4} /> : sources.isError ? <ErrorState retry={() => sources.refetch()} /> : sources.data?.length ? (
          <div className="source-card-list">
            {sources.data.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onReview={(item, status) => { setReviewTarget({ source: item, status }); setReviewNote(''); setReviewError(''); }}
                onEdit={startEdit}
                onHistory={setHistorySource}
                onCollection={changeCollection}
                onRun={startCollection}
                collectionBusy={collectionPendingFor(source)}
                runBusy={runPendingFor(source)}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="Registry is empty" detail="Add a source with its owner, access terms, county coverage, and asset classes before considering permission or collection." action={<button className="button button-primary" onClick={startNew}><FilePlus2 size={15} /> Register first source</button>} />
        )}
      </section>
      <section className="operations-grid">
        <div className="operations-panel">
          <div className="source-section-heading">
            <div><span className="eyebrow">COLLECTOR / RUN MONITOR</span><h2>Collection activity</h2></div>
            <button className="icon-button light" onClick={() => runs.refetch()} aria-label="Refresh collection activity" data-testid="button-refresh-source-runs"><RefreshCw size={15} /></button>
          </div>
          {runs.isLoading ? <LoadingState rows={3} /> : runs.isError ? <ErrorState retry={() => runs.refetch()} /> : activeRuns.length ? (
            <div className="run-list">
              {activeRuns.map((run) => (
                <article className="run-row" key={run.id} data-testid={`row-source-run-${run.id}`}>
                  <div className="run-row-mark"><Clock3 size={15} /></div>
                  <div className="run-row-main">
                    <strong>{run.sourceName}</strong>
                    <span>Collector: {run.actorId || 'Manual / unassigned'}{run.providerRunId ? ` · Provider run ${run.providerRunId}` : ''}</span>
                    <small>Started {dateTime(run.startedAt)} · {run.itemsFound} found · {run.observationsAdded} added</small>
                    {run.errorSummary && <p className="run-error">{run.errorSummary}</p>}
                  </div>
                  <StatusPill value={run.status} />
                  {(run.status === 'queued' || run.status === 'running') && (
                    <button className="button button-secondary run-refresh" disabled={refreshRun.isPending} onClick={() => refreshRun.mutate({ id: run.id }, { onSuccess: invalidateSourceData })} data-testid={`button-refresh-run-${run.id}`}>
                      <RefreshCw size={13} /> Refresh
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : <EmptyState title="No collection runs" detail="Approved feeds, public JSON APIs, and supported Apify sources can be collected on schedule or by an operator." />}
        </div>
        <div className="operations-note">
          <span className="eyebrow">BOUNDED COLLECTION</span>
          <h3>Public signals, narrow scope.</h3>
          <p>Use authorized RSS / Atom feeds and public JSON APIs directly, or an approved Apify actor for provider-based collection. Every source requires a reviewed permission basis and bounded settings.</p>
          <div><span>SUPPORTED ACCESS METHODS</span><strong>Authorized RSS / Atom</strong><strong>Public JSON API</strong><strong>Approved Apify actors</strong></div>
          <small>Approving terms does not enable collection. Collection never performs external outreach or extracts contact details. Every update remains in the human-review queue until an operator decides what to do next.</small>
        </div>
      </section>
      <section className="observation-section">
        <div className="source-section-heading">
          <div><span className="eyebrow">HUMAN REVIEW QUEUE</span><h2>Collected updates</h2></div>
          <span className="panel-kicker">{pendingObservations.length} NEEDS REVIEW</span>
        </div>
        {observations.isLoading ? <LoadingState rows={3} /> : observations.isError ? <ErrorState retry={() => observations.refetch()} /> : pendingObservations.length ? (
          <div className="observation-grid">
            {pendingObservations.map((observation) => (
              <ObservationCard
                key={observation.id}
                observation={observation}
                onDismiss={dismissObservation}
                onConvert={(item) => { setConvertTarget(item); setConversionForm({ location: '', nextAction: '' }); }}
                busy={updateObservation.isPending || convertObservation.isPending}
              />
            ))}
          </div>
        ) : <EmptyState title="Review queue is clear" detail="Newly collected updates appear here and remain out of lead intelligence until a person dismisses them or converts them to a lead." />}
      </section>
      {formOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}>
          <section className="modal-card source-form-modal" role="dialog" aria-modal="true" aria-labelledby="source-form-title">
            <header><div><span className="eyebrow">SOURCE REGISTRY</span><h2 id="source-form-title">{editing ? 'Edit source details' : 'Register source'}</h2></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="Close">×</button></header>
            <form className="modal-form" onSubmit={save}>
              <label className="form-field"><FieldLabel>Source name</FieldLabel><input required maxLength={180} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-source-name" /></label>
              <label className="form-field"><FieldLabel>Feed, API, or source URL <small>HTTPS is required for automated collection</small></FieldLabel><input type="url" value={form.sourceUrl || ''} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value || null })} placeholder="https://" data-testid="input-source-url" /></label>
              <div className="form-grid">
                <label className="form-field"><FieldLabel>Source owner</FieldLabel><input required maxLength={180} value={form.sourceOwner} onChange={(event) => setForm({ ...form, sourceOwner: event.target.value })} data-testid="input-source-owner" /></label>
                <label className="form-field"><FieldLabel>Access method</FieldLabel><select value={form.accessMethod} onChange={(event) => { const accessMethod = event.target.value as SourceAccessMethod; setForm({ ...form, accessMethod, apifyActorId: accessMethod === 'approved_scraping_provider' ? form.apifyActorId : null }); }} data-testid="select-source-access-method">{methods.map((method) => <option key={method} value={method}>{accessMethodLabel(method)}</option>)}</select></label>
              </div>
              {(form.accessMethod === 'authorized_feed' || form.accessMethod === 'api') && (
                <p className="source-form-notice">
                  {form.accessMethod === 'authorized_feed'
                    ? 'Use an authorized RSS, Atom, or JSON feed only after confirming the feed is permitted for this use.'
                    : 'Use a public JSON API endpoint only within its published terms and rate limits.'}
                  {' '}Permission review and collection activation remain separate operator decisions.
                </p>
              )}
              <fieldset className="source-county-field"><legend>County coverage</legend><p className="source-form-notice">Quick picks are the launch counties. You can register any other county below — collection only runs inside registered counties.</p><div className="source-county-options">{counties.map(([county, name]) => <label key={county}><input type="checkbox" checked={form.countyCoverage.includes(county)} onChange={(event) => setForm({ ...form, countyCoverage: event.target.checked ? [...form.countyCoverage, county] : form.countyCoverage.filter((item) => item !== county) })} />{name}</label>)}</div><label className="form-field"><FieldLabel>Other counties (comma-separated, with state)</FieldLabel><input maxLength={800} value={extraCounties} onChange={(event) => setExtraCounties(event.target.value)} placeholder="e.g. Prince George's County, MD; Shelby County, TN" data-testid="input-source-extra-counties" /></label></fieldset>
              <fieldset className="source-county-field"><legend>Asset classes present</legend><div className="source-asset-options">{assets.map((asset) => <label key={asset.value}><input type="checkbox" checked={form.assetClasses.includes(asset.value)} onChange={(event) => setForm({ ...form, assetClasses: event.target.checked ? [...form.assetClasses, asset.value] : form.assetClasses.filter((item) => item !== asset.value) })} />{asset.label}</label>)}</div></fieldset>
              {form.accessMethod === 'approved_scraping_provider' && (
                <label className="form-field"><FieldLabel>Apify actor</FieldLabel><select required value={form.apifyActorId || ''} onChange={(event) => setForm({ ...form, apifyActorId: (event.target.value || null) as SourceInput['apifyActorId'] })} data-testid="select-source-actor"><option value="">Select an approved actor</option><option value="apify/website-content-crawler">Website content crawler</option><option value="apify/web-scraper">Web scraper</option></select></label>
              )}
              <div className="form-grid">
                <label className="form-field"><FieldLabel>Collection interval (hours)</FieldLabel><input type="number" min={6} max={168} value={form.collectionIntervalHours} onChange={(event) => setForm({ ...form, collectionIntervalHours: Number(event.target.value) })} data-testid="input-collection-interval" /></label>
                <label className="form-field"><FieldLabel>{form.accessMethod === 'authorized_feed' || form.accessMethod === 'api' ? 'Maximum records per run' : 'Maximum pages per run'}</FieldLabel><input type="number" min={1} max={100} value={form.collectionMaxPages} onChange={(event) => setForm({ ...form, collectionMaxPages: Number(event.target.value) })} data-testid="input-collection-max-pages" /></label>
              </div>
              <label className="form-field"><FieldLabel>Cost / rate notes</FieldLabel><textarea required maxLength={1200} rows={2} value={form.costRateNotes} onChange={(event) => setForm({ ...form, costRateNotes: event.target.value })} data-testid="input-source-cost-notes" /></label>
              <label className="form-field"><FieldLabel>Retention notes</FieldLabel><textarea required maxLength={1200} rows={2} value={form.retentionNotes} onChange={(event) => setForm({ ...form, retentionNotes: event.target.value })} data-testid="input-source-retention-notes" /></label>
              <p className="source-form-notice">New registrations enter the permission queue as pending. Registering or editing a source never activates collection.</p>
              {(createSource.isError || updateSource.isError) && <p className="inline-error">Could not save source details.</p>}
              <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="button button-primary" disabled={busy || (form.countyCoverage.length === 0 && extraCounties.trim().length === 0) || form.assetClasses.length === 0} data-testid="button-save-source">{busy ? 'Saving…' : editing ? 'Save details' : 'Register pending source'}</button></div>
            </form>
          </section>
        </div>
      )}
      {reviewTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewTarget(null); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="source-review-title">
            <header><div><span className="eyebrow">PERMISSION REVIEW</span><h2 id="source-review-title">{reviewTarget.status === 'approved' ? 'Approve source access' : 'Reject source access'}</h2></div><button className="icon-button" onClick={() => setReviewTarget(null)} aria-label="Close">×</button></header>
            <div className="review-target"><strong>{reviewTarget.source.name}</strong><span>Permission: {label(reviewTarget.source.permissionStatus)} · Decision: {label(reviewTarget.status)}</span></div>
            <form className="modal-form" onSubmit={submitReview}>
              <label className="form-field"><FieldLabel>Review note</FieldLabel><textarea required minLength={1} maxLength={1200} rows={5} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Record the permission basis, scope, and limitations." data-testid="input-source-review-note" /></label>
              {reviewError && <p className="inline-error">{reviewError}</p>}
              {addReview.isError && <p className="inline-error">Review could not be recorded.</p>}
              <p className="source-form-notice">This decision is recorded as a permanent source review event and does not itself activate collection.</p>
              <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setReviewTarget(null)}>Cancel</button><button className={reviewTarget.status === 'approved' ? 'button button-primary' : 'button button-danger-outline'} disabled={addReview.isPending} data-testid="button-submit-source-review">{addReview.isPending ? 'Recording…' : `Record ${label(reviewTarget.status)} decision`}</button></div>
            </form>
          </section>
        </div>
      )}
      {historySource && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistorySource(null); }}>
          <section className="modal-card source-history-modal" role="dialog" aria-modal="true" aria-labelledby="source-history-title">
            <header><div><span className="eyebrow">APPEND-ONLY LOG</span><h2 id="source-history-title">{historySource.name} · review history</h2></div><button className="icon-button" onClick={() => setHistorySource(null)} aria-label="Close">×</button></header>
            {reviews.isLoading ? <LoadingState rows={3} /> : reviews.isError ? <ErrorState retry={() => reviews.refetch()} /> : reviews.data?.length ? <div className="source-review-list">{reviews.data.map((review) => <article key={review.id}><div><StatusPill value={review.status} /><span className="mono">{dateTime(review.reviewedAt)}</span></div><p>{review.reviewNotes}</p><small>Reviewer {review.reviewerId} · previous: {label(review.previousStatus)}</small></article>)}</div> : <EmptyState title="No reviews recorded" detail="This source has no permission decisions yet." />}
          </section>
        </div>
      )}
      {convertTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConvertTarget(null); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="convert-observation-title">
            <header><div><span className="eyebrow">HUMAN REVIEW / CREATE LEAD</span><h2 id="convert-observation-title">Review before conversion</h2></div><button className="icon-button" onClick={() => setConvertTarget(null)} aria-label="Close">×</button></header>
            <div className="review-target"><strong>{convertTarget.title || 'Untitled public update'}</strong><span>{convertTarget.sourceName} · {label(convertTarget.assetClass)}</span></div>
            <p className="source-form-notice">Confirm location and next action. The public observation is attached as evidence; it remains in review until this action succeeds. Use Auto Fill to draft both fields — you stay in control and can edit anything before saving.</p>
            <form className="modal-form" onSubmit={submitConversion}>
              <div className="form-actions-row"><button type="button" className="button button-secondary" onClick={runAutoFill} disabled={autoFillBusy} data-testid="button-auto-fill">{autoFillBusy ? 'Filling…' : '✦ Auto Fill'}</button><small>US Census Geocoder + Gemini suggest; you confirm.</small></div>
              {autoFillNote && <p className="source-form-notice" data-testid="autofill-note">{autoFillNote}</p>}
              <label className="form-field"><FieldLabel>Lead location / jurisdiction</FieldLabel><input required maxLength={240} value={conversionForm.location} onChange={(event) => setConversionForm({ ...conversionForm, location: event.target.value })} data-testid="input-conversion-location" /></label>
              <label className="form-field"><FieldLabel>Next operator action</FieldLabel><input required maxLength={500} value={conversionForm.nextAction} onChange={(event) => setConversionForm({ ...conversionForm, nextAction: event.target.value })} data-testid="input-conversion-next-action" /></label>
              {convertObservation.isError && <p className="inline-error">The observation could not be converted. It remains in the review queue.</p>}
              <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setConvertTarget(null)}>Keep in review</button><button className="button button-primary" disabled={convertObservation.isPending}>{convertObservation.isPending ? 'Creating…' : 'Create reviewed lead'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
