import { describe, expect, test } from "nsh/test";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  liveRegionReadingFor,
  mapAndroidLiveRegion,
  mapNativeLiveRegion,
  needsAccessibilityWrapper,
  normalizeAccessibility,
  resolveEffectiveHidden,
  resolveEffectiveLabel,
  resolveEffectiveRole,
} from "./accessibility";

// One rule per test for src/renderer/accessibility.ts. The broad scenarios live
// in accessibility.test.ts; this file pins each rule on its own.

describe("renderer accessibility rules", () => {
  test("normalizeAccessibility keeps only non-empty strings, known live modes and booleans", () => {
    expect(normalizeAccessibility(undefined)).toEqual({});

    const empty = normalizeAccessibility({ label: "", description: "" });
    expect(empty).toEqual({});
    expect(Object.keys(empty)).toEqual([]);

    const nonString = normalizeAccessibility({ label: 42 });
    expect(nonString).toEqual({});
    expect(Object.keys(nonString)).toEqual([]);

    expect(normalizeAccessibility({ live: "rude" })).toEqual({});
    expect(normalizeAccessibility({ live: "POLITE" })).toEqual({});
    expect(normalizeAccessibility({ hidden: "true" })).toEqual({});
    expect(normalizeAccessibility({ live: "off" })).toEqual({ live: "off" });
    expect(normalizeAccessibility({ live: "polite" })).toEqual({
      live: "polite",
    });
    expect(normalizeAccessibility({ live: "assertive" })).toEqual({
      live: "assertive",
    });
    expect(normalizeAccessibility({ hidden: true })).toEqual({ hidden: true });
    expect(normalizeAccessibility({ hidden: false })).toEqual({
      hidden: false,
    });

    const dropped = normalizeAccessibility({
      label: "",
      description: 42,
      live: "rude",
      hidden: "true",
    });
    expect(dropped).toEqual({});
    expect(Object.keys(dropped)).toEqual([]);
  });

  test("resolveEffectiveLabel prefers an explicit label over the fallback", () => {
    expect(resolveEffectiveLabel({ label: "Explicit" }, "Fallback")).toBe(
      "Explicit",
    );
    expect(resolveEffectiveLabel({}, "")).toBeUndefined();
    expect(resolveEffectiveLabel({}, "Fallback")).toBe("Fallback");
  });

  test("mapNativeLiveRegion maps each A2UI live mode to its native value", () => {
    expect(mapNativeLiveRegion("polite")).toBe("polite");
    expect(mapNativeLiveRegion("assertive")).toBe("assertive");
    expect(mapNativeLiveRegion("off")).toBe("none");
    expect(mapNativeLiveRegion(undefined)).toBeUndefined();
    expect(mapAndroidLiveRegion).toBe(mapNativeLiveRegion);
  });

  test("resolveEffectiveHidden honours explicit hidden and hides decorative elements without text", () => {
    expect(
      resolveEffectiveHidden({ hidden: true }, { decorativeByDefault: true }),
    ).toBe(true);
    expect(
      resolveEffectiveHidden({ hidden: false }, { decorativeByDefault: true }),
    ).toBe(false);
    expect(resolveEffectiveHidden({}, { decorativeByDefault: true })).toBe(
      true,
    );
    expect(
      resolveEffectiveHidden({ label: "Star" }, { decorativeByDefault: true }),
    ).toBe(false);
    expect(
      resolveEffectiveHidden(
        {},
        { decorativeByDefault: true, fallbackLabel: "Star" },
      ),
    ).toBe(false);
    expect(
      resolveEffectiveHidden(
        { description: "Star icon" },
        { decorativeByDefault: true },
      ),
    ).toBe(false);
    expect(resolveEffectiveHidden({})).toBe(false);
  });

  test("resolveEffectiveRole turns assertive live regions into alerts and otherwise uses defaultRole", () => {
    expect(
      resolveEffectiveRole({ live: "assertive" }, { defaultRole: "text" }),
    ).toBe("alert");
    expect(
      resolveEffectiveRole({ live: "polite" }, { defaultRole: "text" }),
    ).toBe("text");
    expect(resolveEffectiveRole({}, { defaultRole: "button" })).toBe("button");
    expect(resolveEffectiveRole({})).toBeUndefined();
  });

  test("buildViewAccessibilityProps emits native hidden and live-region props only when needed", () => {
    expect(buildViewAccessibilityProps({ hidden: true })).toEqual({
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
    });

    const notHidden = buildViewAccessibilityProps({ hidden: false });
    expect(notHidden).toEqual({});
    expect(Object.keys(notHidden)).toEqual([]);

    expect(buildViewAccessibilityProps({ live: "off" })).toEqual({
      accessibilityLiveRegion: "none",
    });
    expect(buildViewAccessibilityProps({})).toEqual({});
  });

  test("needsAccessibilityWrapper asks for a wrapper for every feature except live off", () => {
    expect(needsAccessibilityWrapper({})).toBe(false);
    expect(needsAccessibilityWrapper({ label: "Save" })).toBe(true);
    expect(needsAccessibilityWrapper({}, { fallbackLabel: "Save" })).toBe(true);
    expect(needsAccessibilityWrapper({ description: "Saves" })).toBe(true);
    expect(needsAccessibilityWrapper({ hidden: true })).toBe(true);
    expect(needsAccessibilityWrapper({}, { defaultRole: "button" })).toBe(true);
    expect(needsAccessibilityWrapper({ live: "polite" })).toBe(true);
    expect(needsAccessibilityWrapper({ live: "assertive" })).toBe(true);
    expect(needsAccessibilityWrapper({ live: "off" })).toBe(false);
  });

  test("buildAccessibilitySnapshot always reports hidden and resolves role, checked and live", () => {
    expect(buildAccessibilitySnapshot({})).toEqual({ hidden: false });

    expect(buildAccessibilitySnapshot({}, { snapshotRole: "textbox" })).toEqual({
      hidden: false,
      role: "textbox",
    });
    expect(
      buildAccessibilitySnapshot(
        { live: "assertive" },
        { defaultRole: "text", snapshotRole: "textbox" },
      ),
    ).toEqual({
      live: "assertive",
      hidden: false,
      role: "alert",
    });

    expect(buildAccessibilitySnapshot({}, { checked: false })).toEqual({
      hidden: false,
      checked: false,
    });
    expect(buildAccessibilitySnapshot({}, { checked: true })).toEqual({
      hidden: false,
      checked: true,
    });
    expect("checked" in buildAccessibilitySnapshot({})).toBe(false);

    expect(buildAccessibilitySnapshot({ live: "off" })).toEqual({
      live: "off",
      hidden: false,
    });
  });

  test("liveRegionReadingFor follows terminal and per-OS live-region support", () => {
    for (const os of [
      "android",
      "macos",
      "windows",
      "linux",
      "web",
      "ios",
      "haiku",
    ]) {
      expect(liveRegionReadingFor(os, "terminal")).toEqual({
        changes: false,
        alertsOnAppear: false,
      });
    }

    for (const os of ["android", "windows", "linux"]) {
      expect(liveRegionReadingFor(os, "desktop")).toEqual({
        changes: true,
        alertsOnAppear: false,
      });
    }
    for (const os of ["macos", "web"]) {
      expect(liveRegionReadingFor(os, "desktop")).toEqual({
        changes: true,
        alertsOnAppear: true,
      });
    }

    expect(liveRegionReadingFor("ios", "phone")).toEqual({
      changes: false,
      alertsOnAppear: false,
    });
    expect(liveRegionReadingFor("haiku", "desktop")).toEqual({
      changes: false,
      alertsOnAppear: false,
    });
  });
});
