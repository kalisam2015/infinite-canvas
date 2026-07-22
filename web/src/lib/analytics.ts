// 统计分析加载器：默认关闭，仅支持 GA4。
// 只接受衡量 ID，脚本地址由代码固定拼接——
// 不接受任意脚本 URL / 内联 JS，避免「配置项被用来在访客浏览器执行任意代码」。
// 全空时不注入任何脚本、不发任何外部请求。这是开源项目的硬要求：
// fork/自托管者默认零统计，官方站点仅通过环境变量注入自己的 ID（ID 不入库）。

import { ANALYTICS_GA4_ID } from "@/constant/runtime-config";

type GtagFn = (...args: unknown[]) => void;

declare global {
    interface Window {
        dataLayer?: unknown[];
        gtag?: GtagFn;
    }
}

let initialized = false;
let active = false;

function appendScript(src: string, attrs: Record<string, string> = {}) {
    const el = document.createElement("script");
    el.async = true;
    el.src = src;
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    document.head.appendChild(el);
    return el;
}

function initGa4(id: string) {
    window.dataLayer = window.dataLayer || [];
    const gtag: GtagFn = (...args) => {
        window.dataLayer!.push(args);
    };
    window.gtag = gtag;
    appendScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
    gtag("js", new Date());
    // SPA 路由上报交给 trackPageview，这里关闭默认的自动 page_view，避免重复。
    gtag("config", id, { send_page_view: false });
    active = true;
}

export function initAnalytics() {
    if (initialized || typeof window === "undefined") return;
    initialized = true;

    if (ANALYTICS_GA4_ID) {
        try {
            initGa4(ANALYTICS_GA4_ID);
        } catch {
            /* 忽略 */
        }
    }
}

// SPA 路由切换时向已启用的 GA4 上报页面浏览。
export function trackPageview(path: string) {
    try {
        if (active && window.gtag) {
            window.gtag("event", "page_view", { page_path: path, page_location: window.location.href });
        }
    } catch {
        /* 忽略 */
    }
}

