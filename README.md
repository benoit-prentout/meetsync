<p align="center">
  <img src="assets/branding/hero.png" alt="MeetSync for NotebookLM" width="800">
</p>

# MeetSync for NotebookLM

Automatically consolidate all your **Google Meet "Notes by Gemini"** into a single **Master Google Doc** — a living, unlimited knowledge base for **NotebookLM**.

---

## 🚀 Quick Start (One-Click Install)

The easiest way to use this tool is to copy the pre-configured template:

1. **[Click here to Make a Copy of the Template](https://docs.google.com/document/d/15V0urYyn8lbXGBYzxDKf2-C8aAyOO6DXpAgEPKjRTg0/copy)**
2. In your new document, refresh the page.
3. A new **🚀 NotebookLM** menu will appear.
4. Run **🔄 Sync Now** and follow the authorization prompts.

---

## Quick Start (Chrome Extension)

For developers who want to self-host the Chrome extension:

1. **Fork** this repository
2. **Create OAuth credentials** — see [Google Cloud Setup](docs/google-cloud-setup.md)
3. **Add your client ID** — edit `public/manifest.json` → `oauth2.client_id`
4. **Build**: `npm install && npm run build`
5. **Load in Chrome**: go to `chrome://extensions` → Developer mode → Load unpacked → select `dist/`
6. **Configure**: the extension opens a Setup wizard — enter your **Deployment URL** (from the web app `/macros/s/{id}/exec`) and your **Script Project ID** (from the editor `/home/projects/{scriptId}/edit`). These are separate identifiers.
7. **Auto-deploy backend**: In Settings, click **Deploy Backend** to push the latest `Code.gs` directly via the Apps Script API — or manually copy it if you prefer.

---

## 🏗 Why this tool?

NotebookLM is powerful, but it limits the number of sources you can add (50 sources max). By grouping months of meetings (yours and your team's) into a single "brain" document, you enable the AI to make long-term connections without ever hitting source limits.

### ✨ Features

* 👥 **Team Support**: Fetches meeting notes organized by your colleagues (files in "Shared with me", "Shared Drives", or files containing "Notes par Gemini").
* 📊 **Summary Table**: An automatically generated table at the top of your document lists all synced meetings.
* 📦 **Auto-Archiving**: Automatic archives are created monthly or when the document size reaches the limit.
* 📧 **Email Notifications**: Receive an email with the link to your new archive as soon as it is created.
* 🛡️ **Smart Sync**: Works even on files where you only have view-only access.
* ⚡ **Performance**: Uses advanced Google APIs to process 20+ meetings in seconds.
* 🔄 **Backend Auto-Deploy**: Push Code.gs updates directly from the extension Settings via the Apps Script REST API — no manual copy-paste needed.
* 📈 **Analytics Dashboard**: Multi-section insights dashboard with charts showing sync frequency, files processed, doc growth rate, success rates, and sync streaks.
* 🗃️ **Archive History**: Full history of archive events tracked and visible in the Analytics view.

---

## 🏗 How it works?

1. **Global Scan**: The script searches for Gemini note variants ("Notes de la réunion", "Meeting notes", etc.) everywhere on your Drive.
2. **Filtering**: It ignores already-synced files using an internal script database.
3. **Cleaning**: It extracts text, removes Gemini-specific metadata, and simplifies Markdown formatting.
4. **Insertion**: It adds new notes to the top of the doc and updates the summary table.
5. **Archiving**: Monthly or when full, it creates a **"Meeting Notes Archive"** and resets the master doc.

---

## 🛠 Setup Guide (Manual Install)

### 1️⃣ Prepare the Master Document
1. Create a new, empty **Google Doc** (e.g., "Master - Meeting Notes").
2. Inside this doc, go to the menu **Extensions > Apps Script**.

### 2️⃣ Copy the Code
Choose one:

**Option A — Auto-Deploy (recommended)**: Complete the Chrome extension Setup wizard, then in Settings click **Deploy Backend**. The extension pushes the code via the Apps Script API — no manual copy-paste needed.

**Option B — Manual copy**:
1. Delete everything in the script editor.
2. Copy the entire content of `apps-script/Code.gs` and paste it into the editor.
3. Save and name the project "Sync NotebookLM".

### 3️⃣ Configure Google Services
The script needs direct access to Drive and Docs APIs.
1. In Apps Script editor, click the **+** next to **Services**.
2. Search for **Google Drive API** (v3) and click **Add**.
3. Click the **+** again, search for **Google Docs API** (v1) and click **Add**.

### 4️⃣ First Run & Authorization
1. In the top toolbar, ensure `appendMeetNotesToMaster` is selected and click **Run**.
2. An authorization window will appear: follow the prompts to **Allow** the script.
3. Go back to your Google Doc and refresh the page. A new **🚀 NotebookLM** menu will appear!

### 5️⃣ Automation (Easiest Method)
To have the sync run automatically every 15 minutes:
1. In your Google Doc, go to the menu **🚀 NotebookLM > ⏰ Enable Auto-Sync**.
2. That's it! The script will now run in the background.

---

## 📋 Daily Usage

| Option | Description |
|---|---|
| **🔄 Sync Now** | Forces an immediate sync of the latest meetings. |
| **⏰ Enable Auto-Sync** | Activates the 15-minute background synchronization. |
| **📜 View Sync History** | Displays a log of recent synchronization runs. |
| **📦 Archive Document Now** | Manually empty the master doc and create a timestamped archive. |
| **🧹 Reset Sync State** | Useful if you want to re-import everything from scratch. |
| **❓ Start Here / Help** | Shows instructions and quick tips. |

---

## 🧠 Connecting to NotebookLM

1. Go to [NotebookLM](https://notebooklm.google.com).
2. Create a new Notebook.
3. Add your **Master Google Doc** as a source.
4. **Important**: Every time you use NotebookLM, click the **Refresh** button next to the Google Doc source so it picks up the latest meetings.
5. **Archives**: When an archive is created, don't forget to add the archive file as a source in NotebookLM to keep your full history!

---

## 💻 Development

```bash
npm run dev       # Vite dev server at localhost:5173 (chrome APIs mocked)
npm run build     # tsc + vite build → dist/
npm test          # vitest run
npm run package   # build + zip → meet-gemini-notebooklm.zip
```

Dev entry points (bypass `chrome-extension://` restrictions):

| URL | Renders |
|-----|---------|
| `/dashboard.html` | Full auth + dashboard flow (conditional mock) |
| `/dashboard-dev.html` | `<Dashboard />` directly, mocked data |
| `/popup-dev.html` | `<Popup />` directly, mocked data |
| `/wizard-dev.html` | `<SetupWizard />` with scenario picker |

Mocks live in `src/dev-mocks.ts`. Tree-shaken from production builds.

---

## 📜 License
MIT
