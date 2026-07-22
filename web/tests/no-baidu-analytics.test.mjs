import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(webRoot, "..");
const files = [
    "web/src/lib/analytics.ts",
    "web/src/constant/runtime-config.ts",
    "web/src/vite-env.d.ts",
    "web/docker-entrypoint.sh",
    "web/public/config.js",
    "docker-compose.yml",
    "docs/content/docs/overview/docker.mdx",
];
const forbidden = ["hm.baidu.com", "_hmt", "ANALYTICS_BAIDU_ID", "VITE_ANALYTICS_BAIDU_ID"];

test("Baidu Analytics support is absent from maintained files", async () => {
    const violations = [];
    for (const file of files) {
        const source = await readFile(path.join(repositoryRoot, file), "utf8");
        for (const identifier of forbidden) {
            if (source.includes(identifier)) violations.push(`${file}: ${identifier}`);
        }
    }
    assert.deepEqual(violations, []);
});
