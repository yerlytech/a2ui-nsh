/**
 * Probe app for `horizontal_list.test.tsx`: a `<List horizontal>` of three
 * 60x40 cells without a height, the same list with `height: 40`, and the
 * `<Scroll horizontal>` row `BasicList` renders instead.
 */

import { List, Scroll, Text, View, mount, type JSX } from "nsh";

const ITEMS = ["a", "b", "c"];

function Cell(props: { id: string; label: string }): JSX.Element {
  return (
    <View testID={props.id} style={{ width: 60, height: 40 }}>
      <Text>{props.label}</Text>
    </View>
  );
}

function ListProbe(): JSX.Element {
  return (
    <View style={{ width: 320, flexDirection: "column" }}>
      <List testID="auto" horizontal each={ITEMS} keyExtractor={(k) => k} estimatedItemSize={60}>
        {(item) => <Cell id={`auto:${item()}`} label={item()} />}
      </List>
      <View testID="afterAuto" style={{ height: 10 }} />
      <List testID="fixed" horizontal each={ITEMS} keyExtractor={(k) => k} estimatedItemSize={60} style={{ height: 40 }}>
        {(item) => <Cell id={`fixed:${item()}`} label={item()} />}
      </List>
      <Scroll testID="scroll" horizontal>
        <View style={{ flexDirection: "row" }}>
          {ITEMS.map((k) => (
            <Cell id={`scroll:${k}`} label={k} />
          ))}
        </View>
      </Scroll>
    </View>
  );
}

mount(ListProbe);
