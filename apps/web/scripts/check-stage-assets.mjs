#!/usr/bin/env node
/**
 * Validates public/stage/ asset file sizes against PLAN-F3 §3 budgets.
 * Exits 0 when all procedural/file-backed assets satisfy per-asset, initial-load (<= 8 MB),
 * and total-stage (<= 20 MB) limits; exits 1 on any missing declared file or budget overrun.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "..");
const PUBLIC_ROOT = join(WEB_ROOT, "public");
const STAGE_PUBLIC_DIR = join(PUBLIC_ROOT, "stage");
const MANIFEST_PATH = join(WEB_ROOT, "lib/stage/assets.ts");

const KB = 1024;
const MB = 1024 * 1024;
const INITIAL_LOAD_BUDGET_BYTES = 8 * MB;
const TOTAL_STAGE_BUDGET_BYTES = 20 * MB;

function parseNumericExpr(expr) {
  const cleaned = expr.trim();
  const mulMatch = /^([\d.]+)\s*\*\s*(KB|MB)$/i.exec(cleaned);
  if (mulMatch) {
    const n = Number(mulMatch[1]);
    const unit = mulMatch[2].toUpperCase() === "MB" ? MB : KB;
    return Math.round(n * unit);
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseManifest(tsSource) {
  const entries = [];
  const blockRe = /"([A-Za-z0-9-]+)":\s*\{([\s\S]*?)\n  \}/g;
  let match;
  while ((match = blockRe.exec(tsSource)) !== null) {
    const id = match[1];
    const body = match[2];
    const typeMatch = /type:\s*"([^"]+)"/.exec(body);
    const tierMatch = /preloadTier:\s*"([^"]+)"/.exec(body);
    const budgetMatch = /budgetBytes:\s*([^,\n]+)/.exec(body);
    const srcMatch = /src:\s*"([^"]+)"/.exec(body);
    const fallbackMatch = /fallbackSrc:\s*"([^"]+)"/.exec(body);
    const posterMatch = /posterSrc:\s*"([^"]+)"/.exec(body);

    entries.push({
      id,
      type: typeMatch ? typeMatch[1] : "procedural",
      preloadTier: tierMatch ? tierMatch[1] : "background",
      budgetBytes: budgetMatch ? parseNumericExpr(budgetMatch[1]) : 0,
      src: srcMatch ? srcMatch[1] : null,
      fallbackSrc: fallbackMatch ? fallbackMatch[1] : null,
      posterSrc: posterMatch ? posterMatch[1] : null,
    });
  }
  return entries;
}

function listFilesRecursive(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else if (st.isFile()) {
      out.push({ path: full, size: st.size });
    }
  }
  return out;
}

function formatBytes(bytes) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${bytes} B`;
}

const manifestSource = readFileSync(MANIFEST_PATH, "utf8");
const entries = parseManifest(manifestSource);

if (entries.length === 0) {
  console.error(`ERROR: Could not parse any entries from ${MANIFEST_PATH}`);
  process.exit(1);
}

const errors = [];
let proceduralCount = 0;
let fileBackedCount = 0;
let initialMeasuredBytes = 0;
let totalDeclaredBudgetBytes = 0;
const accountedFiles = new Set();

for (const entry of entries) {
  totalDeclaredBudgetBytes += entry.budgetBytes;
  if (entry.type === "procedural") {
    proceduralCount += 1;
    continue;
  }

  fileBackedCount += 1;
  const candidateSrcs = [entry.src, entry.fallbackSrc, entry.posterSrc].filter(Boolean);
  let primarySize = 0;

  for (const relUrl of candidateSrcs) {
    const rel = relUrl.replace(/^\/+/, "");
    const abs = resolve(PUBLIC_ROOT, rel);
    if (!existsSync(abs)) {
      errors.push(`[${entry.id}] Missing file: ${relUrl}`);
      continue;
    }
    const size = statSync(abs).size;
    accountedFiles.add(abs);
    if (relUrl === entry.src) {
      primarySize = size;
    }
    if (size > entry.budgetBytes) {
      errors.push(
        `[${entry.id}] ${relUrl} exceeds budget: ${formatBytes(size)} > ${formatBytes(entry.budgetBytes)}`,
      );
    }
  }

  if (entry.preloadTier === "initial") {
    initialMeasuredBytes += primarySize;
  }
}

const stageFiles = listFilesRecursive(STAGE_PUBLIC_DIR);
const totalStageDiskBytes = stageFiles.reduce((sum, f) => sum + f.size, 0);

for (const f of stageFiles) {
  if (!accountedFiles.has(f.path)) {
    const rel = relative(PUBLIC_ROOT, f.path);
    console.warn(`WARN: Unreferenced file under public/stage/: /${rel} (${formatBytes(f.size)})`);
  }
}

if (initialMeasuredBytes > INITIAL_LOAD_BUDGET_BYTES) {
  errors.push(
    `Initial load exceeds 8 MB limit: ${formatBytes(initialMeasuredBytes)} > ${formatBytes(INITIAL_LOAD_BUDGET_BYTES)}`,
  );
}

if (totalStageDiskBytes > TOTAL_STAGE_BUDGET_BYTES) {
  errors.push(
    `Total public/stage/ size exceeds 20 MB limit: ${formatBytes(totalStageDiskBytes)} > ${formatBytes(TOTAL_STAGE_BUDGET_BYTES)}`,
  );
}

if (totalDeclaredBudgetBytes > TOTAL_STAGE_BUDGET_BYTES) {
  errors.push(
    `Manifest declared budget exceeds 20 MB limit: ${formatBytes(totalDeclaredBudgetBytes)} > ${formatBytes(TOTAL_STAGE_BUDGET_BYTES)}`,
  );
}

console.log(`Rolet Stage Asset Budget Check (${relative(process.cwd(), WEB_ROOT) || "."})`);
console.log(
  `  Manifest entries : ${entries.length} (procedural: ${proceduralCount}, file-backed: ${fileBackedCount})`,
);
console.log(
  `  Initial load disk: ${formatBytes(initialMeasuredBytes)} / ${formatBytes(INITIAL_LOAD_BUDGET_BYTES)}`,
);
console.log(
  `  Total stage disk : ${formatBytes(totalStageDiskBytes)} / ${formatBytes(TOTAL_STAGE_BUDGET_BYTES)}`,
);
console.log(
  `  Declared budget  : ${formatBytes(totalDeclaredBudgetBytes)} / ${formatBytes(TOTAL_STAGE_BUDGET_BYTES)}`,
);

if (errors.length > 0) {
  for (const err of errors) {
    console.error(`ERROR: ${err}`);
  }
  process.exit(1);
}

console.log("PASS: All stage assets & placeholders are within PLAN-F3 §3 budgets.");
