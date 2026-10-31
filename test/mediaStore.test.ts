import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

// Each test gets an empty IndexedDB. A fresh copy of the module stands for a reload: its
// in-memory cache is empty, so whatever it finds came from the database.
const fresh = async () => { vi.resetModules(); return import('../src/mediaStore'); };
const text = async (b: Blob | undefined) => (b ? b.text() : undefined);

describe('media store', () => {
  beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps uploads across a reload', async () => {
    const before = await fresh();
    await before.putMedia('cat', new Blob(['meow'], { type: 'image/jpeg' }));
    const after = await fresh();
    const blob = await after.getMedia('cat');
    expect(await text(blob)).toBe('meow');
    expect(blob?.type).toBe('image/jpeg');
    expect(await after.getMedia('dog')).toBeUndefined();
  });

  it('prunes only what nothing keeps, in memory and in the database', async () => {
    const store = await fresh();
    await store.putMedia('keep', new Blob(['a']));
    await store.putMedia('drop', new Blob(['b']));
    await store.pruneMedia(new Set(['keep']));
    expect(await store.getMedia('drop')).toBeUndefined();
    const reloaded = await fresh();
    expect(await text(await reloaded.getMedia('keep'))).toBe('a');
    expect(await reloaded.getMedia('drop')).toBeUndefined();
  });

  it('works from memory alone where IndexedDB is blocked', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked'); } });
    const store = await fresh();
    await store.putMedia('cat', new Blob(['meow']));
    expect(await text(await store.getMedia('cat'))).toBe('meow');
    await store.pruneMedia(new Set());
    expect(await store.getMedia('cat')).toBeUndefined();
    expect(await (await fresh()).getMedia('cat')).toBeUndefined(); // lost on reload
  });
});
