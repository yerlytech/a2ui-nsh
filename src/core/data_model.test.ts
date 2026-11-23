import { describe, expect, test } from "nsh/test";
import { DataContext, DataModel, deepEqual } from "./data_model";
import { A2uiDataError } from "./pointer";

describe("DataModel", () => {
  test("preserves structural sharing across untouched sibling subtrees on write", () => {
    const model = new DataModel({
      left: { label: "keep", nested: [1, 2, 3] },
      right: { count: 1 },
    });

    const leftBefore = model.get("/left");
    const rightBefore = model.get("/right");

    const change = model.set("/right/count", 2);
    expect(change.changed).toBe(true);
    expect(change.path).toBe("/right/count");
    expect(change.ancestors).toEqual(["/", "/right", "/right/count"]);

    // Untouched branch keeps exact object identity; written branch is path-copied.
    expect(model.get("/left")).toBe(leftBefore);
    expect(model.get("/right")).not.toBe(rightBefore);
    expect(model.get("/right/count")).toBe(2);
  });

  test("returns changed=false and emits no notifications on same-value writes", () => {
    const model = new DataModel({ a: { b: 1 } });
    const seen: unknown[] = [];
    model.subscribe("/a/b", (v) => seen.push(v));

    const change = model.set("/a/b", 1);
    expect(change.changed).toBe(false);
    expect(change.notified).toEqual([]);
    expect(seen).toEqual([]);
  });

  test("supports unsubscribe and dispose independently", () => {
    const model = new DataModel({ n: 0 });
    const first: unknown[] = [];
    const second: unknown[] = [];

    const sub1 = model.subscribe("/n", (v) => first.push(v));
    const sub2 = model.subscribe("/n", (v) => second.push(v));

    model.set("/n", 1);
    expect(first).toEqual([1]);
    expect(second).toEqual([1]);
    expect(sub1.value).toBe(1);

    sub1.unsubscribe();
    model.set("/n", 2);
    expect(first).toEqual([1]);
    expect(second).toEqual([1, 2]);
    expect(sub2.value).toBe(2);

    model.dispose();
    model.set("/n", 3);
    expect(second).toEqual([1, 2]);
  });

  test("respects overridden depth and list index limits", () => {
    const model = new DataModel({}, { limits: { maxDepth: 2, maxListIndex: 5 } });
    model.set("/items/5", "ok");
    expect(model.get("/items/5")).toBe("ok");

    expect(() => model.set("/items/6", "too far")).toThrow(A2uiDataError);
    expect(() => model.set("/a/b/c", "too deep")).toThrow(A2uiDataError);
  });

  test("applies v1.0 updateDataModel deletion semantics via applyUpdate", () => {
    const model = new DataModel({
      user: { name: "Alice", bio: "Dev" },
      items: ["a", "b", "c"],
    });

    model.applyUpdate("/user/bio", null);
    expect(model.get("/user")).toEqual({ name: "Alice" });

    model.applyUpdate("/items/1", null);
    expect(model.get("/items")).toEqual(["a", null, "c"]);

    model.applyUpdate("/", null);
    expect(model.get("/")).toEqual({});
  });

  test("isolates initial input and written values from caller mutation", () => {
    const initial = { profile: { name: "Alice" } };
    const model = new DataModel(initial);
    initial.profile.name = "Mutated";
    expect(model.get("/profile/name")).toBe("Alice");

    const payload = { tags: ["v1"] };
    model.set("/meta", payload);
    payload.tags.push("mutated");
    expect(model.get("/meta/tags")).toEqual(["v1"]);
  });

  test("resolves relative paths and nested scopes through DataContext", () => {
    const model = new DataModel({
      company: "Acme",
      items: [{ name: "First" }, { name: "Second" }],
    });
    const rootCtx = new DataContext(model);
    const itemCtx = rootCtx.nested("items/1");

    expect(itemCtx.path).toBe("/items/1");
    expect(itemCtx.get("name")).toBe("Second");
    expect(itemCtx.get("/company")).toBe("Acme");

    itemCtx.set("name", "Updated");
    expect(model.get("/items/1/name")).toBe("Updated");
  });

  test("deepEqual distinguishes null, undefined, arrays, and objects", () => {
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});
