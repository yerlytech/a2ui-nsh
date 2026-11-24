/**
 * The screen's draft: what is typed on an xlarge screen outside any `Form`.
 *
 * xlarge's client keeps one draft per screen. Its lab-report layout screen
 * (captured 2026-11-24) draws a `Preview` that is in no `Form`: its `draft`
 * names the list an `Arrange` puts in order (`blocks`) and its `about` a
 * `Field` that is in no `Form` either (`sample`). So each surface gets one
 * draft, given (as `FormDraftContext`) by the outermost xlarge component
 * drawn on it; a `Form` or `Wizard` inside still gives its own to its fields.
 */

import type { JSX } from "nsh";
import type { SurfaceSignalStore } from "../../store/surface_store";
import type { A2uiComponentProps, A2uiComponentRenderer } from "../../renderer/registry";
import { FormDraftContext, createFormDraft, type FormDraft } from "./context";

const SCREEN_DRAFTS = new WeakMap<SurfaceSignalStore, FormDraft>();

/** The one draft of the surface `store` draws (made on first use). */
export function screenDraft(store: SurfaceSignalStore): FormDraft {
  let draft = SCREEN_DRAFTS.get(store);
  if (draft === undefined) {
    draft = createFormDraft();
    SCREEN_DRAFTS.set(store, draft);
  }
  return draft;
}

/**
 * `render`, given its surface's screen draft when no `Form`, `Wizard` or
 * outer xlarge component has given one already.
 */
export function withScreenDraft(render: A2uiComponentRenderer): A2uiComponentRenderer {
  const Inner = render;
  return function XlargeOnScreenDraft(props: A2uiComponentProps): JSX.Element {
    if (FormDraftContext() !== undefined) {
      return render(props);
    }
    return (
      <FormDraftContext.Provider value={screenDraft(props.store)}>
        <Inner {...props} />
      </FormDraftContext.Provider>
    );
  };
}
