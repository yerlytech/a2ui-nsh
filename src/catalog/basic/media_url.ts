/**
 * Safe media URL validation for A2UI Basic Catalog `Image` (and later media)
 * components. Fails closed on disallowed schemes (`javascript:`, `file:`,
 * `vbscript:`, protocol-relative `//`, or malformed URLs).
 */

const ALLOWED_MEDIA_SCHEMES: ReadonlySet<string> = new Set([
  "http:",
  "https:",
  "data:",
  "asset:",
]);

/**
 * Returns the trimmed URL string if it uses an allowed scheme (`http:`,
 * `https:`, `data:`, or `nsh`'s bundled `asset:`), or `undefined` otherwise.
 */
export function sanitizeMediaUrl(urlInput: unknown): string | undefined {
  if (typeof urlInput !== "string") {
    return undefined;
  }
  const trimmed = urlInput.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("\\\\")
  ) {
    return undefined;
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*:)/.exec(trimmed);
  if (!schemeMatch) {
    return undefined;
  }
  const scheme = schemeMatch[1]!.toLowerCase();
  if (!ALLOWED_MEDIA_SCHEMES.has(scheme)) {
    return undefined;
  }

  if (scheme === "data:") {
    // Allow data URLs for images only, rejecting executable/HTML payloads.
    return /^data:image\/[a-zA-Z0-9.+-]+(;[^,]*)?,/i.test(trimmed)
      ? trimmed
      : undefined;
  }

  if (scheme === "asset:") {
    return trimmed.startsWith("asset:/") && trimmed.length > "asset:/".length
      ? trimmed
      : undefined;
  }

  // Validate http(s) URL structure.
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0
    ) {
      return trimmed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
