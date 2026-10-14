import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { XMLParser } from "fast-xml-parser";
import type { Source } from "@workspace/db";

type JsonRecord = Record<string, unknown>;
type FeedFormat = "json" | "rss" | "atom";

export interface ReadSourceFeedResult {
  items: JsonRecord[];
  format: FeedFormat;
}

const MAX_RESPONSE_BYTES = 2_000_000;
const ACCEPTED_CONTENT_TYPES =
  "application/feed+json, application/json, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9";
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  textNodeName: "#text",
});

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(asText).filter(Boolean).join(" ").trim() || null;
  }
  if (value && typeof value === "object") {
    const record = asRecord(value);
    return asText(record["#text"] ?? record["__cdata"] ?? record.value);
  }
  return null;
}

function ipv4IsPublic(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second, third] = parts;
  if (first === undefined || second === undefined || third === undefined) return false;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function ipv6Value(address: string): bigint | null {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  const sections = normalized.split("::");
  if (sections.length > 2) return null;
  const left = sections[0] ? sections[0].split(":").filter(Boolean) : [];
  const right = sections.length === 2 && sections[1]
    ? sections[1].split(":").filter(Boolean)
    : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (sections.length === 1 && missing !== 0)) return null;
  const words = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) {
    return null;
  }
  return words.reduce((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
}

function ipIsPublic(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return ipv4IsPublic(address);
  if (version !== 6) return false;

  const value = ipv6Value(address);
  if (value === null) return false;
  const ipv4MappedPrefix = value >> 32n;
  if (ipv4MappedPrefix === 0xffffn) {
    const mappedIpv4 = [
      Number((value >> 24n) & 255n),
      Number((value >> 16n) & 255n),
      Number((value >> 8n) & 255n),
      Number(value & 255n),
    ].join(".");
    return ipv4IsPublic(mappedIpv4);
  }

  const publicIpv6Start = 0x20000000000000000000000000000000n;
  const publicIpv6End = 0x3fffffffffffffffffffffffffffffffn;
  const isGlobalUnicast = value >= publicIpv6Start && value <= publicIpv6End;
  const isDocumentationRange = value >> 96n === 0x20010db8n;
  const isSixToFour = value >> 112n === 0x2002n;
  return isGlobalUnicast && !isDocumentationRange && !isSixToFour;
}

async function validatePublicHttpsUrl(source: Source): Promise<URL> {
  if (!source.sourceUrl) {
    throw new Error("Add an authorized public feed URL before collecting.");
  }

  let url: URL;
  try {
    url = new URL(source.sourceUrl);
  } catch {
    throw new Error("The feed URL is not valid.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    isIP(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Feed collection only supports public HTTPS URLs.");
  }
  if (
    Array.from(url.searchParams.keys()).some((key) =>
      /(?:api[_-]?key|access[_-]?token|authorization|credential|password|secret|signature|^auth$|^key$|^sig$|^token$)/i.test(
        key,
      ),
    )
  ) {
    throw new Error(
      "Do not put credentials in feed URLs. Only public endpoints are supported.",
    );
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("The feed host could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !ipIsPublic(address))) {
    throw new Error("The feed URL must resolve only to public internet addresses.");
  }

  return url;
}

async function readLimitedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("The feed response exceeds the 2 MB size limit.");
  }
  if (!response.body) {
    throw new Error("The feed response was empty.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("The feed response exceeds the 2 MB size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const content = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(content);
}

function recordsFromJson(value: unknown, maxItems: number): JsonRecord[] {
  const root = asRecord(value);
  const candidates = Array.isArray(value)
    ? value
    : root.items ?? root.results ?? root.data ?? root.entries;
  if (!Array.isArray(candidates)) {
    throw new Error("The JSON endpoint must return an array or an object with an items, results, data, or entries array.");
  }
  return candidates
    .slice(0, maxItems)
    .filter((item): item is JsonRecord => item !== null && typeof item === "object" && !Array.isArray(item));
}

function recordsFromXml(value: unknown, maxItems: number): {
  items: JsonRecord[];
  format: "rss" | "atom";
} {
  const root = asRecord(value);
  const feed = asRecord(root.feed);
  if (feed.entry !== undefined) {
    const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
    return {
      items: entries.slice(0, maxItems).map(asRecord),
      format: "atom",
    };
  }

  const rss = asRecord(root.rss);
  const channel = asRecord(rss.channel ?? root.channel);
  if (channel.item !== undefined) {
    const entries = Array.isArray(channel.item) ? channel.item : [channel.item];
    return {
      items: entries.slice(0, maxItems).map(asRecord),
      format: "rss",
    };
  }

  throw new Error("The XML endpoint did not return an RSS or Atom feed.");
}

export async function readPublicSourceFeed(
  source: Source,
): Promise<ReadSourceFeedResult> {
  if (source.accessMethod !== "authorized_feed" && source.accessMethod !== "api") {
    throw new Error("This source is not registered as a feed or public API.");
  }

  const url = await validatePublicHttpsUrl(source);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "error",
      headers: { Accept: ACCEPTED_CONTENT_TYPES },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("The public feed could not be reached without a redirect.");
  }

  if (!response.ok) {
    throw new Error(`The feed server returned status ${response.status}.`);
  }

  const body = await readLimitedText(response);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const isJson =
    contentType.includes("json") ||
    body.trimStart().startsWith("{") ||
    body.trimStart().startsWith("[");

  if (source.accessMethod === "api" && !isJson) {
    throw new Error("Public API sources must return JSON.");
  }

  if (isJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error("The JSON feed could not be parsed.");
    }
    return {
      items: recordsFromJson(parsed, source.collectionMaxPages),
      format: "json",
    };
  }

  if (source.accessMethod === "api") {
    throw new Error("Public API sources must return JSON.");
  }

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(body);
  } catch {
    throw new Error("The RSS or Atom feed could not be parsed.");
  }
  const result = recordsFromXml(parsed, source.collectionMaxPages);
  return { ...result, format: result.format };
}

function htmlToText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// JSON API records (e.g. Socrata open data) rarely carry RSS-style fields.
// Build a text summary from the record's own scalar fields so each record is
// distinct — otherwise every row shares one fingerprint and new records are
// silently deduplicated away.
function jsonRecordToText(value: JsonRecord): string {
  const parts: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim()) {
      parts.push(`${key}: ${entry.trim()}`);
    } else if (typeof entry === "number" || typeof entry === "boolean") {
      parts.push(`${key}: ${String(entry)}`);
    }
    if (parts.length >= 10) break;
  }
  return parts.join(" · ");
}

export function feedItemToObservationInput(
  item: JsonRecord,
  sourceUrl: string,
): JsonRecord {
  const linkValue = item.link;
  const linkRecord = asRecord(
    Array.isArray(linkValue) ? linkValue.find((candidate) => asText(asRecord(candidate)["@_rel"]) === "alternate") ?? linkValue[0] : linkValue,
  );
  const link =
    asText(linkRecord["@_href"]) ??
    asText(linkValue) ??
    asText(item.url) ??
    asText(item.external_url) ??
    sourceUrl;
  const structuredText = jsonRecordToText(item);
  const title =
    asText(item.title) ??
    asText(item.name) ??
    asText(item.headline) ??
    (structuredText
      ? structuredText.slice(0, 120)
      : "Untitled feed item");
  const rawSummary =
    asText(item.content_text) ??
    asText(item.summary) ??
    asText(item.description) ??
    asText(item["content:encoded"]) ??
    asText(item.encoded) ??
    asText(item.content) ??
    asText(item.subtitle) ??
    structuredText ??
    title;
  const summary = htmlToText(rawSummary) || title;
  const publishedAt =
    asText(item.date_published) ??
    asText(item.published) ??
    asText(item.pubDate) ??
    asText(item.updated) ??
    asText(item.date);

  return {
    title: htmlToText(title) || title,
    text: summary,
    url: link,
    publishedAt,
  };
}
