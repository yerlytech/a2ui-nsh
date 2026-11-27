/**
 * Phone walk for `examples/xl-phones/`: the customer list, the registration
 * form and the customer summary on a phone (headless, iOS or Android).
 *
 * On a real target it saves screenshots under `target/walk-phones/`; a
 * headless run draws nothing, so it only checks the three screens.
 */

import { describe, expect, open, test, type App } from "nsh/test";

const APP_ENTRY = "./App.tsx";
const SHOT_DIR = "target/walk-phones";

function openApp(screen?: "customers" | "register" | "summary"): Promise<App> {
  const params: Record<string, unknown> = { debug: true };
  if (screen !== undefined) {
    params["screen"] = screen;
  }
  return open(APP_ENTRY, { host: { params } });
}

/** The app says the system safe area it got; a headless engine reports none. */
function onDevice(app: App): boolean {
  const line = app.texts().find((text) => text.startsWith("safe="));
  if (line === undefined) {
    return false;
  }
  const match = /^safe=([0-9.]+),/.exec(line);
  return match !== null && Number(match[1]) > 0;
}

async function capture(app: App, name: string): Promise<void> {
  if (!onDevice(app)) {
    return;
  }
  await app.host.send("xl.debug", false);
  const bytes = await app.screenshot(`${SHOT_DIR}/${name}`);
  await app.host.send("xl.debug", true);
  expect(bytes.length).toBeGreaterThan(8);
  expect(bytes[0]).toBe(0x89);
  expect(bytes[1]).toBe(0x50);
  expect(bytes[2]).toBe(0x4e);
  expect(bytes[3]).toBe(0x47);
}

describe("XL phone trial", () => {
  test("opens on the customer list and touches every screen", async () => {
    const app = await openApp("customers");
    await app.waitFor("text:ERP Customers");
    expect(app.shows("text:Cedar Ridge Timber Works")).toBe(true);
    expect(app.shows("text:Alder Creek Logistics")).toBe(true);
    await capture(app, "01-customers.png");

    await app.press("text:Register");
    await app.waitFor("text:New customer");
    expect(app.shows("text:Company name *")).toBe(true);
    await capture(app, "02-register.png");

    await app.press("text:Summary");
    await app.waitFor("text:Customer summary");
    expect(app.shows("text:Cobalt Harbor Supply")).toBe(true);
    expect(app.shows("text:34,800.00")).toBe(true);
    await capture(app, "03-summary.png");

    await app.press("text:Customers");
    await app.waitFor("text:ERP Customers");
  });

  test("registration form validates, takes the keyboard and sends the draft", async () => {
    const app = await openApp("register");
    await app.waitFor("text:New customer");

    await app.press("id:register:form:submit");
    await app.waitFor("text:Required");

    await app.type("label:Company name", "Summit Valley Packaging");
    await app.type("label:Billing email", "billing@summitvalley.example");
    await app.type("label:Phone", "+1 555 010 777");
    await app.type("label:Annual value", "52000");
    await app.type("label:Notes", "New phone registration.");
    await app.wait(250);
    expect(app.value("label:Company name")).toBe("Summit Valley Packaging");
    expect(app.value("label:Billing email")).toBe("billing@summitvalley.example");
    await capture(app, "04-register-typed.png");

    await app.press("id:register:form:submit");
    await app.waitFor(
      "text:actions=1 last=crm.create_customer:Summit Valley Packaging errors=0",
    );
  });

  test("summary card scrolls by touch", async () => {
    const app = await openApp("summary");
    await app.waitFor("text:Customer summary");
    expect(app.shows("text:Open deals")).toBe(true);
    expect(app.shows("text:Quarterly revenue")).toBe(true);
    expect(app.shows("text:Net 15")).toBe(true);

    const viewport = app.layout("id:xl-scroll");
    const content = app.layout("id:summary:root");
    expect(viewport).not.toBeNull();
    expect(content).not.toBeNull();
    if (viewport !== null && content !== null) {
      expect(content.height).toBeGreaterThan(viewport.height);
    }
    await app.scroll("id:xl-scroll", 260);
    await capture(app, "05-summary-scrolled.png");
  });
});
