/**
 * Renderer-side state shared by the xlarge catalog components.
 *
 * xlarge's `Field` has no data-model binding for what a person types: the
 * values live in the client until the enclosing `Form` sends them. A `Form`
 * therefore provides a draft that its `Field`s read and write; nothing is
 * written into the surface data model.
 */

import { context, platform, signal, type Signal } from "nsh";
import type { TimerSeam } from "../../core/rpc";
import { unwrapBinding } from "../../renderer/A2uiSurface";
import { announce } from "../../renderer/accessibility";
import { SHOW_CODES, type Guard, type PreviewBody, type Translate } from "./model";

/** A `when`/`unless` property as `guardShown` reads it: unset, or its bound value. */
export function readGuard(raw: unknown): Guard {
  return raw === undefined ? undefined : { value: unwrapBinding(raw) };
}

/** The draft a `Form` holds for the fields drawn inside it. */
export interface FormDraft {
  /** Field name → what the person typed or chose. */
  readonly values: Signal<Readonly<Record<string, unknown>>>;
  /** Field name → the message shown under a refused field. */
  readonly errors: Signal<Readonly<Record<string, string>>>;
  /** Sets one field's value and clears its error. */
  set(name: string, value: unknown): void;
  /** Empties the draft and its errors (after a successful send). */
  reset(): void;
}

/** Creates an empty draft. */
export function createFormDraft(): FormDraft {
  const values = signal<Readonly<Record<string, unknown>>>({});
  const errors = signal<Readonly<Record<string, string>>>({});
  return {
    values,
    errors,
    set(name, value) {
      values.update((prev) => ({ ...prev, [name]: value }));
      if (errors()[name] !== undefined) {
        errors.update((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    reset() {
      values.set({});
      errors.set({});
    },
  };
}

/** The draft of the nearest enclosing `Form`, if any. */
export const FormDraftContext = context<FormDraft | undefined>(undefined);

/** Options every xlarge renderer reads. */
export interface XlargeRendererOptions {
  /** Turns xlarge's i18n codes into words. Default: shows the code. */
  readonly translate?: Translate;
  /** The message under an empty required field. Default: `"Required"`. */
  readonly requiredMessage?: string;
  /** What an empty table says. Default: `"No rows"`. */
  readonly emptyMessage?: string;
  /** The placeholder of a table's search box. Default: `"Search"`. */
  readonly searchPlaceholder?: string;
  /** The label of a dialog form's cancel button. Default: `"Cancel"`. */
  readonly cancelLabel?: string;
  /** The label of a `Refusal` without `backLabel`. Default: `"Back"`. */
  readonly backLabel?: string;
  /** The name of a toast's close button. Default: `"Dismiss"`. */
  readonly dismissLabel?: string;
  /**
   * How long a `Toast` shows before it passes, in milliseconds; `0` keeps it
   * until it is dismissed. Default: `5000`.
   */
  readonly toastMs?: number;
  /**
   * Schedules a `Toast`'s passing after `toastMs` (the core `TimerSeam`), so
   * a test can advance time instead of sleeping. Default: the global
   * `setTimeout` / `clearTimeout`.
   */
  readonly timers?: TimerSeam;
  /** What a `Button` with `confirm` asks. Default: `"Are you sure?"`. */
  readonly confirmQuestion?: string;
  /** The yes button of a `Confirm` without `confirmLabel`. Default: `"Confirm"`. */
  readonly confirmLabel?: string;
  /** A `Wizard`'s button to the next page. Default: `"Next"`. */
  readonly nextLabel?: string;
  /** An `Arrange`'s add button without `addLabel`. Default: `"Add"`. */
  readonly addLabel?: string;
  /** An `Arrange`'s button that restores the order. Default: `"Reset"`. */
  readonly resetLabel?: string;
  /** An `Arrange` item's move-up button. Default: `"Move up"`. */
  readonly moveUpLabel?: string;
  /** An `Arrange` item's move-down button. Default: `"Move down"`. */
  readonly moveDownLabel?: string;
  /** An `Arrange` item's shown toggle. Default: `"Shown"`. */
  readonly shownLabel?: string;
  /** A removable `Arrange` item's remove button. Default: `"Remove"`. */
  readonly removeLabel?: string;
  /**
   * What an `Arrange` announces after a move or an add, with `{name}`,
   * `{at}` and `{count}` filled. Default: `"{name} moved to {at} of {count}"`.
   */
  readonly movedText?: string;
  /**
   * Says a message to assistive technology. Default: `announce()` from
   * `src/renderer/accessibility.ts` (`nsh`'s).
   */
  readonly announce?: (message: string) => void;
  /**
   * The record the last action this screen sent was answered with, while the
   * screen is open (xlarge's `answer()`): what a `Steps` draws. An A2UI 1.0
   * event carries no answer back, so the host that sends it and reads the
   * reply holds it; pass a signal's reader so a new answer redraws. Default:
   * none, so a `Steps` draws nothing.
   */
  readonly answer?: () => Readonly<Record<string, unknown>> | null | undefined;
  /**
   * Draws a `Preview`: asked with its `action` (xlarge's
   * `export:<screen>?shape=...`, never sent as an event) and the named draft
   * values (`{ draft, about }`), it answers the URL or data URI of the drawn
   * page, or `undefined` for none. A rejection says `preview.failed`.
   * Default: none, so a `Preview` lists the named draft values.
   */
  readonly preview?: (action: string, body: PreviewBody) => Promise<string | undefined>;
  /**
   * How long after the last change to a `Preview`'s draft it asks `preview`,
   * in milliseconds. Default: `600`, as xlarge's client.
   */
  readonly previewPauseMs?: number;
  /**
   * The host draws in a terminal: a `Chart` shows its table instead of a
   * drawing. Default: `platform.idiom === "terminal"`.
   */
  readonly terminal?: boolean;
  /** A `Calendar`'s weekday heads, Monday first (seven). Default: English. */
  readonly weekdayLabels?: readonly string[];
  /** A `Calendar`'s month names, January first (twelve). Default: English. */
  readonly monthLabels?: readonly string[];
  /**
   * Turns an attachment id an `Image` holds into the URL of its picture
   * (xlarge serves `/api/v1/files/<id>` with the session). The result is
   * still checked against unsafe schemes. Default: none, so a bare id draws
   * the named placeholder.
   */
  readonly fileUrl?: (id: string) => string | undefined;
  /**
   * Opens an `otpauth:` link in the app that holds it (a `QrCode`'s "open in
   * app" button). Default: none, so no button is offered.
   */
  readonly openUrl?: (url: string) => void;
  /** The words after a `Metric`'s change percent. Default: `"vs before"`. */
  readonly againstBeforeLabel?: string;
  /** A `QrCode`'s name and caption without `label`. Default: `"QR code"`. */
  readonly qrLabel?: string;
  /** A `QrCode`'s button that opens its link in an app. Default: `"Open in app"`. */
  readonly openInAppLabel?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
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
] as const;

/** `XlargeRendererOptions` with every default filled in. */
export interface ResolvedXlargeOptions {
  readonly translate: Translate;
  readonly requiredMessage: string;
  readonly emptyMessage: string;
  readonly searchPlaceholder: string;
  readonly cancelLabel: string;
  readonly backLabel: string;
  readonly dismissLabel: string;
  readonly toastMs: number;
  readonly timers: TimerSeam;
  readonly confirmQuestion: string;
  readonly confirmLabel: string;
  readonly nextLabel: string;
  readonly addLabel: string;
  readonly resetLabel: string;
  readonly moveUpLabel: string;
  readonly moveDownLabel: string;
  readonly shownLabel: string;
  readonly removeLabel: string;
  readonly movedText: string;
  readonly announce: (message: string) => void;
  readonly answer: (() => Readonly<Record<string, unknown>> | null | undefined) | undefined;
  readonly preview: ((action: string, body: PreviewBody) => Promise<string | undefined>) | undefined;
  readonly previewPauseMs: number;
  readonly terminal: boolean;
  readonly weekdayLabels: readonly string[];
  readonly monthLabels: readonly string[];
  readonly fileUrl: ((id: string) => string | undefined) | undefined;
  readonly openUrl: ((url: string) => void) | undefined;
  readonly againstBeforeLabel: string;
  readonly qrLabel: string;
  readonly openInAppLabel: string;
}

const GLOBAL_TIMERS: TimerSeam = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/** Fills in the defaults of `XlargeRendererOptions`. */
export function resolveXlargeOptions(
  options: XlargeRendererOptions = {},
): ResolvedXlargeOptions {
  return {
    translate: options.translate ?? SHOW_CODES,
    requiredMessage: options.requiredMessage ?? "Required",
    emptyMessage: options.emptyMessage ?? "No rows",
    searchPlaceholder: options.searchPlaceholder ?? "Search",
    cancelLabel: options.cancelLabel ?? "Cancel",
    backLabel: options.backLabel ?? "Back",
    dismissLabel: options.dismissLabel ?? "Dismiss",
    toastMs:
      options.toastMs !== undefined && Number.isFinite(options.toastMs) && options.toastMs >= 0
        ? options.toastMs
        : 5000,
    timers: options.timers ?? GLOBAL_TIMERS,
    confirmQuestion: options.confirmQuestion ?? "Are you sure?",
    confirmLabel: options.confirmLabel ?? "Confirm",
    nextLabel: options.nextLabel ?? "Next",
    addLabel: options.addLabel ?? "Add",
    resetLabel: options.resetLabel ?? "Reset",
    moveUpLabel: options.moveUpLabel ?? "Move up",
    moveDownLabel: options.moveDownLabel ?? "Move down",
    shownLabel: options.shownLabel ?? "Shown",
    removeLabel: options.removeLabel ?? "Remove",
    movedText: options.movedText ?? "{name} moved to {at} of {count}",
    announce: options.announce ?? announce,
    answer: options.answer,
    preview: options.preview,
    previewPauseMs:
      options.previewPauseMs !== undefined &&
      Number.isFinite(options.previewPauseMs) &&
      options.previewPauseMs >= 0
        ? options.previewPauseMs
        : 600,
    terminal: options.terminal ?? platform.idiom === "terminal",
    weekdayLabels: options.weekdayLabels?.length === 7 ? options.weekdayLabels : WEEKDAYS,
    monthLabels: options.monthLabels?.length === 12 ? options.monthLabels : MONTHS,
    fileUrl: options.fileUrl,
    openUrl: options.openUrl,
    againstBeforeLabel: options.againstBeforeLabel ?? "vs before",
    qrLabel: options.qrLabel ?? "QR code",
    openInAppLabel: options.openInAppLabel ?? "Open in app",
  };
}
