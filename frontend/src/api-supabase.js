import { createSupabaseApiClient, SupabaseApiError } from './supabase-api.js';

export const ApiError = SupabaseApiError;
export function createApiClient(options = {}) {
  try {
    return createSupabaseApiClient(options);
  } catch (error) {
    const request = async () => { throw error instanceof Error ? error : new SupabaseApiError(String(error), 500); };
    return { request, get: request, post: request, patch: request, delete: request };
  }
}
