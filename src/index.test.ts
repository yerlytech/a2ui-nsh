import { describe, expect, test } from "nsh/test";
import { A2UI_PROTOCOL_VERSION } from "./index";

describe("a2ui-nsh", () => {
  test("exports protocol version 1.0", () => {
    expect(A2UI_PROTOCOL_VERSION).toBe("1.0");
  });
});
