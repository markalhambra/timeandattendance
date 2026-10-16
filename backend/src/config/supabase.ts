import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

export const STORAGE_BUCKET = 'tams-files';

// Lazy initialisation — avoids crashing the server if env vars are missing
// (e.g. local dev without Supabase configured). File-upload endpoints will
// return a 503 if the client isn't configured.
let _supabase: SupabaseClient | null = null;
let _bucketReady: Promise<void> | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for file uploads.');
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/**
 * Ensure the app storage bucket exists (idempotent).
 * Payslips/docs fail with "Bucket not found" if the project only has other buckets.
 */
export async function ensureStorageBucket(): Promise<void> {
  if (_bucketReady) return _bucketReady;

  _bucketReady = (async () => {
    const sb = getSupabaseClient();
    const { data: buckets, error: listErr } = await sb.storage.listBuckets();
    if (listErr) {
      logger.warn('Could not list storage buckets:', listErr.message);
      return;
    }
    if (buckets?.some((b) => b.name === STORAGE_BUCKET)) return;

    const { error: createErr } = await sb.storage.createBucket(STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
    });
    if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
      logger.error(`Failed to create storage bucket "${STORAGE_BUCKET}":`, createErr.message);
      throw createErr;
    }
    logger.info(`Created Supabase storage bucket "${STORAGE_BUCKET}"`);
  })().catch((err) => {
    _bucketReady = null;
    throw err;
  });

  return _bucketReady;
}
