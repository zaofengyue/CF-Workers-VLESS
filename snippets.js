import { connect } from 'cloudflare:sockets';

// 默认配置（支持环境变量动态覆盖）
let proxyIP = 'proxy.xxxxxxxx.tk:50001';
let yourUUID = '93bf61d9-3796-44c2-9b3a-49210ece2585';

// 优选节点列表 (格式: 域名/IP[:端口][#备注])
let cfip = [
    'mfa.gov.ua#SG', 'saas.sin.fan#HK', 'store.ubi.com#JP', 'cf.130519.xyz#KR', 'cf.008500.xyz#HK',
    'cf.090227.xyz#SG', 'cf.877774.xyz#HK', 'cdns.doon.eu.org#JP', 'sub.danfeng.eu.org#TW', 'cf.zhetengsha.eu.org#HK'
];

function getHomePageHTML(domain) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Snippets VLESS</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(135deg,#4f46e5,#06b6d4);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;color:#1f2937}.card{background:#fff;padding:32px;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,.15);max-width:480px;width:100%;text-align:center}h1{color:#4f46e5;font-size:1.6rem;margin-bottom:12px}.desc{color:#6b7280;font-size:.95rem;line-height:1.6;margin-bottom:24px}.btn{display:inline-block;background:#4f46e5;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:500;transition:.2s}.btn:hover{background:#4338ca}.footer{margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6;font-size:.8rem;color:#9ca3af}.footer a{color:#4f46e5;text-decoration:none;margin:0 8px}</style></head><body><div class="card"><h1>⚡ Hello Snippets</h1><p class="desc">VLESS over WebSocket 代理服务已就绪。<br>请访问订阅路径获取节点配置：<br><strong style="color:#111827;word-break:break-all">https://${domain}/${yourUUID}</strong></p><a class="btn" href="/${yourUUID}">查看订阅中心</a><div class="footer"><a href="https://github.com/zaofengyue/CF-Workers-VLESS" target="_blank">GitHub</a>|<a href="https://proxy.fengyue.bond" target="_blank">ProxyIP检测</a>|<a href="https://socks.fengyue.bond" target="_blank">Socks5检测</a></div></div></body></html>`;
}

function getSubPageHTML(domain) {
    const v2raySub = `https://${domain}/sub/${yourUUID}`;
    const clashSub = `https://sublink.alwaysdata.net/clash?config=https://${domain}/sub/${yourUUID}`;
    const singboxSub = `https://sublink.alwaysdata.net/singbox?config=https://${domain}/sub/${yourUUID}`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Snippets 订阅中心</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,sans-serif;background:#f3f4f6;color:#1f2937;padding:20px;line-height:1.5}.wrap{max-width:760px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 4px 20px rgba(0,0,0,.06)}h1{color:#4f46e5;font-size:1.5rem;margin-bottom:20px;text-align:center}.box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:14px}.label{font-size:.85rem;font-weight:600;color:#4b5563;margin-bottom:6px}.row{display:flex;gap:8px}.text{flex:1;background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-family:monospace;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.btn{background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:0 14px;font-size:.8rem;cursor:pointer;flex-shrink:0;transition:.2s}.btn:hover{background:#4338ca}.btn.copied{background:#10b981}.guide{background:#fffbeb;border:1px solid #fef3c7;border-radius:10px;padding:14px;margin-top:20px;font-size:.82rem}.guide h3{color:#b45309;margin-bottom:8px;font-size:.95rem}.guide code{background:#fff;padding:2px 5px;border-radius:4px;border:1px solid #fde68a;color:#d97706;font-family:monospace;word-break:break-all}.footer{text-align:center;margin-top:20px;padding-top:14px;border-top:1px solid #f3f4f6;font-size:.78rem;color:#9ca3af}.footer a{color:#4f46e5;text-decoration:none;margin:0 6px}</style></head><body><div class="wrap"><h1>⚡ Snippets 订阅中心</h1><div class="box"><div class="label">v2rayN / Loon / Shadowrocket / Karing</div><div class="row"><div class="text" id="l1">${v2raySub}</div><button class="btn" onclick="cp('l1',this)">复制</button></div></div><div class="box"><div class="label">Clash (Mihomo / FlClash / Meta)</div><div class="row"><div class="text" id="l2">${clashSub}</div><button class="btn" onclick="cp('l2',this)">复制</button></div></div><div class="box"><div class="label">Sing-box (SFI / SFA)</div><div class="row"><div class="text" id="l3">${singboxSub}</div><button class="btn" onclick="cp('l3',this)">复制</button></div></div><div class="guide"><h3>⚙️ 节点路径参数 (Path) 说明</h3><p>• 默认路径: <code>/?ed=2560</code> (使用内置 ProxyIP)</p><p style="margin-top:4px">• 指定分流 ProxyIP: <code>/?ed=2560&fd=域名或IP:端口</code> 或 <code>/fd=域名或IP:端口</code></p><p style="margin-top:4px">• 指定 SOCKS5 落地: <code>/?ed=2560&ld=socks5://user:pass@host:port</code></p><p style="margin-top:4px">• 指定 HTTP/HTTPS 落地: <code>/?ed=2560&ld=http://user:pass@host:port</code></p></div><div class="footer"><a href="https://github.com/zaofengyue/CF-Workers-VLESS" target="_blank">GitHub 仓库</a>|<a href="https://proxy.fengyue.bond" target="_blank">ProxyIP检测</a>|<a href="https://socks.fengyue.bond" target="_blank">Socks5检测</a></div></div><script>function cp(id,b){const t=document.getElementById(id).textContent;navigator.clipboard.writeText(t).then(()=>{const o=b.textContent;b.textContent='已复制';b.classList.add('copied');setTimeout(()=>{b.textContent=o;b.classList.remove('copied')},2e3)})}</script></body></html>`;
}

function formatIdentifier(arr, offset = 0) {
    const hex = [...arr.slice(offset, offset + 16)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function base64ToArray(b64) {
    if (!b64) return { earlyData: null, error: null };
    try {
        const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { earlyData: bytes.buffer, error: null };
    } catch (e) {
        return { earlyData: null, error: e };
    }
}

function closeSocketQuietly(s) {
    try {
        if (s && (s.readyState === 1 || s.readyState === 2)) s.close();
    } catch {}
}

function parseProxyAddress(str) {
    if (!str) return null;
    str = str.trim();
    if (str.startsWith('socks://') || str.startsWith('socks5://')) {
        try {
            const u = new URL(str.replace(/^socks:\/\//, 'socks5://'));
            return { type: 'socks5', host: u.hostname, port: parseInt(u.port) || 1080, username: decodeURIComponent(u.username || ''), password: decodeURIComponent(u.password || '') };
        } catch { return null; }
    }
    if (str.startsWith('http://') || str.startsWith('https://')) {
        try {
            const u = new URL(str);
            return { type: 'http', host: u.hostname, port: parseInt(u.port) || (str.startsWith('https://') ? 443 : 80), username: decodeURIComponent(u.username || ''), password: decodeURIComponent(u.password || '') };
        } catch { return null; }
    }
    if (str.startsWith('[')) {
        const idx = str.indexOf(']');
        if (idx > 0) {
            const host = str.slice(1, idx);
            const rest = str.slice(idx + 1);
            return { type: 'direct', host, port: rest.startsWith(':') ? (parseInt(rest.slice(1), 10) || 443) : 443 };
        }
    }
    const idx = str.lastIndexOf(':');
    if (idx > 0) {
        const host = str.slice(0, idx);
        const port = parseInt(str.slice(idx + 1), 10);
        if (!isNaN(port) && port > 0 && port <= 65535) return { type: 'direct', host, port };
    }
    return { type: 'direct', host: str, port: 443 };
}

export default {
    async fetch(request, env) {
        try {
            if (env) {
                yourUUID = env.UUID || env.uuid || yourUUID;
                proxyIP = env.PROXYIP || env.proxyip || proxyIP;
            }
            const url = new URL(request.url);
            const pathname = url.pathname;
            let pathProxyIP = null;
            const matchProxy = pathname.match(/\/(?:proxyip|fd|ld)=((?:socks5|socks|https|http):\/\/[^\s?&#]+)/i) ||
                               pathname.match(/\/(?:proxyip|fd|ld)=([^/?&#]+)/i);
            if (matchProxy) {
                try { pathProxyIP = decodeURIComponent(matchProxy[1]).trim(); } catch {}
                if (pathProxyIP && !request.headers.get('Upgrade')) {
                    proxyIP = pathProxyIP;
                    return new Response(`set proxyIP to: ${proxyIP}\n\n`, {
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }
            }

            if (request.headers.get('Upgrade') === 'websocket') {
                const customProxy = pathProxyIP ||
                    url.searchParams.get('fd') || url.searchParams.get('ld') || url.searchParams.get('proxyip') ||
                    request.headers.get('fd') || request.headers.get('ld') || request.headers.get('proxyip');
                return await handleVlsRequest(request, customProxy);
            }

            if (request.method === 'GET') {
                if (pathname === '/') return new Response(getHomePageHTML(url.hostname), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
                if (pathname === `/${yourUUID}`) return new Response(getSubPageHTML(url.hostname), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
                if (pathname.toLowerCase().includes(`/sub/${yourUUID}`)) {
                    const hostDomain = url.hostname;
                    const links = cfip.map(item => {
                        let host, port = 443, name = '';
                        if (item.includes('#')) {
                            const [p1, p2] = item.split('#');
                            item = p1; name = p2;
                        }
                        if (item.startsWith('[') && item.includes(']:')) {
                            const end = item.indexOf(']:');
                            host = item.slice(0, end + 1);
                            port = parseInt(item.slice(end + 2)) || 443;
                        } else if (item.includes(':')) {
                            const [h, p] = item.split(':');
                            host = h; port = parseInt(p) || 443;
                        } else {
                            host = item;
                        }
                        return `vless://${yourUUID}@${host}:${port}?encryption=none&security=tls&sni=${hostDomain}&fp=firefox&allowInsecure=0&type=ws&host=${hostDomain}&path=%2F%3Fed%3D2560#${encodeURIComponent(name || 'Snippets-VLESS')}`;
                    }).join('\n');
                    return new Response(btoa(unescape(encodeURIComponent(links))), {
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }
            }
            return new Response('Not Found', { status: 404 });
        } catch {
            return new Response('Internal Server Error', { status: 500 });
        }
    }
};

async function handleVlsRequest(request, customProxyIP) {
    const wsPair = new WebSocketPair();
    const [clientSock, serverSock] = Object.values(wsPair);
    serverSock.accept();

    let remoteConnWrapper = { socket: null };
    let isDnsQuery = false;
    const earlyData = request.headers.get('sec-websocket-protocol') || '';
    const readable = makeReadableStream(serverSock, earlyData);

    readable.pipeTo(new WritableStream({
        async write(chunk) {
            if (isDnsQuery) return await forwardUDP(chunk, serverSock, null);
            if (remoteConnWrapper.socket) {
                const writer = remoteConnWrapper.socket.writable.getWriter();
                await writer.write(chunk);
                writer.releaseLock();
                return;
            }
            const { hasError, message, addressType, port, hostname, rawIndex, version, isUDP } = parseWsPacketHeader(chunk, yourUUID);
            if (hasError) throw new Error(message);

            if (isUDP) {
                if (port === 53) isDnsQuery = true;
                else throw new Error('UDP is not supported');
            }
            const respHeader = new Uint8Array([version[0], 0]);
            const rawData = chunk.slice(rawIndex);
            if (isDnsQuery) return forwardUDP(rawData, serverSock, respHeader);
            await forwardTCP(addressType, hostname, port, rawData, serverSock, respHeader, remoteConnWrapper, customProxyIP);
        }
    })).catch(() => closeSocketQuietly(serverSock));

    return new Response(null, { status: 101, webSocket: clientSock, headers: { 'Sec-WebSocket-Extensions': '' } });
}

async function connect2Socks5(proxy, targetHost, targetPort, initialData) {
    const socket = connect({ hostname: proxy.host, port: proxy.port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    try {
        const hasAuth = proxy.username && proxy.password;
        await writer.write(hasAuth ? new Uint8Array([5, 2, 0, 2]) : new Uint8Array([5, 1, 0]));
        const mRes = await reader.read();
        if (mRes.done || mRes.value.byteLength < 2) throw new Error('S5 auth failed');
        const method = new Uint8Array(mRes.value)[1];
        if (method === 2 && hasAuth) {
            const u = new TextEncoder().encode(proxy.username);
            const p = new TextEncoder().encode(proxy.password);
            const authPkt = new Uint8Array(3 + u.length + p.length);
            authPkt[0] = 1; authPkt[1] = u.length; authPkt.set(u, 2);
            authPkt[2 + u.length] = p.length; authPkt.set(p, 3 + u.length);
            await writer.write(authPkt);
            const aRes = await reader.read();
            if (aRes.done || new Uint8Array(aRes.value)[1] !== 0) throw new Error('S5 auth failed');
        } else if (method !== 0) {
            throw new Error('S5 method unsupported');
        }
        const hostBytes = new TextEncoder().encode(targetHost);
        const req = new Uint8Array(7 + hostBytes.length);
        req.set([5, 1, 0, 3, hostBytes.length]);
        req.set(hostBytes, 5);
        new DataView(req.buffer).setUint16(5 + hostBytes.length, targetPort, false);
        await writer.write(req);
        const cRes = await reader.read();
        if (cRes.done || new Uint8Array(cRes.value)[1] !== 0) throw new Error('S5 connect failed');
        if (initialData?.byteLength) await writer.write(initialData);
        writer.releaseLock();
        reader.releaseLock();
        return socket;
    } catch (e) {
        try { writer.releaseLock(); } catch {}
        try { reader.releaseLock(); } catch {}
        try { socket.close(); } catch {}
        throw e;
    }
}

async function connect2Http(proxy, targetHost, targetPort, initialData) {
    const socket = connect({ hostname: proxy.host, port: proxy.port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    try {
        let req = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nUser-Agent: Mozilla/5.0\r\n`;
        if (proxy.username && proxy.password) req += `Proxy-Authorization: Basic ${btoa(`${proxy.username}:${proxy.password}`)}\r\n`;
        req += '\r\n';
        await writer.write(new TextEncoder().encode(req));
        let buf = new Uint8Array(0);
        let headerEnd = -1;
        while (headerEnd === -1 && buf.length < 8192) {
            const { done, value } = await reader.read();
            if (done) throw new Error('HTTP proxy closed');
            const next = new Uint8Array(buf.length + value.length);
            next.set(buf); next.set(value, buf.length); buf = next;
            for (let i = 0; i < buf.length - 3; i++) {
                if (buf[i] === 13 && buf[i+1] === 10 && buf[i+2] === 13 && buf[i+3] === 10) {
                    headerEnd = i + 4; break;
                }
            }
        }
        if (headerEnd === -1) throw new Error('Invalid HTTP response');
        const statusLine = new TextDecoder().decode(buf.subarray(0, headerEnd)).split('\r\n')[0];
        const match = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
        if (!match || parseInt(match[1]) < 200 || parseInt(match[1]) >= 300) throw new Error('HTTP connect failed: ' + statusLine);
        if (initialData?.byteLength) await writer.write(initialData);
        writer.releaseLock();
        reader.releaseLock();
        return socket;
    } catch (e) {
        try { writer.releaseLock(); } catch {}
        try { reader.releaseLock(); } catch {}
        try { socket.close(); } catch {}
        throw e;
    }
}

async function forwardTCP(addrType, host, portNum, rawData, ws, respHeader, remoteConnWrapper, customProxyIP) {
    async function connectDirect(address, port, data) {
        const cleanHost = address.replace(/^\[|\]$/g, '');
        const remoteSock = connect({ hostname: cleanHost, port });
        if (data?.byteLength) {
            const writer = remoteSock.writable.getWriter();
            await writer.write(data);
            writer.releaseLock();
        }
        return remoteSock;
    }

    let proxyConfig = null;
    let shouldUseProxy = false;
    const proxyTarget = customProxyIP || proxyIP;
    if (proxyTarget) {
        proxyConfig = parseProxyAddress(proxyTarget);
        if (proxyConfig && (proxyConfig.type === 'socks5' || proxyConfig.type === 'http')) {
            shouldUseProxy = true;
        } else if (!proxyConfig) {
            proxyConfig = { type: 'direct', host: proxyTarget, port: 443 };
        }
    }

    async function connectWithProxy() {
        let newSocket;
        if (proxyConfig.type === 'socks5') {
            newSocket = await connect2Socks5(proxyConfig, host, portNum, rawData);
        } else if (proxyConfig.type === 'http') {
            newSocket = await connect2Http(proxyConfig, host, portNum, rawData);
        } else {
            newSocket = await connectDirect(proxyConfig.host, proxyConfig.port, rawData);
        }
        remoteConnWrapper.socket = newSocket;
        newSocket.closed.catch(() => {}).finally(() => closeSocketQuietly(ws));
        connectStreams(newSocket, ws, respHeader, null);
    }

    if (shouldUseProxy) {
        await connectWithProxy();
    } else {
        try {
            const initialSocket = await connectDirect(host, portNum, rawData);
            remoteConnWrapper.socket = initialSocket;
            connectStreams(initialSocket, ws, respHeader, connectWithProxy);
        } catch {
            await connectWithProxy();
        }
    }
}

function parseWsPacketHeader(chunk, token) {
    if (chunk.byteLength < 24) return { hasError: true, message: 'Invalid data' };
    const view = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const version = view.slice(0, 1);
    if (formatIdentifier(view, 1) !== token) return { hasError: true, message: 'Invalid uuid' };
    const optLen = view[17];
    const cmd = view[18 + optLen];
    let isUDP = false;
    if (cmd === 1) {} else if (cmd === 2) { isUDP = true; } else { return { hasError: true, message: 'Invalid cmd' }; }
    const portIdx = 19 + optLen;
    const port = (view[portIdx] << 8) | view[portIdx + 1];
    let addrIdx = portIdx + 2, addrLen = 0, addrValIdx = addrIdx + 1, hostname = '';
    const addressType = view[addrIdx];
    switch (addressType) {
        case 1:
            addrLen = 4;
            hostname = view.slice(addrValIdx, addrValIdx + addrLen).join('.');
            break;
        case 2:
            addrLen = view[addrValIdx];
            addrValIdx += 1;
            hostname = new TextDecoder().decode(view.slice(addrValIdx, addrValIdx + addrLen));
            break;
        case 3:
            addrLen = 16;
            const ipv6 = [];
            for (let i = 0; i < 8; i++) ipv6.push(((view[addrValIdx + i * 2] << 8) | view[addrValIdx + i * 2 + 1]).toString(16));
            hostname = ipv6.join(':');
            break;
        default:
            return { hasError: true, message: `Invalid address type: ${addressType}` };
    }
    if (!hostname) return { hasError: true, message: 'Invalid address' };
    return { hasError: false, addressType, port, hostname, isUDP, rawIndex: addrValIdx + addrLen, version };
}

function makeReadableStream(socket, earlyDataHeader) {
    let cancelled = false;
    return new ReadableStream({
        start(controller) {
            socket.addEventListener('message', (event) => {
                if (!cancelled) controller.enqueue(event.data);
            });
            socket.addEventListener('close', () => {
                if (!cancelled) {
                    closeSocketQuietly(socket);
                    controller.close();
                }
            });
            socket.addEventListener('error', (err) => controller.error(err));
            const { earlyData, error } = base64ToArray(earlyDataHeader);
            if (error) controller.error(error);
            else if (earlyData) controller.enqueue(earlyData);
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
            async write(chunk, controller) {
                hasData = true;
                if (webSocket.readyState !== 1) controller.error('ws not open');
                if (header) {
                    const response = new Uint8Array(header.length + chunk.byteLength);
                    response.set(header, 0);
                    response.set(chunk, header.length);
                    webSocket.send(response.buffer);
                    header = null;
                } else {
                    webSocket.send(chunk);
                }
            }
        })
    ).catch(() => closeSocketQuietly(webSocket));
    if (!hasData && retryFunc) await retryFunc();
}

async function forwardUDP(udpChunk, webSocket, respHeader) {
    try {
        const tcpSocket = connect({ hostname: '8.8.4.4', port: 53 });
        let header = respHeader;
        const writer = tcpSocket.writable.getWriter();
        await writer.write(udpChunk);
        writer.releaseLock();
        await tcpSocket.readable.pipeTo(new WritableStream({
            async write(chunk) {
                if (webSocket.readyState === 1) {
                    if (header) {
                        const response = new Uint8Array(header.length + chunk.byteLength);
                        response.set(header, 0);
                        response.set(chunk, header.length);
                        webSocket.send(response.buffer);
                        header = null;
                    } else {
                        webSocket.send(chunk);
                    }
                }
            }
        }));
    } catch {}
}
