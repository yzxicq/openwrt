#!/bin/sh
# 自动更新 Mihomo 核心 for OpenWrt Nikki
# 作者: Jason 专用 😉
# chmod +x /usr/bin/update-mihomo.sh
# 手动更新 /usr/bin/update-mihomo.sh
# 每日凌晨4点自动 crontab -e
# 0 4 * * * /usr/bin/update-mihomo.sh >> /var/log/update-mihomo.log 2>&1
# /etc/init.d/cron enable && /etc/init.d/cron restart

set -e

############ 基本配置 ############
SERVICE="nikki"
MIPATH="/usr/bin/mihomo"
DBDIR="/etc/nikki/run"
mkdir -p "$DBDIR"

PROXIES="https://gh-proxy.com/ https://ghp.ci/ https://mirror.ghproxy.com/ https://ghproxy.net/"
GITHUB_REPO="MetaCubeX/mihomo"
API_PATH="https://api.github.com/repos/$GITHUB_REPO/releases/latest"
GEO_LIST="geosite.dat geoip-lite.dat geoip-lite.metadb GeoLite2-ASN.mmdb"
GEO_BASE="https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest"

############ 工具检测 ############
command -v curl >/dev/null 2>&1 || { echo "需要 curl，请先安装" >&2; exit 1; }

############ 临时目录 ############
TMPDIR="$(mktemp -d /tmp/mihomo_update.XXXXXX)"
trap "rm -rf '$TMPDIR'" EXIT

############ 小工具函数 ############
dl_via_proxies() {
  _base="$1"; _out="$2"
  for _p in $PROXIES ""; do
    _url="$_p$_base"
    if curl -fsSL --connect-timeout 20 --retry 2 -o "$_out" "$_url"; then
      echo "成功下载: $_url" >&2
      return 0
    fi
    echo "尝试下载失败: $_url" >&2
  done; 
  echo "所有代理尝试下载失败: $_base" >&2
  return 1
}

get_text_via_proxies() {
  _path="$1"
  for _p in $PROXIES ""; do
    _url="$_p$_path"
    _resp="$(curl -fsSL --connect-timeout 10 --retry 1 "$_url" 2>/dev/null || true)"
    [ -n "$_resp" ] && { printf "%s" "$_resp"; return 0; }
    echo "尝试获取失败: $_url" >&2
  done; 
  echo "所有代理尝试获取文本失败: $_path" >&2
  return 1
}

get_current_version() {
  [ -x "$MIPATH" ] && "$MIPATH" -v 2>/dev/null | sed -n '1s/.*\(v[0-9][0-9.]*\).*/\1/p'
}

get_latest_tag() {
  _api_json="$(get_text_via_proxies "$API_PATH" || true)"
  _tag="$(printf "%s" "$_api_json" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  [ -n "$_tag" ] && { echo "$_tag"; return; }
  for _p in $PROXIES ""; do
    _url="$_p""https://github.com/$GITHUB_REPO/releases/latest"
    _loc="$(curl -fsSLI --connect-timeout 10 "$_url" 2>/dev/null | grep -i '^location:' | tail -n1 | tr -d '\r')"
    _tag="$(printf "%s" "$_loc" | sed -n 's#.*/tag/\(v[0-9][0-9.]*\).*#\1#p')"
    [ -n "$_tag" ] && { echo "$_tag"; return; }
  done; 
  echo "获取最新版本标签失败" >&2
  return 1
}

# ======== 新增：x86-64 v1/v2/v3/v4 自动检测 ========
detect_x86_64_level() {
  FLAGS="$(lscpu 2>/dev/null | grep -i 'Flags:' || grep -i 'flags' /proc/cpuinfo | head -n1)"
  FLAGS="$(echo "$FLAGS" | tr 'A-Z' 'a-z')"

  LEVEL="v1"
  echo "$FLAGS" | grep -qw sse4_2 && echo "$FLAGS" | grep -qw popcnt && echo "$FLAGS" | grep -qw ssse3 && LEVEL="v2"
  echo "$FLAGS" | grep -qw avx2    && LEVEL="v3"
  echo "$FLAGS" | grep -qw avx512f && LEVEL="v4"
  echo "$LEVEL"
}

download_core_binary() {
  _tag="$1"

  case "$ARCH" in
    amd64)
      LEVEL="$(detect_x86_64_level)"
      echo "检测到 CPU 支持: x86-64-$LEVEL" >&2
      _candidates="mihomo-linux-amd64-$LEVEL-$_tag.gz mihomo-linux-amd64-$LEVEL.gz"
      ;;
    *)
      _candidates="mihomo-linux-$ARCH-$_tag.gz mihomo-linux-$ARCH.gz mihomo-linux-$ARCH.tar.gz"
      ;;
  esac

  echo "尝试下载候选文件: $_candidates" >&2
  
  for _name in $_candidates; do
    _base="https://github.com/$GITHUB_REPO/releases/download/$_tag/$_name"
    _dst="$TMPDIR/$_name"
    echo "尝试下载: $_base" >&2
    if dl_via_proxies "$_base" "$_dst" >/dev/null 2>&1; then
      case "$_name" in
        *.tar.gz) 
          tar -xzf "$_dst" -C "$TMPDIR" 
          _bin_path="$(find "$TMPDIR" -maxdepth 2 -type f -name 'mihomo' | head -n1)"
          echo "解压tar.gz文件，找到二进制: $_bin_path" >&2
          echo "$_bin_path"
          ;;
        *.gz)     
          gzip -dc "$_dst" >"$TMPDIR/mihomo.new" 
          chmod +x "$TMPDIR/mihomo.new" 
          echo "解压gz文件到: $TMPDIR/mihomo.new" >&2
          echo "$TMPDIR/mihomo.new"
          ;;
      esac && return 0
    fi
  done; 
  echo "所有候选文件下载失败" >&2
  return 1
}

safe_mv() { mkdir -p "$(dirname "$2")"; mv -f "$1" "$2"; }
is_diff() { [ ! -f "$2" ] || ! cmp -s "$1" "$2"; }

svc_stop() { command -v systemctl >/dev/null 2>&1 && systemctl stop "$SERVICE" || /etc/init.d/"$SERVICE" stop 2>/dev/null || true; }
svc_start(){ command -v systemctl >/dev/null 2>&1 && systemctl start "$SERVICE" || /etc/init.d/"$SERVICE" start 2>/dev/null || true; }

############ 执行逻辑 ############
echo "=== 检查版本信息 ===" >&2
CURRENT_VER="$(get_current_version || echo none)"
echo "当前版本: $CURRENT_VER" >&2
LATEST_TAG="$(get_latest_tag || true)" || { echo "获取最新版本失败" >&2; exit 1; }
echo "最新版本: $LATEST_TAG" >&2

if [ "$CURRENT_VER" = "$LATEST_TAG" ]; then
  echo "当前已是最新版本，无需更新核心" >&2
  CORE_SHOULD_UPDATE=0
else
  echo "=== 下载 Mihomo 核心 ===" >&2
  UNAME_M="$(uname -m 2>/dev/null || echo unknown)"
  case "$UNAME_M" in
    x86_64|amd64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    mipsle) ARCH="mipsle" ;;
    mips64le) ARCH="mips64le" ;;
    *) ARCH="amd64" ;;
  esac
  echo "系统架构: $ARCH" >&2

  CORE_BIN="$(download_core_binary "$LATEST_TAG")"
  if [ -n "$CORE_BIN" ] && [ -f "$CORE_BIN" ]; then
    chmod +x "$CORE_BIN"
    echo "下载的核心文件: $CORE_BIN" >&2
    
    # 验证新核心版本
    NEW_VER="$("$CORE_BIN" -v 2>/dev/null | sed -n '1s/.*\(v[0-9][0-9.]*\).*/\1/p')"
    echo "新核心版本: $NEW_VER" >&2
    
    if [ "$NEW_VER" = "$LATEST_TAG" ]; then
      echo "新核心版本验证成功" >&2
      CORE_SHOULD_UPDATE=1
    else
      echo "新核心版本不匹配: 期望 $LATEST_TAG, 实际 $NEW_VER" >&2
      CORE_SHOULD_UPDATE=0
    fi
  else
    echo "核心下载失败" >&2
    CORE_SHOULD_UPDATE=0
  fi
fi

echo "=== 下载并比对 Geo 数据库 ===" >&2
UPDATED_DB_LIST=""; UNCHANGED_DB_LIST=""; FAILED_DB_LIST=""
for _f in $GEO_LIST; do
  _url_base="$GEO_BASE/$_f"; _tmp_new="$TMPDIR/$_f.new"
  echo "下载：$_f ..." >&2
  if dl_via_proxies "$_url_base" "$_tmp_new" >/dev/null 2>&1 && [ -s "$_tmp_new" ]; then
    if is_diff "$_tmp_new" "$DBDIR/$_f"; then 
      UPDATED_DB_LIST="$UPDATED_DB_LIST $_f"
      echo "数据库 $_f 有更新" >&2
    else 
      UNCHANGED_DB_LIST="$UNCHANGED_DB_LIST $_f"
      rm -f "$_tmp_new"
      echo "数据库 $_f 无变化" >&2
    fi
  else 
    FAILED_DB_LIST="$FAILED_DB_LIST $_f"
    rm -f "$_tmp_new" 2>/dev/null || true
    echo "数据库 $_f 下载失败" >&2
  fi
done

NEED_STOP=0
[ "$CORE_SHOULD_UPDATE" -eq 1 ] && NEED_STOP=1
[ -n "$UPDATED_DB_LIST" ] && NEED_STOP=1

if [ "$NEED_STOP" -eq 1 ]; then
  echo "=== 停止服务：$SERVICE ===" >&2; svc_stop
  [ "$CORE_SHOULD_UPDATE" -eq 1 ] && safe_mv "$CORE_BIN" "$MIPATH" && chmod +x "$MIPATH"
  for _f in $UPDATED_DB_LIST; do safe_mv "$TMPDIR/$_f.new" "$DBDIR/$_f"; done
  echo "=== 启动服务：$SERVICE ===" >&2; svc_start
else
  echo "无任何更新，不需要重启服务。" >&2
fi

echo "================== 更新汇总 =================="
[ "$CORE_SHOULD_UPDATE" -eq 1 ] && echo "核心：UPDATED ($CURRENT_VER -> $LATEST_TAG)" || echo "核心：NO CHANGE ($CURRENT_VER)"
[ -n "$UPDATED_DB_LIST" ] && echo "数据库更新：$UPDATED_DB_LIST" || echo "数据库更新：无"
[ -n "$UNCHANGED_DB_LIST" ] && echo "数据库无变化：$UNCHANGED_DB_LIST"
[ -n "$FAILED_DB_LIST" ] && echo "数据库失败：$FAILED_DB_LIST"
echo "=============================================="