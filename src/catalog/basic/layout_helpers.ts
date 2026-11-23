/**
 * Pure layout mapping helpers shared by Basic Catalog `Row` and `Column`.
 */

import type { ViewStyle } from "nsh";
import { isComponentNode, type ComponentNode } from "../../core/resolver";

/** Maps A2UI v1.0 `justify` enum values onto `nsh` `ViewStyle.justifyContent`. */
export function mapJustify(
  value: unknown,
): NonNullable<ViewStyle["justifyContent"]> {
  switch (value) {
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "spaceBetween":
      return "space-between";
    case "spaceAround":
      return "space-around";
    case "spaceEvenly":
      return "space-evenly";
    case "stretch":
      return "stretch";
    case "start":
    default:
      return "flex-start";
  }
}

/** Maps A2UI v1.0 `align` enum values onto `nsh` `ViewStyle.alignItems`. */
export function mapAlign(
  value: unknown,
): NonNullable<ViewStyle["alignItems"]> {
  switch (value) {
    case "start":
      return "flex-start";
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "stretch":
    default:
      return "stretch";
  }
}

/** Extracts resolved `ComponentNode` entries from a `children` prop value. */
export function extractChildNodes(value: unknown): readonly ComponentNode[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: ComponentNode[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (isComponentNode(item)) {
      out.push(item);
    }
  }
  return out;
}
