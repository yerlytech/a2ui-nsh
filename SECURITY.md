# Security Policy

## Supported versions

Only the latest `0.1.x` release receives security fixes.

| Version | Supported |
|---|---|
| `0.1.x` | Yes |
| `< 0.1` | No |

## Reporting a vulnerability

Do not open a public issue for a security problem.

Report it through GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.

That opens a private advisory that only the maintainers can read. No e-mail
address is used for security reports.

Please include:

- the affected version or commit and the target you ran (headless, macOS, TUI,
  or Web);
- a minimal A2UI message stream or input that reproduces the problem;
- the observed result and the impact you believe it has;
- any relevant logs, with secrets and personal data removed.

Do not include credentials, signing keys, local absolute paths, or customer
records in the report. If a sample payload is sensitive, reduce it to the
smallest synthetic case that still reproduces the issue.

## What to expect

These are best-effort targets, not a contractual SLA:

- We acknowledge a report within 7 days.
- We confirm or reject the issue, and share a remediation plan, within 14 days.
- We coordinate disclosure with you and aim to publish a fix and advisory
  within 90 days of the report.
- We credit reporters in the advisory unless they ask to stay anonymous.

If the issue affects the upstream `nsh` runtime or the A2UI specification, we
may need to involve those projects; we will tell you before doing so.
