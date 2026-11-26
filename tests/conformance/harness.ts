/**
 * Conformance suite loader and executed-case manifest recorder.
 *
 * Reads upstream google-A2UI YAML suites at test time from
 * `A2UI_CONFORMANCE_ROOT` (defaulting to `target/refs/google-A2UI`) via a
 * headless macOS `nsh` bridge app so no upstream conformance files are ever
 * copied into this repository and zero external npm packages or Node are needed.
 */

import { open, type App } from "nsh/test";
import { parseYaml } from "./yaml";

export const DEFAULT_CONFORMANCE_ROOT = "target/refs/google-A2UI";
export const HARNESS_ID = "a2ui-nsh";

export type CaseStatus = "passed" | "failed" | "skipped" | "xfailed";

/** Single JSON Lines record matching `executed_case_manifest.schema.json`. */
export interface ManifestRecord {
  readonly harness: string;
  readonly suite: string;
  readonly case: string;
  readonly status: CaseStatus;
  readonly reason?: string;
}

export interface ConformanceExpectError {
  readonly category?: string;
  readonly message?: string;
}

export interface ConformanceCase {
  readonly name: string;
  readonly description?: string;
  readonly features?: readonly string[];
  readonly action?: string;
  readonly catalog?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

interface BridgeReply {
  readonly id: number;
  readonly ok: boolean;
  readonly content?: string;
  readonly entries?: readonly string[];
  readonly found?: boolean;
  readonly error?: string;
}

interface BridgeEnv {
  readonly root: string;
  readonly manifest: string;
  readonly cwd: string;
}

/**
 * Headless `nsh` bridge providing native `fs/promises` and env access
 * (measured on `nsh 0.6.1`, not re-measured: the outer test VM defaults to
 * `Os::Web`, while opened apps with `platform: "macos"` expose native
 * capability-checked `fs/promises`).
 */
export class ConformanceClient {
  private readonly app: App;
  private readonly env: BridgeEnv;
  private nextId = 1;

  private constructor(app: App, env: BridgeEnv) {
    this.app = app;
    this.env = env;
  }

  static async create(): Promise<ConformanceClient> {
    const app = await open("./App.tsx", {
      platform: "macos",
      host: {
        handlers: {
          "conformance.env": null,
          "conformance.reply": null,
        },
      },
    });
    const envMsg = app.host.posts().find((p) => p.name === "conformance.env");
    const env = (envMsg?.data ?? { root: "", manifest: "", cwd: "" }) as BridgeEnv;
    return new ConformanceClient(app, env);
  }

  resolveConformanceRoot(): string {
    const raw =
      this.env.root.trim().length > 0
        ? this.env.root.trim()
        : DEFAULT_CONFORMANCE_ROOT;
    if (raw.startsWith("/")) {
      return raw.replace(/\/+$/, "");
    }
    if (this.env.cwd.startsWith("/")) {
      return `${this.env.cwd.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
    }
    return raw;
  }

  private async request(
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<BridgeReply> {
    const id = this.nextId;
    this.nextId += 1;
    await this.app.host.send(eventName, { ...payload, id });
    await this.app.waitUntil(() =>
      this.app.host.posts().some((p) => {
        if (p.name !== "conformance.reply") {
          return false;
        }
        const data = p.data as BridgeReply | null;
        return data !== null && data.id === id;
      }),
    );
    const match = this.app.host.posts().find((p) => {
      if (p.name !== "conformance.reply") {
        return false;
      }
      const data = p.data as BridgeReply | null;
      return data !== null && data.id === id;
    });
    if (!match || !match.data) {
      throw new Error(`Missing bridge reply for ${eventName} #${id}`);
    }
    return match.data as BridgeReply;
  }

  async readTextFile(fullPath: string): Promise<string> {
    const reply = await this.request("conformance.read", { path: fullPath });
    if (!reply.ok || reply.content === undefined) {
      throw new Error(`Failed to read ${fullPath}: ${reply.error ?? "unknown error"}`);
    }
    return reply.content;
  }

  async fileExists(fullPath: string): Promise<boolean> {
    const reply = await this.request("conformance.exists", { path: fullPath });
    if (!reply.ok) {
      throw new Error(`Failed to stat ${fullPath}: ${reply.error ?? "unknown error"}`);
    }
    return reply.found === true;
  }

  async writeTextFile(fullPath: string, content: string): Promise<void> {
    const reply = await this.request("conformance.write", {
      path: fullPath,
      content,
    });
    if (!reply.ok) {
      throw new Error(`Failed to write ${fullPath}: ${reply.error ?? "unknown error"}`);
    }
  }

  async listDirectory(fullPath: string): Promise<readonly string[]> {
    const reply = await this.request("conformance.readdir", { path: fullPath });
    if (!reply.ok || !Array.isArray(reply.entries)) {
      throw new Error(`Failed to list ${fullPath}: ${reply.error ?? "unknown error"}`);
    }
    return reply.entries;
  }

  /** Loads and parses a YAML suite file relative to `<root>/conformance/`. */
  async loadConformanceSuite(suiteRelativePath: string): Promise<ConformanceCase[]> {
    const root = this.resolveConformanceRoot();
    const fullPath = `${root}/conformance/${suiteRelativePath}`;
    const content = await this.readTextFile(fullPath);
    const parsed = parseYaml(content);
    if (!Array.isArray(parsed)) {
      throw new Error(
        `Expected top-level YAML sequence in ${suiteRelativePath}, got ${typeof parsed}`,
      );
    }
    return parsed as ConformanceCase[];
  }

  /**
   * Merges and writes executed-case JSONL records to `A2UI_CONFORMANCE_MANIFEST`
   * when configured, replacing any prior records for the suites in `records`.
   */
  async writeManifestRecords(records: readonly ManifestRecord[]): Promise<void> {
    const manifestPath = this.env.manifest.trim();
    if (manifestPath.length === 0) {
      return;
    }

    const suitesInBatch = new Set(records.map((r) => r.suite));
    const preservedLines: string[] = [];

    if (await this.fileExists(manifestPath)) {
      const existing = await this.readTextFile(manifestPath);
      for (const line of existing.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }
        try {
          const parsed = JSON.parse(trimmed) as Partial<ManifestRecord>;
          if (parsed.suite && suitesInBatch.has(parsed.suite)) {
            continue;
          }
        } catch {
          // Keep unrelated lines intact.
        }
        preservedLines.push(trimmed);
      }
    }

    for (const rec of records) {
      const payload: Record<string, string> = {
        harness: rec.harness,
        suite: rec.suite,
        case: rec.case,
        status: rec.status,
      };
      if (rec.reason !== undefined) {
        payload["reason"] = rec.reason;
      }
      preservedLines.push(JSON.stringify(payload));
    }

    await this.writeTextFile(manifestPath, preservedLines.join("\n") + "\n");
  }

  /**
   * Loads `suitePath`, executes each non-skipped case, writes the manifest,
   * fails on any case failure, and fails on any stale entry in `skips`.
   */
  async runSuite(
    suitePath: string,
    executor: (tc: ConformanceCase) => void | Promise<void>,
    skips: ReadonlyMap<string, string> = new Map(),
  ): Promise<ManifestRecord[]> {
    const cases = await this.loadConformanceSuite(suitePath);
    const records: ManifestRecord[] = [];
    const seenCases = new Set<string>();
    const failures: string[] = [];

    for (const tc of cases) {
      seenCases.add(tc.name);
      const skipReason = skips.get(tc.name);
      if (skipReason !== undefined) {
        records.push({
          harness: HARNESS_ID,
          suite: suitePath,
          case: tc.name,
          status: "skipped",
          reason: skipReason,
        });
        continue;
      }
      try {
        await executor(tc);
        records.push({
          harness: HARNESS_ID,
          suite: suitePath,
          case: tc.name,
          status: "passed",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        records.push({
          harness: HARNESS_ID,
          suite: suitePath,
          case: tc.name,
          status: "failed",
        });
        failures.push(`${tc.name}: ${msg}`);
      }
    }

    for (const staleName of skips.keys()) {
      if (!seenCases.has(staleName)) {
        failures.push(`stale skip entry "${staleName}" not found in ${suitePath}`);
      }
    }

    await this.writeManifestRecords(records);

    if (failures.length > 0) {
      throw new Error(
        `${suitePath}: ${failures.length}/${cases.length} failed:\n${failures.join("\n")}`,
      );
    }
    return records;
  }
}

/** Matches a thrown error against an upstream `expectError` / `expect_error` spec. */
export function assertMatchesExpectedError(
  err: unknown,
  expected: ConformanceExpectError,
  contextLabel: string,
): void {
  if (!(err instanceof Error)) {
    throw new Error(`${contextLabel}: expected Error instance, got ${String(err)}`);
  }
  if (expected.category) {
    const actualCategory = (err as { category?: string }).category;
    const matchesCategory =
      actualCategory === expected.category ||
      err.name.includes(expected.category) ||
      err.message.includes(expected.category);
    if (!matchesCategory) {
      throw new Error(
        `${contextLabel}: expected error category "${expected.category}", got ${err.name} (${actualCategory ?? "none"}): ${err.message}`,
      );
    }
  }
  if (expected.message) {
    const matchesMessage =
      err.message.toLowerCase().includes(expected.message.toLowerCase()) ||
      new RegExp(expected.message).test(err.message);
    if (!matchesMessage) {
      throw new Error(
        `${contextLabel}: expected error message matching "${expected.message}", got "${err.message}"`,
      );
    }
  }
}
