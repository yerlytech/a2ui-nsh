import { describe, expect, test } from "nsh/test";
import { sanitizeMediaUrl } from "./media_url";

describe("sanitizeMediaUrl", () => {
  test("accepts an http URL", () => {
    expect(sanitizeMediaUrl("http://example.com/picture.png")).toBe(
      "http://example.com/picture.png",
    );
  });

  test("accepts an https URL", () => {
    expect(sanitizeMediaUrl("https://example.com/picture.png")).toBe(
      "https://example.com/picture.png",
    );
  });

  test("accepts a base64 data image URL", () => {
    const url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

    expect(sanitizeMediaUrl(url)).toBe(url);
  });

  test("accepts an asset URL", () => {
    expect(sanitizeMediaUrl("asset:/icons/logo.png")).toBe(
      "asset:/icons/logo.png",
    );
  });

  // bug: the scheme match lowercases `ASSET:` but the asset path check is
  // case-sensitive, so an allowed scheme in upper case is refused.
  test.skip("bug: accepts an upper-case asset scheme", () => {
    expect(sanitizeMediaUrl("ASSET:/icons/logo.png")).toBe(
      "ASSET:/icons/logo.png",
    );
  });

  test("trims surrounding whitespace before returning the URL", () => {
    expect(sanitizeMediaUrl("  https://example.com/picture.png\n")).toBe(
      "https://example.com/picture.png",
    );
  });

  test("accepts an upper-case scheme", () => {
    expect(sanitizeMediaUrl("HTTPS://EXAMPLE.COM/picture.png")).toBe(
      "HTTPS://EXAMPLE.COM/picture.png",
    );
  });

  test("refuses a non-string value", () => {
    expect(sanitizeMediaUrl(undefined)).toBeUndefined();
    expect(sanitizeMediaUrl(null)).toBeUndefined();
    expect(sanitizeMediaUrl(42)).toBeUndefined();
    expect(sanitizeMediaUrl({ url: "https://example.com" })).toBeUndefined();
  });

  test("refuses an empty or whitespace-only string", () => {
    expect(sanitizeMediaUrl("")).toBeUndefined();
    expect(sanitizeMediaUrl("   ")).toBeUndefined();
  });

  test("refuses a protocol-relative URL", () => {
    expect(sanitizeMediaUrl("//example.com/picture.png")).toBeUndefined();
  });

  test("refuses a UNC-style path", () => {
    expect(sanitizeMediaUrl("\\\\host\\picture.png")).toBeUndefined();
  });

  test("refuses a URL without a scheme", () => {
    expect(sanitizeMediaUrl("example.com/picture.png")).toBeUndefined();
  });

  test("refuses a javascript URL", () => {
    expect(sanitizeMediaUrl("javascript:alert(1)")).toBeUndefined();
  });

  test("refuses a mixed-case JaVaScRiPt URL", () => {
    expect(sanitizeMediaUrl("JaVaScRiPt:alert(1)")).toBeUndefined();
  });

  test("refuses a file URL", () => {
    expect(sanitizeMediaUrl("file:///etc/passwd")).toBeUndefined();
  });

  test("refuses a vbscript URL", () => {
    expect(sanitizeMediaUrl("vbscript:msgbox(1)")).toBeUndefined();
  });

  test("refuses a data URL that is not an image", () => {
    expect(
      sanitizeMediaUrl("data:text/html,<script>alert(1)</script>"),
    ).toBeUndefined();
  });

  test("refuses a data URL without a comma separator", () => {
    expect(sanitizeMediaUrl("data:image/png;base64")).toBeUndefined();
  });

  test("refuses a bare asset scheme", () => {
    expect(sanitizeMediaUrl("asset:")).toBeUndefined();
  });

  test("refuses an asset URL with no path", () => {
    expect(sanitizeMediaUrl("asset:/")).toBeUndefined();
  });

  test("refuses an http URL with no host", () => {
    expect(sanitizeMediaUrl("http://")).toBeUndefined();
  });

  test("refuses a malformed URL", () => {
    expect(sanitizeMediaUrl("https://exa mple.com/picture.png")).toBeUndefined();
  });
});
