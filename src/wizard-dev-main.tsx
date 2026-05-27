import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { SetupWizard } from './components/SetupWizard';
import { api } from './lib/api';

// --- Chrome mock (no deploymentUrl → wizard renders) ---
(window as unknown as Record<string, unknown>).chrome = {
  storage: {
    sync: {
      get: (_keys: unknown, cb: (result: Record<string, unknown>) => void) => cb({}),
      set: (_items: object, cb?: () => void) => { cb?.(); },
      remove: (_keys: string | string[], cb?: () => void) => { cb?.(); },
    },
  },
  identity: {
    getAuthToken: (_opts: object, cb: (token: string) => void) => cb('fake-dev-token'),
    removeCachedAuthToken: (_opts: object, cb?: () => void) => { cb?.(); },
  },
  runtime: { lastError: undefined },
  tabs: { create: () => {} },
};

// --- Scenario control ---
type Scenario = 'success' | 'html-error' | 'network-error' | 'auth-error';

function applyScenario(scenario: Scenario) {
  const { ApiError } = api as unknown as { ApiError: new (msg: string) => Error };
  switch (scenario) {
    case 'success':
      (api as Record<string, unknown>).getStatus = () => Promise.resolve({ success: true });
      break;
    case 'html-error':
      (api as Record<string, unknown>).getStatus = () =>
        Promise.reject(new Error('Apps Script returned HTML instead of JSON. This usually means the deployed version is missing the doGet function.'));
      break;
    case 'network-error':
      (api as Record<string, unknown>).getStatus = () =>
        Promise.reject(new TypeError('Failed to fetch'));
      break;
    case 'auth-error':
      (api as Record<string, unknown>).getStatus = () =>
        Promise.reject(ApiError ? new ApiError('Unauthorized') : new Error('Unauthorized'));
      break;
  }
}

applyScenario('success');

const SCENARIOS: { id: Scenario; label: string; color: string }[] = [
  { id: 'success',      label: '✓ Success',         color: 'bg-green-100 border-green-400 text-green-800' },
  { id: 'html-error',   label: '✗ Missing doGet',   color: 'bg-orange-100 border-orange-400 text-orange-800' },
  { id: 'network-error',label: '✗ Network error',   color: 'bg-red-100 border-red-400 text-red-800' },
  { id: 'auth-error',   label: '✗ Auth failed',     color: 'bg-yellow-100 border-yellow-400 text-yellow-800' },
];

function WizardPreview() {
  const [scenario, setScenario] = useState<Scenario>('success');
  const [key, setKey] = useState(0);

  function selectScenario(s: Scenario) {
    applyScenario(s);
    setScenario(s);
    setKey(k => k + 1); // remount wizard to reset its local state
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center py-8 gap-6">
      <div className="text-center">
        <h1 className="text-sm font-semibold text-slate-700">SetupWizard — Dev Preview</h1>
        <p className="text-xs text-slate-400 mt-0.5">Pick a scenario, then click "Save &amp; Connect" to see the result</p>
      </div>

      {/* Scenario picker */}
      <div className="flex flex-wrap gap-2 justify-center">
        {SCENARIOS.map(s => (
          <button
            key={s.id}
            onClick={() => selectScenario(s.id)}
            className={`px-3 py-1 text-xs font-medium border rounded-full transition-all cursor-pointer ${s.color} ${scenario === s.id ? 'ring-2 ring-offset-1 ring-slate-400' : 'opacity-60 hover:opacity-100'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Wizard */}
      <SetupWizard key={key} />

      <p className="text-[10px] text-slate-400">
        Enter any <code>https://script.google.com/...</code> URL to enable the button
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WizardPreview />
  </StrictMode>
);
