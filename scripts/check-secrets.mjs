#!/usr/bin/env node
/**
 * Fails the build when a secret could be committed.
 * Checks the files git would track (working tree, excluding .gitignore entries).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const RULES = [
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'OpenAI key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Anthropic key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'x-access-token URL', pattern: /x-access-token:[A-Za-z0-9_\-]{20,}/i },
  { name: 'Bearer token literal', pattern: /Bearer\s+[A-Za-z0-9._\-]{20,}/ },
  {
    name: 'T-Invest token literal',
    pattern: /\bt\.eyJ[A-Za-z0-9._\-]{20,}|\btoken\s*[:=]\s*['"][A-Za-z0-9._\-]{20,}['"]/i,
  },
];

const SKIP = /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|mp4|zip|lock)$/i;
const SKIP_FILES = new Set(['scripts/check-secrets.mjs']);
const TEXT_LIMIT = 1024 * 1024;

let files;
try {
  files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
} catch {
  console.error('check:secrets: git is not available');
  process.exit(2);
}

const findings = [];
for (const file of files) {
  if (SKIP.test(file) || SKIP_FILES.has(file)) continue;
  let content;
  try {
    const stat = readFileSync(file);
    if (stat.length > TEXT_LIMIT) continue;
    content = stat.toString('utf8');
  } catch {
    continue;
  }
  if (content.includes('\0')) continue;
  for (const rule of RULES) {
    if (rule.pattern.test(content)) findings.push(`${file}: ${rule.name}`);
  }
}

if (findings.length > 0) {
  console.error('check:secrets: возможные секреты в файлах:');
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(`check:secrets: чисто (${files.length} файлов проверено)`);
