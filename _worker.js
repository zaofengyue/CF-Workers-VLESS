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
    proxyIPs: ['proxy.xxxxxxxx.tk:50001'],
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
let proxyIPs = [...DEFAULT_CONFIG.proxyIPs];
let yourUUID = DEFAULT_CONFIG.yourUUID;
let yourUUIDBytes = null;
let disabletro = DEFAULT_CONFIG.disabletro;
let disabless = DEFAULT_CONFIG.disabless;
let SSpath = DEFAULT_CONFIG.SSpath;
let cfip = [...DEFAULT_CONFIG.cfip];

function getKV(env) {
    if (!env) return null;
    return env.KV || env.DATA_KV || env.CONFIG_KV || null;
}

let memoryConfigCache = null;
let memoryConfigCacheTime = 0;
const CACHE_TTL_MS = 30000; // 内存缓存 30 秒，极速 0ms 响应，大幅降低并发握手延迟

async function loadConfig(env) {
    const now = Date.now();
    if (memoryConfigCache && (now - memoryConfigCacheTime < CACHE_TTL_MS)) {
        return memoryConfigCache;
    }

    let config = { ...DEFAULT_CONFIG, cfip: [...DEFAULT_CONFIG.cfip], proxyIPs: [...DEFAULT_CONFIG.proxyIPs] };

    // 1. 环境变量覆盖
    if (env) {
        if (env.UUID || env.uuid || env.AUTH) config.yourUUID = env.UUID || env.uuid || env.AUTH;
        if (env.PASSWORD || env.PASSWD || env.password) config.password = env.PASSWORD || env.PASSWD || env.password;
        if (env.ADMIN || env.admin) config.adminPassword = env.ADMIN || env.admin;
        if (env.SUB_PATH || env.subpath) config.subPath = env.SUB_PATH || env.subpath;
        if (env.PROXYIP || env.proxyip || env.proxyIP) {
            const rawProxy = env.PROXYIP || env.proxyip || env.proxyIP;
            const servers = String(rawProxy).split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
            if (servers.length > 0) {
                config.proxyIPs = servers;
                config.proxyIP = servers[0];
            }
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
                if (Array.isArray(kvData.proxyIPs) && kvData.proxyIPs.length > 0) {
                    config.proxyIPs = kvData.proxyIPs.map(s => String(s).trim()).filter(Boolean);
                    config.proxyIP = config.proxyIPs[0] || '';
                } else if (kvData.proxyIP) {
                    const servers = String(kvData.proxyIP).split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
                    config.proxyIPs = servers.length > 0 ? servers : [String(kvData.proxyIP).trim()];
                    config.proxyIP = config.proxyIPs[0] || String(kvData.proxyIP).trim();
                }
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
    
    memoryConfigCache = config;
    memoryConfigCacheTime = now;
    return config;
}

async function saveConfig(env, newConfig) {
    const kv = getKV(env);
    if (!kv) {
        throw new Error('未检测到绑定的 KV 命名空间，请先在 Cloudflare 控制台添加名为 KV 的变量绑定');
    }
    await kv.put('CONFIG', JSON.stringify(newConfig));
    memoryConfigCache = null;
    memoryConfigCacheTime = 0;
}

async function resetConfig(env) {
    const kv = getKV(env);
    if (!kv) {
        throw new Error('未检测到绑定的 KV 命名空间');
    }
    await kv.delete('CONFIG');
    memoryConfigCache = null;
    memoryConfigCacheTime = 0;
}
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
function closeSocketQuietly(socket) { 
    if (!socket) return;
    try { 
        if (typeof socket.close === 'function') {
            if (socket.readyState !== undefined) {
                if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
                    socket.close(); 
                }
            } else {
                socket.close();
            }
        }
    } catch (error) {} 
}

const GRAIN_CFG = {
    chunk: 64 * 1024,
    dnPack: 32 * 1024,
    dnTail: 512,
    dnQr: 4,
    upPack: 20 * 1024,
    concur: 4
};

function uuidToBytes(uuidStr) {
    if (!uuidStr || typeof uuidStr !== 'string') return null;
    const clean = uuidStr.replace(/-/g, '').toLowerCase();
    if (clean.length !== 32) return null;
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        const val = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
        if (isNaN(val)) return null;
        bytes[i] = val;
    }
    return bytes;
}

function matchUUID(chunkBytes, offset, uuidBytes) {
    if (!uuidBytes || chunkBytes.length < offset + 16) return false;
    for (let i = 0; i < 16; i++) {
        if (chunkBytes[offset + i] !== uuidBytes[i]) return false;
    }
    return true;
}

yourUUIDBytes = uuidToBytes(yourUUID);

function getSocketConnector(request) {
    if (request && request.fetcher && typeof request.fetcher.connect === 'function') {
        return request.fetcher;
    }
    return { connect };
}

const sprout = (f, h, p) => {
    try {
        const s = f.connect({ hostname: h, port: p });
        if (s && s.opened && typeof s.opened.then === 'function') {
            return s.opened.then(() => s);
        }
        return Promise.resolve(s);
    } catch (e) {
        return Promise.reject(e);
    }
};

const raceSprout = (f, h, p, concur = 4) => {
    if (!f || typeof f.connect !== 'function') {
        return Promise.reject(new Error('connect unavailable'));
    }
    if (concur <= 1) return sprout(f, h, p);
    const ts = Array(concur).fill(null).map(() => sprout(f, h, p));
    return Promise.any(ts).then(winner => {
        ts.forEach(t => {
            t.then(s => {
                if (s !== winner) closeSocketQuietly(s);
            }).catch(() => {});
        });
        return winner;
    });
};

const mkK = (cap, cpy = 0) => {
    let q = [], h = 0, b = 0, buf = null;
    const e = () => h >= q.length;
    const trim = () => { if (h > 32 && h * 2 >= q.length) { q = q.slice(h); h = 0; } };
    const clear = () => { q = []; h = 0; b = 0; };
    const take = () => { if (e()) return null; const d = q[h]; q[h++] = undefined; b -= d.byteLength; trim(); return d; };
    const sow = d => { const n = d?.byteLength || 0; return !n || (q.push(d), b += n, 1); };
    const pack = d => {
        d ||= take();
        if (!d || e()) return [d, 0];
        let n = d.byteLength, j = h;
        while (j < q.length) {
            const x = q[j], nn = n + x.byteLength;
            if (nn > cap) break;
            n = nn;
            j++;
        }
        if (j === h) return [d, 0];
        const out = buf ||= new Uint8Array(cap);
        out.set(d);
        for (let o = d.byteLength; h < j;) {
            const x = q[h];
            q[h++] = undefined;
            b -= x.byteLength;
            out.set(x, o);
            o += x.byteLength;
        }
        trim();
        const u = out.subarray(0, n);
        return [cpy ? u.slice() : u, 1];
    };
    return { e, get b() { return b; }, clear, take, sow, pack };
};

const mkQ = cap => {
    const k = mkK(cap);
    return { get empty() { return k.e(); }, clear: k.clear, sow: k.sow, bundle: d => k.pack(d) };
};

const mkDn = (w, sendFn) => {
    const cap = GRAIN_CFG.dnPack;
    const tail = GRAIN_CFG.dnTail;
    const low = Math.max(4096, tail * 12);
    const k = mkK(cap, 1);
    let tp = 0, gen = 0, qk = 0, qr = 0;
    
    const reap = () => {
        if (tp) clearTimeout(tp);
        tp = 0;
        qr = 0;
        for (;;) {
            const [u] = k.pack();
            if (!u) break;
            sendFn(u);
        }
    };
    
    const ripen = () => {
        if (k.e() || tp) return;
        if (k.b >= cap || (cap - k.b) < tail) return reap();
        tp = setTimeout(() => {
            tp = 0;
            if (k.e()) return;
            if (k.b >= cap || (cap - k.b) < tail) return reap();
            if (qr < GRAIN_CFG.dnQr && (gen !== qk || k.b < low)) {
                qr++;
                qk = gen;
                return ripen();
            }
            reap();
        }, 1);
    };
    
    return {
        send(u) {
            let o = 0, n = u?.byteLength || 0;
            if (!n) return;
            while (o < n) {
                const m = Math.min(cap - k.b, n - o);
                if (!m) { reap(); continue; }
                k.sow(o || m !== n ? u.subarray(o, o + m) : u);
                gen++;
                o += m;
                if (k.b >= cap || (cap - k.b) < tail) reap();
                else ripen();
            }
        },
        reap
    };
};

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

/**
 * 解析并合并优选 IP 列表 (支持纯文本 IP/域名以及远程 Gist / http(s) 链接自动拉取合并)
 * @param {string[]} cfipList
 * @returns {Promise<string[]>}
 */
async function resolveCfipList(cfipList) {
    if (!Array.isArray(cfipList) || cfipList.length === 0) return [];
    const resolved = [];
    for (const item of cfipList) {
        const trimmed = String(item).trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            try {
                const resp = await fetch(trimmed, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Cloudflare-Worker)' }
                });
                if (resp.ok) {
                    const text = await resp.text();
                    const lines = text.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
                    for (const line of lines) {
                        if (line && !line.startsWith('#') && !line.startsWith('//')) {
                            resolved.push(line);
                        }
                    }
                }
            } catch (err) {
                // 网络异常跳过或记录
            }
        } else {
            resolved.push(trimmed);
        }
    }
    return resolved.length > 0 ? resolved : cfipList;
}

function parsePryAddress(serverStr) {
    if (!serverStr) return null;
    serverStr = serverStr.trim();
    // 解析 SSTP (MS-SSTP / SoftEther)
    if (serverStr.startsWith('sstp://')) {
        try {
            const url = new URL(serverStr);
            return {
                type: 'sstp',
                host: url.hostname,
                port: parseInt(url.port) || 443,
                username: url.username ? decodeURIComponent(url.username) : 'vpn',
                password: url.password ? decodeURIComponent(url.password) : 'vpn'
            };
        } catch (e) {
            return null;
        }
    }

    // 解析 TURN (RFC 5766 / RFC 6062)
    if (serverStr.startsWith('turn://')) {
        try {
            const url = new URL(serverStr);
            return {
                type: 'turn',
                host: url.hostname,
                port: parseInt(url.port) || 3478,
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }

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
    // 允许测速站点正常通行，解除测速阻断以测得真实带宽
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
            yourUUIDBytes = uuidToBytes(config.yourUUID);
            password = config.password;
            subPath = config.subPath;
            proxyIP = config.proxyIP;
            proxyIPs = config.proxyIPs;
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

                        let newProxyIPs = config.proxyIPs;
                        if (typeof body.proxyIPs === 'string') {
                            newProxyIPs = body.proxyIPs.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
                        } else if (Array.isArray(body.proxyIPs)) {
                            newProxyIPs = body.proxyIPs.map(s => String(s).trim()).filter(Boolean);
                        } else if (typeof body.proxyIP === 'string') {
                            newProxyIPs = body.proxyIP.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
                        }
                        const mainProxyIP = newProxyIPs.length > 0 ? newProxyIPs[0] : (body.proxyIP ? String(body.proxyIP).trim() : config.proxyIP);
                        
                        const updatedConfig = {
                            yourUUID: (body.yourUUID && String(body.yourUUID).trim()) || config.yourUUID,
                            password: (body.password && String(body.password).trim()) || config.password,
                            adminPassword: (body.adminPassword && String(body.adminPassword).trim()) || config.adminPassword,
                            subPath: body.subPath !== undefined ? String(body.subPath).trim() : config.subPath,
                            proxyIP: mainProxyIP,
                            proxyIPs: newProxyIPs.length > 0 ? newProxyIPs : [mainProxyIP],
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

            // 3. 路径中 proxyip / fd (分流代理) / ld (落地代理) 处理 (支持 sstp://, turn://, socks5://, http(s)://)
            let pathProxyIP = null;
            const proxyIpMatch = pathname.match(/\/(?:proxyip|fd|ld)=((?:sstp|turn|socks5|socks|https|http):\/\/[^\s?&#]+)/i) ||
                                 pathname.match(/^\/((?:sstp|turn):\/\/[^\s?&#]+)/i) ||
                                 pathname.match(/\/(?:proxyip|fd|ld)=([^/?&#]+)/i);
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
            } else if (pathname.startsWith('/fd=')) {
                try {
                    pathProxyIP = decodeURIComponent(pathname.substring(4)).trim();
                } catch (e) {
                    // 忽略错误
                }
            } else if (pathname.startsWith('/ld=')) {
                try {
                    pathProxyIP = decodeURIComponent(pathname.substring(4)).trim();
                } catch (e) {
                    // 忽略错误
                }
            }

            if (pathProxyIP && !request.headers.get('Upgrade')) {
                config.proxyIP = pathProxyIP;
                proxyIP = pathProxyIP;
                return new Response(`set proxyIP/fd/ld to: ${proxyIP}\n\n`, {
                    headers: { 
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                    },
                });
            }

            // 4. WebSocket 连接
            if (request.headers.get('Upgrade') === 'websocket') {
                let customProxyIP = pathProxyIP || 
                    url.searchParams.get('fd') || 
                    url.searchParams.get('ld') || 
                    url.searchParams.get('proxyip') || 
                    request.headers.get('fd') || 
                    request.headers.get('ld') || 
                    request.headers.get('proxyip');

                // 若 customProxyIP 为数字索引 (如 ld=0, ld=1)，自动从 proxyIPs 列表中按索引映射出实际出站代理
                if (customProxyIP && /^\d+$/.test(customProxyIP.trim())) {
                    const idx = parseInt(customProxyIP.trim(), 10);
                    const list = (Array.isArray(config.proxyIPs) && config.proxyIPs.length > 0) ? config.proxyIPs : (config.proxyIP ? [config.proxyIP] : []);
                    if (list[idx]) {
                        let raw = list[idx].trim();
                        if (raw.includes('#')) raw = raw.split('#')[0].trim();
                        customProxyIP = raw.replace(/^(?:ld|fd|proxyip)=/i, '').trim();
                    }
                }
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
                    
                    // 解析优选节点 (支持本地列表与远程 Gist / URL 订阅自动拉取合并)
                    const resolvedCfip = await resolveCfipList(config.cfip);

                    // 解析多落地代理列表 (支持 #备注名，如 socks5://...@1.2.3.4:1080#香港S5)
                    const rawProxyList = (Array.isArray(config.proxyIPs) && config.proxyIPs.length > 0)
                        ? config.proxyIPs
                        : (config.proxyIP ? [config.proxyIP] : []);

                    const parsedProxies = rawProxyList.map((item, idx) => {
                        let rawItem = String(item).trim();
                        let proxyTag = '';
                        if (rawItem.includes('#')) {
                            const parts = rawItem.split('#');
                            rawItem = parts[0].trim();
                            proxyTag = parts[1].trim();
                        }
                        const cleanAddr = rawItem.replace(/^(?:ld|fd|proxyip)=/i, '').trim();
                        return {
                            proxyAddr: cleanAddr,
                            proxyTag: proxyTag,
                            index: idx,
                            hasRemark: !!proxyTag
                        };
                    }).filter(p => p.proxyAddr);

                    // 若未配置落地代理，默认保留单路全局/默认出站
                    const effectiveProxies = parsedProxies.length > 0 ? parsedProxies : [{ proxyAddr: '', proxyTag: '', index: 0, hasRemark: false }];
                    const needIndexRouting = parsedProxies.length > 1 || (parsedProxies.length === 1 && parsedProxies[0].hasRemark);

                    // 生成 VLESS 节点 (优选 CDN × 落地代理)
                    const vlsLinks = [];
                    for (const cdnItem of resolvedCfip) {
                        let host, port = 443, nodeName = '', cdnItemClean = cdnItem;
                        if (cdnItem.includes('#')) {
                            const parts = cdnItem.split('#');
                            cdnItemClean = parts[0];
                            nodeName = parts[1];
                        }

                        if (cdnItemClean.startsWith('[') && cdnItemClean.includes(']:')) {
                            const ipv6End = cdnItemClean.indexOf(']:');
                            host = cdnItemClean.substring(0, ipv6End + 1); 
                            const portStr = cdnItemClean.substring(ipv6End + 2); 
                            port = parseInt(portStr) || 443;
                        } else if (cdnItemClean.includes(':')) {
                            const parts = cdnItemClean.split(':');
                            host = parts[0];
                            port = parseInt(parts[1]) || 443;
                        } else {
                            host = cdnItemClean;
                        }

                        for (const proxy of effectiveProxies) {
                            // 规则：有落地且有备注 => 【协议名】-【落地备注】；无落地或无备注 => 【CDN备注】-【协议名】
                            const vlsNodeName = proxy.hasRemark ? `VLESS-${proxy.proxyTag}` : (nodeName ? `${nodeName}-VLESS` : 'Workers-VLESS');
                            const wsPath = (proxy.proxyAddr && needIndexRouting)
                                ? `/?ed=2560&ld=${proxy.index}`
                                : '/?ed=2560';
                            vlsLinks.push(`${vlsHeader}://${config.yourUUID}@${host}:${port}?encryption=none&security=tls&sni=${currentDomain}&fp=firefox&allowInsecure=0&type=ws&host=${currentDomain}&path=${encodeURIComponent(wsPath)}#${vlsNodeName}`);
                        }
                    }
                    
                    // 生成 Trojan 节点 (优选 CDN × 落地代理)
                    let troLinks = [];
                    if (!config.disabletro) {
                        for (const cdnItem of resolvedCfip) {
                            let host, port = 443, nodeName = '', cdnItemClean = cdnItem;
                            if (cdnItem.includes('#')) {
                                const parts = cdnItem.split('#');
                                cdnItemClean = parts[0];
                                nodeName = parts[1];
                            }

                            if (cdnItemClean.startsWith('[') && cdnItemClean.includes(']:')) {
                                const ipv6End = cdnItemClean.indexOf(']:');
                                host = cdnItemClean.substring(0, ipv6End + 1); 
                                const portStr = cdnItemClean.substring(ipv6End + 2); 
                                port = parseInt(portStr) || 443;
                            } else if (cdnItemClean.includes(':')) {
                                const parts = cdnItemClean.split(':');
                                host = parts[0];
                                port = parseInt(parts[1]) || 443;
                            } else {
                                host = cdnItemClean;
                            }

                            for (const proxy of effectiveProxies) {
                                const troNodeName = proxy.hasRemark ? `Trojan-${proxy.proxyTag}` : (nodeName ? `${nodeName}-Trojan` : 'Workers-Trojan');
                                const wsPath = (proxy.proxyAddr && needIndexRouting)
                                    ? `/?ed=2560&ld=${proxy.index}`
                                    : '/?ed=2560';
                                troLinks.push(`${troHeader}://${config.yourUUID}@${host}:${port}?security=tls&sni=${currentDomain}&fp=firefox&allowInsecure=0&type=ws&host=${currentDomain}&path=${encodeURIComponent(wsPath)}#${troNodeName}`);
                            }
                        }
                    }

                    // 生成 Shadowsocks 节点 (优选 CDN × 落地代理)
                    let ssLinks = [];
                    if (!config.disabless) {
                        const method = 'none';
                        const ssConfig = `${method}:${config.yourUUID}`;
                        const encodedConfig = btoa(ssConfig);
                        for (const cdnItem of resolvedCfip) {
                            let host, port = 443, nodeName = '', cdnItemClean = cdnItem;
                            if (cdnItem.includes('#')) {
                                const parts = cdnItem.split('#');
                                cdnItemClean = parts[0];
                                nodeName = parts[1];
                            }

                            if (cdnItemClean.startsWith('[') && cdnItemClean.includes(']:')) {
                                const ipv6End = cdnItemClean.indexOf(']:');
                                host = cdnItemClean.substring(0, ipv6End + 1); 
                                const portStr = cdnItemClean.substring(ipv6End + 2); 
                                port = parseInt(portStr) || 443;
                            } else if (cdnItemClean.includes(':')) {
                                const parts = cdnItemClean.split(':');
                                host = parts[0];
                                port = parseInt(parts[1]) || 443;
                            } else {
                                host = cdnItemClean;
                            }

                            for (const proxy of effectiveProxies) {
                                const ssNodeName = proxy.hasRemark ? `SS-${proxy.proxyTag}` : (nodeName ? `${nodeName}-SS` : 'Workers-SS');
                                const ssWsPath = (proxy.proxyAddr && needIndexRouting)
                                    ? `${validSSPath}/?ed=2560&ld=${proxy.index}`
                                    : `${validSSPath}/?ed=2560`;
                                ssLinks.push(`${ssHeader}://${encodedConfig}@${host}:${port}?plugin=v2ray-plugin;mode%3Dwebsocket;host%3D${currentDomain};path%3D${encodeURIComponent(ssWsPath)};tls;sni%3D${currentDomain};skip-cert-verify%3Dtrue;mux%3D0#${ssNodeName}`);
                            }
                        }
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
    const [clientSock, serverSock] = Object.values(wssPair);
    serverSock.accept({ allowHalfOpen: true });
    serverSock.binaryType = 'arraybuffer';
    let remoteConnWrapper = { socket: null };
    let isDnsQuery = false;
    let isTrojan = false;
    const earlyData = request.headers.get('sec-websocket-protocol') || '';
    const readable = makeReadableStr(serverSock, earlyData);

    const url = new URL(request.url);
    const pathname = url.pathname;
    const isSSPath = validSSPath && pathname.toLowerCase().startsWith(validSSPath.toLowerCase());

    const upQueue = mkQ(GRAIN_CFG.upPack);
    let isWriting = false;

    async function flushUpstream() {
        if (isWriting || !remoteConnWrapper.socket) return;
        isWriting = true;
        try {
            while (!upQueue.empty && remoteConnWrapper.socket) {
                const [bundle] = upQueue.bundle();
                if (!bundle) break;
                const writer = remoteConnWrapper.socket.writable.getWriter();
                try {
                    await writer.write(bundle);
                } finally {
                    writer.releaseLock();
                }
            }
        } catch (e) {
            closeSocketQuietly(serverSock);
        } finally {
            isWriting = false;
            if (!upQueue.empty && remoteConnWrapper.socket) {
                flushUpstream();
            }
        }
    }

    readable.pipeTo(new WritableStream({
        async write(chunk) {
            if (isDnsQuery) return await forwardataudp(chunk, serverSock, null);
            if (remoteConnWrapper.socket) {
                upQueue.sow(chunk);
                await flushUpstream();
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
                    
                    await forwardataTCP(hostname, port, rawClientData, serverSock, null, remoteConnWrapper, customProxyIP, request);
                    if (remoteConnWrapper.socket && !upQueue.empty) await flushUpstream();
                    return;
                }
            }
            
            // 2. 尝试 VLESS 协议解析
            const vlsResult = parseVLsPacketHeader(chunk, yourUUID, yourUUIDBytes);
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
                await forwardataTCP(hostname, port, rawData, serverSock, respHeader, remoteConnWrapper, customProxyIP, request);
                if (remoteConnWrapper.socket && !upQueue.empty) await flushUpstream();
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
                    await forwardataTCP(hostname, port, rawData, serverSock, null, remoteConnWrapper, customProxyIP, request);
                    if (remoteConnWrapper.socket && !upQueue.empty) await flushUpstream();
                    return;
                }
            }

            throw new Error(vlsResult.message || 'Protocol parse error');
        },
    })).catch((err) => {
        // console.error('Readable pipe error:', err);
    });

    return new Response(null, { 
        status: 101, 
        webSocket: clientSock,
        headers: { 'Sec-WebSocket-Extensions': '' }
    });
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

// ------------------------- DoH DNS 解析 -------------------------
async function resolveDnsA(host) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
    try {
        const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, {
            headers: { Accept: 'application/dns-json' }
        });
        const json = await res.json();
        const ans = json.Answer?.find(a => a.type === 1);
        return ans?.data || null;
    } catch (e) {
        return null;
    }
}

// ------------------------- SoftEther (MS-SSTP) 落地代理 -------------------------
const sstpCat = (...a) => {
    const r = new Uint8Array(a.reduce((s, x) => s + x.length, 0));
    a.reduce((o, x) => (r.set(x, o), o + x.length), 0);
    return r;
};
const sstpU16 = (b, o) => (b[o] << 8) | b[o + 1];
const sstpU32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const sstpRng = n => crypto.getRandomValues(new Uint8Array(n));
const sstpRng16 = () => sstpU16(sstpRng(2), 0);
const sstpRng32 = () => sstpU32(sstpRng(4), 0);
const sstpIpB = ip => new Uint8Array(ip.split('.').map(Number));
const sstpCksum = (d, o, n) => {
    let s = 0;
    for (let i = o; i < o + n - 1; i += 2) s += sstpU16(d, i);
    if (n & 1) s += d[o + n - 1] << 8;
    while (s >> 16) s = (s & 0xFFFF) + (s >> 16);
    return (~s) & 0xFFFF;
};

function createSstpEngine(proxyConfig) {
    const E = new Uint8Array(0);
    const user = proxyConfig.username || 'vpn';
    const pass = proxyConfig.password || 'vpn';
    const papCredUser = new TextEncoder().encode(user);
    const papCredPass = new TextEncoder().encode(pass);
    const dec = new TextDecoder();
    const enc = s => new TextEncoder().encode(s);
    
    let buf = E, pppId = 1, sock = null, rd = null, wr = null, host = proxyConfig.host, rb = new ArrayBuffer(65536);
    
    const readBytes = async n => {
        if (buf.length >= n) {
            const r = buf.subarray(0, n);
            buf = buf.subarray(n);
            return r;
        }
        const saved = buf.length > 0 ? new Uint8Array(buf) : null;
        const need = n - buf.length;
        const { value, done } = await rd.readAtLeast(need, new Uint8Array(rb, 0, 65536));
        if (done) throw new Error('SSTP connection closed prematurely');
        rb = value.buffer;
        if (saved) {
            const t = sstpCat(saved, value);
            buf = t.subarray(n);
            return t.subarray(0, n);
        }
        buf = value.subarray(n);
        return value.subarray(0, n);
    };

    const readLine = async () => {
        for (;;) {
            const i = buf.indexOf(10);
            if (i >= 0) {
                let l = dec.decode(buf.subarray(0, i));
                buf = buf.subarray(i + 1);
                return l.replace(/\r$/, '');
            }
            const saved = buf.length > 0 ? new Uint8Array(buf) : null;
            const { value, done } = await rd.readAtLeast(1, new Uint8Array(rb, 0, 65536));
            if (done) throw new Error('SSTP connection closed');
            rb = value.buffer;
            buf = saved ? sstpCat(saved, value) : value;
        }
    };

    const readPkt = async (ms = 10000) => {
        let t;
        const to = new Promise((_, r) => { t = setTimeout(() => r(new Error('Timeout')), ms); });
        try {
            const h = await Promise.race([readBytes(4), to]);
            clearTimeout(t);
            const len = sstpU16(h, 2) & 0xFFF;
            return { ctrl: (h[1] & 1) !== 0, body: len > 4 ? await readBytes(len - 4) : E };
        } catch (e) {
            clearTimeout(t);
            throw e;
        }
    };

    const sstpData = f => {
        const n = 6 + f.length, p = new Uint8Array(n);
        p.set([0x10, 0, ((n >> 8) & 0xF) | 0x80, n & 0xFF, 0xFF, 0x03]);
        p.set(f, 6);
        return p;
    };

    const sstpCtrl = (mt, attrs = []) => {
        const al = attrs.reduce((s, a) => s + 4 + a.data.length, 0);
        const p = new Uint8Array(8 + al), v = new DataView(p.buffer);
        p[0] = 0x10; p[1] = 0x01;
        v.setUint16(2, (8 + al) | 0x8000);
        v.setUint16(4, mt);
        v.setUint16(6, attrs.length);
        attrs.reduce((o, a) => (p[o + 1] = a.id, v.setUint16(o + 2, 4 + a.data.length), p.set(a.data, o + 4), o + 4 + a.data.length), 8);
        return p;
    };

    const ppp = (proto, code, id, opts = []) => {
        const ol = opts.reduce((s, o) => s + 2 + o.data.length, 0);
        const f = new Uint8Array(6 + ol), v = new DataView(f.buffer);
        v.setUint16(0, proto);
        f[2] = code; f[3] = id;
        v.setUint16(4, 4 + ol);
        opts.reduce((o, x) => (f[o] = x.type, f[o + 1] = 2 + x.data.length, f.set(x.data, o + 2), o + 2 + x.data.length), 6);
        return f;
    };

    const pap = id => {
        const ul = papCredUser.length, pl = papCredPass.length;
        const tl = 6 + ul + pl, f = new Uint8Array(2 + tl), v = new DataView(f.buffer);
        v.setUint16(0, 0xc023);
        f[2] = 1; f[3] = id;
        v.setUint16(4, tl);
        f[6] = ul; f.set(papCredUser, 7);
        f[7 + ul] = pl; f.set(papCredPass, 8 + ul);
        return f;
    };

    const parsePPP = d => {
        let o = d.length >= 2 && d[0] === 0xFF && d[1] === 0x03 ? 2 : 0;
        if (d.length - o < 4) return null;
        const p = sstpU16(d, o);
        return p === 0x0021 ? { protocol: p, ip: d.subarray(o + 2) } :
               d.length - o >= 6 ? { protocol: p, code: d[o + 2], id: d[o + 3], payload: d.subarray(o + 6), raw: d.subarray(o) } : null;
    };

    const parseOpts = d => {
        const r = [];
        for (let i = 0; i + 2 <= d.length;) {
            const t = d[i], l = d[i + 1];
            if (l < 2 || i + l > d.length) break;
            r.push({ type: t, data: d.subarray(i + 2, i + l) });
            i += l;
        }
        return r;
    };

    const connect_ = async (h, p) => {
        sock = connect({ hostname: h, port: p }, { secureTransport: 'on' });
        await sock.opened;
        rd = sock.readable.getReader({ mode: 'byob' });
        wr = sock.writable.getWriter();
        host = h;
    };

    const establish = async () => {
        const http = enc(`SSTP_DUPLEX_POST /sra_{BA195980-CD49-458b-9E23-C84EE0ADCD75}/ HTTP/1.1\r\nHost: ${host}\r\nContent-Length: 18446744073709551615\r\nSSTPCORRELATIONID: {${crypto.randomUUID()}}\r\n\r\n`);
        const pa = new Uint8Array(2);
        new DataView(pa.buffer).setUint16(0, 1);
        const mru = new Uint8Array(2);
        new DataView(mru.buffer).setUint16(0, 1500);
        await wr.write(sstpCat(http, sstpCtrl(0x0001, [{ id: 1, data: pa }]), sstpData(ppp(0xc021, 1, pppId++, [{ type: 1, data: mru }]))));
        const st = await readLine();
        while ((await readLine()) !== '') {}
        if (!st.includes('200')) throw new Error('SSTP handshake failed: ' + st);
        
        let sa = false, ld = false, auth = false, done = false, myIp = null;
        for (let r = 0; r < 25 && !done; r++) {
            const pk = await readPkt();
            if (pk.ctrl) {
                if (!sa && pk.body.length >= 2 && sstpU16(pk.body, 0) === 2) sa = true;
                continue;
            }
            const pp = parsePPP(pk.body);
            if (!pp) continue;
            if (pp.protocol === 0xc021) {
                if (pp.code === 1) {
                    const a = new Uint8Array(pp.raw);
                    a[2] = 2;
                    await wr.write(ld && !auth ? sstpCat(sstpData(a), sstpData(pap(pppId++))) : sstpData(a));
                    if (ld) auth = true;
                } else if (pp.code === 2) {
                    ld = true;
                    if (!auth) {
                        await wr.write(sstpData(pap(pppId++)));
                        auth = true;
                    }
                }
            } else if (pp.protocol === 0xc023 && pp.code === 2) {
                await wr.write(sstpData(ppp(0x8021, 1, pppId++, [{ type: 3, data: new Uint8Array(4) }])));
            } else if (pp.protocol === 0x8021) {
                if (pp.code === 1) {
                    const a = new Uint8Array(pp.raw);
                    a[2] = 2;
                    await wr.write(sstpData(a));
                } else if (pp.code === 3) {
                    const o = parseOpts(pp.payload).find(x => x.type === 3);
                    if (o) {
                        myIp = [...o.data].join('.');
                        await wr.write(sstpData(ppp(0x8021, 1, pppId++, [{ type: 3, data: o.data }])));
                    }
                } else if (pp.code === 2) {
                    const o = parseOpts(pp.payload).find(x => x.type === 3);
                    if (o) myIp = [...o.data].join('.');
                    done = true;
                }
            }
        }
        if (!myIp) throw new Error('SSTP failed to acquire virtual IP');
        return myIp;
    };

    const close = () => {
        [rd, wr, sock].forEach(x => {
            try { x?.cancel?.() ?? x?.close?.(); } catch {}
        });
    };

    return { connect: connect_, establish, readPkt, parsePPP, get buf() { return buf; }, get wr() { return wr; }, close };
}

function sstpCreateTcp(sstp, srcIp, dstIp, dstPort) {
    const srcPort = 10000 + (sstpRng16() % 50000);
    const srcB = sstpIpB(srcIp);
    const dstB = sstpIpB(dstIp);
    let seq = sstpRng32(), ack = 0;
    const ipTpl = new Uint8Array(20);
    ipTpl.set([0x45, 0, 0, 0, 0, 0, 0x40, 0, 64, 6]);
    ipTpl.set(srcB, 12);
    ipTpl.set(dstB, 16);
    const pseudo = new Uint8Array(1432);
    pseudo.set(srcB);
    pseudo.set(dstB, 4);
    pseudo[9] = 6;

    const frame = (flags, data = new Uint8Array(0)) => {
        const pl = data.length, tl = 20 + pl, il = 20 + tl, st = 8 + il;
        const f = new Uint8Array(st), v = new DataView(f.buffer);
        f.set([0x10, 0, ((st >> 8) & 0xF) | 0x80, st & 0xFF, 0xFF, 0x03, 0, 0x21]);
        f.set(ipTpl, 8);
        v.setUint16(10, il);
        v.setUint16(12, sstpRng16());
        v.setUint16(18, sstpCksum(f, 8, 20));
        v.setUint16(28, srcPort);
        v.setUint16(30, dstPort);
        v.setUint32(32, seq);
        v.setUint32(36, ack);
        f[40] = 0x50;
        f[41] = flags;
        v.setUint16(42, 65535);
        if (pl) f.set(data, 48);
        pseudo[10] = tl >> 8;
        pseudo[11] = tl & 0xFF;
        pseudo.set(f.subarray(28, 28 + tl), 12);
        v.setUint16(44, sstpCksum(pseudo, 0, 12 + tl));
        return f;
    };

    const match = ip => {
        if (ip.length < 40 || ip[9] !== 6) return null;
        const ihl = (ip[0] & 0xF) * 4;
        if (sstpU16(ip, ihl) !== dstPort || sstpU16(ip, ihl + 2) !== srcPort) return null;
        return { flags: ip[ihl + 13], seq: sstpU32(ip, ihl + 4), off: ihl + ((ip[ihl + 12] >> 4) & 0xF) * 4 };
    };

    const handshake = async () => {
        await sstp.wr.write(frame(0x02));
        seq = (seq + 1) >>> 0;
        for (let i = 0; i < 30; i++) {
            const pk = await sstp.readPkt();
            if (pk.ctrl) continue;
            const pp = sstp.parsePPP(pk.body);
            if (!pp || pp.protocol !== 0x0021) continue;
            const m = match(pp.ip);
            if (!m || (m.flags & 0x12) !== 0x12) continue;
            ack = (m.seq + 1) >>> 0;
            sstp.wr.write(frame(0x10)).catch(() => {});
            return true;
        }
        throw new Error('SSTP TCP handshake timeout');
    };

    return { frame, match, handshake, get seq() { return seq; }, set seq(v) { seq = v; }, get ack() { return ack; }, set ack(v) { ack = v; } };
}

async function connect2Sstp(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port } = proxyConfig;
    const sstp = createSstpEngine(proxyConfig);
    let isClosed = false;
    let closedResolve;
    const closedPromise = new Promise(resolve => { closedResolve = resolve; });

    const closeAll = () => {
        if (isClosed) return;
        isClosed = true;
        try { sstp.close(); } catch {}
        closedResolve();
    };

    try {
        await sstp.connect(host, port || 443);
        const targetIpPromise = resolveDnsA(targetHost);
        const [myIp, targetIp] = await Promise.all([sstp.establish(), targetIpPromise]);
        if (!targetIp) throw new Error(`SSTP DNS resolution failed for: ${targetHost}`);

        const tcp = sstpCreateTcp(sstp, myIp, targetIp, targetPort);
        await tcp.handshake();

        let ctrl = null;
        const readable = new ReadableStream({
            start(c) { ctrl = c; },
            cancel() { closeAll(); }
        });

        (async () => {
            try {
                let pend = [], pLen = 0;
                const flush = () => {
                    if (!pLen) return;
                    ctrl.enqueue(pend.length === 1 ? pend[0] : sstpCat(...pend));
                    pend = [];
                    pLen = 0;
                    sstp.wr.write(tcp.frame(0x10)).catch(() => {});
                };
                for (;;) {
                    const pk = await sstp.readPkt(60000);
                    if (pk.ctrl) continue;
                    const pp = sstp.parsePPP(pk.body);
                    if (!pp || pp.protocol !== 0x0021) continue;
                    const m = tcp.match(pp.ip);
                    if (!m) continue;
                    if (m.off < pp.ip.length) {
                        const d = pp.ip.subarray(m.off);
                        if (d.length) {
                            tcp.ack = (m.seq + d.length) >>> 0;
                            pend.push(new Uint8Array(d));
                            pLen += d.length;
                        }
                    }
                    if (m.flags & 0x01) {
                        flush();
                        tcp.ack = (tcp.ack + 1) >>> 0;
                        sstp.wr.write(tcp.frame(0x11)).catch(() => {});
                        ctrl.close();
                        closeAll();
                        return;
                    }
                    if (sstp.buf.length < 4 || pLen >= 32768) flush();
                }
            } catch (err) {
                try { ctrl.close(); } catch {}
                closeAll();
            }
        })();

        const MSS = 1400;
        const writable = new WritableStream({
            async write(chunk) {
                const d = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
                if (d.length <= MSS) {
                    await sstp.wr.write(tcp.frame(0x18, d));
                    tcp.seq = (tcp.seq + d.length) >>> 0;
                    return;
                }
                const frames = [];
                for (let o = 0; o < d.length; o += MSS) {
                    const seg = d.subarray(o, Math.min(o + MSS, d.length));
                    frames.push(tcp.frame(0x18, seg));
                    tcp.seq = (tcp.seq + seg.length) >>> 0;
                }
                await sstp.wr.write(sstpCat(...frames));
            },
            close() {
                sstp.wr.write(tcp.frame(0x11)).catch(() => {});
                closeAll();
            },
            abort() {
                closeAll();
            }
        });

        if (initialData && initialData.byteLength > 0) {
            const writer = writable.getWriter();
            await writer.write(initialData);
            writer.releaseLock();
        }

        return {
            readable,
            writable,
            close: closeAll,
            closed: closedPromise
        };
    } catch (err) {
        closeAll();
        throw err;
    }
}

// ------------------------- TURN (RFC 5766 / RFC 6062) 落地代理 -------------------------
const TURN_MAGIC = new Uint8Array([0x21, 0x12, 0xA4, 0x42]);
const TURN_MT = { AQ: 0x003, AO: 0x103, AE: 0x113, PQ: 0x008, PO: 0x108, CQ: 0x00A, CO: 0x10A, BQ: 0x00B, BO: 0x10B };
const TURN_AT = { USER: 0x006, MI: 0x008, ERR: 0x009, PEER: 0x012, REALM: 0x014, NONCE: 0x015, TRANSPORT: 0x019, CONNID: 0x02A };

const turnCat = (...a) => {
    const r = new Uint8Array(a.reduce((s, x) => s + x.length, 0));
    a.reduce((o, x) => (r.set(x, o), o + x.length), 0);
    return r;
};

const turnStunAttr = (t, v) => {
    const b = new Uint8Array(4 + v.length + (4 - v.length % 4) % 4);
    const d = new DataView(b.buffer);
    d.setUint16(0, t);
    d.setUint16(2, v.length);
    b.set(v, 4);
    return b;
};

const turnStunMsg = (t, tid, a) => {
    const bd = turnCat(...a);
    const h = new Uint8Array(20);
    const d = new DataView(h.buffer);
    d.setUint16(0, t);
    d.setUint16(2, bd.length);
    h.set(TURN_MAGIC, 4);
    h.set(tid, 8);
    return turnCat(h, bd);
};

const turnXorPeer = (ip, port) => {
    const b = new Uint8Array(8);
    b[1] = 1;
    new DataView(b.buffer).setUint16(2, port ^ 0x2112);
    ip.split('.').forEach((v, i) => b[4 + i] = +v ^ TURN_MAGIC[i]);
    return b;
};

const turnParseStun = d => {
    if (d.length < 20 || TURN_MAGIC.some((v, i) => d[4 + i] !== v)) return null;
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const ml = dv.getUint16(2);
    const attrs = {};
    for (let o = 20; o + 4 <= 20 + ml;) {
        const t = dv.getUint16(o);
        const l = dv.getUint16(o + 2);
        if (o + 4 + l > d.length) break;
        attrs[t] = d.slice(o + 4, o + 4 + l);
        o += 4 + l + (4 - l % 4) % 4;
    }
    return { type: dv.getUint16(0), attrs };
};

const turnParseErr = d => (d?.length >= 4 ? (d[2] & 7) * 100 + d[3] : 0);

const turnAddIntegrity = async (m, key) => {
    const c = new Uint8Array(m);
    const d = new DataView(c.buffer);
    d.setUint16(2, d.getUint16(2) + 24);
    const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    return turnCat(c, turnStunAttr(TURN_AT.MI, new Uint8Array(await crypto.subtle.sign('HMAC', k, c))));
};

const turnReadStun = async (rd, buf) => {
    let b = buf ?? new Uint8Array(0);
    const pull = async () => {
        const { done, value } = await rd.read();
        if (done) throw new Error('TURN stream closed');
        b = turnCat(b, new Uint8Array(value));
    };
    try {
        while (b.length < 20) await pull();
        const n = 20 + ((b[2] << 8) | b[3]);
        while (b.length < n) await pull();
        return [turnParseStun(b.subarray(0, n)), b.length > n ? b.subarray(n) : null];
    } catch {
        return [null, null];
    }
};

const turnMd5 = async s => new Uint8Array(await crypto.subtle.digest('MD5', new TextEncoder().encode(s)));

async function connect2Turn(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port, username: user, password: pass } = proxyConfig;
    const targetIp = await resolveDnsA(targetHost);
    if (!targetIp) throw new Error(`TURN DNS resolution failed for: ${targetHost}`);

    let ctrl = null, data = null;
    let isClosed = false;
    let closedResolve;
    const closedPromise = new Promise(resolve => { closedResolve = resolve; });

    const closeAll = () => {
        if (isClosed) return;
        isClosed = true;
        try { ctrl?.close(); } catch {}
        try { data?.close(); } catch {}
        closedResolve();
    };

    try {
        ctrl = connect({ hostname: host, port: port || 3478 });
        await ctrl.opened;
        const cw = ctrl.writable.getWriter();
        const cr = ctrl.readable.getReader();
        const tid = () => crypto.getRandomValues(new Uint8Array(12));
        const tp = new Uint8Array([6, 0, 0, 0]);

        await cw.write(turnStunMsg(TURN_MT.AQ, tid(), [turnStunAttr(TURN_AT.TRANSPORT, tp)]));
        let [r, ex] = await turnReadStun(cr);
        if (!r) throw new Error('TURN Allocate request failed');

        let key = null, aa = [];
        const sign = m => (key ? turnAddIntegrity(m, key) : m);
        const peer = turnStunAttr(TURN_AT.PEER, turnXorPeer(targetIp, targetPort));

        if (r.type === TURN_MT.AE && user && turnParseErr(r.attrs[TURN_AT.ERR]) === 401) {
            const dec = new TextDecoder();
            const realm = dec.decode(r.attrs[TURN_AT.REALM] ?? new Uint8Array(0));
            const nonce = r.attrs[TURN_AT.NONCE] ?? new Uint8Array(0);
            key = await turnMd5(`${user}:${realm}:${pass}`);
            aa = [
                turnStunAttr(TURN_AT.USER, new TextEncoder().encode(user)),
                turnStunAttr(TURN_AT.REALM, new TextEncoder().encode(realm)),
                turnStunAttr(TURN_AT.NONCE, nonce)
            ];
            const [am, pm, cm] = await Promise.all([
                sign(turnStunMsg(TURN_MT.AQ, tid(), [turnStunAttr(TURN_AT.TRANSPORT, tp), ...aa])),
                sign(turnStunMsg(TURN_MT.PQ, tid(), [peer, ...aa])),
                sign(turnStunMsg(TURN_MT.CQ, tid(), [peer, ...aa]))
            ]);
            await cw.write(turnCat(am, pm, cm));
            data = connect({ hostname: host, port: port || 3478 });
            [r, ex] = await turnReadStun(cr, ex);
            if (r?.type !== TURN_MT.AO) throw new Error('TURN Allocate authentication failed');
        } else if (r.type === TURN_MT.AO) {
            const [pm, cm] = await Promise.all([
                sign(turnStunMsg(TURN_MT.PQ, tid(), [peer, ...aa])),
                sign(turnStunMsg(TURN_MT.CQ, tid(), [peer, ...aa]))
            ]);
            await cw.write(turnCat(pm, cm));
            data = connect({ hostname: host, port: port || 3478 });
        } else {
            throw new Error('TURN unexpected response type: ' + r.type);
        }

        [r, ex] = await turnReadStun(cr, ex);
        if (r?.type !== TURN_MT.PO) throw new Error('TURN CreatePermission failed');
        [r, ex] = await turnReadStun(cr, ex);
        if (r?.type !== TURN_MT.CO || !r.attrs[TURN_AT.CONNID]) throw new Error('TURN Connect failed');

        await data.opened;
        const dw = data.writable.getWriter();
        const dr = data.readable.getReader();
        await dw.write(await sign(turnStunMsg(TURN_MT.BQ, tid(), [turnStunAttr(TURN_AT.CONNID, r.attrs[TURN_AT.CONNID]), ...aa])));
        let extra;
        [r, extra] = await turnReadStun(dr);
        if (r?.type !== TURN_MT.BO) throw new Error('TURN ConnectionBind failed');

        cr.releaseLock();
        cw.releaseLock();
        dw.releaseLock();

        const readable = new ReadableStream({
            start(c) {
                if (extra?.length) c.enqueue(extra);
            },
            pull(c) {
                return dr.read().then(({ done, value }) => {
                    if (done) {
                        c.close();
                        closeAll();
                    } else {
                        c.enqueue(new Uint8Array(value));
                    }
                });
            },
            cancel() {
                dr.cancel().catch(() => {});
                closeAll();
            }
        });

        if (initialData && initialData.byteLength > 0) {
            const writer = data.writable.getWriter();
            await writer.write(initialData);
            writer.releaseLock();
        }

        return {
            readable,
            writable: data.writable,
            close: closeAll,
            closed: closedPromise
        };
    } catch (err) {
        closeAll();
        throw err;
    }
}

async function forwardataTCP(host, portNum, rawData, ws, respHeader, remoteConnWrapper, customProxyIP, request) {
    async function connectDirect(address, port, data, concur = GRAIN_CFG.concur) {
        const connector = getSocketConnector(request);
        const sock = await raceSprout(connector, address, port, concur);
        if (data && data.byteLength > 0) {
            const writer = sock.writable.getWriter();
            try {
                await writer.write(data);
            } finally {
                writer.releaseLock();
            }
        }
        return sock;
    }
    
    let proxyConfig = null;
    let shouldUseProxy = false;
    if (customProxyIP) {
        if (/^\d+$/.test(customProxyIP.trim())) {
            const idx = parseInt(customProxyIP.trim(), 10);
            const list = (Array.isArray(proxyIPs) && proxyIPs.length > 0) ? proxyIPs : (proxyIP ? [proxyIP] : []);
            if (list[idx]) {
                let raw = list[idx].trim();
                if (raw.includes('#')) raw = raw.split('#')[0].trim();
                customProxyIP = raw.replace(/^(?:ld|fd|proxyip)=/i, '').trim();
            }
        }
        proxyConfig = parsePryAddress(customProxyIP);
        if (proxyConfig && (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https' || proxyConfig.type === 'sstp' || proxyConfig.type === 'turn')) {
            shouldUseProxy = true;
        } else if (!proxyConfig) {
            proxyConfig = parsePryAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        }
    } else {
        proxyConfig = parsePryAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        if (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https' || proxyConfig.type === 'sstp' || proxyConfig.type === 'turn') {
            shouldUseProxy = true;
        }
    }
    
    async function connecttoPry() {
        let newSocket;
        if (proxyConfig.type === 'socks5') {
            newSocket = await connect2Socks5(proxyConfig, host, portNum, rawData);
        } else if (proxyConfig.type === 'http' || proxyConfig.type === 'https') {
            newSocket = await connect2Http(proxyConfig, host, portNum, rawData);
        } else if (proxyConfig.type === 'sstp') {
            newSocket = await connect2Sstp(proxyConfig, host, portNum, rawData);
        } else if (proxyConfig.type === 'turn') {
            newSocket = await connect2Turn(proxyConfig, host, portNum, rawData);
        } else {
            newSocket = await connectDirect(proxyConfig.host, proxyConfig.port, rawData, 1);
        }
        
        remoteConnWrapper.socket = newSocket;
        newSocket.closed?.catch(() => {}).finally(() => closeSocketQuietly(ws));
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
            const initialSocket = await connectDirect(host, portNum, rawData, GRAIN_CFG.concur);
            remoteConnWrapper.socket = initialSocket;
            connectStreams(initialSocket, ws, respHeader, connecttoPry);
        } catch (err) {
            remoteConnWrapper.socket = null;
            await connecttoPry();
        }
    }
}

function parseVLsPacketHeader(chunk, token, tokenBytes) {
    if (chunk.byteLength < 24) return { hasError: true, message: 'Invalid data' };
    const version = new Uint8Array(chunk.slice(0, 1));
    const chunkView = new Uint8Array(chunk);
    if (tokenBytes) {
        if (!matchUUID(chunkView, 1, tokenBytes)) return { hasError: true, message: 'Invalid uuid' };
    } else {
        if (formatIdentifier(chunkView.slice(1, 17)) !== token) return { hasError: true, message: 'Invalid uuid' };
    }
    const optLen = chunkView[17];
    const cmd = chunkView[18 + optLen];
    let isUDP = false;
    if (cmd === 1) {} else if (cmd === 2) { isUDP = true; } else { return { hasError: true, message: 'Invalid command' }; }
    const portIdx = 19 + optLen;
    const port = new DataView(chunk.slice(portIdx, portIdx + 2)).getUint16(0);
    let addrIdx = portIdx + 2, addrLen = 0, addrValIdx = addrIdx + 1, hostname = '';
    const addressType = chunkView[addrIdx];
    switch (addressType) {
        case 1: 
            addrLen = 4; 
            hostname = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + addrLen)).join('.'); 
            break;
        case 2: 
            addrLen = chunkView[addrValIdx]; 
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

    function sendChunk(data) {
        hasData = true;
        if (webSocket.readyState !== WS_READY_STATE_OPEN) {
            throw new Error('ws.readyState is not open');
        }
        if (header) {
            const combined = new Uint8Array(header.length + data.byteLength);
            combined.set(header, 0);
            combined.set(data, header.length);
            webSocket.send(combined.buffer);
            header = null;
        } else {
            webSocket.send(data);
        }
    }

    const tx = mkDn(webSocket, sendChunk);
    const rd = remoteSocket?.readable;
    if (!rd) {
        closeSocketQuietly(webSocket);
        if (!hasData && retryFunc) await retryFunc();
        return;
    }

    let r = null;
    let isByob = true;
    try {
        r = rd.getReader({ mode: 'byob' });
    } catch (e) {
        isByob = false;
        r = rd.getReader();
    }

    let buf = isByob ? new ArrayBuffer(GRAIN_CFG.chunk) : null;
    try {
        for (;;) {
            if (webSocket.readyState !== WS_READY_STATE_OPEN) break;
            let done, v;
            if (isByob) {
                const res = await r.read(new Uint8Array(buf, 0, GRAIN_CFG.chunk));
                done = res.done;
                v = res.value;
            } else {
                const res = await r.read();
                done = res.done;
                v = res.value;
            }
            if (done) break;
            if (!v?.byteLength) continue;

            // 大包 (>= 32KB): 直发并换新 Buffer
            if (v.byteLength >= (GRAIN_CFG.chunk >> 1)) {
                tx.reap();
                sendChunk(v);
                if (isByob) buf = new ArrayBuffer(GRAIN_CFG.chunk);
            } else {
                // 小包 (< 32KB): 聚合发出
                tx.send(v.slice());
                if (isByob) buf = v.buffer;
            }
        }
        tx.reap();
    } catch (err) {
        closeSocketQuietly(webSocket);
    } finally {
        try { tx.reap(); } catch (e) {}
        try { r?.releaseLock(); } catch (e) {}
    }

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
                <a href="https://github.com/zaofengyue/CF-Workers-VLESS" target="_blank" class="footer-link">
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

            <!-- ProxyIP / 落地出站设置 (支持填写多个，每行一个) -->
            <div class="config-card">
                <h3><i class="fas fa-server"></i> 出站落地代理设置 (支持填写多个，每行一个)</h3>
                <div class="form-group">
                    <label for="cfg-proxyip">出站代理列表 (支持 #备注名，生成节点总数 = 优选CDN × 协议数 × 落地数)</label>
                    <textarea id="cfg-proxyip" class="form-textarea" rows="4" placeholder="支持每行一个，支持 #备注名，例如：&#10;proxy.xxxxxxxx.tk:50001#直连落地&#10;socks5://user:pass@1.2.3.4:1080#香港S5&#10;http://user:pass@5.6.7.8:8080#日本HTTP&#10;sstp://vpn:vpn@domain:443#美国SSTP">${Array.isArray(config.proxyIPs) && config.proxyIPs.length > 0 ? config.proxyIPs.join('\n') : (config.proxyIP || '')}</textarea>
                    <span class="form-hint">支持：<code>IP:端口#备注</code>、<code>域名:端口#备注</code>、<code>socks5://user:pass@host:port#备注</code>、<code>http://user:pass@host:port#备注</code>、<code>sstp://host:port#备注</code>、<code>turn://user:pass@host:port#备注</code><br>当填写多个落地代理时，生成的节点数量将自动倍增，并在节点名称与连接路径中自动匹配对应落地代理。</span>
                </div>
            </div>

            <!-- 优选节点列表 -->
            <div class="config-card">
                <h3><i class="fas fa-bolt"></i> 优选 CDN 域名、IP 列表或远程订阅链接 (每行一个)</h3>
                <div class="form-group">
                    <textarea id="cfg-cfip" class="form-textarea" rows="7" placeholder="格式支持:&#10;优选域名:端口#名称&#10;优选IP:端口#名称&#10;[IPv6]:端口#名称&#10;https://gist.githubusercontent.com/.../raw/... (远程文本订阅链接)">${config.cfip.join('\n')}</textarea>
                    <span class="form-hint">支持填入 <code>优选域名:端口#节点名称</code>、<code>优选IP:端口#名称</code>，或直接填入 <code>https://...</code> 远程文本订阅/Gist Raw 链接（将自动抓取展开合并到订阅中）</span>
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
                <a href="https://github.com/zaofengyue/CF-Workers-VLESS" target="_blank" class="footer-link">
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
            const proxyRaw = document.getElementById('cfg-proxyip').value;
            const proxyList = proxyRaw.split('\\n').map(s => s.trim()).filter(Boolean);
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
                proxyIP: proxyList[0] || '',
                proxyIPs: proxyList,
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
