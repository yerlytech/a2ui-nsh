/**
 * Basic Catalog v1 components (18 of 18 Basic Catalog v1 components)
 * and registration helper for `ComponentRegistry`.
 */

import { BASIC_CATALOG_V1_ID } from "../../core/catalog";
import {
  ComponentRegistry,
  type A2uiComponentRenderer,
} from "../../renderer/registry";
import { BasicAudioPlayer } from "./AudioPlayer";
import { BasicButton } from "./Button";
import { BasicCard } from "./Card";
import { BasicCheckBox } from "./CheckBox";
import { BasicChoicePicker } from "./ChoicePicker";
import { BasicColumn } from "./Column";
import { BasicDateTimeInput } from "./DateTimeInput";
import { BasicDivider } from "./Divider";
import { BasicIcon } from "./Icon";
import { BasicImage } from "./Image";
import { BasicList } from "./List";
import { BasicModal } from "./Modal";
import { BasicRow } from "./Row";
import { BasicSlider } from "./Slider";
import { BasicTabs } from "./Tabs";
import { BasicText } from "./Text";
import { BasicTextField } from "./TextField";
import { BasicVideo } from "./Video";

export {
  BasicAudioPlayer,
  classifyAudioError,
  formatAudioTime,
  type AudioDegradedKind,
  type ClassifiedAudioError,
} from "./AudioPlayer";
export { BasicButton } from "./Button";
export { BasicCard } from "./Card";
export { BasicCheckBox } from "./CheckBox";
export {
  BasicChoicePicker,
  extractChoiceOptions,
  normalizeSelectedValues,
  type ResolvedChoiceOption,
} from "./ChoicePicker";
export { BasicColumn } from "./Column";
export { BasicDateTimeInput } from "./DateTimeInput";
export { BasicDivider } from "./Divider";
export { BasicIcon } from "./Icon";
export { BasicImage } from "./Image";
export { BasicList } from "./List";
export {
  BasicModal,
  ModalTriggerContext,
  type ModalTriggerController,
} from "./Modal";
export { BasicRow } from "./Row";
export {
  BasicSlider,
  clampAndSnapSliderValue,
  formatSliderDisplayValue,
  resolveSliderBounds,
  resolveSliderStep,
  type SliderBounds,
} from "./Slider";
export {
  BasicTabs,
  extractTabItems,
  type ResolvedTabItem,
} from "./Tabs";
export { BasicText } from "./Text";
export { BasicTextField } from "./TextField";
export {
  BasicVideo,
  resolveVideoPresentationState,
  type VideoPresentationInput,
  type VideoPresentationMode,
  type VideoPresentationState,
} from "./Video";
export {
  applyDateTimeEdit,
  clampTimeToBounds,
  extractIsoDatePart,
  extractIsoTimePart,
  getLocalIsoDate,
  resolveDateTimeFlags,
  resolveEffectiveTimeBounds,
  type DateTimeMode,
} from "./datetime_helpers";
export {
  BASIC_ICON_NAME_LIST,
  BASIC_ICON_PATHS,
  FALLBACK_ICON_PATH,
  MAX_SVG_PATH_LENGTH,
  isValidSvgPath,
  resolveIconSvgPath,
} from "./icon_paths";
export { extractChildNodes, mapAlign, mapJustify } from "./layout_helpers";
export {
  parseA2uiMarkdown,
  type MarkdownFeature,
  type ParsedA2uiMarkdown,
} from "./markdown";
export { sanitizeMediaUrl } from "./media_url";
export {
  ValidationFeedback,
  extractCheckableState,
  writeBinding,
  type CheckableState,
  type ValidationFeedbackProps,
} from "./validation_feedback";

/** Map of implemented Basic Catalog v1 component renderers (18/18). */
export const BASIC_CATALOG_V1_RENDERERS: Readonly<
  Record<string, A2uiComponentRenderer>
> = {
  Text: BasicText,
  Image: BasicImage,
  Icon: BasicIcon,
  Video: BasicVideo,
  AudioPlayer: BasicAudioPlayer,
  Row: BasicRow,
  Column: BasicColumn,
  List: BasicList,
  Card: BasicCard,
  Tabs: BasicTabs,
  Modal: BasicModal,
  Divider: BasicDivider,
  Button: BasicButton,
  TextField: BasicTextField,
  CheckBox: BasicCheckBox,
  ChoicePicker: BasicChoicePicker,
  Slider: BasicSlider,
  DateTimeInput: BasicDateTimeInput,
};

/** Registers all implemented Basic Catalog v1 components on `registry`. */
export function registerBasicCatalogComponents(
  registry: ComponentRegistry,
  catalogId: string = BASIC_CATALOG_V1_ID,
): ComponentRegistry {
  return registry.registerCatalog(catalogId, BASIC_CATALOG_V1_RENDERERS);
}

/** Creates a `ComponentRegistry` pre-populated with Basic Catalog v1 components. */
export function createBasicCatalogRegistry(
  catalogId: string = BASIC_CATALOG_V1_ID,
): ComponentRegistry {
  return registerBasicCatalogComponents(new ComponentRegistry(), catalogId);
}
