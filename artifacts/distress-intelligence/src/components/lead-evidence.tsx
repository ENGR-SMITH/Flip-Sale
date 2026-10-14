import { useAddLeadEvidence, useListLeadEvidence, getListLeadEvidenceQueryKey, getGetRecentActivityQueryKey } from '@workspace/api-client-react';
import type { EvidenceConfidence, LeadEvidence, LeadEvidenceInput, LeadEvidenceSource } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ExternalLink, FilePlus2, LockKeyhole } from 'lucide-react';
import { EmptyState, ErrorState, FieldLabel, LoadingState } from '@/components/shell';

const sourceTypes: LeadEvidenceSource[] = [
  'public_record',
  'court_record',
  'listing',
  'referral',
  'site_observation',
  'other',
];

const confidenceLevels: EvidenceConfidence[] = [
  'not_assessed',
  'low',
  'medium',
  'high',
];

function localDateTimeValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatObservedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function EvidenceEntry({ item }: { item: LeadEvidence }) {
  return (
    <article className="evidence-entry" data-testid={`evidence-entry-${item.id}`}>
      <div className="evidence-entry-rail">
        <span className="evidence-entry-dot" />
      </div>
      <div className="evidence-entry-content">
        <div className="evidence-entry-heading">
          <div>
            <span className="evidence-type">{item.sourceType.replaceAll('_', ' ')}</span>
            <h3>{item.sourceName}</h3>
          </div>
          <span className={`confidence-tag confidence-${item.confidence}`}>
            {item.confidence.replaceAll('_', ' ')}
          </span>
        </div>
        <p className="evidence-summary">{item.summary}</p>
        <div className="evidence-entry-meta">
          <span>Observed {formatObservedAt(item.observedAt)}</span>
          <span>Collected via {item.collectionMethod}</span>
          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="evidence-source-link">
              Source <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function LeadEvidencePanel({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const evidence = useListLeadEvidence(leadId, {
    query: {
      queryKey: getListLeadEvidenceQueryKey(leadId),
    },
  });
  const addEvidence = useAddLeadEvidence();
  const [form, setForm] = useState({
    sourceType: 'public_record' as LeadEvidenceSource,
    sourceName: '',
    sourceUrl: '',
    collectionMethod: '',
    observedAt: localDateTimeValue(),
    confidence: 'not_assessed' as EvidenceConfidence,
    summary: '',
  });
  const [validationError, setValidationError] = useState('');

  const submit = () => {
    if (!form.sourceName.trim() || !form.collectionMethod.trim() || !form.observedAt || !form.summary.trim()) {
      setValidationError('Complete the source name, collection method, observed date and summary.');
      return;
    }
    setValidationError('');
    const payload: LeadEvidenceInput = {
      sourceType: form.sourceType,
      sourceName: form.sourceName.trim(),
      sourceUrl: form.sourceUrl.trim() || null,
      collectionMethod: form.collectionMethod.trim(),
      observedAt: new Date(form.observedAt).toISOString(),
      confidence: form.confidence,
      summary: form.summary.trim(),
    };

    addEvidence.mutate(
      { id: leadId, data: payload },
      {
        onSuccess: async (created) => {
          queryClient.setQueryData<LeadEvidence[]>(
            getListLeadEvidenceQueryKey(leadId),
            (current) => [...(current || []), created],
          );
          setForm({
            sourceType: 'public_record',
            sourceName: '',
            sourceUrl: '',
            collectionMethod: '',
            observedAt: localDateTimeValue(),
            confidence: 'not_assessed',
            summary: '',
          });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getListLeadEvidenceQueryKey(leadId) }),
            queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey({ limit: 8 }) }),
          ]);
        },
      },
    );
  };

  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-title">
      <div className="panel-heading">
        <div>
          <h2 id="evidence-title">Source evidence</h2>
          <p className="evidence-panel-subtitle">Append-only provenance · each entry preserves what was observed</p>
        </div>
        <span className="panel-kicker">HUMAN REVIEW</span>
      </div>

      <div className="evidence-layout">
        <div className="evidence-timeline">
          {evidence.isLoading ? (
            <LoadingState rows={3} />
          ) : evidence.isError ? (
            <ErrorState retry={() => evidence.refetch()} />
          ) : evidence.data?.length ? (
            <div className="evidence-entry-list">
              {evidence.data.map((item) => <EvidenceEntry key={item.id} item={item} />)}
            </div>
          ) : (
            <EmptyState
              title="No provenance recorded"
              detail="Add the first source record to establish what was seen, when, and how it was collected."
            />
          )}
        </div>

        <div
          className="evidence-form"
          role="form"
          aria-label="Add source evidence"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
              event.preventDefault();
              submit();
            }
          }}
        >
          <div className="evidence-form-heading">
            <span className="evidence-form-icon"><FilePlus2 size={15} /></span>
            <div>
              <strong>Add source record</strong>
              <span>Entries cannot be edited or removed.</span>
            </div>
          </div>
          <div className="form-grid evidence-fields">
            <label className="form-field">
              <FieldLabel>Source type</FieldLabel>
              <select
                value={form.sourceType}
                onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value as LeadEvidenceSource }))}
                data-testid="select-evidence-source-type"
              >
                {sourceTypes.map((value) => (
                  <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <FieldLabel>Confidence</FieldLabel>
              <select
                value={form.confidence}
                onChange={(event) => setForm((current) => ({ ...current, confidence: event.target.value as EvidenceConfidence }))}
                data-testid="select-evidence-confidence"
              >
                {confidenceLevels.map((value) => (
                  <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <FieldLabel>Source name</FieldLabel>
              <input
                value={form.sourceName}
                onChange={(event) => setForm((current) => ({ ...current, sourceName: event.target.value }))}
                placeholder="Agency, publication, person, or site"
                maxLength={180}
                required
                data-testid="input-evidence-source-name"
              />
            </label>
            <label className="form-field">
              <FieldLabel>Collection method</FieldLabel>
              <input
                value={form.collectionMethod}
                onChange={(event) => setForm((current) => ({ ...current, collectionMethod: event.target.value }))}
                placeholder="How this record was obtained"
                maxLength={180}
                required
                data-testid="input-evidence-collection-method"
              />
            </label>
            <label className="form-field">
              <FieldLabel>Observed date & time</FieldLabel>
              <input
                type="datetime-local"
                value={form.observedAt}
                onChange={(event) => setForm((current) => ({ ...current, observedAt: event.target.value }))}
                required
                data-testid="input-evidence-observed-at"
              />
            </label>
            <label className="form-field">
              <FieldLabel>Source URL <small>Optional</small></FieldLabel>
              <input
                type="url"
                value={form.sourceUrl}
                onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))}
                placeholder="https://"
                data-testid="input-evidence-source-url"
              />
            </label>
            <label className="form-field full">
              <FieldLabel>Evidence summary</FieldLabel>
              <textarea
                value={form.summary}
                onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                placeholder="Describe the observable facts. Separate what was seen from what is inferred."
                rows={3}
                maxLength={1200}
                required
                data-testid="input-evidence-summary"
              />
            </label>
          </div>
          {(addEvidence.isError || validationError) && (
            <div className="inline-error" role="alert">
              {validationError || 'Could not add this source record. Check the details and try again.'}
            </div>
          )}
          <div className="evidence-form-footer">
            <span><LockKeyhole size={12} /> Preserved as an append-only record</span>
            <button className="button button-primary" type="button" onClick={submit} disabled={addEvidence.isPending} data-testid="button-add-evidence">
              {addEvidence.isPending ? 'Recording…' : 'Record evidence'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
