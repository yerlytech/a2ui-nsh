import { platform } from "nsh";
import { describe, expect, test } from "nsh/test";
import type { TimerSeam } from "../../core/rpc";
import { ResolvedBinding } from "../../core/resolver";
import { announce } from "../../renderer/accessibility";
import {
  createFormDraft,
  readGuard,
  resolveXlargeOptions,
  type ResolvedXlargeOptions,
  type XlargeRendererOptions,
} from "./context";
import { SHOW_CODES, type PreviewBody } from "./model";

// One rule per test for src/catalog/xlarge/context.ts. The broad scenarios live
// in context.test.ts; this file pins each rule on its own.

const DEFAULT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DEFAULT_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DEFAULT_STRINGS = {
  requiredMessage: "Required",
  emptyMessage: "No rows",
  searchPlaceholder: "Search",
  cancelLabel: "Cancel",
  backLabel: "Back",
  dismissLabel: "Dismiss",
  confirmQuestion: "Are you sure?",
  confirmLabel: "Confirm",
  nextLabel: "Next",
  addLabel: "Add",
  resetLabel: "Reset",
  moveUpLabel: "Move up",
  moveDownLabel: "Move down",
  shownLabel: "Shown",
  removeLabel: "Remove",
  movedText: "{name} moved to {at} of {count}",
  againstBeforeLabel: "vs before",
  qrLabel: "QR code",
  openInAppLabel: "Open in app",
} as const;

const STRING_OVERRIDES = {
  requiredMessage: "Name is required",
  emptyMessage: "Nothing here",
  searchPlaceholder: "Find",
  cancelLabel: "Discard",
  backLabel: "Go back",
  dismissLabel: "Close",
  confirmQuestion: "Do it?",
  confirmLabel: "Yes",
  nextLabel: "Continue",
  addLabel: "New row",
  resetLabel: "Restore",
  moveUpLabel: "Up",
  moveDownLabel: "Down",
  shownLabel: "Visible",
  removeLabel: "Delete",
  movedText: "{name} is now {at}/{count}",
  againstBeforeLabel: "than last time",
  qrLabel: "Scan code",
  openInAppLabel: "Open camera",
} as const satisfies XlargeRendererOptions;

function expectStringDefaults(resolved: ResolvedXlargeOptions): void {
  for (const [key, value] of Object.entries(DEFAULT_STRINGS)) {
    expect(resolved[key as keyof ResolvedXlargeOptions]).toBe(value);
  }
}

describe("xlarge renderer option rules", () => {
  test("no argument and an empty object fill every string, timing and list default", () => {
    for (const resolved of [resolveXlargeOptions(), resolveXlargeOptions({})]) {
      expectStringDefaults(resolved);
      expect(resolved.translate).toBe(SHOW_CODES);
      expect(resolved.translate("crm.field.title")).toBe("crm.field.title");
      expect(resolved.toastMs).toBe(5000);
      expect(resolved.previewPauseMs).toBe(600);
      expect(resolved.answer).toBeUndefined();
      expect(resolved.preview).toBeUndefined();
      expect(resolved.fileUrl).toBeUndefined();
      expect(resolved.openUrl).toBeUndefined();
      expect(resolved.weekdayLabels).toEqual(DEFAULT_WEEKDAYS);
      expect(resolved.monthLabels).toEqual(DEFAULT_MONTHS);
    }
  });

  test("every given string option wins over its default", () => {
    const resolved = resolveXlargeOptions(STRING_OVERRIDES);
    for (const [key, value] of Object.entries(STRING_OVERRIDES)) {
      expect(resolved[key as keyof ResolvedXlargeOptions]).toBe(value);
    }
  });

  test("a given translate replaces SHOW_CODES", () => {
    const translate = (code: string): string => `t:${code}`;
    const resolved = resolveXlargeOptions({ translate });
    expect(resolved.translate).toBe(translate);
    expect(resolved.translate("crm.field.title")).toBe("t:crm.field.title");
  });

  test("a given timers seam is passed through unchanged", () => {
    const timers: TimerSeam = {
      setTimeout: () => "handle",
      clearTimeout: () => {},
    };
    expect(resolveXlargeOptions({ timers }).timers).toBe(timers);
  });

  test("a given announce replaces the accessibility announcer", () => {
    expect(resolveXlargeOptions().announce).toBe(announce);
    const messages: string[] = [];
    const speak = (message: string): void => {
      messages.push(message);
    };
    const resolved = resolveXlargeOptions({ announce: speak });
    expect(resolved.announce).toBe(speak);
    resolved.announce("Saved");
    expect(messages).toEqual(["Saved"]);
  });

  test("a given answer reader is passed through unchanged", () => {
    const answer = () => ({ ok: true });
    const resolved = resolveXlargeOptions({ answer });
    expect(resolved.answer).toBe(answer);
    expect(resolved.answer?.()).toEqual({ ok: true });
  });

  test("a given preview drawer is passed through unchanged", async () => {
    const preview = async (
      action: string,
      body: PreviewBody,
    ): Promise<string | undefined> => `draw:${action}:${String(body.about)}`;
    const resolved = resolveXlargeOptions({ preview });
    expect(resolved.preview).toBe(preview);
    await expect(
      resolved.preview?.("export:screen?shape=wide", { draft: {}, about: "deal" }),
    ).resolves.toBe("draw:export:screen?shape=wide:deal");
  });

  test("a given fileUrl resolver is passed through unchanged", () => {
    const fileUrl = (id: string): string => `/api/v1/files/${id}`;
    const resolved = resolveXlargeOptions({ fileUrl });
    expect(resolved.fileUrl).toBe(fileUrl);
    expect(resolved.fileUrl?.("abc")).toBe("/api/v1/files/abc");
  });

  test("a given openUrl opener is passed through unchanged", () => {
    const opened: string[] = [];
    const openUrl = (url: string): void => {
      opened.push(url);
    };
    const resolved = resolveXlargeOptions({ openUrl });
    expect(resolved.openUrl).toBe(openUrl);
    resolved.openUrl?.("otpauth://totp/example");
    expect(opened).toEqual(["otpauth://totp/example"]);
  });

  test("toastMs and previewPauseMs keep zero and positives, and refuse NaN, Infinity and -1", () => {
    for (const value of [0, 1, 250, 5000.5]) {
      expect(resolveXlargeOptions({ toastMs: value }).toastMs).toBe(value);
      expect(resolveXlargeOptions({ previewPauseMs: value }).previewPauseMs).toBe(value);
    }
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(resolveXlargeOptions({ toastMs: value }).toastMs).toBe(5000);
      expect(resolveXlargeOptions({ previewPauseMs: value }).previewPauseMs).toBe(600);
    }
  });

  test("weekdayLabels is used only with exactly seven entries", () => {
    const seven = ["Pzt", "Sal", "Car", "Per", "Cum", "Cmt", "Paz"];
    const six = seven.slice(0, 6);
    const eight = [...seven, "Extra"];
    expect(resolveXlargeOptions({ weekdayLabels: [] }).weekdayLabels).toEqual(DEFAULT_WEEKDAYS);
    expect(resolveXlargeOptions({ weekdayLabels: six }).weekdayLabels).toEqual(DEFAULT_WEEKDAYS);
    expect(resolveXlargeOptions({ weekdayLabels: eight }).weekdayLabels).toEqual(DEFAULT_WEEKDAYS);
    expect(resolveXlargeOptions({ weekdayLabels: seven }).weekdayLabels).toBe(seven);
  });

  test("monthLabels is used only with exactly twelve entries", () => {
    const twelve = DEFAULT_MONTHS.map((month) => month.toUpperCase());
    const eleven = twelve.slice(0, 11);
    const thirteen = [...twelve, "Extra"];
    expect(resolveXlargeOptions({ monthLabels: [] }).monthLabels).toEqual(DEFAULT_MONTHS);
    expect(resolveXlargeOptions({ monthLabels: eleven }).monthLabels).toEqual(DEFAULT_MONTHS);
    expect(resolveXlargeOptions({ monthLabels: thirteen }).monthLabels).toEqual(DEFAULT_MONTHS);
    expect(resolveXlargeOptions({ monthLabels: twelve }).monthLabels).toBe(twelve);
  });

  test("terminal follows platform.idiom until an explicit value wins", () => {
    // nsh 0.7.2 runs the headless test VM as iOS, whose idiom is "phone".
    expect(platform.idiom).toBe("phone");
    expect(resolveXlargeOptions().terminal).toBe(false);
    expect(resolveXlargeOptions({ terminal: true }).terminal).toBe(true);
    expect(resolveXlargeOptions({ terminal: false }).terminal).toBe(false);
  });

  test("the default timers seam calls globalThis and a cleared callback never runs", () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const pending = new Map<unknown, () => void>();
    let nextHandle = 0;
    let nextMs = -1;
    try {
      globalThis.setTimeout = ((callback: () => void, ms?: number) => {
        nextHandle += 1;
        nextMs = ms ?? -1;
        pending.set(nextHandle, callback);
        return nextHandle;
      }) as typeof globalThis.setTimeout;
      globalThis.clearTimeout = ((handle: unknown) => {
        pending.delete(handle);
      }) as typeof globalThis.clearTimeout;

      const timers = resolveXlargeOptions().timers;
      let ran = 0;
      const handle = timers.setTimeout(() => {
        ran += 1;
      }, 25);
      expect(nextMs).toBe(25);
      expect(pending.size).toBe(1);
      timers.clearTimeout(handle);
      expect(pending.size).toBe(0);
      for (const callback of pending.values()) {
        callback();
      }
      expect(ran).toBe(0);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});

describe("readGuard rules", () => {
  test("a resolved binding becomes a guard holding its value", () => {
    expect(readGuard(new ResolvedBinding(true))).toEqual({ value: true });
    expect(readGuard(new ResolvedBinding(false))).toEqual({ value: false });
    expect(readGuard(new ResolvedBinding(0))).toEqual({ value: 0 });
    expect(readGuard(new ResolvedBinding(""))).toEqual({ value: "" });
    expect(readGuard(new ResolvedBinding(null))).toEqual({ value: null });
  });

  test("undefined is unset; a non-object is its own bound value", () => {
    expect(readGuard(undefined)).toBeUndefined();
    expect(readGuard(true)).toEqual({ value: true });
    expect(readGuard(false)).toEqual({ value: false });
    expect(readGuard(0)).toEqual({ value: 0 });
    expect(readGuard("yes")).toEqual({ value: "yes" });
    expect(readGuard("")).toEqual({ value: "" });
    expect(readGuard(null)).toEqual({ value: null });
  });

  test("a plain object is its own bound value, however its fields are shaped", () => {
    const empty = {};
    const withValue = { value: true };
    const withUndefined = { value: undefined };
    const withPath = { "@path": "/deal/cut" };
    const array = [1, 2];
    expect(readGuard(empty)).toEqual({ value: empty });
    expect(readGuard(withValue)).toEqual({ value: withValue });
    expect(readGuard(withUndefined)).toEqual({ value: withUndefined });
    expect(readGuard(withPath)).toEqual({ value: withPath });
    expect(readGuard(array)).toEqual({ value: array });
  });
});

describe("Form draft rules", () => {
  test("values starts empty and set writes one field, a second call overwriting it", () => {
    const draft = createFormDraft();
    expect(draft.values()).toEqual({});
    draft.set("name", "Ada");
    expect(draft.values()).toEqual({ name: "Ada" });
    draft.set("age", 36);
    draft.set("name", "Grace");
    expect(draft.values()).toEqual({ name: "Grace", age: 36 });
  });

  test("errors starts empty and set clears only the written field error", () => {
    const draft = createFormDraft();
    expect(draft.errors()).toEqual({});
    draft.errors.set({ name: "Required", age: "Too young", city: "Pick one" });
    draft.set("age", 36);
    expect(draft.errors()).toEqual({ name: "Required", city: "Pick one" });
    draft.set("age", 37);
    expect(draft.errors()).toEqual({ name: "Required", city: "Pick one" });
  });

  test("set on a field with no error leaves the errors object untouched", () => {
    const draft = createFormDraft();
    draft.errors.set({ age: "Too young" });
    const before = draft.errors();
    draft.set("name", "Ada");
    expect(draft.errors()).toBe(before);
  });

  test("reset empties both signals and a second reset leaves them empty", () => {
    const draft = createFormDraft();
    draft.set("name", "Ada");
    draft.errors.set({ age: "Too young" });
    draft.reset();
    expect(draft.values()).toEqual({});
    expect(draft.errors()).toEqual({});
    draft.reset();
    expect(draft.values()).toEqual({});
    expect(draft.errors()).toEqual({});
  });

  test("set after reset writes into the emptied draft", () => {
    const draft = createFormDraft();
    draft.set("name", "Ada");
    draft.reset();
    draft.set("age", 36);
    draft.errors.set({ age: "Too young" });
    draft.set("age", 37);
    expect(draft.values()).toEqual({ age: 37 });
    expect(draft.errors()).toEqual({});
  });
});
