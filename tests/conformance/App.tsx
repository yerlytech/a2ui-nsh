import { exists, readdir, readFile, writeFile } from "fs/promises";
import { host, mount, Text, View } from "nsh";
import process from "process";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReadRequest(
  payload: unknown,
): { readonly id: number; readonly path: string } | null {
  if (!isRecord(payload)) {
    return null;
  }
  const id = payload["id"];
  const path = payload["path"];
  if (typeof id !== "number" || typeof path !== "string") {
    return null;
  }
  return { id, path };
}

function parseWriteRequest(
  payload: unknown,
): { readonly id: number; readonly path: string; readonly content: string } | null {
  if (!isRecord(payload)) {
    return null;
  }
  const id = payload["id"];
  const path = payload["path"];
  const content = payload["content"];
  if (
    typeof id !== "number" ||
    typeof path !== "string" ||
    typeof content !== "string"
  ) {
    return null;
  }
  return { id, path, content };
}

function ConformanceBridgeApp() {
  if (host.available()) {
    host.on("conformance.read", (payload) => {
      const req = parseReadRequest(payload);
      if (!req) {
        return;
      }
      void (async () => {
        try {
          const content = await readFile(req.path, "utf8");
          host.post("conformance.reply", { id: req.id, ok: true, content });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          host.post("conformance.reply", { id: req.id, ok: false, error: message });
        }
      })();
    });

    host.on("conformance.exists", (payload) => {
      const req = parseReadRequest(payload);
      if (!req) {
        return;
      }
      void (async () => {
        try {
          const found = await exists(req.path);
          host.post("conformance.reply", { id: req.id, ok: true, found });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          host.post("conformance.reply", { id: req.id, ok: false, error: message });
        }
      })();
    });

    host.on("conformance.write", (payload) => {
      const req = parseWriteRequest(payload);
      if (!req) {
        return;
      }
      void (async () => {
        try {
          await writeFile(req.path, req.content);
          host.post("conformance.reply", { id: req.id, ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          host.post("conformance.reply", { id: req.id, ok: false, error: message });
        }
      })();
    });

    host.on("conformance.readdir", (payload) => {
      const req = parseReadRequest(payload);
      if (!req) {
        return;
      }
      void (async () => {
        try {
          const entries = await readdir(req.path);
          host.post("conformance.reply", { id: req.id, ok: true, entries });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          host.post("conformance.reply", { id: req.id, ok: false, error: message });
        }
      })();
    });

    host.post("conformance.env", {
      root: process.env["A2UI_CONFORMANCE_ROOT"] ?? "",
      manifest: process.env["A2UI_CONFORMANCE_MANIFEST"] ?? "",
      cwd: process.env["PWD"] ?? "",
    });
  }

  return (
    <View>
      <Text>a2ui-nsh conformance runner</Text>
    </View>
  );
}

mount(ConformanceBridgeApp);
