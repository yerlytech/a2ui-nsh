/**
 * XL phone trial: three screens an XL user opens first on iOS and Android.
 *
 * The Customers screen is `examples/erp-customers/` itself (its list and edit
 * form). Register and Summary are xlarge catalog screens built from the
 * shapes captured in `tests/fixtures/xlarge/` (`crm-deals.json` Form/Field,
 * `detail-synthetic.json` Detail, `metric-synthetic.json` Metric).
 */

import {
  Scroll,
  Text,
  View,
  cleanup,
  host,
  keyboardFrame,
  safeArea,
  signal,
  type JSX,
} from "nsh";
import { Button } from "nsh/base";
import {
  A2uiStore,
  A2uiSurface,
  BASIC_CATALOG_V1_ID,
  Catalog,
  buildV10BasicCatalogDocument,
  createBasicCatalogRegistry,
  registerXlargeCatalogComponents,
} from "../../src/index";
import { ErpCustomersApp } from "../erp-customers/ErpCustomersApp";
import registerMessages from "./a2ui/register.json";
import summaryMessages from "./a2ui/summary.json";
import xlargeCatalog from "./a2ui/xlarge_catalog.json";

type Screen = "customers" | "register" | "summary";

const SCREENS: readonly { id: Screen; label: string }[] = [
  { id: "customers", label: "Customers" },
  { id: "register", label: "Register" },
  { id: "summary", label: "Summary" },
];

const WORDS: Readonly<Record<string, string>> = {
  "crm.title.new_customer": "New customer",
  "crm.form.new_customer": "Customer details",
  "crm.action.save_customer": "Save customer",
  "crm.field.name": "Company name",
  "crm.field.email": "Billing email",
  "crm.field.phone": "Phone",
  "crm.field.segment": "Segment",
  "crm.field.amount": "Annual value",
  "crm.field.note": "Notes",
  "crm.field.notes": "Notes",
  "crm.field.contract_start": "Contract start",
  "crm.example.name": "Cobalt Harbor Supply",
  "crm.example.email": "finance@cobaltharbor.example",
  "crm.example.phone": "+1 555 010 200",
  "crm.example.amount": "25000",
  "crm.example.note": "Prefers monthly invoices.",
  "crm.segment.smb": "SMB",
  "crm.segment.midmarket": "Mid-market",
  "crm.segment.enterprise": "Enterprise",
  "crm.title.customer_summary": "Customer summary",
  "crm.kpi.annual_value": "Annual value",
  "crm.kpi.open_deals": "Open deals",
  "crm.kpi.this_year": "This year",
  "crm.kpi.this_month": "This month",
  "crm.field.tax_id": "Tax ID",
  "crm.field.payment_terms": "Payment terms",
  "crm.field.address": "Address",
  "crm.field.city": "City",
  "crm.field.country": "Country",
  "crm.terms.net15": "Net 15",
  "crm.terms.net30": "Net 30",
  "crm.terms.net45": "Net 45",
  "crm.terms.net60": "Net 60",
  "crm.chart.quarterly": "Quarterly revenue",
};

function initialScreen(raw: unknown): Screen {
  return raw === "register" || raw === "summary" ? raw : "customers";
}

function actionContextName(context: unknown): string | undefined {
  if (typeof context !== "object" || context === null || Array.isArray(context)) {
    return undefined;
  }
  const name = (context as Record<string, unknown>)["name"];
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

export function XlPhoneApp(): JSX.Element {
  const params = host.params ?? {};
  const screen = signal<Screen>(initialScreen(params["screen"]));
  const actionCount = signal(0);
  const lastAction = signal("none");
  const errorCount = signal(0);
  const debug = signal(params["debug"] === true);
  host.on("xl.debug", (payload) => debug.set(payload === true));

  const registry = createBasicCatalogRegistry(BASIC_CATALOG_V1_ID);
  registerXlargeCatalogComponents(registry, {
    translate: (code) => WORDS[code] ?? code,
    requiredMessage: "Required",
    emptyMessage: "No customers",
    searchPlaceholder: "Search customers",
  });

  const store = new A2uiStore({
    catalogs: [
      Catalog.fromJson(buildV10BasicCatalogDocument()),
      Catalog.fromJson(xlargeCatalog),
    ],
    strictMode: true,
    onAction: (envelope) => {
      actionCount.set(actionCount() + 1);
      const name = actionContextName(envelope.action.context);
      lastAction.set(name === undefined ? envelope.action.name : `${envelope.action.name}:${name}`);
    },
    onError: () => {
      errorCount.set(errorCount() + 1);
    },
  });

  store.processMessages(registerMessages);
  store.processMessages(summaryMessages);

  const navButton = (id: Screen, label: string): JSX.Element => (
    <Button
      testID={`nav-${id}`}
      accessibilityLabel={label}
      onPress={() => screen.set(id)}
      class={
        screen() === id
          ? "min-h-[44px] flex-1 rounded-(--radius) bg-primary px-3 py-2"
          : "min-h-[44px] flex-1 rounded-(--radius) bg-secondary px-3 py-2"
      }
    >
      <Text
        class={
          screen() === id
            ? "text-sm font-medium text-primary-foreground"
            : "text-sm font-medium text-secondary-foreground"
        }
      >
        {label}
      </Text>
    </Button>
  );

  cleanup(() => {
    store.dispose();
  });

  return (
    <View
      class="flex-1 bg-background"
      style={{
        paddingTop: safeArea().top,
        paddingRight: safeArea().right,
        paddingBottom: safeArea().bottom,
        paddingLeft: safeArea().left,
      }}
    >
      <View
        testID="xl-nav"
        class="flex-row items-center gap-2 border-b border-border bg-card px-3 py-2"
      >
        <Each of={SCREENS} key={(item) => item.id}>
          {(item) => navButton(item().id, item().label)}
        </Each>
      </View>
      <View class="flex-1">
        <If when={screen() === "customers"}>
          <ErpCustomersApp />
        </If>
        <If when={screen() !== "customers"}>
          <Scroll
            testID="xl-scroll"
            class="flex-1"
            contentClass="p-4"
            keyboardShouldPersistTaps="handled"
          >
            <Each of={store.surfaces()} key={(surface) => surface.surfaceId}>
              {(surface) => (
                <If when={surface().surfaceId === screen()}>
                  <A2uiSurface store={surface()} registry={registry} />
                </If>
              )}
            </Each>
          </Scroll>
        </If>
      </View>
      <If when={debug()}>
      <View testID="xl-status" class="border-t border-border bg-muted px-3 py-1">
        <Text class="text-xs text-muted-foreground">
          {`actions=${actionCount()} last=${lastAction()} errors=${errorCount()}`}
        </Text>
        <Text testID="xl-phone-metrics" class="text-xs text-muted-foreground">
          {`safe=${safeArea().top},${safeArea().bottom} keyboard=${keyboardFrame().height}`}
        </Text>
      </View>
      </If>
    </View>
  );
}
