/**
 * Centralised environment helpers.
 *
 * Every environment-dependent guard in the API layer should go through this
 * module so there is a single source of truth for "are we in production?".
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return !isProduction();
}

/** Maximum CSV upload size in bytes (default 10 MB). */
export const MAX_UPLOAD_BYTES = Number(process.env.APP_MAX_UPLOAD_BYTES) || 10 * 1024 * 1024;
