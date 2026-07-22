# Remove Baidu Analytics Design

## Goal

Remove Baidu Analytics from the application and deployment configuration while preserving the existing optional GA4 integration.

## Scope

- Remove the Baidu runtime configuration field and environment variables.
- Remove the Baidu script loader and page-view dispatch path.
- Remove Baidu examples and documentation.
- Add a regression check that rejects Baidu analytics identifiers in maintained source and deployment files.
- Record the user-visible privacy change in `CHANGELOG.md`.

## Data Flow

After this change, `initAnalytics` may initialize GA4 only. Route changes will be dispatched only to GA4 when configured. No application code will load `hm.baidu.com` or write to `window._hmt`.

## Verification

A Node test scans the relevant application, container, and documentation files for the removed Baidu identifiers. Existing frontend type checking will verify the remaining GA4-only configuration surface.
