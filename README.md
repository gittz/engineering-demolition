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

## 二、本地运行

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
| 零件详情 | 点击模型或左侧列表：高亮、聚焦，右侧显示作用、材质、尺寸、结构说明；双击列表或点「单独查看」只显示该零件 |
| 显示/隐藏、配色 | 每个零件可单独隐藏；材质展示 / 按部件组分色 |
| 历史记录 | 拆解结果保存在浏览器本地（最近 12 个） |
| 导入/导出 | 拆解结果导出为 JSON 分享，再导入查看 |
| 截图 / 全屏 | 视图区右上角 |

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
public/                网页（静态资源）
  js/app.js            三维场景、交互、上传流程
  js/geometry.js       形状 → Three.js 几何体 / 材质
  js/normalize.js      AI 返回数据清洗
  js/samples.js        内置示例（也是数据格式参考）
  vendor/three/        Three.js r170（本地化，无需 CDN）
```

## 注意

- 内部结构是 AI 根据外观和同类产品的工程常识**推断**的示意模型，不是该型号的真实图纸；右侧「推断说明」会列出推断的部分。
- 密钥只保存在 Cloudflare 的 Secret（或本地 `.env`）中，不会发到浏览器。
