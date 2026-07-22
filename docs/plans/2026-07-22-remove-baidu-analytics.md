# Remove Baidu Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Completely remove Baidu Analytics support while retaining optional GA4 analytics.

**Architecture:** Keep the existing analytics entry point and route tracker, but reduce the implementation and runtime configuration to GA4 only. Protect the removal with a focused Node test that scans maintained source and deployment files for Baidu analytics identifiers.

**Tech Stack:** React, TypeScript, Vite, Node test runner, Docker/Nginx runtime configuration

---

### Task 1: Add the regression test

**Files:**
- Create: `web/tests/no-baidu-analytics.test.mjs`
- Modify: `web/package.json`

**Step 1:** Add a Node test that scans the analytics source, runtime configuration, environment declarations, container entrypoint, compose file, and documentation for `hm.baidu.com`, `_hmt`, `ANALYTICS_BAIDU_ID`, and `VITE_ANALYTICS_BAIDU_ID`.

**Step 2:** Add a `test:security` package script for the test.

**Step 3:** Run `npm run test:security` and verify it fails because Baidu support still exists.

### Task 2: Remove Baidu analytics

**Files:**
- Modify: `web/src/lib/analytics.ts`
- Modify: `web/src/constant/runtime-config.ts`
- Modify: `web/src/vite-env.d.ts`
- Modify: `web/docker-entrypoint.sh`
- Modify: `web/public/config.js`
- Modify: `docker-compose.yml`
- Modify: analytics-related documentation found by repository search

**Step 1:** Remove the Baidu runtime field, loader, active state, and route dispatch.

**Step 2:** Remove Baidu environment variables and examples from deployment files and documentation.

**Step 3:** Run `npm run test:security` and verify it passes.

### Task 3: Document and verify

**Files:**
- Modify: `CHANGELOG.md`
- Review: `docs/content/docs/progress/todo.mdx`
- Review: `docs/content/docs/progress/pending-test.mdx`

**Step 1:** Add a concise Chinese `Unreleased` entry describing removal of Baidu Analytics.

**Step 2:** Confirm progress documents require no update because this is not a tracked todo feature.

**Step 3:** Run the security test, frontend typecheck, and a repository-wide identifier search.
