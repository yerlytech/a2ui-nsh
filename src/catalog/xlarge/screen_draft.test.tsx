import { describe, expect, open, test } from "nsh/test";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
} from "../../core/catalog";
import { A2uiStore, type SurfaceSignalStore } from "../../store/surface_store";
import { screenDraft } from "./screen_draft";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  sentActions,
  surfaceMessages,
} from "./test_support";

type Opened = Awaited<ReturnType<typeof open>>;

function makeSurface(surfaceId: string): SurfaceSignalStore {
  const store = new A2uiStore({
    catalogs: [Catalog.fromJson(buildV10BasicCatalogDocument())],
    strictMode: false,
  });
  store.processMessages([
    { version: "1.0", createSurface: { surfaceId, catalogId: BASIC_CATALOG_V1_ID } },
  ]);
  const surface = store.getSurface(surfaceId);
  if (surface === undefined) {
    throw new Error(`surface ${surfaceId} was not created`);
  }
  return surface;
}

async function readData(app: Opened, surfaceId: string, path: string): Promise<unknown> {
  await app.host.send("a2ui.readData", { surfaceId, path });
  const post = app.host.posts().filter((entry) => entry.name === "a2ui.data").at(-1);
  return (post?.data as { value?: unknown } | undefined)?.value;
}

describe("xlarge screen draft", () => {
  test("one screen draft per store: the same store returns the same draft and a second store keeps its own", () => {
    const first = makeSurface("s_draft_one");
    const second = makeSurface("s_draft_two");

    expect(screenDraft(first)).toBe(screenDraft(first));
    expect(screenDraft(first)).not.toBe(screenDraft(second));

    screenDraft(first).set("sample", "S-1");
    expect(screenDraft(first).values()).toEqual({ sample: "S-1" });
    expect(screenDraft(second).values()).toEqual({});
  });

  test("outside any Form the wrapper gives an xlarge component the surface screen draft, where a loose Field writes and a Preview reads", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_screen_draft", [
          { id: "root", component: "Card", children: ["sample", "page"] },
          { id: "sample", component: "Field", field: "sample", label: "f.sample" },
          { id: "page", component: "Preview", draft: ["sample"], about: "sample" },
        ]),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);

    await app.type("id:s_screen_draft:sample", "S-1");
    expect(app.value("id:s_screen_draft:sample")).toBe("S-1");
    // The Preview reads the screen draft (FormDraftContext from screenDraft).
    expect(app.shows("id:s_screen_draft:page:line:sample")).toBe(true);
    expect(app.texts()).toContain("S-1");
    expect(reportedErrors(app)).toEqual([]);
  });

  test("inside a Form or a Wizard the wrapper leaves the form draft in charge and the screen draft empty", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages("s_form", [
          { id: "root", component: "Card", children: ["form", "form_page"] },
          { id: "form", component: "Form", submit: "form.save", children: ["form_name"] },
          { id: "form_name", component: "Field", field: "name", label: "f.name" },
          { id: "form_page", component: "Preview", draft: ["name"], about: "name" },
        ]),
        ...surfaceMessages("s_wizard", [
          { id: "root", component: "Card", children: ["wizard", "wizard_page"] },
          {
            id: "wizard",
            component: "Wizard",
            submit: "wizard.save",
            children: ["wizard_body"],
          },
          { id: "wizard_body", component: "Card", children: ["wizard_name"] },
          { id: "wizard_name", component: "Field", field: "name", label: "f.name" },
          { id: "wizard_page", component: "Preview", draft: ["name"], about: "name" },
        ]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);

    await app.type("id:s_form:form_name", "Ada");
    await app.type("id:s_wizard:wizard_name", "Grace");
    expect(app.value("id:s_form:form_name")).toBe("Ada");
    expect(app.value("id:s_wizard:wizard_name")).toBe("Grace");
    // Outside the Form and the Wizard, the screen draft still holds nothing.
    expect(app.texts().filter((text) => text === "—")).toHaveLength(2);

    await app.press("id:s_form:form:submit");
    await app.press("id:s_wizard:wizard:next");
    expect(sentActions(app)).toEqual([
      { name: "form.save", sourceComponentId: "form", context: { name: "Ada" } },
      { name: "wizard.save", sourceComponentId: "wizard", context: { name: "Grace" } },
    ]);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("two outermost components on one surface share the screen draft, so a loose Field and a Preview naming it see the same value", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_shared_draft", [
          { id: "root", component: "Card", children: ["left", "right", "page"] },
          { id: "left", component: "Field", field: "sample", label: "f.left" },
          { id: "right", component: "Field", field: "sample", label: "f.right" },
          { id: "page", component: "Preview", draft: ["sample"], about: "sample" },
        ]),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);

    await app.type("id:s_shared_draft:left", "S-1");
    expect(app.value("id:s_shared_draft:left")).toBe("S-1");
    expect(app.value("id:s_shared_draft:right")).toBe("S-1");
    expect(app.texts()).toContain("S-1");
    expect(app.shows("id:s_shared_draft:page:line:sample")).toBe(true);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("the screen draft never writes into the surface data model", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages("s_model", [
          { id: "root", component: "Card", children: ["sample", "page"] },
          { id: "sample", component: "Field", field: "sample", label: "f.sample" },
          { id: "page", component: "Preview", draft: ["sample"], about: "sample" },
        ]),
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    const rootBefore = await readData(app, "s_model", "/");

    await app.type("id:s_model:sample", "S-1");
    expect(app.value("id:s_model:sample")).toBe("S-1");
    expect(await readData(app, "s_model", "/sample")).toBeUndefined();
    expect(await readData(app, "s_model", "/")).toEqual(rootBefore);
    expect(reportedErrors(app)).toEqual([]);
  });

  test("two surfaces drawn side by side keep separate screen drafts", async () => {
    const page = (surfaceId: string): unknown[] =>
      surfaceMessages(surfaceId, [
        { id: "root", component: "Card", children: ["note", "page"] },
        { id: "note", component: "Field", field: "note", label: "f.note" },
        { id: "page", component: "Preview", draft: ["note"], about: "note" },
      ]);
    const app = await open(HARNESS, harnessOptions([...page("s_one"), ...page("s_two")]));
    expect(reportedErrors(app)).toEqual([]);

    await app.type("id:s_one:note", "first");
    expect(app.value("id:s_one:note")).toBe("first");
    expect(app.value("id:s_two:note")).toBe("");
    expect(app.texts().filter((text) => text === "first")).toHaveLength(1);
    expect(app.texts().filter((text) => text === "—")).toHaveLength(1);
    expect(reportedErrors(app)).toEqual([]);
  });
});
