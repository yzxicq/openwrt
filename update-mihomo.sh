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

# ==============================
# 配置
# ==============================
MIPATH="/usr/bin/mihomo"
ARCH="amd64"  # amd64/arm64/mipsle 等
GITHUB_API="https://api.github.com/repos/MetaCubeX/mihomo/releases/latest"

# Geo 数据库文件
GEO_DIR="/etc/nikki/run"
mkdir -p "$GEO_DIR"
GEO_FILES="geosite.dat geoip-lite.dat geoip-lite.metadb GeoLite2-ASN.mmdb"
GEO_URLS="\
geosite.dat=https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat \
geoip-lite.dat=https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.dat \
geoip-lite.metadb=https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip-lite.metadb \
GeoLite2-ASN.mmdb=https://gh-proxy.com/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb"

# ==============================
# 下载工具检测
# ==============================
if command -v curl >/dev/null 2>&1; then
    DL="curl -L -o"
elif command -v wget >/dev/null 2>&1; then
    DL="wget -O"
else
    echo "需要 curl 或 wget，请先安装"
    exit 1
fi

# ==============================
# 更新 Mihomo 核心
# ==============================
echo "=== 更新 Mihomo 核心 ==="

# 获取当前版本
if [ -x "$MIPATH" ]; then
    CURRENT_VER=$($MIPATH -v 2>/dev/null | head -n1 | awk '{print $3}')
else
    CURRENT_VER="none"
fi
echo "当前版本: $CURRENT_VER"

# 获取最新版本
LATEST_TAG=$(curl -s "$GITHUB_API" | grep '"tag_name":' | head -n1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
DOWNLOAD_FILE="mihomo-linux-${ARCH}-${LATEST_TAG}.gz"
DOWNLOAD_URL="https://github.com/MetaCubeX/mihomo/releases/download/${LATEST_TAG}/${DOWNLOAD_FILE}"
echo "最新版本: $LATEST_TAG"

if [ "$CURRENT_VER" != "$LATEST_TAG" ]; then
    echo "停止 Nikki 服务..."
    /etc/init.d/nikki stop 2>/dev/null || true

    TMPFILE="/tmp/$DOWNLOAD_FILE"
    echo "下载新核心..."
    $DL "$TMPFILE" "$DOWNLOAD_URL"

    echo "解压核心..."
    gzip -df "$TMPFILE"
    NEWBIN="/tmp/mihomo-linux-${ARCH}-${LATEST_TAG}"

    if [ -x "$MIPATH" ]; then
        echo "备份旧版本到: ${MIPATH}-${CURRENT_VER}"
        mv "$MIPATH" "${MIPATH}-${CURRENT_VER}"
    fi

    mv "$NEWBIN" "$MIPATH"
    chmod +x "$MIPATH"
    echo "Mihomo 已更新到 $LATEST_TAG"
else
    echo "Mihomo 已是最新版本"
fi

# ==============================
# 更新 Geo 数据库
# ==============================
echo "=== 更新 Geo 数据库 ==="
for FILE in $GEO_FILES; do
    URL=$(echo "$GEO_URLS" | tr ' ' '\n' | grep "^$FILE=" | cut -d= -f2)
    TMP="/tmp/$FILE"

    echo "下载 $FILE..."
    $DL "$TMP" "$URL"

    # 比对是否有变化
    if [ ! -f "$GEO_DIR/$FILE" ] || ! cmp -s "$TMP" "$GEO_DIR/$FILE"; then
        mv "$TMP" "$GEO_DIR/$FILE"
        echo "$FILE 已更新"
    else
        rm "$TMP"
        echo "$FILE 无变化"
    fi
done

# ==============================
# 重启 Nikki
# ==============================
echo "重启 Nikki 服务..."
/etc/init.d/nikki start 2>/dev/null || true

echo "=== 更新完成 ==="