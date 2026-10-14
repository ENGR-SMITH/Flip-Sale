import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="client-page not-found-page">
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
      <main className="not-found-main reveal">
        <div className="not-found-mark"><Compass size={22} strokeWidth={1.6} /></div>
        <div className="client-eyebrow">Page not found · 404</div>
        <h1>This page isn’t here.</h1>
        <p>The address may be incomplete or out of date. Return to the service request page to find your way.</p>
        <Link href="/" className="submit-button not-found-link" data-testid="link-return-home">
          <ArrowLeft size={15} /> Return to service requests
        </Link>
      </main>
      <footer className="client-footer">
        <span>Distress Intelligence · Service requests</span>
        <span>No account required</span>
      </footer>
    </div>
  );
}
