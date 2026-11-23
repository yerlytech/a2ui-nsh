import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "bank.cheque_leaf_state.void": "VOID",
  "bank.cheque_leaf_state.printed": "Printed",
};

const LEAVES = [
  {
    id: "leaf-1",
    number: "CHK-2026-0001",
    state: "printed",
    date: "2026-11-20",
    payee: "Acme Logistics",
    amount: "15000",
    amountWords: "Fifteen thousand lira",
    memo: "Invoice 42",
    layout: { date: { top: 12, left: 160 }, payee: { top: 24, left: 30 }, amount: { top: 24, left: 160 } },
    stub: { number: "CHK-2026-0001", date: "2026-11-20", payee: "Acme Logistics", amount: "15000", memo: "Invoice 42" },
  },
  { id: "leaf-2", number: "CHK-2026-0002", state: "void", stub: null },
];

describe("xlarge catalog ChequeLeaf", () => {
  test("draws one leaf per row: number, date, payee, amount, words and memo, then its stub", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_leaf",
          [{ id: "root", component: "ChequeLeaf", rows: { "@path": "/leaves" }, statePrefix: "bank.cheque_leaf_state." }],
          { leaves: LEAVES },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    // A printed leaf's state is not written on it; only a void leaf says so.
    expect(app.texts()).toEqual([
      "CHK-2026-0001",
      "2026-11-20",
      "Acme Logistics",
      "15,000.00",
      "Fifteen thousand lira",
      "Invoice 42",
      "CHK-2026-0001",
      "2026-11-20",
      "Acme Logistics",
      "15,000.00",
      "Invoice 42",
      "CHK-2026-0002",
      "VOID",
    ]);
    expect(
      app.shows(
        "label:CHK-2026-0001, 2026-11-20, Acme Logistics, 15,000.00, Fifteen thousand lira, Invoice 42",
      ),
    ).toBe(true);
    expect(app.shows("label:CHK-2026-0002, VOID")).toBe(true);
    expect(app.shows("id:s_leaf:root:stub:id:leaf-1")).toBe(true);
    expect(app.shows("id:s_leaf:root:stub:id:leaf-2")).toBe(false);
    // The void word is drawn apart from the number, in another colour.
    expect(app.spanStyle("text:VOID").color === app.spanStyle("text:CHK-2026-0002").color).toBe(false);
  });

  test("an untranslated void state shows its code; no rows draws no leaves", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages(
          "s_leaf_code",
          [{ id: "root", component: "ChequeLeaf", rows: { "@path": "/leaves" }, statePrefix: "bank.leaf." }],
          { leaves: [{ number: "7", state: "void" }, { number: "8", state: "blank" }] },
        ),
        ...surfaceMessages("s_leaf_none", [{ id: "root", component: "ChequeLeaf" }]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    // The blank leaf shows only its number; the surface without rows adds no text.
    expect(app.texts()).toEqual(["7", "bank.leaf.void", "8"]);
    expect(app.shows("id:s_leaf_code:root:sheet:no:8")).toBe(true);
    expect(app.shows("id:s_leaf_none:root:sheet:at:0")).toBe(false);
  });
});
