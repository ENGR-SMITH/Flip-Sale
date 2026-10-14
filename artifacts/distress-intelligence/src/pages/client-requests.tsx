import { getListClientServiceRequestsQueryKey, useListClientServiceRequests, useUpdateClientServiceRequest } from '@workspace/api-client-react';
import type { ClientServiceRequest, ClientServiceRequestStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Mail, MapPin, Phone, Save, Search } from 'lucide-react';
import { AssetLabel, EmptyState, ErrorState, LoadingState, PageHeading, StatusPill } from '@/components/shell';

const statuses: ClientServiceRequestStatus[] = ['new', 'reviewing', 'contacted', 'scheduled', 'closed'];
const filters: { value: string; label: string }[] = [
  { value: '', label: 'All requests' },
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'closed', label: 'Closed' },
];

function timestamp(value: string) {
  return new Date(value).toLocaleString();
}

function RequestCard({
  request,
  onSave,
  pending,
}: {
  request: ClientServiceRequest;
  onSave: (request: ClientServiceRequest, status: ClientServiceRequestStatus, note: string) => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<ClientServiceRequestStatus>(request.status);
  const [note, setNote] = useState(request.operatorNote || '');
  const changed = status !== request.status || note !== (request.operatorNote || '');

  return (
    <article className="client-request-card" data-testid={`card-client-request-${request.id}`}>
      <div className="request-card-head">
        <div>
          <span className="eyebrow">PUBLIC SERVICE REQUEST</span>
          <h2>{request.fullName}</h2>
        </div>
        <StatusPill value={request.status} />
      </div>
      <div className="request-class-line">
        <AssetLabel value={request.serviceClass} />
        <span>Received {timestamp(request.createdAt)}</span>
      </div>
      <div className="request-contact-grid">
        <a href={`mailto:${request.email}`} data-testid={`link-request-email-${request.id}`}><Mail size={14} />{request.email}</a>
        {request.phone && <a href={`tel:${request.phone}`} data-testid={`link-request-phone-${request.id}`}><Phone size={14} />{request.phone}</a>}
        <span><MapPin size={14} />{request.jobLocation}</span>
      </div>
      <div className="request-description">
        <span>REQUEST DETAILS</span>
        <p>{request.description}</p>
      </div>
      <div className="request-date-consent">
        <span>Preferred date <strong>{request.preferredDate ? new Date(request.preferredDate).toLocaleDateString() : 'Flexible / not provided'}</strong></span>
        <span>Contact consent <strong>{request.consentToContact ? 'Provided' : 'Not provided'}</strong></span>
        <span>Updated <strong>{timestamp(request.updatedAt)}</strong></span>
      </div>
      <div className="request-operator-fields">
        <label className="form-field">
          <span className="field-label">Request status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as ClientServiceRequestStatus)} data-testid={`select-request-status-${request.id}`}>
            {statuses.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
        <label className="form-field">
          <span className="field-label">Internal operator note</span>
          <textarea rows={3} maxLength={1200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Keep internal context for the team." data-testid={`input-request-note-${request.id}`} />
        </label>
      </div>
      <div className="request-card-actions">
        {request.consentToContact ? <a href={`mailto:${request.email}`} className="button button-secondary" data-testid={`button-email-request-${request.id}`}><Mail size={14} /> Draft email</a> : <span className="no-consent-note">Contact permission was not provided.</span>}
        <button className="button button-primary" disabled={pending || !changed} onClick={() => onSave(request, status, note)} data-testid={`button-save-request-${request.id}`}>
          {pending ? <span>Saving…</span> : <><Save size={14} /> Save updates</>}
        </button>
      </div>
    </article>
  );
}

export function ClientRequestsPage() {
  const cache = useQueryClient();
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [updatedId, setUpdatedId] = useState('');
  const params = useMemo(() => filter ? { status: filter as ClientServiceRequestStatus } : {}, [filter]);
  const requests = useListClientServiceRequests(params, {
    query: { queryKey: getListClientServiceRequestsQueryKey(params), refetchOnMount: 'always' },
  });
  const updateRequest = useUpdateClientServiceRequest();
  const filteredRequests = (requests.data || []).filter((request) => {
    const query = search.trim().toLowerCase();
    return !query || [request.fullName, request.email, request.jobLocation, request.description].some((value) => value.toLowerCase().includes(query));
  });

  const saveRequest = (request: ClientServiceRequest, status: ClientServiceRequestStatus, note: string) => {
    updateRequest.mutate(
      { id: request.id, data: { status, operatorNote: note.trim() || null } },
      {
        onSuccess: async () => {
          setUpdatedId(request.id);
          await cache.invalidateQueries({ queryKey: getListClientServiceRequestsQueryKey() });
        },
      },
    );
  };

  return (
    <div className="reveal">
      <PageHeading
        eyebrow="FIELD OPERATIONS / INTAKE"
        title="Client requests"
        description="Service requests from the separate public portal. Status and notes here are internal operator records."
      />
      <section className="request-intake-banner">
        <div className="request-intake-mark"><ArrowUpRight size={18} /></div>
        <div><span className="eyebrow">SEPARATE PUBLIC PORTAL</span><strong>Inbound work, reviewed by your team</strong><p>These requests are submitted outside the operator desk. Review the details and consent before making contact.</p></div>
        <span className="panel-kicker">OPERATOR API PROTECTED</span>
      </section>
      <div className="request-toolbar">
        <div className="request-filter-tabs" role="tablist" aria-label="Filter requests by status">
          {filters.map((option) => (
            <button key={option.value} className={filter === option.value ? 'active' : ''} onClick={() => setFilter(option.value)} data-testid={`button-request-filter-${option.value || 'all'}`}>
              {option.label}
              {option.value === '' && <span>{requests.data?.length ?? '—'}</span>}
            </button>
          ))}
        </div>
        <label className="request-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, location, details" aria-label="Search client requests" data-testid="input-search-client-requests" /></label>
      </div>
      {updatedId && <div className="operation-banner"><Check size={15} /> Request updates saved.<button onClick={() => setUpdatedId('')} aria-label="Dismiss message">Dismiss</button></div>}
      {updateRequest.isError && <div className="inline-error">Request update failed. Your changes have not been saved.</div>}
      {requests.isLoading ? <LoadingState rows={4} /> : requests.isError ? <ErrorState retry={() => requests.refetch()} /> : filteredRequests.length ? (
        <div className="client-request-list">
          {filteredRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onSave={saveRequest}
              pending={updateRequest.isPending && updateRequest.variables?.id === request.id}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={search ? 'No matching requests' : 'No requests in this view'}
          detail={search ? 'Try another name, location, or description.' : 'When a client submits a service request through the public portal, it will appear here for operator review.'}
          action={search ? <button className="button button-secondary" onClick={() => setSearch('')}>Clear search</button> : undefined}
        />
      )}
    </div>
  );
}
