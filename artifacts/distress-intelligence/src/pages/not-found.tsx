import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'wouter';
import { Brand } from '@/components/shell';

export default function NotFound() {
  return (
    <main className="not-found-page grain">
      <header><Brand /></header>
      <section className="not-found-card">
        <span className="not-found-index mono">ROUTE / UNRESOLVED</span>
        <div className="not-found-mark"><Compass size={23} /></div>
        <h1>This record is off the map.</h1>
        <p>The address does not match a workspace route. Return to the operator desk and continue from a known record.</p>
        <Link href="/" className="button button-primary"><ArrowLeft size={15} /> Return to the desk</Link>
      </section>
      <span className="not-found-foot mono">DISTRESS INTELLIGENCE · OPERATOR DESK</span>
    </main>
  );
}
