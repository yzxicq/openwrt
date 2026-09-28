function main(config) {
  // ================================================================
  // 1. 基础运行参数优化 (按需增量打补丁)
  // ================================================================
  config["mode"] = config["mode"] || "rule";
  config["ipv6"] = true;
  config["log-level"] = "warning";
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["find-process-mode"] = "strict";

  // ================================================================
  // 2. 节点防御性清洗与规范化 (核心：杜绝类型错误导致的内核崩溃)
  // ================================================================
  const rawProxies = Array.isArray(config["proxies"]) ? config["proxies"] : [];
  const safeProxies = [];
  const proxyNames = [];

  // 广告与过期过滤关键词
  const filterRegex = /到期|过期|剩余|官网|订阅|套餐|流量|说明|重置|traffic|expire/i;

  rawProxies.forEach((p) => {
    if (!p || !p.name || typeof p.name !== "string" || filterRegex.test(p.name)) return;

    // --- 针对 Hysteria 2 的类型兼容规范 ---
    if (p.type === "hysteria2" || p.type === "hysteria") {
      // alpn 必须严格为数组，禁止裸字符串
      if (typeof p.alpn === "string") {
        p.alpn = [p.alpn];
      } else if (!Array.isArray(p.alpn) || p.alpn.length === 0) {
        p.alpn = ["h3"];
      }

      // 移动端严格证书环境兼容：若未明确定义，默认放宽校验避免阻断
      if (p["skip-cert-verify"] === undefined) {
        p["skip-cert-verify"] = true;
      }

      // 属性名称统一化 (fastopen 兼容)
      if (p.fastopen !== undefined) {
        p["fast-open"] = Boolean(p.fastopen);
        delete p.fastopen;
      }
    }

    // --- 针对 VLESS Reality 的 short-id 清洗 ---
    const reality = p["reality-opts"] || p["reality_opts"];
    if (reality) {
      const sidKey = ("short-id" in reality) ? "short-id" : ("shortId" in reality ? "shortId" : null);
      if (sidKey) {
        const sid = String(reality[sidKey] || "").trim();
        // 必须为偶数长度的 16 进制字符串，否则内核解析必报 fatal error
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

  // 兜底保障：若清洗后无有效节点，直接回退并终止，避免构建空策略组报错
  if (proxyNames.length === 0) {
    return config;
  }

  // ================================================================
  // 3. DNS 韧性增强 (彻底解决 5G 蜂窝网络无法解析与阻断)
  // ================================================================
  // 节点域名解析服务器采用直连纯 IP 的 DoH，彻底免疫 5G 基站对 UDP 53 的劫持
  const bootstrapDns = [
    "223.5.5.5",
    "119.29.29.29"
  ];
  
  const secureDns = [
    "https://223.5.5.5/dns-query#h3=true",
    "https://doh.pub/dns-query"
  ];

  config["dns"] = {
    "enable": true,
    "ipv6": true,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "respect-rules": true,
    "cache-algorithm": "arc",
    "default-nameserver": bootstrapDns,
    "proxy-server-nameserver": secureDns, // 关键：解析节点域名专用
    "nameserver": secureDns,
    "fake-ip-filter": [
      "+.lan",
      "+.local",
      "+.msftconnecttest.com",
      "+.msftncsi.com",
      "time.*.com",
      "ntp.*.com",
      "+.pool.ntp.org"
    ]
  };

  // ================================================================
  // 4. 动态轻量化策略组 (解耦设计)
  // ================================================================
  const getMatched = (reg) => {
    const list = proxyNames.filter((n) => reg.test(n));
    return list.length > 0 ? list : ["DIRECT"];
  };

  const autoProxyGroup = {
    name: "⚡ 自动选优",
    type: "url-test",
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50,
    proxies: proxyNames
  };

  const manualProxyGroup = {
    name: "🚀 手动切换",
    type: "select",
    proxies: ["⚡ 自动选优", ...proxyNames, "DIRECT"]
  };

  // 针对特定地区的提取（按需扩展）
  const hkNodes = getMatched(/香港|hk|hkg|hongkong|🇭🇰/i);
  const usNodes = getMatched(/美国|us|united\s*states|🇺🇸/i);
  const jpNodes = getMatched(/日本|jp|japan|tokyo|🇯🇵/i);

  const regionGroups = [
    { name: "🇭🇰 香港节点", type: "select", proxies: hkNodes },
    { name: "🇺🇸 美国节点", type: "select", proxies: usNodes },
    { name: "🇯🇵 日本节点", type: "select", proxies: jpNodes }
  ];

  // 业务应用分流组
  const appGroups = [
    { name: "🤖 AI 平台", type: "select", proxies: ["🇺🇸 美国节点", "🚀 手动切换", "⚡ 自动选优"] },
    { name: "🎬 国际流媒体", type: "select", proxies: ["🚀 手动切换", "🇭🇰 香港节点", "🇺🇸 美国节点", "⚡ 自动选优"] },
    { name: "🐟 漏网之鱼", type: "select", proxies: ["🚀 手动切换", "DIRECT"] }
  ];

  config["proxy-groups"] = [
    manualProxyGroup,
    autoProxyGroup,
    ...appGroups,
    ...regionGroups
  ];

  // ================================================================
  // 5. 规则集配置 (Rule Providers 与轻量规则匹配)
  // ================================================================
  config["rule-providers"] = {
    "openai": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      interval: 86400,
      url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/openai.mrs"
    },
    "geolocation-no-cn": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      interval: 86400,
      url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/geolocation-!cn.mrs"
    },
    "cn-domain": {
      type: "http",
      behavior: "domain",
      format: "mrs",
      interval: 86400,
      url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs"
    }
  };

  config["rules"] = [
    "RULE-SET,openai,🤖 AI 平台",
    "RULE-SET,geolocation-no-cn,🚀 手动切换",
    "RULE-SET,cn-domain,DIRECT",
    "GEOIP,CN,DIRECT,no-resolve",
    "MATCH,🐟 漏网之鱼"
  ];

  return config;
}
