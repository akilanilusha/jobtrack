import { mkdir, writeFile } from 'node:fs/promises';
import type { Job } from './types.js';

const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export async function writeReports(jobs: Job[], directory: string): Promise<{ html: string; csv: string }> {
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const html = `${directory}/new-jobs-${stamp}.html`;
  const csv = `${directory}/new-jobs-${stamp}.csv`;
  const rows = jobs.map(j => `<tr><td>${esc(j.company)}</td><td>${esc(j.title)}</td><td>${esc(j.location)}</td><td>${esc(j.publishedDate)}</td><td><a href="${esc(j.url)}">Apply / view job</a></td></tr>`).join('\n');
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>JobTrack – New jobs</title><style>body{font:15px Arial;margin:36px;color:#202938}h1{color:#172554}table{border-collapse:collapse;width:100%}th,td{padding:12px;border:1px solid #ddd;text-align:left}th{background:#eef2ff}tr:nth-child(even){background:#f8fafc}a{color:#1d4ed8}</style></head><body><h1>JobTrack – Newly discovered jobs</h1><p>Generated: ${new Date().toLocaleString()} · New matching jobs: ${jobs.length}</p><table><thead><tr><th>Company</th><th>Position</th><th>Location</th><th>Published</th><th>Link</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No new matching jobs found.</td></tr>'}</tbody></table><p>Note: Published dates are shown only when detectable on the source page. Verify the listing is still open before applying.</p></body></html>`;
  await writeFile(html, page);
  const fields: (keyof Job)[] = ['company','title','location','publishedDate','url','discoveredAt'];
  const quote = (v: string) => `"${v.replaceAll('"', '""')}"`;
  await writeFile(csv, [fields.join(','), ...jobs.map(j => fields.map(f => quote(j[f])).join(','))].join('\n'));
  return { html, csv };
}
