// Shadowsocks Cloudflare Worker 增强版
// 支持 18 种 Shadowsocks 加密方法（AEAD、Shadowsocks 2022、经典流密码、none/plain）
// 具备完整多级代理容灾（Direct -> ProxyIP -> SOCKS5/HTTP 降级）、Web 订阅中心与环境变量动态配置
import { connect } from 'cloudflare:sockets';

let subPath = 'link';     // 节点订阅路径,不修改将使用UUID作为订阅路径
let proxyIP = 'proxy.xxxxxxxx.tk:50001';  // proxyIP 格式：ip、域名、ip:port、域名:port等,没填写port，默认使用443,也可以是socks5
let password = '5dc15e15-f285-4a9d-959b-0e4fbdd77b63';  // 节点UUID / 密码
let ssMethod = 'aes-256-gcm'; // 加密方式: none, aes-128-gcm, aes-256-gcm, chacha20-ietf-poly1305, 2022-blake3-aes-128-gcm, 2022-blake3-aes-256-gcm 等
let ssPsk = '';              // Shadowsocks 2022 模式下的预共享密钥 (Base64), 为空时由 password 自动派生
let SSpath = '';          // 路径验证，为空则使用UUID作为验证路径

// ------------------------- 密码学支持库与 Shadowsocks 协议栈 -------------------------
const C = { 
    none: { k: 16, iv: 0, aead: 0, s: 0, none: 1 }, 
    plain: { k: 16, iv: 0, aead: 0, s: 0, none: 1 }, 
    'aes-128-gcm': { k: 16, iv: 16, aead: 1, tag: 16 }, 
    'aes-192-gcm': { k: 24, iv: 24, aead: 1, tag: 16 }, 
    'aes-256-gcm': { k: 32, iv: 32, aead: 1, tag: 16 }, 
    'chacha20-ietf-poly1305': { k: 32, iv: 32, aead: 1, tag: 16, cc: 1 }, 
    'xchacha20-ietf-poly1305': { k: 32, iv: 32, aead: 1, tag: 16, xc: 1 }, 
    'chacha20-ietf': { k: 32, iv: 12, s: 1, st: 'cc' }, 
    'xchacha20': { k: 32, iv: 24, s: 1, st: 'xc' }, 
    'aes-128-ctr': { k: 16, iv: 16, s: 1, st: 'ctr' }, 
    'aes-192-ctr': { k: 24, iv: 16, s: 1, st: 'ctr' }, 
    'aes-256-ctr': { k: 32, iv: 16, s: 1, st: 'ctr' }, 
    'aes-128-cfb': { k: 16, iv: 16, s: 1, st: 'cfb' }, 
    'aes-192-cfb': { k: 24, iv: 16, s: 1, st: 'cfb' }, 
    'aes-256-cfb': { k: 32, iv: 16, s: 1, st: 'cfb' }, 
    'rc4-md5': { k: 16, iv: 16, s: 1, st: 'rc4' }, 
    '2022-blake3-aes-128-gcm': { k: 16, iv: 16, aead: 1, tag: 16, b3: 1 }, 
    '2022-blake3-aes-256-gcm': { k: 32, iv: 32, aead: 1, tag: 16, b3: 1 }, 
    '2022-blake3-chacha20-poly1305': { k: 32, iv: 32, aead: 1, tag: 16, b3: 1, cc: 1 } 
};

const enc = new TextEncoder();
const dec = new TextDecoder();
const CC = new Uint32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);
const rotl = (a, b) => ((a << b) | (a >>> (32 - b))) >>> 0;
const rotr = (a, b) => ((a >>> b) | (a << (32 - b))) >>> 0;
const qr = (x, a, b, c, d) => { 
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 16); 
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 12); 
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 8); 
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 7); 
};
const cat = (...xs) => { 
    const r = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); 
    let o = 0; 
    for (const x of xs) { r.set(x, o); o += x.length; } 
    return r; 
};
const pushBuf = (b, d) => b.length ? cat(b, d) : d;
const u16be = (d, o) => (d[o] << 8) | d[o + 1];
const put16 = (d, o, v) => { d[o] = (v >> 8) & 255; d[o + 1] = v & 255; };
const Z16 = new Uint8Array(16);
const Z20 = new Uint8Array(20);

const ccRounds = w => { 
    for (let i = 0; i < 10; i++) { 
        qr(w, 0, 4, 8, 12); qr(w, 1, 5, 9, 13); qr(w, 2, 6, 10, 14); qr(w, 3, 7, 11, 15); 
        qr(w, 0, 5, 10, 15); qr(w, 1, 6, 11, 12); qr(w, 2, 7, 8, 13); qr(w, 3, 4, 9, 14); 
    } 
};
const ccBlk = (key, ctr, nonce) => { 
    const s = new Uint32Array(16);
    const kv = new DataView(key.buffer, key.byteOffset, 32);
    const nv = new DataView(nonce.buffer, nonce.byteOffset, nonce.length); 
    s.set(CC); 
    for (let i = 0; i < 8; i++) s[4 + i] = kv.getUint32(i * 4, true); 
    s[12] = ctr; 
    if (nonce.length === 12) { 
        s[13] = nv.getUint32(0, true); s[14] = nv.getUint32(4, true); s[15] = nv.getUint32(8, true); 
    } else { 
        s[13] = 0; s[14] = nv.getUint32(0, true); s[15] = nv.getUint32(4, true); 
    } 
    const w = new Uint32Array(s); 
    ccRounds(w); 
    for (let i = 0; i < 16; i++) w[i] = (w[i] + s[i]) >>> 0; 
    return new Uint8Array(w.buffer); 
};
const hcc = (key, n16) => { 
    const s = new Uint32Array(16);
    const kv = new DataView(key.buffer, key.byteOffset, 32);
    const nv = new DataView(n16.buffer, n16.byteOffset, 16); 
    s.set(CC); 
    for (let i = 0; i < 8; i++) s[4 + i] = kv.getUint32(i * 4, true); 
    for (let i = 0; i < 4; i++) s[12 + i] = nv.getUint32(i * 4, true); 
    const w = new Uint32Array(s); 
    ccRounds(w); 
    const o = new Uint8Array(32);
    const ov = new DataView(o.buffer); 
    ov.setUint32(0, w[0], true); ov.setUint32(4, w[1], true); ov.setUint32(8, w[2], true); ov.setUint32(12, w[3], true); 
    ov.setUint32(16, w[12], true); ov.setUint32(20, w[13], true); ov.setUint32(24, w[14], true); ov.setUint32(28, w[15], true); 
    return o; 
};
const ccStrm = (key, nonce, data, ctr = 0) => { 
    const o = new Uint8Array(data.length); 
    for (let i = 0, c = ctr; i < data.length; i += 64, c++) { 
        const b = ccBlk(key, c, nonce); 
        for (let j = 0; j < 64 && i + j < data.length; j++) o[i + j] = data[i + j] ^ b[j]; 
    } 
    return o; 
};
const xcStrm = (key, n24, data, ctr = 0) => { 
    const sk = hcc(key, n24.subarray(0, 16));
    const sn = new Uint8Array(12); 
    sn.set(n24.subarray(16, 24), 4); 
    return ccStrm(sk, sn, data, ctr); 
};
const poly = (key, msg) => { 
    const r = new Uint32Array(5), h = new Uint32Array(5);
    const kv = new DataView(key.buffer, key.byteOffset, 32); 
    r[0] = kv.getUint32(0, true) & 0x3ffffff; 
    r[1] = (kv.getUint32(3, true) >>> 2) & 0x3ffff03; 
    r[2] = (kv.getUint32(6, true) >>> 4) & 0x3ffc0ff; 
    r[3] = (kv.getUint32(9, true) >>> 6) & 0x3f03fff; 
    r[4] = (kv.getUint32(12, true) >>> 8) & 0x00fffff; 
    const pad = [kv.getUint32(16, true), kv.getUint32(20, true), kv.getUint32(24, true), kv.getUint32(28, true)]; 
    for (let i = 0; i < msg.length; i += 16) { 
        const ck = msg.subarray(i, Math.min(i + 16, msg.length));
        const buf = new Uint8Array(17); 
        buf.set(ck); 
        buf[ck.length] = 1; 
        const bv = new DataView(buf.buffer);
        const n = [
            bv.getUint32(0, true) & 0x3ffffff, 
            (bv.getUint32(3, true) >>> 2) & 0x3ffffff, 
            (bv.getUint32(6, true) >>> 4) & 0x3ffffff, 
            (bv.getUint32(9, true) >>> 6) & 0x3ffffff, 
            ck.length < 16 ? 0 : ((bv.getUint32(12, true) >>> 8) | (1 << 24))
        ]; 
        for (let j = 0; j < 5; j++) h[j] = (h[j] + n[j]) >>> 0; 
        const d = new BigUint64Array(5); 
        for (let j = 0; j < 5; j++) {
            for (let k = 0; k < 5; k++) {
                d[j] += BigInt(h[k]) * (k <= j ? BigInt(r[j - k]) : BigInt(r[j - k + 5]) * 5n); 
            }
        }
        let c = 0n; 
        for (let j = 0; j < 5; j++) { 
            d[j] += c; 
            h[j] = Number(d[j] & 0x3ffffffn); 
            c = d[j] >> 26n; 
        } 
        h[0] += Number(c) * 5; 
    } 
    let c = h[0] >>> 26; h[0] &= 0x3ffffff; 
    for (let i = 1; i < 5; i++) { h[i] += c; c = h[i] >>> 26; h[i] &= 0x3ffffff; } 
    h[0] += c * 5; c = h[0] >>> 26; h[0] &= 0x3ffffff; h[1] += c; 
    const g = new Uint32Array(5); c = 5; 
    for (let i = 0; i < 5; i++) { g[i] = h[i] + c; c = g[i] >>> 26; g[i] &= 0x3ffffff; } 
    g[4] -= (1 << 26); 
    const m = (g[4] >>> 31) - 1; 
    for (let i = 0; i < 5; i++) h[i] = (h[i] & ~m) | (g[i] & m); 
    const f = new Uint32Array(4); 
    f[0] = (h[0] | (h[1] << 26)) >>> 0; 
    f[1] = ((h[1] >>> 6) | (h[2] << 20)) >>> 0; 
    f[2] = ((h[2] >>> 12) | (h[3] << 14)) >>> 0; 
    f[3] = ((h[3] >>> 18) | (h[4] << 8)) >>> 0; 
    let carry = 0n; 
    for (let i = 0; i < 4; i++) { 
        const sum = BigInt(f[i]) + BigInt(pad[i]) + carry; 
        f[i] = Number(sum & 0xffffffffn); 
        carry = sum >> 32n; 
    } 
    return new Uint8Array(f.buffer); 
};
const polyKey = (key, nonce, xc) => { 
    if (!xc) return ccBlk(key, 0, nonce).subarray(0, 32); 
    const sk = hcc(key, nonce.subarray(0, 16));
    const sn = new Uint8Array(12); 
    sn.set(nonce.subarray(16, 24), 4); 
    return ccBlk(sk, 0, sn).subarray(0, 32); 
};
const polyTag = (pk, ct) => { 
    const pc = new Uint8Array(Math.ceil(ct.length / 16) * 16); 
    pc.set(ct); 
    const md = new Uint8Array(pc.length + 16); 
    md.set(pc); 
    const dv = new DataView(md.buffer); 
    dv.setBigUint64(pc.length, 0n, true); 
    dv.setBigUint64(pc.length + 8, BigInt(ct.length), true); 
    return poly(pk, md); 
};
const eq16 = (a, b) => { 
    let x = 0; 
    for (let i = 0; i < 16; i++) x |= a[i] ^ b[i]; 
    return x === 0; 
};
const ccEnc = (key, nonce, pt, xc) => { 
    const ct = (xc ? xcStrm : ccStrm)(key, nonce, pt, 1); 
    return cat(ct, polyTag(polyKey(key, nonce, xc), ct)); 
};
const ccDec = (key, nonce, data, xc) => { 
    if (data.length < 16) return null; 
    const ct = data.subarray(0, data.length - 16);
    const tag = data.subarray(data.length - 16); 
    return eq16(tag, polyTag(polyKey(key, nonce, xc), ct)) ? (xc ? xcStrm : ccStrm)(key, nonce, ct, 1) : null; 
};

const B3IV = new Uint32Array([0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19]);
const B3P = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];
const b3c = (cv, blk, blen, ctr, fl) => { 
    const v = new Uint32Array(16); 
    v.set(cv.slice(0, 8)); 
    v.set(B3IV, 8); 
    v[12] = ctr & 0xFFFFFFFF; 
    v[13] = (ctr / 0x100000000) >>> 0; 
    v[14] = blen; 
    v[15] = fl; 
    let m = new Uint32Array(16); 
    for (let i = 0; i < 16; i++) m[i] = blk[i * 4] | (blk[i * 4 + 1] << 8) | (blk[i * 4 + 2] << 16) | (blk[i * 4 + 3] << 24); 
    const g = (a, b, c, d, mx, my) => { 
        v[a] = (v[a] + v[b] + mx) >>> 0; v[d] = rotr(v[d] ^ v[a], 16); 
        v[c] = (v[c] + v[d]) >>> 0; v[b] = rotr(v[b] ^ v[c], 12); 
        v[a] = (v[a] + v[b] + my) >>> 0; v[d] = rotr(v[d] ^ v[a], 8); 
        v[c] = (v[c] + v[d]) >>> 0; v[b] = rotr(v[b] ^ v[c], 7); 
    }; 
    for (let r = 0; r < 7; r++) { 
        g(0, 4, 8, 12, m[0], m[1]); g(1, 5, 9, 13, m[2], m[3]); g(2, 6, 10, 14, m[4], m[5]); g(3, 7, 11, 15, m[6], m[7]); 
        g(0, 5, 10, 15, m[8], m[9]); g(1, 6, 11, 12, m[10], m[11]); g(2, 7, 8, 13, m[12], m[13]); g(3, 4, 9, 14, m[14], m[15]); 
        const pm = new Uint32Array(16); 
        for (let i = 0; i < 16; i++) pm[i] = m[B3P[i]]; 
        m = pm; 
    } 
    for (let i = 0; i < 8; i++) cv[i] = v[i] ^ v[i + 8]; 
};
const b3k = (ctx, km, len = 32) => { 
    const cb = enc.encode(ctx);
    const cblk = new Uint8Array(64); 
    cblk.set(cb.subarray(0, 64)); 
    const cv1 = new Uint32Array(B3IV); 
    b3c(cv1, cblk, Math.min(cb.length, 64), 0, 0x2B); 
    const kblk = new Uint8Array(64); 
    kblk.set(km.subarray(0, 64)); 
    const cv2 = new Uint32Array(cv1); 
    b3c(cv2, kblk, Math.min(km.length, 64), 0, 0x4B); 
    return new Uint8Array(cv2.buffer).slice(0, len); 
};
const evp = async (pw, kl) => { 
    const p = enc.encode(pw); 
    let k = new Uint8Array(0), pv = new Uint8Array(0); 
    while (k.length < kl) { 
        const d = new Uint8Array(pv.length + p.length); 
        d.set(pv); 
        d.set(p, pv.length); 
        pv = new Uint8Array(await crypto.subtle.digest('MD5', d)); 
        const nk = new Uint8Array(k.length + pv.length); 
        nk.set(k); 
        nk.set(pv, k.length); 
        k = nk; 
    } 
    return k.slice(0, kl); 
};
const hkdf = async (ikm, salt, info, len) => { 
    const k1 = await crypto.subtle.importKey('raw', salt.length ? salt : Z20, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const prk = new Uint8Array(await crypto.subtle.sign('HMAC', k1, ikm));
    const k2 = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const okm = new Uint8Array(Math.ceil(len / 20) * 20); 
    let pv = new Uint8Array(0); 
    for (let i = 0; i < Math.ceil(len / 20); i++) { 
        const inp = cat(pv, info, new Uint8Array([i + 1])); 
        pv = new Uint8Array(await crypto.subtle.sign('HMAC', k2, inp)); 
        okm.set(pv, i * 20); 
    } 
    return okm.slice(0, len); 
};
const sesKey = async (mk, salt, info) => info.b3 ? b3k("shadowsocks 2022 session subkey", cat(mk, salt), info.k) : await hkdf(mk, salt, enc.encode('ss-subkey'), info.k);

class AEAD { 
    constructor(key, info) { 
        this.key = key; 
        this.info = info; 
        this.nonce = new Uint8Array(info.cc ? 12 : info.xc ? 24 : 12); 
        this.ck = null; 
    } 
    async init() { 
        if (!this.info.cc && !this.info.xc) {
            this.ck = await crypto.subtle.importKey('raw', this.key, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); 
        }
    } 
    inc() { 
        for (let i = 0; i < this.nonce.length; i++) { 
            this.nonce[i]++; 
            if (this.nonce[i]) break; 
        } 
    } 
    async enc(d) { 
        let c; 
        if (this.info.cc) c = ccEnc(this.key, this.nonce, d, false); 
        else if (this.info.xc) c = ccEnc(this.key, this.nonce, d, true); 
        else c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: this.nonce, tagLength: 128 }, this.ck, d)); 
        this.inc(); 
        return c; 
    } 
    async dec(d) { 
        try { 
            let p; 
            if (this.info.cc) { 
                p = ccDec(this.key, this.nonce, d, false); 
                if (!p) return null; 
            } else if (this.info.xc) { 
                p = ccDec(this.key, this.nonce, d, true); 
                if (!p) return null; 
            } else {
                p = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.nonce, tagLength: 128 }, this.ck, d)); 
            }
            this.inc(); 
            return p; 
        } catch { 
            return null; 
        } 
    } 
}

class Strm {
    constructor(key, iv, info, isEnc) { 
        this.key = key; 
        this.iv = new Uint8Array(iv); 
        this.info = info; 
        this.isEnc = isEnc; 
        this.ctr = 0; 
        this.pos = 0; 
        this.rc4s = null; 
        this.rc4i = 0; 
        this.rc4j = 0; 
        this.ks = null; 
        this.ksPos = 0; 
        this.ak = null; 
        this.xk = this.xn = this.b32 = null; 
        if (info.st === 'xc') { 
            this.xk = hcc(this.key, this.iv.subarray(0, 16)); 
            this.xn = new Uint8Array(12); 
            this.xn.set(this.iv.subarray(16, 24), 4); 
        } 
    }
    _cfbBlk() { 
        const b = this.b32 ??= new Uint8Array(32); 
        b.fill(0); 
        b.set(this.iv); 
        return b; 
    }
    async crypt(d) { 
        const { st } = this.info;
        if (st === 'cc' || st === 'xc') { 
            const o = new Uint8Array(d.length); 
            let di = 0; 
            while (di < d.length && this.ks && this.ksPos < 64) { 
                o[di] = d[di] ^ this.ks[this.ksPos]; 
                di++; this.ksPos++; 
            } 
            if (di >= d.length) return o; 
            const rem = d.subarray(di);
            const key = st === 'xc' ? this.xk : this.key;
            const iv = st === 'xc' ? this.xn : this.iv;
            const e = ccStrm(key, iv, rem, this.ctr); 
            o.set(e, di); 
            const bu = Math.ceil(rem.length / 64); 
            this.ctr += bu; 
            if (rem.length % 64) { 
                this.ks = ccBlk(key, this.ctr - 1, iv); 
                this.ksPos = rem.length % 64; 
            } else { 
                this.ks = null; this.ksPos = 0; 
            } 
            return o; 
        }
        if (st === 'ctr') { 
            const ak = await (this.ak ??= crypto.subtle.importKey('raw', this.key, { name: 'AES-CTR' }, false, ['encrypt']));
            const o = new Uint8Array(d.length); 
            let di = 0; 
            while (di < d.length && this.ks && this.ksPos < 16) { 
                o[di] = d[di] ^ this.ks[this.ksPos]; 
                di++; this.ksPos++; 
                this.pos++; 
            } 
            if (di >= d.length) return o; 
            const ctrVal = new Uint8Array(this.iv); 
            let carry = Math.floor(this.pos / 16); 
            for (let i = 15; i >= 0 && carry > 0; i--) { 
                const sum = ctrVal[i] + (carry & 0xff); 
                ctrVal[i] = sum & 0xff; 
                carry = (carry >> 8) + (sum >> 8); 
            } 
            const rem = d.subarray(di);
            const e = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CTR', counter: ctrVal, length: 128 }, ak, rem)); 
            o.set(e, di); 
            this.pos += rem.length; 
            if (rem.length % 16) { 
                const lc = new Uint8Array(this.iv); 
                let c2 = Math.floor((this.pos - 1) / 16); 
                for (let i = 15; i >= 0 && c2 > 0; i--) { 
                    const sum = lc[i] + (c2 & 0xff); 
                    lc[i] = sum & 0xff; 
                    c2 = (c2 >> 8) + (sum >> 8); 
                } 
                this.ks = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CTR', counter: lc, length: 128 }, ak, Z16)); 
                this.ksPos = rem.length % 16; 
            } else { 
                this.ks = null; this.ksPos = 0; 
            } 
            return o; 
        }
        if (st === 'cfb') { 
            const ak = await (this.ak ??= crypto.subtle.importKey('raw', this.key, { name: 'AES-CBC' }, false, ['encrypt']));
            const o = new Uint8Array(d.length); 
            let di = 0; 
            while (di < d.length && this.ks && this.ksPos < 16) { 
                const ct = d[di] ^ this.ks[this.ksPos]; 
                o[di] = ct; 
                this.iv[this.ksPos] = this.isEnc ? ct : d[di]; 
                di++; this.ksPos++; 
            } 
            while (di + 16 <= d.length) { 
                const e = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: Z16 }, ak, this._cfbBlk())).subarray(0, 16); 
                for (let j = 0; j < 16; j++) { 
                    o[di + j] = d[di + j] ^ e[j]; 
                    this.iv[j] = this.isEnc ? o[di + j] : d[di + j]; 
                } 
                di += 16; 
            } 
            if (di < d.length) { 
                this.ks = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: Z16 }, ak, this._cfbBlk())).subarray(0, 16); 
                this.ksPos = 0; 
                while (di < d.length) { 
                    const ct = d[di] ^ this.ks[this.ksPos]; 
                    o[di] = ct; 
                    this.iv[this.ksPos] = this.isEnc ? ct : d[di]; 
                    di++; this.ksPos++; 
                } 
            } else { 
                this.ks = null; this.ksPos = 0; 
            } 
            return o; 
        }
        if (st === 'rc4') { 
            if (!this.rc4s) { 
                const rk = new Uint8Array(await crypto.subtle.digest('MD5', new Uint8Array([...this.key, ...this.iv]))); 
                this.rc4s = new Uint8Array(256); 
                for (let i = 0; i < 256; i++) this.rc4s[i] = i; 
                let j = 0; 
                for (let i = 0; i < 256; i++) { 
                    j = (j + this.rc4s[i] + rk[i % rk.length]) & 255; 
                    [this.rc4s[i], this.rc4s[j]] = [this.rc4s[j], this.rc4s[i]]; 
                } 
            } 
            const o = new Uint8Array(d.length); 
            let x = this.rc4i, j = this.rc4j; 
            for (let k = 0; k < d.length; k++) { 
                x = (x + 1) & 255; 
                j = (j + this.rc4s[x]) & 255; 
                [this.rc4s[x], this.rc4s[j]] = [this.rc4s[j], this.rc4s[x]]; 
                o[k] = d[k] ^ this.rc4s[(this.rc4s[x] + this.rc4s[j]) & 255]; 
            } 
            this.rc4i = x; this.rc4j = j; 
            return o; 
        } 
        return d; 
    } 
}

class SS { 
    constructor(cfg) { 
        this.cfg = cfg || { pw: password, psk: ssPsk, method: ssMethod };
        this.I = C[this.cfg.method] || C['none'];
        this.dec = null; 
        this.enc = null; 
        this.mk = null; 
        this.buf = new Uint8Array(0); 
        this.plen = -1; 
        this.hdr = false; 
        this.sdec = null; 
        this.senc = null; 
        this.csalt = null; 
    }
    async init() { 
        const I = this.I;
        if (I.none) return;
        if (I.b3) {
            try { 
                this.mk = Uint8Array.from(atob(this.cfg.psk), c => c.charCodeAt(0)); 
            } catch { 
                this.mk = enc.encode(this.cfg.psk).slice(0, I.k); 
            }
        } else {
            this.mk = await evp(this.cfg.pw, I.k);
        }
    }
    async decData(data) { 
        const I = this.I;
        this.buf = pushBuf(this.buf, data); 
        const out = [];
        if (I.none) { 
            const r = this.buf; 
            this.buf = new Uint8Array(0); 
            return { c: [r] }; 
        }
        if (I.s) { 
            if (!this.sdec) { 
                if (this.buf.length < I.iv) return { c: [] }; 
                this.sdec = new Strm(this.mk, this.buf.slice(0, I.iv), I, false); 
                this.buf = this.buf.slice(I.iv); 
            } 
            if (this.buf.length > 0) { 
                const d = await this.sdec.crypt(this.buf); 
                this.buf = new Uint8Array(0); 
                return { c: [d] }; 
            } 
            return { c: [] }; 
        }
        if (!this.dec) { 
            if (this.buf.length < I.iv) return { c: [] }; 
            const salt = this.buf.slice(0, I.iv); 
            this.buf = this.buf.slice(I.iv); 
            if (I.b3) this.csalt = salt; 
            this.dec = new AEAD(await sesKey(this.mk, salt, I), I); 
            await this.dec.init(); 
        }
        if (I.b3 && !this.hdr) { 
            const fhs = 11 + I.tag; 
            if (this.buf.length < fhs) return { c: [] }; 
            const fh = await this.dec.dec(this.buf.slice(0, fhs)); 
            if (!fh) return { c: [], e: 'fhdr' }; 
            this.buf = this.buf.slice(fhs); 
            if (fh[0] !== 0) return { c: [], e: 'type' }; 
            const vl = u16be(fh, 9), vhs = vl + I.tag; 
            if (this.buf.length < vhs) { 
                this.plen = vl; 
                return { c: [] }; 
            } 
            const vh = await this.dec.dec(this.buf.slice(0, vhs)); 
            if (!vh) return { c: [], e: 'vhdr' }; 
            this.buf = this.buf.slice(vhs); 
            this.hdr = true; 
            let al = 0; 
            if (vh[0] === 1) al = 7; 
            else if (vh[0] === 3) al = 4 + vh[1]; 
            else if (vh[0] === 4) al = 19; 
            else return { c: [], e: 'addr' }; 
            const pl = u16be(vh, al), ps = al + 2 + pl, res = new Uint8Array(al + (vh.length - ps)); 
            res.set(vh.slice(0, al)); 
            if (vh.length > ps) res.set(vh.slice(ps), al); 
            out.push(res); 
            this.plen = -1; 
        }
        while (true) { 
            if (this.plen < 0) { 
                const ls = 2 + I.tag; 
                if (this.buf.length < ls) break; 
                const lp = await this.dec.dec(this.buf.slice(0, ls)); 
                if (!lp) return { c: out, e: 'len' }; 
                this.plen = u16be(lp, 0); 
                this.buf = this.buf.slice(ls); 
            } 
            const ps = this.plen + I.tag; 
            if (this.buf.length < ps) break; 
            const pp = await this.dec.dec(this.buf.slice(0, ps)); 
            if (!pp) return { c: out, e: 'pay' }; 
            out.push(pp); 
            this.buf = this.buf.slice(ps); 
            this.plen = -1; 
        } 
        return { c: out }; 
    }
    async encData(data) { 
        const I = this.I;
        if (I.none) return data;
        if (I.s) { 
            let pf = new Uint8Array(0); 
            if (!this.senc) { 
                const iv = crypto.getRandomValues(new Uint8Array(I.iv)); 
                this.senc = new Strm(this.mk, iv, I, true); 
                pf = iv; 
            } 
            const e = await this.senc.crypt(data); 
            return cat(pf, e); 
        }
        let pf = new Uint8Array(0); 
        if (!this.enc) { 
            const salt = crypto.getRandomValues(new Uint8Array(I.iv)); 
            this.enc = new AEAD(await sesKey(this.mk, salt, I), I); 
            await this.enc.init();
            if (I.b3) { 
                const fhLen = 11 + I.k, fh = new Uint8Array(fhLen); 
                fh[0] = 1; 
                new DataView(fh.buffer).setBigUint64(1, BigInt(Math.floor(Date.now() / 1000)), false); 
                if (this.csalt) fh.set(this.csalt, 9); 
                const ipl = Math.min(data.length, 0xFFFF); 
                new DataView(fh.buffer).setUint16(9 + I.k, ipl, false); 
                const efh = await this.enc.enc(fh), eip = await this.enc.enc(data.slice(0, ipl)); 
                pf = cat(salt, efh, eip); 
                data = data.slice(ipl); 
                if (data.length === 0) return pf; 
            } else {
                pf = salt; 
            }
        }
        const mx = 0x3FFF, cks = []; 
        for (let i = 0; i < data.length; i += mx) { 
            const ck = data.subarray(i, Math.min(i + mx, data.length));
            const lb = new Uint8Array(2); 
            put16(lb, 0, ck.length); 
            cks.push(await this.enc.enc(lb), await this.enc.enc(ck)); 
        } 
        const tl = pf.length + cks.reduce((s, c) => s + c.length, 0);
        const r = new Uint8Array(tl); 
        r.set(pf); 
        let o = pf.length; 
        for (const c of cks) { 
            r.set(c, o); 
            o += c.length; 
        } 
        return r; 
    } 
}

const parseAddr = d => { 
    if (d.length < 1) return null; 
    const t = d[0]; 
    let h, p, o; 
    if (t === 1) { 
        if (d.length < 7) return null; 
        h = `${d[1]}.${d[2]}.${d[3]}.${d[4]}`; 
        p = u16be(d, 5); 
        o = 7; 
    } else if (t === 3) { 
        const l = d[1]; 
        if (d.length < 4 + l) return null; 
        h = dec.decode(d.slice(2, 2 + l)); 
        p = u16be(d, 2 + l); 
        o = 4 + l; 
    } else if (t === 4) { 
        if (d.length < 19) return null; 
        const pts = []; 
        for (let i = 0; i < 8; i++) pts.push(((d[1 + i * 2] << 8) | d[2 + i * 2]).toString(16)); 
        h = pts.join(':'); 
        p = u16be(d, 17); 
        o = 19; 
    } else return null; 
    return { h, p, o, addressType: t }; 
};

async function derivePsk(pw, requiredLen) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(pw)));
    const keyBytes = hash.slice(0, requiredLen);
    let binary = '';
    for (let i = 0; i < keyBytes.length; i++) {
        binary += String.fromCharCode(keyBytes[i]);
    }
    return btoa(binary);
}

// CF-CDN 
let cfip = [ // 格式:优选域名:端口#备注名称、优选IP:端口#备注名称、[ipv6优选]:端口#备注名称、优选域名#备注 
    'mfa.gov.ua#SG', 'saas.sin.fan#JP', 'store.ubi.com#SG','cf.130519.xyz#KR','cf.008500.xyz#HK', 
    'cf.090227.xyz#SG', 'cf.877774.xyz#HK','cdns.doon.eu.org#JP','sub.danfeng.eu.org#TW','cf.zhetengsha.eu.org#HK'
];  // 感谢各位大佬维护的优选域名

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;

function closeSocketQuietly(socket) {
    try { 
        if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
            socket.close(); 
        }
    } catch (error) {} 
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

async function handleSSRequest(request, customProxyIP, ssConfig) {
    const wssPair = new WebSocketPair();
    const clientSock = wssPair[0];
    const serverSock = wssPair[1];
    serverSock.accept();
    serverSock.binaryType = 'arraybuffer';

    const ss = new SS(ssConfig);
    await ss.init();

    let remoteConnWrapper = { socket: null };
    let isDnsQuery = false;
    const earlyData = request.headers.get('sec-websocket-protocol') || '';
    const readable = makeReadableStr(serverSock, earlyData);

    readable.pipeTo(new WritableStream({
        async write(chunk) {
            if (isDnsQuery) return await forwardataudp(chunk, serverSock, null, ss);

            const { c: decryptedChunks, e: decryptError } = await ss.decData(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
            if (decryptError) {
                closeSocketQuietly(serverSock);
                return;
            }
            if (!decryptedChunks || decryptedChunks.length === 0) return;

            for (const ck of decryptedChunks) {
                if (remoteConnWrapper.socket) {
                    const writer = remoteConnWrapper.socket.writable.getWriter();
                    await writer.write(ck);
                    writer.releaseLock();
                    continue;
                }

                const addrInfo = parseAddr(ck);
                if (!addrInfo) {
                    closeSocketQuietly(serverSock);
                    return;
                }

                const { h: hostname, p: port, o: rawIndex, addressType } = addrInfo;

                if (isSpeedTestSite(hostname)) {
                    throw new Error('Speedtest site is blocked');
                }
                if (addressType === 2) { 
                    if (port === 53) isDnsQuery = true;
                    else throw new Error('UDP is not supported');
                }

                const rawData = ck.slice(rawIndex);
                if (isDnsQuery) {
                    await forwardataudp(rawData, serverSock, null, ss);
                    return;
                }

                await forwardataTCP(hostname, port, rawData, serverSock, null, remoteConnWrapper, customProxyIP, ss);
            }
        },
    })).catch((err) => {
        closeSocketQuietly(serverSock);
    });

    return new Response(null, { status: 101, webSocket: clientSock });
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

async function forwardataTCP(host, portNum, rawData, ws, respHeader, remoteConnWrapper, customProxyIP, ss) {
    async function connectDirect(address, port, data) {
        const cleanHost = address.replace(/^\[|\]$/g, '');
        const remoteSock = connect({ hostname: cleanHost, port: port });
        if (data && data.byteLength > 0) {
            const writer = remoteSock.writable.getWriter();
            await writer.write(data);
            writer.releaseLock();
        }
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
        connectStreams(newSocket, ws, respHeader, null, ss);
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
            connectStreams(initialSocket, ws, respHeader, connecttoPry, ss);
        } catch (err) {
            await connecttoPry();
        }
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

async function connectStreams(remoteSocket, webSocket, headerData, retryFunc, ss) {
    let header = headerData, hasData = false;
    await remoteSocket.readable.pipeTo(
        new WritableStream({
            async write(chunk) {
                hasData = true;
                if (webSocket.readyState !== WS_READY_STATE_OPEN) {
                    throw new Error('wsreadyState not open');
                }
                let dataToSend = chunk;
                if (header) { 
                    const response = new Uint8Array(header.length + chunk.byteLength);
                    response.set(header, 0);
                    response.set(chunk, header.length);
                    dataToSend = response;
                    header = null; 
                }
                if (ss) {
                    const encData = await ss.encData(dataToSend instanceof Uint8Array ? dataToSend : new Uint8Array(dataToSend));
                    webSocket.send(encData.buffer ? encData.buffer : encData);
                } else {
                    webSocket.send(dataToSend); 
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

async function forwardataudp(udpChunk, webSocket, respHeader, ss) {
    try {
        const tcpSocket = connect({ hostname: '8.8.4.4', port: 53 });
        let header = respHeader;
        const writer = tcpSocket.writable.getWriter();
        await writer.write(udpChunk);
        writer.releaseLock();
        await tcpSocket.readable.pipeTo(new WritableStream({
            async write(chunk) {
                if (webSocket.readyState === WS_READY_STATE_OPEN) {
                    let dataToSend = chunk;
                    if (header) { 
                        const response = new Uint8Array(header.length + chunk.byteLength);
                        response.set(header, 0);
                        response.set(chunk, header.length);
                        dataToSend = response;
                        header = null; 
                    }
                    if (ss) {
                        const encData = await ss.encData(dataToSend instanceof Uint8Array ? dataToSend : new Uint8Array(dataToSend));
                        webSocket.send(encData.buffer ? encData.buffer : encData);
                    } else {
                        webSocket.send(dataToSend);
                    }
                }
            },
        }));
    } catch (error) {
        // console.error('UDP forward error:', error);
    }
}

function getSimplePage(request, currentMethod) {
    const url = request.headers.get('Host');
    const baseUrl = `https://${url}`;
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Shadowsocks Cloudflare Service</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#7dd3ca 0%,#a17ec4 100%);height:100vh;display:flex;align-items:center;justify-content:center;color:#333;margin:0;padding:0;overflow:hidden;}.container{background:rgba(255,255,255,0.95);backdrop-filter:blur(10px);border-radius:20px;padding:40px;box-shadow:0 20px 40px rgba(0,0,0,0.1);max-width:800px;width:95%;text-align:center;}.logo{margin-bottom:-20px;}.title{font-size:2rem;margin-bottom:20px;color:#2d3748;}.tip-card{background:#fff3cd;border-radius:12px;padding:20px;margin:20px 0;text-align:center;border-left:4px solid #ffc107;}.tip-title{font-weight:600;color:#856404;margin-bottom:10px;}.tip-content{color:#856404;font-size:1rem;}.highlight{font-weight:bold;color:#000;background:#fff;padding:2px 6px;border-radius:4px;}.method-tag{display:inline-block;background:#3498db;color:#fff;padding:4px 10px;border-radius:15px;font-size:0.9rem;margin-bottom:15px;}@media (max-width:768px){.container{padding:20px;}}</style></head><body><div class="container"><div class="logo"><img src="https://img.icons8.com/color/96/cloudflare.png" alt="Logo" width="96" height="96"></div><h1 class="title">Hello Shadowsocks！</h1><div class="method-tag">当前加密算法: ${(currentMethod || 'none').toUpperCase()}</div><div class="tip-content">访问 <span class="highlight">${baseUrl}/你的UUID</span> 进入订阅中心</div></div></body></html>`;
    return new Response(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html;charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}

export default {
    async fetch(request, env) {
        try {
            if (env) {
                if (env.PROXYIP || env.proxyip || env.proxyIP) {
                    proxyIP = env.PROXYIP || env.proxyip || env.proxyIP;
                }
                password = env.PASSWORD || env.password || env.uuid || env.UUID || password;
                ssMethod = env.SS_METHOD || env.ss_method || env.METHOD || env.method || ssMethod;
                ssPsk = env.SS_PSK || env.ss_psk || env.PSK || env.psk || ssPsk;
                subPath = env.SUB_PATH || env.subpath || subPath;
                SSpath = env.SSPATH || env.sspath || SSpath;
            }

            if (subPath === 'link' || subPath === '') { subPath = password; }
            if (SSpath === '') { SSpath = password; }
            let validPath = `/${SSpath}`; 
            const servers = proxyIP.split(',').map(s => s.trim());
            proxyIP = servers[0];

            const methodInfo = C[ssMethod] || C['none'];
            let effectivePsk = ssPsk;
            if (methodInfo.b3 && !effectivePsk) {
                effectivePsk = await derivePsk(password, methodInfo.k);
            }

            const ssConfig = {
                pw: password,
                psk: effectivePsk,
                method: ssMethod
            };

            const url = new URL(request.url);
            const pathname = url.pathname;
            let pathProxyIP = null;
            if (pathname.startsWith('/proxyip=')) {
                try {
                    pathProxyIP = decodeURIComponent(pathname.substring(9)).trim();
                } catch (e) {}
                if (pathProxyIP && !request.headers.get('Upgrade')) {
                    proxyIP = pathProxyIP;
                    return new Response(`set proxyIP to: ${proxyIP}\n\n`, {
                        headers: { 
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        },
                    });
                }
            }

            if (request.headers.get('Upgrade') === 'websocket') {
                if (!pathname.toLowerCase().startsWith(validPath.toLowerCase())) {
                    return new Response('Unauthorized', { status: 401 });
                }
                let wsPathProxyIP = null;
                if (pathname.startsWith('/proxyip=')) {
                    try {
                        wsPathProxyIP = decodeURIComponent(pathname.substring(9)).trim();
                    } catch (e) {}
                }
                const customProxyIP = wsPathProxyIP || url.searchParams.get('proxyip') || request.headers.get('proxyip');
                return await handleSSRequest(request, customProxyIP, ssConfig);
            } else if (request.method === 'GET') {
                if (url.pathname === '/') {
                    return getSimplePage(request, ssMethod);
                }
                if (url.pathname.toLowerCase() === `/${password.toLowerCase()}`) {
                    const sheader = 'ss';
                    const typelink = 'clash';
                    const currentDomain = url.hostname;
                    const baseUrl = `https://${currentDomain}`;
                    const vUrl = `${baseUrl}/sub/${subPath}`;
                    const secretForNode = methodInfo.b3 ? effectivePsk : password;
                    const qxConfig = `shadowsocks=mfa.gov.ua:443,method=${ssMethod},password=${secretForNode},obfs=wss,obfs-host=${currentDomain},obfs-uri=/${SSpath}/?ed=2560,fast-open=true,udp-relay=true,tag=SS`;
                    const claLink = `https://sub.ssss.xx.kg/${typelink}?config=${vUrl}`;
                    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Shadowsocks 订阅中心</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:linear-gradient(135deg,#7dd3ca 0%,#a17ec4 100%);color:#333}.container{height:1080px;max-width:800px;margin:0 auto}.header{margin-bottom:30px}.header h1{text-align:center;color:#007fff;border-bottom:2px solid #3498db;padding-bottom:10px}.method-badge{display:inline-block;background:#8e44ad;color:#fff;padding:5px 12px;border-radius:15px;font-size:0.95em;margin-top:5px;}.section{margin-bottom:0px}.section h2{color:#b33ce7;margin-bottom:5px;font-size:1.1em}.link-box{background:#f0fffa;border:1px solid #ddd;border-radius:8px;padding:15px;margin-bottom:15px;display:flex;justify-content:space-between;align-items:flex-start}.lintext{flex:1;word-break:break-all;font-family:monospace;color:#2980b9;margin:10px;}.clesh-config{flex:1;word-break:break-all;font-family:monospace;color:#2980b9;margin:10px;white-space:pre-wrap;background:#f8f9fa;padding:10px;border-radius:4px;border:1px solid #e9ecef}.button-group{display:flex;gap:10px;flex-shrink:0}.copy-btn{background:#27aea2;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;transition:all 0.3s ease}.copy-btn:hover{background:#219652}.copy-btn.copied{background:#0e981d}.qrcode-btn{background:#e67e22;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer}.qrcode-btn:hover{background:#d35400}.footer{text-align:center;color:#7f8c8d;border-top:1px solid #e1d9fb;}.footer a{color:#c311ff;text-decoration:none;margin:0 15px}.footer a:hover{text-decoration:underline}#qrModal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000}.modal-content{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;text-align:center;max-width:90%}.modal-content h3{margin-bottom:15px;color:#2c3e50}.modal-content img{max-width:300px;height:auto;margin:10px 0}.close-btn{background:#e74c3c;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;margin-top:15px}.close-btn:hover{background:#c0392b}@media (max-width:600px){.link-box{flex-direction:column}.button-group{margin-top:10px;align-self:flex-end}}</style></head><body><div class="container"><div class="header"><h1>Shadowsocks 订阅中心</h1><center><span class="method-badge">加密算法: ${ssMethod.toUpperCase()}</span></center></div><div class="section"><h2>V2rayN / NekoBox / Shadowrocket / sing-box 订阅链接</h2><div class="link-box"><div class="lintext">${vUrl}</div><div class="button-group"><button class="copy-btn" onclick="copyToClipboard(this,'${vUrl}')">复制</button><button class="qrcode-btn" onclick="showQRCode('${vUrl}','订阅链接')">二维码</button></div></div></div><div class="section"><h2>${typelink} 订阅链接</h2><div class="link-box"><div class="lintext">${claLink}</div><div class="button-group"><button class="copy-btn" onclick="copyToClipboard(this,'${claLink}')">复制</button><button class="qrcode-btn" onclick="showQRCode('${claLink}','${typelink} 订阅链接')">二维码</button></div></div></div><div class="section"><h2>Quantumult X 节点配置</h2><div class="link-box"><div class="lintext">${qxConfig}</div><div class="button-group"><button class="copy-btn" onclick="copyToClipboard(this,'${qxConfig}')">复制</button></div></div></div><div class="section"><h2>客户端下载链接</h2><div class="link-box"><div class="lintext">v2rayN (Windows): <a href="https://github.com/2dust/v2rayN/releases" target="_blank">GitHub Release</a><br>v2rayNG (Android): <a href="https://github.com/2dust/v2rayNG/releases" target="_blank">GitHub Release</a><br>NekoBox (Android): <a href="https://github.com/MatsuriDayo/NekoBoxForAndroid/releases" target="_blank">GitHub Release</a></div></div></div><div class="footer"><p><a href="https://github.com/zaofengyue/CF-Workers-VLESS" target="_blank">GitHub</a> | <a href="https://proxy.fengyue.bond" target="_blank">Proxyip检测</a> | <a href="https://socks.fengyue.bond" target="_blank">Socks5检测</a></p></div></div><div id="qrModal"><div class="modal-content"><h3 id="modalTitle">二维码</h3><img id="qrImage" src="" alt="QR Code"><p id="qrText" style="word-break:break-all;margin:10px 0"></p><button class="close-btn" onclick="closeQRModal()">关闭</button></div></div><script>function copyToClipboard(button,text){const originalText=button.textContent;navigator.clipboard.writeText(text).then(()=>{button.textContent='已复制';button.classList.add('copied');setTimeout(()=>{button.textContent=originalText;button.classList.remove('copied')},2000)}).catch(()=>{const e=document.createElement('textarea');e.value=text;document.body.appendChild(e);e.select();document.execCommand('copy');document.body.removeChild(e);button.textContent='已复制';button.classList.add('copied');setTimeout(()=>{button.textContent=originalText;button.classList.remove('copied')},2000)})}function showQRCode(text,title){document.getElementById('modalTitle').textContent=title;document.getElementById('qrText').textContent=text;const e='https://tool.oschina.net/action/qrcode/generate?data='+encodeURIComponent(text)+'&output=image%2Fpng&error=L&type=0&margin=4&size=4';fetch(e).then(t=>t.blob()).then(t=>{const n=URL.createObjectURL(t);document.getElementById('qrImage').src=n}).catch(()=>{document.getElementById('qrImage').src=e});document.getElementById('qrModal').style.display='block'}function closeQRModal(){document.getElementById('qrModal').style.display='none'}</script></body></html>`;
                    return new Response(html, {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/html;charset=utf-8',
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                        },
                    });
                }
                // sub path /sub/UUID
                if (url.pathname.toLowerCase() === `/sub/${subPath.toLowerCase()}` || url.pathname.toLowerCase() === `/sub/${subPath.toLowerCase()}/`) {
                    const currentDomain = url.hostname;
                    const ssHeader = 'ss';
                    const secretForNode = methodInfo.b3 ? effectivePsk : password;
                    const ssConfigStr = `${ssMethod}:${secretForNode}`;
                    const encodedConfig = btoa(unescape(encodeURIComponent(ssConfigStr)));

                    const noTlsPorts = [80, 8080, 8880, 2052, 2082, 2086, 2095];

                    const ssLinks = cfip.map(cdnItem => {
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

                        const isNoTls = noTlsPorts.includes(port);
                        const tlsParams = isNoTls 
                            ? '' 
                            : `;tls;sni=${currentDomain};skip-cert-verify=true`;

                        const ssNodeName = nodeName ? `${nodeName}-${ssHeader}` : `${ssHeader}`;
                        return `${ssHeader}://${encodedConfig}@${host}:${port}?plugin=v2ray-plugin;mode=websocket;host=${currentDomain};path=${validPath}/?ed=2560${tlsParams};mux=0#${ssNodeName}`;
                    });
                    const linksText = ssLinks.join('\n');
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
