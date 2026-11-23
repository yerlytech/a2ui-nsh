/**
 * Renderers for xlarge's own A2UI 1.0 catalog (`tech.yerly.xlarge/v1`).
 *
 * xlarge (an ERP) sends its screens against a custom catalog it publishes as
 * an A2UI 1.0 catalog definition. This module draws the four components its
 * `crm.deals` screen uses: `Card`, `Field`, `Form`, and `Table`. The catalog
 * definition itself is xlarge's: register it on the store (`Catalog.fromJson`)
 * next to these renderers. None of this is part of the A2UI Basic Catalog.
 */

import {
  ComponentRegistry,
  type A2uiComponentRenderer,
} from "../../renderer/registry";
import { createXlargeCard } from "./Card";
import { resolveXlargeOptions, type XlargeRendererOptions } from "./context";
import { createXlargeField } from "./Field";
import { createXlargeForm } from "./Form";
import { createXlargeTable } from "./Table";
import { XLARGE_CATALOG_V1_ID } from "./model";

export { createXlargeCard } from "./Card";
export {
  FormDraftContext,
  createFormDraft,
  resolveXlargeOptions,
  type FormDraft,
  type ResolvedXlargeOptions,
  type XlargeRendererOptions,
} from "./context";
export { createXlargeField } from "./Field";
export { collectFieldSpecs, createXlargeForm } from "./Form";
export { createXlargeTable } from "./Table";
export {
  SHOW_CODES,
  XLARGE_CATALOG_V1_ID,
  eventPayload,
  fieldControl,
  fieldOptions,
  formatAmount,
  formatCell,
  heldValues,
  isBlank,
  missingRequired,
  recordRowsPath,
  tableColumns,
  tableRows,
  type FieldControl,
  type FieldOption,
  type FieldSpec,
  type TableColumn,
  type Translate,
} from "./model";

/** The xlarge components this library draws (4 of the catalog's 22). */
export const XLARGE_DRAWN_COMPONENTS = ["Card", "Field", "Form", "Table"] as const;

/** Builds the xlarge renderers with `options` (translation, fixed words). */
export function createXlargeRenderers(
  options: XlargeRendererOptions = {},
): Readonly<Record<string, A2uiComponentRenderer>> {
  const resolved = resolveXlargeOptions(options);
  return {
    Card: createXlargeCard(resolved),
    Field: createXlargeField(resolved),
    Form: createXlargeForm(resolved),
    Table: createXlargeTable(resolved),
  };
}

/** Registers the xlarge renderers on `registry` under `catalogId`. */
export function registerXlargeCatalogComponents(
  registry: ComponentRegistry,
  options: XlargeRendererOptions = {},
  catalogId: string = XLARGE_CATALOG_V1_ID,
): ComponentRegistry {
  return registry.registerCatalog(catalogId, createXlargeRenderers(options));
}
