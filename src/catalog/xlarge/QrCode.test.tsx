import { describe, expect, open, test } from "nsh/test";
import { HARNESS, harnessOptions, reportedErrors, surfaceMessages } from "./test_support";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("xlarge catalog QrCode", () => {
  test("draws a code from link, named and captioned by its translated label", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_qr",
          [{ id: "root", component: "QrCode", link: { "@path": "/payLink" }, label: "crm.pay.scan" }],
          { payLink: "https://xlarge.test/pay/d1" },
        ),
        { "crm.pay.scan": "Scan to pay" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_qr:root")).toBe(true);
    expect(app.shows("label:Scan to pay")).toBe(true);
    expect(app.texts()).toEqual(["Scan to pay"]);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_qr", path: "/payLink", value: "https://xlarge.test/pay/d2" },
    });
    expect(app.shows("id:s_qr:root")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("src wins over link; without a label the link names the code", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages(
          "s_qr_src",
          [{ id: "root", component: "QrCode", src: { "@path": "/qr" }, link: { "@path": "/link" }, label: "crm.pay.receipt" }],
          { qr: PNG, link: "https://xlarge.test/r/1" },
        ),
        ...surfaceMessages(
          "s_qr_bare",
          [{ id: "root", component: "QrCode", link: { "@path": "/link" } }],
          { link: "https://xlarge.test/r/2" },
        ),
        ...surfaceMessages("s_qr_empty", [{ id: "root", component: "QrCode", link: { "@path": "/none" } }]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.count("id:s_qr_src:root")).toBe(1);
    expect(app.shows("label:crm.pay.receipt")).toBe(true);
    expect(app.shows("label:https://xlarge.test/r/2")).toBe(true);
    expect(app.shows("id:s_qr_bare:root:label")).toBe(false);
    // Nothing to draw: a placeholder, no error.
    expect(app.shows("id:s_qr_empty:root")).toBe(true);
  });
});
