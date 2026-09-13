import { connect } from 'cloudflare:sockets';

let proxyIP = 'proxy.xxxxxxxx.tk:50001';  // proxyIP，也可以是socks5或http
let yourUUID = '93bf61d9-3796-44c2-9b3a-49210ece2585';  // UUID

// CDN 
let cfip = [ // 格式:优选域名:端口#备注名称、优选IP:端口#备注名称、[ipv6优选]:端口#备注名称、优选域名#备注 
    'mfa.gov.ua#SG', 'saas.sin.fan#HK', 'store.ubi.com#JP','cf.130519.xyz#KR','cf.008500.xyz#HK', 
    'cf.090227.xyz#SG', 'cf.877774.xyz#HK','cdns.doon.eu.org#JP','sub.danfeng.eu.org#TW','cf.zhetengsha.eu.org#HK'
];  // 在此感谢各位大佬维护的优选域名

function getHomePageHTML(currentDomain) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Snippets</title><style>body{font-family:Arial,sans-serif;margin:0;padding:40px 20px;background:linear-gradient(135deg,#667eea 0%,#18800e 100%);min-height:100vh;display:flex;align-items:center;justify-content:center}.container{max-width:600px;background:#fff;padding:40px;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);text-align:center}h1{color:#667eea;margin-bottom:20px}.info{font-size:18px;color:#666;margin:20px 0}.link{display:inline-block;background:#667eea;color:#fff;padding:12px 30px;border-radius:5px;text-decoration:none;margin-top:20px}.link:hover{background:#5568d3}.footer{margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:14px;color:#999}.footer a{color:#667eea;text-decoration:none;margin:0 10px}.footer a:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Hello Snippets</h1><div class="info">请访问: <strong>https://${currentDomain}/你的UUID</strong><br><br>查看订阅和使用说明</div><div class="footer"><a href="https://github.com/zaofengyue/CF-Workers-VLESS" target="_blank">GitHub</a>|<a href="https://proxy.fengyue.bond" target="_blank">ProxyIP检测</a>|<a href="https://socks.fengyue.bond" target="_blank">Socks5检测</a></div></div></body></html>`;
}

function getSubPageHTML(currentDomain) {
    const v2raySubLink = `https://${currentDomain}/sub/${yourUUID}`;
    const clashSubLink = `https://sublink.alwaysdata.net/clash?config=https://${currentDomain}/sub/${yourUUID}`;
    const singboxSubLink = `https://sublink.alwaysdata.net/singbox?config=https://${currentDomain}/sub/${yourUUID}`;
    
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>订阅链接</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:linear-gradient(135deg,#667eea 0%,#18800e 100%);min-height:100vh;padding:20px}.container{max-width:900px;margin:0 auto;background:#fff;border-radius:15px;padding:30px;box-shadow:0 20px 60px rgba(0,0,0,.3)}h1{color:#667eea;margin-bottom:10px;font-size:2rem;text-align:center}.section{margin-bottom:25px}.section-title{color:#667eea;font-size:16px;font-weight:600;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #667eea}.link-box{background:#f7f9fc;border:1px solid #e1e8ed;border-radius:8px;padding:12px;margin-bottom:10px}.link-label{font-size:16px;color:#666;margin-bottom:6px;font-weight:700}.link-content{display:flex;gap:8px}.link-text{flex:1;background:#fff;padding:8px 12px;border-radius:5px;border:1px solid #ddd;font-size:.8rem;word-break:break-all;font-family:monospace}.copy-btn{background:#667eea;color:#fff;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;font-size:13px;white-space:nowrap}.copy-btn:hover{background:#5568d3}.copy-btn.copied{background:#48c774}.usage-section{background:#fff9e6;border-left:4px solid #ffc107;padding:15px;border-radius:5px;margin-top:25px}.usage-title{color:#f57c00;font-size:1.2rem;font-weight:600;margin-bottom:12px}.usage-item{margin-bottom:12px;font-size:13px;line-height:1.6}.usage-item strong{color:#333;display:block;margin-bottom:4px}.usage-item code{background:#fff;padding:2px 6px;border-radius:3px;color:#e91e63;font-size:13px;border:1px solid #ddd;word-wrap:break-word;word-break:break-all;display:inline-block;max-width:100%}.example{color:#666;font-size:14px;margin-left:8px}.footer{margin-top:30px;padding-top:20px;border-top:1px solid #e1e8ed;text-align:center;font-size:14px;color:#999}.footer a{color:#667eea;text-decoration:none;margin:0 10px}.footer a:hover{text-decoration:underline}@media (max-width:768px){.container{padding:20px}.link-content{flex-direction:column}.copy-btn{width:100%}}</style></head><body><div class="container"><h1>Snippets 订阅中心</h1><div class="section"><div class="section-title">🔗 通用订阅</div><div class="link-box"><div class="link-label">v2rayN / Loon / Shadowrocket / Karing</div><div class="link-content"><div class="link-text" id="v2ray-link">${v2raySubLink}</div><button class="copy-btn" onclick="copyToClipboard('v2ray-link',this)">复制</button></div></div></div><div class="section"><div class="section-title">😺 Clash 系列订阅</div><div class="link-box"><div class="link-label">Mihomo / FlClash / Clash Meta</div><div class="link-content"><div class="link-text" id="clash-link">${clashSubLink}</div><button class="copy-btn" onclick="copyToClipboard('clash-link',this)">复制</button></div></div></div><div class="section"><div class="section-title">📦 Sing-box 系列订阅</div><div class="link-box"><div class="link-label">Sing-box / SFI / SFA</div><div class="link-content"><div class="link-text" id="singbox-link">${singboxSubLink}</div><button class="copy-btn" onclick="copyToClipboard('singbox-link',this)">复制</button></div></div></div><div class="usage-section"><div class="usage-title">⚙️ 自定义路径(节点里的path)使用说明</div><div class="usage-item"><strong>1. 默认路径</strong><code>/?ed=2560</code><div class="example">使用代码里设置的默认proxyip</div></div><div class="usage-item"><strong>2. 带端口的proxyip</strong><code>/proxyip=210.61.97.241:81</code><br><code>/proxyip=proxy.xxxxxxxx.tk:50001</code><br><code>/?ed=2560&proxyip=210.61.97.241:81</code><br><code>/?ed=2560&proxyip=proxy.xxxxxxxx.tk:50001</code></div><div class="usage-item"><strong>3. 域名proxyip</strong><code>/proxyip=jp.yutian.nyc.mn</code><br><code>/?ed=2560&proxyip=jp.yutian.nyc.mn</code></div><div class="usage-item"><strong>4. 全局SOCKS5</strong><code>/proxyip=socks://user:password@host:port</code><br><code>/proxyip=socks5://user:password@host:port</code><br><code>/?ed=2560&proxyip=socks://user:password@host:port</code><br><code>/?ed=2560&proxyip=socks5://user:password@host:port</code></div><div class="usage-item"><strong>5. 全局HTTP/HTTPS</strong><code>/proxyip=http://user:password@host:port</code><br><code>/proxyip=https://user:password@host:port</code><br><code>/?ed=2560&proxyip=http://user:password@host:port</code><br><code>/?ed=2560&proxyip=https://user:password@host:port</code></div><div class="usage-item"><strong>6. 全局SoftEther (SSTP)</strong><code>/ld=sstp://host:443</code><br><code>/?ed=2560&ld=sstp://user:password@host:443</code></div><div class="usage-item"><strong>7. 全局TURN</strong><code>/ld=turn://user:password@host:3478</code><br><code>/?ed=2560&ld=turn://user:password@host:3478</code></div></div><div class="footer"><a href="https://github.com/zaofengyue/CF-Workers-VLESS" target="_blank">GitHub 项目</a>|<a href="https://proxy.fengyue.bond" target="_blank">ProxyIP 检测服务</a>|<a href="https://socks.fengyue.bond" target="_blank">Socks5 检测服务</a></div></div><script>function copyToClipboard(e,t){const n=document.getElementById(e).textContent;navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(n).then(()=>{showCopySuccess(t)}).catch(()=>{fallbackCopy(n,t)}):fallbackCopy(n,t)}function fallbackCopy(e,t){const n=document.createElement("textarea");n.value=e,n.style.position="fixed",n.style.left="-999999px",document.body.appendChild(n),n.select();try{document.execCommand("copy"),showCopySuccess(t)}catch(e){alert("复制失败，请手动复制")}document.body.removeChild(n)}function showCopySuccess(e){const t=e.textContent;e.textContent="已复制",e.classList.add("copied"),setTimeout(()=>{e.textContent=t,e.classList.remove("copied")},2e3)}</script></body></html>`;
}

async function handleHomePage(request) {
    const url = new URL(request.url);
    const currentDomain = url.hostname;
    return new Response(getHomePageHTML(currentDomain), {
        headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
    });
}

async function handleSubtionPage(request) {
    const url = new URL(request.url);
    const currentDomain = url.hostname;
    return new Response(getSubPageHTML(currentDomain), {
        headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
    });
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

function closeSocketQuietly(socket) { 
    try { 
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
            socket.close(); 
        }
    } catch (error) {} 
}

function isSpeedTestSite(hostname) {
    // 允许测速站点正常通行，解除测速阻断以测得真实带宽
    return false;
}

function parseProxyAddress(proxyStr) {
    if (!proxyStr) return null;
    proxyStr = proxyStr.trim();
    // 解析 SSTP (MS-SSTP / SoftEther)
    if (proxyStr.startsWith('sstp://')) {
        try {
            const url = new URL(proxyStr);
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
    if (proxyStr.startsWith('turn://')) {
        try {
            const url = new URL(proxyStr);
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

    if (proxyStr.startsWith('socks://') || proxyStr.startsWith('socks5://')) {
        const urlStr = proxyStr.replace(/^socks:\/\//, 'socks5://');
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
    
    if (proxyStr.startsWith('http://') || proxyStr.startsWith('https://')) {
        try {
            const url = new URL(proxyStr);
            return {
                type: 'http',
                host: url.hostname,
                port: parseInt(url.port) || (proxyStr.startsWith('https://') ? 443 : 80),
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }
    
    if (proxyStr.startsWith('[')) {
        const closeBracket = proxyStr.indexOf(']');
        if (closeBracket > 0) {
            const host = proxyStr.substring(1, closeBracket);
            const rest = proxyStr.substring(closeBracket + 1);
            if (rest.startsWith(':')) {
                const port = parseInt(rest.substring(1), 10);
                if (!isNaN(port) && port > 0 && port <= 65535) {
                    return { type: 'direct', host, port };
                }
            }
            return { type: 'direct', host, port: 443 };
        }
    }
    
    const lastColonIndex = proxyStr.lastIndexOf(':');
    
    if (lastColonIndex > 0) {
        const host = proxyStr.substring(0, lastColonIndex);
        const portStr = proxyStr.substring(lastColonIndex + 1);
        const port = parseInt(portStr, 10);
        
        if (!isNaN(port) && port > 0 && port <= 65535) {
            return { type: 'direct', host, port };
        }
    }
    
    return { type: 'direct', host: proxyStr, port: 443 };
}

export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);
            const pathname = url.pathname;
            let pathProxyIP = null;
            const matchProxy = pathname.match(/\/(?:proxyip|fd|ld)=((?:sstp|turn|socks5|socks|https|http):\/\/[^\s?&#]+)/i) ||
                               pathname.match(/^\/((?:sstp|turn):\/\/[^\s?&#]+)/i) ||
                               pathname.match(/\/(?:proxyip|fd|ld)=([^/?&#]+)/i);
            if (matchProxy) {
                try {
                    pathProxyIP = decodeURIComponent(matchProxy[1]).trim();
                } catch (e) {
                    // 忽略错误
                }

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
                const customProxyIP = pathProxyIP || 
                    url.searchParams.get('fd') || 
                    url.searchParams.get('ld') || 
                    url.searchParams.get('proxyip') || 
                    request.headers.get('fd') || 
                    request.headers.get('ld') || 
                    request.headers.get('proxyip');
                return await handleVlsRequest(request, customProxyIP);
            } else if (request.method === 'GET') {
                if (url.pathname === '/') {
                    return handleHomePage(request);
                }
                
                if (url.pathname === `/${yourUUID}`) {
                    return handleSubtionPage(request);
                }
                
               if (url.pathname.toLowerCase().includes(`/sub/${yourUUID}`)) {
                    const currentDomain = url.hostname;
                    const header = 'v' + 'l' + 'e' + 's' + 's';
                    const nodeLinks = cfip.map(cdnItem => {
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
                        
                        if (!nodeName) {
                            nodeName = `Snippets-${header}`;
                        }

                        return `${header}://${yourUUID}@${host}:${port}?encryption=none&security=tls&sni=${currentDomain}&fp=firefox&allowInsecure=0&type=ws&host=${currentDomain}&path=%2F%3Fed%3D2560#${nodeName}`;
                    });
                    
                    const linksText = nodeLinks.join('\n');
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
            return new Response('Internal Server Error', { status: 500 });
        }
    },
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

            if (isSpeedTestSite(hostname)) {
                throw new Error('Speedtest site is blocked');
            }
            
            if (isUDP) {
                if (port === 53) isDnsQuery = true;
                else throw new Error('UDP is not supported');
            }
            const respHeader = new Uint8Array([version[0], 0]);
            const rawData = chunk.slice(rawIndex);
            if (isDnsQuery) return forwardUDP(rawData, serverSock, respHeader);
            await forwardTCP(addressType, hostname, port, rawData, serverSock, respHeader, remoteConnWrapper, customProxyIP);
        },
    })).catch((err) => {
    });

    return new Response(null, { status: 101, webSocket: clientSock });
}

async function connect2Socks5(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port, username, password } = proxyConfig;
    let socket;
    try {
        socket = connect({ hostname: host, port: port });
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
    } catch (error) {
        if (socket) {
            try {
                socket.close();
            } catch (e) {
                // throw e;
            }
        }
        throw error;
    }
}

async function connect2Http(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port, username, password } = proxyConfig;
    let socket;
    try {
        socket = connect({ hostname: host, port: port });
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
            const startTime = Date.now();
            const timeoutMs = 10000; 
            
            while (headerEndIndex === -1 && bytesRead < maxHeaderSize) {
                if (Date.now() - startTime > timeoutMs) {
                    throw new Error('connection timeout');
                }
                
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
                throw new Error('Invalid HTTP response or response too large');
            }
            
            const headerText = new TextDecoder().decode(responseBuffer.slice(0, headerEndIndex));
            const statusLine = headerText.split('\r\n')[0];
            const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
            
            if (!statusMatch) {
                throw new Error(`Invalid response: ${statusLine}`);
            }
            
            const statusCode = parseInt(statusMatch[1]);
            if (statusCode < 200 || statusCode >= 300) {
                throw new Error(`Connection failed with status ${statusCode}: ${statusLine}`);
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
            throw error;
        }
    } catch (error) {
        // 确保套接字被正确关闭
        if (socket) {
            try {
                socket.close();
            } catch (e) {
                // 忽略关闭错误
            }
        }
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

async function forwardTCP(addrType, host, portNum, rawData, ws, respHeader, remoteConnWrapper, customProxyIP) {
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
        proxyConfig = parseProxyAddress(customProxyIP);
        if (proxyConfig && (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https' || proxyConfig.type === 'sstp' || proxyConfig.type === 'turn')) {
            shouldUseProxy = true;
        } else if (!proxyConfig) {
            proxyConfig = parseProxyAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        }
    } else {
        proxyConfig = parseProxyAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        if (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https' || proxyConfig.type === 'sstp' || proxyConfig.type === 'turn') {
            shouldUseProxy = true;
        }
    }
    
    async function connectWithProxy() {
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
            newSocket = await connectDirect(proxyConfig.host, proxyConfig.port, rawData);
        }
        
        remoteConnWrapper.socket = newSocket;
        newSocket.closed.catch(() => {}).finally(() => closeSocketQuietly(ws));
        connectStreams(newSocket, ws, respHeader, null);
    }
    
    if (shouldUseProxy) {
        try {
            await connectWithProxy();
        } catch (err) {
            throw err;
        }
    } else {
        try {
            const initialSocket = await connectDirect(host, portNum, rawData);
            remoteConnWrapper.socket = initialSocket;
            connectStreams(initialSocket, ws, respHeader, connectWithProxy);
        } catch (err) {
            await connectWithProxy();
        }
    }
}

function parseWsPacketHeader(chunk, token) {
    if (chunk.byteLength < 24) return { hasError: true, message: 'Invalid data' };
    const version = new Uint8Array(chunk.slice(0, 1));
    if (formatIdentifier(new Uint8Array(chunk.slice(1, 17))) !== token) return { hasError: true, message: 'Invalid uuid' };
    const optLen = new Uint8Array(chunk.slice(17, 18))[0];
    const cmd = new Uint8Array(chunk.slice(18 + optLen, 19 + optLen))[0];
    let isUDP = false;
    if (cmd === 1) {} else if (cmd === 2) { isUDP = true; } else { return { hasError: true, message: 'Invalid cmd' }; }
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
                if (webSocket.readyState !== WebSocket.OPEN) controller.error('ws.readyState is not open');
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
        console.error('Stream pipe error:', err);
        closeSocketQuietly(webSocket); 
    });
    if (!hasData && retryFunc) {
        console.log('No data received, retrying...');
        await retryFunc();
    }
}

async function forwardUDP(udpChunk, webSocket, respHeader) {
    try {
        const tcpSocket = connect({ hostname: '8.8.4.4', port: 53 });
        let vlessHeader = respHeader;
        const writer = tcpSocket.writable.getWriter();
        await writer.write(udpChunk);
        writer.releaseLock();
        await tcpSocket.readable.pipeTo(new WritableStream({
            async write(chunk) {
                if (webSocket.readyState === WebSocket.OPEN) {
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
