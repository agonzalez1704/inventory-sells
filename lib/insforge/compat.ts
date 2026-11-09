// The InsForge storage calls the app makes, answered by a Supabase bucket.
// No server-only import: scripts/check-storage-compat.ts exercises this directly.
type Err = { message: string } | null;

export interface SupabaseBucket {
  upload(key: string, file: Blob | File, opts: { upsert: boolean }): Promise<{ data: { path: string } | null; error: Err }>;
  remove(keys: string[]): Promise<{ data: unknown; error: Err }>;
  createSignedUrl(key: string, secs: number): Promise<{ data: { signedUrl: string } | null; error: Err }>;
  getPublicUrl(key: string): { data: { publicUrl: string } };
}

export function cubetaCompat(b: SupabaseBucket) {
  return {
    async upload(key: string, file: Blob | File) {
      // Callers that replace a file remove the old key first; upsert covers a retry.
      const { data, error } = await b.upload(key, file, { upsert: true });
      if (error || !data) return { data: null, error: error ?? { message: "No se pudo subir" } };
      return { data: { key: data.path, url: b.getPublicUrl(data.path).data.publicUrl }, error: null };
    },
    remove: (key: string) => b.remove([key]),
    createSignedUrl: (key: string, secs: number) => b.createSignedUrl(key, secs),
  };
}
