/**
 * Probe app for `press_innermost.test.tsx`: a pressable `<View>` inside a
 * pressable `<View>`, and an `nsh/base` `<Button>` inside a pressable
 * `<View>`, each counting its own `onPress` calls.
 */

import { Text, View, mount, signal, type JSX } from "nsh";
import { Button } from "nsh/base";

function PressProbe(): JSX.Element {
  const outer = signal(0);
  const inner = signal(0);
  const outerOfButton = signal(0);
  const button = signal(0);
  return (
    <View class="flex-1 gap-2 p-4">
      <View testID="outer" onPress={() => outer.set(outer() + 1)} style={{ padding: 16 }}>
        <View testID="inner" onPress={() => inner.set(inner() + 1)} style={{ padding: 8 }}>
          <Text>inner</Text>
        </View>
      </View>
      <View testID="outerOfButton" onPress={() => outerOfButton.set(outerOfButton() + 1)} style={{ padding: 16 }}>
        <Button testID="button" onPress={() => button.set(button() + 1)}>
          <Text>Go</Text>
        </Button>
      </View>
      <Text>{`outer=${outer()} inner=${inner()} outerOfButton=${outerOfButton()} button=${button()}`}</Text>
    </View>
  );
}

mount(PressProbe);
