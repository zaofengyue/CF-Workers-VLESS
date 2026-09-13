

<div align="center">

# Workers & Snippets deploy VLESS + trojan + shadowsocks

**中文** | [English](README_EN.md)

[ProxyIP 检测](https://proxy.fengyue.bond) | [Socks5 检测](https://socks.fengyue.bond)

基于 Cloudflare Workers & Snippets 的高性能 VLESS + Trojan + Shadowsocks 代理服务

</div>

## 功能特性

- 🚀 基于 Cloudflare Workers 和 snippets 的高性能代理
- 🌐 vless + trojan + shadowsocks 三协议支持
- ⚙️ 集成 Web 后台管理面板，绑定 KV 实现动态可视化配置（免重新部署）
- 🔐 密码保护的主页与管理面板访问
- 📱 支持多种客户端(v2rayN,shadowrocket,loon,karing,clash,sing-box等)
- 🌐 自动故障转移和负载均衡
- 📊 实时连接测试和状态监控
- 📊 默认禁用speedtest测速

## 环境变量配置

### 必需/常用安全变量

| 变量名 | 描述 | 默认值 | 示例 |
|--------|------|--------|------|
| `PASSWORD` | 前台用户页面访问密码 (查看节点和订阅) | `123456` | `your_web_password` |
| `ADMIN`或`admin` | 后台管理控制台密码 (访问 `/admin`) | `admin` | `your_admin_password` |

### workers可选变量与 KV 绑定

| 变量名 | 描述 | 默认值 | 示例 |
|--------|------|--------|------|
| `KV`或`DATA_KV`或`CONFIG_KV` | Cloudflare KV 命名空间变量绑定 | 空 | 用于后台持久化保存全部配置 |
| `UUID`或`AUTH`或`uuid` | 用户UUID | `5dc15e15-f285-4a9d-959b-0e4fbdd77b63` | `your-uuid` |
| `PROXYIP`或`proxyip`或`proxyIP` | 代理服务器IP列表 | `proxy.xxxxxxxx.tk:50001` | `tw.tp81.netlib.re` |
| `SUB_PATH`或`subpath` | 订阅路径 | `link` | `sub` |
| `DISABLE_TROJAN`或`CLOSE_TROJAN` | 是否关闭Trojan协议，true关闭，false开启 | `false` | 默认开启 |
| `DISABLE_SS`或`CLOSE_SS` | 是否关闭Shadowsocks协议，true关闭，false开启 | `false` | 默认开启 |
| `SSPATH`或`sspath` | Shadowsocks路径验证，为空则使用UUID作为验证路径 | 空 (使用UUID) | `mysecretpath` |

## 部署方式

### 方式一：Cloudflare Pages 压缩包直接上传部署 (推荐，最便捷)

1. **下载最新部署压缩包**
   - 进入本项目的 [Releases 页面](../../releases/tag/latest) 下载最新的 **`pages.zip`** 资产文件。

2. **上传部署到 Pages**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)；
   - 点击左侧 **"Workers & Pages"** -> 点击 **"Create application"**；
   - 选择 **"Pages"** 标签页 -> 点击 **"Upload assets"**（直接上传资产）；
   - 输入项目名称（如 `my-proxy-node`）；
   - 将下载的 **`pages.zip`** 压缩包拖入上传区，点击 **"Deploy site"** 即可一键完成部署！

3. **绑定 KV 命名空间（开启后台管理持久化配置）**
   - 在左侧菜单点击 "Workers & Pages" -> "KV" 创建命名空间（如 `CF_VLESS_KV`）；
   - 进入刚才部署好的 Pages 项目 -> 点击 **"Settings"** -> **"Variables and Secrets"**；
   - 在 **"KV Namespace Bindings"** 处点击 **"Add binding"**；
   - Variable name（变量名称）填写：`KV`，目标选择刚创建的 `CF_VLESS_KV` 并保存。

4. **绑定自定义域名与访问**
   - 在 Pages 项目设置中点击 **"Custom domains"** 绑定你的域名；
   - 访问 `https://你的域名/` 输入密码查看节点；
   - 访问 `https://你的域名/admin` 进入后台管理面板。

---

### 方式二：Cloudflare Workers 复制代码部署

1. **登录 Cloudflare Dashboard**
   - 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)，点击 "Workers & Pages" -> "Create application" -> 选择 "Create Worker"；
   - 输入 Worker 名称，点击 "Deploy"；

2. **上传代码**
   - 进入刚创建的 Worker，点击 "Edit code"；
   - 将项目中的 `_worker.js` 文件全部内容复制并替换到编辑器中，点击右上角 "Deploy" 保存；

3. **绑定 KV 命名空间（开启后台管理持久化配置）**
   - 在左侧菜单点击 "Workers & Pages" -> "KV" 创建命名空间；
   - 回到 Worker -> 点击 "Settings" -> "Variables and Secrets" -> "KV Namespace Bindings" 处添加绑定：变量名称为 `KV`；

4. **访问与后台管理使用**
   - **前台节点与订阅 (`/`)**：访问你的 Worker 域名，输入 `PASSWORD`（默认 `123456`），即可查看节点信息、一键复制全协议/Clash/Sing-box/QX 订阅；
   - **后台管理控制台 (`/admin`)**：访问 `域名/admin`，输入管理员密码 `ADMIN`（默认 `admin`），进入后台即可在线修改并持久化所有配置！

## snippets / workers 路径进阶用法

### 相关路径说明
<img width="700" height="600" alt="image" src="https://github.com/user-attachments/assets/86b3dd1d-bbca-4786-9bb3-430bf6700024" />

> **参数说明**：
> - `fd=`：**分流代理** (Forward Proxy / IP proxy)
> - `ld=`：**落地代理** (Landing Proxy / socks5 / http)
> - `proxyip=`：向前兼容保留的原参数名，效果与 `fd=` / `ld=` 相同

| 类型 | 示例 | 说明 |
|------|------|------|
| **默认路径** | `/?ed=2560` | 使用代码/KV里设置的默认代理 |
| **域名出站 (分流 fd)** | `/?ed=2560&fd=proxyip.domain.com` 或 `/fd=proxyip.domain.com` | 使用域名形式的分流代理 |
| **带端口出站 (分流 fd)** | `/?ed=2560&fd=ip:port` 或 `/fd=ip:port` | 使用带端口的分流代理 |
| **SOCKS5 落地代理 (ld)** | `/?ed=2560&ld=socks5://user:pass@host:port` 或 `/ld=socks5://user:pass@host:port` | 使用全局 SOCKS5 落地出站 (支持 socks/socks5) |
| **HTTP 落地代理 (ld)** | `/?ed=2560&ld=http://user:pass@host:port` 或 `/ld=http://user:pass@host:port` | 使用全局 HTTP/HTTPS 落地出站 |
| **SoftEther (SSTP) 落地代理 (ld)** | `/?ed=2560&ld=sstp://host:443` 或 `/ld=sstp://user:pass@host:443` | 使用全局 MS-SSTP / SoftEther 协议落地出站 (TLS + PPP 隧道) |
| **TURN 落地代理 (ld)** | `/?ed=2560&ld=turn://user:pass@host:3478` 或 `/ld=turn://user:pass@host:3478` | 使用全局 RFC 5766 / RFC 6062 TURN TCP relay 落地出站 |
| **兼容老参数 proxyip** | `/?ed=2560&proxyip=...` 或 `/proxyip=...` | 向下兼容原有配置 |


## cloudns 双向解析域名部署snippets统一使用的域名前缀
```bash
_acme-challenge
```

## shadowsocks 节点参数对照图
节点path为SSpath变量或uuid开头，示例：`/5dc15e15-f285-4a9d-959b-0e4fbdd77b63/?ed=2560`   

带落地代理的示例：`/5dc15e15-f285-4a9d-959b-0e4fbdd77b63/?ed=2560&ld=socks5://xxxx` 或 `&fd=xxxx`

小火箭示例: `/5dc15e15-f285-4a9d-959b-0e4fbdd77b63/ld=socks5://xxxx` 设置socks5或http全局出站,karing,nekobox一样设置


## 优选远程订阅 / Gist 文本链接支持
在后台管理面板（或环境变量 `CFIP`）中，优选列表不仅支持填入普通节点：
```text
优选域名:端口#节点备注
优选IP:端口#节点备注
[IPv6]:端口#节点备注
```
还**原生支持填入远程文本链接**（如 GitHub Gist Raw 链接、远程优选订阅文本等）：
```text
https://gist.githubusercontent.com/username/.../raw/cfip.txt
https://example.com/best_cf_ips.txt
```
系统在拉取订阅时会自动抓取该链接中的文本，自动展开并与其它优选节点合并，无需手动频繁更新优选 IP。


## 许可证

GPL 2.0

