import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, CircleDot, Layers3, ShieldCheck } from 'lucide-react';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell, Brand } from '@/components/shell';
import { DashboardPage, JobsPage, LeadFormPage, LeadsPage, WorkersPage } from '@/pages/workspace';
import { SourcesPage } from '@/pages/sources';
import { ClientRequestsPage } from '@/pages/client-requests';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkPubKey = clerkKey
  ? publishableKeyFromHost(window.location.hostname, clerkKey)
  : undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#285c50',
    colorForeground: '#24323a',
    colorMutedForeground: '#68736f',
    colorDanger: '#ad3934',
    colorBackground: '#fbf9f2',
    colorInput: '#fffdf8',
    colorInputForeground: '#24323a',
    colorNeutral: '#d5d1c5',
    fontFamily: 'Manrope',
    borderRadius: '0.55rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf9f2] rounded-xl w-[440px] max-w-full overflow-hidden border border-[#d8d2c5]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#24323a] font-bold',
    headerSubtitle: 'text-[#68736f]',
    socialButtonsBlockButtonText: 'text-[#24323a] font-semibold',
    formFieldLabel: 'text-[#34423e] font-semibold',
    footerActionLink: 'text-[#285c50] font-bold',
    footerActionText: 'text-[#68736f]',
    dividerText: 'text-[#68736f]',
    identityPreviewEditButton: 'text-[#285c50]',
    formFieldSuccessText: 'text-[#285c50]',
    alertText: 'text-[#8d302c]',
    logoBox: 'rounded-lg',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'border border-[#d8d2c5] bg-[#fffdf8] rounded-lg',
    formButtonPrimary: 'bg-[#285c50] hover:bg-[#20483f] text-white rounded-lg',
    formFieldInput: 'bg-[#fffdf8] text-[#24323a] border-[#d5d1c5] rounded-lg',
    footerAction: 'border-t border-[#e6e1d6]',
    dividerLine: 'bg-[#d8d2c5]',
    alert: 'bg-[#fbf0ed] border-[#e6c7c0]',
    otpCodeFieldInput: 'bg-[#fffdf8] border-[#d5d1c5] text-[#24323a]',
    formFieldRow: 'gap-1.5',
    main: 'gap-5',
  },
};

function LandingPage() {
  return (
    <main className="landing grain">
      <header className="landing-nav"><Brand /><nav><a href="#method">Method</a><a href="#workflow">Workspace</a><a href="#principles">Principles</a></nav><div className="landing-auth"><a href={`${basePath}/sign-in`} className="landing-signin">Sign in</a><a href={`${basePath}/sign-up`} className="button button-primary">Open workspace <ArrowUpRight size={15} /></a></div></header>
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="hero-overline"><span className="pulse-dot" /> OPERATOR-GRADE DISTRESS INTELLIGENCE</div>
          <h1>Evidence first.<br /><em>Decisions that move.</em></h1>
          <p>One clear line from a distress signal to a reviewed decision, a next action, and the person who gets it done.</p>
          <div className="hero-actions"><a href={`${basePath}/sign-up`} className="button button-primary hero-cta">Enter the workspace <ArrowRight size={16} /></a><a href="#method" className="hero-secondary">See how it works <ChevronRight size={15} /></a></div>
          <div className="hero-proof"><span><ShieldCheck size={15} /> Human-reviewed decisions</span><span><CircleDot size={13} /> Evidence stays attached</span></div>
        </div>
        <div className="hero-art" aria-label="Distress intelligence decision workflow illustration">
          <div className="art-topline"><span>FIELD NOTE / 024</span><span>LIVE WORKSPACE</span></div>
          <div className="radar-ring ring-one" /><div className="radar-ring ring-two" /><div className="radar-ring ring-three" />
          <div className="signal-node"><div className="signal-core"><Layers3 size={23} /></div><span>Distress signal</span></div>
          <div className="signal-line line-a" /><div className="signal-line line-b" /><div className="signal-line line-c" />
          <div className="orbit-node orbit-a"><span>01</span> EVIDENCE</div><div className="orbit-node orbit-b"><span>02</span> DECISION</div><div className="orbit-node orbit-c"><span>03</span> EXECUTION</div>
          <div className="art-card evidence-card"><small>ATTACHED SOURCE</small><strong>Public auction notice</strong><span><Check size={12} /> Evidence logged</span></div>
          <div className="art-card decision-card"><small>OPERATOR REVIEW</small><strong>Conditional bid</strong><span>Next action · Confirm access</span></div>
          <div className="art-caption"><span>INTELLIGENCE, IN MOTION</span><div><b>01</b> / 03</div></div>
        </div>
      </section>
      <section id="method" className="method-section">
        <div className="section-index">01 — THE METHOD</div>
        <div className="method-body"><h2>Good judgment needs<br />a good paper trail.</h2><p>Distress work moves across messy sources, uncertain values, conversations, and boots-on-the-ground logistics. The workspace keeps the chain intact without pretending the answer is automatic.</p></div>
        <div className="method-rule"><span>Signal</span><b>→</b><span>Evidence</span><b>→</b><span>Review</span><b>→</b><span>Action</span></div>
      </section>
      <section id="workflow" className="workflow-section">
        <div className="section-index">02 — ONE CONNECTED WORKFLOW</div>
        <div className="workflow-grid"><div className="workflow-intro"><h2>From first clue<br />to field execution.</h2><p>Not another lead list. A decision workspace built around how operators actually work.</p><a href={`${basePath}/sign-up`} className="text-action">Start with a lead <ArrowUpRight size={15} /></a></div><div className="workflow-steps">
          <WorkflowRow index="01" title="Capture the signal" text="Record where it came from, what is distressed, and when it matters." />
          <WorkflowRow index="02" title="Keep the evidence close" text="Source links, context, class inputs, and hard vetoes stay on the record." />
          <WorkflowRow index="03" title="Make the decision legible" text="A repeatable score informs a human-owned bid, watch, pass, or next move." />
          <WorkflowRow index="04" title="Put work in motion" text="Turn the decision into a scheduled job with the right skills and a real operator." />
        </div></div>
      </section>
      <section id="principles" className="principles-section"><div className="section-index">03 — BUILT FOR THE OPERATOR</div><div className="principles-copy"><h2>Precise, not precious.</h2><p>A small team needs less ceremony and more signal. Distress Intelligence makes uncertainty visible, gives every record a next step, and leaves the judgment where it belongs: with a person.</p></div><div className="principle-list"><div><b>01</b><span>Evidence before conviction</span><Check size={15} /></div><div><b>02</b><span>Repeatable, reviewable decisions</span><Check size={15} /></div><div><b>03</b><span>Field execution tied to context</span><Check size={15} /></div><div><b>04</b><span>Approximate distance, respectful by design</span><Check size={15} /></div></div></section>
      <section className="closing-section"><span className="eyebrow">THE OPERATOR DESK IS READY</span><h2>Keep the signal.<br /><em>Move with clarity.</em></h2><a href={`${basePath}/sign-up`} className="button button-primary">Open your workspace <ArrowUpRight size={15} /></a></section>
      <footer className="landing-footer"><Brand /><span>DECISIONS, GROUNDED IN EVIDENCE.</span><span>© {new Date().getFullYear()} DISTRESS INTELLIGENCE</span></footer>
    </main>
  );
}

function WorkflowRow({ index, title, text }: { index: string; title: string; text: string }) {
  return <div className="workflow-row"><span>{index}</span><div><h3>{title}</h3><p>{text}</p></div><ArrowUpRight size={15} /></div>;
}

function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><LandingPage /></Show></>;
}

function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in"><AppShell>{children}</AppShell></Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

function SignInPage() {
  return <div className="auth-page"><div className="auth-background"><Brand /><p>THE DISTRESS INTELLIGENCE OPERATOR DESK</p></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="auth-page"><div className="auth-background"><Brand /><p>START WITH A CLEARER SIGNAL.</p></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }: { user?: { id: string } | null }) => {
      const userId = user?.id ?? null;
      if (previous.current !== undefined && previous.current !== userId) cache.clear();
      previous.current = userId;
    });
    return unsubscribe;
  }, [addListener, cache]);
  return null;
}

function RouterRoutes() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={HomeRedirect} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/dashboard"><Protected><DashboardPage /></Protected></Route>
    <Route path="/leads/new"><Protected><LeadFormPage /></Protected></Route>
    <Route path="/leads/storage"><Protected><LeadsPage classFilter="storage" /></Protected></Route>
    <Route path="/leads/real-estate"><Protected><LeadsPage classFilter="real_estate" /></Protected></Route>
    <Route path="/leads/estates"><Protected><LeadsPage classFilter="estate" /></Protected></Route>
    <Route path="/leads/commercial"><Protected><LeadsPage classFilter="commercial" /></Protected></Route>
    <Route path="/leads/junk"><Protected><LeadsPage classFilter="junk" /></Protected></Route>
    <Route path="/leads/packages"><Protected><LeadsPage classFilter="package" /></Protected></Route>
    <Route path="/leads/:id"><Protected><LeadFormPage editing /></Protected></Route>
    <Route path="/leads"><Protected><LeadsPage /></Protected></Route>
    <Route path="/workers"><Protected><WorkersPage /></Protected></Route>
    <Route path="/jobs"><Protected><JobsPage /></Protected></Route>
    <Route path="/sources"><Protected><SourcesPage /></Protected></Route>
    <Route path="/client-requests"><Protected><ClientRequestsPage /></Protected></Route>
    <Route component={NotFound} />
  </Switch></ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Return to your operator desk' } }, signUp: { start: { title: 'Create your operator account', subtitle: 'Keep decisions close to the evidence' } } }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><RouterRoutes /></QueryClientProvider>
  </ClerkProvider>;
}

function AuthSetupRequired({ title }: { title: string }) {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto flex max-w-xl flex-col gap-8">
        <Brand />
        <section className="rounded-xl border border-border bg-card p-7 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Operator access
          </p>
          <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
          <p className="mt-3 leading-7 text-muted-foreground">
            Clerk authentication has not been configured for this workspace.
            Operator records stay protected until sign-in is enabled.
          </p>
          <a className="mt-6 inline-flex font-semibold text-primary underline-offset-4 hover:underline" href={`${basePath}/`}>
            Return to overview
          </a>
        </section>
      </div>
    </main>
  );
}

function UnconfiguredRoutes() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/sign-in/*?">
          <AuthSetupRequired title="Sign-in is not available yet" />
        </Route>
        <Route path="/sign-up/*?">
          <AuthSetupRequired title="Account setup is not available yet" />
        </Route>
        <Route path="/dashboard"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/leads/new"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/leads/storage"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/leads/real-estate"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/leads/estates"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/leads/commercial"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/leads/junk"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/leads/packages"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/leads/:id"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/leads"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/workers"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/jobs"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/sources"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route path="/client-requests"><AuthSetupRequired title="The operator workspace is locked" /></Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      {clerkPubKey ? (
        <ClerkProviderWithRoutes />
      ) : (
        <QueryClientProvider client={queryClient}>
          <UnconfiguredRoutes />
        </QueryClientProvider>
      )}
    </WouterRouter>
  );
}

export default App;
