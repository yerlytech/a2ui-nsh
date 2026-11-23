/**
 * Real-target probe (spec 003, round 2): does `nsh`'s `<Image>` draw an SVG
 * `data:image/svg+xml` URI, the way xlarge's `QrCode` draws the SVG its server
 * made? A PNG data URI is the control. Each picture shows
 * `<kind>:loaded <w>x<h>` on `onLoad`, `<kind>:failed <message>` on `onError`,
 * and `<kind>:waiting` before either.
 */

import { Image, Text, View, mount, signal, type JSX } from "nsh";
import { qrPictureUrl } from "../../src/catalog/xlarge/QrCode";

/** A small QR-like drawing, as xlarge's server sends it. */
export const SERVER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" width="232" height="232">' +
  '<rect width="29" height="29" fill="#fff"/>' +
  '<path d="M4 4h7v7H4zM18 4h7v7h-7zM4 18h7v7H4zM13 13h3v3h-3z" fill="#000"/></svg>';

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function Probe(props: { kind: string; src: string | undefined }): JSX.Element {
  const status = signal(`${props.kind}:waiting`);
  return (
    <View class="gap-1">
      <Image
        testID={props.kind}
        src={props.src}
        style={{ width: 176, height: 176 }}
        onLoad={(e) => status.set(`${props.kind}:loaded ${e.size.width}x${e.size.height}`)}
        onError={(e) => status.set(`${props.kind}:failed ${e.message}`)}
      />
      <Text testID={`${props.kind}:status`}>{status()}</Text>
    </View>
  );
}

function SvgProbe(): JSX.Element {
  return (
    <View class="flex-1 gap-2 bg-background p-4">
      <Probe kind="svg" src={qrPictureUrl(SERVER_SVG)} />
      <Probe kind="png" src={PNG} />
    </View>
  );
}

mount(SvgProbe);
