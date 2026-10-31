// Copyright (c) 2024-2026 EVtivity. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1

export const CSMS_ORIGIN_PLACEHOLDER = 'YOUR_CSMS_ORIGIN';
export const PORTAL_ORIGIN_PLACEHOLDER = 'YOUR_PORTAL_ORIGIN';

/** The scheme, host and port of a URL, or the placeholder when it does not parse. */
export function originOrPlaceholder(url: string | null | undefined, placeholder: string): string {
  if (url == null || url === '') return placeholder;
  const parsed = URL.parse(url);
  if (parsed == null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    return placeholder;
  }
  return parsed.origin;
}

/**
 * The bucket CORS rule for browser uploads (station images and support
 * attachments from the CSMS, driver photos from the portal) and downloads
 * (presigned GET links), so both origins need the upload method and GET.
 * Uploads are presigned POST forms, or on Cloudflare R2 (`uploadMethod` PUT)
 * a PUT that sends a Content-Type header.
 */
export function buildS3CorsExample(
  csmsUrl: string | null,
  portalUrl: string | null,
  uploadMethod: 'POST' | 'PUT' = 'POST',
): string {
  const origins = [
    originOrPlaceholder(csmsUrl, CSMS_ORIGIN_PLACEHOLDER),
    originOrPlaceholder(portalUrl, PORTAL_ORIGIN_PLACEHOLDER),
  ];
  const rule = [
    {
      AllowedHeaders: uploadMethod === 'PUT' ? ['content-type'] : ['*'],
      AllowedMethods: [uploadMethod, 'GET'],
      AllowedOrigins: [...new Set(origins)],
      ExposeHeaders: [],
      MaxAgeSeconds: 300,
    },
  ];
  return JSON.stringify(rule, null, 2);
}
