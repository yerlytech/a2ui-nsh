import { describe, expect, open, test } from "nsh/test";
import { HARNESS, harnessOptions, reportedErrors, surfaceMessages } from "./test_support";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("xlarge catalog Image", () => {
  test("draws the bound src with the translated label as its name", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_image",
          [{ id: "root", component: "Image", src: { "@path": "/logo" }, label: "crm.partner.logo" }],
          { logo: PNG },
        ),
        { "crm.partner.logo": "Partner logo" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_image:root")).toBe(true);
    expect(app.shows("label:Partner logo")).toBe(true);
  });

  test("an unsafe or missing src leaves a named placeholder", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages(
          "s_image_bad",
          [{ id: "root", component: "Image", src: { "@path": "/logo" }, label: "crm.partner.logo" }],
          { logo: "javascript:alert(1)" },
        ),
        ...surfaceMessages("s_image_none", [
          { id: "root", component: "Image", src: { "@path": "/nothing" }, label: "crm.none" },
        ]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_image_bad:root")).toBe(true);
    expect(app.shows("label:crm.partner.logo")).toBe(true);
    expect(app.shows("id:s_image_none:root")).toBe(true);
    expect(app.shows("label:crm.none")).toBe(true);
  });
});
