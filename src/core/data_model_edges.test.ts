import { describe, expect, test } from "nsh/test";
import {
  DataContext,
  DataModel,
  deepEqual,
  type ChangeSet,
} from "./data_model";
import { A2uiDataError } from "./pointer";

function errorFrom(fn: () => unknown): A2uiDataError | undefined {
  try {
    fn();
  } catch (error) {
    return error as A2uiDataError;
  }
  return undefined;
}

describe("DataModel get edges", () => {
  test("returns the root value for the root pointer", () => {
    const model = new DataModel({ a: 1 });
    expect(model.get("/")).toEqual({ a: 1 });
  });

  test("returns undefined for a missing object key", () => {
    const model = new DataModel({ a: 1 });
    expect(model.get("/missing")).toBeUndefined();
  });

  test("returns undefined for an array index past the end", () => {
    const model = new DataModel({ items: ["a"] });
    expect(model.get("/items/1")).toBeUndefined();
  });

  test("returns undefined for negative and non-numeric array segments", () => {
    const model = new DataModel({ items: ["a"] });
    expect(model.get("/items/-1")).toBeUndefined();
    expect(model.get("/items/not-an-index")).toBeUndefined();
  });

  test("returns undefined when the path traverses a scalar", () => {
    const model = new DataModel({ a: 1 });
    expect(model.get("/a/deeper")).toBeUndefined();
  });
});

describe("DataModel set edges", () => {
  test("creates objects for missing non-index parent segments", () => {
    const model = new DataModel({});
    model.set("/a/b/c", 1);
    expect(model.get("/a")).toEqual({ b: { c: 1 } });
  });

  test("creates an array when the first missing segment is a list index", () => {
    const model = new DataModel({});
    model.set("/a/0/c", 1);
    expect(Array.isArray(model.get("/a"))).toBe(true);
    expect(model.get("/a/0/c")).toBe(1);
  });

  test("appends at an array index one past the end", () => {
    const model = new DataModel({ items: ["a", "b"] });
    model.set("/items/2", "c");
    expect(model.get("/items")).toHaveLength(3);
    expect(model.get("/items/2")).toBe("c");
  });

  test("extends an array with holes for an index further past the end", () => {
    const model = new DataModel({ items: ["a", "b"] });
    const change = model.set("/items/4", "e");
    expect(change.changed).toBe(true);
    expect(model.get("/items")).toHaveLength(5);
    expect(model.get("/items/2")).toBeUndefined();
    expect(model.get("/items/3")).toBeUndefined();
    expect(model.get("/items/4")).toBe("e");
  });

  test("refuses negative and non-numeric indices on an existing array", () => {
    const model = new DataModel({ items: ["a"] });
    expect(errorFrom(() => model.set("/items/-1", "x"))?.code).toBe(
      "INVALID_ARRAY_INDEX",
    );
    expect(errorFrom(() => model.set("/items/abc", "x"))?.code).toBe(
      "INVALID_ARRAY_INDEX",
    );
  });

  test("refuses an array index above maxListIndex", () => {
    const model = new DataModel({ items: ["a"] });
    expect(errorFrom(() => model.set("/items/10001", "x"))?.code).toBe(
      "INDEX_LIMIT_EXCEEDED",
    );
  });

  test("reports the canonical path, ancestors, and only changed watcher paths", () => {
    const model = new DataModel({ a: { b: 1 }, other: { c: 1 } });
    model.subscribe("/a", () => {});
    model.subscribe("/a/b", () => {});
    model.subscribe("/other", () => {});

    const change = model.set("/a/b", 2);
    expect(change.changed).toBe(true);
    expect(change.path).toBe("/a/b");
    expect(change.ancestors).toEqual(["/", "/a", "/a/b"]);
    expect(change.notified).toEqual(["/a", "/a/b"]);
  });

  test("replaces the root when setting the root pointer", () => {
    const model = new DataModel({ a: 1 });
    const change = model.set("/", { b: 2 });
    expect(change.changed).toBe(true);
    expect(change.path).toBe("/");
    expect(model.get("/")).toEqual({ b: 2 });
  });

  test("treats an undefined value as a delete", () => {
    const model = new DataModel({ a: 1, b: 2 });
    const change = model.set("/a", undefined);
    expect(change.changed).toBe(true);
    expect(model.get("/a")).toBeUndefined();
    expect(model.get("/b")).toBe(2);
  });
});

describe("DataModel delete edges", () => {
  test("a missing path is changed=false with no notifications", () => {
    const model = new DataModel({ a: { b: 1 } });
    const seen: unknown[] = [];
    model.subscribe("/a", (value) => seen.push(value));

    const change = model.delete("/a/missing");
    expect(change.changed).toBe(false);
    expect(change.path).toBe("/a/missing");
    expect(change.ancestors).toEqual(["/", "/a", "/a/missing"]);
    expect(change.notified).toEqual([]);
    expect(seen).toEqual([]);
  });

  test("an object key is removed from its parent", () => {
    const model = new DataModel({ user: { name: "Alice", bio: "Dev" } });
    const change = model.delete("/user/bio");
    expect(change.changed).toBe(true);
    expect(change.path).toBe("/user/bio");
    expect(change.ancestors).toEqual(["/", "/user", "/user/bio"]);
    expect(model.get("/user")).toEqual({ name: "Alice" });
  });

  test("an in-bounds array element becomes null without shrinking the list", () => {
    const model = new DataModel({ items: ["a", "b", "c"] });
    const change = model.delete("/items/1");
    expect(change.changed).toBe(true);
    expect(change.path).toBe("/items/1");
    expect(model.get("/items")).toHaveLength(3);
    expect(model.get("/items")).toEqual(["a", null, "c"]);
  });

  test("an out-of-range array index is a no-op", () => {
    const model = new DataModel({ items: ["a"] });
    const change = model.delete("/items/5");
    expect(change.changed).toBe(false);
    expect(change.notified).toEqual([]);
    expect(model.get("/items")).toEqual(["a"]);
  });

  test("deleting the root resets the model to an empty object", () => {
    const model = new DataModel({ a: 1 });
    const change = model.delete("/");
    expect(change.changed).toBe(true);
    expect(change.path).toBe("/");
    expect(model.get("/")).toEqual({});
  });
});

describe("DataModel applyUpdate edges", () => {
  test("an undefined path replaces the root", () => {
    const model = new DataModel({ old: true });
    const change = model.applyUpdate(undefined, { next: 1 });
    expect(change.changed).toBe(true);
    expect(change.path).toBe("/");
    expect(model.get("/")).toEqual({ next: 1 });
  });

  test("an empty path targets the root", () => {
    const model = new DataModel({ old: true });
    const change = model.applyUpdate("", { next: 1 });
    expect(change.changed).toBe(true);
    expect(change.path).toBe("/");
    expect(model.get("/")).toEqual({ next: 1 });
  });

  test("an undefined value deletes an object key", () => {
    const model = new DataModel({ user: { name: "Alice", bio: "Dev" } });
    const change = model.applyUpdate("/user/bio", undefined);
    expect(change.changed).toBe(true);
    expect(model.get("/user")).toEqual({ name: "Alice" });
  });

  test("a null value with an empty path clears the root", () => {
    const model = new DataModel({ a: 1 });
    const change = model.applyUpdate("", null);
    expect(change.changed).toBe(true);
    expect(model.get("/")).toEqual({});
  });
});

describe("DataModel subscribe edges", () => {
  test("an observer on a parent fires when a child changes", () => {
    const model = new DataModel({ a: { b: 1 } });
    const seen: unknown[] = [];
    model.subscribe("/a", (value) => seen.push(value));

    model.set("/a/b", 2);
    expect(seen).toEqual([{ b: 2 }]);
  });

  test("an observer on a child fires when its parent is replaced", () => {
    const model = new DataModel({ a: { b: 1 } });
    const seen: unknown[] = [];
    model.subscribe("/a/b", (value) => seen.push(value));

    model.set("/a", { b: 2 });
    expect(seen).toEqual([2]);
  });

  test("an observer on a sibling does not fire", () => {
    const model = new DataModel({ a: { b: 1 }, other: { c: 1 } });
    const seen: unknown[] = [];
    model.subscribe("/other", (value) => seen.push(value));

    model.set("/a/b", 2);
    expect(seen).toEqual([]);
  });

  test("subscribe without an observer returns a usable subscription", () => {
    const model = new DataModel({ a: 1 });
    const sub = model.subscribe("/a");
    expect(sub.path).toBe("/a");
    expect(sub.value).toBe(1);
    expect(model.activeSubscriptionCount).toBe(1);

    model.set("/a", 2);
    expect(sub.value).toBe(2);

    sub.unsubscribe();
    expect(model.activeSubscriptionCount).toBe(0);
  });

  test("unsubscribing twice is safe", () => {
    const model = new DataModel({ a: 1 });
    const sub = model.subscribe("/a", () => {});

    sub.unsubscribe();
    expect(() => sub.unsubscribe()).not.toThrow();
    expect(model.activeSubscriptionCount).toBe(0);
  });
});

describe("DataModel onAfterCommit edges", () => {
  test("the listener receives the ChangeSet once per committed write", () => {
    const model = new DataModel({ a: 1 });
    const changes: ChangeSet[] = [];
    model.onAfterCommit((changeSet) => changes.push(changeSet));

    model.set("/a", 2);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.changed).toBe(true);
    expect(changes[0]?.path).toBe("/a");
  });

  test("the listener is not called for a same-value write", () => {
    const model = new DataModel({ a: 1 });
    const changes: ChangeSet[] = [];
    model.onAfterCommit((changeSet) => changes.push(changeSet));

    model.set("/a", 1);
    expect(changes).toEqual([]);
  });

  test("the returned function removes the listener", () => {
    const model = new DataModel({ a: 1 });
    const seen: string[] = [];
    const off = model.onAfterCommit((changeSet) => seen.push(changeSet.path));

    model.set("/a", 2);
    off();
    model.set("/a", 3);
    expect(seen).toEqual(["/a"]);
  });
});

describe("DataModel dispose edges", () => {
  test("dispose detaches watchers but leaves writes working", () => {
    const model = new DataModel({ a: 1 });
    const seen: unknown[] = [];
    const sub = model.subscribe("/a", (value) => seen.push(value));

    model.dispose();
    const change = model.set("/a", 2);
    expect(change.changed).toBe(true);
    expect(model.get("/a")).toBe(2);
    expect(seen).toEqual([]);
    expect(model.activeSubscriptionCount).toBe(0);
    expect(() => sub.unsubscribe()).not.toThrow();
  });

  test("dispose removes after-commit listeners", () => {
    const model = new DataModel({ a: 1 });
    let calls = 0;
    model.onAfterCommit(() => {
      calls += 1;
    });

    model.dispose();
    model.set("/a", 2);
    expect(calls).toBe(0);
  });

  test("a subscription created after dispose still observes writes", () => {
    const model = new DataModel({ a: 1 });
    model.dispose();

    const seen: unknown[] = [];
    model.subscribe("/a", (value) => seen.push(value));
    model.set("/a", 2);
    expect(seen).toEqual([2]);
  });
});

describe("DataContext edges", () => {
  test("nested contexts join relative paths into one absolute pointer", () => {
    const model = new DataModel({ order: { customer: { name: "Ada" } } });
    const ctx = new DataContext(model).nested("order").nested("customer");
    expect(ctx.path).toBe("/order/customer");
    expect(ctx.get("name")).toBe("Ada");
  });

  test("resolvePath ignores the base for an absolute path", () => {
    const ctx = new DataContext(new DataModel({}), "/items/0");
    expect(ctx.resolvePath("/company")).toBe("/company");
  });

  test("resolvePath resolves relative and empty paths against the context", () => {
    const ctx = new DataContext(new DataModel({}), "/items/0");
    expect(ctx.resolvePath("name")).toBe("/items/0/name");
    expect(ctx.resolvePath("")).toBe("/items/0");
  });

  test("set through a context writes the absolute path in the model", () => {
    const model = new DataModel({ items: [{ name: "First" }] });
    const ctx = new DataContext(model, "/items/0");

    const change = ctx.set("name", "Second");
    expect(change.path).toBe("/items/0/name");
    expect(model.get("/items/0/name")).toBe("Second");
  });

  test("delete through a context deletes the absolute path in the model", () => {
    const model = new DataModel({ items: [{ name: "First" }] });
    const ctx = new DataContext(model, "/items/0");

    const change = ctx.delete("name");
    expect(change.path).toBe("/items/0/name");
    expect(model.get("/items/0")).toEqual({});
  });

  test("subscribe through a context watches the absolute path", () => {
    const model = new DataModel({ items: [{ name: "First" }] });
    const ctx = new DataContext(model, "/items/0");
    const seen: unknown[] = [];

    const sub = ctx.subscribe("name", (value) => seen.push(value));
    expect(sub.path).toBe("/items/0/name");

    model.set("/items/0/name", "Second");
    expect(seen).toEqual(["Second"]);
  });
});

describe("deepEqual edges", () => {
  test("treats NaN as equal to NaN", () => {
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual({ x: NaN }, { x: NaN })).toBe(true);
  });

  test("distinguishes -0 from 0", () => {
    expect(deepEqual(-0, 0)).toBe(false);
    expect(deepEqual(0, -0)).toBe(false);
    expect(deepEqual(-0, -0)).toBe(true);
  });

  test("rejects nested arrays of different length", () => {
    expect(deepEqual([[1, 2]], [[1, 2, 3]])).toBe(false);
  });

  test("compares objects with the same keys in a different order", () => {
    expect(
      deepEqual(
        { a: [1, { b: 2 }], c: 3 },
        { c: 3, a: [1, { b: 2 }] },
      ),
    ).toBe(true);
  });

  test("rejects an object and an array with the same entries", () => {
    expect(deepEqual({ 0: "a", 1: "b" }, ["a", "b"])).toBe(false);
  });
});
