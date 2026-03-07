# Email to Notion – Browser Extension

Export Gmail emails to a Notion database with one click. Works in **Chrome** (MV3) and **Firefox** (MV2).

---

## Features

- **Inject button** directly in the Gmail thread view, to the left of the "Print" button
- **Database selector** – choose any Notion database you have access to
- **Per-email options** – toggle inclusion of subject, sender, date, and body content
- **Persistent defaults** – remembers your last-used database and options
- **Notion OAuth** – full OAuth 2.0 flow, credentials stored locally only
- **Toolbar popup** – quick connection status and shortcuts

---

## Project Structure

```
extension/
├── manifest.chrome.json     Chrome MV3 manifest
├── manifest.firefox.json    Firefox MV2 manifest
├── background.js            Service worker: OAuth, Notion API, message routing
├── content.js               Injected into Gmail: button + export modal
├── content.css              Styles for button + modal
├── popup/
│   ├── popup.html           Toolbar popup
│   └── popup.js
├── options/
│   ├── options.html         Settings / options page
│   └── options.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── generate-icons.js   Icon generator script
├── build.js                 Build script → dist/ zips
├── package.json
└── dist/
    ├── email-to-notion-chrome.zip
    └── email-to-notion-firefox.zip
```

---

## First-Time Setup

### 1. Create a Notion OAuth Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"New integration"** and choose type **"Public"** (required for OAuth)
3. Fill in a name (e.g. "Email to Notion") and your workspace
4. Under **"OAuth Domain & URIs"**, add the Redirect URI shown on the extension's Settings page (see Step 3)
5. Save and copy the **Client ID** and **Client Secret**

### 2. Load the Extension

**Chrome:**
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"** → select the `extension/` folder  
   *(or load the built zip via "Pack extension")*

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on"** → select `manifest.firefox.json` or the zip from `dist/`

### 3. Configure Credentials

1. Click the extension icon in the toolbar → **Settings** (or open `options/options.html`)
2. Copy the **Redirect URI** shown at the top — paste this into your Notion integration's redirect URIs
3. Enter your **Client ID** and **Client Secret** → **Save Credentials**
4. Click **Connect Notion Account** → follow the OAuth flow
5. (Optional) Set a default database and default export options

---

## Usage

1. Open any email in Gmail
2. Click the **"Export to Notion"** button (to the left of the 🖨 Print button)
3. In the popup:
   - Select a **Notion database** from the dropdown
   - Toggle what to include (subject, sender, date, body)
   - Click **Export**
4. A link to the newly created Notion page is shown on success

---

## Building Distributable Zips

```bash
cd extension

# Install optional dev dep for proper PNG icons
npm install

# Build both Chrome and Firefox zips → dist/
node build.js

# Or individually
node build.js chrome
node build.js firefox
```

---

## Notion Page Schema

The extension creates a page in the target database with these properties:

| Property | Type        | Notes |
|----------|-------------|-------|
| `Name`   | title       | Email subject (or "(No Subject)") |
| `From`   | rich_text   | `Sender Name <email@example.com>` |
| `Date`   | date        | Email date (YYYY-MM-DD) |

The **email body** is inserted as paragraph blocks in the page content.

> **Note:** If your database uses different property names, you can customize the mapping in `background.js` → `createEmailPage()`.

---

## Privacy

- Your Notion Client Secret is stored only in your browser's local extension storage (`chrome.storage.local`)
- Email content is sent **directly** from your browser to the Notion API — it never passes through any third-party server
- No analytics or telemetry of any kind
