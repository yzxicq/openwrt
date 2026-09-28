function main(config) {
  // ================================================================
  // 1. 基础内核参数设置 (贴合 Mihomo 最佳性能)  Windows非管理员用户，without TUN
  // ================================================================
  config["mode"] = "rule";
  config["ipv6"] = true;
  config["mixed-port"] = 7890;
  config["allow-lan"] = true;
  config["bind-address"] = "*";
  config["log-level"] = "info"; // 降低日志级别，减少安卓耗电
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["global-ua"] = "clash.meta";
  config["find-process-mode"] = "strict";

  config["profile"] = {
    "store-selected": true,
    "store-fake-ip": true
  };

  // ================================================================
  // 2. 节点防御性深度清洗 (根治 5G 超时与协议报错的核心)
  // ================================================================
  const rawProxies = Array.isArray(config["proxies"]) ? config["proxies"] : [];
  const safeProxies = [];
  const proxyNames = [];

  const filterRegex = /到期|过期|剩余|网址|官网|邮箱|订阅|套餐|流量|说明|重置/i;

  rawProxies.forEach((p) => {
    // 过滤无效节点和广告节点
    if (!p || !p.name || typeof p.name !== "string" || filterRegex.test(p.name)) return;

    // --- [社区最佳实践 1：修复 Hysteria 2 强类型校验与安卓证书拦截] ---
    if (p.type === "hysteria2" || p.type === "hysteria") {
      // 必须确保 alpn 是数组，否则内核静默超时
      if (typeof p.alpn === "string") {
        p.alpn = [p.alpn];
      } else if (!Array.isArray(p.alpn) || p.alpn.length === 0) {
        p.alpn = ["h3"]; // 默认走 h3
      }
      
      // 强制兼容安卓严格的 TLS 证书校验
      if (p["skip-cert-verify"] === undefined) {
        p["skip-cert-verify"] = true;
      }

      // 修正兼容旧版订阅的拼写
      if (p.fastopen !== undefined) {
        p["fast-open"] = Boolean(p.fastopen);
        delete p.fastopen;
      }
    }

    // --- [社区最佳实践 2：修复 Reality 短 ID 不规范导致的 Fatal Error] ---
    const reality = p["reality-opts"] || p["reality_opts"];
    if (reality) {
      const sidKey = ("short-id" in reality) ? "short-id" : ("shortId" in reality ? "shortId" : null);
      if (sidKey) {
        const sid = String(reality[sidKey] || "").trim();
        // 必须为偶数位长度的 Hex，否则剔除让其走默认，防止崩溃
        const isValidHex = /^[0-9a-fA-F]*$/.test(sid) && sid.length % 2 === 0;
        if (!isValidHex) {
          delete reality[sidKey];
        }
      }
    }

    safeProxies.push(p);
    proxyNames.push(p.name);
  });

  config["proxies"] = safeProxies;

  // 极端容错：如果没有获取到任何有效节点，返回基础配置避免空指针
  if (proxyNames.length === 0) {
    return config;
  }

  // ================================================================
  // 3. DNS 5G 防劫持机制 (解决 Wi-Fi 通、5G 不通的痛点)
  // ================================================================
  config["dns"] = {
    "enable": true,
    "ipv6": true,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter-mode": "blacklist",
    "respect-rules": true,
    "cache-algorithm": "arc",
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    // [社区最佳实践 3：专门为节点域名解析配置 DoH，绕过运营商 5G UDP 阻断]
    "proxy-server-nameserver": [
      "https://223.5.5.5/dns-query",
      "https://doh.pub/dns-query"
    ],
    "nameserver": [
      "https://223.5.5.5/dns-query",
      "https://doh.pub/dns-query"
    ],
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
    ]
  };

  // ================================================================
  // 4. 原样保留用户的完整策略组构建逻辑
  // ================================================================
  const filterNodes = (reg) => {
    const matched = proxyNames.filter((name) => reg.test(name));
    return matched.length > 0 ? matched : ["DIRECT"]; // 找不到时回退 DIRECT，避免空策略组报错
  };

  const regionConfigs = [
    { key: "香港", reg: /(香港|hk|hkg|hongkong|hong\s*kong|🇭🇰)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/HK.png" },
    { key: "台湾", reg: /(台湾|台灣|tw|tpe|khh|tsa|taiwan|taipei|🇹🇼)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/TW.png" },
    { key: "日本", reg: /(日本|jp|nrt|hnd|kix|cts|fuk|japan|tokyo|🇯🇵)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/JP.png" },
    { key: "新加坡", reg: /(新加坡|sg|sin|xsp|singapore|🇸🇬)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/SG.png" },
    { key: "韩国", reg: /(韩国|韓國|kr|icn|gmp|pus|korea|seoul|🇰🇷)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/KR.png" },
    { key: "美国", reg: /(美国|美國|us|usa|lax|sfo|jfk|sjc|america|united\s*states|🇺🇸)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/US.png" },
    { key: "欧洲", reg: /(奥地利|奥地利共和国|比利时|保加利亚|克罗地亚|塞浦路斯|捷克|丹麦|爱沙尼亚|芬兰|法国|德国|希腊|匈牙利|爱尔兰|意大利|拉脱维亚|立陶宛|卢森堡|荷兰|波兰|葡萄牙|罗马尼亚|斯洛伐克|斯洛文尼亚|西班牙|瑞典|英国|🇧🇪|🇨🇿|🇩🇰|🇫🇮|🇫🇷|🇩🇪|🇮🇪|🇮🇹|🇱🇹|🇱🇺|🇳🇱|🇵🇱|🇸🇪|🇬🇧|CDG|FRA|AMS|MAD|BCN|FCO|MUC|BRU)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/EU.png" },
    { key: "歇斯底里", reg: /(hy|HY|hysteria)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/OT.png" },
    { key: "Reality", reg: /(vless|reality|VL)/i, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/OT.png" }
  ];

  const dynamicGroups = [];
  const fallbackList = [];
  const autoList = [];
  const manualList = [];

  regionConfigs.forEach((item) => {
    let matched = filterNodes(item.reg);

    const mName = `${item.key}-手动`;
    const aName = `${item.key}-自动`;
    const fName = `${item.key}-故转`;

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
  const otherRegex = /^(?!.*(DIRECT|直接连接|香港|台湾|台灣|日本|韩国|韓國|新加坡|美国|美國|奥地利|比利时|保加利亚|克罗地亚|塞浦路斯|捷克|丹麦|爱沙尼亚|芬兰|法国|德国|希腊|匈牙利|爱尔兰|意大利|拉脱维亚|立陶宛|卢森堡|荷兰|波兰|葡萄牙|罗马尼亚|斯洛伐克|斯洛文尼亚|西班牙|瑞典|英国|🇭🇰|🇹🇼|🇸🇬|🇯🇵|🇰🇷|🇺🇸|🇬🇧|HK|TW|SG|JP|KR|US|GB|CDG|FRA|AMS|MAD|BCN|FCO|MUC|BRU|HKG|TPE|TSA|KHH|SIN|XSP|NRT|HND|KIX|CTS|FUK|JFK|LAX|ORD|ATL|DFW|SFO|MIA|SEA|IAD|LHR|LGW)).*$/i;
  dynamicGroups.push({
    name: "其他-手动",
    type: "select",
    proxies: filterNodes(otherRegex),
    icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/OT.png"
  });
  manualList.push("其他-手动");

  const basePG = [...fallbackList, ...autoList, ...manualList, "DIRECT"];
  const baseOP = ["一键代理", ...basePG];
  const baseLD = ["DIRECT", "一键代理", ...basePG.filter((p) => p !== "DIRECT")];

  const serviceGroupsConfig = [
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

  const serviceGroups = serviceGroupsConfig.map((g) => ({
    name: g.name,
    type: "select",
    proxies: g.proxies,
    hidden: !!g.hidden,
    icon: `https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/${g.icon}`
  }));

  config["proxy-groups"] = [...serviceGroups, ...dynamicGroups];

  // ================================================================
  // 5. 规则提供者 (Rule Providers) 
  // ================================================================
  const mkMrsDomain = (url) => ({ type: "http", interval: 86400, behavior: "domain", format: "mrs", url });
  const mkMrsIp = (url) => ({ type: "http", interval: 86400, behavior: "ipcidr", format: "mrs", url });

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
  // 6. 路由规则匹配 (Rules)
  // ================================================================
  config["rules"] = [
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
    "AND,((RULE-SET,geolocation-!cn),(DST-PORT,443),(NETWORK,UDP)),REJECT",
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
    "RULE-SET,geolocation-!cn,一键代理",
    "RULE-SET,add_direct_domain,DIRECT",
    "RULE-SET,cn_domain,DIRECT",
    "RULE-SET,cn_ip,DIRECT,no-resolve",
    "MATCH,漏网之鱼"
  ];

  return config;
}
