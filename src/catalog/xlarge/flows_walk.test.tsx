// Walks the fixtures of xlarge's Wizard, Steps, and Arrange (spec 003,
// round 2). No real xlarge screen of these is captured yet, so the fixtures
// are synthetic (`tests/fixtures/xlarge/*-synthetic.json`, `source` says so).
// Each validates strictly against xlarge's catalog through `MessageProcessor`,
// then all three draw together with no errors, and every action they send is
// checked by name and context.

import { describe, expect, open, test } from "nsh/test";
import arrange from "../../../tests/fixtures/xlarge/arrange-synthetic.json";
import steps from "../../../tests/fixtures/xlarge/steps-synthetic.json";
import wizard from "../../../tests/fixtures/xlarge/wizard-synthetic.json";
import { createBasicCatalogRegistry } from "../basic";
import { CatalogRegistry } from "../../core/catalog";
import { MessageProcessor } from "../../core/processor";
import { registerXlargeCatalogComponents } from "./index";
import { HARNESS, XLARGE_CATALOG, reportedErrors, sentActions } from "./test_support";

interface Fixture {
  readonly source: string;
  readonly messages: readonly unknown[];
  /** What the action was answered with (the host's `answer` option), for `Steps`. */
  readonly answer?: unknown;
}

const FIXTURES: Readonly<Record<string, Fixture>> = { wizard, steps, arrange };
const SYNTHETIC = "synthetic, no real xlarge screen yet";

const WORDS: Record<string, string> = {
  "crm.action.open_account": "Open account",
  "crm.title.company": "Company",
  "crm.title.money": "Credit",
  "crm.field.name": "Name",
  "crm.field.city": "City",
  "crm.field.limit": "Limit",
  "crm.field.currency": "Currency",
  "onboard.step.company": "Company details",
  "onboard.step.bank": "Bank account",
  "onboard.step.invite": "Invite the team",
  "lab.block.header": "Header",
  "lab.block.patient": "Patient",
  "lab.block.results": "Results",
  "lab.block.note": "Note",
  "lab.action.add_note": "Add note",
  "audit.action.onboard.create_company": "Company details",
  "audit.action.onboard.add_bank": "Bank account",
  "audit.action.onboard.invite": "Invite the team",
  "agents.outcome.done": "Done",
  "agents.outcome.waiting": "Waiting for you",
  "agents.outcome.taken": "Taken",
  "bank.iban_invalid": "IBAN is not valid",
  "crm.field.stage": "New stage",
  "crm.action.add_stage": "Add stage",
  "action.save": "Save",
};

const ALL_MESSAGES: unknown[] = Object.values(FIXTURES).flatMap((fixture) => fixture.messages);

/** Where each of `words` first shows in `texts`, in that order. */
function positions(texts: readonly string[], words: readonly string[]): number[] {
  return words.map((word) => texts.indexOf(word));
}

describe("xlarge Wizard, Steps and Arrange fixtures", () => {
  test("each fixture is synthetic and validates strictly against xlarge's catalog", () => {
    const drawn = registerXlargeCatalogComponents(createBasicCatalogRegistry());
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      expect(fixture.source).toBe(SYNTHETIC);
      const registry = CatalogRegistry.withBasicV1();
      registry.registerInline(XLARGE_CATALOG);
      const run = new MessageProcessor({ registry, strictMode: true });
      run.processMessages(fixture.messages);
      const surface = run.getSurface(`synthetic.${name}`);
      expect(surface?.defaultCatalogId).toBe("tech.yerly.xlarge/v1");
      for (const component of surface?.components.values() ?? []) {
        expect(drawn.has(component.catalogId, component.type)).toBe(true);
      }
    }
  });

  test("all three draw together with no errors and send exactly their actions", async () => {
    const app = await open(HARNESS, {
      host: {
        params: {
          catalog: XLARGE_CATALOG,
          messages: ALL_MESSAGES,
          translations: WORDS,
          strictMode: true,
          answer: steps.answer,
        },
        handlers: { "a2ui.action": null, "a2ui.error": null, "a2ui.exception": null, "a2ui.announce": null },
      },
    });
    expect(reportedErrors(app)).toEqual([]);
    for (const words of ["1 / 2", "Company", "Name *", "City", "Next", "Company details", "Bank account", "Invite the team", "Header", "Patient", "Results", "Note", "Add note", "Save", "Reset"]) {
      expect(app.texts()).toContain(words);
    }

    // Steps, from the answer the host holds: words, each step and its outcome.
    for (const words of ["I opened the account; inviting the team is yours.", "Done", "IBAN is not valid", "Waiting for you"]) {
      expect(app.texts()).toContain(words);
    }
    await app.press("id:synthetic.steps:root:step:2:take");
    await app.press("id:synthetic.steps:root:step:2:ask:yes");
    expect(app.texts()).toContain("Taken");
    await app.press("id:synthetic.steps:root:step:0:open");

    // Wizard: next refuses an empty required field on the page.
    await app.press("id:synthetic.wizard:root:next");
    expect(app.shows("id:synthetic.wizard:name:error")).toBe(true);
    expect(app.texts()).toContain("1 / 2");
    await app.type("id:synthetic.wizard:name", "Acme @ Ankara");
    await app.press("id:synthetic.wizard:root:next");
    expect(app.texts()).toContain("2 / 2");
    expect(app.texts()).toContain("Limit *");
    expect(app.texts()).toContain("Open account");
    // Back keeps the draft.
    await app.press("id:synthetic.wizard:root:back");
    expect(app.value("id:synthetic.wizard:name")).toBe("Acme @ Ankara");
    await app.press("id:synthetic.wizard:root:next");
    await app.press("id:synthetic.wizard:root:next");
    expect(app.shows("id:synthetic.wizard:limit:error")).toBe(true);
    await app.type("id:synthetic.wizard:limit", "25000.50");
    // confirm: cancel sends nothing, yes sends the whole draft then opens `after`.
    await app.press("id:synthetic.wizard:root:next");
    expect(app.shows("id:synthetic.wizard:root:ask")).toBe(true);
    await app.press("id:synthetic.wizard:root:ask:cancel");
    await app.press("id:synthetic.wizard:root:next");
    await app.press("id:synthetic.wizard:root:ask:yes");
    expect(app.texts()).toContain("1 / 2");
    expect(app.value("id:synthetic.wizard:name")).toBe("");

    // Arrange: move Header down, show the note, add a note, save (asks), then reset (asks).
    expect(app.shows("id:synthetic.arrange:root:item:0:shown")).toBe(false);
    expect(app.value("id:synthetic.arrange:root:item:3:text")).toBe("Fasting");
    await app.press("id:synthetic.arrange:root:item:0:down");
    const moved = positions(app.texts(), ["Patient", "Header", "Results"]);
    expect(moved[0]! < moved[1]! && moved[1]! < moved[2]!).toBe(true);
    await app.press("id:synthetic.arrange:root:item:3:shown");
    await app.press("id:synthetic.arrange:root:add");
    expect(app.texts().filter((t) => t === "Note")).toHaveLength(2);
    await app.press("id:synthetic.arrange:root:save");
    await app.press("id:synthetic.arrange:root:ask:yes");
    await app.press("id:synthetic.arrange:root:reset");
    await app.press("id:synthetic.arrange:root:ask:yes");
    expect(app.texts().filter((t) => t === "Note")).toHaveLength(1);
    const restored = positions(app.texts(), ["Header", "Patient", "Results"]);
    expect(restored[0]! < restored[1]! && restored[1]! < restored[2]!).toBe(true);

    expect(sentActions(app)).toEqual([
      { name: "onboard.invite", sourceComponentId: "root", context: { emails: ["a@example.test"] } },
      { name: "screen:onboard.company", sourceComponentId: "root", context: { id: "c1" } },
      {
        name: "crm.open_account",
        sourceComponentId: "root",
        context: { name: "Acme @ Ankara", limit: "25000.50", currency: "TRY" },
      },
      { name: "screen:crm.deals", sourceComponentId: "root", context: {} },
      {
        name: "lab.layout.save",
        sourceComponentId: "root",
        context: {
          blocks: [
            { kind: "patient", label: "lab.block.patient", shown: true },
            { kind: "header", label: "lab.block.header", shown: true, kept: true },
            { kind: "results", label: "lab.block.results", shown: true, fields: ["value", "unit", "range"] },
            { key: "note-1", kind: "note", label: "lab.block.note", shown: true, removable: true, text: "Fasting" },
            { kind: "note", label: "lab.block.note", shown: true, removable: true, text: "" },
          ],
          version: 7,
        },
      },
      { name: "screen:lab.reports", sourceComponentId: "root", context: {} },
      { name: "lab.layout.reset", sourceComponentId: "root", context: { version: 7 } },
      { name: "screen:lab.reports", sourceComponentId: "root", context: {} },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });
});
