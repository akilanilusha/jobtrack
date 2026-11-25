import { chromium, type Page } from 'playwright';
import type { Company, Config, Job } from './types.js';
import { isRelevant } from './matcher.js';

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const UA =
  'Mozilla/5.0 (compatible; JobTrackBot/1.0; career-page monitoring; low-frequency)';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isValidUrl(value?: string | null): value is string {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
}

const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

const stripWww = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** Same site = same host, or one is a subdomain of the other (careers.acme.com ~ acme.com). */
function sameSite(a: string, b: string): boolean {
  const x = stripWww(a);
  const y = stripWww(b);
  return x === y || x.endsWith('.' + y) || y.endsWith('.' + x);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function extractDate(text: string): string {
  const patterns = [
    /(?:posted|published|date posted|listed)\s*[:\-]?\s*((?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})|(?:\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})|(?:\d+\s+(?:day|week)s?\s+ago)|(?:today|yesterday))/i,
    /\b(today|yesterday|\d+\s+days?\s+ago|\d+\s+weeks?\s+ago)\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return 'Not listed';
}

function toDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not listed';
  const d = new Date(typeof value === 'number' ? value : String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

function makeJob(
  company: Company,
  title: string,
  url: string,
  location?: string | null,
  date?: string | null,
  description?: string | null
): Job {
  return {
    company: company.name,
    title: clean(title),
    url,
    location: clean(location) || 'Not listed',
    publishedDate: date || 'Not listed',
    discoveredAt: new Date().toISOString(),
    descriptionSnippet: clean(description).slice(0, 280)
  };
}

/* ------------------------------------------------------------------ */
/* ATS detection (external career sites)                               */
/* ------------------------------------------------------------------ */

type AtsName =
  | 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters'
  | 'recruitee' | 'workday' | 'bamboohr' | 'teamtailor' | 'personio'
  | 'icims' | 'jobvite';

interface AtsInfo {
  name: AtsName;
  /** Board / company identifier used by the public API (null if unknown). */
  token: string | null;
}

export function detectAts(rawUrl: string): AtsInfo | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);
  const first = seg[0] ?? null;
  const sub = host.split('.')[0] ?? null;

  if (host.endsWith('greenhouse.io')) {
    const token =
      u.searchParams.get('for') || (first && first !== 'embed' ? first : null);
    return { name: 'greenhouse', token };
  }
  if (host.endsWith('lever.co') && host.startsWith('jobs')) {
    return { name: 'lever', token: first };
  }
  if (host === 'jobs.ashbyhq.com') return { name: 'ashby', token: first };
  if (host === 'apply.workable.com') return { name: 'workable', token: first };
  if (host.endsWith('smartrecruiters.com')) {
    return { name: 'smartrecruiters', token: first };
  }
  if (host.endsWith('.recruitee.com')) return { name: 'recruitee', token: sub };
  if (host.endsWith('.myworkdayjobs.com')) return { name: 'workday', token: null };
  if (host.endsWith('.bamboohr.com')) return { name: 'bamboohr', token: sub };
  if (host.endsWith('.teamtailor.com')) return { name: 'teamtailor', token: sub };
  if (/\.jobs\.personio\.(de|com)$/.test(host)) return { name: 'personio', token: sub };
  if (host.endsWith('.icims.com')) return { name: 'icims', token: null };
  if (host.endsWith('jobvite.com')) return { name: 'jobvite', token: first };

  return null;
}

/* ------------------------------------------------------------------ */
/* Careers page discovery + internal/external classification           */
/* ------------------------------------------------------------------ */

export interface CareersTarget {
  url: string;
  type: 'internal' | 'external';
  ats: AtsName | null;
  atsToken: string | null;
}

const CAREERS_RE =
  /career|\bjobs?\b|vacanc|open[-_/ ]positions|work[-_/ ]with[-_/ ]us|join[-_/ ](?:our[-_/ ])?team|join[-_/ ]us|we.?re[-_/ ]hiring|opportunit|recruit|hiring/i;

const NOISE_RE =
  /blog|news|press|article|stor(?:y|ies)|insight|podcast|privacy|terms|cookie|login|sign-?in|webinar|event/i;

const PROBE_PATHS = [
  '/careers', '/career', '/jobs', '/careers/jobs', '/join-us', '/join',
  '/about/careers', '/company/careers', '/work-with-us', '/en/careers'
];

interface PageLinks {
  links: { href: string; text: string }[];
  embeds: string[]; // iframe / script sources (ATS widgets are often embedded)
}

async function collectLinks(page: Page): Promise<PageLinks> {
  return page.evaluate(() => {
    const c = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map(a => ({
      href: a.href,
      text: c(a.innerText || a.getAttribute('aria-label') || a.title)
    }));
    const embeds = Array.from(
      document.querySelectorAll<HTMLIFrameElement | HTMLScriptElement>('iframe[src], script[src]')
    ).map(e => e.src);
    return { links, embeds };
  });
}

function scoreLink(link: { href: string; text: string }): number {
  if (!/^https?:/i.test(link.href)) return 0;

  let path: string;
  try {
    const u = new URL(link.href);
    path = u.hostname + u.pathname;
  } catch {
    return 0;
  }

  let score = 0;
  if (detectAts(link.href)) score += 6;
  if (CAREERS_RE.test(path)) score += 3;
  if (link.text.length < 40 && CAREERS_RE.test(link.text)) score += 3;
  if (/^(careers?|jobs?|join us|we.?re hiring|work with us|open positions|view jobs)$/i.test(link.text)) {
    score += 2;
  }
  if (NOISE_RE.test(path)) score -= 4;
  return score;
}

async function probeUrl(page: Page, url: string): Promise<string | null> {
  try {
    const res = await page.request.get(url, { timeout: 8000, maxRedirects: 5 });
    if (!res.ok()) return null;
    if (!(res.headers()['content-type'] ?? '').includes('text/html')) return null;

    // A redirect back to the homepage means "no such page".
    const finalPath = new URL(res.url()).pathname.replace(/\/$/, '');
    if (finalPath === '') return null;
    return res.url();
  } catch {
    return null;
  }
}

async function guessCareersUrl(page: Page, websiteUrl: string): Promise<string | null> {
  const origin = new URL(websiteUrl).origin;
  const root = stripWww(new URL(websiteUrl).hostname);

  // Dedicated subdomains first, then common paths.
  const candidates = [
    `https://careers.${root}`,
    `https://jobs.${root}`,
    ...PROBE_PATHS.map(p => origin + p)
  ];

  for (const candidate of candidates) {
    const found = await probeUrl(page, candidate);
    if (found) return found;
  }
  return null;
}

/** Given a careers URL, decide internal vs external and detect any ATS behind it. */
async function classifyCareersUrl(
  page: Page,
  careersUrl: string,
  siteHost: string
): Promise<CareersTarget> {
  // 1) The URL itself is an ATS board.
  const direct = detectAts(careersUrl);
  if (direct) {
    return { url: careersUrl, type: 'external', ats: direct.name, atsToken: direct.token };
  }

  // 2) The careers page embeds or links to an ATS.
  try {
    await page.goto(careersUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined);

    const { links, embeds } = await collectLinks(page);
    const atsHit =
      embeds.map(e => ({ url: e, info: detectAts(e) })).find(x => x.info && x.info.token) ??
      links.map(l => ({ url: l.href, info: detectAts(l.href) })).find(x => x.info && x.info.token);

    if (atsHit?.info) {
      // Keep the page the user gave us; just remember which ATS feeds it.
      return {
        url: careersUrl,
        type: sameSite(hostOf(careersUrl), siteHost) ? 'internal' : 'external',
        ats: atsHit.info.name,
        atsToken: atsHit.info.token
      };
    }
  } catch {
    // Fall through to the domain-based decision.
  }

  // 3) No ATS: internal if it lives on the company's own site.
  return {
    url: careersUrl,
    type: sameSite(hostOf(careersUrl), siteHost) ? 'internal' : 'external',
    ats: null,
    atsToken: null
  };
}

export async function findCareersPage(
  page: Page,
  websiteUrl: string
): Promise<CareersTarget | null> {
  console.log(`[DISCOVER] ${websiteUrl}`);
  const siteHost = hostOf(websiteUrl);

  let careersUrl: string | null = null;

  try {
    await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined);

    const { links } = await collectLinks(page);
    const best = links
      .map(link => ({ link, score: scoreLink(link) }))
      .filter(x => x.score >= 3)
      .sort((a, b) => b.score - a.score)[0];

    careersUrl = best?.link.href ?? null;
  } catch (error) {
    console.error(`[DISCOVER] homepage failed: ${error instanceof Error ? error.message : error}`);
  }

  // Homepage had no usable link (JS menus, blocked, etc.) -> guess common URLs.
  if (!careersUrl) careersUrl = await guessCareersUrl(page, websiteUrl);

  if (!careersUrl) {
    console.log('[NOT FOUND] Careers page not found');
    return null;
  }

  const target = await classifyCareersUrl(page, careersUrl, siteHost);
  console.log(
    `[DISCOVERED] ${target.url} (${target.type}${target.ats ? `, ${target.ats}` : ''})`
  );
  return target;
}

/* ------------------------------------------------------------------ */
/* Job extraction: ATS public APIs (accurate, includes posted date)    */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function getJson(url: string, attempt = 1): Promise<Json> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': UA },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } catch (error) {
    if (attempt >= 2) {
      const cause = (error as { cause?: { code?: string } }).cause?.code;
      throw new Error(`${error instanceof Error ? error.message : error}${cause ? ` (${cause})` : ''}`);
    }
    await sleep(1500);
    return getJson(url, attempt + 1);
  }
}

/** Returns null when the ATS has no supported API (caller falls back to page scraping). */
async function fetchAtsJobs(company: Company, ats: AtsName, token: string | null): Promise<Job[] | null> {
  if (!token) return null;
  const t = encodeURIComponent(token);

  switch (ats) {
    case 'greenhouse': {
      const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs`);
      return (data.jobs ?? []).map((j: Json) =>
        makeJob(company, j.title, j.absolute_url, j.location?.name, toDate(j.first_published ?? j.updated_at))
      );
    }
    case 'lever': {
      const data = await getJson(`https://api.lever.co/v0/postings/${t}?mode=json`);
      return (data ?? []).map((j: Json) =>
        makeJob(company, j.text, j.hostedUrl, j.categories?.location, toDate(j.createdAt), j.descriptionPlain)
      );
    }
    case 'ashby': {
      const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${t}`);
      return (data.jobs ?? []).map((j: Json) =>
        makeJob(company, j.title, j.jobUrl, j.location, toDate(j.publishedAt), j.descriptionPlain)
      );
    }
    case 'workable': {
      const data = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${t}`);
      return (data.jobs ?? []).map((j: Json) =>
        makeJob(
          company, j.title, j.url,
          [j.city, j.state, j.country].filter(Boolean).join(', '),
          toDate(j.published_on ?? j.created_at), j.description
        )
      );
    }
    case 'smartrecruiters': {
      const data = await getJson(`https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=100`);
      return (data.content ?? []).map((j: Json) =>
        makeJob(
          company, j.name, `https://jobs.smartrecruiters.com/${token}/${j.id}`,
          [j.location?.city, j.location?.country].filter(Boolean).join(', '),
          toDate(j.releasedDate)
        )
      );
    }
    case 'recruitee': {
      const data = await getJson(`https://${t}.recruitee.com/api/offers/`);
      return (data.offers ?? []).map((j: Json) =>
        makeJob(company, j.title, j.careers_url, j.location, toDate(j.published_at), j.description)
      );
    }
    case 'bamboohr': {
      const base = `https://${t}.bamboohr.com/careers`;
      const list = await getJson(`${base}/list`);
      const out: Job[] = [];
      for (const j of (list.result ?? []).slice(0, 60) as Json[]) {
        let date = 'Not listed';
        let desc = '';
        try {
          const d = await getJson(`${base}/${j.id}/detail`);
          const o = d.result?.jobOpening ?? {};
          date = toDate(o.datePosted);
          desc = String(o.description ?? '').replace(/<[^>]+>/g, ' ');
        } catch {
          /* date/description are best-effort */
        }
        const loc = j.location ?? {};
        out.push(
          makeJob(
            company, j.jobOpeningName, `${base}/${j.id}`,
            [loc.city, loc.state].filter(Boolean).join(', ') || (j.isRemote ? 'Remote' : ''),
            date, desc
          )
        );
      }
      return out;
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Job extraction: generic page scraping (internal / unknown ATS)      */
/* ------------------------------------------------------------------ */

const JOB_HREF_RE = /job|career|position|opening|vacanc|posting|requisition|role|apply|opportunit/i;

async function loadAllListings(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
    const btn = page.getByRole('button', { name: /load more|show more|view more|see more/i }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
  }
}

/** Structured data many career sites publish: <script type="application/ld+json"> JobPosting */
async function extractJsonLdJobs(page: Page, company: Company): Promise<Job[]> {
  const blocks: Json[] = await page.evaluate(() => {
    const out: unknown[] = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try {
        out.push(JSON.parse(s.textContent || ''));
      } catch {
        /* ignore malformed JSON-LD */
      }
    });
    return out;
  });

  const nodes: Json[] = [];
  const walk = (n: Json) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === 'object') {
      if (n['@graph']) walk(n['@graph']);
      const type = n['@type'];
      if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) nodes.push(n);
    }
  };
  blocks.forEach(walk);

  return nodes
    .filter(n => n.title)
    .map(n => {
      const loc = Array.isArray(n.jobLocation) ? n.jobLocation[0] : n.jobLocation;
      const addr = loc?.address ?? {};
      return makeJob(
        company,
        n.title,
        n.url || page.url(),
        [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', '),
        toDate(n.datePosted),
        n.description?.replace(/<[^>]+>/g, ' ')
      );
    });
}

async function scrapeJobLinks(
  page: Page,
  company: Company,
  careersUrl: string
): Promise<Job[]> {
  // 'a[href]' is just the default, so it must not switch off the job-link filter.
  const configured = company.jobLinkSelector?.trim();
  const customSelector = configured && configured !== 'a[href]' ? configured : undefined;
  const selector = customSelector || 'a[href]';

  const candidates = await page.locator(selector).evaluateAll(anchors =>
    anchors.map(node => {
      const a = node as HTMLAnchorElement;
      let card: Element | null = a;
      for (let i = 0; i < 4 && card?.parentElement; i++) {
        const text = (card.textContent || '').trim();
        if (text.length > 35 && text.length < 1800) break;
        card = card.parentElement;
      }
      const c = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();
      const container = a.closest(
        'li, article, [class*="card"], [class*="job"], [class*="position"], [class*="opening"]'
      );
      const scope =
        container && (container.textContent || '').length < 3000 ? container : card;
      const headingEl = scope?.querySelector('h1, h2, h3, h4, [class*="title"]');
      return {
        title: c(a.innerText || a.getAttribute('aria-label')),
        heading: c(headingEl?.textContent),
        href: a.href,
        text: c(scope?.textContent || a.textContent)
      };
    })
  );

  const results: Job[] = [];
  const seen = new Set<string>();
  const careersNoHash = careersUrl.split('#')[0];

  for (const item of candidates) {
    const url = absoluteUrl(item.href, careersUrl);
    // "Apply" / "View" buttons: use the card's heading as the job title instead.
    const generic = /^(apply|apply now|view( job| details)?|learn more|read more|details|see more)$/i.test(item.title);
    // Whole-card links (title + description + date in one anchor): also use the heading.
    const title = generic || item.title.length > 120 ? item.heading || item.title : item.title;

    if (!title || !url || seen.has(url)) continue;
    if (!customSelector) {
      // Default mode: only keep links that look like a job detail page.
      if (url.split('#')[0] === careersNoHash) continue;
      if (title.length < 4 || title.length > 150) continue;
      if (!JOB_HREF_RE.test(url)) continue;
    }

    seen.add(url);
    const loc = item.text.match(/(?:location|勤務地|based in)\s*[:\-]?\s*([^|•]{2,80})/i);
    results.push(
      makeJob(company, title, url, loc?.[1], extractDate(item.text), item.text)
    );
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Per-company orchestration                                           */
/* ------------------------------------------------------------------ */

async function scrapeCompany(page: Page, company: Company, config: Config): Promise<Job[]> {
  console.log(`\n[SCAN] ${company.name}`);

  try {
    let target: CareersTarget | null = null;
    const siteHost = hostOf(company.websiteUrl ?? '');

    if (isValidUrl(company.careersUrl)) {
      // Known careers URL (maybe from a previous run): reuse, only classify if not cached.
      const url = company.careersUrl.trim();
      const info = detectAts(url);
      target =
        company.careersType
          ? {
              url,
              type: company.careersType,
              ats: (company.ats as AtsName | null | undefined) ?? info?.name ?? null,
              atsToken: company.atsToken ?? info?.token ?? null
            }
          : await classifyCareersUrl(page, url, siteHost);
    } else {
      if (!isValidUrl(company.websiteUrl)) {
        console.error(`[SKIP] ${company.name}: Missing or invalid websiteUrl`);
        return [];
      }
      target = await findCareersPage(page, company.websiteUrl.trim());
      if (!target) {
        console.error(`[SKIP] ${company.name}: Careers page not found`);
        return [];
      }
    }

    // Persist discovery results on the company object (save it however you already do).
    company.careersUrl = target.url;
    company.careersType = target.type;
    company.ats = target.ats;
    company.atsToken = target.atsToken;

    let jobs: Job[] | null = null;

    // 1) ATS API when available.
    if (target.ats) {
      try {
        jobs = await fetchAtsJobs(company, target.ats, target.atsToken);
        if (jobs) console.log(`[API] ${company.name}: ${jobs.length} total via ${target.ats}`);
      } catch (error) {
        console.error(`[API-FAIL] ${company.name}: ${error instanceof Error ? error.message : error}`);
      }
    }

    // 2) Fall back to rendering the page.
    if (!jobs) {
      console.log(`[VISIT] ${target.url}`);
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(1200);
      await loadAllListings(page);

      const structured = await extractJsonLdJobs(page, company);
      jobs = structured.length ? structured : await scrapeJobLinks(page, company, target.url);
    }

    // Apply your keyword / role filter and de-duplicate by URL.
    const seen = new Set<string>();
    const matching = jobs.filter(job => {
      if (!job.url || seen.has(job.url)) return false;
      seen.add(job.url);
      return isRelevant(job.title, job.descriptionSnippet, config);
    });

    console.log(`[FOUND] ${company.name}: ${matching.length} matching listing(s)`);
    return matching;
  } catch (error) {
    console.error(`[ERROR] ${company.name}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

export async function scanCompanies(companies: Company[], config: Config): Promise<Job[]> {
  const browser = await chromium.launch({
    headless: config.headless && process.env.HEADED !== 'true'
  });
  const context = await browser.newContext({ userAgent: UA });

  // tsx/esbuild injects a `__name` helper into functions; Playwright serialises those
  // functions into the browser, where the helper doesn't exist. Define a no-op there.
  await context.addInitScript('window.__name = (fn) => fn;');
  const page = await context.newPage();
  const all: Job[] = [];

  try {
    const enabled = companies.filter(c => c.enabled !== false);
    console.log(`\nCompanies to scan: ${enabled.length}`);

    for (const company of enabled) {
      all.push(...(await scrapeCompany(page, company, config)));
      await sleep(config.delayBetweenCompaniesMs);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return all;
}
