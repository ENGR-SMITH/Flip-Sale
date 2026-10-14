import { useState, type FormEvent } from 'react';
import {
  Archive,
  Building2,
  Check,
  CircleAlert,
  FileBox,
  Home,
  LockKeyhole,
  PackageCheck,
  Send,
  Trash2,
} from 'lucide-react';
import { useCreateClientServiceRequest } from '@workspace/api-client-react';

type ServiceClass = 'storage' | 'real_estate' | 'estate' | 'commercial' | 'junk' | 'package';

const serviceOptions: { value: ServiceClass; label: string; icon: typeof Archive }[] = [
  { value: 'storage', label: 'Storage contents', icon: Archive },
  { value: 'real_estate', label: 'Property', icon: Home },
  { value: 'estate', label: 'Estate', icon: FileBox },
  { value: 'commercial', label: 'Commercial contents', icon: Building2 },
  { value: 'junk', label: 'Cleanout', icon: Trash2 },
  { value: 'package', label: 'Item or package pickup', icon: PackageCheck },
];

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { error?: unknown; message?: unknown; data?: unknown };
    if (typeof candidate.error === 'string') return candidate.error;
    if (typeof candidate.message === 'string') return candidate.message;
    if (candidate.data && typeof candidate.data === 'object') {
      const data = candidate.data as { error?: unknown; message?: unknown };
      if (typeof data.error === 'string') return data.error;
      if (typeof data.message === 'string') return data.message;
    }
  }
  return 'We could not send your request right now. Please try again.';
}

export function ServiceRequestForm() {
  const [serviceClass, setServiceClass] = useState<ServiceClass | ''>('');
  const [serviceError, setServiceError] = useState('');
  const [consented, setConsented] = useState(false);
  const [serverError, setServerError] = useState('');
  const [accepted, setAccepted] = useState<{
    requestId: string;
    submittedAt: string;
    message: string;
  } | null>(null);
  const createRequest = useCreateClientServiceRequest();
  const isPending = createRequest.isPending;

  function startAnotherRequest() {
    setAccepted(null);
    setServerError('');
    setServiceError('');
    setServiceClass('');
    setConsented(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    if (!serviceClass) {
      setServiceError('Choose the closest service type to continue.');
      document.getElementById('service-type')?.focus();
      return;
    }

    const formData = new FormData(event.currentTarget);
    const phone = String(formData.get('phone') ?? '').trim();
    const preferredDate = String(formData.get('preferredDate') ?? '').trim();
    setServerError('');

    try {
      const response = await createRequest.mutateAsync({
        data: {
          serviceClass,
          fullName: String(formData.get('fullName') ?? '').trim(),
          email: String(formData.get('email') ?? '').trim(),
          phone: phone || null,
          jobLocation: String(formData.get('jobLocation') ?? '').trim(),
          description: String(formData.get('description') ?? '').trim(),
          preferredDate: preferredDate || null,
          consentToContact: true,
        },
      });
      setAccepted({
        requestId: response.requestId,
        submittedAt: response.submittedAt,
        message: response.message,
      });
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  }

  if (accepted) {
    return (
      <div className="success-wrap reveal" role="status" data-testid="status-request-accepted">
        <div className="success-card">
          <div className="success-icon"><Check size={25} strokeWidth={2.3} /></div>
          <div className="request-step">Request received</div>
          <h2>Thank you for reaching out.</h2>
          <p className="success-message" data-testid="text-server-response">{accepted.message}</p>
          <div className="reference-box">
            <span>Request reference</span>
            <strong data-testid="text-request-reference">{accepted.requestId}</strong>
          </div>
          {Number.isFinite(Date.parse(accepted.submittedAt)) && (
            <p className="success-footnote" data-testid="text-submitted-at">
              Submitted {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(accepted.submittedAt))}
            </p>
          )}
          <p className="success-footnote">Keep this reference for your records. Your request has been sent to the service team.</p>
          <button className="submit-button success-new" type="button" onClick={startAnotherRequest} data-testid="button-new-request">
            Send another request
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="request-head">
        <div>
          <div className="request-step">Start here · 01</div>
          <h2>Request service</h2>
          <p>Tell us a little about what you need. Fields marked required need an answer.</p>
        </div>
        <div className="request-mark"><Send size={17} /></div>
      </div>

      <form onSubmit={handleSubmit}>
        <fieldset disabled={isPending}>
        <section className="form-section">
          <div className="form-section-title"><b>01</b> What do you need help with?</div>
          <div className="service-options" id="service-type" role="radiogroup" aria-label="Service type" tabIndex={-1} aria-describedby={serviceError ? 'service-type-error' : undefined}>
            {serviceOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={serviceClass === value}
                className={`service-option${serviceClass === value ? ' selected' : ''}`}
                onClick={() => {
                  setServiceClass(value);
                  setServiceError('');
                  setServerError('');
                }}
                data-testid={`button-service-${value}`}
              >
                <Icon size={16} strokeWidth={1.7} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {serviceError && <span className="field-error" id="service-type-error" role="alert" data-testid="error-service-class">{serviceError}</span>}
        </section>

        <section className="form-section">
          <div className="form-section-title"><b>02</b> Where and what?</div>
          <div className="field-grid">
            <div className="field full">
              <label htmlFor="jobLocation">Job location <small>Required</small></label>
              <input id="jobLocation" name="jobLocation" required minLength={2} maxLength={240} placeholder="Street, city, or general area" autoComplete="street-address" data-testid="input-job-location" />
            </div>
            <div className="field full">
              <label htmlFor="description">Tell us about the job <small>Required</small></label>
              <textarea id="description" name="description" required minLength={10} maxLength={1600} placeholder="What needs to be handled? Include any details that would help us understand the work." data-testid="input-description" />
            </div>
            <div className="field">
              <label htmlFor="preferredDate">Preferred date <small>Optional</small></label>
              <input id="preferredDate" name="preferredDate" type="date" data-testid="input-preferred-date" />
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-title"><b>03</b> How can we reach you?</div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="fullName">Full name <small>Required</small></label>
              <input id="fullName" name="fullName" required maxLength={160} autoComplete="name" placeholder="Your name" data-testid="input-full-name" />
            </div>
            <div className="field">
              <label htmlFor="email">Email address <small>Required</small></label>
              <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" data-testid="input-email" />
            </div>
            <div className="field full">
              <label htmlFor="phone">Phone number <small>Optional</small></label>
              <input id="phone" name="phone" type="tel" maxLength={80} autoComplete="tel" placeholder="A number where we can reach you" data-testid="input-phone" />
            </div>
          </div>
        </section>

        <section className="form-section">
          <label className="consent-line" htmlFor="consentToContact">
            <input
              id="consentToContact"
              name="consentToContact"
              type="checkbox"
              required
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
              data-testid="input-consent"
            />
            <span>I agree that Distress Intelligence may contact me about this service request. <strong>Required</strong></span>
          </label>
        </section>
        </fieldset>

        {serverError && (
          <div className="form-error" role="alert" data-testid="status-submit-error">
            <CircleAlert size={15} />
            <span>{serverError}</span>
          </div>
        )}

        <div className="submit-row">
          <div className="privacy-inline"><LockKeyhole size={13} /> Your details are used to respond to this request.</div>
          <button className="submit-button" type="submit" disabled={isPending} data-testid="button-submit-request">
            {isPending ? 'Sending request…' : 'Send service request'}
            {!isPending && <ArrowRightIcon />}
          </button>
        </div>
        {isPending && <p className="pending-note" role="status" data-testid="status-submit-pending">Your request is being sent securely. Please keep this page open.</p>}
      </form>
    </>
  );
}

function ArrowRightIcon() {
  return <Send size={14} />;
}
