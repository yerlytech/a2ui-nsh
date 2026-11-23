/**
 * Renderers for xlarge's own A2UI 1.0 catalog (`tech.yerly.xlarge/v1`).
 *
 * xlarge (an ERP) sends its screens against a custom catalog it publishes as
 * an A2UI 1.0 catalog definition. This module draws the four components its
 * `crm.deals` screen uses (`Card`, `Field`, `Form`, `Table`) and `Text`,
 * `Toast`, `Refusal`, `Image`, `QrCode`, `Button`, `Confirm`, `Preview`,
 * `Columns`, `Detail`, `Metric`, `ChequeLeaf`, `Wizard`, `Steps`, `Arrange`,
 * `Chart`, `Calendar`, and `Conversation` (spec 003, round 2): all 22. The catalog
 * definition itself is xlarge's: register it on the store (`Catalog.fromJson`)
 * next to these renderers. None of this is part of the A2UI Basic Catalog.
 */

import {
  ComponentRegistry,
  type A2uiComponentRenderer,
} from "../../renderer/registry";
import { createXlargeArrange } from "./Arrange";
import { createXlargeButton } from "./Button";
import { createXlargeCalendar } from "./Calendar";
import { createXlargeCard } from "./Card";
import { createXlargeChart } from "./Chart";
import { createXlargeChequeLeaf } from "./ChequeLeaf";
import { createXlargeColumns } from "./Columns";
import { createXlargeConfirm } from "./Confirm";
import { createXlargeConversation } from "./Conversation";
import { resolveXlargeOptions, type XlargeRendererOptions } from "./context";
import { createXlargeDetail } from "./Detail";
import { createXlargeField } from "./Field";
import { createXlargeForm } from "./Form";
import { createXlargeImage } from "./Image";
import { createXlargeMetric } from "./Metric";
import { createXlargePreview } from "./Preview";
import { createXlargeQrCode } from "./QrCode";
import { createXlargeRefusal } from "./Refusal";
import { createXlargeSteps } from "./Steps";
import { createXlargeTable } from "./Table";
import { createXlargeText } from "./Text";
import { createXlargeToast } from "./Toast";
import { createXlargeWizard } from "./Wizard";
import { XLARGE_CATALOG_V1_ID } from "./model";

export { AskPanel, sendXlargeAction, type AskPanelProps } from "./ask";
export { createXlargeArrange } from "./Arrange";
export { createXlargeButton } from "./Button";
export { createXlargeCalendar } from "./Calendar";
export { createXlargeCard } from "./Card";
export { createXlargeChart } from "./Chart";
export { createXlargeConfirm } from "./Confirm";
export { createXlargeConversation } from "./Conversation";
export { createXlargeImage } from "./Image";
export { createXlargePreview } from "./Preview";
export { createXlargeChequeLeaf } from "./ChequeLeaf";
export { createXlargeColumns } from "./Columns";
export { createXlargeDetail } from "./Detail";
export { createXlargeMetric } from "./Metric";
export { createXlargeQrCode } from "./QrCode";
export { createXlargeRefusal } from "./Refusal";
export { createXlargeSteps } from "./Steps";
export { createXlargeText } from "./Text";
export { createXlargeToast } from "./Toast";
export { createXlargeWizard } from "./Wizard";
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
  arrangeContext,
  arrangeMoved,
  arrangeRows,
  arrangeText,
  patchArrangeItem,
  askStep,
  buttonVariant,
  calendarMonth,
  chartKind,
  chartPoints,
  conversationRows,
  pieShares,
  sumDecimals,
  draftLines,
  changeDirection,
  changePercent,
  changeTone,
  chequeLeafRows,
  columnWeights,
  detailEntries,
  encodeQr,
  eventPayload,
  fieldControl,
  fieldOptions,
  fillParams,
  formatAmount,
  formatCell,
  formatKurus,
  formatMonthDay,
  heldValues,
  isBlank,
  literalContext,
  messageText,
  metricText,
  missingRequired,
  detailEditContext,
  draftNames,
  opensContext,
  previewBody,
  sameValue,
  stepName,
  stepsAnswer,
  moveItem,
  newArrangeItem,
  recordRowsPath,
  reedSolomonRemainder,
  screenAction,
  tableColumns,
  tableRows,
  textTone,
  wizardStep,
  type AskStep,
  type ArrangeRow,
  type ButtonVariant,
  type CalendarDay,
  type CalendarMonth,
  type ChartFormat,
  type ChartKind,
  type ChartPoint,
  type ConversationRow,
  type DraftLine,
  type ChangeDirection,
  type ChangeTone,
  type ChequeLeafRow,
  type ChequeLeafStub,
  type DetailEntry,
  type FieldControl,
  type FieldOption,
  type FieldSpec,
  type QrMatrix,
  type AgentStep,
  type PreviewBody,
  type StepOutcome,
  type StepsAnswer,
  type TableColumn,
  type TextTone,
  type Translate,
  type WizardStep,
} from "./model";

/** The xlarge components this library draws (all 22 of the catalog's components). */
export const XLARGE_DRAWN_COMPONENTS = [
  "Card",
  "Field",
  "Form",
  "Table",
  "Text",
  "Toast",
  "Refusal",
  "Image",
  "QrCode",
  "Button",
  "Confirm",
  "Preview",
  "Columns",
  "Detail",
  "Metric",
  "ChequeLeaf",
  "Wizard",
  "Steps",
  "Arrange",
  "Chart",
  "Calendar",
  "Conversation",
] as const;

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
    Text: createXlargeText(resolved),
    Toast: createXlargeToast(resolved),
    Refusal: createXlargeRefusal(resolved),
    Image: createXlargeImage(resolved),
    QrCode: createXlargeQrCode(resolved),
    Button: createXlargeButton(resolved),
    Confirm: createXlargeConfirm(resolved),
    Preview: createXlargePreview(resolved),
    Columns: createXlargeColumns(resolved),
    Detail: createXlargeDetail(resolved),
    Metric: createXlargeMetric(resolved),
    ChequeLeaf: createXlargeChequeLeaf(resolved),
    Wizard: createXlargeWizard(resolved),
    Steps: createXlargeSteps(resolved),
    Arrange: createXlargeArrange(resolved),
    Chart: createXlargeChart(resolved),
    Calendar: createXlargeCalendar(resolved),
    Conversation: createXlargeConversation(resolved),
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
