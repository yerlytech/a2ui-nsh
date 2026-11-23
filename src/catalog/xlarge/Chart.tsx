/**
 * xlarge catalog `Chart` (`tech.yerly.xlarge/v1`) on Native Shell.
 *
 * Draws the bound `data` (rows of label and value, or an object of label →
 * value) as `kind` says: bars (the default), a line, or a pie, on a `Canvas`;
 * Native Shell 0.6.1 has no chart primitive, so the shapes are drawn with its
 * canvas, and no chart library is added. Values are formatted by `format`
 * from the text they came as (never through a float); only the drawing's
 * geometry reads them as numbers. Labels follow `labelFormat` and
 * `labelPrefix`; `tones` colours a label's bar or slice with a `Text.tone`
 * word; `sum` adds the values exactly and shows the total; `label` (a code)
 * names the chart.
 *
 * Under the drawing a legend lists every label with its value. In a terminal
 * (`terminal` option) there is no drawing: the same points show as a table,
 * which is what screen readers and the TUI target read.
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
  chartKind,
  chartPoints,
  metricText,
  pieShares,
  sumDecimals,
  type ChartPoint,
  type TextTone,
} from "./model";

/** The drawing's height, in points. */
const CHART_HEIGHT = 200;
const PALETTE = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

function pointColor(point: ChartPoint, index: number): string {
  const tone: TextTone | undefined = point.tone;
  switch (tone) {
    case "accent":
      return token("primary");
    case "danger":
      return token("destructive");
    case "muted":
      return token("muted-foreground");
    case "strong":
      return token("foreground");
    default:
      return token(PALETTE[index % PALETTE.length] ?? "chart-1");
  }
}

function drawBars(
  cx: CanvasRenderingContext2D,
  points: readonly ChartPoint[],
  width: number,
  height: number,
): void {
  const top = Math.max(...points.map((point) => point.size), 0);
  if (top <= 0) {
    return;
  }
  const slot = width / points.length;
  const bar = Math.max(1, slot * 0.7);
  points.forEach((point, index) => {
    const tall = point.size > 0 ? (point.size / top) * height : 0;
    cx.fillStyle = pointColor(point, index);
    cx.fillRect(index * slot + (slot - bar) / 2, height - tall, bar, tall);
  });
}

function drawLine(
  cx: CanvasRenderingContext2D,
  points: readonly ChartPoint[],
  width: number,
  height: number,
): void {
  const sizes = points.map((point) => point.size);
  const top = Math.max(...sizes);
  const bottom = Math.min(...sizes, 0);
  const span = top - bottom > 0 ? top - bottom : 1;
  const pad = 6;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const at = (index: number): [number, number] => [
    points.length > 1 ? pad + index * step : width / 2,
    pad + (1 - (sizes[index]! - bottom) / span) * (height - pad * 2),
  ];
  cx.strokeStyle = token("chart-1");
  cx.lineWidth = 2;
  cx.beginPath();
  points.forEach((_, index) => {
    const [x, y] = at(index);
    if (index === 0) {
      cx.moveTo(x, y);
    } else {
      cx.lineTo(x, y);
    }
  });
  cx.stroke();
  points.forEach((point, index) => {
    const [x, y] = at(index);
    cx.fillStyle = pointColor(point, 0);
    cx.beginPath();
    cx.arc(x, y, 3, 0, Math.PI * 2);
    cx.fill();
  });
}

function drawPie(
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
      return code !== undefined ? options.translate(code) : undefined;
    });
    const total = computed(() =>
      unwrapBinding(sumProp()) === true
        ? metricText(sumDecimals(points().map((point) => point.raw)), format())
        : undefined,
    );
    // A line is one colour; bars and slices take the palette in turn.
    const legend = computed(() =>
      points().map((point, index) => ({
        point,
        color: pointColor(point, kind() === "line" ? 0 : index),
      })),
    );
    const summary = computed(() =>
      [
        title(),
        ...points().map((point) => `${point.label}: ${point.value}`),
        total() !== undefined ? `${options.totalLabel}: ${total()}` : undefined,
      ]
        .filter((part) => part)
        .join(", "),
    );

    return (
      <View testID={`${props.testId}:container`} class="gap-2">
        <If when={title() !== undefined}>
          <Text testID={`${props.testId}:title`} role="header" class="text-base font-semibold text-foreground">
            {title() ?? ""}
          </Text>
        </If>
        <If when={!options.terminal && points().length > 0}>
          <Canvas
            testID={props.testId}
            role="image"
            accessibilityLabel={summary()}
            class="w-full"
            style={{ height: CHART_HEIGHT }}
            draw={(cx, size) => {
              const drawn = points();
              const width = size.width > 0 ? size.width : 320;
              const height = size.height > 0 ? size.height : CHART_HEIGHT;
              cx.clearRect(0, 0, width, height);
              if (drawn.length === 0) {
                return;
              }
              const shape = kind();
              if (shape === "pie") {
                drawPie(cx, drawn, width, height);
              } else if (shape === "line") {
                drawLine(cx, drawn, width, height);
              } else {
                drawBars(cx, drawn, width, height);
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
        <If when={options.terminal && points().length > 0}>
          <Table testID={props.testId} accessibilityLabel={title() ?? summary()} class="border border-border">
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
            {options.emptyMessage}
          </Text>
        </If>
        <If when={total() !== undefined}>
          <View testID={`${props.testId}:total`} class="flex-row gap-2" accessibilityLabel={`${options.totalLabel}: ${total() ?? ""}`}>
            <Text class="text-sm text-muted-foreground">{options.totalLabel}</Text>
            <Text class="text-sm font-semibold text-foreground">{total() ?? ""}</Text>
          </View>
        </If>
      </View>
    );
  };
}
