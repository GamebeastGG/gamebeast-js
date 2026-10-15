import type {
  ApiClient,
  BaseOptions,
  ContextValue,
  DeeplinkAttribution,
  Logger,
  MarkerFields,
  Properties,
} from "@gamebeast/core";
import {
  DISTINCT_ID_MAX_LENGTH,
  durationMs,
  hasAttributionParams,
  normalizeDistinctId,
  parseAttribution,
  resolveBaseOptions,
  sanitizeAttribution,
  sanitizeProperties,
  stripAttributionParams,
} from "@gamebeast/core";
import type { ClientCohorts } from "./cohorts";
import { ClientCohortsService } from "./cohorts";
import type { ClientConfigs } from "./configs";
import { ClientConfigsService, isPageVisible } from "./configs";
import type { ClientExperiments } from "./experiments";
import { ClientExperimentsService } from "./experiments";
import type { Identity } from "./identity";
import { anonymousIdentity, SessionTracker } from "./identity";
import type { ClientMarkers } from "./markers";
import { ClientMarkersService } from "./markers";
import type { KeyValueStorage } from "./storage";
import { fingerprint, SafeStorage } from "./storage";
import { SDK_NAME, SDK_VERSION } from "./version";

/** Recorded once per session when a visitor arrives through a Gamebeast website deeplink. */
const DEEPLINK_LANDING_MARKER = "$deeplink_landing";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface GamebeastClientOptions extends BaseOptions {
  /**
   * The signed-in user's id. When omitted, the SDK generates an anonymous id on first visit and
   * keeps it in `localStorage`, so the same browser reports as the same user across visits.
   */
  distinctId?: string;
  /**
   * Configurations to load immediately, by alias (e.g. `["GameSettings"]`). They gate
   * `configs.isReady` / `configs.onReady`. Any other configuration loads the first time it is read.
   */
  configurations?: readonly string[];
  /**
   * How often (seconds) to re-check configurations while the page is visible. Change detection is
   * hash-based, so an unchanged configuration is a cheap round trip. `0` disables background
   * refresh (`configs.refresh()` still works). Defaults to 60.
   */
  configRefreshIntervalSeconds?: number;
  /**
   * Targeting properties for the current user (e.g. `{ plan: "pro", accountAgeDays: 12 }`), sent
   * with every configuration evaluation. Update later with `setProperties`.
   */
  properties?: Properties;
  /**
   * Your app's version, sent as the `appVersion` targeting property. Configurations cached by a
   * different version are discarded.
   */
  appVersion?: string;
  /**
   * Minutes of inactivity after which a new session starts. Sessions are shared across tabs.
   * `0` keeps one session until the browser storage is cleared. Defaults to 30.
   */
  sessionTimeoutMinutes?: number;
  /**
   * Where to keep the anonymous id, session and caches. Defaults to `localStorage` (falling back to
   * memory where it is unavailable). Pass `null` to keep nothing beyond the page's lifetime.
   */
  storage?: KeyValueStorage | null;
  /**
   * Read deeplink and UTM attribution from the page URL when the SDK starts. The first attribution
   * in a session is kept for the whole session and sent with every marker; a visit through a
   * Gamebeast website deeplink (`utm_id=gb_…`) also records a `$deeplink_landing` marker. Set to
   * `false` to capture it yourself with `captureAttribution(url)`, or not at all. Defaults to `true`.
   */
  captureAttribution?: boolean;
  /**
   * After capturing attribution, remove the `utm_*` parameters from the address bar with
   * `history.replaceState`, so shared or bookmarked URLs don't re-attribute. Defaults to `false`.
   */
  stripAttributionParams?: boolean;
}

/**
 * True when there is no page and no browser worker: server-side rendering in Node, Deno, Bun or an
 * edge runtime. Browser workers (dedicated/shared/service) define `importScripts`; edge runtimes
 * that mimic the worker API (e.g. Cloudflare Workers) do not.
 */
function isServerSideRender(): boolean {
  const scope = globalThis as { window?: unknown; document?: unknown; importScripts?: unknown };
  return (
    scope.window === undefined &&
    scope.document === undefined &&
    typeof scope.importScripts !== "function"
  );
}

interface PageEvents {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * The Gamebeast browser SDK.
 *
 * ```ts
 * import { GamebeastClient } from "@gamebeast/js";
 *
 * const gamebeast = new GamebeastClient({ apiKey: "…", configurations: ["GameSettings"] });
 * gamebeast.markers.send("level_completed", { level: 3 });
 * const speed = gamebeast.configs.get("GameSettings.PlayerSpeed", 1);
 * ```
 *
 * Safe to construct during server-side rendering: browser APIs are only touched when present.
 * Create one instance per page (a module-level singleton works well).
 */
export class GamebeastClient {
  /** Remote configurations, evaluated for the current user. */
  readonly configs: ClientConfigs;
  /** Analytics markers. */
  readonly markers: ClientMarkers;
  /** The experiments the current user is enrolled in. */
  readonly experiments: ClientExperiments;
  /** Cohort membership for the current user. */
  readonly cohorts: ClientCohorts;

  private readonly logger: Logger;
  private readonly api: ApiClient;
  private readonly storage: SafeStorage;
  private readonly session: SessionTracker;
  private readonly configsService: ClientConfigsService;
  private readonly markersService: ClientMarkersService;
  private readonly experimentsService: ClientExperimentsService;
  private readonly appVersion: string | undefined;
  private readonly inert: boolean;
  private readonly stripParams: boolean;
  private identity: Identity;
  private userProperties: Record<string, ContextValue>;
  private readonly detachPageEvents: () => void;
  private shutdownPromise: Promise<void> | undefined;

  constructor(options: GamebeastClientOptions) {
    const base = resolveBaseOptions(options, { name: SDK_NAME, version: SDK_VERSION });
    this.logger = base.logger;
    this.api = base.api;
    this.storage = new SafeStorage(options.storage);
    this.appVersion =
      typeof options.appVersion === "string" && options.appVersion !== ""
        ? options.appVersion
        : undefined;

    const prefix = `gamebeast:${fingerprint(`${options.apiKey.trim()}|${options.projectId ?? ""}`)}:${base.environment}`;

    this.identity = this.resolveInitialIdentity(options.distinctId);
    this.userProperties = sanitizeProperties(options.properties, this.logger);

    // Rendering on the server: there is no user here, only an anonymous id minted per render. Every
    // service is built inert (reads return fallbacks, markers are dropped) and nothing is started.
    const inert = isServerSideRender();
    this.inert = inert;
    this.stripParams = options.stripAttributionParams === true;

    this.session = new SessionTracker(
      this.storage,
      durationMs(options.sessionTimeoutMinutes, 30, 60_000)
    );

    this.experimentsService = new ClientExperimentsService(this.api, this.logger);
    this.cohorts = new ClientCohortsService({
      api: this.api,
      logger: this.logger,
      distinctId: () => this.identity.distinctId,
      inert,
    });

    this.configsService = new ClientConfigsService(
      {
        api: this.api,
        logger: this.logger,
        storage: this.storage,
        cachePrefix: prefix,
        appVersion: this.appVersion,
        refreshIntervalMs: durationMs(options.configRefreshIntervalSeconds, 60, 1000),
        distinctId: () => this.identity.distinctId,
        properties: () => this.evaluationProperties(),
        reportAssignments: (key, assignments) => this.experimentsService.report(key, assignments),
        inert,
      },
      options.configurations ?? []
    );

    this.markersService = new ClientMarkersService({
      api: this.api,
      logger: this.logger,
      storage: this.storage,
      storageKey: `${prefix}:markers`,
      stamp: () => this.stampMarker(),
      inert,
    });

    this.configs = this.configsService;
    this.markers = this.markersService;
    this.experiments = this.experimentsService;

    if (inert) {
      this.detachPageEvents = () => undefined;
      this.logger.debug(
        "Running outside a browser: GamebeastClient is inert here. Use @gamebeast/node on servers."
      );
      return;
    }
    this.detachPageEvents = this.attachPageEvents();
    this.markersService.restorePersisted();
    this.configsService.start();
    if (options.captureAttribution !== false) {
      const href = (globalThis as { location?: { href?: unknown } }).location?.href;
      if (typeof href === "string") this.captureAttribution(href);
    }

    this.logger.debug(
      `Initialized for environment '${base.environment}' as ` +
        `${this.identity.isAnonymous ? "anonymous" : "identified"} user '${this.identity.distinctId}'.`
    );
  }

  /** The current user's id: the one passed to `identify` / options, or the anonymous id. */
  get distinctId(): string {
    return this.identity.distinctId;
  }

  /** True while the SDK is using its generated anonymous id. */
  get isAnonymous(): boolean {
    return this.identity.isAnonymous;
  }

  /** The current session id, shared by every tab of this site. */
  get sessionId(): string {
    return this.session.id;
  }

  /**
   * How the current session was acquired: the Gamebeast deeplink and UTM parameters of the URL it
   * landed on (first touch), or `undefined`. Send it to your server to attribute server-side
   * markers too (`@gamebeast/node`: `markers.send(name, props, { deeplink: attribution })`).
   */
  get attribution(): DeeplinkAttribution | undefined {
    if (this.inert) return undefined;
    const attribution = this.session.attribution;
    return attribution ? cloneJson(attribution) : undefined;
  }

  /**
   * Read deeplink and UTM attribution from `url`. The SDK does this for the page URL when it starts;
   * call it yourself when that URL isn't the landing one, e.g. a single-page app that loads the SDK
   * after its router has rewritten the address, or with `captureAttribution: false`.
   *
   * The first attribution in a session wins: if the session already has one, this does nothing.
   * A Gamebeast deeplink (`utm_id=gb_…`) also records a `$deeplink_landing` marker.
   */
  captureAttribution(url: string): void {
    if (this.inert) {
      this.logger.debug("captureAttribution ignored: attribution is only captured in the browser.");
      return;
    }
    const doc = (globalThis as { document?: { referrer?: unknown } }).document;
    const referrer = typeof doc?.referrer === "string" ? doc.referrer : undefined;
    const attribution = parseAttribution(url, referrer);
    if (!attribution) return;

    if (this.session.setAttributionIfAbsent(attribution)) {
      this.logger.debug(
        attribution.deeplinkData
          ? `Session attributed to deeplink '${attribution.deeplinkData.slug}'.`
          : "Session attributed to UTM parameters."
      );
      if (attribution.deeplinkData) {
        const properties: Record<string, string> = {};
        if (attribution.referrer !== undefined) properties.referrer = attribution.referrer;
        if (attribution.landingUrl !== undefined) properties.landingUrl = attribution.landingUrl;
        this.markersService.send(DEEPLINK_LANDING_MARKER, properties);
      }
    }
    if (this.stripParams) this.stripLocationParams(url);
  }

  /**
   * Switch to a signed-in user. Configurations are re-evaluated for them right away and experiment
   * assignments follow. Markers already recorded keep the id they were recorded under. The id is
   * not persisted: call `identify` again on the next page load (or pass `distinctId` in options).
   */
  identify(distinctId: string): void {
    const normalized = normalizeDistinctId(distinctId);
    if (normalized === undefined) {
      this.logger.error(
        `identify requires a non-empty distinct id of at most ${DISTINCT_ID_MAX_LENGTH} characters.`
      );
      return;
    }
    if (!this.identity.isAnonymous && normalized === this.identity.distinctId) return;
    this.setIdentity({ distinctId: normalized, isAnonymous: false });
  }

  /** Return to this browser's anonymous id (e.g. after sign-out). */
  resetIdentity(): void {
    if (this.identity.isAnonymous) return;
    this.setIdentity(anonymousIdentity(this.storage));
  }

  /**
   * Replace the targeting properties (merged over the SDK's defaults: `platform`, `systemLanguage`
   * and `appVersion`). Configurations are re-evaluated so targeted experiments see the new values.
   */
  setProperties(properties: Properties): void {
    this.userProperties = sanitizeProperties(properties, this.logger);
    this.configsService.onPropertiesChanged();
  }

  /** Send buffered markers now. Resolves once the requests have settled. */
  flush(): Promise<void> {
    return this.markersService.flush();
  }

  /**
   * Stop background work, flush markers and remove page listeners. Further markers are dropped.
   * Mainly for tests and single-page apps that tear the SDK down; pages do not need to call it.
   */
  shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.detachPageEvents();
      this.configsService.shutdown();
      this.experimentsService.shutdown();
      this.shutdownPromise = this.markersService.shutdown();
    }
    return this.shutdownPromise;
  }

  /** The user, session and session attribution a new marker is recorded under. */
  private stampMarker(): MarkerFields {
    const sessionId = this.session.touch();
    const attribution = sanitizeAttribution(this.session.attribution);
    return {
      distinctId: this.identity.distinctId,
      sessionId,
      deeplinkData: attribution?.deeplinkData,
      utm: attribution?.utm,
    };
  }

  /** Remove `utm_*` from the address bar, if `url` is the page's current URL. */
  private stripLocationParams(url: string): void {
    const scope = globalThis as {
      location?: { href?: string };
      history?: {
        state?: unknown;
        replaceState?: (state: unknown, unused: string, url: string) => void;
      };
    };
    if (scope.location?.href !== url || typeof scope.history?.replaceState !== "function") return;
    if (!hasAttributionParams(url)) return;
    try {
      scope.history.replaceState(scope.history.state, "", stripAttributionParams(url));
    } catch (error) {
      this.logger.debug(`Could not remove UTM parameters from the URL: ${String(error)}`);
    }
  }

  private resolveInitialIdentity(distinctId: string | undefined): Identity {
    if (distinctId !== undefined && distinctId !== null) {
      const normalized = normalizeDistinctId(distinctId);
      if (normalized !== undefined) return { distinctId: normalized, isAnonymous: false };
      this.logger.error("Ignoring invalid `distinctId` option; using the anonymous id instead.");
    }
    return anonymousIdentity(this.storage);
  }

  private setIdentity(identity: Identity): void {
    this.identity = identity;
    this.experimentsService.onIdentityChanged();
    this.configsService.onIdentityChanged();
    this.logger.debug(`Identity changed to '${identity.distinctId}'.`);
  }

  /** SDK defaults (named like the Unity SDK's, so one targeting rule covers both), then the app's. */
  private evaluationProperties(): Record<string, ContextValue> {
    const defaults: Record<string, ContextValue> = { platform: "web" };
    const navigatorLike = (globalThis as { navigator?: { language?: string } }).navigator;
    if (typeof navigatorLike?.language === "string" && navigatorLike.language !== "") {
      defaults.systemLanguage = navigatorLike.language;
    }
    if (this.appVersion !== undefined) defaults.appVersion = this.appVersion;
    return { ...defaults, ...this.userProperties };
  }

  private attachPageEvents(): () => void {
    const doc = (globalThis as { document?: PageEvents }).document;
    const win = (globalThis as { window?: PageEvents }).window;
    if (!doc || !win || typeof doc.addEventListener !== "function") return () => undefined;

    const online = () =>
      (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false;
    const onHidden = () => this.markersService.onPageHidden(online());
    const onVisibility = () => {
      if (isPageVisible()) {
        this.markersService.restorePersisted();
        this.configsService.onPageVisible();
      } else {
        onHidden();
      }
    };
    const onOnline = () => this.markersService.restorePersisted();

    doc.addEventListener("visibilitychange", onVisibility);
    win.addEventListener("pagehide", onHidden);
    win.addEventListener("online", onOnline);
    return () => {
      doc.removeEventListener("visibilitychange", onVisibility);
      win.removeEventListener("pagehide", onHidden);
      win.removeEventListener("online", onOnline);
    };
  }
}
