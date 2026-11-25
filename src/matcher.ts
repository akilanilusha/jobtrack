import type { Config } from './types.js';

export function isRelevant(title: string, location: string, config: Config): boolean {
  const text = `${title} ${location}`.toLowerCase();
  const included = config.includeKeywords.some(k => title.toLowerCase().includes(k.toLowerCase()));
  const excluded = config.excludeKeywords.some(k => text.includes(k.toLowerCase()));
  const locationOk = config.locations.length === 0 || config.locations.some(k => text.includes(k.toLowerCase()));
  return included && !excluded && locationOk;
}
