function main(config) {
  // ================================================================
  // 1. 基础配置与网络协议
  // ================================================================
  config["mode"] = "rule";
  config["ipv6"] = false; // 移动端建议关闭 IPv6，避免短视频优先尝试 IPv6 代理连接超时卡顿
  config["mixed-port"] = 7890;
  config["allow-lan"] = true;
  config["bind-address"] = "*";
  config["log-level"] = "warning";
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["global-ua"] = "clash.meta";
  config["prefer-lvs"] = false;

  config["profile"] = {
    "store-selected": true,
    "store-fake-ip": true
  };

  // ================================================================
  // 2. 原地深度兼容修复 (就地修复底层参数，不动原始 proxies 引用结构)
  // ================================================================
  var originalProxies = Array.isArray(config["proxies"]) ? config["proxies"] : [];
  var proxyNames = [];

  originalProxies.forEach(function(p) {
    if (!p || !p.name || typeof p.name !== "string") return;

    // 过滤失效与广告节点
    if (/到期|过期|剩余|网址|官网|邮箱|订阅|套餐|流量|说明|重置/i.test(p.name)) {
      return;
    }

    // 就地兼容 Reality 协议：自动修正不规范的 short-id 为合法偶数位 Hex
    var ro = p["reality-opts"] || p["reality_opts"];
    if (ro) {
      var sidKey = ("short-id" in ro) ? "short-id" : ("shortId" in ro ? "shortId" : null);
      if (sidKey && ro[sidKey] !== undefined && ro[sidKey] !== null) {
        var sid = String(ro[sidKey]).trim().replace(/[^0-9a-fA-F]/g, "");
        if (sid.length > 0 && sid.length % 2 !== 0) {
          sid = "0" + sid; // 奇数位自动补 0 变标准偶数位
        }
        ro[sidKey] = sid;
      }
    }

    proxyNames.push(p.name);
  });

// ================================================================
  // 3. 跨平台自适应 TUN (Windows 免 UAC 提权，安卓唤起 VPN 钥匙)
  // ================================================================
  // 嗅探当前平台环境（利用客户端内建全局变量或进程特征）
  var isWindows = (typeof process !== "undefined" && process.platform === "win32") ||
                  (typeof navigator !== "undefined" && /win/i.test(navigator.platform));

  if (!isWindows) {
    // 安卓 / 移动端：注入 TUN 配置，唤起安卓 VpnService 钥匙图标
    config["tun"] = {
      "enable": true,
      "stack": "mixed",
      "dns-hijack": ["udp://any:53", "tcp://any:53"],
      "auto-detect-interface": true,
      "auto-route": true,
      "auto-redirect": false,
      "strict-route": false,
      "endpoint-independent-nat": true
    };
  } else {
    // Windows 端：彻底移除 TUN，退回标准系统代理，普通域用户启动完全无需管理员密码
    delete config["tun"];
  }
  // ================================================================
  // 4. 嗅探功能 (增加国内短视频大厂跳过，降低高并发流媒体切片延迟)
  // ================================================================
  config["sniffer"] = {
    "enable": true,
    "override-destination": true,
    "parse-pure-ip": false,
    "force-dns-mapping": true,
    "sniff": {
      "QUIC": { "ports": [443] },
      "TLS": { "ports": [443, 8443] },
      "HTTP": { "ports": [80, "8080-8880"] }
    },
    "force-domain": [
      "+.netflix.com",
      "+.nflxvideo.net",
      "+.amazonaws.com",
      "+.media.dssott.com",
      "+.tiktok.com"
    ],
    "skip-domain": [
      "+.cwac.cc",
      "+.doppelmayr.cn",
      "+.qq.com",
      "+.tencent.com",
      "+.qpic.cn",
      "+.bytedance.com",
      "+.pstatp.com",
      "+.snssdk.com",
      "+.zijieapi.com",
      "dlg.io.mi.com",
      "+.mi.com",
      "+.xiaomi.com",
      "+.miwifi.com",
      "+.oray.com",
      "+.sunlogin.net",
      "+.push.apple.com"
    ]
  };

  // ================================================================
  // 5. Hosts 静态映射与 PCDN 阻断
  // ================================================================
  config["hosts"] = {
    "services.googleapis.cn": ["services.googleapis.com"],
    "dns.alidns.com": ["223.5.5.5", "223.6.6.6"],
    "doh.pub": ["1.12.12.12", "1.12.12.21", "120.53.53.53"],
    "dns.google": ["8.8.8.8", "8.8.4.4"],
    "cloudflare-dns.com": ["1.1.1.1", "1.0.0.1"],
    "+.mcdn.bilivideo.com": ["0.0.0.0"],
    "+.mcdn.bilivideo.cn": ["0.0.0.0"],
    "+.edge.mountaintoys.cn": ["0.0.0.0"]
  };

  // ================================================================
  // 6. DNS 防泄漏与内外网分流
  // ================================================================
  config["dns"] = {
    "enable": true,
    "ipv6": false, // 联动关闭 IPv6 DNS 解析
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter-mode": "blacklist",
    "respect-rules": false, // 关闭此项，防止复杂规则匹配时因等待真实 DNS 回落误入兜底代理
    "cache-algorithm": "arc",
    "fake-ip-filter": [
      "rule-set:applecn_domain",
      "rule-set:microsoftcn_domain",
      "+.doppelmayr.cc",
      "+.cwac.cc",
      "+.lan",
      "+.localdomain",
      "+.example",
      "+.invalid",
      "+.localhost",
      "+.test",
      "+.local",
      "+.int",
      "+.msftconnecttest.com",
      "+.msftncsi.com",
      "time.*.com",
      "time.*.gov",
      "ntp.*.com",
      "ntp.*.gov",
      "+.pool.ntp.org",
      "+.sentinelone.net",
      "*.io.mi.com",
      "*.xiaomi.com",
      "*.xiaomi.net",
      "*.mi.com",
      "*.v6.66666.host:66",
      "*.myip6.ipip.net",
      "*.6.ipw.cn",
      "*.v6.666666.host:66"
    ],
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    "proxy-server-nameserver": ["223.5.5.5", "119.29.29.29"],
    "nameserver": ["223.5.5.5", "119.29.29.29"],
    "nameserver-policy": {
      "+.doppelmayr.cn": "10.19.0.8",
      "+.cwac.cc": [
        "https://dns.alidns.com/dns-query#disable-qtype-65=true",
        "223.5.5.5"
      ],
      "rule-set:cn_domain,private_domain,microsoftcn_domain,applecn_domain": [
        "https://dns.alidns.com/dns-query#disable-qtype-65=true",
        "https://doh.pub/dns-query#disable-qtype-65=true"
      ]
    }
  };

  // ================================================================
  // 7. 策略组构建
  // ================================================================
  var filterNodes = function(reg) {
    return proxyNames.filter(function(name) {
      return reg.test(name);
    });
  };

  var regionConfigs = [
    { key: "香港", reg: /(香港|hk|hkg|hongkong|hong\s*kong|🇭🇰)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/HK.png" },
    { key: "台湾", reg: /(台湾|台灣|tw|tpe|khh|tsa|taiwan|taipei|🇹🇼)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/TW.png" },
    { key: "日本", reg: /(日本|jp|nrt|hnd|kix|cts|fuk|japan|tokyo|🇯🇵)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/JP.png" },
    { key: "新加坡", reg: /(新加坡|sg|sin|xsp|singapore|🇸🇬)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/SG.png" },
    { key: "韩国", reg: /(韩国|韓國|kr|icn|gmp|pus|korea|seoul|🇰🇷)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/KR.png" },
    { key: "美国", reg: /(美国|美國|us|usa|lax|sfo|jfk|sjc|america|united\s*states|🇺🇸)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/US.png" },
    { key: "欧洲", reg: /(奥地利|奥地利共和国|比利时|保加利亚|克罗地亚|塞浦路斯|捷克|丹麦|爱沙尼亚|芬兰|法国|德国|希腊|匈牙利|爱尔兰|意大利|拉脱维亚|立陶宛|卢森堡|荷兰|波兰|葡萄牙|罗马尼亚|斯洛伐克|斯洛文尼亚|西班牙|瑞典|英国|🇧🇪|🇨🇿|🇩🇰|🇫🇮|🇫🇷|🇩🇪|🇮🇪|🇮🇹|🇱🇹|🇱🇺|🇳🇱|🇵🇱|🇸🇪|🇬🇧|CDG|FRA|AMS|MAD|BCN|FCO|MUC|BRU)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/EU.png" },
    { key: "歇斯底里", reg: /(hy|HY)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/OT.png" },
    { key: "Reality", reg: /(vless|reality|VL)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/OT.png" }
  ];

  var dynamicGroups = [];
  var fallbackList = [];
  var autoList = [];
  var manualList = [];

  regionConfigs.forEach(function(item) {
    var matched = filterNodes(item.reg);
    if (matched.length === 0) matched = ["DIRECT"];

    var mName = item.key + "-手动";
    var aName = item.key + "-自动";
    var fName = item.key + "-故转";

    dynamicGroups.push({
      name: mName,
      type: "select",
      proxies: matched,
      icon: item.icon
    });

    dynamicGroups.push({
      name: aName,
      type: "url-test",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      proxies: matched,
      hidden: true,
      icon: item.icon
    });

    if (item.key !== "歇斯底里" && item.key !== "Reality") {
      dynamicGroups.push({
        name: fName,
        type: "fallback",
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
        proxies: [mName, aName],
        hidden: true,
        icon: item.icon
      });
      fallbackList.push(fName);
    }

    autoList.push(aName);
    manualList.push(mName);
  });

  // 补充“其他-手动”
  var otherRegex = /^(?!.*(DIRECT|直接连接|香港|台湾|台灣|日本|韩国|韓國|新加坡|美国|美國|奥地利|比利时|保加利亚|克罗地亚|塞浦路斯|捷克|丹麦|爱沙尼亚|芬兰|法国|德国|希腊|匈牙利|爱尔兰|意大利|拉脱维亚|立陶宛|卢森堡|荷兰|波兰|葡萄牙|罗马尼亚|斯洛伐克|斯洛文尼亚|西班牙|瑞典|英国|🇭🇰|🇹🇼|🇸🇬|🇯🇵|🇰🇷|🇺🇸|🇬🇧|HK|TW|SG|JP|KR|US|GB|CDG|FRA|AMS|MAD|BCN|FCO|MUC|BRU|HKG|TPE|TSA|KHH|SIN|XSP|NRT|HND|KIX|CTS|FUK|JFK|LAX|ORD|ATL|DFW|SFO|MIA|SEA|IAD|LHR|LGW)).*$/i;
  var otherMatched = filterNodes(otherRegex);
  if (otherMatched.length === 0) otherMatched = ["DIRECT"];
  dynamicGroups.push({
    name: "其他-手动",
    type: "select",
    proxies: otherMatched,
    icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/OT.png"
  });
  manualList.push("其他-手动");

  // 出站基础锚点 proxies
  var basePG = fallbackList.concat(autoList).concat(manualList).concat(["DIRECT"]);
  var baseOP = ["一键代理"].concat(basePG);
  var baseLD = ["DIRECT", "一键代理"].concat(basePG.filter(function(x) { return x !== "DIRECT"; }));

  // 业务服务组
  var serviceGroupsConfig = [
    { name: "一键代理", proxies: basePG, icon: "Rocket.png" },
    { name: "ChatGPT", proxies: baseOP, icon: "ChatGPT.png" },
    { name: "Claude", proxies: baseOP, icon: "Claude.png" },
    { name: "Gemini", proxies: baseOP, icon: "Gemini.png" },
    { name: "YouTube", proxies: baseOP, icon: "YouTube.png" },
    { name: "Google", proxies: baseOP, icon: "Google.png" },
    { name: "GitHub", proxies: baseOP, icon: "GitHub.png" },
    { name: "OneDrive", proxies: baseLD, icon: "OneDrive.png" },
    { name: "Microsoft", proxies: baseLD, icon: "Microsoft.png" },
    { name: "AppleTV", proxies: baseOP, icon: "AppleTV.png" },
    { name: "Apple", proxies: baseLD, icon: "Apple.png" },
    { name: "TikTok", proxies: baseOP, icon: "TikTok.png" },
    { name: "Twitter(X)", proxies: baseOP, icon: "Twitter.png" },
    { name: "Telegram", proxies: baseOP, icon: "Telegram.png" },
    { name: "Netflix", proxies: baseOP, icon: "Netflix.png" },
    { name: "Disney", proxies: baseOP, icon: "Disney.png" },
    { name: "Spotify", proxies: baseOP, icon: "Spotify.png" },
    { name: "PayPal", proxies: baseOP, icon: "PayPal.png" },
    { name: "Speedtest", proxies: baseOP, icon: "Speedtest.png" },
    { name: "漏网之鱼", proxies: baseOP, icon: "MATCH.png" },
    { name: "国内直连", proxies: ["DIRECT"], hidden: true, icon: "China.png" }
  ];

  var serviceGroups = serviceGroupsConfig.map(function(g) {
    return {
      name: g.name,
      type: "select",
      proxies: g.proxies,
      hidden: !!g.hidden,
      icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/" + g.icon
    };
  });

  config["proxy-groups"] = serviceGroups.concat(dynamicGroups);

  // ================================================================
  // 8. 规则提供者 (Rule Providers) - 纯 MRS 引擎
  // ================================================================
  var mkMrsDomain = function(url) { return { type: "http", interval: 86400, behavior: "domain", format: "mrs", url: url }; };
  var mkMrsIp = function(url) { return { type: "http", interval: 86400, behavior: "ipcidr", format: "mrs", url: url }; };

  config["rule-providers"] = {
    "private_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/private.mrs"),
    "openai_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/openai.mrs"),
    "anthropic_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/anthropic.mrs"),
    "google-gemini_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/google-gemini.mrs"),
    "youtube_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/youtube.mrs"),
    "google_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/google.mrs"),
    "github_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/github.mrs"),
    "onedrive_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/onedrive.mrs"),
    "microsoftcn_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/microsoft@cn.mrs"),
    "microsoft_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/microsoft.mrs"),
    "appletv_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/apple-tvplus.mrs"),
    "applecn_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/apple@cn.mrs"),
    "apple_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/apple.mrs"),
    "tiktok_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/tiktok.mrs"),
    "twitter_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/twitter.mrs"),
    "porn_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/meta/geo/geosite/category-porn.mrs"),
    "telegram_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/telegram.mrs"),
    "netflix_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/netflix.mrs"),
    "disney_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/disney.mrs"),
    "spotify_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/spotify.mrs"),
    "paypal_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/paypal.mrs"),
    "speedtest_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-speedtest.mrs"),
    "geolocation-!cn": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/geolocation-!cn.mrs"),
    "cn_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs"),
    "add_direct_domain": mkMrsDomain("https://gh-proxy.org/https://raw.githubusercontent.com/Seven1echo/Yaml/refs/heads/main/rules/Seven1_Direct_Domain.mrs"),
    "private_ip": mkMrsIp("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/private.mrs"),
    "google_ip": mkMrsIp("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/google.mrs"),
    "telegram_ip": mkMrsIp("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/telegram.mrs"),
    "twitter_ip": mkMrsIp("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/twitter.mrs"),
    "netflix_ip": mkMrsIp("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/netflix.mrs"),
    "cn_ip": mkMrsIp("https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/cn.mrs")
  };

  // ================================================================
  // 9. 路由规则匹配 (前置短视频与核心大厂直连保护)
  // ================================================================
  config["rules"] = [
    // 局域网与公司/私有服务直连保护
    "RULE-SET,private_domain,DIRECT",
    "RULE-SET,private_ip,DIRECT,no-resolve",
    "IP-CIDR6,::1/128,DIRECT,no-resolve",
    "IP-CIDR,192.168.10.0/24,DIRECT,no-resolve",
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,223.5.5.5/32,DIRECT,no-resolve",
    "IP-CIDR,180.184.1.1/32,DIRECT,no-resolve",
    "IP-CIDR,119.29.29.29/32,DIRECT,no-resolve",
    "IP-CIDR6,fdde:a4d3:4c46::/48,DIRECT,no-resolve",
    "IP-CIDR6,fe80::/10,DIRECT,no-resolve",
    "DOMAIN-SUFFIX,cwac.cc,DIRECT",
    "DOMAIN-SUFFIX,doppelmayr.cn,DIRECT",

    // 【新增短视频及大厂直连规则，解决微信视频号与红果/抖音短剧卡顿、断流】
    "DOMAIN-KEYWORD,weixin,DIRECT",
    "DOMAIN-KEYWORD,qpic,DIRECT",
    "DOMAIN-KEYWORD,qlogo,DIRECT",
    "DOMAIN-SUFFIX,qq.com,DIRECT",
    "DOMAIN-SUFFIX,tencent.com,DIRECT",
    "DOMAIN-SUFFIX,byteoversea.com,DIRECT",
    "DOMAIN-SUFFIX,pstatp.com,DIRECT",
    "DOMAIN-SUFFIX,snssdk.com,DIRECT",
    "DOMAIN-SUFFIX,toutiao.com,DIRECT",
    "DOMAIN-SUFFIX,bytedance.com,DIRECT",
    "DOMAIN-SUFFIX,zijieapi.com,DIRECT",
    "DOMAIN-SUFFIX,volccdn.com,DIRECT",
    "DOMAIN-KEYWORD,zijie,DIRECT",
    "DOMAIN-KEYWORD,toutiaovod,DIRECT",
    "DOMAIN-KEYWORD,bytedns,DIRECT",

    // 海外 UDP/QUIC 阻断（防止 YouTube/Google 降速）
    "AND,((RULE-SET,geolocation-!cn),(DST-PORT,443),(NETWORK,UDP)),REJECT",

    // 业务指定分组
    "RULE-SET,openai_domain,ChatGPT",
    "RULE-SET,anthropic_domain,Claude",
    "RULE-SET,google-gemini_domain,Gemini",
    "RULE-SET,youtube_domain,YouTube",
    "RULE-SET,google_domain,Google",
    "RULE-SET,github_domain,GitHub",
    "RULE-SET,onedrive_domain,OneDrive",
    "RULE-SET,microsoftcn_domain,DIRECT",
    "RULE-SET,microsoft_domain,Microsoft",
    "RULE-SET,appletv_domain,AppleTV",
    "RULE-SET,applecn_domain,DIRECT",
    "RULE-SET,apple_domain,Apple",
    "RULE-SET,tiktok_domain,TikTok",
    "RULE-SET,twitter_domain,Twitter(X)",
    "RULE-SET,porn_domain,Telegram",
    "RULE-SET,telegram_domain,Telegram",
    "RULE-SET,netflix_domain,Netflix",
    "RULE-SET,disney_domain,Disney",
    "RULE-SET,spotify_domain,Spotify",
    "RULE-SET,paypal_domain,PayPal",
    "RULE-SET,speedtest_domain,Speedtest",
    "RULE-SET,google_ip,Google,no-resolve",
    "RULE-SET,telegram_ip,Telegram,no-resolve",
    "RULE-SET,twitter_ip,Twitter(X),no-resolve",
    "RULE-SET,netflix_ip,Netflix,no-resolve",

    // 排除国内分流与常规国内放行
    "RULE-SET,geolocation-!cn,一键代理",
    "RULE-SET,add_direct_domain,DIRECT",
    "RULE-SET,cn_domain,DIRECT",
    "RULE-SET,cn_ip,DIRECT,no-resolve",
    "MATCH,漏网之鱼"
  ];

  return config;
}
