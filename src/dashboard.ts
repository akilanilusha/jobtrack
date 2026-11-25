import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Company, Job } from './types.js';

const root = process.cwd();
const config = JSON.parse(await readFile(resolve(root, 'config.json'), 'utf8')) as { stateFile: string; companiesFile: string };
const statePath = resolve(root, config.stateFile);
const companiesPath = resolve(root, config.companiesFile);
const htmlPath = resolve(root, 'dashboard/index.html');

type TrackedJob = Job & { status?: 'new' | 'saved' | 'applied' | 'interview' | 'rejected' | 'offer'; appliedAt?: string };
async function readJobs(): Promise<Record<string, TrackedJob>> {
  try { return JSON.parse(await readFile(statePath, 'utf8')) as Record<string, TrackedJob>; } catch { return {}; }
}
function send(res: import('node:http').ServerResponse, status: number, data: unknown, type = 'application/json') {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'access-control-allow-origin': '*' });
  res.end(type === 'application/json' ? JSON.stringify(data) : String(data));
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/') {
    try { return send(res, 200, await readFile(htmlPath, 'utf8'), 'text/html'); } catch { return send(res, 500, 'Dashboard file missing', 'text/plain'); }
  }
  if (req.method === 'GET' && url.pathname === '/api/jobs') {
    const jobs = Object.entries(await readJobs()).map(([id, job]) => ({ id, ...job, status: job.status ?? 'new' }));
    jobs.sort((a, b) => (b.discoveredAt || '').localeCompare(a.discoveredAt || ''));
    return send(res, 200, jobs);
  }
  if (req.method === 'GET' && url.pathname === '/api/companies') {
    try { return send(res, 200, JSON.parse(await readFile(companiesPath, 'utf8')) as Company[]); } catch { return send(res, 200, []); }
  }
  const match = url.pathname.match(/^\/api\/jobs\/([^/]+)\/status$/);
  if (req.method === 'POST' && match) {
    let body = ''; for await (const chunk of req) body += chunk;
    try {
      const { status } = JSON.parse(body) as { status: TrackedJob['status'] };
      const allowed = ['new', 'saved', 'applied', 'interview', 'rejected', 'offer'];
      if (!allowed.includes(status ?? '')) return send(res, 400, { error: 'Invalid status' });
      const jobs = await readJobs(); const id = decodeURIComponent(match[1]);
      if (!jobs[id]) return send(res, 404, { error: 'Job not found' });
      jobs[id].status = status;
      if (status === 'applied' && !jobs[id].appliedAt) jobs[id].appliedAt = new Date().toISOString();
      await writeFile(statePath, JSON.stringify(jobs, null, 2));
      return send(res, 200, { success: true });
    } catch { return send(res, 400, { error: 'Invalid request body' }); }
  }
  send(res, 404, { error: 'Not found' });
});
const port = Number(process.env.PORT || 4173);
server.listen(port, () => console.log(`JobTrack dashboard: http://localhost:${port}`));
