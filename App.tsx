import { Text, View } from "nsh";
import { A2UI_PROTOCOL_VERSION } from "./src/index";

export default function App() {
  return (
    <View>
      <Text>{`a2ui-nsh ${A2UI_PROTOCOL_VERSION}`}</Text>
    </View>
  );
}
