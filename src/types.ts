export interface Company {
  name: string;
  websiteUrl?: string;                 // give this when you don't know the careers page
  careersUrl?: string;                 // optional now; filled in automatically
  careersType?: 'internal' | 'external'; // set by discovery
  ats?: string | null;                 // e.g. 'greenhouse', 'lever'; set by discovery
  enabled?: boolean;
  jobLinkSelector?: string;
  atsToken?: string | null;             // e.g. 'gh_jwt', 'lever_token'; set by discovery
}
export interface Job {
  company: string;
  title: string;
  url: string;
  location: string;
  publishedDate: string;
  discoveredAt: string;
  descriptionSnippet: string;
  status?: 'new' | 'saved' | 'applied' | 'interview' | 'rejected' | 'offer';
  appliedAt?: string;
}

export interface Config {
  includeKeywords: string[];
  excludeKeywords: string[];
  locations: string[];
  companiesFile: string;
  stateFile: string;
  reportDirectory: string;
  headless: boolean;
  navigationTimeoutMs: number;
  delayBetweenCompaniesMs: number;
}
