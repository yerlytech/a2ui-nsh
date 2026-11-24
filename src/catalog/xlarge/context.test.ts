import { describe, expect, test } from "nsh/test";
import type { TimerSeam } from "../../core/rpc";
import { createFormDraft, resolveXlargeOptions } from "./context";

describe("xlarge Form draft", () => {
  test("a new draft starts with no values and no errors", () => {
    const draft = createFormDraft();
    expect(draft.values()).toEqual({});
    expect(draft.errors()).toEqual({});
  });

  test("set writes one field and keeps the others", () => {
    const draft = createFormDraft();
    draft.set("name", "Ada");
    draft.set("age", 36);
    expect(draft.values()).toEqual({ name: "Ada", age: 36 });
  });

  test("set clears the error of the written field and leaves the other errors", () => {
    const draft = createFormDraft();
    draft.errors.set({ name: "Required", age: "Too young" });
    draft.set("name", "Ada");
    expect(draft.values()).toEqual({ name: "Ada" });
    expect(draft.errors()).toEqual({ age: "Too young" });
  });

  test("set on a field with no error leaves the errors untouched", () => {
    const draft = createFormDraft();
    draft.errors.set({ age: "Too young" });
    const before = draft.errors();
    draft.set("name", "Ada");
    expect(draft.errors()).toBe(before);
    expect(draft.errors()).toEqual({ age: "Too young" });
  });

  test("reset empties both the values and the errors", () => {
    const draft = createFormDraft();
    draft.set("name", "Ada");
    draft.errors.set({ age: "Too young" });
    draft.reset();
    expect(draft.values()).toEqual({});
    expect(draft.errors()).toEqual({});
  });
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
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

describe("xlarge renderer options", () => {
  test("without an argument every label default is filled in", () => {
    const resolved = resolveXlargeOptions();
    expect(resolved.requiredMessage).toBe("Required");
    expect(resolved.emptyMessage).toBe("No rows");
    expect(resolved.searchPlaceholder).toBe("Search");
    expect(resolved.cancelLabel).toBe("Cancel");
    expect(resolved.backLabel).toBe("Back");
    expect(resolved.dismissLabel).toBe("Dismiss");
    expect(resolved.confirmQuestion).toBe("Are you sure?");
    expect(resolved.confirmLabel).toBe("Confirm");
    expect(resolved.nextLabel).toBe("Next");
    expect(resolved.addLabel).toBe("Add");
    expect(resolved.resetLabel).toBe("Reset");
    expect(resolved.moveUpLabel).toBe("Move up");
    expect(resolved.moveDownLabel).toBe("Move down");
    expect(resolved.shownLabel).toBe("Shown");
    expect(resolved.removeLabel).toBe("Remove");
    expect(resolved.movedText).toBe("{name} moved to {at} of {count}");
    expect(resolved.againstBeforeLabel).toBe("vs before");
    expect(resolved.qrLabel).toBe("QR code");
    expect(resolved.openInAppLabel).toBe("Open in app");
  });

  test("without an argument the timings and calendar labels default as written", () => {
    const resolved = resolveXlargeOptions();
    expect(resolved.toastMs).toBe(5000);
    expect(resolved.previewPauseMs).toBe(600);
    expect(resolved.weekdayLabels).toEqual(WEEKDAYS);
    expect(resolved.monthLabels).toEqual(MONTHS);
  });

  test("without an argument the host seams and optional callbacks are absent", () => {
    const resolved = resolveXlargeOptions();
    expect(resolved.answer).toBeUndefined();
    expect(resolved.preview).toBeUndefined();
    expect(resolved.fileUrl).toBeUndefined();
    expect(resolved.openUrl).toBeUndefined();
    expect(typeof resolved.terminal).toBe("boolean");
  });

  test("given labels win over the defaults", () => {
    const resolved = resolveXlargeOptions({
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
    });
    expect(resolved.requiredMessage).toBe("Name is required");
    expect(resolved.emptyMessage).toBe("Nothing here");
    expect(resolved.searchPlaceholder).toBe("Find");
    expect(resolved.cancelLabel).toBe("Discard");
    expect(resolved.backLabel).toBe("Go back");
    expect(resolved.dismissLabel).toBe("Close");
    expect(resolved.confirmQuestion).toBe("Do it?");
    expect(resolved.confirmLabel).toBe("Yes");
    expect(resolved.nextLabel).toBe("Continue");
    expect(resolved.addLabel).toBe("New row");
    expect(resolved.resetLabel).toBe("Restore");
    expect(resolved.moveUpLabel).toBe("Up");
    expect(resolved.moveDownLabel).toBe("Down");
    expect(resolved.shownLabel).toBe("Visible");
    expect(resolved.removeLabel).toBe("Delete");
    expect(resolved.movedText).toBe("{name} is now {at}/{count}");
    expect(resolved.againstBeforeLabel).toBe("than last time");
    expect(resolved.qrLabel).toBe("Scan code");
    expect(resolved.openInAppLabel).toBe("Open camera");
  });

  test("a negative, NaN or infinite toastMs falls back to 5000 while zero is kept", () => {
    expect(resolveXlargeOptions({ toastMs: -1 }).toastMs).toBe(5000);
    expect(resolveXlargeOptions({ toastMs: Number.NaN }).toastMs).toBe(5000);
    expect(resolveXlargeOptions({ toastMs: Number.POSITIVE_INFINITY }).toastMs).toBe(5000);
    expect(resolveXlargeOptions({ toastMs: 0 }).toastMs).toBe(0);
  });

  test("a negative, NaN or infinite previewPauseMs falls back to 600 while zero is kept", () => {
    expect(resolveXlargeOptions({ previewPauseMs: -1 }).previewPauseMs).toBe(600);
    expect(resolveXlargeOptions({ previewPauseMs: Number.NaN }).previewPauseMs).toBe(600);
    expect(resolveXlargeOptions({ previewPauseMs: Number.POSITIVE_INFINITY }).previewPauseMs).toBe(600);
    expect(resolveXlargeOptions({ previewPauseMs: 0 }).previewPauseMs).toBe(0);
  });

  test("weekday labels that are not seven fall back, seven are kept as given", () => {
    const six = ["Pzt", "Sal", "Car", "Per", "Cum", "Cmt"];
    const eight = [...six, "Paz", "Extra"];
    expect(resolveXlargeOptions({ weekdayLabels: six }).weekdayLabels).toEqual(WEEKDAYS);
    expect(resolveXlargeOptions({ weekdayLabels: eight }).weekdayLabels).toEqual(WEEKDAYS);
    const seven = ["Pzt", "Sal", "Car", "Per", "Cum", "Cmt", "Paz"];
    expect(resolveXlargeOptions({ weekdayLabels: seven }).weekdayLabels).toBe(seven);
  });

  test("month labels of eleven fall back, twelve are kept as given", () => {
    const eleven = MONTHS.slice(0, 11);
    expect(resolveXlargeOptions({ monthLabels: eleven }).monthLabels).toEqual(MONTHS);
    const twelve = MONTHS.map((month) => month.toUpperCase());
    expect(resolveXlargeOptions({ monthLabels: twelve }).monthLabels).toBe(twelve);
  });

  test("a given timers seam and announce are passed through unchanged", () => {
    const timers: TimerSeam = {
      setTimeout: () => 1,
      clearTimeout: () => {},
    };
    const announced: string[] = [];
    const announce = (message: string): void => {
      announced.push(message);
    };
    const resolved = resolveXlargeOptions({ timers, announce });
    expect(resolved.timers).toBe(timers);
    expect(resolved.announce).toBe(announce);
    resolved.announce("Saved");
    expect(announced).toEqual(["Saved"]);
  });
});
