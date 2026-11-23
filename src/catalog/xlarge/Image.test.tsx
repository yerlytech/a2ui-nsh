import { describe, expect, open, test } from "nsh/test";
import { pictureSources } from "./Image";
import { HARNESS, harnessOptions, reportedErrors, surfaceMessages } from "./test_support";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const FILES = "https://xlarge.test/api/v1/files/";
const fileUrl = (id: string) => `${FILES}${encodeURIComponent(id)}`;

describe("xlarge catalog Image sources", () => {
  test("an attachment id goes through fileUrl; a safe URL is kept as it is", () => {
    expect(pictureSources("att-1", fileUrl)).toEqual([{ index: 0, url: `${FILES}att-1` }]);
    expect(pictureSources(PNG, fileUrl)).toEqual([{ index: 0, url: PNG }]);
    expect(pictureSources(["att-1", "", 7, "att 2"], fileUrl)).toEqual([
      { index: 0, url: `${FILES}att-1` },
      { index: 1, url: `${FILES}att%202` },
    ]);
  });

  test("without fileUrl, or with an unsafe result, an id has no URL", () => {
    expect(pictureSources("att-1", undefined)).toEqual([{ index: 0, url: undefined }]);
    expect(pictureSources("att-1", () => "javascript:alert(1)")).toEqual([{ index: 0, url: undefined }]);
    expect(pictureSources("javascript:alert(1)", fileUrl)).toEqual([
      { index: 0, url: `${FILES}javascript%3Aalert(1)` },
    ]);
    expect(pictureSources(undefined, fileUrl)).toEqual([{ index: 0, url: undefined }]);
    expect(pictureSources([], fileUrl)).toEqual([{ index: 0, url: undefined }]);
  });
});

describe("xlarge catalog Image", () => {
  test("draws the picture of a bound attachment id, named by the translated label", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_image",
          [{ id: "root", component: "Image", src: { "@path": "/logo" }, label: "crm.partner.logo" }],
          { logo: "att-logo" },
        ),
        { "crm.partner.logo": "Partner logo" },
        { fileBase: FILES },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_image:root")).toBe(true);
    expect(app.shows("label:Partner logo")).toBe(true);
    expect(app.texts()).toEqual([]);

    // A failed picture leaves the named placeholder.
    await app.failImages(`${FILES}att-logo`);
    expect(app.shows("id:s_image:root")).toBe(true);
    expect(app.shows("label:Partner logo")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("draws one picture per id of a bound list", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_images",
          [{ id: "root", component: "Image", src: { "@path": "/photos" }, label: "pos.product.photos" }],
          { photos: ["att-1", "att-2", PNG] },
        ),
        { "pos.product.photos": "Product photo" },
        { fileBase: FILES },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_images:root:pictures")).toBe(true);
    expect(app.shows("id:s_images:root:0")).toBe(true);
    expect(app.shows("id:s_images:root:1")).toBe(true);
    expect(app.shows("id:s_images:root:2")).toBe(true);
    expect(app.count("label:Product photo")).toBe(3);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_images", path: "/photos", value: "att-3" },
    });
    expect(app.shows("id:s_images:root:pictures")).toBe(false);
    expect(app.shows("id:s_images:root")).toBe(true);
    expect(app.count("label:Product photo")).toBe(1);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("a bare id without fileUrl, an unsafe src, or no src leaves a named placeholder", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages(
          "s_image_id",
          [{ id: "root", component: "Image", src: { "@path": "/logo" }, label: "crm.partner.logo" }],
          { logo: "att-logo" },
        ),
        ...surfaceMessages(
          "s_image_bad",
          [{ id: "root", component: "Image", src: { "@path": "/logo" }, label: "crm.bad" }],
          { logo: "javascript:alert(1)" },
        ),
        ...surfaceMessages("s_image_none", [
          { id: "root", component: "Image", src: { "@path": "/nothing" }, label: "crm.none" },
        ]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_image_id:root")).toBe(true);
    expect(app.shows("label:crm.partner.logo")).toBe(true);
    expect(app.shows("id:s_image_bad:root")).toBe(true);
    expect(app.shows("label:crm.bad")).toBe(true);
    expect(app.shows("id:s_image_none:root")).toBe(true);
    expect(app.shows("label:crm.none")).toBe(true);
  });
});
