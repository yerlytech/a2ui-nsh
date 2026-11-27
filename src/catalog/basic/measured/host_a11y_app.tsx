/**
 * Headless app entry for the `nsh/base` component-host accessibility probe
 * (`host_a11y.test.tsx`); it draws a host and a plain view with the same
 * `accessibilityDescription`.
 *
 * `Button` is cast because `ComponentHostProps` does not declare the view
 * accessibility props the probe passes it (the gap it measures).
 */

import { mount, type JSX } from "nsh";
import { Text, View } from "nsh";
import { Button } from "nsh/base";

const ButtonWithViewA11y = Button as unknown as (props: {
  testID?: string;
  accessibilityLabel?: string;
  accessibilityDescription?: string;
  accessibilityElementsHidden?: boolean;
  children?: JSX.Element;
}) => JSX.Element;

export function HostA11yProbe() {
  return (
    <View testID="root">
      <ButtonWithViewA11y
        testID="host"
        accessibilityLabel="Host label"
        accessibilityDescription="Host description"
        accessibilityElementsHidden={true}
      >
        <Text>Host child</Text>
      </ButtonWithViewA11y>
      <Text
        testID="plain"
        accessibilityLabel="Plain label"
        accessibilityDescription="Plain description"
      >
        Plain child
      </Text>
    </View>
  );
}

mount(HostA11yProbe);
