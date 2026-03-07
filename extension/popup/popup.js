/**
 * popup.js
 * Controls the extension toolbar popup.
 */

(function () {
  "use strict";

  const browser = globalThis.browser ?? globalThis.chrome;

  const loadingState = document.getElementById("loading-state");
  const connectedState = document.getElementById("connected-state");
  const disconnectedState = document.getElementById("disconnected-state");
  const workspaceName = document.getElementById("workspace-name");

  async function sendMessage(msg) {
    return new Promise((resolve) => {
      browser.runtime.sendMessage(msg, (response) => {
        if (browser.runtime.lastError) {
          resolve({ ok: false, error: browser.runtime.lastError.message });
        } else {
          resolve(response ?? { ok: false, error: "No response" });
        }
      });
    });
  }

  async function init() {
    const result = await sendMessage({ type: "GET_AUTH_STATUS" });

    loadingState.style.display = "none";

    if (result.ok && result.data.authenticated) {
      workspaceName.textContent = result.data.workspaceName || "Notion";
      connectedState.style.display = "";
    } else {
      disconnectedState.style.display = "";
    }
  }

  function openOptions() {
    browser.runtime.openOptionsPage?.() ??
      browser.tabs.create({ url: browser.runtime.getURL("options/options.html") });
    window.close();
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  document.getElementById("connect-btn")?.addEventListener("click", async () => {
    loadingState.style.display = "";
    disconnectedState.style.display = "none";

    const result = await sendMessage({ type: "START_OAUTH" });
    loadingState.style.display = "none";

    if (result.ok) {
      init();
    } else {
      disconnectedState.style.display = "";
      alert(`Connection failed: ${result.error}`);
    }
  });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    if (!confirm("Disconnect from Notion? You'll need to re-authenticate to use the extension.")) return;
    await sendMessage({ type: "LOGOUT" });
    connectedState.style.display = "none";
    disconnectedState.style.display = "";
  });

  document.getElementById("open-options-btn")?.addEventListener("click", openOptions);
  document.getElementById("open-options-btn-disconnected")?.addEventListener("click", openOptions);
  document.getElementById("options-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    openOptions();
  });

  // Init on load
  init();
})();
