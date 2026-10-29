export interface Envelope {
  v: 1;
  type: string;
  seq?: number;
  t: number;
  [key: string]: unknown;
}

export type Handler = (msg: Envelope) => void;

export type PublishMsg = { type: string; seq?: number; [key: string]: unknown };
export interface Transport {
  publish: (msg: PublishMsg) => void;
  subscribe: (handler: Handler) => () => void;
  close: () => void;
}

export class LocalTransport implements Transport {
  private channel: BroadcastChannel | null;
  private handlers = new Set<Handler>();
  constructor(kitchenId: string) {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`nom-nom-go-${kitchenId}`) : null;
    this.channel?.addEventListener('message', (e: MessageEvent<Envelope>) => {
      if (e.data?.v === 1) this.handlers.forEach((h) => h(e.data));
    });
  }
  publish(msg: PublishMsg): void {
    const env = { ...msg, v: 1 as const, t: Date.now() };
    if (JSON.stringify(env).length < 4096) this.channel?.postMessage(env);
  }
  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  close(): void {
    this.channel?.close();
  }
}

/** Lazy AppSync Events transport. Config comes from /config.json written at deploy time. */
export class AppSyncTransport implements Transport {
  private handlers = new Set<Handler>();
  private sub: { unsubscribe: () => void } | null = null;
  private pubChannel = '';
  private ready: Promise<void>;

  constructor(
    private kitchenId: string,
    private role: 'child' | 'dad',
  ) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      const res = await fetch('/config.json');
      if (!res.ok) return;
      const cfg = (await res.json()) as { endpoint: string; region: string; apiKey: string };
      const { events } = await import('aws-amplify/api');
      const { Amplify } = await import('aws-amplify');
      Amplify.configure({
        API: { Events: { endpoint: cfg.endpoint, region: cfg.region, defaultAuthMode: 'apiKey', apiKey: cfg.apiKey } },
      } as Parameters<typeof Amplify.configure>[0]);
      const subChannel = this.role === 'child' ? `/kitchen/${this.kitchenId}/dad` : `/kitchen/${this.kitchenId}/play`;
      this.pubChannel = this.role === 'child' ? `/kitchen/${this.kitchenId}/play` : `/kitchen/${this.kitchenId}/dad`;
      const conn = await events.connect(subChannel);
      this.sub = conn.subscribe({
        next: (data: unknown) => {
          const env = data as Envelope;
          if (env?.v === 1) this.handlers.forEach((h) => h(env));
        },
        error: () => undefined,
      });
      this.eventsApi = events;
    } catch {
      // No config or connection: solo play carries on silently.
    }
  }

  private eventsApi: (typeof import('aws-amplify/api'))['events'] | null = null;

  publish(msg: PublishMsg): void {
    const env = { ...msg, v: 1 as const, t: Date.now() };
    if (JSON.stringify(env).length >= 4096 || !this.pubChannel) return;
    void this.ready.then(async () => {
      try {
        await this.eventsApi?.post(this.pubChannel, env);
      } catch {
        /* offline */
      }
    });
  }
  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  close(): void {
    this.sub?.unsubscribe();
  }
}
