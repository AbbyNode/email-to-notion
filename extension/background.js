/**
 * background.js
 * Service worker / background script for Email to Notion extension.
 * Handles: Notion OAuth, API proxying, message routing.
 */

// ── Cross-browser compat ──────────────────────────────────────────────────────
const browser = globalThis.browser ?? globalThis.chrome;

// ── Constants ─────────────────────────────────────────────────────────────────
const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// You must register an OAuth integration at https://www.notion.so/my-integrations
// and set the redirect URI to:
//   https://<extension-id>.chromiumapp.org/ (Chrome)
//   https://<extension-id>.extensions.allizom.org/ (Firefox)
// Store your client ID & secret in the options page; they are saved in storage.
// NEVER hard-code secrets in extension code shipped to users.

// ── OAuth helpers ─────────────────────────────────────────────────────────────

/**
 * Build the Notion OAuth authorization URL.
 * @param {string} clientId
 * @param {string} redirectUri
 * @returns {string}
 */
function buildAuthUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri,
  });
  return `${NOTION_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token.
 * @param {string} code
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} redirectUri
 * @returns {Promise<{access_token: string, workspace_name: string, workspace_id: string, bot_id: string}>}
 */
async function exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error_description ?? `Token exchange failed: ${response.status}`);
  }
  return response.json();
}

// ── Notion API ────────────────────────────────────────────────────────────────

/**
 * Generic authenticated Notion API call.
 */
async function notionFetch(path, accessToken, options = {}) {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message ?? `Notion API error: ${response.status}`);
  }
  return response.json();
}

/**
 * List all databases the integration has access to.
 */
async function listDatabases(accessToken) {
  const body = {
    filter: { value: "database", property: "object" },
    page_size: 100,
  };
  const data = await notionFetch("/search", accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.results ?? [];
}

/**
 * Get schema/properties for a specific database.
 */
async function getDatabase(databaseId, accessToken) {
  return notionFetch(`/databases/${databaseId}`, accessToken, { method: "GET" });
}

/**
 * Ensure required properties exist in the database, creating any that are missing.
 * @param {string} databaseId
 * @param {string} accessToken
 * @param {object} requiredProps  e.g. { From: { rich_text: {} }, Date: { date: {} } }
 */
async function ensureDatabaseProperties(databaseId, accessToken, requiredProps) {
  const db = await getDatabase(databaseId, accessToken);
  const existing = db.properties ?? {};

  const missing = {};
  for (const [name, schema] of Object.entries(requiredProps)) {
    if (!existing[name]) {
      missing[name] = schema;
    }
  }

  if (Object.keys(missing).length === 0) return; // nothing to do

  await notionFetch(`/databases/${databaseId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ properties: missing }),
  });
}

/**
 * Create a page (email entry) in a Notion database.
 * @param {string} databaseId
 * @param {string} accessToken
 * @param {object} emailData  { subject, sender, senderEmail, body, date }
 * @param {object} options    { includeSubject, includeSender, includeBody, includeDate }
 */
async function createEmailPage(databaseId, accessToken, emailData, options) {
  // Ensure any properties we intend to write actually exist in the database.
  const requiredProps = {};
  if (options.includeSender && emailData.sender) {
    requiredProps["From"] = { rich_text: {} };
  }
  if (options.includeDate && emailData.date) {
    requiredProps["Date"] = { date: {} };
  }
  if (Object.keys(requiredProps).length > 0) {
    await ensureDatabaseProperties(databaseId, accessToken, requiredProps);
  }

  // Build the properties object. We use a "Name" / title property and
  // rich_text properties for everything else. If the database has custom
  // schema the user can extend this via the options page.
  const properties = {};

  // Title – always included (required by Notion)
  properties["Name"] = {
    title: [
      {
        type: "text",
        text: {
          content: options.includeSubject && emailData.subject
            ? emailData.subject
            : "(No Subject)",
        },
      },
    ],
  };

  if (options.includeSender && emailData.sender) {
    properties["From"] = {
      rich_text: [{ type: "text", text: { content: `${emailData.sender} <${emailData.senderEmail}>` } }],
    };
  }

  if (options.includeDate && emailData.date) {
    properties["Date"] = {
      date: { start: emailData.date },
    };
  }

  // Build page content (children blocks) from email body
  const children = [];

  if (options.includeBody && emailData.body) {
    // Split body into paragraphs of ≤2000 chars (Notion block limit)
    const paragraphs = emailData.body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const para of paragraphs) {
      // Chunk to ≤2000 chars
      const chunks = chunkString(para, 2000);
      for (const chunk of chunks) {
        children.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: chunk } }],
          },
        });
      }
    }
  }

  const pageBody = {
    parent: { database_id: databaseId },
    properties,
    ...(children.length > 0 ? { children } : {}),
  };

  return notionFetch("/pages", accessToken, {
    method: "POST",
    body: JSON.stringify(pageBody),
  });
}

/** Split a string into chunks of maxLen characters. */
function chunkString(str, maxLen) {
  const chunks = [];
  for (let i = 0; i < str.length; i += maxLen) {
    chunks.push(str.slice(i, i + maxLen));
  }
  return chunks;
}

// ── Storage helpers ────────────────────────────────────────────────────────────

function getStorage(keys) {
  return new Promise((resolve, reject) => {
    browser.storage.local.get(keys, (result) => {
      if (browser.runtime.lastError) reject(browser.runtime.lastError);
      else resolve(result);
    });
  });
}

function setStorage(data) {
  return new Promise((resolve, reject) => {
    browser.storage.local.set(data, () => {
      if (browser.runtime.lastError) reject(browser.runtime.lastError);
      else resolve();
    });
  });
}

// ── Identity / redirect URI ───────────────────────────────────────────────────

function getRedirectUri() {
  // chrome.identity.getRedirectURL works in Chrome; Firefox uses a similar pattern
  if (typeof chrome !== "undefined" && chrome.identity?.getRedirectURL) {
    return chrome.identity.getRedirectURL();
  }
  // Firefox fallback
  const extId = browser.runtime.id;
  return `https://${extId}.extensions.allizom.org/`;
}

/**
 * Launch the Notion OAuth flow using browser.identity.launchWebAuthFlow.
 */
async function startOAuthFlow() {
  const { notionClientId } = await getStorage(["notionClientId"]);
  if (!notionClientId) {
    throw new Error("Notion Client ID not set. Please open Options and configure it.");
  }

  const redirectUri = getRedirectUri();
  const authUrl = buildAuthUrl(notionClientId, redirectUri);

  return new Promise((resolve, reject) => {
    browser.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (responseUrl) => {
        if (browser.runtime.lastError || !responseUrl) {
          reject(new Error(browser.runtime.lastError?.message ?? "OAuth cancelled"));
          return;
        }
        try {
          const url = new URL(responseUrl);
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");
          if (error) {
            reject(new Error(`OAuth error: ${error}`));
            return;
          }
          if (!code) {
            reject(new Error("No authorization code returned"));
            return;
          }

          const { notionClientSecret } = await getStorage(["notionClientSecret"]);
          if (!notionClientSecret) {
            reject(new Error("Notion Client Secret not set. Please open Options and configure it."));
            return;
          }

          const tokenData = await exchangeCodeForToken(
            code,
            notionClientId,
            notionClientSecret,
            redirectUri
          );

          await setStorage({
            notionAccessToken: tokenData.access_token,
            notionWorkspaceName: tokenData.workspace_name ?? "",
            notionWorkspaceId: tokenData.workspace_id ?? "",
            notionBotId: tokenData.bot_id ?? "",
          });

          resolve({
            success: true,
            workspaceName: tokenData.workspace_name,
          });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// ── Message handler ───────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  // Return true to keep the message channel open for async responses
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "START_OAUTH":
      return startOAuthFlow();

    case "LOGOUT":
      await setStorage({
        notionAccessToken: null,
        notionWorkspaceName: null,
        notionWorkspaceId: null,
        notionBotId: null,
      });
      return { success: true };

    case "GET_AUTH_STATUS": {
      const { notionAccessToken, notionWorkspaceName } = await getStorage([
        "notionAccessToken",
        "notionWorkspaceName",
      ]);
      return {
        authenticated: !!notionAccessToken,
        workspaceName: notionWorkspaceName ?? null,
      };
    }

    case "LIST_DATABASES": {
      const { notionAccessToken } = await getStorage(["notionAccessToken"]);
      if (!notionAccessToken) throw new Error("Not authenticated with Notion");
      return listDatabases(notionAccessToken);
    }

    case "EXPORT_EMAIL": {
      const { notionAccessToken } = await getStorage(["notionAccessToken"]);
      if (!notionAccessToken) throw new Error("Not authenticated with Notion");
      const { databaseId, emailData, options } = message;
      return createEmailPage(databaseId, notionAccessToken, emailData, options);
    }

    case "GET_SETTINGS": {
      const result = await getStorage([
        "notionClientId",
        "notionClientSecret",
        "notionAccessToken",
        "notionWorkspaceName",
        "defaultDatabaseId",
        "defaultOptions",
      ]);
      // Don't expose secret
      delete result.notionClientSecret;
      return result;
    }

    case "SAVE_SETTINGS": {
      const { settings } = message;
      await setStorage(settings);
      return { success: true };
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}
