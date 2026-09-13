

<div align="center">

# Workers & Snippets deploy VLESS + trojan + shadowsocks

**中文** | [English](README_EN.md)

Telegram交流反馈群组: https://t.me/eooceu

基于 Cloudflare Workers & Snippets 的高性能 VLESS+trojan+shadowsocks 代理服务

YouTube视频部署教程：https://youtu.be/GEcKz2NoKlM

Shadowsocks部署视频教程：https://youtu.be/hUPN_69Atow

pages部署视频教程：https://www.youtube.com/watch?v=kNi6OwJ_e5k

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

## 部署步骤

1. **登录 Cloudflare Dashboard**
   - 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 登录你的账户

2. **创建 Worker**
   - 点击 "Workers & Pages"
   - 点击 "Create application"
   - 选择 "Create Worker"
   - 输入 Worker 名称(不要带vless,proxy之类的关键词，建议默认)

3. **上传代码**
   - 将 `_worker.js` 文件内容复制到编辑器
   - 点击 右上角 "Deploy"

4. **绑定 KV 命名空间（开启后台管理持久化配置）**
   - 在左侧菜单点击 "Workers & Pages" -> "KV"
   - 点击 "Create namespace"，名称任意（例如 `CF_VLESS_KV`）
   - 回到刚才创建的 Worker -> 点击 "Settings" -> "Variables and Secrets"
   - 在 "KV Namespace Bindings" 处点击 "Add binding"
   - Variable name（变量名称）填写：`KV`
   - KV namespace 选择刚创建的 `CF_VLESS_KV`
   - 点击 "Deploy" 保存

5. **配置环境变量与域名**
   - 在 Worker 设置中找到 "Settings" → "Variables"
   - 添加所需的环境变量并绑定自定义域名
   - 点击 "Save"

6. **访问与后台管理使用**
   - **前台节点与订阅 (`/`)**：直接访问你的 Worker 域名，输入 `PASSWORD`（默认 `123456`），即可查看节点信息、一键复制全协议/Clash/Sing-box/QX 订阅；
   - **后台管理控制台 (`/admin`)**：访问 `域名/admin`，输入管理员密码 `ADMIN`（默认 `admin`），即可进入可视化后台，随时在线修改 UUID、前台密码、管理员密码、订阅路径、落地 ProxyIP、优选域名、订阅转换后端等，保存后由 KV 自动持久化并全网即时生效！

## snippets / workers 路径进阶用法

### 相关路径说明
<img width="700" height="600" alt="image" src="https://github.com/user-attachments/assets/86b3dd1d-bbca-4786-9bb3-430bf6700024" />

| 类型 | 示例 | 说明 |
|------|------|------|
| **默认路径** | `/?ed=2560` | 使用代码里设置的默认 `proxyip` |
| **域名 proxyip** | `/?ed=2560&proxyip=proxyip.domain.com` 或 `proxyip=proxyip.domain.com`  | 使用域名形式的 `proxyip` |
| **带端口的 proxyip** | `/?ed=2560&proxyip=ip:port` 或 `/proxyip=ip:port` | 使用带端口的 `proxyip` |
| **SOCKS5** | `/?ed=2560&proxyip=socks://user:pass@host:port` 或 `/proxyip=socks://user:pass@host:port` | 使用全局 SOCKS5 出站 协议头可为socks5 |
| **HTTP** | `/?ed=2560&proxyip=http://user:pass@host:port` 或 `/proxyip=http://user:pass@host:port` | 使用全局 HTTP/HTTPS 出站 |


## cloudns 双向解析域名部署snippets统一使用的域名前缀
```bash
_acme-challenge
```

## shadowsocks 节点参数对照图
节点path为SSpath变量或uuid开头，示例：`/5dc15e15-f285-4a9d-959b-0e4fbdd77b63/?ed=2560`   

带proxyip的示例：`/5dc15e15-f285-4a9d-959b-0e4fbdd77b63/?ed=2560&proxyip=xxxx`  v2rayN上设置全局socks5或http出站

小火箭示例: `/5dc15e15-f285-4a9d-959b-0e4fbdd77b63/proxyip=xxxx` 设置socks5或http全局出站,karing,nekobox一样设置


## 许可证

GPL 2.0
