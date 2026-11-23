import { describe, expect, open, test } from "nsh/test";
import {
  HARNESS,
  harnessOptions,
  reportedErrors,
  surfaceMessages,
} from "./test_support";

const WORDS = {
  "fin.cheque.state.portfolio": "In portfolio",
  "fin.cheque.state.endorsed": "Endorsed",
  "fin.cheque.state.collected": "Collected",
};

describe("xlarge catalog ChequeLeaf", () => {
  test("shows each state through translate, with its date, amount, party and note", async () => {
    const app = await open(
      HARNESS,
      harnessOptions(
        surfaceMessages(
          "s_leaf",
          [{ id: "root", component: "ChequeLeaf", rows: { "@path": "/leaf" }, statePrefix: "fin.cheque.state." }],
          {
            leaf: [
              { id: 1, state: "portfolio", date: "2026-10-01T09:00:00Z", amount: "15000", party: "Acme" },
              { id: 2, state: "endorsed", date: "2026-10-15", party: "Bolt Ltd", note: "to supplier" },
              { id: 3, state: "collected", at: "2026-11-20", amount: "15000.00" },
            ],
          },
        ),
        WORDS,
      ),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual([
      "In portfolio",
      "2026-10-01",
      "15,000.00",
      "Acme",
      "Endorsed",
      "2026-10-15",
      "Bolt Ltd",
      "to supplier",
      "Collected",
      "2026-11-20",
      "15,000.00",
    ]);
    expect(app.shows("label:Collected, 2026-11-20, 15,000.00")).toBe(true);
    // The last state (the leaf's state now) is drawn stronger than the others.
    expect(app.spanStyle("text:Collected").fontWeight).toBeGreaterThan(
      app.spanStyle("text:In portfolio").fontWeight,
    );
  });

  test("an untranslated state shows its code; no rows draws an empty leaf", async () => {
    const app = await open(
      HARNESS,
      harnessOptions([
        ...surfaceMessages(
          "s_leaf_code",
          [{ id: "root", component: "ChequeLeaf", rows: { "@path": "/leaf" }, statePrefix: "fin.note.state." }],
          { leaf: [{ state: "bounced" }] },
        ),
        ...surfaceMessages("s_leaf_none", [{ id: "root", component: "ChequeLeaf" }]),
      ]),
    );
    expect(reportedErrors(app)).toEqual([]);
    expect(app.texts()).toEqual(["fin.note.state.bounced"]);
    expect(app.shows("id:s_leaf_none:root")).toBe(true);
  });
});
