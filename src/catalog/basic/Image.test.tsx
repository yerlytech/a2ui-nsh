import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";
import { sanitizeMediaUrl } from "./media_url";

const HARNESS = "../../renderer/test_harness.tsx";
// Minimal 1x1 transparent PNG data URI (requires no network capability).
const SAMPLE_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("Basic Catalog Image", () => {
  test("sanitizes allowed media URLs and rejects unsafe schemes", () => {
    expect(sanitizeMediaUrl("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
    expect(sanitizeMediaUrl("http://example.com/a.jpg")).toBe(
      "http://example.com/a.jpg",
    );
    expect(sanitizeMediaUrl(SAMPLE_PNG_DATA_URI)).toBe(SAMPLE_PNG_DATA_URI);
    expect(sanitizeMediaUrl("asset:/images/logo.png")).toBe(
      "asset:/images/logo.png",
    );

    expect(sanitizeMediaUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeMediaUrl("file:///etc/passwd")).toBeUndefined();
    expect(sanitizeMediaUrl("data:text/html,<script>1</script>")).toBeUndefined();
    expect(sanitizeMediaUrl("//evil.example/a.png")).toBeUndefined();
    expect(sanitizeMediaUrl("   ")).toBeUndefined();
  });

  test("renders variants, fits, description fallback, and @accessibility.label override", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_img",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  avatarUrl: SAMPLE_PNG_DATA_URI,
                  altText: "Customer Avatar",
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["img_desc", "img_override", "img_unsafe"],
                  },
                  {
                    id: "img_desc",
                    component: "Image",
                    url: { "@path": "/avatarUrl" },
                    description: { "@path": "/altText" },
                    variant: "avatar",
                    fit: "cover",
                  },
                  {
                    id: "img_override",
                    component: "Image",
                    url: SAMPLE_PNG_DATA_URI,
                    description: "Ignored Fallback",
                    variant: "header",
                    fit: "scaleDown",
                    "@accessibility": {
                      label: "Banner Override",
                      description: "Detailed banner context",
                    },
                  },
                  {
                    id: "img_unsafe",
                    component: "Image",
                    url: "javascript:alert(1)",
                    description: "Blocked Image",
                    variant: "icon",
                    fit: "contain",
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("id:s_img:img_desc")).toBe(true);
    expect(app.shows("label:Customer Avatar")).toBe(true);
    expect(app.shows("label:Banner Override")).toBe(true);
    expect(app.shows("label:Ignored Fallback")).toBe(false);
    // Unsafe URL falls back cleanly without crashing while keeping accessibility label.
    expect(app.shows("id:s_img:img_unsafe")).toBe(true);
    expect(app.shows("label:Blocked Image")).toBe(true);

    // Dynamic description updates reactively.
    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: {
        surfaceId: "s_img",
        path: "/altText",
        value: "Updated Avatar",
      },
    });
    expect(app.shows("label:Updated Avatar")).toBe(true);
  });

  test("falls back gracefully when image loading fails or network capability is denied", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_img_err",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Image",
                    url: "https://cdn.example.com/photo.png",
                    description: "Remote Photo",
                    variant: "smallFeature",
                    fit: "contain",
                  },
                ],
              },
            },
          ],
        },
      },
    });

    await app.failImages("https://cdn.example.com/*");
    expect(app.shows("id:s_img_err:root")).toBe(true);
    expect(app.shows("label:Remote Photo")).toBe(true);
  });
});
