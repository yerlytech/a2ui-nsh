/**
 * Minimal host-handler-free A2UI v1.0 app entry for real-target tests
 * (`headless`, `--target tui`, `--target web`).
 *
 * Surfaces are fed via `host.params.messages` or `app.host.send("a2ui.message", ...)`,
 * and outbound actions/errors update a compact on-screen status strip so tests
 * can verify behavior without `open(..., { host: { handlers } })`.
 */

import {
  Scroll,
  Text,
  View,
  cleanup,
  host,
  mount,
  platform,
  signal,
  type JSX,
} from "nsh";
import {
  A2uiStore,
  A2uiSurface,
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
  createBasicCatalogRegistry,
  registerXlargeCatalogComponents,
} from "../../src/index";

function serializeCompactContext(context: unknown): string {
  try {
    return JSON.stringify(context ?? {});
  } catch {
    return "{}";
  }
}

export function TargetCatalogApp(): JSX.Element {
  const actionCount = signal(0);
  const lastActionName = signal("none");
  const lastActionContext = signal("");
  const errorCount = signal(0);
  const lastErrorCode = signal("none");

  const registry = createBasicCatalogRegistry(BASIC_CATALOG_V1_ID);
  registerXlargeCatalogComponents(registry);

  // An extra catalog definition (xlarge's, for its target suite) may come in params.
  const catalogs = [Catalog.fromJson(buildV10BasicCatalogDocument())];
  const extraCatalog = host.params?.["catalog"];
  if (extraCatalog !== undefined && extraCatalog !== null) {
    catalogs.push(Catalog.fromJson(extraCatalog));
  }

  const store = new A2uiStore({
    catalogs,
    strictMode: true,
    onAction: (envelope) => {
      actionCount.set(actionCount() + 1);
      lastActionName.set(envelope.action.name);
      lastActionContext.set(serializeCompactContext(envelope.action.context));
    },
    onError: (envelope) => {
      errorCount.set(errorCount() + 1);
      lastErrorCode.set(envelope.error.code);
    },
  });

  const initialMessages = host.params?.["messages"];
  if (initialMessages !== undefined && initialMessages !== null) {
    store.processMessages(initialMessages);
  }

  host.on("a2ui.message", (payload) => {
    store.processMessages(payload);
  });

  cleanup(() => {
    store.dispose();
  });

  return (
    <View class="flex-1 bg-background">
      <View
        testID="target-status-bar"
        class="flex-row flex-wrap gap-2 border-b border-border bg-muted px-3 py-1"
      >
        <Text testID="target-idiom" class="text-xs text-muted-foreground">
          {`idiom=${platform.idiom}`}
        </Text>
        <Text testID="target-actions" class="text-xs text-muted-foreground">
          {`actions=${actionCount()} last=${lastActionName()}`}
        </Text>
        <Text testID="target-errors" class="text-xs text-muted-foreground">
          {`errors=${errorCount()}`}
        </Text>
        <If when={lastActionContext().length > 0}>
          <Text
            testID="target-action-context"
            class="text-xs text-muted-foreground"
          >
            {lastActionContext()}
          </Text>
        </If>
        <If when={errorCount() > 0}>
          <Text testID="target-error-code" class="text-xs text-destructive">
            {`LastError: ${lastErrorCode()}`}
          </Text>
        </If>
      </View>
      <Scroll class="flex-1" contentClass="p-3">
        <Each of={store.surfaces()} key={(s) => s.surfaceId}>
          {(surface) => <A2uiSurface store={surface()} registry={registry} />}
        </Each>
      </Scroll>
    </View>
  );
}

mount(TargetCatalogApp);
