/**
 * Pure TypeScript simulated ERP backend agent for `examples/erp-customers/`.
 *
 * Design Rule 3 (Pure core, thin shell): zero `nsh` or I/O imports.
 * Communicates with the renderer exclusively via A2UI v1.0 JSON envelopes
 * (`createSurface`, `updateComponents`, `updateDataModel` outbound;
 * `action` envelopes inbound).
 */

import type { DispatchedActionEnvelope } from "../../src/core/actions";
import type { JsonObject, JsonValue } from "../../src/core/json_schema";
import seedCustomersJson from "./a2ui/seed_customers.json";
import surfaceTemplateJson from "./a2ui/surface.json";

export const ERP_SURFACE_ID = "erp_customers" as const;

export type CustomerSegment = "enterprise" | "midmarket" | "smb";
export type PaymentTerms = "net15" | "net30" | "net45" | "net60";
export type LayoutMode = "desktop" | "compact";
export type InitialScreenState = "ready" | "loading" | "error";

export interface CustomerRecord {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly taxId: string;
  readonly segment: CustomerSegment;
  readonly paymentTerms: PaymentTerms;
  readonly contractStart: string;
  /** Stored as exact integer cents (Design Rule 5: never float for money). */
  readonly annualValueCents: number;
  readonly currency: string;
  readonly active: boolean;
  readonly notes: string;
}

export interface ErpAgentOptions {
  readonly initialCustomers?: readonly CustomerRecord[];
  readonly initialState?: InitialScreenState;
  readonly initialLayoutMode?: LayoutMode;
  readonly todayIso?: () => string;
}

const SEGMENT_LABELS: Readonly<Record<CustomerSegment, string>> = {
  enterprise: "Enterprise",
  midmarket: "Mid-Market",
  smb: "SMB",
};

const VALID_SEGMENTS = new Set<CustomerSegment>([
  "enterprise",
  "midmarket",
  "smb",
]);

const VALID_PAYMENT_TERMS = new Set<PaymentTerms>([
  "net15",
  "net30",
  "net45",
  "net60",
]);

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const TAX_ID_RE = /^[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ANNUAL_VALUE_CENTS = 100_000_000 * 100;
const MAX_NOTES_LENGTH = 280;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 80;

/** Parses a decimal USD string into exact integer cents using half-up rounding (Design Rule 5). */
export function parseDollarStringToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    return null;
  }
  const parts = trimmed.split(".");
  const whole = Number(parts[0]);
  if (!Number.isSafeInteger(whole) || whole < 0) {
    return null;
  }
  const fracRaw = parts[1] ?? "";
  const padded = fracRaw.padEnd(3, "0");
  const centsPart = Number(padded.slice(0, 2));
  const thirdDigit = Number(padded.slice(2, 3));
  const roundedCents = centsPart + (thirdDigit >= 5 ? 1 : 0);
  const totalCents = whole * 100 + roundedCents;
  if (!Number.isSafeInteger(totalCents) || totalCents > MAX_ANNUAL_VALUE_CENTS) {
    return null;
  }
  return totalCents;
}

/** Formats integer cents as a fixed 2-decimal string (e.g., `18450000` -> `"184500.00"`). */
export function formatCentsAsDecimalString(cents: number): string {
  const clamped = Math.max(0, Math.round(cents));
  const whole = Math.floor(clamped / 100);
  const rem = clamped % 100;
  return `${whole}.${String(rem).padStart(2, "0")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadDefaultSeedCustomers(): CustomerRecord[] {
  const rawList = seedCustomersJson as ReadonlyArray<Record<string, unknown>>;
  return rawList.map((item) => ({
    id: String(item["id"]),
    name: String(item["name"]),
    email: String(item["email"]),
    taxId: String(item["taxId"]),
    segment: item["segment"] as CustomerSegment,
    paymentTerms: item["paymentTerms"] as PaymentTerms,
    contractStart: String(item["contractStart"]),
    annualValueCents: Number(item["annualValueCents"]),
    currency: String(item["currency"]),
    active: Boolean(item["active"]),
    notes: String(item["notes"]),
  }));
}

interface ParsedCustomerDraft {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly taxId: string;
  readonly segment: CustomerSegment;
  readonly paymentTerms: PaymentTerms;
  readonly contractStart: string;
  readonly annualValueCents: number;
  readonly active: boolean;
  readonly notes: string;
}

function extractFirstChoice(value: unknown): string {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

/** Server-side boundary validation for `save_customer` action context (Design Rules 4, 7, 10). */
function validateSaveContext(
  ctx: Record<string, unknown>,
): { readonly ok: true; readonly draft: ParsedCustomerDraft } | { readonly ok: false; readonly message: string } {
  const id = typeof ctx["id"] === "string" ? ctx["id"].trim() : "";
  const name = typeof ctx["name"] === "string" ? ctx["name"].trim() : "";
  const email = typeof ctx["email"] === "string" ? ctx["email"].trim() : "";
  const taxId = typeof ctx["taxId"] === "string" ? ctx["taxId"].trim() : "";
  const notes = typeof ctx["notes"] === "string" ? ctx["notes"] : "";
  const contractStart =
    typeof ctx["contractStart"] === "string" ? ctx["contractStart"].trim() : "";
  const annualValueText =
    typeof ctx["annualValueText"] === "string"
      ? ctx["annualValueText"]
      : typeof ctx["annualValueText"] === "number"
        ? String(ctx["annualValueText"])
        : "";
  const segmentRaw = extractFirstChoice(ctx["segment"]);
  const paymentTermsRaw = extractFirstChoice(ctx["paymentTerms"]);
  const active = Boolean(ctx["active"]);

  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      message: `ERR_VALIDATION_FAILED: Customer name must be ${MIN_NAME_LENGTH}–${MAX_NAME_LENGTH} characters.`,
    };
  }
  if (!EMAIL_RE.test(email)) {
    return {
      ok: false,
      message: "ERR_VALIDATION_FAILED: Enter a valid billing email address.",
    };
  }
  if (!TAX_ID_RE.test(taxId)) {
    return {
      ok: false,
      message: "ERR_VALIDATION_FAILED: Tax ID must match format XX-00-0000000.",
    };
  }
  if (!VALID_SEGMENTS.has(segmentRaw as CustomerSegment)) {
    return {
      ok: false,
      message: "ERR_VALIDATION_FAILED: Select a valid customer segment.",
    };
  }
  if (!VALID_PAYMENT_TERMS.has(paymentTermsRaw as PaymentTerms)) {
    return {
      ok: false,
      message: "ERR_VALIDATION_FAILED: Select valid payment terms.",
    };
  }
  if (!ISO_DATE_RE.test(contractStart)) {
    return {
      ok: false,
      message: "ERR_VALIDATION_FAILED: Contract start must be an ISO date (YYYY-MM-DD).",
    };
  }
  const annualValueCents = parseDollarStringToCents(annualValueText);
  if (annualValueCents === null) {
    return {
      ok: false,
      message: "ERR_VALIDATION_FAILED: Annual contract value must be a valid non-negative amount.",
    };
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return {
      ok: false,
      message: `ERR_VALIDATION_FAILED: Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`,
    };
  }

  return {
    ok: true,
    draft: {
      id,
      name,
      email,
      taxId,
      segment: segmentRaw as CustomerSegment,
      paymentTerms: paymentTermsRaw as PaymentTerms,
      contractStart,
      annualValueCents,
      active,
      notes,
    },
  };
}

/**
 * Pure in-memory ERP Customers agent producing A2UI v1.0 JSON envelopes.
 */
export class ErpCustomerAgent {
  private customers: CustomerRecord[];
  private selectedId: string | null;
  private isCreatingNew = false;
  private _searchQuery = "";
  private _layoutMode: LayoutMode;
  private isLoading = false;
  private failNextSave = false;
  private statusMessage: string | null = null;
  private errorMessage: string | null = null;
  private nextIdCounter: number;
  private modalRevision = 1;
  private readonly todayIso: () => string;

  constructor(options: ErpAgentOptions = {}) {
    this.customers = options.initialCustomers
      ? options.initialCustomers.map((c) => ({ ...c }))
      : loadDefaultSeedCustomers();
    this.selectedId = this.customers[0]?.id ?? null;
    this.isCreatingNew = this.selectedId === null;
    this._layoutMode = options.initialLayoutMode ?? "desktop";
    this.todayIso = options.todayIso ?? (() => "2026-11-21");
    this.nextIdCounter = 100 + this.customers.length + 1;

    if (options.initialState === "loading") {
      this.isLoading = true;
    } else if (options.initialState === "error") {
      this.errorMessage =
        "Unable to sync customer records with the ERP backend (ERR_SERVER_UNAVAILABLE). Retry when ready.";
    }
  }

  get searchQuery(): string {
    return this._searchQuery;
  }

  get layoutMode(): LayoutMode {
    return this._layoutMode;
  }

  get loading(): boolean {
    return this.isLoading;
  }

  /** Returns the current authoritative customer list snapshot (for tests). */
  listCustomers(): readonly CustomerRecord[] {
    return this.customers.map((c) => ({ ...c }));
  }

  /** Emits the initial A2UI v1.0 `createSurface` message derived from `a2ui/surface.json`. */
  buildInitialMessages(): JsonObject[] {
    const surfaceMsg = cloneJson(surfaceTemplateJson) as unknown as JsonObject;
    const createSurface = surfaceMsg["createSurface"] as Record<string, unknown>;
    createSurface["dataModel"] = this.buildDataModel();

    if (this._layoutMode === "compact") {
      const components = createSurface["components"] as Array<Record<string, unknown>>;
      const stackIds = new Set([
        "workspace_split",
        "header_row",
        "status_banner_row",
        "error_banner_row",
      ]);
      for (const comp of components) {
        if (typeof comp["id"] === "string" && stackIds.has(comp["id"])) {
          comp["component"] = "Column";
          comp["align"] = "stretch";
          delete comp["justify"];
        }
      }
    }

    return [surfaceMsg];
  }

  /** Emits A2UI v1.0 messages adapting responsive containers between `Row` (desktop) and `Column` (compact). */
  setLayoutMode(mode: LayoutMode): JsonObject[] {
    if (this._layoutMode === mode) {
      return [];
    }
    this._layoutMode = mode;
    const isDesktop = mode === "desktop";
    return [
      {
        version: "1.0",
        updateComponents: {
          surfaceId: ERP_SURFACE_ID,
          components: [
            {
              id: "workspace_split",
              component: isDesktop ? "Row" : "Column",
              align: isDesktop ? "start" : "stretch",
              children: ["list_pane", "detail_pane"],
            },
            {
              id: "header_row",
              component: isDesktop ? "Row" : "Column",
              ...(isDesktop ? { justify: "spaceBetween" } : {}),
              align: isDesktop ? "center" : "stretch",
              children: ["header_title_col", "header_actions_row"],
            },
            {
              id: "status_banner_row",
              component: isDesktop ? "Row" : "Column",
              ...(isDesktop ? { justify: "spaceBetween" } : {}),
              align: isDesktop ? "center" : "stretch",
              children: ["status_banner_left", "status_dismiss_btn"],
            },
            {
              id: "error_banner_row",
              component: isDesktop ? "Row" : "Column",
              ...(isDesktop ? { justify: "spaceBetween" } : {}),
              align: isDesktop ? "center" : "stretch",
              children: ["error_banner_left", "error_banner_actions"],
            },
          ],
        },
      },
      this.updateData("/ui/layoutMode", mode),
    ];
  }

  /** Handles an A2UI v1.0 outbound `action` envelope and returns A2UI v1.0 messages to apply. */
  handleAction(envelope: DispatchedActionEnvelope): JsonObject[] {
    const { name, context } = envelope.action;
    const ctx = isRecord(context) ? context : {};

    switch (name) {
      case "select_customer":
        return this.handleSelectCustomer(ctx);
      case "new_customer":
        return this.handleNewCustomer();
      case "save_customer":
        return this.handleSaveCustomer(ctx);
      case "delete_customer":
        return this.handleDeleteCustomer(ctx);
      case "cancel_delete":
        return this.closeModalMessages();
      case "search_customers":
        return this.handleSearch(typeof ctx["query"] === "string" ? ctx["query"] : "");
      case "clear_search":
        return this.handleSearch("");
      case "reload_customers":
        return this.enterLoadingState("Refreshing customer directory...");
      case "complete_loading":
        return this.completeLoading();
      case "simulate_server_error":
        return this.triggerSimulatedError(
          typeof ctx["failNextSave"] === "boolean" ? ctx["failNextSave"] : false,
        );
      case "retry_load":
        return this.handleRetry();
      case "dismiss_banner":
        return this.handleDismissBanner(ctx["kind"]);
      case "open_delete_modal":
        return [];
      default:
        return [];
    }
  }

  /** Triggers loading skeleton mode directly (used by reload action or test scenarios). */
  enterLoadingState(message = "Loading customers..."): JsonObject[] {
    this.isLoading = true;
    this.errorMessage = null;
    this.statusMessage = null;
    return [
      this.updateData("/ui/errorBanner", []),
      this.updateData("/ui/statusBanner", []),
      this.updateData("/ui/workspaceView", []),
      this.updateData("/ui/loadingView", [{ message }]),
    ];
  }

  /** Transitions from loading skeleton back to the ready master-detail workspace. */
  completeLoading(statusText = "Customer directory refreshed."): JsonObject[] {
    this.isLoading = false;
    this.errorMessage = null;
    this.statusMessage = statusText;
    return [
      this.updateData("/ui/loadingView", []),
      this.updateData("/ui/workspaceView", [{ active: true }]),
      this.updateData("/ui/errorBanner", []),
      this.updateData("/ui/statusBanner", [{ message: statusText }]),
      ...this.buildListAndCountUpdates(),
    ];
  }

  /** Arms or displays a simulated server error banner (Design Rule 15). */
  triggerSimulatedError(failNextSave: boolean): JsonObject[] {
    this.isLoading = false;
    if (failNextSave) {
      this.failNextSave = true;
      return [];
    }
    this.statusMessage = null;
    this.errorMessage =
      "Could not sync customer changes with the ERP server (ERR_SERVER_UNAVAILABLE). Your form edits are preserved.";
    return [
      this.updateData("/ui/loadingView", []),
      this.updateData("/ui/workspaceView", [{ active: true }]),
      this.updateData("/ui/statusBanner", []),
      this.updateData("/ui/errorBanner", [{ message: this.errorMessage }]),
    ];
  }

  private handleSelectCustomer(ctx: Record<string, unknown>): JsonObject[] {
    const id = typeof ctx["customerId"] === "string" ? ctx["customerId"] : "";
    const found = this.customers.find((c) => c.id === id);
    if (!found) {
      this.errorMessage = `Customer '${id}' could not be found (ERR_CUSTOMER_NOT_FOUND).`;
      return [
        this.updateData("/ui/errorBanner", [{ message: this.errorMessage }]),
      ];
    }

    this.selectedId = found.id;
    this.isCreatingNew = false;
    this.errorMessage = null;

    return [
      this.updateData("/ui/errorBanner", []),
      this.updateData("/form", this.buildFormState(found)),
      this.updateData("/ui/deleteModal", [{ revision: this.modalRevision }]),
      ...this.buildListAndCountUpdates(),
    ];
  }

  private handleNewCustomer(): JsonObject[] {
    this.selectedId = null;
    this.isCreatingNew = true;
    this.errorMessage = null;
    this.statusMessage = null;

    return [
      this.updateData("/ui/loadingView", []),
      this.updateData("/ui/workspaceView", [{ active: true }]),
      this.updateData("/ui/errorBanner", []),
      this.updateData("/ui/statusBanner", []),
      this.updateData("/ui/deleteModal", []),
      this.updateData("/form", this.buildBlankFormState()),
      ...this.buildListAndCountUpdates(),
    ];
  }

  private handleSaveCustomer(ctx: Record<string, unknown>): JsonObject[] {
    if (this.failNextSave) {
      this.failNextSave = false;
      this.statusMessage = null;
      this.errorMessage =
        "Save failed: ERP server returned 503 (ERR_SERVER_UNAVAILABLE). Your edits are preserved; click Retry or Save Customer again.";
      return [
        this.updateData("/ui/statusBanner", []),
        this.updateData("/ui/errorBanner", [{ message: this.errorMessage }]),
      ];
    }

    const parsed = validateSaveContext(ctx);
    if (!parsed.ok) {
      this.statusMessage = null;
      this.errorMessage = parsed.message;
      return [
        this.updateData("/ui/statusBanner", []),
        this.updateData("/ui/errorBanner", [{ message: parsed.message }]),
      ];
    }

    const { draft } = parsed;
    this.errorMessage = null;

    const existingIdx =
      !this.isCreatingNew && draft.id.length > 0
        ? this.customers.findIndex((c) => c.id === draft.id)
        : -1;

    let saved: CustomerRecord;
    if (existingIdx >= 0) {
      const existing = this.customers[existingIdx]!;
      saved = {
        ...existing,
        name: draft.name,
        email: draft.email,
        taxId: draft.taxId,
        segment: draft.segment,
        paymentTerms: draft.paymentTerms,
        contractStart: draft.contractStart,
        annualValueCents: draft.annualValueCents,
        active: draft.active,
        notes: draft.notes,
      };
      this.customers[existingIdx] = saved;
      this.statusMessage = `Saved changes to ${saved.name}.`;
    } else {
      const newId = `cust-${this.nextIdCounter++}`;
      saved = {
        id: newId,
        name: draft.name,
        email: draft.email,
        taxId: draft.taxId,
        segment: draft.segment,
        paymentTerms: draft.paymentTerms,
        contractStart: draft.contractStart,
        annualValueCents: draft.annualValueCents,
        currency: "USD",
        active: draft.active,
        notes: draft.notes,
      };
      this.customers.unshift(saved);
      this.statusMessage = `Created customer ${saved.name}.`;
    }

    this.selectedId = saved.id;
    this.isCreatingNew = false;

    return [
      this.updateData("/ui/errorBanner", []),
      this.updateData("/ui/statusBanner", [{ message: this.statusMessage }]),
      this.updateData("/form", this.buildFormState(saved)),
      this.updateData("/ui/deleteModal", [{ revision: this.modalRevision }]),
      ...this.buildListAndCountUpdates(),
    ];
  }

  private handleDeleteCustomer(ctx: Record<string, unknown>): JsonObject[] {
    const id = typeof ctx["customerId"] === "string" ? ctx["customerId"] : "";
    const idx = this.customers.findIndex((c) => c.id === id);
    if (idx < 0) {
      return [
        ...this.closeModalMessages(),
        this.updateData("/ui/errorBanner", [
          {
            message: `Customer '${id}' could not be deleted (ERR_CUSTOMER_NOT_FOUND).`,
          },
        ]),
      ];
    }

    const removed = this.customers[idx]!;
    this.customers.splice(idx, 1);
    this.errorMessage = null;
    this.statusMessage = `Deleted customer ${removed.name}.`;

    const nextSelected = this.customers[0] ?? null;
    this.selectedId = nextSelected?.id ?? null;
    this.isCreatingNew = nextSelected === null;

    // First clear `/ui/deleteModal` to unmount the open Dialog, then remount closed
    // when another customer remains selected.
    const messages: JsonObject[] = [
      this.updateData("/ui/deleteModal", []),
      this.updateData("/ui/errorBanner", []),
      this.updateData("/ui/statusBanner", [{ message: this.statusMessage }]),
      this.updateData(
        "/form",
        nextSelected ? this.buildFormState(nextSelected) : this.buildBlankFormState(),
      ),
      ...this.buildListAndCountUpdates(),
    ];

    if (nextSelected) {
      this.modalRevision += 1;
      messages.push(
        this.updateData("/ui/deleteModal", [{ revision: this.modalRevision }]),
      );
    }

    return messages;
  }

  private handleSearch(rawQuery: string): JsonObject[] {
    this._searchQuery = rawQuery;
    return [
      this.updateData("/search/query", rawQuery),
      ...this.buildListAndCountUpdates(),
    ];
  }

  private handleRetry(): JsonObject[] {
    this.failNextSave = false;
    this.isLoading = false;
    this.errorMessage = null;
    this.statusMessage = "Connection restored and customer directory synced.";
    return [
      this.updateData("/ui/loadingView", []),
      this.updateData("/ui/workspaceView", [{ active: true }]),
      this.updateData("/ui/errorBanner", []),
      this.updateData("/ui/statusBanner", [{ message: this.statusMessage }]),
      ...this.buildListAndCountUpdates(),
    ];
  }

  private handleDismissBanner(kind: unknown): JsonObject[] {
    if (kind === "error") {
      this.errorMessage = null;
      return [this.updateData("/ui/errorBanner", [])];
    }
    this.statusMessage = null;
    return [this.updateData("/ui/statusBanner", [])];
  }

  private closeModalMessages(): JsonObject[] {
    if (this.isCreatingNew || this.selectedId === null) {
      return [this.updateData("/ui/deleteModal", [])];
    }
    this.modalRevision += 1;
    return [
      this.updateData("/ui/deleteModal", []),
      this.updateData("/ui/deleteModal", [{ revision: this.modalRevision }]),
    ];
  }

  private getFilteredCustomers(): readonly CustomerRecord[] {
    const needle = this._searchQuery.trim().toLowerCase();
    if (needle.length === 0) {
      return this.customers;
    }
    return this.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.email.toLowerCase().includes(needle) ||
        c.taxId.toLowerCase().includes(needle),
    );
  }

  private buildCustomerListItems(filtered: readonly CustomerRecord[]): JsonObject[] {
    return filtered.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      taxId: c.taxId,
      segmentLabel: SEGMENT_LABELS[c.segment],
      statusLabel: c.active ? "Active" : "Paused",
      annualValue: c.annualValueCents / 100,
      currency: c.currency,
      actionLabel: !this.isCreatingNew && this.selectedId === c.id ? "Selected" : "Edit",
    }));
  }

  private buildFormState(customer: CustomerRecord): JsonObject {
    return {
      id: customer.id,
      isNew: false,
      heading: `Edit: ${customer.name}`,
      name: customer.name,
      email: customer.email,
      taxId: customer.taxId,
      segment: [customer.segment],
      paymentTerms: [customer.paymentTerms],
      contractStart: customer.contractStart,
      annualValueText: formatCentsAsDecimalString(customer.annualValueCents),
      currency: customer.currency,
      active: customer.active,
      notes: customer.notes,
    };
  }

  private buildBlankFormState(): JsonObject {
    return {
      id: "",
      isNew: true,
      heading: "New Customer",
      name: "",
      email: "",
      taxId: "",
      segment: ["smb"],
      paymentTerms: ["net30"],
      contractStart: this.todayIso(),
      annualValueText: "0.00",
      currency: "USD",
      active: true,
      notes: "",
    };
  }

  private buildDataModel(): JsonObject {
    const filtered = this.getFilteredCustomers();
    const listItems = this.buildCustomerListItems(filtered);
    const activeCustomer =
      !this.isCreatingNew && this.selectedId !== null
        ? this.customers.find((c) => c.id === this.selectedId)
        : undefined;
    const isEmptyDirectory = this.customers.length === 0;
    const isEmptySearch = !isEmptyDirectory && filtered.length === 0;

    return {
      search: {
        query: this._searchQuery,
      },
      customers: listItems,
      form: activeCustomer
        ? this.buildFormState(activeCustomer)
        : this.buildBlankFormState(),
      ui: {
        layoutMode: this._layoutMode,
        visibleCount: filtered.length,
        totalCount: this.customers.length,
        statusBanner: this.statusMessage ? [{ message: this.statusMessage }] : [],
        errorBanner: this.errorMessage ? [{ message: this.errorMessage }] : [],
        loadingView: this.isLoading ? [{ message: "Loading customers..." }] : [],
        workspaceView: this.isLoading ? [] : [{ active: true }],
        populatedList: filtered.length > 0 ? [{ active: true }] : [],
        emptySearch: isEmptySearch ? [{ query: this._searchQuery.trim() }] : [],
        emptyDirectory: isEmptyDirectory ? [{ active: true }] : [],
        deleteModal:
          !this.isCreatingNew && activeCustomer
            ? [{ revision: this.modalRevision }]
            : [],
      },
    };
  }

  private buildListAndCountUpdates(): JsonObject[] {
    const filtered = this.getFilteredCustomers();
    const listItems = this.buildCustomerListItems(filtered);
    const isEmptyDirectory = this.customers.length === 0;
    const isEmptySearch = !isEmptyDirectory && filtered.length === 0;

    return [
      this.updateData("/customers", listItems),
      this.updateData("/ui/visibleCount", filtered.length),
      this.updateData("/ui/totalCount", this.customers.length),
      this.updateData(
        "/ui/populatedList",
        filtered.length > 0 ? [{ active: true }] : [],
      ),
      this.updateData(
        "/ui/emptySearch",
        isEmptySearch ? [{ query: this._searchQuery.trim() }] : [],
      ),
      this.updateData(
        "/ui/emptyDirectory",
        isEmptyDirectory ? [{ active: true }] : [],
      ),
    ];
  }

  private updateData(path: string, value: JsonValue): JsonObject {
    return {
      version: "1.0",
      updateDataModel: {
        surfaceId: ERP_SURFACE_ID,
        path,
        value,
      },
    };
  }
}
