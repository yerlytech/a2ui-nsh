/**
 * xlarge catalog `Chart` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Draws the bound `data` (rows of `{ label, value, caption? }`, as
 * `lab_samples.figures` answers them) as `kind` says, the way xlarge's web
 * client does: a `sparkline` (a small line beside its big figure, the last
 * value or, with `sum`, the exact total), a `line`, `bars`, or anything else
 * a donut. Kept from Native Shell 0.6.1: `nsh 0.7.0` has a `Plot` primitive
 * (`nsh/base/plot`), and this still draws the shapes on `Canvas`; moving to it
 * is a separate change, and no chart library is added. Values are formatted by
 * `format` (default `number`) from the text they came as, never through a
 * float; only the drawing's geometry reads them as numbers. Labels are
 * translated with `labelPrefix`, else formatted by `labelFormat`; `tones`
 * colours a label's bar or slice with xlarge's tone word; `label` (a code)
 * names the chart.
 *
 * Every chart but a sparkline lists its points with their values under the
 * drawing, so nothing it says is said only in colour or shape. In a terminal
 * (`terminal` option) there is no drawing: the same points show as a table.
 * No points says `chart.nothing`, translated.
 */

import {
  Canvas,
  Text,
  View,
  computed,
  token,
  type CanvasRenderingContext2D,
  type JSX,
} from "nsh";
import { Table, TableBody, TableCell, TableRow } from "nsh/base";
import {
  unwrapBinding,
  unwrapOptionalString,
  type A2uiComponentProps,
} from "../../renderer/A2uiSurface";
import type { A2uiComponentRenderer } from "../../renderer/registry";
import type { ResolvedXlargeOptions } from "./context";
import {
  chartHeadline,
  chartKind,
  chartPoints,
  pieShares,
  type ChartPoint,
  type StateTone,
} from "./model";

/** The drawing's height, in points. */
const CHART_HEIGHT = 200;
const SPARKLINE_WIDTH = 112;
const SPARKLINE_HEIGHT = 32;
const PALETTE = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;
/** The theme has no success or warning colour; two chart colours stand in. */
const TONE_TOKEN: Readonly<Record<StateTone, Parameters<typeof token>[0]>> = {
  neutral: "muted-foreground",
  info: "primary",
  success: "chart-2",
  warning: "chart-4",
  danger: "destructive",
};

function pointColor(point: ChartPoint, index: number): string {
  return point.tone !== undefined
    ? String(token(TONE_TOKEN[point.tone]))
    : String(token(PALETTE[index % PALETTE.length] ?? "chart-1"));
}

function drawBars(
  cx: CanvasRenderingContext2D,
  points: readonly ChartPoint[],
  width: number,
  height: number,
): void {
  const top = Math.max(1, ...points.map((point) => point.size));
  const slot = width / points.length;
  const bar = Math.max(1, slot * 0.7);
  points.forEach((point, index) => {
    const tall = point.size > 0 ? (point.size / top) * height : 0;
    cx.fillStyle = pointColor(point, index);
    cx.fillRect(index * slot + (slot - bar) / 2, height - tall, bar, tall);
  });
}

/** A line from zero to the highest value, as xlarge draws its line and sparkline. */
function drawLine(
  cx: CanvasRenderingContext2D,
  points: readonly ChartPoint[],
  width: number,
  height: number,
  pad: number,
): void {
  const top = Math.max(1, ...points.map((point) => point.size));
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  cx.strokeStyle = token("primary");
  cx.lineWidth = 2;
  cx.beginPath();
  points.forEach((point, index) => {
    const x = pad + index * step;
    const y = height - pad - (Math.max(0, point.size) / top) * (height - pad * 2);
    if (index === 0) {
      cx.moveTo(x, y);
    } else {
      cx.lineTo(x, y);
    }
  });
  cx.stroke();
}

function drawDonut(
  cx: CanvasRenderingContext2D,
  points: readonly ChartPoint[],
  width: number,
  height: number,
): void {
  const shares = pieShares(points);
  const radius = Math.min(width, height) / 2 - 2;
  if (radius <= 0) {
    return;
  }
  const centerX = width / 2;
  const centerY = height / 2;
  let start = -Math.PI / 2;
  shares.forEach((share, index) => {
    if (share <= 0) {
      return;
    }
    const end = start + share * Math.PI * 2;
    cx.fillStyle = pointColor(points[index]!, index);
    cx.beginPath();
    cx.moveTo(centerX, centerY);
    cx.arc(centerX, centerY, radius, start, end);
    cx.closePath();
    cx.fill();
    start = end;
  });
  // The hole that makes it a donut, in the card's colour.
  cx.fillStyle = token("card");
  cx.beginPath();
  cx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
  cx.fill();
}

export function createXlargeChart(
  options: ResolvedXlargeOptions,
): A2uiComponentRenderer {
  return function XlargeChart(props: A2uiComponentProps): JSX.Element {
    const dataProp = props.bridge.prop("data");
    const kindProp = props.bridge.prop("kind");
    const formatProp = props.bridge.prop("format");
    const labelProp = props.bridge.prop("label");
    const labelFormatProp = props.bridge.prop("labelFormat");
    const labelPrefixProp = props.bridge.prop("labelPrefix");
    const sumProp = props.bridge.prop("sum");
    const tonesProp = props.bridge.prop("tones");

    const kind = computed(() => chartKind(unwrapBinding(kindProp())));
    const format = computed(() => unwrapBinding(formatProp()));
    const points = computed(() =>
      chartPoints(
        unwrapBinding(dataProp()),
        {
          format: format(),
          labelFormat: unwrapBinding(labelFormatProp()),
          labelPrefix: unwrapBinding(labelPrefixProp()),
          tones: unwrapBinding(tonesProp()),
        },
        options.translate,
      ),
    );
    const title = computed(() => {
      const code = unwrapOptionalString(labelProp());
      return code !== undefined ? options.translate(code) : "";
    });
    const sparkline = computed(() => kind() === "sparkline");
    const headline = computed(() => chartHeadline(points(), unwrapBinding(sumProp()), format()));
    // A line is one colour; bars and slices take the palette in turn.
    const legend = computed(() =>
      points().map((point, index) => ({
        point,
        color: kind() === "line" ? token("primary") : pointColor(point, index),
      })),
    );
    const said = computed(() => points().map((point) => `${point.label}: ${point.value}`).join(", "));
    const drawn = computed(() => !options.terminal && points().length > 0);

    return (
      <View testID={`${props.testId}:container`} class="gap-2">
        <If when={sparkline()}>
          <View class="flex-row items-end justify-between gap-4">
            <View class="flex-1 gap-1">
              <Text testID={`${props.testId}:headline`} class="text-3xl font-bold text-foreground">
                {headline() !== "" ? headline() : "—"}
              </Text>
              <Text testID={`${props.testId}:title`} class="text-sm text-muted-foreground">
                {title()}
              </Text>
            </View>
            <If when={drawn()}>
              <Canvas
                testID={props.testId}
                role="image"
                accessibilityLabel={said()}
                style={{ width: SPARKLINE_WIDTH, height: SPARKLINE_HEIGHT }}
                draw={(cx, size) => {
                  const width = size.width > 0 ? size.width : SPARKLINE_WIDTH;
                  const height = size.height > 0 ? size.height : SPARKLINE_HEIGHT;
                  cx.clearRect(0, 0, width, height);
                  if (points().length > 0) {
                    drawLine(cx, points(), width, height, 2);
                  }
                }}
              />
            </If>
          </View>
        </If>
        <If when={!sparkline() && title() !== ""}>
          <Text testID={`${props.testId}:title`} role="header" class="text-sm font-semibold text-foreground">
            {title()}
          </Text>
        </If>
        <If when={!sparkline() && drawn()}>
          <Canvas
            testID={props.testId}
            role="image"
            accessibilityLabel={said()}
            class="w-full"
            style={{ height: CHART_HEIGHT }}
            draw={(cx, size) => {
              const shown = points();
              const width = size.width > 0 ? size.width : 320;
              const height = size.height > 0 ? size.height : CHART_HEIGHT;
              cx.clearRect(0, 0, width, height);
              if (shown.length === 0) {
                return;
              }
              const shape = kind();
              if (shape === "line") {
                drawLine(cx, shown, width, height, 24);
              } else if (shape === "bars") {
                drawBars(cx, shown, width, height);
              } else {
                drawDonut(cx, shown, width, height);
              }
            }}
          />
          <View testID={`${props.testId}:legend`} class="flex-row flex-wrap gap-x-4 gap-y-1">
            <Each of={legend()} key={(entry) => entry.point.key}>
              {(entry) => (
                <View
                  testID={`${props.testId}:point:${entry().point.key}`}
                  class="flex-row items-center gap-1"
                  accessibilityLabel={`${entry().point.label}: ${entry().point.value}`}
                >
                  <View class="h-3 w-3 rounded-sm" style={{ backgroundColor: entry().color }} />
                  <Text class="text-xs text-muted-foreground">{entry().point.label}</Text>
                  <Text class="text-xs text-foreground">{entry().point.value}</Text>
                </View>
              )}
            </Each>
          </View>
        </If>
        <If when={!sparkline() && options.terminal && points().length > 0}>
          <Table testID={props.testId} accessibilityLabel={title() !== "" ? title() : said()} class="border border-border">
            <TableBody>
              <Each of={points()} key={(point) => point.key}>
                {(point) => (
                  <TableRow>
                    <View
                      testID={`${props.testId}:point:${point().key}`}
                      class="flex-row"
                      accessibilityLabel={`${point().label}: ${point().value}`}
                    >
                      <TableCell class="flex-1 px-2">
                        <Text class="text-sm text-foreground">{point().label}</Text>
                      </TableCell>
                      <TableCell class="w-32 px-2">
                        <Text class="text-sm text-foreground">{point().value}</Text>
                      </TableCell>
                    </View>
                  </TableRow>
                )}
              </Each>
            </TableBody>
          </Table>
        </If>
        <If when={points().length === 0}>
          <Text testID={`${props.testId}:empty`} class="text-sm text-muted-foreground">
            {options.translate("chart.nothing")}
          </Text>
        </If>
      </View>
    );
  };
}
