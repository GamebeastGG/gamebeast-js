import type {
  ApiClient,
  DeeplinkAttribution,
  Logger,
  MarkerFields,
  MarkerProperties,
} from "@gamebeast/core";
import {
  buildMarker,
  MarkerQueue,
  normalizeDistinctId,
  positiveNumber,
  sanitizeAttribution,
} from "@gamebeast/core";

export interface MarkerQueueSettings {
  /** Markers per request. Default 100. */
  maxBatchSize?: number;
  /** Longest a marker waits before its batch is sent, in milliseconds. Default 5000. */
  flushIntervalMs?: number;
  /** Bound on buffered markers during an outage; the oldest are dropped first. Default 10000. */
  maxBufferedMarkers?: number;
}

export interface ServerMarkerOptions extends Omit<MarkerFields, "deeplinkData" | "utm"> {
  /**
   * The user the marker is about. Omit for a server-level marker (one not tied to a user).
   */
  distinctId?: string;
  /**
   * The deeplink and UTM attribution of the user's session, e.g. `client.attribution` from
   * `@gamebeast/js` forwarded in your request, or `parseAttribution(landingUrl)` for a
   * server-rendered landing. Malformed values are dropped (the marker is still sent), and the
   * backend ignores deeplinks that belong to another project.
   */
  deeplink?: Pick<DeeplinkAttribution, "deeplinkData" | "utm">;
}

export interface ServerMarkers {
  /**
   * Record a marker. Batched and sent in the background; call `flush()` (or the SDK's
   * `shutdown()`) before the process exits so nothing buffered is lost.
   *
   * @param eventName Event name, e.g. `"purchase_completed"`.
   * @param properties Optional JSON-serializable object.
   * @param options The user, session and timestamp to attribute the marker to.
   */
  send(eventName: string, properties?: MarkerProperties, options?: ServerMarkerOptions): void;

  /** Send everything buffered now. Resolves once the requests have settled. */
  flush(): Promise<void>;
}

export class ServerMarkersService implements ServerMarkers {
  private readonly queue: MarkerQueue;

  constructor(
    api: ApiClient,
    private readonly logger: Logger,
    settings: MarkerQueueSettings = {}
  ) {
    this.queue = new MarkerQueue({
      send: (markers) => api.postMarkers(markers),
      logger,
      maxBatchSize: positiveInteger(settings.maxBatchSize, 100),
      flushIntervalMs: positiveInteger(settings.flushIntervalMs, 5_000),
      maxBufferedMarkers: positiveInteger(settings.maxBufferedMarkers, 10_000),
    });
  }

  send(eventName: string, properties?: MarkerProperties, options: ServerMarkerOptions = {}): void {
    const fields: MarkerFields = {};
    if (options.distinctId !== undefined) {
      const id = normalizeDistinctId(options.distinctId);
      if (id === undefined) {
        this.logger.error(
          `Marker '${String(eventName)}' has an invalid distinctId; marker dropped.`
        );
        return;
      }
      fields.distinctId = id;
    }
    if (options.sessionId !== undefined) fields.sessionId = String(options.sessionId);
    if (options.timestamp !== undefined) fields.timestamp = options.timestamp;
    if (options.deeplink !== undefined) {
      const attribution = sanitizeAttribution(options.deeplink);
      if (attribution) {
        fields.deeplinkData = attribution.deeplinkData;
        fields.utm = attribution.utm;
      } else {
        this.logger.warn(
          `Marker '${String(eventName)}' has invalid deeplink attribution; sending it without.`
        );
      }
    }

    const marker = buildMarker(eventName, properties, fields, this.logger);
    if (marker) this.queue.enqueue(marker);
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }

  shutdown(): Promise<void> {
    return this.queue.shutdown();
  }
}

/** At least 1, so a fractional setting below 1 cannot produce an empty batch or a zero cap. */
function positiveInteger(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.floor(positiveNumber(value) ?? fallback));
}
