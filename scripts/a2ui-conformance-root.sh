#!/usr/bin/env bash
# Resolve the google/A2UI checkout for `just conformance` and require the pin.
# Usage: a2ui-conformance-root.sh <pin> <requested-root> <fallback: yes|no>
set -euo pipefail

pin="$1"
requested="$2"
fallback="$3"

ref_arg="$requested"
if [ ! -d "$ref_arg" ] && [ "$fallback" = "yes" ]; then
  # A linked worktree has an empty target/; the suites live in the main checkout.
  common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [ -n "$common_dir" ]; then
    candidate="$(dirname "$common_dir")/target/refs/google-A2UI"
    if [ -d "$candidate" ]; then
      ref_arg="$candidate"
    fi
  fi
fi

if [ ! -d "$ref_arg" ]; then
  echo "A2UI conformance root not found: $requested" >&2
  exit 1
fi

ref_abs="$(cd "$ref_arg" && pwd -P)"
head="$(git -C "$ref_abs" rev-parse HEAD 2>/dev/null || true)"
if [ "${head:-}" != "$pin" ]; then
  printf 'A2UI checkout %s is at HEAD %s, expected pin %s; fix: git -C %s fetch --depth 1 https://github.com/google/A2UI %s && git -C %s checkout FETCH_HEAD\n' \
    "$ref_abs" "${head:-unknown}" "$pin" "$ref_abs" "$pin" "$ref_abs" >&2
  exit 1
fi

printf '%s\n' "$ref_abs"
