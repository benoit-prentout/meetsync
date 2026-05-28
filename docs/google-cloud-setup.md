# Google Cloud Console Setup

This guide walks you through setting up Google Cloud to enable OAuth for the Chrome extension. The extension only needs identity-level OAuth (`openid email`) — all Drive and Docs operations run server-side inside your Apps Script web app, so you do **not** need to enable Drive, Docs, or Apps Script APIs here.

## Prerequisites

- A Google account
- Access to [Google Cloud Console](https://console.cloud.google.com)
- The Chrome extension loaded unpacked (you need the extension ID — see step 4)

---

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the project selector at the top → **New Project**
3. Give it a name (e.g., `meet-gemini-notebooklm`) and click **Create**
4. Make sure the new project is selected before continuing

---

## Step 2: Enable the Google Identity API

1. Go to **APIs & Services** → **Library**
2. Search for **Google Identity Toolkit API** (also listed as "Identity Services")
3. Click **Enable**

> This is the only API required on the Cloud side. Drive/Docs access is handled entirely by Apps Script using its own runtime permissions.

---

## Step 3: Configure the OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type, click **Create**
3. Fill in the required fields:
   - **App name**: MeetSync
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue**
5. On the **Scopes** page, click **Save and Continue** without adding any scopes — the extension only requests `openid` and `email`, which are defaults
6. Add your Google account as a **test user**, then click **Save and Continue**

---

## Step 4: Get Your Extension ID

Before creating OAuth credentials, you need the Chrome extension's ID:

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked** and select the `dist/` folder (build first with `npm run build`)
4. Copy the **Extension ID** shown under the extension name (looks like `abcdefghijklmnopqrstuvwxyzabcdef`)

> The ID is derived from your OAuth client ID, so it will remain stable once you link the two below. If you haven't built yet, you can get a preliminary ID and update the OAuth client later.

---

## Step 5: Create an OAuth 2.0 Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Chrome Extension**
4. Name: `MeetSync`
5. Under **Item ID**, paste the extension ID from step 4
6. Click **Create**
7. Copy the **Client ID** (format: `XXXXXXXXXXXX-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com`)

---

## Step 6: Add the Client ID to the Extension

Edit `public/manifest.json` and set the `oauth2.client_id` field:

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "scopes": ["openid", "email"]
}
```

Then rebuild:

```bash
npm run build
```

Reload the extension in `chrome://extensions` (click the refresh icon).

---

## Step 7: Deploy the Apps Script as a Web App

The extension communicates with your Apps Script backend via a web app URL. To deploy it:

1. Open the Apps Script project bound to your master Google Doc (**Extensions → Apps Script**)
2. Click **Deploy** → **New deployment**
3. Click the gear icon next to **Type** and select **Web app**
4. Configure the deployment:
   - **Description**: e.g., `Meet Gemini API v1`
   - **Execute as**: **Me** (the script runs with your Drive/Docs permissions)
   - **Who has access**: **Anyone with a Google account** (the extension validates the caller's identity via token)
5. Click **Deploy** and authorize when prompted
6. Copy the **Web App URL** (format: `https://script.google.com/macros/s/AKfycb.../exec`)

> The Apps Script side validates incoming requests by calling Google's tokeninfo endpoint with the OAuth token. Only requests from authenticated Google accounts are processed.

---

## Step 8: Configure the Extension

1. Click the extension icon in Chrome — the Setup wizard opens on first run
2. Paste your **Web App URL** into the deployment URL field
3. Click **Save** — the extension stores the URL in `chrome.storage.sync`

You're all set. Run a sync from the dashboard to verify everything is connected.

---

## Troubleshooting

### OAuth Error: `redirect_uri_mismatch`
- Make sure the extension ID in your OAuth client (step 5) matches the ID shown in `chrome://extensions`
- After updating `public/manifest.json`, rebuild and reload the extension

### "Invalid token" errors from the web app
- Check that the Apps Script is deployed with **Execute as: Me** and **Anyone with a Google account** access
- Make sure you redeployed after any script changes (each deploy gets a new URL)

### Extension not loading
- Run `npm run build` before loading unpacked
- Check `chrome://extensions` for any manifest errors
- Verify `public/manifest.json` is valid JSON with a non-empty `client_id`
