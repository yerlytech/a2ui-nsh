import { describe, expect, test } from "nsh/test";
import { signal } from "nsh";
import {
  buildAccessibilitySnapshot,
  buildViewAccessibilityProps,
  liveRegionReadingFor,
  mapNativeLiveRegion,
  needsAccessibilityWrapper,
  normalizeAccessibility,
  resolveEffectiveLabel,
  useLiveRegionAnnouncement,
  type ResolvedAccessibility,
} from "./accessibility";

describe("renderer/accessibility", () => {
  test("normalizes raw @accessibility attributes and filters empty or invalid values", () => {
    expect(normalizeAccessibility(undefined)).toEqual({});
    expect(
      normalizeAccessibility({
        label: "Mute Notifications",
        description: "Silences alerts",
        live: "polite",
        hidden: false,
      }),
    ).toEqual({
      label: "Mute Notifications",
      description: "Silences alerts",
      live: "polite",
      hidden: false,
    });

    expect(
      normalizeAccessibility({
        label: "",
        description: null,
        live: "invalid",
        hidden: "yes",
      }),
    ).toEqual({});
  });

  test("explicit @accessibility.label overrides fallback label", () => {
    expect(resolveEffectiveLabel({ label: "Explicit" }, "Fallback")).toBe(
      "Explicit",
    );
    expect(resolveEffectiveLabel({}, "Fallback")).toBe("Fallback");
    expect(resolveEffectiveLabel({}, "")).toBeUndefined();
  });

  test("builds ViewAccessibilityProps for assertive live regions, hidden subtrees, and decorative defaults", () => {
    const alertProps = buildViewAccessibilityProps(
      { label: "Critical Alert", live: "assertive" },
      { defaultRole: "text" },
    );
    expect(alertProps).toEqual({
      role: "alert",
      accessibilityLabel: "Critical Alert",
      accessibilityLiveRegion: "assertive",
    });

    // Since nsh 0.7.0, nsh reads the plain prop on every platform with live regions (#2816).
    expect(
      buildViewAccessibilityProps({ live: "polite" }, { defaultRole: "text" }),
    ).toEqual({ role: "text", accessibilityLiveRegion: "polite" });
    expect(buildViewAccessibilityProps({ live: "off" })).toEqual({
      accessibilityLiveRegion: "none",
    });
    expect(mapNativeLiveRegion(undefined)).toBeUndefined();

    const hiddenProps = buildViewAccessibilityProps({ hidden: true });
    expect(hiddenProps).toEqual({
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
    });

    // Decorative by default hides element unless label/description or hidden:false is given.
    expect(
      buildViewAccessibilityProps({}, { decorativeByDefault: true }),
    ).toEqual({
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
    });
    expect(
      buildViewAccessibilityProps(
        { label: "Star icon" },
        { decorativeByDefault: true, defaultRole: "image" },
      ),
    ).toEqual({
      role: "image",
      accessibilityLabel: "Star icon",
    });
    expect(
      buildViewAccessibilityProps(
        { hidden: false },
        { decorativeByDefault: true },
      ),
    ).toEqual({});
  });

  test("detects when nsh/base wrapper is needed and builds deterministic snapshots", () => {
    expect(needsAccessibilityWrapper({})).toBe(false);
    expect(needsAccessibilityWrapper({ live: "off" })).toBe(false);
    expect(needsAccessibilityWrapper({ description: "Extra hint" })).toBe(true);
    expect(needsAccessibilityWrapper({ hidden: true })).toBe(true);
    expect(needsAccessibilityWrapper({ live: "polite" })).toBe(true);

    expect(
      buildAccessibilitySnapshot(
        { label: "Banner", description: "Detail", live: "assertive" },
        { defaultRole: "text" },
      ),
    ).toEqual({
      label: "Banner",
      description: "Detail",
      live: "assertive",
      hidden: false,
      role: "alert",
    });
  });

  test("liveRegionReadingFor follows nsh 0.7.1 live-region support by platform", () => {
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
    expect(liveRegionReadingFor("macos", "terminal")).toEqual({
      changes: false,
      alertsOnAppear: false,
    });
  });

  test("useLiveRegionAnnouncement announces assertive on mount and polite/assertive on updates unless hidden", () => {
    const announced: string[] = [];
    const a11y = signal<ResolvedAccessibility>({ live: "polite" });
    const message = signal("Status: Idle");
    const noLiveRegions = { changes: false, alertsOnAppear: false };

    useLiveRegionAnnouncement(
      a11y,
      message,
      (msg) => announced.push(msg),
      noLiveRegions,
    );
    // Polite does not announce initial mount.
    expect(announced).toEqual([]);

    message.set("Status: Syncing");
    expect(announced).toEqual(["Status: Syncing"]);

    // Hidden suppresses announcement.
    a11y.set({ live: "assertive", hidden: true });
    message.set("Hidden alert");
    expect(announced).toEqual(["Status: Syncing"]);

    // Unhidden assertive announces changes.
    a11y.set({ live: "assertive", hidden: false });
    message.set("Connection Lost!");
    expect(announced).toEqual(["Status: Syncing", "Connection Lost!"]);

    // Fresh assertive region announces immediately on mount.
    const assertiveAnnounced: string[] = [];
    const alertA11y = signal<ResolvedAccessibility>({ live: "assertive" });
    const alertMsg = signal("Disk full");
    useLiveRegionAnnouncement(
      alertA11y,
      alertMsg,
      (msg) => assertiveAnnounced.push(msg),
      noLiveRegions,
    );
    expect(assertiveAnnounced).toEqual(["Disk full"]);
  });

  test("useLiveRegionAnnouncement stays silent where the platform reads live regions and alerts itself", () => {
    const announced: string[] = [];
    const a11y = signal<ResolvedAccessibility>({ live: "assertive" });
    const message = signal("Disk full");
    useLiveRegionAnnouncement(a11y, message, (msg) => announced.push(msg), {
      changes: true,
      alertsOnAppear: true,
    });
    message.set("Disk almost full");
    a11y.set({ live: "polite" });
    message.set("Saved");
    expect(announced).toEqual([]);

    // Android, Windows and Linux read changes but not an alert as it appears.
    const androidAnnounced: string[] = [];
    const androidMsg = signal("Connection lost");
    useLiveRegionAnnouncement(
      signal<ResolvedAccessibility>({ live: "assertive" }),
      androidMsg,
      (msg) => androidAnnounced.push(msg),
      { changes: true, alertsOnAppear: false },
    );
    androidMsg.set("Reconnecting");
    expect(androidAnnounced).toEqual(["Connection lost"]);
  });
});
