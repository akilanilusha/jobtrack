import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Job } from './types.js';

export async function loadSeen(path: string): Promise<Record<string, Job>> {
  try { return JSON.parse(await readFile(path, 'utf8')) as Record<string, Job>; }
  catch { return {}; }
}

export async function saveSeen(path: string, jobs: Record<string, Job>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(jobs, null, 2));
}
