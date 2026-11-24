// Walks real xlarge screens (captured 2026-11-24 from xlarge's test
// `one_real_screen_shows_each_component_of_the_catalog`, a0939a12, seeded
// data) that draw the catalog's action components: `stock.adjust_form`
// (Wizard), `imports.job` (Confirm, Button), `lab_reports.layout` (Arrange,
// Preview), `agents.assistant` (Steps), `auth.own-second-step` (QrCode) and
// the download Buttons of `lab_results.performance`. The fixtures are
// `tests/fixtures/xlarge/*-captured.json`; the second-step screen's TOTP
// secret, e-mail and QR drawing are scrubbed. Each validates strictly
// against xlarge's catalog, draws with no error, and every action it sends
// is checked by name and context.

import { describe, expect, open, test } from "nsh/test";
import assistant from "../../../tests/fixtures/xlarge/agents.assistant-captured.json";
import secondStep from "../../../tests/fixtures/xlarge/auth.own-second-step-captured.json";
import job from "../../../tests/fixtures/xlarge/imports.job-captured.json";
import layout from "../../../tests/fixtures/xlarge/lab_reports.layout-captured.json";
import performance from "../../../tests/fixtures/xlarge/lab_results.performance-buttons-captured.json";
import adjust from "../../../tests/fixtures/xlarge/stock.adjust_form-captured.json";
import { createBasicCatalogRegistry } from "../basic";
import { CatalogRegistry } from "../../core/catalog";
import { MessageProcessor } from "../../core/processor";
import { registerXlargeCatalogComponents } from "./index";
import { qrPictureUrl } from "./QrCode";
import { HARNESS, XLARGE_CATALOG, harnessOptions, reportedErrors, sentActions } from "./test_support";

interface Fixture {
  readonly source: string;
  readonly messages: readonly unknown[];
}

const SCREENS: Readonly<Record<string, Fixture>> = {
  "stock.adjust_form": adjust,
  "imports.job": job,
  "lab_reports.layout": layout,
  "agents.assistant": assistant,
  "auth.own-second-step": secondStep,
  "lab_results.performance": performance,
};

const CAPTURED = "xlarge, one_real_screen_shows_each_component_of_the_catalog, screen:";

/** The data model value the fixture's first `updateDataModel` holds. */
function dataModel(fixture: Fixture): Record<string, unknown> {
  for (const message of fixture.messages) {
    const update = (message as { updateDataModel?: { value: Record<string, unknown> } }).updateDataModel;
    if (update !== undefined) {
      return update.value;
    }
  }
  return {};
}

function previewAsks(app: { host: { posts(): { name: string; data?: unknown }[] } }): unknown[] {
  return app.host
    .posts()
    .filter((post) => post.name === "a2ui.preview")
    .map((post) => post.data);
}

describe("xlarge's captured flow screens", () => {
  test("each capture validates strictly against xlarge's catalog and every component is drawn", () => {
    const drawn = registerXlargeCatalogComponents(createBasicCatalogRegistry());
    for (const [screen, fixture] of Object.entries(SCREENS)) {
      expect(fixture.source.startsWith(`${CAPTURED}${screen}, a0939a12, 2026-11-24`)).toBe(true);
      const registry = CatalogRegistry.withBasicV1();
      registry.registerInline(XLARGE_CATALOG);
      const run = new MessageProcessor({ registry, strictMode: true });
      run.processMessages(fixture.messages);
      const surface = run.getSurface(screen);
      expect(surface?.defaultCatalogId).toBe("tech.yerly.xlarge/v1");
      for (const component of surface?.components.values() ?? []) {
        expect(drawn.has(component.catalogId, component.type)).toBe(true);
      }
    }
  });

  test("all six screens draw together with no render error", async () => {
    const all = Object.values(SCREENS).flatMap((fixture) => fixture.messages);
    const app = await open(HARNESS, harnessOptions(all));
    expect(reportedErrors(app)).toEqual([]);
    for (const words of [
      "1 / 2",
      "imports.question.give_up",
      "lab_reports.block.header",
      "agents.field.words *",
      "auth.field.second_step_qr",
      "lab_results.action.download_xlsx",
    ]) {
      expect(app.texts()).toContain(words);
    }
  });

  test("Button: the download buttons send their export action, imports.job's load follows after", async () => {
    const app = await open(HARNESS, harnessOptions([...performance.messages, ...job.messages]));
    await app.press("id:lab_results.performance:download");
    await app.press("id:lab_results.performance:weeks_csv");
    await app.press("id:imports.job:load");
    expect(sentActions(app)).toEqual([
      { name: "export:lab_results.performance?shape=xlsx", sourceComponentId: "download", context: {} },
      { name: "export:lab_results.performance?shape=csv&table=weeks", sourceComponentId: "weeks_csv", context: {} },
      { name: "imports.commit", sourceComponentId: "load", context: {} },
      { name: "screen:imports.jobs", sourceComponentId: "load", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("Confirm: yes sends imports.cancel and follows after", async () => {
    const app = await open(HARNESS, harnessOptions(job.messages));
    expect(app.texts()).toContain("imports.action.give_up");
    await app.press("id:imports.job:give_up:yes");
    expect(app.shows("id:imports.job:give_up")).toBe(false);
    expect(sentActions(app)).toEqual([
      { name: "imports.cancel", sourceComponentId: "give_up", context: {} },
      { name: "screen:imports.jobs", sourceComponentId: "give_up", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("Confirm: cancel sends its cancel action and nothing else", async () => {
    const app = await open(HARNESS, harnessOptions(job.messages));
    await app.press("id:imports.job:give_up:cancel");
    expect(app.shows("id:imports.job:give_up")).toBe(false);
    expect(sentActions(app)).toEqual([
      { name: "screen:imports.jobs", sourceComponentId: "give_up", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("Wizard: pages through, keeps the draft, asks, sends the draft and follows after", async () => {
    const app = await open(HARNESS, harnessOptions(adjust.messages));
    expect(app.texts()).toContain("1 / 2");
    expect(app.texts()).toContain("stock.step.difference");
    // The capture marks no field required (no `checks`): an empty page goes on.
    for (const label of ["stock.field.product", "stock.field.from", "stock.field.to", "stock.field.qty"]) {
      expect(app.texts()).toContain(label);
    }
    await app.press("id:stock.adjust_form:root:next");
    expect(app.texts()).toContain("2 / 2");
    expect(app.texts()).toContain("stock.adjust.asked_for");
    await app.press("id:stock.adjust_form:root:back");

    // Record fields read their options from the data model (`from`), sent by `value`.
    await app.press("id:stock.adjust_form:sku:trigger");
    await app.press("text:FASON");
    await app.press("id:stock.adjust_form:from:trigger");
    await app.press("text:STOCK");
    await app.press("id:stock.adjust_form:to:trigger");
    await app.press("text:SCRAP");
    await app.type("id:stock.adjust_form:qty", "2.5");
    await app.press("id:stock.adjust_form:root:next");
    expect(app.texts()).toContain("stock.action.ask_to_adjust");
    await app.press("id:stock.adjust_form:root:back");
    expect(app.value("id:stock.adjust_form:qty")).toBe("2.5");
    await app.press("id:stock.adjust_form:root:next");

    // confirm: cancel sends nothing; yes sends the draft, then opens `after` as named.
    await app.press("id:stock.adjust_form:root:next");
    expect(app.shows("id:stock.adjust_form:root:ask")).toBe(true);
    await app.press("id:stock.adjust_form:root:ask:cancel");
    expect(sentActions(app)).toEqual([]);
    await app.press("id:stock.adjust_form:root:next");
    await app.press("id:stock.adjust_form:root:ask:yes");
    expect(app.texts()).toContain("1 / 2");
    expect(sentActions(app)).toEqual([
      {
        name: "stock.ask_to_adjust",
        sourceComponentId: "root",
        context: { sku: "FASON", from: "STOCK", to: "SCRAP", qty: "2.5" },
      },
      { name: "screen:stock.list", sourceComponentId: "root", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("Arrange and Preview: the layout's blocks move, toggle and save; the preview asks with them", async () => {
    const blocks = (dataModel(layout)["layout"] as { blocks: Record<string, unknown>[] }).blocks;
    const app = await open(
      HARNESS,
      harnessOptions(layout.messages, {}, { previewBase: "https://example.test/preview/", previewPauseMs: 50 }),
    );
    expect(reportedErrors(app)).toEqual([]);
    const export_ = "export:lab_reports.report?shape=pdf";

    // The Preview is in no Form: it reads the screen's draft, where the
    // Arrange puts its list under `field` ("blocks").
    await app.wait(120);
    expect(previewAsks(app)).toEqual([{ action: export_, body: { draft: { blocks } } }]);
    expect(app.shows("id:lab_reports.layout:preview:page")).toBe(true);

    // `about` names the sample field, also in no Form.
    await app.press("id:lab_reports.layout:sample:trigger");
    await app.press("text:S-000001");
    await app.wait(120);
    expect(previewAsks(app).at(-1)).toEqual({
      action: export_,
      body: { draft: { blocks }, about: "01M86HRW5RJ7JM8XAXC5075KCE" },
    });

    // The table block is kept: no shown toggle. Move the header below it,
    // hide sampling, add a text block and write in it.
    expect(app.shows("id:lab_reports.layout:blocks:item:1:shown")).toBe(false);
    expect(app.shows("id:lab_reports.layout:blocks:item:0:shown")).toBe(true);
    await app.press("id:lab_reports.layout:blocks:item:0:down");
    expect(app.shows("id:lab_reports.layout:blocks:item:0:shown")).toBe(false);
    await app.press("id:lab_reports.layout:blocks:item:2:shown");
    await app.press("id:lab_reports.layout:blocks:add");
    expect(app.texts()).toContain("lab_reports.block.text");
    await app.type("id:lab_reports.layout:blocks:item:7:text", "Sampled by the customer");
    const arranged = [
      blocks[1],
      blocks[0],
      { ...blocks[2], shown: false },
      ...blocks.slice(3),
      { kind: "text", label: "lab_reports.block.text", shown: true, removable: true, text: "Sampled by the customer" },
    ];
    await app.wait(120);
    expect(previewAsks(app).at(-1)).toEqual({
      action: export_,
      body: { draft: { blocks: arranged }, about: "01M86HRW5RJ7JM8XAXC5075KCE" },
    });

    // Save sends the list under `field` with `version` (0), then `after`;
    // reset sends `reset` with `version`, then `after`, and restores the list.
    await app.press("id:lab_reports.layout:blocks:save");
    await app.press("id:lab_reports.layout:blocks:reset");
    expect(app.shows("id:lab_reports.layout:blocks:item:7")).toBe(false);
    expect(app.shows("id:lab_reports.layout:blocks:item:1:shown")).toBe(false);
    expect(sentActions(app)).toEqual([
      { name: "lab_reports.arrange", sourceComponentId: "blocks", context: { blocks: arranged, version: 0 } },
      { name: "screen:lab_reports.layout", sourceComponentId: "blocks", context: {} },
      { name: "lab_reports.reset_layout", sourceComponentId: "blocks", context: { version: 0 } },
      { name: "screen:lab_reports.layout", sourceComponentId: "blocks", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("Steps: draws the answer under the capture's `answer` key through the answer() seam", async () => {
    // Not captured: the screen holds no answer (one comes back only when
    // `agents.ask` is sent). This is the shape of xlarge's `AgentStep`
    // under the key the capture names (`answer = "steps"`).
    const answer = {
      words: "I asked for the stock move; the deal is yours to save.",
      steps: [
        {
          action: "stock.ask_to_adjust",
          input: { sku: "FASON", from: "STOCK", to: "SCRAP", qty: "2" },
          outcome: "done",
          opens: { screen: "screen:stock.list", about: "01M86HRKPGXJ50RMYAZAXDE5D7" },
        },
        { action: "crm.deal.save", input: { id: "d1" }, outcome: "waiting" },
      ],
    };
    const app = await open(HARNESS, harnessOptions(assistant.messages, {}, { answer }));
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toContain(answer.words);
    expect(app.texts()).toContain("agents.outcome.done");
    expect(app.texts()).toContain("agents.outcome.waiting");
    await app.press("id:agents.assistant:steps:step:1:take");
    await app.press("id:agents.assistant:steps:step:1:ask:yes");
    expect(app.texts()).toContain("agents.outcome.taken");
    await app.press("id:agents.assistant:steps:step:0:open");
    expect(sentActions(app)).toEqual([
      { name: "crm.deal.save", sourceComponentId: "steps", context: { id: "d1" } },
      { name: "screen:stock.list", sourceComponentId: "steps", context: { id: "01M86HRKPGXJ50RMYAZAXDE5D7" } },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("Steps: without an answer the captured screen draws no step", async () => {
    const app = await open(HARNESS, harnessOptions(assistant.messages));
    expect(app.shows("id:agents.assistant:steps:step:0")).toBe(false);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("QrCode: draws the server's SVG and never shows the link", async () => {
    const setup = dataModel(secondStep)["setup"] as { link: string; qr: string };
    // The capture's SVG starts with an XML declaration; it is still drawn as
    // an SVG data URI.
    expect(setup.qr.startsWith("<?xml")).toBe(true);
    expect(qrPictureUrl(setup.qr)?.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    const app = await open(HARNESS, harnessOptions(secondStep.messages, {}, { openLinks: true }));
    expect(reportedErrors(app)).toEqual([]);
    expect(app.shows("id:auth.own-second-step:qr")).toBe(true);
    expect(app.shows("label:auth.field.second_step_qr")).toBe(true);
    expect(app.texts().some((t) => t.includes("otpauth") || t.includes("secret=") || t.includes("example.test"))).toBe(false);
    expect(app.shows(`label:${setup.link}`)).toBe(false);
    // The first-code form refuses an empty code, then sends it; the back
    // Button sends its screen action. (The Form's `after` is the Form
    // renderer's, walked with the display screens.)
    await app.press("id:auth.own-second-step:enter:submit");
    expect(app.shows("id:auth.own-second-step:app_code:error")).toBe(true);
    await app.type("id:auth.own-second-step:app_code", "123456");
    await app.press("id:auth.own-second-step:enter:submit");
    await app.press("id:auth.own-second-step:back");
    const sent = sentActions(app);
    expect(sent[0]).toEqual({ name: "auth.second_step_on", sourceComponentId: "enter", context: { appCode: "123456" } });
    expect(sent.at(-1)).toEqual({ name: "screen:auth.account", sourceComponentId: "back", context: {} });
    expect(reportedErrors(app)).toEqual([]);
  });
});
