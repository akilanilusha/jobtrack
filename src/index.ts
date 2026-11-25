import 'dotenv/config';

import {
  readFile,
  copyFile,
  writeFile
} from 'node:fs/promises';

import { resolve } from 'node:path';

import type {
  Company,
  Config,
  Job
} from './types.js';

import { scanCompanies } from './scraper.js';
import { loadSeen, saveSeen } from './storage.js';
import { writeReports } from './report.js';

const root = process.cwd();

// Load configuration
const config = JSON.parse(
  await readFile(
    resolve(root, 'config.json'),
    'utf8'
  )
) as Config;

// Resolve companies JSON path
const companiesPath = resolve(
  root,
  config.companiesFile
);

// Load companies
let companies: Company[];

try {
  companies = JSON.parse(
    await readFile(companiesPath, 'utf8')
  ) as Company[];

  if (!Array.isArray(companies)) {
    throw new Error('Companies JSON must contain an array');
  }

} catch (error) {
  await copyFile(
    resolve(root, 'companies.example.json'),
    companiesPath
  ).catch(() => undefined);

  console.error(
    `Unable to load ${config.companiesFile}.`,
    error
  );

  console.error(
    'Check the companies JSON file and try again.'
  );

  process.exit(1);
}

// Load previously discovered jobs
const statePath = resolve(root, config.stateFile);
const seen = await loadSeen(statePath);

console.log('\n========== JOBTRACK SCAN ==========');

console.log(
  `Total companies: ${companies.length}`
);

console.log(
  `Enabled companies: ${
    companies.filter(c => c.enabled !== false).length
  }`
);

console.log(
  `Disabled companies: ${
    companies.filter(c => c.enabled === false).length
  }`
);

// Scan companies
const current = await scanCompanies(
  companies,
  config
);

// Persist discovered careers URLs.
// The scraper updates company objects in memory.
try {
  await writeFile(
    companiesPath,
    JSON.stringify(companies, null, 2) + '\n',
    'utf8'
  );

  console.log(
    '\n[UPDATED] Companies JSON saved successfully.'
  );

} catch (error) {
  console.error(
    '[ERROR] Could not save companies JSON:',
    error
  );
}

// Identify new jobs and update existing job records
const newJobs: Job[] = [];

for (const job of current) {
  const key = job.url
    .toLowerCase()
    .replace(/\/$/, '');

  if (!seen[key]) {
    newJobs.push(job);
  }

  const previous = seen[key] as
    | (Job & {
        status?: string;
        appliedAt?: string;
      })
    | undefined;

  seen[key] = {
    ...job,

    ...(previous?.status
      ? { status: previous.status }
      : { status: 'new' }),

    ...(previous?.appliedAt
      ? { appliedAt: previous.appliedAt }
      : {})
  };
}

// Save job history
await saveSeen(statePath, seen);

// Generate reports
const files = await writeReports(
  newJobs,
  resolve(root, config.reportDirectory)
);

// Final summary
console.log('\n========== JOBTRACK SUMMARY ==========');

console.log(
  `Companies configured: ${
    companies.filter(c => c.enabled !== false).length
  }`
);

console.log(
  `Matching listings found: ${current.length}`
);

console.log(
  `New listings: ${newJobs.length}`
);

console.log(`HTML report: ${files.html}`);
console.log(`CSV report:  ${files.csv}`);

console.log('======================================');
