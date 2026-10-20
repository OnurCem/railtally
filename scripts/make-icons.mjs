// Renders public/icon.svg into the PNG icons needed for installing the PWA.
// Usage: node scripts/make-icons.mjs   (needs `npx playwright install chromium`)
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("public/icon.svg", "utf8");
const dataUri = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;

// Maskable icons may be cropped to a circle: keep the artwork inside the central 80%.
const maskable = svg.replace(/<svg([^>]*)>/, "<svg$1>").replace(
  /(<rect[^>]*\/>)(.*)<\/svg>/s,
  (_, bg, art) => `${bg}<g transform="translate(51 51) scale(0.8)">${art}</g></svg>`,
);

const targets = [
  ["public/icon-192.png", 192, svg],
  ["public/icon-512.png", 512, svg],
  ["public/icon-maskable-512.png", 512, maskable],
  ["public/apple-touch-icon.png", 180, svg],
];

const browser = await chromium.launch();
for (const [file, size, source] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0"><img src="${dataUri(source)}" width="${size}" height="${size}"></body>`);
  writeFileSync(file, await page.screenshot({ type: "png" }));
  await page.close();
}
await browser.close();
console.log("icons written");
