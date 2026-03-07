#!/usr/bin/env node
/**
 * generate-icons.js
 * Generates PNG icons for the extension at 16x16, 48x48, and 128x128.
 * Run once: node generate-icons.js
 *
 * Requires: npm install canvas (optional - falls back to SVG-based method)
 * OR simply uses the SVG files directly if your browser supports SVG icons.
 */

const fs = require("fs");
const path = require("path");

// Notion-N SVG icon path data
const ICON_SVG = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#1a1a1a"/>
  <g transform="scale(${size / 24}) translate(0 0)">
    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.373.466l1.822 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279V9.107l-1.215-.14c-.093-.514.28-.887.747-.933l3.222-.187z" fill="white"/>
  </g>
</svg>`;

// __dirname is already the icons/ folder when run from there
const iconsDir = __dirname;
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

for (const size of [16, 48, 128]) {
  const svgPath = path.join(iconsDir, `icon${size}.svg`);
  fs.writeFileSync(svgPath, ICON_SVG(size), "utf8");
  console.log(`✓ Generated ${svgPath}`);
}

// Try to convert SVGs to PNGs using canvas if available
try {
  const { createCanvas, loadImage } = require("canvas");
  console.log("\nConverting SVGs to PNGs using canvas…");

  (async () => {
    for (const size of [16, 48, 128]) {
      const svgPath = path.join(iconsDir, `icon${size}.svg`);
      const pngPath = path.join(iconsDir, `icon${size}.png`);
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext("2d");
      const img = await loadImage(svgPath);
      ctx.drawImage(img, 0, 0, size, size);
      fs.writeFileSync(pngPath, canvas.toBuffer("image/png"));
      console.log(`✓ ${pngPath}`);
    }
    console.log("\nDone! PNG icons generated.");
  })();
} catch (_) {
  console.log("\n⚠  'canvas' module not found – SVG files written instead.");
  console.log("   Either rename icon*.svg → icon*.png and use svg-compatible browsers,");
  console.log("   OR run: npm install canvas && node generate-icons.js");
  console.log("\n   For a quick workaround, the build script will copy .svg as .png.");

  // Fallback: copy SVG as PNG (works for Firefox; Chrome needs real PNGs)
  for (const size of [16, 48, 128]) {
    const svgPath = path.join(iconsDir, `icon${size}.svg`);
    const pngPath = path.join(iconsDir, `icon${size}.png`);
    fs.copyFileSync(svgPath, pngPath);
    console.log(`   Copied ${path.basename(svgPath)} → ${path.basename(pngPath)}`);
  }
}
