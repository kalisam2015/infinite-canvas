import assert from "node:assert/strict";
import test from "node:test";

import { isArkPlanBaseUrl, isSeedanceVideoModel } from "../src/lib/seedance-video.js";

test("identifies Ark Plan base URLs used by video task routing", () => {
    assert.equal(isArkPlanBaseUrl("https://ark.cn-beijing.volces.com/api/plan/v3"), true);
    assert.equal(isArkPlanBaseUrl("https://ark.cn-beijing.volces.com/api/v3"), false);
});

test("identifies Seedance video models used by relay routing", () => {
    assert.equal(isSeedanceVideoModel("doubao-seedance-2-0-fast"), true);
    assert.equal(isSeedanceVideoModel("gpt-image-1"), false);
});
