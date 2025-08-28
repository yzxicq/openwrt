#!/bin/sh
# 自动更新 Mihomo 核心 for OpenWrt Nikki
# 作者: Jason 专用 😉
# chmod +x /usr/bin/update-mihomo.sh
# 手动更新 /usr/bin/update-mihomo.sh
# 每日凌晨4点自动 crontab -e
# 0 4 * * * /usr/bin/update-mihomo.sh >> /var/log/update-mihomo.log 2>&1
# 重启 cron 服务
# /etc/init.d/cron enable && /etc/init.d/cron restart

# 配置
set -e

MIPATH="/usr/bin/mihomo"
ARCH="amd64"  # 改成你的架构: amd64/arm64/mipsle 等
GITHUB_API="https://api.github.com/repos/MetaCubeX/mihomo/releases/latest"

# 检测下载工具
if command -v curl >/dev/null 2>&1; then
    DL="curl -L -o"
elif command -v wget >/dev/null 2>&1; then
    DL="wget -O"
else
    echo "需要 curl 或 wget，请先安装"
    exit 1
fi

# 获取当前版本
if [ -x "$MIPATH" ]; then
    CURRENT_VER=$($MIPATH -v 2>/dev/null | head -n1 | awk '{print $3}')
else
    CURRENT_VER="none"
fi

echo "当前版本: $CURRENT_VER"

# 获取最新版本 (只取 amd64 且为正式版)
LATEST_TAG=$(curl -s "$GITHUB_API" | jq -r .tag_name)
DOWNLOAD_FILE="mihomo-linux-${ARCH}-${LATEST_TAG}.gz"
DOWNLOAD_URL="https://github.com/MetaCubeX/mihomo/releases/download/${LATEST_TAG}/${DOWNLOAD_FILE}"

echo "最新版本: $LATEST_TAG"
echo "下载文件: $DOWNLOAD_FILE"

# 如果版本一致则退出
if [ "$CURRENT_VER" = "$LATEST_TAG" ]; then
    echo "已是最新版本，无需更新"
    exit 0
fi

# 停止 nikki (避免 text file busy)
if /etc/init.d/nikki status >/dev/null 2>&1; then
    echo "停止 nikki 服务..."
    /etc/init.d/nikki stop
fi

# 下载新版本
TMPFILE="/tmp/$DOWNLOAD_FILE"
echo "下载新核心..."
$DL "$TMPFILE" "$DOWNLOAD_URL"

# 解压
gzip -df "$TMPFILE"
NEWBIN="/tmp/mihomo-linux-${ARCH}-${LATEST_TAG}"

# 备份旧版本（加上版本号）
if [ -x "$MIPATH" ]; then
    echo "备份旧版本到: ${MIPATH}-${CURRENT_VER}"
    mv "$MIPATH" "${MIPATH}-${CURRENT_VER}"
fi

# 替换
mv "$NEWBIN" "$MIPATH"
chmod +x "$MIPATH"

# 重启 nikki
if [ -x /etc/init.d/nikki ]; then
    echo "重启 nikki 服务..."
    /etc/init.d/nikki start
fi

echo "mihomo 已更新到 $LATEST_TAG"