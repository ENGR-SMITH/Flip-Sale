import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import { ServiceRequestForm } from '@/components/service-request-form';

export default function ClientRequestPage() {
  return (
    <div className="client-page">
      <header className="client-topbar">
        <div className="client-brand" aria-label="Distress Intelligence">
          <span className="client-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M5 19V5h4l7 8V5h4v14h-3.5L9 10v9z" />
            </svg>
          </span>
          <span className="client-brand-name">DISTRESS <span>INTELLIGENCE</span></span>
        </div>
        <div className="client-top-note"><i /> Client service request</div>
      </header>

      <section className="client-hero">
        <div className="client-hero-inner reveal">
          <div className="client-eyebrow">A practical next step</div>
          <h1>Tell us what needs taking care of.</h1>
          <p>
            Whether you are managing a property, an estate, stored contents, or a
            single pickup, start with a few details. Our team will review your
            request and get in touch.
          </p>
          <div className="client-hero-rule"><span /> A straightforward way to ask for help</div>
        </div>
      </section>

      <main className="client-main">
        <div className="client-layout">
          <section className="request-card reveal" aria-label="Service request form">
            <ServiceRequestForm />
          </section>

          <aside className="client-aside" aria-label="About your request">
            <section className="aside-panel">
              <div className="aside-kicker">What happens next</div>
              <h3>One clear conversation.</h3>
              <p>Share what you know. We will use your details to understand the request and follow up with you.</p>
              <div className="aside-steps">
                <div className="aside-step"><b>01</b><span>Tell us the service and where the work is needed.</span></div>
                <div className="aside-step"><b>02</b><span>Describe the situation in your own words.</span></div>
                <div className="aside-step"><b>03</b><span>We will respond using the contact details you provide.</span></div>
              </div>
            </section>
            <section className="aside-panel">
              <div className="aside-kicker">A note on details</div>
              <h3>Only what helps us understand.</h3>
              <p>A general location and a short description are a good place to begin. You can explain the details when we follow up.</p>
              <div className="aside-divider" />
              <div className="aside-note">
                <LockKeyhole size={14} />
                <span>Your information is provided to the service team so they can respond to this request.</span>
              </div>
            </section>
            <section className="aside-panel">
              <div className="aside-kicker">Not sure which option?</div>
              <h3>Choose the closest fit.</h3>
              <p>Select the service that best describes the situation. You can add context in the description, and the team can clarify with you.</p>
              <div className="aside-divider" />
              <div className="aside-note"><ArrowRight size={14} /><span>You do not need to have every detail figured out before reaching out.</span></div>
            </section>
          </aside>
        </div>
      </main>

      <footer className="client-footer">
        <span>Distress Intelligence · Service requests</span>
        <span><Check size={11} /> No account required</span>
      </footer>
    </div>
  );
}
