# 拆解 LAB · AI 工程拆解

上传一张物体照片（如打火机、圆珠笔、电钻、水龙头……），AI 识别物体并推断其内部结构，生成可交互的 3D 拆解模型，可以一个零件一个零件地查看。

线上部署：**GitHub → Cloudflare Workers 自动部署**（推送代码即自动发布）。本地也可以直接 `node server.js` 运行。

---

## 一、部署到 Cloudflare（GitHub 自动部署）

### 1. 上传到 GitHub

在 GitHub 新建一个仓库（公开/私有都可以），把本文件夹推上去：

```bash
git init            # 文件夹里已有 .git 可跳过
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

`.env`、`.dev.vars` 已在 `.gitignore` 里，**密钥不会被上传**。

### 2. 在 Cloudflare 连接仓库

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com) → **Workers 和 Pages** → **创建** → **导入存储库（Import a repository）**。
2. 授权 GitHub，选择刚才的仓库。
3. 配置：
   - **项目名称**：`engineering-demolition`（必须与 `wrangler.jsonc` 里的 `name` 一致；想换名字就两边一起改）
   - **构建命令**：留空
   - **部署命令**：`npx wrangler deploy`（默认值）
   - **根目录**：`/`
4. 点 **保存并部署**。约 1 分钟后会得到一个 `https://engineering-demolition.<你的子域>.workers.dev` 地址。

之后每次 `git push` 到 main 分支，Cloudflare 都会自动重新部署；推送到其它分支会生成预览版本。

### 3. 设置 AI 密钥（必须）

Worker → **设置（Settings）** → **变量和机密（Variables and Secrets）** → **添加**：

| 名称 | 类型 | 值 |
|---|---|---|
| `ANTHROPIC_API_KEY` | **机密 Secret** | 你的 Claude API Key |
| `ACCESS_CODE` | 机密 Secret | 自定义访问码（**强烈建议**，见下） |
| `ANTHROPIC_MODEL` | 文本（可选） | 默认 `claude-sonnet-5-5` |

使用 OpenAI 兼容接口（通义千问 VL、智谱 GLM-4V 等）时改为设置：`AI_PROVIDER=openai`、`OPENAI_API_KEY`（Secret）、`OPENAI_BASE_URL`、`OPENAI_MODEL`。

保存后立即生效，无需重新部署。页面右上角显示「AI 已连接」即配置成功。

> **访问码**：网站是公开的，任何人都能打开。不设访问码，别人也可以上传照片，消耗的是你的 API 额度。设置 `ACCESS_CODE` 后，上传时必须输入访问码（浏览器会记住）；浏览示例和已有模型不受影响。

### 4.（可选）绑定自己的域名

Worker → **设置** → **域和路由** → **添加** → 自定义域。`workers.dev` 域名在国内访问不稳定，建议绑定自己托管在 Cloudflare 的域名。

### 关于运行环境

- AI 生成一次通常需要 30–120 秒。Worker 会先返回连接并每 10 秒发送保活数据，避免 Cloudflare 超时断开（524）。等待 AI 不计入 Worker 的 CPU 时间，免费套餐即可运行。
- `wrangler.jsonc` 开启了 Smart Placement，让 Worker 靠近 AI 接口所在地区运行。如果出现 Anthropic 报「地区不支持」，可以把 `ANTHROPIC_BASE_URL` 设为 [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) 或其它中转地址。

---

## 二、浏览器插件：让用户用自己的模型

网站默认用服务器上配置的密钥（花你的额度）。用户安装 `extension/` 里的 Chrome 插件后，可以在插件里填**他自己的**模型和密钥；再访问你的网站时，上传照片会由插件直接调用他的模型，不经过你的服务器，也不花你的额度。

```
网页 ──postMessage──► 插件内容脚本 ──► 插件后台 ──直接调用──► 用户自己的模型（DeepSeek / 通义 / 智谱 / 豆包 / OpenAI / Claude）
  ▲                       │ 从网站读取同一份提示词（/api/prompt）
  └──── 零件 JSON（流式进度）◄─┘
```

- **密钥安全**：密钥只存在用户浏览器的插件存储里（`chrome.storage.local`），不同步、不发给网站。
- **防滥用**：除 localhost 外，网站第一次调用时，插件会打开设置页请用户点「允许」，陌生网站无法偷偷消耗用户额度。
- **两种来源可切换**：上传对话框里可以选「我的模型（浏览器插件）」或「网站提供的模型」，没装插件时自动用网站模型。
- **提示词同源**：插件从网站 `/api/prompt` 读取提示词。修改 `server/prompt.js` 并推送后，插件用户自动用上新提示词，插件不用更新。

### 用户如何安装（开发者模式）

网站上传对话框里有「安装插件，用自己的模型」入口，会提供 `/downloads/teardown-extension.zip` 的下载和安装步骤：

1. 下载并解压插件压缩包。
2. Chrome / Edge 打开 `chrome://extensions`，打开「开发者模式」，点「加载已解压的扩展程序」，选择解压出的文件夹。
3. 点击工具栏里的插件图标，选服务商预设，填 API Key，点「测试连接」后保存。
4. 回到网站刷新即可。

### 修改插件后

- 改完 `extension/` 后运行 `npm run pack:ext`，重新生成 `public/downloads/teardown-extension.zip`，再一起提交推送。
- **自定义域名**：插件默认只在 `*.workers.dev` 和 localhost 上生效。如果网站绑定了自己的域名，要在 `extension/manifest.json` 的 `content_scripts.matches` 里加一行，比如 `"https://chaijie.example.com/*"`，然后重新打包。
- **上架 Chrome 应用商店**（可选）：把 `extension/` 打成 zip，到 [Chrome 开发者控制台](https://chrome.google.com/webstore/devconsole) 提交（一次性注册费 5 美元）。上架后用户可以一键安装，不用开开发者模式。

---

## 三、本地运行

**最简单（零依赖）：** 安装 Node.js 18+，复制 `.env.example` 为 `.env` 并填入密钥，然后 Windows 双击 `start.bat`，或运行 `node server.js`，打开 http://localhost:5173 。

**模拟线上环境：** `npm install` 后，复制 `.env.example` 为 `.dev.vars`，运行 `npm run dev`（wrangler 本地运行 Worker），打开 http://localhost:8787 。

不配置密钥也能打开网站，浏览内置的「一次性打火机」和「按动式圆珠笔」示例。

---

## 功能

| 功能 | 说明 |
|---|---|
| 上传照片 · AI 拆解 | 拖入/选择/粘贴图片，可附补充说明；浏览器端自动压缩后发送 |
| 整机总览 | 装配状态，材质渲染 |
| 爆炸拆解 | 所有零件沿拆卸方向展开，可调爆炸距离 |
| 内部透视 | 外壳 / 透明外罩 / 半剖视图 / 隐藏外壳 四种方式查看内部 |
| 结构线框 | 线框显示，看清零件轮廓和配合关系 |
| 逐件拆解 | 按拆卸顺序一步一步拆下零件，可自动播放（← → 键切换） |
| 运动演示 | 曲轴、飞轮、齿轮转动，活塞按真实曲柄连杆规律往复，连杆随之摆动；外壳自动透明，可调转速、暂停 |
| 展示背景 | 浅色工作室 / 深色展厅一键切换；电脑上自动开启环境光遮蔽（网址加 `?ao=0` 可关闭） |
| 零件详情 | 点击模型或左侧列表：高亮、聚焦，右侧显示作用、材质、尺寸、结构说明；双击列表或点「单独查看」只显示该零件 |
| 显示/隐藏、配色 | 每个零件可单独隐藏；材质展示 / 按部件组分色 |
| 历史记录 | 拆解结果保存在浏览器本地（最近 12 个） |
| 导入/导出 | 拆解结果导出为 JSON 分享，再导入查看 |
| 截图 / 全屏 | 视图区右上角 |

## 零件模板与运动

AI 除了用方块、圆柱等基础形状拼零件，还可以直接调用常用机械零件模板（`public/js/templates.js`）：
螺栓 `bolt`、螺母 `nut`、轴承 `bearing`、环状阀片 `valvePlate`、法兰 `flange`、皮带轮 `pulley`、带散热片缸体 `finnedCylinder`、曲轴 `crankshaft`、活塞 `piston`、连杆 `conrod`、螺杆 `threadedRod`。
重复件可用 `array`（圆周 / 线性阵列）一次写完。

会动的零件带 `motion` 字段：`rotate`（连续转动）、`swing`（摆动）、`oscillate`（往复移动）、`slider`（曲柄滑块，活塞）、`conrod`（连杆）。
内置示例「单缸风冷空气压缩机」演示了完整的曲柄连杆机构；「石化四缸往复机」（`public/js/sample-rc04.js`）演示了四拐曲轴带动四列连杆、十字头、活塞的多列相位运动，并用代码批量生成对称结构。两者都可作为数据格式参考。

## 工作原理

```
浏览器 ──照片──► /api/analyze（Cloudflare Worker 或本地 server.js）──► 视觉大模型
                                                                     │ 按 JSON Schema 输出：
                                                                     │ 物体信息 + 零件清单（形状、尺寸、位置、
                                                                     │ 材质、颜色、外壳、爆炸位移、拆卸顺序、说明）
浏览器 ◄──────────────────────── 零件 JSON ◄──────────────────────────┘
  └─ Three.js 用基础几何体（方块、圆柱、空心管、弹簧、齿轮、回转体、拉伸体等）组装成 3D 模型
```

## 项目结构

```
wrangler.jsonc         Cloudflare Workers 配置
worker/index.js        Worker 入口（/api/*，其余请求交给静态资源）
server/ai.js           AI 调用核心（Worker 与本地共用）
server/prompt.js       AI 提示词与 JSON Schema —— 想让 AI 拆得更细，改这里
server.js              本地 Node 服务器
extension/             Chrome 插件（用户自带模型）
scripts/pack-extension.mjs  打包插件 → public/downloads/
public/                网页（静态资源）
  js/app.js            三维场景、交互、上传流程
  js/geometry.js       形状 → Three.js 几何体 / 材质
  js/normalize.js      AI 返回数据清洗
  js/samples.js        内置示例（也是数据格式参考）
  js/sample-rc04.js    四缸往复压缩机示例（代码生成）
  vendor/three/        Three.js r170（本地化，无需 CDN）
```

## 注意

- 内部结构是 AI 根据外观和同类产品的工程常识**推断**的示意模型，不是该型号的真实图纸；右侧「推断说明」会列出推断的部分。
- 密钥只保存在 Cloudflare 的 Secret（或本地 `.env`）中，不会发到浏览器。
