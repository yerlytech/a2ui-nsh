import { describe, expect, test } from "nsh/test";
import {
  BASIC_CATALOG_V1_ID,
  Catalog,
  MessageProcessor,
  buildV10BasicCatalogDocument,
  type DispatchedActionEnvelope,
} from "../../src/index";
import {
  ERP_SURFACE_ID,
  ErpCustomerAgent,
  formatCentsAsDecimalString,
  parseDollarStringToCents,
} from "./agent";

function createStrictProcessor(): {
  readonly processor: MessageProcessor;
  readonly errors: unknown[];
} {
  const errors: unknown[] = [];
  const processor = new MessageProcessor({
    catalogs: [Catalog.fromJson(buildV10BasicCatalogDocument())],
    strictMode: true,
    onError: (env) => {
      errors.push(env);
    },
  });
  return { processor, errors };
}

function makeAction(
  name: string,
  context: Record<string, unknown> = {},
): DispatchedActionEnvelope {
  return {
    version: "1.0",
    action: {
      name,
      surfaceId: ERP_SURFACE_ID,
      sourceComponentId: "test_driver",
      timestamp: "2026-11-21T00:00:00.000Z",
      context,
    },
  };
}

describe("ErpCustomerAgent (pure core + strict A2UI v1.0 schema compliance)", () => {
  test("parses and formats money in exact integer cents with half-up rounding", () => {
    expect(parseDollarStringToCents("184500")).toBe(18450000);
    expect(parseDollarStringToCents("184500.00")).toBe(18450000);
    expect(parseDollarStringToCents("12.345")).toBe(1235);
    expect(parseDollarStringToCents("12.344")).toBe(1234);
    expect(parseDollarStringToCents("0")).toBe(0);
    expect(parseDollarStringToCents("-5")).toBeNull();
    expect(parseDollarStringToCents("abc")).toBeNull();
    expect(parseDollarStringToCents("9999999999")).toBeNull();
    expect(formatCentsAsDecimalString(18450000)).toBe("184500.00");
    expect(formatCentsAsDecimalString(5)).toBe("0.05");
  });

  test("all emitted A2UI v1.0 messages pass strict MessageProcessor validation across CRUD, search, layout, loading, and error flows", () => {
    const { processor, errors } = createStrictProcessor();
    const agent = new ErpCustomerAgent();

    // Initial surface creation
    processor.processMessages(agent.buildInitialMessages());
    expect(errors).toEqual([]);
    const surface = processor.surfaces.get(ERP_SURFACE_ID)!;
    expect(surface.dataModel.get("/ui/totalCount")).toBe(5);
    expect(surface.dataModel.get("/ui/visibleCount")).toBe(5);
    expect(surface.dataModel.get("/form/name")).toBe("Cedar Ridge Timber Works");

    // Layout adaptation desktop -> compact -> desktop
    processor.processMessages(agent.setLayoutMode("compact"));
    expect(surface.components.get("workspace_split")?.type).toBe("Column");
    expect(surface.dataModel.get("/ui/layoutMode")).toBe("compact");
    processor.processMessages(agent.setLayoutMode("desktop"));
    expect(surface.components.get("workspace_split")?.type).toBe("Row");

    // Search filter + empty search + clear
    processor.processMessages(
      agent.handleAction(makeAction("search_customers", { query: "Alder" })),
    );
    expect(surface.dataModel.get("/ui/visibleCount")).toBe(1);
    processor.processMessages(
      agent.handleAction(makeAction("search_customers", { query: "no-match-xyz" })),
    );
    expect(surface.dataModel.get("/ui/visibleCount")).toBe(0);
    expect(surface.dataModel.get("/ui/emptySearch")).toEqual([
      { query: "no-match-xyz" },
    ]);
    processor.processMessages(agent.handleAction(makeAction("clear_search")));
    expect(surface.dataModel.get("/ui/visibleCount")).toBe(5);
    expect(surface.dataModel.get("/ui/emptySearch")).toEqual([]);

    // Server-side validation rejects invalid save context cleanly without mutating data
    processor.processMessages(
      agent.handleAction(
        makeAction("save_customer", {
          id: "cust-101",
          name: "A",
          email: "bad-email",
          taxId: "INVALID",
          segment: ["enterprise"],
          paymentTerms: ["net30"],
          contractStart: "2025-03-15",
          annualValueText: "100.00",
          active: true,
          notes: "",
        }),
      ),
    );
    const errBanner = surface.dataModel.get("/ui/errorBanner") as Array<{
      message: string;
    }>;
    expect(errBanner).toHaveLength(1);
    expect(errBanner[0]!.message).toContain("ERR_VALIDATION_FAILED");

    // Create + save a new invented customer
    processor.processMessages(agent.handleAction(makeAction("new_customer")));
    expect(surface.dataModel.get("/form/isNew")).toBe(true);
    expect(surface.dataModel.get("/ui/deleteModal")).toEqual([]);

    processor.processMessages(
      agent.handleAction(
        makeAction("save_customer", {
          id: "",
          name: "Pinecrest Marine Parts",
          email: "ops@pinecrest-marine.example",
          taxId: "US-64-1122334",
          segment: ["midmarket"],
          paymentTerms: ["net45"],
          contractStart: "2026-06-01",
          annualValueText: "74250.50",
          active: true,
          notes: "New seasonal account.",
        }),
      ),
    );
    expect(surface.dataModel.get("/ui/totalCount")).toBe(6);
    expect(surface.dataModel.get("/form/name")).toBe("Pinecrest Marine Parts");

    // Delete the newly created customer
    const createdId = String(surface.dataModel.get("/form/id"));
    processor.processMessages(
      agent.handleAction(makeAction("delete_customer", { customerId: createdId })),
    );
    expect(surface.dataModel.get("/ui/totalCount")).toBe(5);

    // Loading & error states
    processor.processMessages(agent.enterLoadingState());
    expect(surface.dataModel.get("/ui/loadingView")).toHaveLength(1);
    expect(surface.dataModel.get("/ui/workspaceView")).toEqual([]);
    processor.processMessages(agent.completeLoading());
    expect(surface.dataModel.get("/ui/loadingView")).toEqual([]);
    expect(surface.dataModel.get("/ui/workspaceView")).toHaveLength(1);

    processor.processMessages(agent.triggerSimulatedError(false));
    expect(surface.dataModel.get("/ui/errorBanner")).toHaveLength(1);
    processor.processMessages(agent.handleAction(makeAction("retry_load")));
    expect(surface.dataModel.get("/ui/errorBanner")).toEqual([]);

    expect(errors).toEqual([]);
    expect(surface.defaultCatalogId).toBe(BASIC_CATALOG_V1_ID);
  });
});
