#!/usr/bin/env node
/**
 * build.js
 * Builds distributable zip files for Chrome and Firefox.
 *
 * Usage:
 *   node build.js          → builds both
 *   node build.js chrome   → Chrome only
 *   node build.js firefox  → Firefox only
 *
 * Output: dist/email-to-notion-chrome.zip
 *         dist/email-to-notion-firefox.zip
 */

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");

// Files / directories to include in both builds
const SHARED_FILES = [
  "background.js",
  "content.js",
  "content.css",
  "popup",
  "options",
  "icons",
];

const target = process.argv[2]; // 'chrome', 'firefox', or undefined (both)

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

// ── Generate icons if PNGs are missing ────────────────────────────────────────
const iconsDir = path.join(ROOT, "icons");
const needIcons = [16, 48, 128].some(
  (s) => !fs.existsSync(path.join(iconsDir, `icon${s}.png`))
);
if (needIcons) {
  console.log("Generating icons…");
  execSync(`node ${path.join(iconsDir, "generate-icons.js")}`, { cwd: ROOT, stdio: "inherit" });
}

function buildFor(browser) {
  const tmpDir = path.join(DIST, `build-${browser}`);
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  // Copy shared files
  for (const file of SHARED_FILES) {
    const src = path.join(ROOT, file);
    const dest = path.join(tmpDir, file);
    copyRecursive(src, dest);
  }

  // Copy the correct manifest as manifest.json
  const manifestSrc = path.join(ROOT, `manifest.${browser}.json`);
  fs.copyFileSync(manifestSrc, path.join(tmpDir, "manifest.json"));

  // Zip it
  const zipName = `email-to-notion-${browser}.zip`;
  const zipPath = path.join(DIST, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  execSync(`zip -r "${zipPath}" .`, { cwd: tmpDir, stdio: "inherit" });
  fs.rmSync(tmpDir, { recursive: true });

  console.log(`✓ Built ${zipPath}`);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠  Skipping missing: ${src}`);
    return;
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (!target || target === "chrome")  buildFor("chrome");
if (!target || target === "firefox") buildFor("firefox");

console.log("\nBuild complete!");
