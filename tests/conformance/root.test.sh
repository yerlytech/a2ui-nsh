#!/usr/bin/env bash
# Tests scripts/a2ui-conformance-root.sh: worktree fallback and pin refusal.
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)"
helper="$repo_root/scripts/a2ui-conformance-root.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/a2ui-conformance-root.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

git init -q "$tmp/main"
git -C "$tmp/main" -c user.name=test -c user.email=test@example.com commit -q --allow-empty -m init
git -C "$tmp/main" worktree add -q "$tmp/wt" -b worktree-test

ref="$tmp/main/target/refs/google-A2UI"
git init -q "$ref"
git -C "$ref" -c user.name=test -c user.email=test@example.com commit -q --allow-empty -m pin
pin="$(git -C "$ref" rev-parse HEAD)"
expected="$(cd "$ref" && pwd -P)"

resolved="$(cd "$tmp/wt" && "$helper" "$pin" "target/refs/google-A2UI" yes)"
[ "$resolved" = "$expected" ] || fail "worktree fallback resolved $resolved, expected $expected"

missing="$tmp/wt/target/refs/google-A2UI"
set +e
( cd "$tmp/wt" && "$helper" "$pin" "$missing" no ) >/dev/null 2>&1
status=$?
set -e
[ "$status" -ne 0 ] || fail "an explicit missing root fell back to the main checkout"

git -C "$ref" -c user.name=test -c user.email=test@example.com commit -q --allow-empty -m drift
drift="$(git -C "$ref" rev-parse HEAD)"
set +e
stderr="$(cd "$tmp/wt" && "$helper" "$pin" "$ref" no 2>&1 >/dev/null)"
status=$?
set -e
[ "$status" -ne 0 ] || fail "a drifted checkout was accepted"
printf '%s\n' "$stderr" | grep -F "$drift" >/dev/null || fail "refusal does not name the HEAD"
printf '%s\n' "$stderr" | grep -F "$pin" >/dev/null || fail "refusal does not name the pin"
printf '%s\n' "$stderr" | grep -F "git -C $expected fetch --depth 1 https://github.com/google/A2UI $pin && git -C $expected checkout FETCH_HEAD" >/dev/null || fail "refusal does not print the fix command"
lines="$(printf '%s\n' "$stderr" | wc -l | tr -d ' ')"
[ "$lines" = "1" ] || fail "refusal is $lines lines, expected one"

recipe="$(just --justfile "$repo_root/Justfile" --dry-run conformance 2>&1)"
printf '%s\n' "$recipe" | grep -F "a2ui-conformance-root.sh" >/dev/null || fail "the conformance recipe does not call the root resolver"
pin_value="$(just --justfile "$repo_root/Justfile" --evaluate a2ui_conformance_pin)"
printf '%s\n' "$recipe" | grep -F "$pin_value" >/dev/null || fail "the conformance recipe does not pass a2ui_conformance_pin"

echo "conformance root: 6 checks passed"
