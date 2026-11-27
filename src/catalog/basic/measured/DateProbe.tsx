/**
 * Probe app for `date_values.test.tsx`: one `nsh/base` `<DatePicker>` or
 * `<TimeField>` given the raw `value` from `host.params`.
 */

import { Text, View, host, mount, type JSX } from "nsh";
import { DatePicker, TimeField } from "nsh/base";

function DateProbe(): JSX.Element {
  const params = (host.params ?? {}) as { kind?: string; value?: string };
  return (
    <View class="flex-1 gap-2 p-4">
      {params.kind === "date" ? (
        <DatePicker
          value={params.value ?? null}
          trigger={
            <View testID="trigger" style={{ width: 160, height: 44 }}>
              <Text>open</Text>
            </View>
          }
        />
      ) : (
        <TimeField value={params.value ?? null} />
      )}
    </View>
  );
}

mount(DateProbe);
