/**
 * Renderer-side state shared by the xlarge catalog components.
 *
 * xlarge's `Field` has no data-model binding for what a person types: the
 * values live in the client until the enclosing `Form` sends them. A `Form`
 * therefore provides a draft that its `Field`s read and write; nothing is
 * written into the surface data model.
 */

import { context, signal, type Signal } from "nsh";
import { SHOW_CODES, type Translate } from "./model";

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
  /** The label of a `Detail`'s edit button (`update`). Default: `"Edit"`. */
  readonly editLabel?: string;
  /**
   * How long a `Toast` shows before it passes, in milliseconds; `0` keeps it
   * until it is dismissed. Default: `5000`.
   */
  readonly toastMs?: number;
  /** What a `Button` with `confirm` asks. Default: `"Are you sure?"`. */
  readonly confirmQuestion?: string;
  /** The yes button of a `Confirm` without `confirmLabel`. Default: `"Confirm"`. */
  readonly confirmLabel?: string;
  /** The accept button of a `Preview` without `label`. Default: `"Accept"`. */
  readonly acceptLabel?: string;
}

/** `XlargeRendererOptions` with every default filled in. */
export interface ResolvedXlargeOptions {
  readonly translate: Translate;
  readonly requiredMessage: string;
  readonly emptyMessage: string;
  readonly searchPlaceholder: string;
  readonly cancelLabel: string;
  readonly backLabel: string;
  readonly dismissLabel: string;
  readonly editLabel: string;
  readonly toastMs: number;
  readonly confirmQuestion: string;
  readonly confirmLabel: string;
  readonly acceptLabel: string;
}

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
    editLabel: options.editLabel ?? "Edit",
    toastMs:
      options.toastMs !== undefined && Number.isFinite(options.toastMs) && options.toastMs >= 0
        ? options.toastMs
        : 5000,
    confirmQuestion: options.confirmQuestion ?? "Are you sure?",
    confirmLabel: options.confirmLabel ?? "Confirm",
    acceptLabel: options.acceptLabel ?? "Accept",
  };
}
