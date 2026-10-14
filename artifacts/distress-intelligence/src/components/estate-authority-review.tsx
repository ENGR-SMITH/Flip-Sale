import { getGetLeadQueryKey, getListEstateAuthorityReviewsQueryKey, useAddEstateAuthorityReview, useListEstateAuthorityReviews } from '@workspace/api-client-react';
import type { EstateAuthorityReviewInput, Lead } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { useState } from 'react';
import { LockKeyhole, ShieldAlert, ShieldCheck } from 'lucide-react';
import { EmptyState, ErrorState, FieldLabel, LoadingState, StatusPill } from '@/components/shell';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function EstateAuthorityReviewPanel({ lead }: { lead: Lead }) {
  const cache = useQueryClient();
  const { user } = useUser();
  const reviews = useListEstateAuthorityReviews(lead.id, {
    query: {
      queryKey: getListEstateAuthorityReviewsQueryKey(lead.id),
    },
  });
  const addReview = useAddEstateAuthorityReview();
  const [status, setStatus] = useState<'verified' | 'rejected'>('verified');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [notes, setNotes] = useState('');
  const [validation, setValidation] = useState('');

  const submit = () => {
    if (!evidenceRef.trim() || !notes.trim()) {
      setValidation('Evidence reference and reviewer notes are required for this dedicated decision.');
      return;
    }
    setValidation('');
    const payload: EstateAuthorityReviewInput = {
      status,
      evidenceRef: evidenceRef.trim(),
      reviewNotes: notes.trim(),
    };
    addReview.mutate(
      { id: lead.id, data: payload },
      {
        onSuccess: async () => {
          await Promise.all([
            cache.invalidateQueries({ queryKey: getListEstateAuthorityReviewsQueryKey(lead.id) }),
            cache.invalidateQueries({ queryKey: getGetLeadQueryKey(lead.id) }),
          ]);
          setEvidenceRef('');
          setNotes('');
        },
      },
    );
  };

  const blocked = lead.estateAuthorityStatus !== 'verified';

  return (
    <section className={`panel authority-panel ${blocked ? 'authority-blocked' : 'authority-verified'}`} aria-labelledby="authority-heading">
      <div className="panel-heading">
        <div>
          <h2 id="authority-heading">Estate authority</h2>
          <p className="evidence-panel-subtitle">Estate-only action gate · status changes require an append-only operator review</p>
        </div>
        <StatusPill value={lead.estateAuthorityStatus} />
      </div>
      <div className="authority-gate">
        {blocked ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
        <div>
          <strong>{blocked ? 'Estate authority is blocked' : 'Authority verified by review'}</strong>
          <span>{blocked ? 'No estate/probate commitment or outreach should proceed until a human review verifies representative authority.' : 'Estate authority is verified. Outreach, agreements, and cleanout still require human approval.'}</span>
        </div>
      </div>
      {lead.estateAuthorityEvidenceRef && <div className="authority-current"><span>Current evidence reference</span><strong>{lead.estateAuthorityEvidenceRef}</strong><small>{lead.estateAuthorityReviewerId || 'Reviewer not recorded'} · {lead.estateAuthorityReviewedAt ? formatDate(lead.estateAuthorityReviewedAt) : 'Review time unavailable'}</small></div>}
      <div className="authority-layout">
        <div className="authority-history">
          <span className="panel-kicker">REVIEW HISTORY</span>
          {reviews.isLoading ? <LoadingState rows={2} /> : reviews.isError ? <ErrorState retry={() => reviews.refetch()} /> : reviews.data?.length ? (
            <div className="authority-event-list">{[...reviews.data].reverse().map((review) => <article key={review.id}><div><StatusPill value={review.status} /><time>{formatDate(review.reviewedAt)}</time></div><p>{review.reviewNotes}</p><small>{review.previousStatus} → {review.status} · {review.reviewerId}{review.evidenceRef ? ` · ${review.evidenceRef}` : ''}</small></article>)}</div>
          ) : <EmptyState title="No authority review" detail="The default status remains unknown and blocked until an operator records a review." />}
        </div>
        <div className="authority-form">
          <div className="authority-form-title"><LockKeyhole size={14} /><strong>Record authority decision</strong></div>
          <label className="form-field"><FieldLabel>Review outcome</FieldLabel><select value={status} onChange={(event) => setStatus(event.target.value as 'verified' | 'rejected')} data-testid={`select-authority-status-${lead.id}`}><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label>
          <label className="form-field"><FieldLabel>Evidence reference</FieldLabel><input value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} maxLength={500} placeholder="Docket, filing, document, or evidence ID" data-testid={`input-authority-evidence-${lead.id}`} /></label>
          <label className="form-field"><FieldLabel>Reviewer notes</FieldLabel><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1200} rows={3} placeholder="Record what was reviewed and the basis for this status." data-testid={`input-authority-notes-${lead.id}`} /></label>
          {validation && <p className="inline-error">{validation}</p>}
          {addReview.isError && <p className="inline-error">Authority decision could not be recorded. Try again.</p>}
          <div className="authority-form-footer"><span>{user?.fullName || user?.id || 'Signed-in operator'} · reviewer identity follows the authenticated session</span><button type="button" className="button button-primary" onClick={submit} disabled={addReview.isPending} data-testid={`button-record-authority-${lead.id}`}>{addReview.isPending ? 'Recording…' : 'Record review'}</button></div>
        </div>
      </div>
    </section>
  );
}
