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

############ 基本配置 ############
SERVICE="nikki"                      # 服务名
MIPATH="/usr/bin/mihomo"             # mihomo 可执行文件路径
DBDIR="/etc/nikki/run"               # 数据库目录
mkdir -p "$DBDIR"

# 多个 gh-proxy 备选；从左到右依次尝试
PROXIES="https://gh-proxy.com/ https://ghp.ci/ https://mirror.ghproxy.com/ https://ghproxy.net/"

# 允许外部用 FORCE_ARCH 覆盖
# 自动探测架构（默认 x86_64 -> amd64；aarch64->arm64）
if [ -n "$FORCE_ARCH" ]; then
  ARCH="$FORCE_ARCH"
else
  UNAME_M="$(uname -m 2>/dev/null || echo unknown)"
  case "$UNAME_M" in
    x86_64|amd64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    mipsle) ARCH="mipsle" ;;          # 如不适配可用 FORCE_ARCH 覆盖，例如 mipsle-softfloat
    mips64le) ARCH="mips64le" ;;
    *) ARCH="amd64" ;;                 # 兜底
  esac
fi

GITHUB_REPO="MetaCubeX/mihomo"
API_PATH="https://api.github.com/repos/$GITHUB_REPO/releases/latest"

# Geo 数据库（按需增删）
GEO_LIST="geosite.dat geoip-lite.dat geoip-lite.metadb GeoLite2-ASN.mmdb"
GEO_BASE="https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest"

############ 工具检测 ############
if command -v curl >/dev/null 2>&1; then
  HAS_CURL=1
else
  echo "需要 curl，请先安装（opkg update && opkg install curl）"
  exit 1
fi

############ 临时目录 & 清理 ############
TMPDIR="$(mktemp -d /tmp/mihomo_update.XXXXXX)"
[ -d "$TMPDIR" ] || { echo "创建临时目录失败"; exit 1; }
cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

############ 小工具函数（ash 兼容写法） ############
# 尝试通过多个代理下载：dl_via_proxies <相对/原始URL> <输出文件>
dl_via_proxies() {
  _base="$1"
  _out="$2"
  for _p in $PROXIES ""; do
    _url="$_p$_base"
    # curl: 失败返回非零，不终止整个脚本；由调用处判断
    if curl -fsSL --connect-timeout 20 --retry 2 -o "$_out" "$_url"; then
      echo "$_url"
      return 0
    fi
  done
  return 1
}

# GET 文本（返回到 stdout），多代理尝试；失败返回空
get_text_via_proxies() {
  _path="$1"
  for _p in $PROXIES ""; do
    _url="$_p$_path"
    _resp="$(curl -fsSL --connect-timeout 10 --retry 1 "$_url" 2>/dev/null || true)"
    if [ -n "$_resp" ]; then
      printf "%s" "$_resp"
      return 0
    fi
  done
  return 1
}

# 解析当前已安装版本（形如 v1.19.12）；失败返回 empty
get_current_version() {
  if [ -x "$MIPATH" ]; then
    # 只取第一行里的 vX.Y.Z
    _v="$("$MIPATH" -v 2>/dev/null | sed -n '1s/.*\(v[0-9][0-9.]*\).*/\1/p')"
    printf "%s" "$_v"
  fi
}

# 获取最新 tag（vX.Y.Z），API 优先，失败再用 /releases/latest 重定向解析
get_latest_tag() {
  _api_json="$(get_text_via_proxies "$API_PATH" || true)"
  if [ -n "$_api_json" ]; then
    _tag="$(printf "%s" "$_api_json" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
    if [ -n "$_tag" ]; then
      printf "%s" "$_tag"
      return 0
    fi
  fi
  # 备用：解析 /releases/latest 的 Location 头
  for _p in $PROXIES ""; do
    _url="$_p""https://github.com/$GITHUB_REPO/releases/latest"
    _loc="$(curl -fsSLI --connect-timeout 10 "$_url" 2>/dev/null | grep -i '^location:' | tail -n1 | tr -d '\r')"
    if [ -n "$_loc" ]; then
      _tag="$(printf "%s" "$_loc" | sed -n 's#.*/tag/\(v[0-9][0-9.]*\).*#\1#p')"
      if [ -n "$_tag" ]; then
        printf "%s" "$_tag"
        return 0
      fi
    fi
  done
  return 1
}

# 尝试下载核心（多种文件名），成功则输出：新二进制路径；失败返回空
download_core_binary() {
  _tag="$1"
  # 候选文件名（不同版本可能不一致）：
  # 1) mihomo-linux-ARCH.gz
  # 2) mihomo-linux-ARCH-vX.Y.Z.gz
  # 3) mihomo-linux-ARCH.tar.gz
  _candidates="mihomo-linux-$ARCH.gz mihomo-linux-$ARCH-$_tag.gz mihomo-linux-$ARCH.tar.gz"

  for _name in $_candidates; do
    _base="https://github.com/$GITHUB_REPO/releases/download/$_tag/$_name"
    _dst="$TMPDIR/$_name"
    if dl_via_proxies "$_base" "$_dst" >/dev/null 2>&1; then
      case "$_name" in
        *.tar.gz)
          # 解包到 TMPDIR
          if tar -xzf "$_dst" -C "$TMPDIR" >/dev/null 2>&1; then
            if [ -x "$TMPDIR/mihomo" ]; then
              printf "%s" "$TMPDIR/mihomo"
              return 0
            else
              # 有些包解出的是目录，尝试搜寻
              _found="$(find "$TMPDIR" -maxdepth 2 -type f -name 'mihomo' 2>/dev/null | head -n1)"
              if [ -n "$_found" ]; then
                chmod +x "$_found" 2>/dev/null || true
                printf "%s" "$_found"
                return 0
              fi
            fi
          fi
          ;;
        *.gz)
          # 用 -dc 防止“File exists”
          _out="$TMPDIR/mihomo.new"
          if gzip -dc "$_dst" >"$_out" 2>/dev/null; then
            chmod +x "$_out" 2>/dev/null || true
            printf "%s" "$_out"
            return 0
          fi
          ;;
      esac
    fi
  done
  return 1
}

# 安全移动（覆盖同名文件）
safe_mv() {
  _src="$1"
  _dst="$2"
  # 确保目标目录存在
  _dir="$(dirname "$_dst")"
  mkdir -p "$_dir"
  mv -f "$_src" "$_dst"
}

# 比对文件是否不同（不存在或不同即返回 0）
is_diff() {
  _new="$1"
  _old="$2"
  if [ ! -f "$_old" ]; then
    return 0
  fi
  if cmp -s "$_new" "$_old"; then
    return 1
  else
    return 0
  fi
}

# 停/启服务（兼容 systemd 与 OpenWrt init）
svc_stop() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop "$SERVICE" 2>/dev/null || true
  else
    /etc/init.d/"$SERVICE" stop 2>/dev/null || true
  fi
}
svc_start() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl start "$SERVICE" 2>/dev/null || true
  else
    /etc/init.d/"$SERVICE" start 2>/dev/null || true
  fi
}

############ 开始执行 ############
echo "=== 检查版本信息 ==="
CURRENT_VER="$(get_current_version)"
[ -z "$CURRENT_VER" ] && CURRENT_VER="none"
echo "当前版本: $CURRENT_VER"

LATEST_TAG="$(get_latest_tag || true)"
if [ -z "$LATEST_TAG" ]; then
  echo "获取最新版本失败，退出。"
  exit 1
fi
echo "最新版本: $LATEST_TAG"

# 1) 先下载核心（不影响现有服务）
echo "=== 下载 Mihomo 核心（ARCH=$ARCH） ==="
CORE_BIN="$(download_core_binary "$LATEST_TAG" || true)"
CORE_SHOULD_UPDATE=0
CORE_FROM="$CURRENT_VER"
CORE_TO="$LATEST_TAG"

if [ -n "$CORE_BIN" ] && [ -x "$CORE_BIN" ]; then
  # 验证新核心能运行
  if "$CORE_BIN" -v >/dev/null 2>&1; then
    if [ "$CURRENT_VER" != "$LATEST_TAG" ]; then
      CORE_SHOULD_UPDATE=1
      echo "检测到新核心，将从 $CURRENT_VER 更新至 $LATEST_TAG"
    else
      echo "核心版本无变化（$CURRENT_VER），不替换。"
      CORE_SHOULD_UPDATE=0
    fi
  else
    echo "下载到的核心不可执行，跳过核心更新。"
    CORE_SHOULD_UPDATE=0
    CORE_BIN=""
  fi
else
  echo "核心下载失败或未找到可执行文件，跳过核心更新。"
  CORE_SHOULD_UPDATE=0
  CORE_BIN=""
fi

# 2) 先下载数据库（逐个尝试）
echo "=== 下载并比对 Geo 数据库 ==="
UPDATED_DB_LIST=""
UNCHANGED_DB_LIST=""
FAILED_DB_LIST=""

for _f in $GEO_LIST; do
  _url_base="$GEO_BASE/$_f"
  _tmp_new="$TMPDIR/$_f.new"
  echo "下载：$_f ..."
  if dl_via_proxies "$_url_base" "$_tmp_new" >/dev/null 2>&1; then
    if [ -s "$_tmp_new" ]; then
      if is_diff "$_tmp_new" "$DBDIR/$_f"; then
        UPDATED_DB_LIST="$UPDATED_DB_LIST $_f"
      else
        UNCHANGED_DB_LIST="$UNCHANGED_DB_LIST $_f"
        rm -f "$_tmp_new"
      fi
    else
      FAILED_DB_LIST="$FAILED_DB_LIST $_f(空文件)"
      rm -f "$_tmp_new"
    fi
  else
    FAILED_DB_LIST="$FAILED_DB_LIST $_f(下载失败)"
    rm -f "$_tmp_new" 2>/dev/null || true
  fi
done

# 是否需要停服务（核心需更新 或 有数据库更新）
NEED_STOP=0
if [ "$CORE_SHOULD_UPDATE" -eq 1 ]; then
  NEED_STOP=1
fi
if [ -n "$UPDATED_DB_LIST" ]; then
  NEED_STOP=1
fi

# 3) 真正替换（仅当有更新时）
if [ "$NEED_STOP" -eq 1 ]; then
  echo "=== 停止服务：$SERVICE ==="
  svc_stop

  # 替换核心
  if [ "$CORE_SHOULD_UPDATE" -eq 1 ] && [ -n "$CORE_BIN" ]; then
    # 备份旧文件
    if [ -x "$MIPATH" ]; then
      cp -f "$MIPATH" "$MIPATH.$CORE_FROM.bak" 2>/dev/null || true
    fi
    safe_mv "$CORE_BIN" "$MIPATH"
    chmod +x "$MIPATH" 2>/dev/null || true
  fi

  # 替换数据库（只替换有变化的）
  for _f in $UPDATED_DB_LIST; do
    safe_mv "$TMPDIR/$_f.new" "$DBDIR/$_f"
  done

  echo "=== 启动服务：$SERVICE ==="
  svc_start
else
  echo "无任何更新，不需要重启服务。"
fi

# 4) 汇总输出
echo "================== 更新汇总 =================="
if [ "$CORE_SHOULD_UPDATE" -eq 1 ]; then
  echo "核心：UPDATED  ($CORE_FROM -> $CORE_TO)"
else
  echo "核心：NO CHANGE ($CURRENT_VER)"
fi

if [ -n "$UPDATED_DB_LIST" ]; then
  echo "数据库更新：$UPDATED_DB_LIST"
else
  echo "数据库更新：无"
fi

if [ -n "$UNCHANGED_DB_LIST" ]; then
  echo "数据库无变化：$UNCHANGED_DB_LIST"
fi

if [ -n "$FAILED_DB_LIST" ]; then
  echo "数据库失败：$FAILED_DB_LIST"
fi
echo "=============================================="