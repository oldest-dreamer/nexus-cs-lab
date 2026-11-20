import { useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, Loader2, Mail, User, X } from 'lucide-react';
import { useProgress } from '../context/ProgressContext';

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { configured, signIn, signUp } = useProgress();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    const err = tab === 'signin' ? await signIn(email, password) : await signUp(email, password, name.trim() || undefined);
    setBusy(false);
    if (err) return setError(err);
    if (tab === 'signup') setNotice('Account created. If email confirmation is on in Supabase, check your inbox, then sign in.');
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="nx-card w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="auth-title" className="font-mono text-lg font-bold text-white">
            {tab === 'signin' ? 'ACCESS TERMINAL' : 'NEW OPERATOR'}
          </h2>
          <button onClick={onClose} className="text-mute hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {!configured ? (
          <div className="space-y-3 text-sm text-slate-300">
            <p>Supabase isn't connected yet, so NEXUS is running in <b className="text-nx-amber">local mode</b>. All XP, lessons and flags are saved in this browser.</p>
            <p>To enable accounts and cloud sync:</p>
            <ol className="list-decimal space-y-1 pl-5 text-slate-400">
              <li>Run <code className="text-nx-cyan">supabase_schema.sql</code> in the Supabase SQL editor.</li>
              <li>Copy <code className="text-nx-cyan">.env.example</code> → <code className="text-nx-cyan">.env.local</code> and add your URL + publishable key.</li>
              <li>Restart <code className="text-nx-cyan">npm run dev</code>. Local progress syncs on first sign-in.</li>
            </ol>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-obsidian p-1">
              {(['signin', 'signup'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-md py-1.5 text-sm font-semibold ${tab === t ? 'bg-panel-2 text-nx-cyan' : 'text-mute'}`}>
                  {t === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="space-y-3">
              {tab === 'signup' && (
                <Field icon={<User className="h-4 w-4" />}>
                  <input className="nx-input pl-9" placeholder="Display name (optional, 2–40 chars)" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={40} />
                </Field>
              )}
              <Field icon={<Mail className="h-4 w-4" />}>
                <input className="nx-input pl-9" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field icon={<KeyRound className="h-4 w-4" />}>
                <input
                  className="nx-input pl-9"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  placeholder="Password (min 8 chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {error && <p className="rounded-md border border-nx-crimson/40 bg-nx-crimson/10 px-3 py-2 text-sm text-nx-crimson">{error}</p>}
              {notice && <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">{notice}</p>}
              <button type="submit" disabled={busy} className="nx-btn-primary w-full">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {tab === 'signin' ? 'Sign in' : 'Create account'}
              </button>
              <p className="text-center text-xs text-mute">Guest progress on this device is merged into your account on sign-in.</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute">{icon}</span>
      {children}
    </div>
  );
}
