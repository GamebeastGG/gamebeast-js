import { describe, expect, it } from "vitest";
import {
  hasAttributionParams,
  parseAttribution,
  sanitizeAttribution,
  stripAttributionParams,
} from "../src/attribution";
import { Logger } from "../src/logger";
import { buildMarker } from "../src/markers";
import { silentLogger } from "@gamebeast/test-utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("parseAttribution", () => {
  it("reads UTM values and a Gamebeast deeplink from utm_id=gb_<slug>", () => {
    const attribution = parseAttribution(
      "https://example.com/page?ref=x&utm_source=twitter&utm_medium=social&utm_campaign=launch&utm_id=gb_summer-mfz3k0q7",
      "https://t.co/abc",
      () => 1234
    );
    expect(attribution).toMatchObject({
      utm: { source: "twitter", medium: "social", campaign: "launch", id: "gb_summer-mfz3k0q7" },
      deeplinkData: { slug: "summer-mfz3k0q7" },
      referrer: "https://t.co/abc",
      landingUrl: "https://example.com/page?ref=x",
      capturedAt: 1234,
    });
    expect(attribution?.deeplinkData?.interactionId).toMatch(UUID);
  });

  it("gives each landing its own interaction id", () => {
    const url = "https://example.com/?utm_id=gb_abc";
    expect(parseAttribution(url)?.deeplinkData?.interactionId).not.toBe(
      parseAttribution(url)?.deeplinkData?.interactionId
    );
  });

  it("keeps plain UTM traffic without a Gamebeast id", () => {
    const attribution = parseAttribution("https://example.com/?utm_source=newsletter&utm_id=q3");
    expect(attribution?.utm).toEqual({ source: "newsletter", id: "q3" });
    expect(attribution?.deeplinkData).toBeUndefined();
  });

  it("returns undefined for ordinary visits and unusable input", () => {
    expect(parseAttribution("https://example.com/page?ref=x")).toBeUndefined();
    expect(parseAttribution("not a url")).toBeUndefined();
    expect(parseAttribution(undefined as unknown as string)).toBeUndefined();
    expect(parseAttribution("https://example.com/?utm_source=%20")).toBeUndefined();
  });

  it("ignores an empty gb_ id", () => {
    const attribution = parseAttribution("https://example.com/?utm_id=gb_");
    expect(attribution?.deeplinkData).toBeUndefined();
    expect(attribution?.utm).toEqual({ id: "gb_" });
  });
});

describe("stripAttributionParams", () => {
  it("removes utm_* and keeps everything else", () => {
    expect(
      stripAttributionParams("https://example.com/a?x=1&utm_source=t&UTM_ID=gb_s&y=2#frag")
    ).toBe("https://example.com/a?x=1&y=2#frag");
    expect(stripAttributionParams("nope")).toBe("nope");
  });

  it("is mirrored by hasAttributionParams", () => {
    expect(hasAttributionParams("https://example.com/?utm_term=a")).toBe(true);
    expect(hasAttributionParams("https://example.com/?term=a")).toBe(false);
  });
});

describe("sanitizeAttribution", () => {
  it("keeps well-formed attribution and drops the rest", () => {
    expect(
      sanitizeAttribution({
        deeplinkData: { slug: "abc", interactionId: "3f6c1e2a-8b4d-4c7e-9a1f-5d2b7e0c4a96" },
        utm: { source: "x", medium: 3, bogus: "y" },
        referrer: "ignored",
      })
    ).toEqual({
      deeplinkData: { slug: "abc", interactionId: "3f6c1e2a-8b4d-4c7e-9a1f-5d2b7e0c4a96" },
      utm: { source: "x" },
    });
    expect(sanitizeAttribution({ deeplinkData: { slug: "abc", interactionId: "nope" } })).toBe(
      undefined
    );
    expect(sanitizeAttribution(null)).toBeUndefined();
    expect(sanitizeAttribution("gb_abc")).toBeUndefined();
  });
});

describe("buildMarker attribution", () => {
  const logger = () => new Logger(silentLogger().logger);

  it("sends attribution in reserved top-level fields, never in properties", () => {
    const deeplinkData = { slug: "abc", interactionId: "3f6c1e2a-8b4d-4c7e-9a1f-5d2b7e0c4a96" };
    const marker = buildMarker(
      "purchase",
      { deeplinkData: "mine" },
      { deeplinkData, utm: { source: "twitter" } },
      logger()
    );
    expect(marker?.deeplinkData).toEqual(deeplinkData);
    expect(marker?.deeplinkData).not.toBe(deeplinkData);
    expect(marker?.utm).toEqual({ source: "twitter" });
    expect(marker?.properties).toEqual({ deeplinkData: "mine" });
  });

  it("omits attribution fields when there is none", () => {
    const marker = buildMarker("e", {}, { utm: {} }, logger());
    expect(marker).not.toHaveProperty("deeplinkData");
    expect(marker).not.toHaveProperty("utm");
  });
});
