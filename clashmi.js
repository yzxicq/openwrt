function main(config) {
  // ================================================================
  // 1. 基础配置与网络协议
  // ================================================================
  config["mode"] = "rule";
  config["ipv6"] = true;
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
  // 2. TUN 虚拟网卡配置 (移动端核心模式)
  // ================================================================
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

  // ================================================================
  // 3. 流量嗅探 (Sniffer)
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
  // 4. Hosts 静态映射与 PCDN 阻断
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
  // 5. DNS 防泄漏与内外网分流
  // ================================================================
  config["dns"] = {
    "enable": true,
    "ipv6": true,
    "listen": "0.0.0.0:7874",
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "fake-ip-filter-mode": "blacklist",
    "respect-rules": true,
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
  // 6. 提取原始机场节点并构建动态拓扑
  // ================================================================
  const rawProxies = Array.isArray(config["proxies"]) ? config["proxies"] : [];
  const proxyNames = [];
  rawProxies.forEach(p => {
    if (p && p.name && !/到期|过期|剩余|网址|官网|邮箱|订阅|套餐|流量|说明|重置/i.test(p.name)) {
      proxyNames.push(p.name);
    }
  });

  const filterNodes = (reg) => proxyNames.filter(name => reg.test(name));

  const regionConfigs = [
    { key: "香港", reg: /(?i)(香港|(?<![a-zA-Z])(hk|hkg)(?![a-zA-Z])|hongkong|hong kong|🇭🇰)/, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/HK.png" },
    { key: "台湾", reg: /(?i)(台湾|台灣|(?<![a-zA-Z])(tw|tpe|khh|tsa)(?![a-zA-Z])|taiwan|taipei|🇹🇼)/, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/TW.png" },
    { key: "日本", reg: /(?i)(日本|(?<![a-zA-Z])(jp|nrt|hnd|kix|cts|fuk)(?![a-zA-Z])|japan|tokyo|🇯🇵)/, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/JP.png" },
    { key: "新加坡", reg: /(?i)(新加坡|(?<![a-zA-Z])(sg|sin|xsp)(?![a-zA-Z])|singapore|🇸🇬)/, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/SG.png" },
    { key: "韩国", reg: /(?i)(韩国|韓國|(?<![a-zA-Z])(kr|icn|gmp|pus)(?![a-zA-Z])|korea|seoul|🇰🇷)/, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/KR.png" },
    { key: "美国", reg: /(?i)(美国|美國|(?<![a-zA-Z])(us|usa|lax|sfo|jfk|sjc)(?![a-zA-Z])|america|united states|🇺🇸)/, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/US.png" },
    { key: "欧洲", reg: /^(?i)(?=.*(奥地利|奥地利共和国|比利时|保加利亚|克罗地亚|塞浦路斯|捷克|丹麦|爱沙尼亚|芬兰|法国|德国|希腊|匈牙利|爱尔兰|意大利|拉脱维亚|立陶宛|卢森堡|荷兰|波兰|葡萄牙|罗马尼亚|斯洛伐克|斯洛文尼亚|西班牙|瑞典|英国|🇧🇪|🇨🇿|🇩🇰|🇫🇮|🇫🇷|🇩🇪|🇮🇪|🇮🇹|🇱🇹|🇱🇺|🇳🇱|🇵🇱|🇸🇪|🇬🇧|CDG|FRA|AMS|MAD|BCN|FCO|MUC|BRU)).*$/, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/EU.png" },
    { key: "歇斯底里", reg: /(?i)(hy|HY)/, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/OT.png" },
    { key: "Reality", reg: /(?i)(vless|VLESS|Reality|reality|VL|vl)/, icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/OT.png" }
  ];

  const dynamicGroups = [];
  const fallbackList = [];
  const autoList = [];
  const manualList = [];

  regionConfigs.forEach(item => {
    let matched = filterNodes(item.reg);
    if (matched.length === 0) matched = ["DIRECT"];

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

    // 歇斯底里与 Reality 无故转组，仅地区组生成故转
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
  const otherRegex = /^(?!.*(DIRECT|直接连接|香港|台湾|台灣|日本|韩国|韓國|新加坡|美国|美國|奥地利|比利时|保加利亚|克罗地亚|塞浦路斯|捷克|丹麦|爱沙尼亚|芬兰|法国|德国|希腊|匈牙利|爱尔兰|意大利|拉脱维亚|立陶宛|卢森堡|荷兰|波兰|葡萄牙|罗马尼亚|斯洛伐克|斯洛文尼亚|西班牙|瑞典|英国|🇭🇰|🇹🇼|🇸🇬|🇯🇵|🇰🇷|🇺🇸|🇬🇧|HK|TW|SG|JP|KR|US|GB|CDG|FRA|AMS|MAD|BCN|FCO|MUC|BRU|HKG|TPE|TSA|KHH|SIN|XSP|NRT|HND|KIX|CTS|FUK|JFK|LAX|ORD|ATL|DFW|SFO|MIA|SEA|IAD|LHR|LGW)).*$/;
  let otherMatched = filterNodes(otherRegex);
  if (otherMatched.length === 0) otherMatched = ["DIRECT"];
  dynamicGroups.push({
    name: "其他-手动",
    type: "select",
    proxies: otherMatched,
    icon: "https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/OT.png"
  });
  manualList.push("其他-手动");

  // 出站基础锚点 proxies
  const basePG = [...fallbackList, ...autoList, ...manualList, "DIRECT"];
  const baseOP = ["一键代理", ...basePG];
  const baseLD = ["DIRECT", "一键代理", ...basePG.filter(p => p !== "DIRECT")];

  // 业务服务组
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

  const serviceGroups = serviceGroupsConfig.map(g => ({
    name: g.name,
    type: "select",
    proxies: g.proxies,
    hidden: !!g.hidden,
    icon: `https://gh-proxy.org/https://github.com/Seven1echo/Yaml/raw/main/icons/${g.icon}`
  }));

  config["proxy-groups"] = [...serviceGroups, ...dynamicGroups];

  // ================================================================
  // 7. 规则提供者 (Rule Providers) - 纯 MRS 引擎
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
  // 8. 路由匹配规则 (Rules)
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
