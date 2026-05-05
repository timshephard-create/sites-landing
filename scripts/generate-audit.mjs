#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_HOST = 'https://sites.timshephard.co';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (arg.startsWith('--')) out[arg.slice(2)] = true;
  }
  return out;
}

function loadDotEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.replace(/^﻿/, '').trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const args = parseArgs(process.argv);

if (args.help || args.h) {
  console.log(`Usage: npm run generate-audit -- --url=https://example.com --email=lead@example.com [--host=http://localhost:3000]

Triggers the same audit-report generator the paid checkout flow uses, for a single lead.
Sends the report via email; prints when the request is enqueued.

Defaults to ${DEFAULT_HOST}. Pass --host to point at a different deployment (e.g. local dev).
Reads ADMIN_SECRET from .env.local (or process.env).
`);
  process.exit(0);
}

const { url, email } = args;
const host = (args.host || DEFAULT_HOST).replace(/\/$/, '');

if (!url || !email) {
  console.error('Error: --url and --email are required');
  console.error('Run with --help for usage');
  process.exit(1);
}
if (!/^https?:\/\//.test(url)) {
  console.error('Error: --url must start with http:// or https://');
  process.exit(1);
}
if (!email.includes('@')) {
  console.error('Error: --email looks invalid');
  process.exit(1);
}

const fileEnv = loadDotEnv();
const secret = process.env.ADMIN_SECRET || fileEnv.ADMIN_SECRET;
if (!secret) {
  console.error('Error: ADMIN_SECRET not found in .env.local or environment');
  process.exit(1);
}

const endpoint = `${host}/api/admin/generate-audit`;
console.log(`POST ${endpoint}`);
console.log(`  url:   ${url}`);
console.log(`  email: ${email}`);

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret
    },
    body: JSON.stringify({ url, email })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`✗ Request failed (${res.status}):`, data.error || JSON.stringify(data));
    process.exit(1);
  }
  console.log(`✓ ${data.message || 'Enqueued.'}`);
} catch (err) {
  console.error('✗ Network error:', err.message);
  process.exit(1);
}
