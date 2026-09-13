// 相关环境变量(都是可选的)
// KV / DATA_KV / CONFIG_KV: 绑定 Cloudflare KV 命名空间实现后台持久化配置
// SUB_PATH | subpath  订阅路径
// PROXYIP  | proxyip  代理IP
// UUID     | uuid     UUID
// DISABLE_TROJAN | 是否关闭Trojan, 设置为true时关闭，false开启，默认开启 
// DISABLE_SS     | 是否关闭Shadowsocks, 设置为true时关闭，false开启，默认开启
// SSPATH   | sspath   Shadowsocks验证路径, 为空则使用UUID作为验证路径

import { connect } from 'cloudflare:sockets';

const DEFAULT_CONFIG = {
    subPath: 'link',
    password: '123456',
    adminPassword: 'admin',
    proxyIP: 'proxy.xxxxxxxx.tk:50001',
    yourUUID: '5dc15e15-f285-4a9d-959b-0e4fbdd77b63',
    disabletro: false,
    disabless: false,
    SSpath: '',
    cfip: [
        'mfa.gov.ua#SG', 'saas.sin.fan#HK', 'store.ubi.com#JP','cf.130519.xyz#KR','cf.008500.xyz#HK', 
        'cf.090227.xyz#SG', 'cf.877774.xyz#HK','cdns.doon.eu.org#JP','sub.danfeng.eu.org#TW','cf.zhetengsha.eu.org#HK'
    ],
    clashSubUrl: 'https://sublink.alwaysdata.net/clash?config=',
    singboxSubUrl: 'https://sublink.alwaysdata.net/singbox?config='
};

let subPath = DEFAULT_CONFIG.subPath;
let password = DEFAULT_CONFIG.password;
let adminPassword = DEFAULT_CONFIG.adminPassword;
let proxyIP = DEFAULT_CONFIG.proxyIP;
let yourUUID = DEFAULT_CONFIG.yourUUID;
let disabletro = DEFAULT_CONFIG.disabletro;
let disabless = DEFAULT_CONFIG.disabless;
let SSpath = DEFAULT_CONFIG.SSpath;
let cfip = [...DEFAULT_CONFIG.cfip];

function getKV(env) {
    if (!env) return null;
    return env.KV || env.DATA_KV || env.CONFIG_KV || null;
}

async function loadConfig(env) {
    let config = { ...DEFAULT_CONFIG, cfip: [...DEFAULT_CONFIG.cfip] };

    // 1. 环境变量覆盖
    if (env) {
        if (env.UUID || env.uuid || env.AUTH) config.yourUUID = env.UUID || env.uuid || env.AUTH;
        if (env.PASSWORD || env.PASSWD || env.password) config.password = env.PASSWORD || env.PASSWD || env.password;
        if (env.ADMIN || env.admin) config.adminPassword = env.ADMIN || env.admin;
        if (env.SUB_PATH || env.subpath) config.subPath = env.SUB_PATH || env.subpath;
        if (env.PROXYIP || env.proxyip || env.proxyIP) {
            const servers = (env.PROXYIP || env.proxyip || env.proxyIP).split(',').map(s => s.trim());
            config.proxyIP = servers[0];
        }
        if (env.DISABLE_TROJAN !== undefined || env.CLOSE_TROJAN !== undefined) {
            const dt = env.DISABLE_TROJAN || env.CLOSE_TROJAN;
            config.disabletro = dt === 'true' || dt === true;
        }
        if (env.DISABLE_SS !== undefined || env.CLOSE_SS !== undefined) {
            const ds = env.DISABLE_SS || env.CLOSE_SS;
            config.disabless = ds === 'true' || ds === true;
        }
        if (env.SSPATH || env.sspath) config.SSpath = env.SSPATH || env.sspath;
        if (env.CLASH_SUB_URL) config.clashSubUrl = env.CLASH_SUB_URL;
        if (env.SINGBOX_SUB_URL) config.singboxSubUrl = env.SINGBOX_SUB_URL;
    }

    // 2. 从 Cloudflare KV 读取持久化配置
    const kv = getKV(env);
    if (kv) {
        try {
            const kvData = await kv.get('CONFIG', 'json');
            if (kvData && typeof kvData === 'object') {
                if (kvData.yourUUID) config.yourUUID = String(kvData.yourUUID).trim();
                if (kvData.password) config.password = String(kvData.password).trim();
                if (kvData.adminPassword) config.adminPassword = String(kvData.adminPassword).trim();
                else if (kvData.ADMIN) config.adminPassword = String(kvData.ADMIN).trim();
                if (kvData.subPath !== undefined && kvData.subPath !== null) config.subPath = String(kvData.subPath).trim();
                if (kvData.proxyIP) config.proxyIP = String(kvData.proxyIP).trim();
                if (Array.isArray(kvData.cfip) && kvData.cfip.length > 0) config.cfip = kvData.cfip.map(s => String(s).trim()).filter(Boolean);
                if (kvData.disabletro !== undefined) config.disabletro = kvData.disabletro === true || kvData.disabletro === 'true';
                if (kvData.disabless !== undefined) config.disabless = kvData.disabless === true || kvData.disabless === 'true';
                if (kvData.SSpath !== undefined && kvData.SSpath !== null) config.SSpath = String(kvData.SSpath).trim();
                if (kvData.clashSubUrl) config.clashSubUrl = String(kvData.clashSubUrl).trim();
                if (kvData.singboxSubUrl) config.singboxSubUrl = String(kvData.singboxSubUrl).trim();
            }
        } catch (e) {
            // KV 读取失败时使用降级配置
        }
    }

    if (config.subPath === 'link' || config.subPath === '') {
        config.subPath = config.yourUUID;
    }
    return config;
}

async function saveConfig(env, newConfig) {
    const kv = getKV(env);
    if (!kv) {
        throw new Error('未检测到绑定的 KV 命名空间，请先在 Cloudflare 控制台添加名为 KV 的变量绑定');
    }
    await kv.put('CONFIG', JSON.stringify(newConfig));
}

async function resetConfig(env) {
    const kv = getKV(env);
    if (!kv) {
        throw new Error('未检测到绑定的 KV 命名空间');
    }
    await kv.delete('CONFIG');
}
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
function closeSocketQuietly(socket) { 
    try { 
        if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
            socket.close(); 
        }
    } catch (error) {} 
}

function formatIdentifier(arr, offset = 0) {
    const hex = [...arr.slice(offset, offset + 16)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`;
}

function base64ToArray(b64Str) {
    if (!b64Str) return { error: null };
    try { 
        const binaryString = atob(b64Str.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return { earlyData: bytes.buffer, error: null }; 
    } catch (error) { 
        return { error }; 
    }
}

function parsePryAddress(serverStr) {
    if (!serverStr) return null;
    serverStr = serverStr.trim();
    // 解析 S5
    if (serverStr.startsWith('socks://') || serverStr.startsWith('socks5://')) {
        const urlStr = serverStr.replace(/^socks:\/\//, 'socks5://');
        try {
            const url = new URL(urlStr);
            return {
                type: 'socks5',
                host: url.hostname,
                port: parseInt(url.port) || 1080,
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }
    
    // 解析 HTTP
    if (serverStr.startsWith('http://') || serverStr.startsWith('https://')) {
        try {
            const url = new URL(serverStr);
            return {
                type: 'http',
                host: url.hostname,
                port: parseInt(url.port) || (serverStr.startsWith('https://') ? 443 : 80),
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }
    
    // 处理 IPv6 格式 [host]:port
    if (serverStr.startsWith('[')) {
        const closeBracket = serverStr.indexOf(']');
        if (closeBracket > 0) {
            const host = serverStr.substring(1, closeBracket);
            const rest = serverStr.substring(closeBracket + 1);
            if (rest.startsWith(':')) {
                const port = parseInt(rest.substring(1), 10);
                if (!isNaN(port) && port > 0 && port <= 65535) {
                    return { type: 'direct', host, port };
                }
            }
            return { type: 'direct', host, port: 443 };
        }
    }

    const lastColonIndex = serverStr.lastIndexOf(':');
    
    if (lastColonIndex > 0) {
        const host = serverStr.substring(0, lastColonIndex);
        const portStr = serverStr.substring(lastColonIndex + 1);
        const port = parseInt(portStr, 10);
        
        if (!isNaN(port) && port > 0 && port <= 65535) {
            return { type: 'direct', host, port };
        }
    }
    
    return { type: 'direct', host: serverStr, port: 443 };
}

function isSpeedTestSite(hostname) {
    const speedTestDomains = ['speedtest.net','fast.com','speedtest.cn','speed.cloudflare.com', 'ovo.speedtestcustom.com'];
    if (speedTestDomains.includes(hostname)) {
        return true;
    }

    for (const domain of speedTestDomains) {
        if (hostname.endsWith('.' + domain) || hostname === domain) {
            return true;
        }
    }
    return false;
}

async function sha224(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let H = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen, false);
  for (let chunk = 0; chunk < paddedLen; chunk += 64) {
    const W = new Uint32Array(64);
    
    for (let i = 0; i < 16; i++) {
      W[i] = view.getUint32(chunk + i * 4, false);
    }
    
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(W[i - 15], 7) ^ rightRotate(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rightRotate(W[i - 2], 17) ^ rightRotate(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    
    let [a, b, c, d, e, f, g, h] = H;
    
    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  
  const result = [];
  for (let i = 0; i < 7; i++) {
    result.push(
      ((H[i] >>> 24) & 0xff).toString(16).padStart(2, '0'),
      ((H[i] >>> 16) & 0xff).toString(16).padStart(2, '0'),
      ((H[i] >>> 8) & 0xff).toString(16).padStart(2, '0'),
      (H[i] & 0xff).toString(16).padStart(2, '0')
    );
  }
  return result.join('');
}

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

export default {
	/**
	 * @param {import("@cloudflare/workers-types").Request} request
	 * @param {{UUID: string, uuid: string, PROXYIP: string, PASSWORD: string, PASSWD: string, password: string, proxyip: string, proxyIP: string, SUB_PATH: string, subpath: string, DISABLE_TROJAN: string, CLOSE_TROJAN: string}} env
	 * @param {import("@cloudflare/workers-types").ExecutionContext} ctx
	 * @returns {Promise<Response>}
	 */
    async fetch(request, env, ctx) {
        try {
            const config = await loadConfig(env);
            const kv = getKV(env);
            const hasKV = !!kv;

            yourUUID = config.yourUUID;
            password = config.password;
            subPath = config.subPath;
            proxyIP = config.proxyIP;
            disabletro = config.disabletro;
            disabless = config.disabless;
            SSpath = config.SSpath;
            cfip = config.cfip;

            const currentSSpath = config.SSpath || config.yourUUID;
            const validSSPath = `/${currentSSpath}`;
            
            const url = new URL(request.url);
            const pathname = url.pathname;
            
            // 1. 后台配置 API: /api/config (需后台管理员密码 ADMIN 鉴权)
            if (pathname === '/api/config') {
                const reqPassword = url.searchParams.get('password') || request.headers.get('x-password');
                if (reqPassword !== config.adminPassword) {
                    return new Response(JSON.stringify({ success: false, message: '后台管理鉴权失败，密码错误' }), {
                        status: 401,
                        headers: { 'Content-Type': 'application/json; charset=utf-8' }
                    });
                }
                if (request.method === 'POST') {
                    if (!hasKV) {
                        return new Response(JSON.stringify({ 
                            success: false, 
                            message: '未检测到绑定的 KV 命名空间！请先在 Cloudflare 控制台为该 Worker 添加名为 KV 的变量绑定。' 
                        }), {
                            status: 400,
                            headers: { 'Content-Type': 'application/json; charset=utf-8' }
                        });
                    }
                    try {
                        const body = await request.json();
                        let newCfip = config.cfip;
                        if (typeof body.cfip === 'string') {
                            newCfip = body.cfip.split('\n').map(s => s.trim()).filter(Boolean);
                        } else if (Array.isArray(body.cfip)) {
                            newCfip = body.cfip.map(s => String(s).trim()).filter(Boolean);
                        }
                        
                        const updatedConfig = {
                            yourUUID: (body.yourUUID && String(body.yourUUID).trim()) || config.yourUUID,
                            password: (body.password && String(body.password).trim()) || config.password,
                            adminPassword: (body.adminPassword && String(body.adminPassword).trim()) || config.adminPassword,
                            subPath: body.subPath !== undefined ? String(body.subPath).trim() : config.subPath,
                            proxyIP: (body.proxyIP && String(body.proxyIP).trim()) || config.proxyIP,
                            disabletro: body.disabletro === true || body.disabletro === 'true',
                            disabless: body.disabless === true || body.disabless === 'true',
                            SSpath: body.SSpath !== undefined ? String(body.SSpath).trim() : config.SSpath,
                            cfip: newCfip.length > 0 ? newCfip : config.cfip,
                            clashSubUrl: (body.clashSubUrl && String(body.clashSubUrl).trim()) || config.clashSubUrl,
                            singboxSubUrl: (body.singboxSubUrl && String(body.singboxSubUrl).trim()) || config.singboxSubUrl
                        };
                        await saveConfig(env, updatedConfig);
                        return new Response(JSON.stringify({ success: true, message: '配置已成功持久化保存到 Cloudflare KV！' }), {
                            headers: { 'Content-Type': 'application/json; charset=utf-8' }
                        });
                    } catch (err) {
                        return new Response(JSON.stringify({ success: false, message: '保存失败: ' + err.message }), {
                            status: 500,
                            headers: { 'Content-Type': 'application/json; charset=utf-8' }
                        });
                    }
                } else if (request.method === 'GET') {
                    return new Response(JSON.stringify({ success: true, config, hasKV }), {
                        headers: { 'Content-Type': 'application/json; charset=utf-8' }
                    });
                }
            }

            // 2. 后台重置 API: /api/reset (需后台管理员密码 ADMIN 鉴权)
            if (pathname === '/api/reset' && request.method === 'POST') {
                const reqPassword = url.searchParams.get('password') || request.headers.get('x-password');
                if (reqPassword !== config.adminPassword) {
                    return new Response(JSON.stringify({ success: false, message: '后台管理鉴权失败，密码错误' }), {
                        status: 401,
                        headers: { 'Content-Type': 'application/json; charset=utf-8' }
                    });
                }
                if (!hasKV) {
                    return new Response(JSON.stringify({ success: false, message: '未绑定 KV 存储，无法重置' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json; charset=utf-8' }
                    });
                }
                await resetConfig(env);
                return new Response(JSON.stringify({ success: true, message: '已清除 KV 配置，恢复默认设置！' }), {
                    headers: { 'Content-Type': 'application/json; charset=utf-8' }
                });
            }

            // 3. 路径中 proxyip 处理
            let pathProxyIP = null;
            const proxyIpMatch = pathname.match(/\/proxyip=([^/?&#]+)/i);
            if (proxyIpMatch) {
                try {
                    pathProxyIP = decodeURIComponent(proxyIpMatch[1]).trim();
                } catch (e) {
                    // 忽略错误
                }
            } else if (pathname.startsWith('/proxyip=')) {
                try {
                    pathProxyIP = decodeURIComponent(pathname.substring(9)).trim();
                } catch (e) {
                    // 忽略错误
                }
            }

            if (pathProxyIP && !request.headers.get('Upgrade')) {
                config.proxyIP = pathProxyIP;
                proxyIP = pathProxyIP;
                return new Response(`set proxyIP to: ${proxyIP}\n\n`, {
                    headers: { 
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                    },
                });
            }

            // 4. WebSocket 连接
            if (request.headers.get('Upgrade') === 'websocket') {
                const customProxyIP = pathProxyIP || url.searchParams.get('proxyip') || request.headers.get('proxyip');
                return await handleVlsRequest(request, customProxyIP, validSSPath);
            } else if (request.method === 'GET') {
                // 5. 后台管理页面 (/admin - 需 ADMIN 密码验证)
                if (url.pathname === '/admin' || url.pathname === '/admin/') {
                    return getAdminPage(request, validSSPath, config, hasKV);
                }

                // 6. 前台节点与订阅页面 (/ - 需 PASSWORD 密码验证)
                if (url.pathname === '/') {
                    return getNodesPage(request, validSSPath, config, hasKV);
                }
                
                // 6. 订阅输出
                if (url.pathname.toLowerCase().includes(`/${config.subPath.toLowerCase()}`)) {
                    const currentDomain = url.hostname;
                    const vlsHeader = 'v' + 'l' + 'e' + 's' + 's';
                    const troHeader = 't' + 'r' + 'o' + 'j' + 'a' + 'n';
                    const ssHeader = 's' + 's';
                    
                    // 生成 VLESS 节点
                    const vlsLinks = config.cfip.map(cdnItem => {
                        let host, port = 443, nodeName = '';
                        if (cdnItem.includes('#')) {
                            const parts = cdnItem.split('#');
                            cdnItem = parts[0];
                            nodeName = parts[1];
                        }

                        if (cdnItem.startsWith('[') && cdnItem.includes(']:')) {
                            const ipv6End = cdnItem.indexOf(']:');
                            host = cdnItem.substring(0, ipv6End + 1); 
                            const portStr = cdnItem.substring(ipv6End + 2); 
                            port = parseInt(portStr) || 443;
                        } else if (cdnItem.includes(':')) {
                            const parts = cdnItem.split(':');
                            host = parts[0];
                            port = parseInt(parts[1]) || 443;
                        } else {
                            host = cdnItem;
                        }
                        
                        const vlsNodeName = nodeName ? `${nodeName}-${vlsHeader}` : `Workers-${vlsHeader}`;
                        return `${vlsHeader}://${config.yourUUID}@${host}:${port}?encryption=none&security=tls&sni=${currentDomain}&fp=firefox&allowInsecure=0&type=ws&host=${currentDomain}&path=%2F%3Fed%3D2560#${vlsNodeName}`;
                    });
                    
                    // 生成 Trojan 节点
                    let troLinks = [];
                    if (!config.disabletro) {
                        troLinks = config.cfip.map(cdnItem => {
                            let host, port = 443, nodeName = '';
                            if (cdnItem.includes('#')) {
                                const parts = cdnItem.split('#');
                                cdnItem = parts[0];
                                nodeName = parts[1];
                            }

                            if (cdnItem.startsWith('[') && cdnItem.includes(']:')) {
                                const ipv6End = cdnItem.indexOf(']:');
                                host = cdnItem.substring(0, ipv6End + 1); 
                                const portStr = cdnItem.substring(ipv6End + 2); 
                                port = parseInt(portStr) || 443;
                            } else if (cdnItem.includes(':')) {
                                const parts = cdnItem.split(':');
                                host = parts[0];
                                port = parseInt(parts[1]) || 443;
                            } else {
                                host = cdnItem;
                            }
                            
                            const troNodeName = nodeName ? `${nodeName}-${troHeader}` : `Workers-${troHeader}`;
                            return `${troHeader}://${config.yourUUID}@${host}:${port}?security=tls&sni=${currentDomain}&fp=firefox&allowInsecure=0&type=ws&host=${currentDomain}&path=%2F%3Fed%3D2560#${troNodeName}`;
                        });
                    }

                    // 生成 Shadowsocks 节点
                    let ssLinks = [];
                    if (!config.disabless) {
                        const method = 'none';
                        const ssConfig = `${method}:${config.yourUUID}`;
                        const encodedConfig = btoa(ssConfig);
                        ssLinks = config.cfip.map(cdnItem => {
                            let host, port = 443, nodeName = '';
                            if (cdnItem.includes('#')) {
                                const parts = cdnItem.split('#');
                                cdnItem = parts[0];
                                nodeName = parts[1];
                            }

                            if (cdnItem.startsWith('[') && cdnItem.includes(']:')) {
                                const ipv6End = cdnItem.indexOf(']:');
                                host = cdnItem.substring(0, ipv6End + 1); 
                                const portStr = cdnItem.substring(ipv6End + 2); 
                                port = parseInt(portStr) || 443;
                            } else if (cdnItem.includes(':')) {
                                const parts = cdnItem.split(':');
                                host = parts[0];
                                port = parseInt(parts[1]) || 443;
                            } else {
                                host = cdnItem;
                            }
                            
                            const ssNodeName = nodeName ? `${nodeName}-${ssHeader}` : `Workers-${ssHeader}`;
                            return `${ssHeader}://${encodedConfig}@${host}:${port}?plugin=v2ray-plugin;mode%3Dwebsocket;host%3D${currentDomain};path%3D${validSSPath}/?ed%3D2560;tls;sni%3D${currentDomain};skip-cert-verify%3Dtrue;mux%3D0#${ssNodeName}`;
                        });
                    }

                    let allLinks = [...vlsLinks, ...troLinks, ...ssLinks];
                    const filterType = url.searchParams.get('type') ? url.searchParams.get('type').toLowerCase() : '';
                    if (filterType === 'ss' || filterType === 'shadowsocks') {
                        allLinks = ssLinks;
                    } else if (filterType === 'vless') {
                        allLinks = vlsLinks;
                    } else if (filterType === 'trojan') {
                        allLinks = troLinks;
                    }

                    const linksText = allLinks.join('\n');
                    const base64Content = btoa(unescape(encodeURIComponent(linksText)));
                    return new Response(base64Content, {
                        headers: { 
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        },
                    });
                }
            }
            return new Response('Not Found', { status: 404 });
        } catch (err) {
            return new Response('Internal Server Error: ' + err.message, { status: 500 });
        }
    },
};

/**
 * 
 * @param {import("@cloudflare/workers-types").Request} request
 * @param {string} customProxyIP
 * @param {string} validSSPath
 */
async function handleVlsRequest(request, customProxyIP, validSSPath) {
    const wssPair = new WebSocketPair();
    const clientSock = wssPair[0];
    const serverSock = wssPair[1];
    serverSock.accept();
    serverSock.binaryType = 'arraybuffer';
    let remoteConnWrapper = { socket: null };
    let isDnsQuery = false;
    let isTrojan = false;
    const earlyData = request.headers.get('sec-websocket-protocol') || '';
    const readable = makeReadableStr(serverSock, earlyData);

    const url = new URL(request.url);
    const pathname = url.pathname;
    const isSSPath = validSSPath && pathname.toLowerCase().startsWith(validSSPath.toLowerCase());

    readable.pipeTo(new WritableStream({
        async write(chunk) {
            if (isDnsQuery) return await forwardataudp(chunk, serverSock, null);
            if (remoteConnWrapper.socket) {
                const writer = remoteConnWrapper.socket.writable.getWriter();
                await writer.write(chunk);
                writer.releaseLock();
                return;
            }
            
            // 1. 尝试 Trojan 协议解析
            if (!disabletro) {
                const trojanResult = await parsetroHeader(chunk, yourUUID);
                if (!trojanResult.hasError) {
                    isTrojan = true;
                    const { addressType, port, hostname, rawClientData } = trojanResult;
                    
                    if (isSpeedTestSite(hostname)) {
                        throw new Error('Speedtest site is blocked');
                    }
                    
                    await forwardataTCP(hostname, port, rawClientData, serverSock, null, remoteConnWrapper, customProxyIP);
                    return;
                }
            }
            
            // 2. 尝试 VLESS 协议解析
            const vlsResult = parseVLsPacketHeader(chunk, yourUUID);
            if (!vlsResult.hasError) {
                const { addressType, port, hostname, rawIndex, version, isUDP } = vlsResult;

                if (isSpeedTestSite(hostname)) {
                    throw new Error('Speedtest site is blocked');
                }

                if (isUDP) {
                    if (port === 53) isDnsQuery = true;
                    else throw new Error('UDP is not supported');
                }
                const respHeader = new Uint8Array([version[0], 0]);
                const rawData = chunk.slice(rawIndex);
                if (isDnsQuery) return forwardataudp(rawData, serverSock, respHeader);
                await forwardataTCP(hostname, port, rawData, serverSock, respHeader, remoteConnWrapper, customProxyIP);
                return;
            }

            // 3. 尝试 Shadowsocks 协议解析
            if (!disabless && isSSPath) {
                const ssResult = parseSSPacketHeader(chunk);
                if (!ssResult.hasError) {
                    const { addressType, port, hostname, rawIndex } = ssResult;

                    if (isSpeedTestSite(hostname)) {
                        throw new Error('Speedtest site is blocked');
                    }

                    if (addressType === 2) { 
                        if (port === 53) isDnsQuery = true;
                        else throw new Error('UDP is not supported');
                    }
                    const rawData = chunk.slice(rawIndex);
                    if (isDnsQuery) return forwardataudp(rawData, serverSock, null);
                    await forwardataTCP(hostname, port, rawData, serverSock, null, remoteConnWrapper, customProxyIP);
                    return;
                }
            }

            throw new Error(vlsResult.message || 'Protocol parse error');
        },
    })).catch((err) => {
        // console.error('Readable pipe error:', err);
    });

    return new Response(null, { status: 101, webSocket: clientSock });
}

async function parsetroHeader(buffer, passwordPlainText) {
  const sha224Password = await sha224(passwordPlainText);
  
  if (buffer.byteLength < 56) {
    return { hasError: true, message: "invalid data" };
  }
  let crLfIndex = 56;
  if (new Uint8Array(buffer.slice(56, 57))[0] !== 0x0d || new Uint8Array(buffer.slice(57, 58))[0] !== 0x0a) {
    return { hasError: true, message: "invalid header format" };
  }
  const password = new TextDecoder().decode(buffer.slice(0, crLfIndex));
  if (password !== sha224Password) {
    return { hasError: true, message: "invalid password" };
  }

  const socks5DataBuffer = buffer.slice(crLfIndex + 2);
  if (socks5DataBuffer.byteLength < 6) {
    return { hasError: true, message: "invalid S5 request data" };
  }

  const view = new DataView(socks5DataBuffer);
  const cmd = view.getUint8(0);
  if (cmd !== 1) {
    return { hasError: true, message: "unsupported command, only TCP is allowed" };
  }

  const atype = view.getUint8(1);
  let addressLength = 0;
  let addressIndex = 2;
  let address = "";
  switch (atype) {
    case 1: // IPv4
      addressLength = 4;
      address = new Uint8Array(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength)).join(".");
      break;
    case 3: // Domain
      addressLength = new Uint8Array(socks5DataBuffer.slice(addressIndex, addressIndex + 1))[0];
      addressIndex += 1;
      address = new TextDecoder().decode(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength));
      break;
    case 4: // IPv6
      addressLength = 16;
      const dataView = new DataView(socks5DataBuffer.slice(addressIndex, addressIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      address = ipv6.join(":");
      break;
    default:
      return { hasError: true, message: `invalid addressType is ${atype}` };
  }

  if (!address) {
    return { hasError: true, message: `address is empty, addressType is ${atype}` };
  }

  const portIndex = addressIndex + addressLength;
  const portBuffer = socks5DataBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  return {
    hasError: false,
    addressType: atype,
    port: portRemote,
    hostname: address,
    rawClientData: socks5DataBuffer.slice(portIndex + 4)
  };
}

async function connect2Socks5(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port, username, password } = proxyConfig;
    const socket = connect({ hostname: host, port: port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    
    try {
        const authMethods = username && password ? 
            new Uint8Array([0x05, 0x02, 0x00, 0x02]) :
            new Uint8Array([0x05, 0x01, 0x00]); 
        
        await writer.write(authMethods);
        const methodResponse = await reader.read();
        if (methodResponse.done || methodResponse.value.byteLength < 2) {
            throw new Error('S5 method selection failed');
        }
        
        const selectedMethod = new Uint8Array(methodResponse.value)[1];
        if (selectedMethod === 0x02) {
            if (!username || !password) {
                throw new Error('S5 requires authentication');
            }
            const userBytes = new TextEncoder().encode(username);
            const passBytes = new TextEncoder().encode(password);
            const authPacket = new Uint8Array(3 + userBytes.length + passBytes.length);
            authPacket[0] = 0x01; 
            authPacket[1] = userBytes.length;
            authPacket.set(userBytes, 2);
            authPacket[2 + userBytes.length] = passBytes.length;
            authPacket.set(passBytes, 3 + userBytes.length);
            await writer.write(authPacket);
            const authResponse = await reader.read();
            if (authResponse.done || new Uint8Array(authResponse.value)[1] !== 0x00) {
                throw new Error('S5 authentication failed');
            }
        } else if (selectedMethod !== 0x00) {
            throw new Error(`S5 unsupported auth method: ${selectedMethod}`);
        }
        
        const hostBytes = new TextEncoder().encode(targetHost);
        const connectPacket = new Uint8Array(7 + hostBytes.length);
        connectPacket[0] = 0x05;
        connectPacket[1] = 0x01;
        connectPacket[2] = 0x00; 
        connectPacket[3] = 0x03; 
        connectPacket[4] = hostBytes.length;
        connectPacket.set(hostBytes, 5);
        new DataView(connectPacket.buffer).setUint16(5 + hostBytes.length, targetPort, false);
        await writer.write(connectPacket);
        const connectResponse = await reader.read();
        if (connectResponse.done || new Uint8Array(connectResponse.value)[1] !== 0x00) {
            throw new Error('S5 connection failed');
        }
        
        await writer.write(initialData);
        writer.releaseLock();
        reader.releaseLock();
        return socket;
    } catch (error) {
        writer.releaseLock();
        reader.releaseLock();
        throw error;
    }
}

async function connect2Http(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port, username, password } = proxyConfig;
    const socket = connect({ hostname: host, port: port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    try {
        let connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`;
        connectRequest += `Host: ${targetHost}:${targetPort}\r\n`;
        
        if (username && password) {
            const auth = btoa(`${username}:${password}`);
            connectRequest += `Proxy-Authorization: Basic ${auth}\r\n`;
        }
        
        connectRequest += `User-Agent: Mozilla/5.0\r\n`;
        connectRequest += `Connection: keep-alive\r\n`;
        connectRequest += '\r\n';
        await writer.write(new TextEncoder().encode(connectRequest));
        let responseBuffer = new Uint8Array(0);
        let headerEndIndex = -1;
        let bytesRead = 0;
        const maxHeaderSize = 8192;
        
        while (headerEndIndex === -1 && bytesRead < maxHeaderSize) {
            const { done, value } = await reader.read();
            if (done) {
                throw new Error('Connection closed before receiving HTTP response');
            }
            const newBuffer = new Uint8Array(responseBuffer.length + value.length);
            newBuffer.set(responseBuffer);
            newBuffer.set(value, responseBuffer.length);
            responseBuffer = newBuffer;
            bytesRead = responseBuffer.length;
            
            for (let i = 0; i < responseBuffer.length - 3; i++) {
                if (responseBuffer[i] === 0x0d && responseBuffer[i + 1] === 0x0a &&
                    responseBuffer[i + 2] === 0x0d && responseBuffer[i + 3] === 0x0a) {
                    headerEndIndex = i + 4;
                    break;
                }
            }
        }
        
        if (headerEndIndex === -1) {
            throw new Error('Invalid HTTP response');
        }
        
        const headerText = new TextDecoder().decode(responseBuffer.slice(0, headerEndIndex));
        const statusLine = headerText.split('\r\n')[0];
        const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
        
        if (!statusMatch) {
            throw new Error(`Invalid response: ${statusLine}`);
        }
        
        const statusCode = parseInt(statusMatch[1]);
        if (statusCode < 200 || statusCode >= 300) {
            throw new Error(`Connection failed: ${statusLine}`);
        }
        
        console.log('HTTP connection established for Trojan');
        
        await writer.write(initialData);
        writer.releaseLock();
        reader.releaseLock();
        
        return socket;
    } catch (error) {
        try { 
            writer.releaseLock(); 
        } catch (e) {}
        try { 
            reader.releaseLock(); 
        } catch (e) {}
        try { 
            socket.close(); 
        } catch (e) {}
        throw error;
    }
}

async function forwardataTCP(host, portNum, rawData, ws, respHeader, remoteConnWrapper, customProxyIP) {
    async function connectDirect(address, port, data) {
        const remoteSock = connect({ hostname: address, port: port });
        const writer = remoteSock.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
        return remoteSock;
    }
    
    let proxyConfig = null;
    let shouldUseProxy = false;
    if (customProxyIP) {
        proxyConfig = parsePryAddress(customProxyIP);
        if (proxyConfig && (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https')) {
            shouldUseProxy = true;
        } else if (!proxyConfig) {
            proxyConfig = parsePryAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        }
    } else {
        proxyConfig = parsePryAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        if (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https') {
            shouldUseProxy = true;
        }
    }
    
    async function connecttoPry() {
        let newSocket;
        if (proxyConfig.type === 'socks5') {
            newSocket = await connect2Socks5(proxyConfig, host, portNum, rawData);
        } else if (proxyConfig.type === 'http' || proxyConfig.type === 'https') {
            newSocket = await connect2Http(proxyConfig, host, portNum, rawData);
        } else {
            newSocket = await connectDirect(proxyConfig.host, proxyConfig.port, rawData);
        }
        
        remoteConnWrapper.socket = newSocket;
        newSocket.closed.catch(() => {}).finally(() => closeSocketQuietly(ws));
        connectStreams(newSocket, ws, respHeader, null);
    }
    
    if (shouldUseProxy) {
        try {
            await connecttoPry();
        } catch (err) {
            throw err;
        }
    } else {
        try {
            const initialSocket = await connectDirect(host, portNum, rawData);
            remoteConnWrapper.socket = initialSocket;
            connectStreams(initialSocket, ws, respHeader, connecttoPry);
        } catch (err) {
            await connecttoPry();
        }
    }
}

function parseVLsPacketHeader(chunk, token) {
    if (chunk.byteLength < 24) return { hasError: true, message: 'Invalid data' };
    const version = new Uint8Array(chunk.slice(0, 1));
    if (formatIdentifier(new Uint8Array(chunk.slice(1, 17))) !== token) return { hasError: true, message: 'Invalid uuid' };
    const optLen = new Uint8Array(chunk.slice(17, 18))[0];
    const cmd = new Uint8Array(chunk.slice(18 + optLen, 19 + optLen))[0];
    let isUDP = false;
    if (cmd === 1) {} else if (cmd === 2) { isUDP = true; } else { return { hasError: true, message: 'Invalid command' }; }
    const portIdx = 19 + optLen;
    const port = new DataView(chunk.slice(portIdx, portIdx + 2)).getUint16(0);
    let addrIdx = portIdx + 2, addrLen = 0, addrValIdx = addrIdx + 1, hostname = '';
    const addressType = new Uint8Array(chunk.slice(addrIdx, addrValIdx))[0];
    switch (addressType) {
        case 1: 
            addrLen = 4; 
            hostname = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + addrLen)).join('.'); 
            break;
        case 2: 
            addrLen = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + 1))[0]; 
            addrValIdx += 1; 
            hostname = new TextDecoder().decode(chunk.slice(addrValIdx, addrValIdx + addrLen)); 
            break;
        case 3: 
            addrLen = 16; 
            const ipv6 = []; 
            const ipv6View = new DataView(chunk.slice(addrValIdx, addrValIdx + addrLen)); 
            for (let i = 0; i < 8; i++) ipv6.push(ipv6View.getUint16(i * 2).toString(16)); 
            hostname = ipv6.join(':'); 
            break;
        default: 
            return { hasError: true, message: `Invalid address type: ${addressType}` };
    }
    if (!hostname) return { hasError: true, message: `Invalid address: ${addressType}` };
    return { hasError: false, addressType, port, hostname, isUDP, rawIndex: addrValIdx + addrLen, version };
}

function parseSSPacketHeader(chunk) {
    if (chunk.byteLength < 7) return { hasError: true, message: 'Invalid data' };
    try {
        const view = new Uint8Array(chunk);
        const addressType = view[0];
        let addrIdx = 1, addrLen = 0, addrValIdx = addrIdx, hostname = '';
        switch (addressType) {
            case 1: // IPv4
                addrLen = 4; 
                hostname = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + addrLen)).join('.'); 
                addrValIdx += addrLen;
                break;
            case 3: // Domain
                addrLen = view[addrIdx];
                addrValIdx += 1; 
                hostname = new TextDecoder().decode(chunk.slice(addrValIdx, addrValIdx + addrLen)); 
                addrValIdx += addrLen;
                break;
            case 4: // IPv6
                addrLen = 16; 
                const ipv6 = []; 
                const ipv6View = new DataView(chunk.slice(addrValIdx, addrValIdx + addrLen)); 
                for (let i = 0; i < 8; i++) ipv6.push(ipv6View.getUint16(i * 2).toString(16)); 
                hostname = ipv6.join(':'); 
                addrValIdx += addrLen;
                break;
            default: 
                return { hasError: true, message: `Invalid address type: ${addressType}` };
        }
        if (!hostname) return { hasError: true, message: `Invalid address: ${addressType}` };
        const port = new DataView(chunk.slice(addrValIdx, addrValIdx + 2)).getUint16(0);
        return { hasError: false, addressType, port, hostname, rawIndex: addrValIdx + 2 };
    } catch (e) {
        return { hasError: true, message: 'Failed to parse SS packet header' };
    }
}

function makeReadableStr(socket, earlyDataHeader) {
    let cancelled = false;
    return new ReadableStream({
        start(controller) {
            socket.addEventListener('message', async (event) => {
                if (cancelled) return;
                let data = event.data;
                if (data instanceof Blob) {
                    data = await data.arrayBuffer();
                }
                controller.enqueue(data);
            });
            socket.addEventListener('close', () => { 
                if (!cancelled) { 
                    closeSocketQuietly(socket); 
                    controller.close(); 
                } 
            });
            socket.addEventListener('error', (err) => controller.error(err));
            const { earlyData, error } = base64ToArray(earlyDataHeader);
            if (error) {
                Promise.resolve().then(() => controller.error(error));
            } else if (earlyData) {
                Promise.resolve().then(() => {
                    if (!cancelled) controller.enqueue(earlyData);
                });
            }
        },
        cancel() { 
            cancelled = true; 
            closeSocketQuietly(socket); 
        }
    });
}

async function connectStreams(remoteSocket, webSocket, headerData, retryFunc) {
    let header = headerData, hasData = false;
    await remoteSocket.readable.pipeTo(
        new WritableStream({
            async write(chunk) {
                hasData = true;
                if (webSocket.readyState !== WS_READY_STATE_OPEN) {
                    throw new Error('ws.readyState is not open');
                }
                if (header) { 
                    const response = new Uint8Array(header.length + chunk.byteLength);
                    response.set(header, 0);
                    response.set(chunk, header.length);
                    webSocket.send(response.buffer); 
                    header = null; 
                } else { 
                    webSocket.send(chunk); 
                }
            },
            abort() {},
        })
    ).catch((err) => { 
        closeSocketQuietly(webSocket); 
    });
    if (!hasData && retryFunc) {
        await retryFunc();
    }
}

async function forwardataudp(udpChunk, webSocket, respHeader) {
    try {
        const tcpSocket = connect({ hostname: '8.8.4.4', port: 53 });
        let vlessHeader = respHeader;
        const writer = tcpSocket.writable.getWriter();
        await writer.write(udpChunk);
        writer.releaseLock();
        await tcpSocket.readable.pipeTo(new WritableStream({
            async write(chunk) {
                if (webSocket.readyState === WS_READY_STATE_OPEN) {
                    if (vlessHeader) { 
                        const response = new Uint8Array(vlessHeader.length + chunk.byteLength);
                        response.set(vlessHeader, 0);
                        response.set(chunk, vlessHeader.length);
                        webSocket.send(response.buffer);
                        vlessHeader = null; 
                    } else { 
                        webSocket.send(chunk); 
                    }
                }
            },
        }));
    } catch (error) {
        // console.error('UDP forward error:', error);
    }
}

/**
 * @param {import("@cloudflare/workers-types").Request} request
 * @param {string} validSSPath
 * @param {object} config
 * @param {boolean} hasKV
 * @returns {Response}
 */
/**
 * 前台节点与订阅页面入口 (/)
 * @param {import("@cloudflare/workers-types").Request} request
 * @param {string} validSSPath
 * @param {object} config
 * @param {boolean} hasKV
 * @returns {Response}
 */
function getNodesPage(request, validSSPath, config, hasKV) {
	const url = request.headers.get('Host');
	const baseUrl = `https://${url}`;
	const urlObj = new URL(request.url);
	const providedPassword = urlObj.searchParams.get('password');
	if (providedPassword) {
		if (providedPassword === config.password) {
			return getNodesPageContent(url, baseUrl, validSSPath, config, hasKV);
		} else {
			return getLoginPage(url, baseUrl, true, false);
		}
	}
	return getLoginPage(url, baseUrl, false, false);
}

/**
 * 后台管理面板页面入口 (/admin)
 * @param {import("@cloudflare/workers-types").Request} request
 * @param {string} validSSPath
 * @param {object} config
 * @param {boolean} hasKV
 * @returns {Response}
 */
function getAdminPage(request, validSSPath, config, hasKV) {
	const url = request.headers.get('Host');
	const baseUrl = `https://${url}`;
	const urlObj = new URL(request.url);
	const providedPassword = urlObj.searchParams.get('password');
	if (providedPassword) {
		if (providedPassword === config.adminPassword) {
			return getAdminPageContent(url, baseUrl, validSSPath, config, hasKV);
		} else {
			return getLoginPage(url, baseUrl, true, true);
		}
	}
	return getLoginPage(url, baseUrl, false, true);
}

/**
 * 获取登录页面
 * @param {string} url 
 * @param {string} baseUrl 
 * @param {boolean} showError 
 * @param {boolean} isAdmin
 * @returns {Response}
 */
function getLoginPage(url, baseUrl, showError = false, isAdmin = false) {
    const title = isAdmin ? 'Workers Service - 后台管理登录' : 'Workers Service - 节点与订阅登录';
    const subtitle = isAdmin ? '请输入后台管理密码 (ADMIN) 以访问管理控制台' : '请输入访问密码 (PASSWORD) 查看节点与订阅';

	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: ${isAdmin ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)' : 'linear-gradient(135deg, #7dd3ca 0%, #a17ec4 100%)'};
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }
        
        .login-container {
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
            max-width: 420px;
            width: 95%;
            text-align: center;
        }
        
        .logo {
            margin-bottom: -15px;
        }
        
        .title {
            font-size: 1.7rem;
            margin-bottom: 8px;
            color: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .badge-admin {
            display: inline-block;
            background: #4f46e5;
            color: white;
            font-size: 0.72rem;
            padding: 2px 8px;
            border-radius: 6px;
            vertical-align: middle;
        }
        
        .subtitle {
            color: #64748b;
            margin-bottom: 26px;
            font-size: 0.92rem;
            line-height: 1.4;
        }
        
        .form-group {
            margin-bottom: 20px;
            text-align: left;
        }
        
        .form-input {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s ease;
            background: #fff;
        }
        
        .form-input:focus {
            outline: none;
            border-color: ${isAdmin ? '#4f46e5' : '#12cd9e'};
            box-shadow: 0 0 0 3px ${isAdmin ? 'rgba(79, 70, 229, 0.15)' : 'rgba(18, 205, 158, 0.15)'};
        }
        
        .btn-login {
            width: 100%;
            padding: 12px 20px;
            background: ${isAdmin ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #12cd9e 0%, #a881d0 100%)'};
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        .btn-login:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.15);
        }
        
        .error-message {
            background: #fed7d7;
            color: #c53030;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #e53e3e;
            font-size: 0.9rem;
        }
        
        .footer {
            margin-top: 22px;
            color: #64748b;
            font-size: 0.85rem;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .footer a {
            color: #4f46e5;
            text-decoration: none;
        }
        
        @media (max-width: 480px) {
            .login-container {
                padding: 30px 20px;
                margin: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo"><img src="https://img.icons8.com/color/96/cloudflare.png" alt="Logo"></div>
        <h1 class="title">
            Workers Service
            ${isAdmin ? '<span class="badge-admin">Admin</span>' : ''}
        </h1>
        <p class="subtitle">${subtitle}</p>
        
        ${showError ? '<div class="error-message"><i class="fas fa-exclamation-circle"></i> 密码错误，请重试</div>' : ''}
        
        <form onsubmit="handleLogin(event)">
            <div class="form-group">
                <input 
                    type="password" 
                    id="password" 
                    name="password" 
                    class="form-input" 
                    placeholder="${isAdmin ? '请输入后台管理密码 (ADMIN)' : '请输入访问密码 (PASSWORD)'}"
                    required
                    autofocus
                >
            </div>
            <button type="submit" class="btn-login"><i class="fas fa-sign-in-alt"></i> 登录</button>
        </form>
        
        <div class="footer">
            ${isAdmin ? 
                `<div><a href="/"><i class="fas fa-arrow-left"></i> 返回前台节点与订阅</a></div>` : 
                `<div><a href="/admin"><i class="fas fa-cog"></i> 访问后台管理面板 (/admin)</a></div>`
            }
            <div>Powered by eooce <a href="https://t.me/eooceu" target="_blank">Join Telegram</a></div>
        </div>
    </div>
    
    <script>
        function handleLogin(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            const currentUrl = new URL(window.location);
            currentUrl.searchParams.set('password', password);
            window.location.href = currentUrl.toString();
        }
    </script>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text/html;charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}

/**
 * 获取前台节点与订阅页面 (访问 / 且输入 PASSWORD 成功后展示)
 * @param {string} url 
 * @param {string} baseUrl 
 * @param {string} validSSPath
 * @param {object} config
 * @param {boolean} hasKV
 * @returns {Response}
 */
function getNodesPageContent(url, baseUrl, validSSPath, config, hasKV) {
    const clashFullUrl = `${config.clashSubUrl || 'https://sublink.alwaysdata.net/clash?config='}${baseUrl}/${config.subPath}`;
    const singboxFullUrl = `${config.singboxSubUrl || 'https://sublink.alwaysdata.net/singbox?config='}${baseUrl}/${config.subPath}`;
    const qxFullConfig = `shadowsocks=mfa.gov.ua:443,method=none,password=${config.yourUUID},obfs=wss,obfs-host=${url},obfs-uri=${validSSPath}/?ed=2560,fast-open=true,udp-relay=true,tag=SS`;

	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workers Service - 节点与订阅</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #66ead7 0%, #9461c8 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
            margin: 0;
            padding: 15px 0;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 24px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);
            max-width: 820px;
            width: 95%;
            max-height: 90vh;
            text-align: center;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        
        .logout-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #a7a0d8;
            color: #b91c1c;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            z-index: 1000;
        }
        
        .logout-btn:hover {
            background: #e2e8f0;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        .logo {
            margin-bottom: -10px;
        }
        
        .title {
            font-size: 1.8rem;
            margin-bottom: 6px;
            color: #2d3748;
        }
        
        .subtitle {
            color: #718096;
            margin-bottom: 16px;
            font-size: 0.95rem;
        }

        .info-card {
            background: #f8fafc;
            border-radius: 12px;
            padding: 16px;
            margin: 10px 0;
            border-left: 4px solid #6ed8c9;
            text-align: left;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
            font-size: 0.9rem;
        }
        
        .info-item:last-child {
            border-bottom: none;
        }
        
        .label {
            font-weight: 600;
            color: #4a5568;
            flex-shrink: 0;
        }
        
        .value {
            color: rgb(20, 23, 29);
            font-family: 'Courier New', monospace;
            background: #edf2f7;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.82rem;
            word-break: break-all;
            margin-left: 12px;
            text-align: right;
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
            margin: 16px 0;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.3s ease;
        }
        
        .btn-secondary {
            background: linear-gradient(45deg, #68e3d6, #906cc9);
            color: #001379;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
        }
        
        .status {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #48bb78;
            margin-right: 6px;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .footer {
            margin-top: 15px;
            color: #718096;
            font-size: 0.9rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        
        .footer-links {
            display: flex;
            align-items: center;
            gap: 15px;
            flex-wrap: wrap;
            justify-content: center;
        }
        
        .footer-link {
            color: #667eea;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
            transition: all 0.3s ease;
            padding: 4px 8px;
            border-radius: 6px;
        }
        
        .footer-link:hover {
            background: rgba(102, 126, 234, 0.1);
            transform: translateY(-1px);
        }

        .admin-link {
            color: #4f46e5;
            background: #eef2ff;
            border: 1px solid #c7d2fe;
            padding: 6px 14px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.85rem;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-top: 6px;
            transition: all 0.2s ease;
        }

        .admin-link:hover {
            background: #e0e7ff;
            transform: translateY(-1px);
        }
        
        .github-icon {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }
        
        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ffffff;
            border-left: 4px solid #10b981;
            border-radius: 8px;
            padding: 12px 18px;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 1100;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            max-width: 320px;
        }
        
        .toast.show {
            opacity: 1;
            transform: translateX(0);
        }
        
        .toast-icon {
            width: 22px;
            height: 22px;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: bold;
            flex-shrink: 0;
        }
        
        .toast-message {
            color: #1e293b;
            font-size: 14px;
            font-weight: 500;
            text-align: left;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 16px;
                margin: 8px;
                max-height: 94vh;
            }
            
            .info-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
            }
            
            .value {
                margin-left: 0;
                text-align: left;
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <button onclick="logout()" class="logout-btn">
        <i class="fas fa-sign-out-alt"></i>
        <span>退出</span>
    </button>
    
    <div class="container">
        <div class="logo"><img src="https://img.icons8.com/color/96/cloudflare.png" alt="Logo"></div>
        <h1 class="title">Workers Service</h1>
        <p class="subtitle">基于 Cloudflare Workers 的高性能网络服务 (VLESS + Trojan + Shadowsocks)</p>

        <div class="info-card">
            <div class="info-item">
                <span class="label">服务状态</span>
                <span class="value"><span class="status"></span>运行中</span>
            </div>
            <div class="info-item">
                <span class="label">主机地址</span>
                <span class="value">${url}</span>
            </div>
            <div class="info-item">
                <span class="label">UUID</span>
                <span class="value">${config.yourUUID}</span>
            </div>
            <div class="info-item">
                <span class="label">SS 节点路径</span>
                <span class="value">${validSSPath}/?ed=2560</span>
            </div>
            <div class="info-item">
                <span class="label">全协议订阅地址</span>
                <span class="value">${baseUrl}/${config.subPath}</span>
            </div>
            <div class="info-item">
                <span class="label">Clash 订阅地址</span>
                <span class="value">${clashFullUrl}</span>
            </div>
            <div class="info-item">
                <span class="label">Sing-box 订阅地址</span>
                <span class="value">${singboxFullUrl}</span>
            </div>
        </div>
        
        <div class="button-group">
            <button onclick="copySingboxSubscription()" class="btn btn-secondary">
                <i class="fas fa-cube"></i> 复制 Sing-box 订阅
            </button>
            <button onclick="copyClashSubscription()" class="btn btn-secondary">
                <i class="fas fa-cat"></i> 复制 Clash 订阅
            </button>
            <button onclick="copySubscription()" class="btn btn-secondary">
                <i class="fas fa-link"></i> 复制全部节点订阅
            </button>
            <button onclick="copyQXConfig()" class="btn btn-secondary">
                <i class="fas fa-paper-plane"></i> 复制 Quantumult X 配置
            </button>
        </div>
        
        <div class="footer">
            <div>
                <a href="/admin" class="admin-link">
                    <i class="fas fa-user-shield"></i> 进入后台管理面板 (/admin)
                </a>
            </div>
            <div class="footer-links">
                <a href="https://github.com/zaofengyue/CF-Workers-VLESS/tree/main" target="_blank" class="footer-link">
                    <svg class="github-icon" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.479-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span>GitHub 项目</span>
                </a>
                <a href="https://proxy.fengyue.bond" target="_blank" class="footer-link">
                    <span>✅</span>
                    <span>Proxyip 检测服务</span>
                </a>
                <a href="https://socks.fengyue.bond" target="_blank" class="footer-link">
                    <span>🧦</span>
                    <span>socks5 检测服务</span>
                </a>
            </div>
        </div>
    </div>
    
    <script>
        function showToast(message) {
            const existingToast = document.querySelector('.toast');
            if (existingToast) existingToast.remove();
            
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = '<div class="toast-icon">✓</div><div class="toast-message">' + message + '</div>';
            document.body.appendChild(toast);
            
            setTimeout(() => { toast.classList.add('show'); }, 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
            }, 1800);
        }

        function copySubscription() {
            const configUrl = '${baseUrl}/${config.subPath}';
            copyText(configUrl, '全协议订阅链接已复制到剪贴板!');
        }
        
        function copyClashSubscription() {
            const clashUrl = '${clashFullUrl}';
            copyText(clashUrl, 'Clash 订阅链接已复制到剪贴板!');
        }
        
        function copySingboxSubscription() {
            const singboxUrl = '${singboxFullUrl}';
            copyText(singboxUrl, 'Sing-box 订阅链接已复制到剪贴板!');
        }
        
        function copyQXConfig() {
            const qx = '${qxFullConfig}';
            copyText(qx, 'Quantumult X 配置已复制!');
        }

        function copyText(text, msg) {
            navigator.clipboard.writeText(text).then(() => {
                showToast(msg);
            }).catch(() => {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast(msg);
            });
        }
        
        function logout() {
            if (confirm('确定要退出登录吗?')) {
                const currentUrl = new URL(window.location);
                currentUrl.searchParams.delete('password');
                window.location.href = currentUrl.toString();
            }
        }
    </script>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text/html;charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}

/**
 * 获取后台管理面板页面 (访问 /admin 且输入 ADMIN 密码成功后展示)
 * @param {string} url 
 * @param {string} baseUrl 
 * @param {string} validSSPath
 * @param {object} config
 * @param {boolean} hasKV
 * @returns {Response}
 */
function getAdminPageContent(url, baseUrl, validSSPath, config, hasKV) {
    const clashFullUrl = `${config.clashSubUrl || 'https://sublink.alwaysdata.net/clash?config='}${baseUrl}/${config.subPath}`;
    const singboxFullUrl = `${config.singboxSubUrl || 'https://sublink.alwaysdata.net/singbox?config='}${baseUrl}/${config.subPath}`;
    const qxFullConfig = `shadowsocks=mfa.gov.ua:443,method=none,password=${config.yourUUID},obfs=wss,obfs-host=${url},obfs-uri=${validSSPath}/?ed=2560,fast-open=true,udp-relay=true,tag=SS`;

	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workers Service - 后台管理控制台</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #1e293b;
            margin: 0;
            padding: 15px 0;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 24px;
            box-shadow: 0 20px 45px rgba(0, 0, 0, 0.3);
            max-width: 860px;
            width: 95%;
            max-height: 92vh;
            text-align: center;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        
        .logout-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fee2e2;
            color: #b91c1c;
            border: 1px solid #fca5a5;
            border-radius: 8px;
            padding: 8px 16px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            z-index: 1000;
        }
        
        .logout-btn:hover {
            background: #fecaca;
            transform: translateY(-1px);
        }
        
        .logo {
            margin-bottom: -10px;
        }
        
        .title {
            font-size: 1.8rem;
            margin-bottom: 6px;
            color: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .badge-admin {
            background: #4f46e5;
            color: white;
            font-size: 0.75rem;
            padding: 3px 10px;
            border-radius: 6px;
            font-weight: 600;
        }
        
        .subtitle {
            color: #64748b;
            margin-bottom: 16px;
            font-size: 0.95rem;
        }

        /* 标签页切换导航 */
        .nav-tabs {
            display: flex;
            gap: 12px;
            justify-content: center;
            margin-bottom: 16px;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 10px;
        }

        .nav-tab {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            font-size: 0.95rem;
            font-weight: 600;
            color: #64748b;
            padding: 9px 20px;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.25s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }

        .nav-tab:hover {
            background: #e2e8f0;
            color: #334155;
        }

        .nav-tab.active {
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            color: white;
            border-color: transparent;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
        }

        .tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
        }

        .tab-content.active {
            display: block;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* KV 状态条 */
        .badge-kv {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 12px 16px;
            border-radius: 10px;
            font-size: 0.85rem;
            margin-bottom: 18px;
            text-align: left;
            line-height: 1.5;
        }

        .badge-kv.connected {
            background: #ecfdf5;
            color: #065f46;
            border: 1px solid #6ee7b7;
        }

        .badge-kv.disconnected {
            background: #fffbeb;
            color: #92400e;
            border: 1px solid #fcd34d;
        }

        .badge-kv i {
            font-size: 1.1rem;
            margin-top: 2px;
        }

        .config-card {
            background: #f8fafc;
            border-radius: 12px;
            padding: 18px;
            margin-bottom: 16px;
            text-align: left;
            border: 1px solid #e2e8f0;
        }

        .config-card h3 {
            font-size: 1.05rem;
            color: #1e293b;
            margin-bottom: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px dashed #cbd5e1;
            padding-bottom: 8px;
        }

        .form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 14px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            margin-bottom: 12px;
        }

        .form-group label {
            font-weight: 600;
            font-size: 0.85rem;
            color: #334155;
            margin-bottom: 6px;
        }

        .form-input, .form-textarea {
            width: 100%;
            padding: 9px 12px;
            border: 1.5px solid #cbd5e1;
            border-radius: 8px;
            font-size: 0.9rem;
            background: white;
            color: #1e293b;
            transition: all 0.2s ease;
        }

        .form-input:focus, .form-textarea:focus {
            outline: none;
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }

        .form-textarea {
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            line-height: 1.5;
            resize: vertical;
        }

        .form-hint {
            font-size: 0.75rem;
            color: #64748b;
            margin-top: 4px;
        }

        .switch-group {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e2e8f0;
        }

        .switch-group:last-child {
            border-bottom: none;
        }

        .switch-info {
            display: flex;
            flex-direction: column;
        }

        .switch-title {
            font-size: 0.9rem;
            font-weight: 600;
            color: #1e293b;
        }

        .switch-desc {
            font-size: 0.75rem;
            color: #64748b;
        }

        .switch {
            position: relative;
            display: inline-block;
            width: 46px;
            height: 24px;
            flex-shrink: 0;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #cbd5e1;
            transition: .3s;
            border-radius: 24px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .3s;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        input:checked + .slider {
            background-color: #10b981;
        }

        input:checked + .slider:before {
            transform: translateX(22px);
        }

        .button-group {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
            margin: 16px 0;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.3s ease;
        }
        
        .btn-primary {
            background: linear-gradient(45deg, #4f46e5, #7c3aed);
            color: white;
        }
        
        .btn-secondary {
            background: #e2e8f0;
            color: #1e293b;
        }

        .btn-danger {
            background: linear-gradient(45deg, #ef4444, #dc2626);
            color: white;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
        }

        .info-card {
            background: #f8fafc;
            border-radius: 12px;
            padding: 16px;
            margin: 10px 0;
            border-left: 4px solid #6366f1;
            text-align: left;
        }
        
        .info-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
            font-size: 0.9rem;
        }
        
        .info-item:last-child {
            border-bottom: none;
        }
        
        .label {
            font-weight: 600;
            color: #4a5568;
            flex-shrink: 0;
        }
        
        .value {
            color: rgb(20, 23, 29);
            font-family: 'Courier New', monospace;
            background: #edf2f7;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.82rem;
            word-break: break-all;
            margin-left: 12px;
            text-align: right;
        }

        .status {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #48bb78;
            margin-right: 6px;
        }
        
        .footer {
            margin-top: 15px;
            color: #718096;
            font-size: 0.9rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        
        .footer-links {
            display: flex;
            align-items: center;
            gap: 15px;
            flex-wrap: wrap;
            justify-content: center;
        }
        
        .footer-link {
            color: #6366f1;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
            transition: all 0.3s ease;
            padding: 4px 8px;
            border-radius: 6px;
        }
        
        .footer-link:hover {
            background: rgba(99, 102, 241, 0.1);
        }

        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ffffff;
            border-left: 4px solid #10b981;
            border-radius: 8px;
            padding: 12px 18px;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 1100;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            max-width: 320px;
        }
        
        .toast.show {
            opacity: 1;
            transform: translateX(0);
        }
        
        .toast-icon {
            width: 22px;
            height: 22px;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: bold;
            flex-shrink: 0;
        }
        
        .toast-message {
            color: #1e293b;
            font-size: 14px;
            font-weight: 500;
            text-align: left;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 16px;
                margin: 8px;
                max-height: 94vh;
            }
            
            .info-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
            }
            
            .value {
                margin-left: 0;
                text-align: left;
                width: 100%;
            }
            
            .form-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <button onclick="logout()" class="logout-btn">
        <i class="fas fa-sign-out-alt"></i>
        <span>退出管理</span>
    </button>
    
    <div class="container">
        <div class="logo"><img src="https://img.icons8.com/color/96/cloudflare.png" alt="Logo"></div>
        <h1 class="title">
            Workers Service
            <span class="badge-admin">Admin 控制台</span>
        </h1>
        <p class="subtitle">Cloudflare Workers 后台管理面板与全局 KV 配置中心</p>

        <!-- 标签页导航 -->
        <div class="nav-tabs">
            <button type="button" class="nav-tab active" id="tab-btn-admin" onclick="switchTab('admin')">
                <i class="fas fa-sliders-h"></i> 后台配置中心
            </button>
            <button type="button" class="nav-tab" id="tab-btn-nodes" onclick="switchTab('nodes')">
                <i class="fas fa-network-wired"></i> 节点与订阅预览
            </button>
        </div>

        <!-- Tab 1: 后台管理配置 -->
        <div id="tab-admin" class="tab-content active">
            ${hasKV ? `
            <div class="badge-kv connected">
                <i class="fas fa-check-circle"></i>
                <div>
                    <b>Cloudflare KV 命名空间已成功连接！</b><br>
                    在此面板修改并保存后，配置将自动持久化保存在 KV 中，所有节点与订阅即时生效，无需重新部署 Worker。
                </div>
            </div>
            ` : `
            <div class="badge-kv disconnected">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <b>未检测到名为 KV 的命名空间绑定！</b> 当前显示的为环境变量或代码默认值。<br>
                    <b>如需在后台持久化保存配置：</b><br>
                    1. 访问 Cloudflare Dashboard &rarr; <b>Workers & Pages</b> &rarr; <b>KV</b> 创建一个命名空间（如 <code>CF_VLESS_KV</code>）；<br>
                    2. 进入该 Worker 的 <b>Settings</b> &rarr; <b>Variables and Secrets</b> &rarr; <b>KV Namespace Bindings</b>；<br>
                    3. 添加变量名称为 <b><code>KV</code></b> 的绑定，目标选择刚创建的命名空间，点击 Deploy 即可。
                </div>
            </div>
            `}

            <!-- 基础设置 -->
            <div class="config-card">
                <h3><i class="fas fa-key"></i> 认证与密码设置</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="cfg-admin-password">后台管理密码 (ADMIN)</label>
                        <input type="text" id="cfg-admin-password" class="form-input" value="${config.adminPassword}" placeholder="后台管理密码">
                        <span class="form-hint">进入此 /admin 后台管理面板的密码</span>
                    </div>
                    <div class="form-group">
                        <label for="cfg-password">前台访问密码 (PASSWORD)</label>
                        <input type="text" id="cfg-password" class="form-input" value="${config.password}" placeholder="前台页面密码">
                        <span class="form-hint">用户访问首页 / 查看节点订阅所用的密码</span>
                    </div>
                    <div class="form-group">
                        <label for="cfg-uuid">用户 UUID</label>
                        <input type="text" id="cfg-uuid" class="form-input" value="${config.yourUUID}" placeholder="客户端连接使用的 UUID">
                        <span class="form-hint">VLESS / Trojan / Shadowsocks 鉴权 UUID</span>
                    </div>
                    <div class="form-group">
                        <label for="cfg-subpath">节点订阅路径 (SUB_PATH)</label>
                        <input type="text" id="cfg-subpath" class="form-input" value="${config.subPath}" placeholder="如 link 或自定义字符串">
                        <span class="form-hint">客户端订阅获取路径 /${config.subPath}</span>
                    </div>
                    <div class="form-group">
                        <label for="cfg-sspath">Shadowsocks 验证路径 (SSPATH)</label>
                        <input type="text" id="cfg-sspath" class="form-input" value="${config.SSpath}" placeholder="留空则默认使用 UUID">
                        <span class="form-hint">SS 节点 WebSocket 路径鉴权，留空使用 UUID</span>
                    </div>
                </div>
            </div>

            <!-- 协议开关 -->
            <div class="config-card">
                <h3><i class="fas fa-toggle-on"></i> 协议启用开关</h3>
                <div class="switch-group">
                    <div class="switch-info">
                        <span class="switch-title">Trojan 协议</span>
                        <span class="switch-desc">是否开启 Trojan 协议节点支持</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="cfg-trojan" ${config.disabletro ? '' : 'checked'}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="switch-group">
                    <div class="switch-info">
                        <span class="switch-title">Shadowsocks 协议</span>
                        <span class="switch-desc">是否开启 Shadowsocks (v2ray-plugin WS) 节点支持</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="cfg-ss" ${config.disabless ? '' : 'checked'}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <!-- ProxyIP 落地出站设置 -->
            <div class="config-card">
                <h3><i class="fas fa-server"></i> 落地代理 ProxyIP 出站设置</h3>
                <div class="form-group">
                    <label for="cfg-proxyip">ProxyIP 服务器地址</label>
                    <input type="text" id="cfg-proxyip" class="form-input" value="${config.proxyIP}" placeholder="例如: proxy.xxxxxxxx.tk:50001">
                    <span class="form-hint">支持：<code>IP:端口</code>、<code>域名:端口</code>、<code>socks5://user:pass@host:port</code> 或 <code>http://user:pass@host:port</code></span>
                </div>
            </div>

            <!-- 优选节点列表 -->
            <div class="config-card">
                <h3><i class="fas fa-bolt"></i> 优选 CDN 域名与 IP 列表 (每行一个)</h3>
                <div class="form-group">
                    <textarea id="cfg-cfip" class="form-textarea" rows="7" placeholder="格式支持:&#10;域名:端口#名称&#10;IP:端口#名称&#10;[IPv6]:端口#名称&#10;域名#名称">${config.cfip.join('\n')}</textarea>
                    <span class="form-hint">格式：<code>优选域名:端口#节点名称</code> 或 <code>优选IP:端口#节点名称</code>，将自动生成在订阅中</span>
                </div>
            </div>

            <!-- 订阅转换后端设置 -->
            <div class="config-card">
                <h3><i class="fas fa-sync-alt"></i> 订阅转换服务后端地址</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="cfg-clash-sub">Clash 订阅转换前缀</label>
                        <input type="text" id="cfg-clash-sub" class="form-input" value="${config.clashSubUrl}">
                        <span class="form-hint">默认: https://sublink.alwaysdata.net/clash?config=</span>
                    </div>
                    <div class="form-group">
                        <label for="cfg-singbox-sub">Sing-box 订阅转换前缀</label>
                        <input type="text" id="cfg-singbox-sub" class="form-input" value="${config.singboxSubUrl}">
                        <span class="form-hint">默认: https://sublink.alwaysdata.net/singbox?config=</span>
                    </div>
                </div>
            </div>

            <!-- 操作按钮 -->
            <div class="button-group">
                <button type="button" onclick="saveAdminConfig()" class="btn btn-primary" style="padding: 12px 28px; font-size: 1rem;">
                    <i class="fas fa-save"></i> 保存并立即生效
                </button>
                <button type="button" onclick="resetAdminConfig()" class="btn btn-danger" style="padding: 12px 20px;">
                    <i class="fas fa-undo"></i> 恢复默认配置
                </button>
            </div>
        </div>

        <!-- Tab 2: 节点与订阅预览 -->
        <div id="tab-nodes" class="tab-content">
            <div class="info-card">
                <div class="info-item">
                    <span class="label">服务状态</span>
                    <span class="value"><span class="status"></span>运行中</span>
                </div>
                <div class="info-item">
                    <span class="label">主机地址</span>
                    <span class="value">${url}</span>
                </div>
                <div class="info-item">
                    <span class="label">UUID</span>
                    <span class="value">${config.yourUUID}</span>
                </div>
                <div class="info-item">
                    <span class="label">SS 节点路径</span>
                    <span class="value">${validSSPath}/?ed=2560</span>
                </div>
                <div class="info-item">
                    <span class="label">全协议订阅地址</span>
                    <span class="value">${baseUrl}/${config.subPath}</span>
                </div>
                <div class="info-item">
                    <span class="label">Clash 订阅地址</span>
                    <span class="value">${clashFullUrl}</span>
                </div>
                <div class="info-item">
                    <span class="label">Sing-box 订阅地址</span>
                    <span class="value">${singboxFullUrl}</span>
                </div>
            </div>
            
            <div class="button-group">
                <button onclick="copySingboxSubscription()" class="btn btn-secondary">
                    <i class="fas fa-cube"></i> 复制 Sing-box 订阅
                </button>
                <button onclick="copyClashSubscription()" class="btn btn-secondary">
                    <i class="fas fa-cat"></i> 复制 Clash 订阅
                </button>
                <button onclick="copySubscription()" class="btn btn-secondary">
                    <i class="fas fa-link"></i> 复制全部节点订阅
                </button>
                <button onclick="copyQXConfig()" class="btn btn-secondary">
                    <i class="fas fa-paper-plane"></i> 复制 Quantumult X 配置
                </button>
            </div>
        </div>
        
        <div class="footer">
            <div class="footer-links">
                <a href="/" class="footer-link">
                    <i class="fas fa-external-link-alt"></i>
                    <span>返回前台用户页面</span>
                </a>
                <a href="https://github.com/zaofengyue/CF-Workers-VLESS/tree/main" target="_blank" class="footer-link">
                    <i class="fab fa-github"></i>
                    <span>GitHub 项目</span>
                </a>
                <a href="https://proxy.fengyue.bond" target="_blank" class="footer-link">
                    <span>✅</span>
                    <span>Proxyip 检测服务</span>
                </a>
                <a href="https://socks.fengyue.bond" target="_blank" class="footer-link">
                    <span>🧦</span>
                    <span>socks5 检测服务</span>
                </a>
            </div>
        </div>
    </div>
    
    <script>
        let currentAdminPassword = '${config.adminPassword}';

        function switchTab(tabName) {
            document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            if (tabName === 'nodes') {
                document.getElementById('tab-btn-nodes').classList.add('active');
                document.getElementById('tab-nodes').classList.add('active');
            } else {
                document.getElementById('tab-btn-admin').classList.add('active');
                document.getElementById('tab-admin').classList.add('active');
            }
        }

        function showToast(message) {
            const existingToast = document.querySelector('.toast');
            if (existingToast) existingToast.remove();
            
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = '<div class="toast-icon">✓</div><div class="toast-message">' + message + '</div>';
            document.body.appendChild(toast);
            
            setTimeout(() => { toast.classList.add('show'); }, 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
            }, 1800);
        }

        async function saveAdminConfig() {
            const cfipRaw = document.getElementById('cfg-cfip').value;
            const cfipList = cfipRaw.split('\\n').map(s => s.trim()).filter(Boolean);
            const newAdminPwd = document.getElementById('cfg-admin-password').value.trim();
            const newUserPwd = document.getElementById('cfg-password').value.trim();
            
            const payload = {
                adminPassword: newAdminPwd,
                password: newUserPwd,
                yourUUID: document.getElementById('cfg-uuid').value.trim(),
                subPath: document.getElementById('cfg-subpath').value.trim(),
                SSpath: document.getElementById('cfg-sspath').value.trim(),
                disabletro: !document.getElementById('cfg-trojan').checked,
                disabless: !document.getElementById('cfg-ss').checked,
                proxyIP: document.getElementById('cfg-proxyip').value.trim(),
                cfip: cfipList,
                clashSubUrl: document.getElementById('cfg-clash-sub').value.trim(),
                singboxSubUrl: document.getElementById('cfg-singbox-sub').value.trim(),
            };

            try {
                const resp = await fetch('/api/config?password=' + encodeURIComponent(currentAdminPassword), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const res = await resp.json();
                if (res.success) {
                    showToast(res.message || '配置已成功保存到 KV！');
                    if (newAdminPwd && newAdminPwd !== currentAdminPassword) {
                        currentAdminPassword = newAdminPwd;
                        const newUrl = new URL(window.location);
                        newUrl.searchParams.set('password', newAdminPwd);
                        window.history.replaceState({}, '', newUrl.toString());
                    }
                    setTimeout(() => { window.location.reload(); }, 1200);
                } else {
                    alert('保存失败: ' + (res.message || '未知错误'));
                }
            } catch (err) {
                alert('保存网络异常: ' + err.message);
            }
        }

        async function resetAdminConfig() {
            if (!confirm('确定要清除 KV 中存储的配置并恢复为默认设置吗？')) {
                return;
            }
            try {
                const resp = await fetch('/api/reset?password=' + encodeURIComponent(currentAdminPassword), {
                    method: 'POST'
                });
                const res = await resp.json();
                if (res.success) {
                    showToast(res.message || '已重置为默认配置！');
                    setTimeout(() => { window.location.reload(); }, 1200);
                } else {
                    alert('重置失败: ' + (res.message || '未知错误'));
                }
            } catch (err) {
                alert('重置网络异常: ' + err.message);
            }
        }
        
        function copySubscription() {
            const configUrl = '${baseUrl}/${config.subPath}';
            copyText(configUrl, '全协议订阅链接已复制到剪贴板!');
        }
        
        function copyClashSubscription() {
            const clashUrl = '${clashFullUrl}';
            copyText(clashUrl, 'Clash 订阅链接已复制到剪贴板!');
        }
        
        function copySingboxSubscription() {
            const singboxUrl = '${singboxFullUrl}';
            copyText(singboxUrl, 'Sing-box 订阅链接已复制到剪贴板!');
        }
        
        function copyQXConfig() {
            const qx = '${qxFullConfig}';
            copyText(qx, 'Quantumult X 配置已复制!');
        }

        function copyText(text, msg) {
            navigator.clipboard.writeText(text).then(() => {
                showToast(msg);
            }).catch(() => {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast(msg);
            });
        }
        
        function logout() {
            if (confirm('确定要退出管理面板吗?')) {
                const currentUrl = new URL(window.location);
                currentUrl.searchParams.delete('password');
                window.location.href = currentUrl.toString();
            }
        }
    </script>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text/html;charset=utf-8',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}
