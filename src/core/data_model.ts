/**
 * Pure TypeScript reactive A2UI v1.0 data model with structural sharing,
 * touched-path change sets, RFC 6901 pointer traversal, and scoped contexts.
 */

import {
  A2uiDataError,
  DEFAULT_POINTER_LIMITS,
  ancestorPointers,
  parseArrayIndex,
  parsePointer,
  pathsOverlap,
  resolvePath,
  type CanonicalPointer,
  type ParsedPointer,
  type PointerLimits,
} from "./pointer";

export interface DataModelOptions {
  readonly limits?: Partial<PointerLimits>;
}

/** Summary of a single mutation applied to a DataModel. */
export interface ChangeSet {
  readonly changed: boolean;
  readonly path: CanonicalPointer;
  readonly ancestors: readonly CanonicalPointer[];
  readonly notified: readonly CanonicalPointer[];
}

export type DataObserver = (value: unknown) => void;

/** Active watcher registration returned by `DataModel.subscribe`. */
export interface DataSubscription {
  readonly path: CanonicalPointer;
  readonly value: unknown;
  unsubscribe(): void;
}

interface WatcherEntry {
  readonly id: number;
  readonly canonical: CanonicalPointer;
  readonly segments: readonly string[];
  readonly observer: DataObserver | undefined;
  currentValue: unknown;
  active: boolean;
}

interface DeleteResult {
  readonly changed: boolean;
  readonly value: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function defineOwn(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function shallowCloneObject(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]!;
    defineOwn(out, k, source[k]);
  }
  return out;
}

function shallowCloneObjectWithout(
  source: Record<string, unknown>,
  omitKey: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]!;
    if (k !== omitKey) {
      defineOwn(out, k, source[k]);
    }
  }
  return out;
}

function deepCloneValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    const out = new Array<unknown>(value.length);
    for (let i = 0; i < value.length; i += 1) {
      if (i in value) {
        out[i] = deepCloneValue(value[i]);
      }
    }
    return out;
  }
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i]!;
    defineOwn(out, k, deepCloneValue(source[k]));
  }
  return out;
}

/** Structural equality check with fast reference short-circuiting for shared subtrees. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) {
    return false;
  }
  if (aIsArray) {
    const arrA = a as readonly unknown[];
    const arrB = b as readonly unknown[];
    if (arrA.length !== arrB.length) {
      return false;
    }
    for (let i = 0; i < arrA.length; i += 1) {
      if (!deepEqual(arrA[i], arrB[i])) {
        return false;
      }
    }
    return true;
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (let i = 0; i < keysA.length; i += 1) {
    const key = keysA[i]!;
    if (!hasOwn(objB, key) || !deepEqual(objA[key], objB[key])) {
      return false;
    }
  }
  return true;
}

function readSegments(root: unknown, segments: readonly string[]): unknown {
  let current: unknown = root;
  for (let i = 0; i < segments.length; i += 1) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    const seg = segments[i]!;
    if (Array.isArray(current)) {
      const idx = parseArrayIndex(seg);
      if (idx === null || idx >= current.length) {
        return undefined;
      }
      current = current[idx];
    } else {
      if (!hasOwn(current, seg)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[seg];
    }
  }
  return current;
}

function setAtSegments(
  node: unknown,
  segments: readonly string[],
  depth: number,
  value: unknown,
  originalPath: string,
  limits: PointerLimits,
): unknown {
  if (depth === segments.length) {
    return value;
  }
  const seg = segments[depth]!;

  if (node === null || node === undefined) {
    const arrIdx = parseArrayIndex(seg);
    if (arrIdx !== null) {
      if (arrIdx > limits.maxListIndex) {
        throw new A2uiDataError(
          "INDEX_LIMIT_EXCEEDED",
          `Cannot set path "${originalPath}": list index ${arrIdx} exceeds maximum of ${limits.maxListIndex}`,
          originalPath,
        );
      }
      const nextArr = new Array<unknown>(arrIdx + 1);
      nextArr[arrIdx] = setAtSegments(
        undefined,
        segments,
        depth + 1,
        value,
        originalPath,
        limits,
      );
      return nextArr;
    }
    const nextObj: Record<string, unknown> = {};
    defineOwn(
      nextObj,
      seg,
      setAtSegments(undefined, segments, depth + 1, value, originalPath, limits),
    );
    return nextObj;
  }

  if (Array.isArray(node)) {
    const arrIdx = parseArrayIndex(seg);
    if (arrIdx === null) {
      throw new A2uiDataError(
        "INVALID_ARRAY_INDEX",
        `Cannot set path "${originalPath}": non-numeric segment "${seg}" on list`,
        originalPath,
      );
    }
    if (arrIdx > limits.maxListIndex) {
      throw new A2uiDataError(
        "INDEX_LIMIT_EXCEEDED",
        `Cannot set path "${originalPath}": list index ${arrIdx} exceeds maximum of ${limits.maxListIndex}`,
        originalPath,
      );
    }
    const prevChild = arrIdx < node.length ? node[arrIdx] : undefined;
    const nextChild = setAtSegments(
      prevChild,
      segments,
      depth + 1,
      value,
      originalPath,
      limits,
    );
    const nextArr = node.slice();
    if (arrIdx >= nextArr.length) {
      nextArr.length = arrIdx + 1;
    }
    nextArr[arrIdx] = nextChild;
    return nextArr;
  }

  if (isPlainObject(node)) {
    const prevChild = hasOwn(node, seg) ? node[seg] : undefined;
    const nextChild = setAtSegments(
      prevChild,
      segments,
      depth + 1,
      value,
      originalPath,
      limits,
    );
    const nextObj = shallowCloneObject(node);
    defineOwn(nextObj, seg, nextChild);
    return nextObj;
  }

  throw new A2uiDataError(
    "PRIMITIVE_TRAVERSAL",
    `Cannot set path "${originalPath}": cannot traverse through primitive at segment "${seg}"`,
    originalPath,
  );
}

function deleteAtSegments(
  node: unknown,
  segments: readonly string[],
  depth: number,
): DeleteResult {
  if (node === null || node === undefined || typeof node !== "object") {
    return { changed: false, value: node };
  }
  const seg = segments[depth]!;
  const isLast = depth === segments.length - 1;

  if (Array.isArray(node)) {
    const arrIdx = parseArrayIndex(seg);
    if (arrIdx === null || arrIdx >= node.length) {
      return { changed: false, value: node };
    }
    if (isLast) {
      if (node[arrIdx] === null) {
        return { changed: false, value: node };
      }
      const nextArr = node.slice();
      nextArr[arrIdx] = null;
      return { changed: true, value: nextArr };
    }
    const child = deleteAtSegments(node[arrIdx], segments, depth + 1);
    if (!child.changed) {
      return { changed: false, value: node };
    }
    const nextArr = node.slice();
    nextArr[arrIdx] = child.value;
    return { changed: true, value: nextArr };
  }

  if (isPlainObject(node)) {
    if (!hasOwn(node, seg)) {
      return { changed: false, value: node };
    }
    if (isLast) {
      return {
        changed: true,
        value: shallowCloneObjectWithout(node, seg),
      };
    }
    const child = deleteAtSegments(node[seg], segments, depth + 1);
    if (!child.changed) {
      return { changed: false, value: node };
    }
    const nextObj = shallowCloneObject(node);
    defineOwn(nextObj, seg, child.value);
    return { changed: true, value: nextObj };
  }

  return { changed: false, value: node };
}

/**
 * Pure, path-copied reactive data store for one A2UI surface.
 *
 * Updates copy only containers along the written path (structural sharing) and
 * defensively copy caller inputs so external mutation cannot corrupt state.
 */
export class DataModel {
  private root: unknown;
  private readonly limits: PointerLimits;
  private readonly watchers: WatcherEntry[] = [];
  private readonly afterCommitListeners: Array<(changeSet: ChangeSet) => void> =
    [];
  private nextWatcherId = 1;

  constructor(initial: unknown = {}, options?: DataModelOptions) {
    this.limits = {
      maxDepth: options?.limits?.maxDepth ?? DEFAULT_POINTER_LIMITS.maxDepth,
      maxListIndex:
        options?.limits?.maxListIndex ?? DEFAULT_POINTER_LIMITS.maxListIndex,
    };
    this.root = deepCloneValue(initial === undefined ? {} : initial);
  }

  /** Resolves a relative or absolute pointer path against a context scope. */
  static resolvePath(
    path: string,
    contextPath: string = "/",
  ): CanonicalPointer {
    return resolvePath(path, contextPath);
  }

  /** Reads the value at `path`, or `undefined` when absent. */
  get(path: string): unknown {
    const parsed = parsePointer(path, this.limits);
    return readSegments(this.root, parsed.segments);
  }

  /**
   * Writes `value` at `path`, auto-vivifying missing intermediate containers
   * (lists for valid RFC 6901 array indices, objects otherwise).
   * Passing `undefined` removes the key/path as `delete(path)`.
   */
  set(path: string, value: unknown): ChangeSet {
    if (value === undefined) {
      return this.delete(path);
    }
    const parsed = parsePointer(path, this.limits);
    const cloned = deepCloneValue(value);
    const nextRoot = setAtSegments(
      this.root,
      parsed.segments,
      0,
      cloned,
      path,
      this.limits,
    );
    return this.commit(parsed, nextRoot);
  }

  /**
   * Deletes the value at `path`:
   * - Root `"/"` resets the model to `{}`.
   * - An object key is removed from its parent object.
   * - An in-bounds list element is replaced with `null` (preserving list indices).
   * - Missing paths and out-of-range list indices are no-ops.
   */
  delete(path: string): ChangeSet {
    const parsed = parsePointer(path, this.limits);
    if (parsed.segments.length === 0) {
      return this.commit(parsed, {});
    }
    const result = deleteAtSegments(this.root, parsed.segments, 0);
    if (!result.changed) {
      return {
        changed: false,
        path: parsed.canonical,
        ancestors: ancestorPointers(parsed.segments),
        notified: [],
      };
    }
    return this.commit(parsed, result.value);
  }

  /**
   * Applies an A2UI v1.0 `updateDataModel` payload where `path` defaults to `"/"`
   * and `value: null` (or `undefined`) deletes the target path.
   */
  applyUpdate(path: string | undefined, value: unknown): ChangeSet {
    const target = path === undefined || path === "" ? "/" : path;
    if (value === null || value === undefined) {
      return this.delete(target);
    }
    return this.set(target, value);
  }

  /** Watches `path` for changes caused by exact, ancestor, or descendant writes. */
  subscribe(path: string, observer?: DataObserver): DataSubscription {
    const parsed = parsePointer(path, this.limits);
    const entry: WatcherEntry = {
      id: this.nextWatcherId,
      canonical: parsed.canonical,
      segments: parsed.segments,
      observer,
      currentValue: readSegments(this.root, parsed.segments),
      active: true,
    };
    this.nextWatcherId += 1;
    this.watchers.push(entry);

    return {
      path: entry.canonical,
      get value(): unknown {
        return entry.currentValue;
      },
      unsubscribe: (): void => {
        if (!entry.active) {
          return;
        }
        entry.active = false;
        const idx = this.watchers.indexOf(entry);
        if (idx >= 0) {
          this.watchers.splice(idx, 1);
        }
      },
    };
  }

  /**
   * Registers a listener invoked synchronously once after each committed
   * mutation (`changed === true`) once all path watchers have been notified.
   */
  onAfterCommit(listener: (changeSet: ChangeSet) => void): () => void {
    this.afterCommitListeners.push(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const idx = this.afterCommitListeners.indexOf(listener);
      if (idx >= 0) {
        this.afterCommitListeners.splice(idx, 1);
      }
    };
  }

  /** Total number of active path watchers and after-commit listeners. */
  get activeSubscriptionCount(): number {
    return this.watchers.length + this.afterCommitListeners.length;
  }

  /** Detaches all observers so no subsequent writes notify them. */
  dispose(): void {
    for (let i = 0; i < this.watchers.length; i += 1) {
      this.watchers[i]!.active = false;
    }
    this.watchers.length = 0;
    this.afterCommitListeners.length = 0;
  }

  private commit(parsed: ParsedPointer, nextRoot: unknown): ChangeSet {
    const changed = !deepEqual(this.root, nextRoot);
    const ancestors = ancestorPointers(parsed.segments);
    if (!changed) {
      return {
        changed: false,
        path: parsed.canonical,
        ancestors,
        notified: [],
      };
    }

    this.root = nextRoot;

    const toNotify: Array<{ entry: WatcherEntry; value: unknown }> = [];
    const notifiedPaths: CanonicalPointer[] = [];

    for (let i = 0; i < this.watchers.length; i += 1) {
      const entry = this.watchers[i]!;
      if (!entry.active) {
        continue;
      }
      if (!pathsOverlap(entry.segments, parsed.segments)) {
        continue;
      }
      const nextVal = readSegments(this.root, entry.segments);
      if (!deepEqual(entry.currentValue, nextVal)) {
        entry.currentValue = nextVal;
        toNotify.push({ entry, value: nextVal });
        notifiedPaths.push(entry.canonical);
      }
    }

    for (let i = 0; i < toNotify.length; i += 1) {
      const item = toNotify[i]!;
      if (item.entry.active && item.entry.observer) {
        item.entry.observer(item.value);
      }
    }

    const changeSet: ChangeSet = {
      changed: true,
      path: parsed.canonical,
      ancestors,
      notified: notifiedPaths,
    };

    if (this.afterCommitListeners.length > 0) {
      const snapshot = this.afterCommitListeners.slice();
      for (let i = 0; i < snapshot.length; i += 1) {
        snapshot[i]!(changeSet);
      }
    }

    return changeSet;
  }
}

/** Scoped view over a DataModel rooted at `path` for relative binding resolution. */
export class DataContext {
  readonly model: DataModel;
  readonly path: CanonicalPointer;

  constructor(model: DataModel, basePath: string = "/") {
    this.model = model;
    this.path = resolvePath("", basePath);
  }

  resolvePath(path: string): CanonicalPointer {
    return resolvePath(path, this.path);
  }

  get(path: string): unknown {
    return this.model.get(this.resolvePath(path));
  }

  set(path: string, value: unknown): ChangeSet {
    return this.model.set(this.resolvePath(path), value);
  }

  delete(path: string): ChangeSet {
    return this.model.delete(this.resolvePath(path));
  }

  subscribe(path: string, observer?: DataObserver): DataSubscription {
    return this.model.subscribe(this.resolvePath(path), observer);
  }

  nested(relativePath: string): DataContext {
    return new DataContext(this.model, this.resolvePath(relativePath));
  }
}
