#!/bin/sh
# 全平台自动更新 Mihomo 核心 for OpenWrt Nikki
# 作者: Jason 专用 😉
# chmod +x /usr/bin/update-mihomo.sh
# 手动更新 /usr/bin/update-mihomo.sh
# 每日凌晨4点自动 crontab -e
# 0 4 * * * /usr/bin/update-mihomo.sh >> /var/log/update-mihomo.log 2>&1
# 重启 cron 服务
# /etc/init.d/cron enable && /etc/init.d/cron restart

# 配置
REPO="MetaCubeX/mihomo"
MIPATH="/usr/bin/mihomo"
TMPDIR="/tmp/mihomo-update"
mkdir -p "$TMPDIR"

# 检测当前版本
if [ -x "$MIPATH" ]; then
    CURRENT_VER=$($MIPATH -v 2>/dev/null | head -n1 | awk '{print $3}')
else
    CURRENT_VER="none"
fi

# 检测 CPU 架构
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)   GH_ARCH="linux-amd64" ;;
    aarch64)  GH_ARCH="linux-arm64" ;;
    armv7*|armv6l) GH_ARCH="linux-armv7" ;;
    mips64el) GH_ARCH="linux-mips64le" ;;
    mips64)   GH_ARCH="linux-mips64" ;;
    mipsel)   GH_ARCH="linux-mipsle" ;;
    mips)     GH_ARCH="linux-mips" ;;
    *) echo "❌ 不支持的架构: $ARCH"; exit 1 ;;
esac

echo "当前版本: $CURRENT_VER"
echo "检测到架构: $ARCH → GitHub 使用 $GH_ARCH"

# 获取最新版本号
LATEST_VER=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" \
    | grep tag_name | cut -d '"' -f4 | sed 's/^v//')

if [ -z "$LATEST_VER" ]; then
    echo "❌ 获取最新版本失败"
    exit 1
fi

echo "最新版本: $LATEST_VER"

# 判断是否需要更新
if [ "$CURRENT_VER" = "$LATEST_VER" ]; then
    echo "✅ 已是最新版本，无需更新"
    exit 0
fi

# 构造下载地址
URL="https://github.com/$REPO/releases/download/v$LATEST_VER/mihomo-$GH_ARCH-v$LATEST_VER.gz"
DEST="$TMPDIR/mihomo.gz"

echo "下载: $URL"
if ! curl -L -o "$DEST" "$URL"; then
    echo "❌ 下载失败"
    exit 1
fi

# 解压
gunzip -f "$DEST" || { echo "❌ 解压失败"; exit 1; }

NEWBIN="$TMPDIR/mihomo"

# 备份旧版本
if [ -x "$MIPATH" ]; then
    echo "备份旧版本为 $MIPATH-$CURRENT_VER"
    mv "$MIPATH" "$MIPATH-$CURRENT_VER"
fi

# 替换为新版本
mv "$NEWBIN" "$MIPATH"
chmod +x "$MIPATH"

echo "✅ 更新完成: $($MIPATH -v | head -n1)"

# 清理
rm -rf "$TMPDIR"
