import { describe, expect, open, test } from "nsh/test";
import { qrPictureUrl } from "./QrCode";
import { HARNESS, harnessOptions, reportedErrors, surfaceMessages } from "./test_support";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><path d="M4 4h7v7H4z"/></svg>';
const SECRET = "JBSWY3DPEHPK3PXP";
const OTPAUTH = `otpauth://totp/xlarge:ada?secret=${SECRET}&issuer=xlarge`;

function openedUrls(app: { host: { posts(): { name: string; data?: unknown }[] } }): string[] {
  return app.host
    .posts()
    .filter((post) => post.name === "a2ui.openUrl")
    .map((post) => (post.data as { url: string }).url);
}

describe("xlarge catalog QrCode picture", () => {
  test("SVG markup becomes an image/svg+xml data URI; other text must be a safe URL", () => {
    expect(qrPictureUrl(SVG)).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`);
    expect(qrPictureUrl(PNG)).toBe(PNG);
    expect(qrPictureUrl("javascript:alert(1)")).toBeUndefined();
    expect(qrPictureUrl(OTPAUTH)).toBeUndefined();
    expect(qrPictureUrl(undefined)).toBeUndefined();
  });
});

describe("xlarge catalog QrCode", () => {
  test("draws the server's SVG, named and captioned only by its translated label", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_qr_svg",
          [{ id: "root", component: "QrCode", src: { "@path": "/invoice/emvQr" }, label: "invoice.qr.emv" }],
          { invoice: { emvQr: SVG } },
        ),
        { "invoice.qr.emv": "TR payment code" },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_qr_svg:root")).toBe(true);
    expect(app.shows("label:TR payment code")).toBe(true);
    expect(app.texts()).toEqual(["TR payment code"]);
  });

  test("an otpauth link is never shown; it is offered as an open-in-app button", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_qr_otp",
          [{ id: "root", component: "QrCode", src: { "@path": "/qr" }, link: { "@path": "/link" } }],
          { qr: SVG, link: OTPAUTH },
        ),
        {},
        { openLinks: true },
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:s_qr_otp:root")).toBe(true);
    // No label: the host word names it, never the link.
    expect(app.shows("label:QR code")).toBe(true);
    expect(app.shows(`label:${OTPAUTH}`)).toBe(false);
    expect(app.texts()).toEqual(["QR code", "Open in app"]);
    expect(app.texts().some((t) => t.includes(SECRET) || t.includes("otpauth"))).toBe(false);

    await app.press("id:s_qr_otp:root:open");
    expect(openedUrls(app)).toEqual([OTPAUTH]);

    // The SVG failing falls back to the encoder; the link still never shows.
    await app.failImages("data:image/svg+xml*");
    expect(app.shows("id:s_qr_otp:root")).toBe(true);
    expect(app.texts().some((t) => t.includes(SECRET))).toBe(false);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("no open-in-app button without the host's openUrl, nor for a non-otpauth link", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages(
          "s_qr_noopen",
          [{ id: "root", component: "QrCode", src: { "@path": "/qr" }, link: { "@path": "/link" } }],
          { qr: SVG, link: OTPAUTH },
        ),
      ]),
    );
    expect(app.shows("id:s_qr_noopen:root:open")).toBe(false);
    expect(app.texts()).toEqual(["QR code"]);

    const web = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_qr_web",
          [{ id: "root", component: "QrCode", link: { "@path": "/link" } }],
          { link: "https://xlarge.test/pay/d1" },
        ),
        {},
        { openLinks: true },
      ),
    );
    expect(web.shows("id:s_qr_web:root:open")).toBe(false);
    expect(web.texts()).toEqual(["QR code"]);
  });

  test("draws a code from link with the pure encoder when there is no src", async () => {
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
    expect(app.shows("label:https://xlarge.test/pay/d1")).toBe(false);

    await app.host.send("a2ui.message", {
      version: "1.0",
      updateDataModel: { surfaceId: "s_qr", path: "/payLink", value: "https://xlarge.test/pay/d2" },
    });
    expect(app.shows("id:s_qr:root")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("a src picture wins over link; nothing to draw leaves a named placeholder", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages(
          "s_qr_src",
          [{ id: "root", component: "QrCode", src: { "@path": "/qr" }, link: { "@path": "/link" }, label: "crm.pay.receipt" }],
          { qr: PNG, link: "https://xlarge.test/r/1" },
        ),
        ...surfaceMessages("s_qr_empty", [{ id: "root", component: "QrCode", link: { "@path": "/none" } }]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.count("id:s_qr_src:root")).toBe(1);
    expect(app.shows("label:crm.pay.receipt")).toBe(true);
    expect(app.shows("id:s_qr_empty:root")).toBe(true);
    expect(app.shows("label:QR code")).toBe(true);
  });
});
