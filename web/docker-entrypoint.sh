#!/bin/sh
set -e

# 由 nginx 官方镜像的入口在启动前自动执行（/docker-entrypoint.d/*.sh），随后 nginx 正常拉起。
# 从环境变量生成运行期配置 config.js；未设置 GA4 时留空，前端不加载统计脚本。

# GA4 ID 只含字母、数字和连字符；过滤掉其它字符，
# 避免值里的引号等破坏 config.js 的 JS 字符串（纵深防御）。
sanitize_id() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9-'
}

GA4_ID=$(sanitize_id "${ANALYTICS_GA4_ID:-}")

cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  ANALYTICS_GA4_ID: "${GA4_ID}"
};
EOF
