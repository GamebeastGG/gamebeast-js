/**
 * Deeplink and UTM attribution read from a landing URL.
 *
 * A Gamebeast website deeplink sends visitors to the site's URL tagged with standard UTM
 * parameters plus `utm_id=gb_<slug>`. Parsing that URL gives the session's attribution: the
 * browser SDK keeps it for the session and stamps it on every marker, and a server can do the same
 * with `@gamebeast/node`. The backend resolves the slug and checks it belongs to the project, so
 * nothing here needs to be trusted.
 *
 * Pure and platform-neutral (only the WHATWG `URL`).
 */
import type { SdkDeeplinkData, SdkUtm } from "@gamebeast/sdk-contract";
import { uuidv4 } from "./uuid";

/** The `utm_id` prefix that marks a Gamebeast deeplink. */
export const GAMEBEAST_UTM_ID_PREFIX = "gb_";

const UTM_FIELDS = ["source", "medium", "campaign", "content", "term", "id"] as const;
const MAX_UTM_LENGTH = 512;
const MAX_SLUG_LENGTH = 128;
const MAX_URL_LENGTH = 2048;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The deeplink a marker is attributed to. `interactionId` identifies one landing. */
export type DeeplinkData = SdkDeeplinkData;
/** UTM parameters, without the `utm_` prefix. */
export type UtmParameters = SdkUtm;

/** How a session (or a server-side marker) was acquired. */
export interface DeeplinkAttribution {
  /** Present when the landing URL carried a Gamebeast deeplink (`utm_id=gb_<slug>`). */
  deeplinkData?: DeeplinkData;
  /** Standard UTM parameters from the landing URL, when any were present. */
  utm?: UtmParameters;
  /** `document.referrer` (or the request's `Referer`) at landing, when known. */
  referrer?: string;
  /** The landing URL with its `utm_*` parameters removed. */
  landingUrl?: string;
  /** When the landing was recorded, in epoch milliseconds. */
  capturedAt: number;
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/**
 * Read the attribution from a landing URL. Returns `undefined` when the URL has no `utm_*`
 * parameters (an ordinary visit), so the caller can keep whatever attribution it already has.
 * A `utm_id` starting with `gb_` is a Gamebeast deeplink and gets a fresh `interactionId`.
 */
export function parseAttribution(
  url: string,
  referrer?: string,
  now: () => number = Date.now
): DeeplinkAttribution | undefined {
  const parsed = typeof url === "string" ? parseUrl(url) : undefined;
  if (!parsed) return undefined;

  const utm: UtmParameters = {};
  for (const field of UTM_FIELDS) {
    const value = parsed.searchParams.get(`utm_${field}`)?.trim();
    if (value) utm[field] = value.slice(0, MAX_UTM_LENGTH);
  }
  if (Object.keys(utm).length === 0) return undefined;

  const attribution: DeeplinkAttribution = { utm, capturedAt: now() };

  const slug = utm.id?.startsWith(GAMEBEAST_UTM_ID_PREFIX)
    ? utm.id.slice(GAMEBEAST_UTM_ID_PREFIX.length)
    : undefined;
  if (slug && slug.length <= MAX_SLUG_LENGTH) {
    attribution.deeplinkData = { slug, interactionId: uuidv4() };
  }

  const landingUrl = stripAttributionParams(parsed.toString());
  if (landingUrl) attribution.landingUrl = landingUrl.slice(0, MAX_URL_LENGTH);
  if (typeof referrer === "string" && referrer !== "") {
    attribution.referrer = referrer.slice(0, MAX_URL_LENGTH);
  }
  return attribution;
}

/** The `utm_*` parameter names on `url`, in any letter case. */
function utmKeys(url: URL): string[] {
  const keys: string[] = [];
  url.searchParams.forEach((_value, key) => {
    if (key.toLowerCase().startsWith("utm_") && !keys.includes(key)) keys.push(key);
  });
  return keys;
}

/** `url` without its `utm_*` parameters. Returns the input unchanged if it isn't a URL. */
export function stripAttributionParams(url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) return url;
  for (const key of utmKeys(parsed)) parsed.searchParams.delete(key);
  return parsed.toString();
}

/** True when `url` carries any `utm_*` parameter. */
export function hasAttributionParams(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== undefined && utmKeys(parsed).length > 0;
}

/**
 * Validate attribution an app hands the SDK (e.g. forwarded from the browser to a server). Keeps
 * what is well-formed and drops the rest, so a bad value can only lose attribution, never a
 * marker. Returns `undefined` when nothing usable remains.
 */
export function sanitizeAttribution(
  value: unknown
): Pick<DeeplinkAttribution, "deeplinkData" | "utm"> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const input = value as { deeplinkData?: unknown; utm?: unknown };
  const result: Pick<DeeplinkAttribution, "deeplinkData" | "utm"> = {};

  const deeplinkData = input.deeplinkData as Partial<DeeplinkData> | undefined;
  if (
    typeof deeplinkData === "object" &&
    deeplinkData !== null &&
    typeof deeplinkData.slug === "string" &&
    deeplinkData.slug !== "" &&
    deeplinkData.slug.length <= MAX_SLUG_LENGTH &&
    typeof deeplinkData.interactionId === "string" &&
    UUID_PATTERN.test(deeplinkData.interactionId)
  ) {
    result.deeplinkData = { slug: deeplinkData.slug, interactionId: deeplinkData.interactionId };
  }

  if (typeof input.utm === "object" && input.utm !== null) {
    const utm: UtmParameters = {};
    for (const field of UTM_FIELDS) {
      const fieldValue = (input.utm as Record<string, unknown>)[field];
      if (typeof fieldValue === "string" && fieldValue !== "") {
        utm[field] = fieldValue.slice(0, MAX_UTM_LENGTH);
      }
    }
    if (Object.keys(utm).length > 0) result.utm = utm;
  }

  return result.deeplinkData || result.utm ? result : undefined;
}
