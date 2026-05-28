import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Archive, Settings, ExternalLink, BarChart3, FolderOpen } from 'lucide-react';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-4">
    <p className="text-xs font-semibold text-slate-900 mb-3">{title}</p>
    {children}
  </div>
);

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <div className="flex gap-3 text-xs text-slate-600">
    <span className="shrink-0 w-5 h-5 rounded-full bg-[#1a73e8] text-white font-bold text-[10px] flex items-center justify-center">{n}</span>
    <span className="pt-0.5">{children}</span>
  </div>
);

const StatusRow = ({
  icon,
  label,
  color,
  description,
  tip,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  description: string;
  tip?: string;
}) => (
  <div className="border border-slate-100 rounded-lg p-3 space-y-1">
    <div className="flex items-center gap-2">
      {icon}
      <span className={`text-xs font-semibold ${color}`}>{label}</span>
    </div>
    <p className="text-xs text-slate-600">{description}</p>
    {tip && (
      <p className="text-[10px] text-slate-400 italic">{tip}</p>
    )}
  </div>
);

export function Help() {
  return (
    <div className="grid gap-4">
      {/* Setup guide */}
      <Section title="Getting Started">
        <div className="space-y-3">
          <Step n={1}>
            Create (or open) a Google Doc that will serve as your <strong>Master Document</strong> — this is where all meeting notes get appended. Copy its ID from the URL:{' '}
            <code className="bg-slate-100 px-1 rounded text-[10px]">docs.google.com/document/d/<strong>[ID]</strong>/edit</code>
          </Step>
          <Step n={2}>
            Create a Google Drive folder for <strong>Archives</strong>. When the master doc gets large, old content is moved here automatically. Copy the folder ID from its URL:{' '}
            <code className="bg-slate-100 px-1 rounded text-[10px]">drive.google.com/drive/folders/<strong>[ID]</strong></code>
          </Step>
          <Step n={3}>
            Deploy the <strong>Apps Script backend</strong>: open script.google.com, paste <code className="bg-slate-100 px-1 rounded text-[10px]">Code.gs</code>, deploy as a web app (<em>Execute as: Me</em>, <em>Who has access: Anyone</em>). Copy the deployment URL AND note the Script Project ID from the editor URL:{' '}
            <code className="bg-slate-100 px-1 rounded text-[10px]">script.google.com/home/projects/<strong>[SCRIPT_ID]</strong>/edit</code>
          </Step>
          <Step n={4}>
            Open the extension popup and complete the <strong>Setup Wizard</strong>: sign in, paste your deployment URL AND Script Project ID, click <strong>Save &amp; Connect</strong>. The wizard verifies the backend connection before completing.
          </Step>
          <Step n={5}>
            Go to{' '}
            <span className="inline-flex items-center gap-0.5 font-medium text-slate-700"><Settings className="w-3 h-3" /> Settings</span>{' '}
            to enter your Master Doc ID and Archive Folder ID, then click <strong>Save Settings</strong>.
          </Step>
          <Step n={6}>
            Try <span className="inline-flex items-center gap-0.5 font-medium text-slate-700"><RefreshCw className="w-3 h-3" /> Sync Now</span> from the Overview tab. Check the History tab to confirm it succeeded.
          </Step>
        </div>
      </Section>

      {/* Status meanings */}
      <Section title="Sync Statuses — What They Mean">
        <div className="space-y-2">
          <StatusRow
            icon={<CheckCircle className="w-4 h-4 text-green-600" />}
            label="Success"
            color="text-green-600"
            description="All discovered meeting notes were processed without errors. Everything is saved to your master doc."
          />
          <StatusRow
            icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
            label="Partial"
            color="text-amber-600"
            description="Some files were synced successfully, but at least one failed (e.g. a file was deleted mid-sync, or a transient API error occurred)."
            tip="Tip: Run Sync Now again — transient errors usually resolve on retry. Check History for the error message."
          />
          <StatusRow
            icon={<XCircle className="w-4 h-4 text-red-500" />}
            label="Error"
            color="text-red-500"
            description="The sync ran but no files were successfully processed. This usually means an auth issue, a misconfigured Master Doc ID, or a backend problem."
            tip="Tip: Verify your Master Doc ID and Archive Folder ID in Settings, then re-save and try again. If the error persists, check the Backend Status in Settings and click Deploy Update to re-deploy your Apps Script backend."
          />
          <p className="text-[10px] text-slate-400 italic mt-2">
            Archive events (manual or automatic) are recorded and visible in your History and Analytics tabs.
          </p>
        </div>
      </Section>

      {/* How to ensure everything saves */}
      <Section title="Ensuring Everything Saves Correctly">
        <div className="space-y-2 text-xs text-slate-600">
          <p className="font-medium text-slate-800">Checklist before syncing:</p>
          <ul className="space-y-1.5 pl-1">
            {[
              'Master Doc ID and Archive Folder ID are set and correct in Settings.',
              'The Apps Script backend is deployed with Execute as: Me and Who has access: Anyone (not "Anyone with Google account") — the script runs under your account and has access to your Drive.',
              'Your Google Meet notes are saved in a folder named exactly as configured in "Source Folder Name" (default: Meet Notes).',
              'You\'re signed into the same Google account in the extension as the one that owns the Apps Script.',
              'The deployment URL and Script Project ID in the extension match the current Apps Script deployment.',
              'Check the Backend Status in Settings — if it shows "Update available", click Deploy Update to push the latest code from the extension.',
              'Your extension version is up to date (the backend checksum verifies the deployed script matches the built-in hash).',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-green-500 mt-0.5">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Auto-sync */}
      <Section title="Auto-Sync">
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            Enable <strong>Auto-Sync</strong> in{' '}
            <span className="inline-flex items-center gap-0.5 font-medium text-slate-700"><Settings className="w-3 h-3" /> Settings</span>{' '}
            to have the extension sync automatically in the background — even when the popup is closed.
          </p>
          <p>
            This uses Chrome's <strong>Alarms API</strong> (a background service worker), so it works even if you don't open the extension. The minimum interval is 15 minutes.
          </p>
          <p className="text-[10px] text-slate-400 italic">
            Note: Chrome may throttle background alarms when your device is on battery saver or if Chrome is inactive for a long time. For critical syncs, use Sync Now manually.
          </p>
        </div>
      </Section>

      {/* Archive */}
      <Section title="Archiving">
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            The <span className="inline-flex items-center gap-0.5 font-medium text-slate-700"><Archive className="w-3 h-3" /> Archive Now</span> button (or automatic monthly archive) moves the current contents of your master doc into a dated Google Doc in your Archive Folder, then clears the master doc.
          </p>
          <p>Archiving also triggers automatically when the doc size exceeds the <strong>Archive Threshold</strong> (default: ~800,000 characters ≈ 800 KB). You can adjust this in Settings.</p>
          <p className="text-[10px] text-slate-400 italic">
            The doc size progress bar on the Overview turns amber above 60% and red above 80% of the threshold.
          </p>
          <p>
            Archive events are tracked and visible in the <span className="inline-flex items-center gap-0.5 font-medium text-slate-700"><BarChart3 className="w-3 h-3" /> Analytics</span> tab — each archive resets the doc size and appears as a marker on the growth chart.
          </p>
        </div>
      </Section>

      {/* Analytics */}
      <Section title="Analytics">
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            The <span className="inline-flex items-center gap-0.5 font-medium text-slate-700"><BarChart3 className="w-3 h-3" /> Analytics</span> tab gives you insight into your sync activity over time:
          </p>
          <ul className="space-y-1.5 pl-1">
            {[
              'Stat cards show total syncs, files processed, success rate, growth rate, average duration, and your current success streak.',
              'Doc Size Growth chart tracks how your master document is growing with a visual progress bar toward the archive threshold.',
              'Sync Duration chart shows how long each sync run takes — useful for spotting performance regressions.',
              'Reliability panel shows the last 20 sync statuses as a color-coded mini grid: green (success), amber (partial), red (error).',
              'New vs Updated chart breaks down first-time syncs and re-syncs per run.',
              'Most Updated Files list highlights files that change frequently across sync runs.',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-[#1a73e8] mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Files */}
      <Section title="Files">
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            The <span className="inline-flex items-center gap-0.5 font-medium text-slate-700"><FolderOpen className="w-3 h-3" /> Files</span> tab shows all synced files with their sync history:
          </p>
          <ul className="space-y-1.5 pl-1">
            {[
              'Your Master Document is pinned at the top with a star icon for quick access.',
              'Each file shows its name, size, and a status dot: green (synced recently), amber (active), grey (older sync).',
              'Click any file to expand it and see its full sync history — every time it was synced or updated.',
              'Use the search bar to filter files by name, and the sort dropdown to order by last synced, name, or update count.',
              'The daily activity bar chart shows how many files were synced over the last 14 days.',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-[#1a73e8] mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Backend Updates */}
      <Section title="Backend Updates">
        <div className="space-y-2 text-xs text-slate-600">
          <p>
            The extension can check and update your Apps Script backend directly from{' '}
            <span className="inline-flex items-center gap-0.5 font-medium text-slate-700"><Settings className="w-3 h-3" /> Settings</span>:
          </p>
          <ol className="space-y-1.5 list-decimal list-inside">
            <li>
              Make sure your <strong>Script Project ID</strong> is set in the Apps Script Deployment section (find it in the editor URL: <code className="bg-slate-100 px-1 rounded text-[10px]">script.google.com/home/projects/<strong>[SCRIPT_ID]</strong>/edit</code>).
            </li>
            <li>
              Check the <strong>Backend Status</strong> indicator — it compares the deployed script hash against the version bundled in your extension.
            </li>
            <li>
              If status shows <strong>"Update available"</strong>, click <strong>Deploy Update</strong> to push the latest backend code without leaving the dashboard.
            </li>
          </ol>
          <p className="mt-2">
            One-click deploy uses the Apps Script API to upload code, create a new version, and update the deployment — the same as re-deploying from the script editor, but instant.
          </p>
        </div>
      </Section>

      {/* Resources */}
      <Section title="Resources">
        <div className="space-y-2">
          <a
            href="https://script.google.com"
            onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: 'https://script.google.com' }); }}
            className="flex items-center gap-2 text-xs text-[#1a73e8] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Google Apps Script — manage your backend deployment
          </a>
          <a
            href="https://notebooklm.google.com"
            onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: 'https://notebooklm.google.com' }); }}
            className="flex items-center gap-2 text-xs text-[#1a73e8] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            NotebookLM — add your master doc as a source
          </a>
          <a
            href="https://github.com/benoit-prentout/meetsync"
            onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: 'https://github.com/benoit-prentout/meetsync' }); }}
            className="flex items-center gap-2 text-xs text-[#1a73e8] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            GitHub Repository — source code, issues, and setup guide
          </a>
        </div>
      </Section>
    </div>
  );
}
