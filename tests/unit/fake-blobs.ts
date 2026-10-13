/** In-memory stand-in for a Netlify Blobs store, with ETags and conditional writes. */

type WriteOptions = { onlyIfMatch?: string; onlyIfNew?: boolean };

export class FakeBlobStore {
  readonly entries = new Map<string, { value: unknown; etag: string }>();
  private version = 0;
  /** Up to this many milliseconds of random delay per call, so concurrent requests interleave. */
  latency = 0;
  /** Runs before every write; throw from it to make the write fail. */
  beforeWrite?: (key: string) => void | Promise<void>;
  /** Runs before every read. */
  beforeRead?: (key: string) => void | Promise<void>;

  value(key: string) {
    return this.entries.get(key)?.value;
  }

  has(key: string) {
    return this.entries.has(key);
  }

  async get(key: string) {
    await this.delay();
    await this.beforeRead?.(key);
    return this.entries.get(key)?.value ?? null;
  }

  async getWithMetadata(key: string) {
    await this.delay();
    await this.beforeRead?.(key);
    const entry = this.entries.get(key);
    return entry ? { data: structuredClone(entry.value), etag: entry.etag, metadata: {} } : null;
  }

  set(key: string, value: unknown, options?: WriteOptions) {
    return this.write(key, value, options);
  }

  setJSON(key: string, value: unknown, options?: WriteOptions) {
    return this.write(key, structuredClone(value), options);
  }

  async delete(key: string) {
    await this.delay();
    this.entries.delete(key);
  }

  /** Writes without conditions or hooks, as another function instance would. */
  put(key: string, value: unknown) {
    const etag = `"${++this.version}"`;
    this.entries.set(key, { value, etag });
    return etag;
  }

  private async write(key: string, value: unknown, options: WriteOptions = {}) {
    await this.delay();
    await this.beforeWrite?.(key);
    const current = this.entries.get(key);
    if (options.onlyIfNew && current) return { modified: false };
    if (options.onlyIfMatch !== undefined && current?.etag !== options.onlyIfMatch) return { modified: false };
    return { modified: true, etag: this.put(key, value) };
  }

  private delay() {
    return this.latency ? new Promise((ok) => setTimeout(ok, Math.random() * this.latency)) : Promise.resolve();
  }
}
