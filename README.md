# dsh-ui-custom

把 ai-tcms 网关控制台里的「系统外观」独立出来，做成一个**不依赖网关**的 dsh 插件：
装进任意 DeepSeek Harness，就能在 `设置 → 系统外观` 里改品牌、并让改动作用到 dsh 自己的界面上。

- 纯 JS，无构建步骤，克隆下来即可安装
- Node 半只做一件事：一条同源 JSON 路由，用来读写本机的外观记录
- 浏览器半通过 dsh 官方槽位（`sidebar.brand.mark` / `sidebar.brand.name` /
  `conversation.hero.brand.mark`）接管界面，旧构建自动退回 DOM 兜底
- 不依赖 ai-tcms、网关、relay、账号或任何外部服务

## 能改什么

| 设置 | 作用在 dsh 的哪里 |
| --- | --- |
| 系统名称 | 侧边栏品牌名、浏览器标签页标题 |
| Logo 形式 + 徽标文字/图片 | 侧边栏左上角徽标、浏览器标签页图标 |
| 徽标字号 | 文字徽标的字号（10–28） |
| 会话头像 | 会话页 hero 徽标、会话运行中的头像 |
| 会话页标题 | 会话页原生标题（探索未至之境 / Into the Unknown） |
| 会话运行中文案 | 会话运行中文案（深度求索中 / Deep diving），时长后缀保留 |

任何一项**留空即保持 dsh 原生样式**：全新安装不会改变界面的任何像素。

### 与 ai-tcms 网关版的差异

网关版还有一个「登录页粒子文字」。dsh 自身没有登录页（sign-in 只是账号设置里的弹窗），
这个字段在任何 dsh 里都没有承载面，因此没有迁移过来。

## 安装

### 方式一：装进当前 profile（手动）

```bash
git clone https://github.com/agaoaagao/dsh-ui-custom.git ~/development/dsh-ui-custom
```

在 profile 的 `package.json`（例如 `~/.dsh/profiles/web/package.json`）里：

```jsonc
{
  "dependencies": {
    "dsh-ui-custom": "link:/Users/you/development/dsh-ui-custom"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-ui-custom"]
    }
  }
}
```

再在同一个 profile 的 `cordis.patch.yml` 里给插件一行配置（可选，用来指定数据目录）：

```yaml
- id: dsh-ui-custom
  name: dsh-ui-custom
  config:
    dataRoot: !!js dshHomePath('dsh-ui-custom')
```

重启 dsh web 即可。`dataRoot` 省略时回退到 `$DSH_HOME/dsh-ui-custom`，再回退到 `~/.dsh/dsh-ui-custom`。

### 方式二：在 dsh 里安装

插件包自带 `cordis.patch.yml`（`dsh.bundle.patch`），支持 bundle 安装的 dsh 可以按包安装：

- 把仓库目录作为 bundle 安装（`plugin_manager` 的 `install_bundle`，target 填仓库绝对路径），
  或
- 在 profile 里 `link:` 后由 dsh 的插件管理界面启用。

## 配置项

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `name` | string | ≤ 40 字符 |
| `logoMode` | `image` \| `text` | 默认 `image` |
| `logo` | string | 空、`data:image/...` 或 `https://`，编码后 ≤ 400000 字符（≈300KB 原图） |
| `logoText` | string | ≤ 4 字符 |
| `logoTextSize` | number | 10–28，默认 17 |
| `avatar` | string | 同 `logo` |
| `headlineText` | string | ≤ 40 字符 |
| `runningText` | string | ≤ 32 字符 |

## 数据与 API

记录存在 `<dataRoot>/config.json`（原子写入）。同源路由：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/dsh-ui-custom/api/config` | 读取（文件不存在时返回默认值） |
| `PUT` / `POST` | `/dsh-ui-custom/api/config` | 校验后整体保存 |
| `DELETE` | `/dsh-ui-custom/api/config` | 恢复默认 |
| `GET` | `/dsh-ui-custom/api/health` | `{ ok, plugin }` |

请求体上限 2MB。非法字段返回 `400 { ok:false, code:'INVALID_CONFIG', field, message }`。

想彻底清理：在设置页点「恢复默认」，或删掉 `<dataRoot>/config.json` 后重启。

## 与网关版并存

两边都装时后应用的一方生效；如果网关侧还保留「系统外观」，建议只保留一处（推荐本插件），
避免网关注入脚本和本插件互相覆盖。

## 开发

```bash
npm test        # node --test：配置校验、存储、HTTP 路由、插件装配（含真 HTTP 端到端）
```

代码结构：

- `index.js` — Node 半：解析 `dataRoot`、打开存储、注册路由
- `lib/config.js` — 配置模型：宽容读取（`normalizeConfig`）+ 严格写入（`validateConfig`）
- `lib/store.js` — 原子写入的 JSON 存储
- `lib/http.js` — 同源 JSON 路由
- `client.js` — 浏览器半：设置页 + 界面绘制（槽位优先，DOM 兜底）

## 仓库

- GitHub: <https://github.com/agaoaagao/dsh-ui-custom>
- Gitea: <https://gitea.colacao.top/colacao/dsh-ui-custom>

## License

MIT
