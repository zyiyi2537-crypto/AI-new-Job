# JobPilot CN

JobPilot CN 是一个面向国内求职场景的本地 AI 求职工作台。当前版本打通“导入原始简历 → 自动规划搜索方向 → 扫描岗位 JD → 自动评分 → 批量生成岗位定制简历 → 跟踪投递状态”的完整闭环。

完整产品范围、验收标准和路线图见 [产品需求文档](docs/PRD.md)。

> 当前为可运行的本地 MVP。系统会先从简历母版提取目标职位和真实技能，自动生成多组搜索方向；桌面模式可直接打开 BOSS 直聘、智联招聘、猎聘和拉勾，扫描列表后自动评分，并为 Top 3 高匹配岗位生成独立简历。系统不会绕过验证、自动提交投递或自动向 HR 发送消息。

## 已实现

- 上传 PDF、DOCX、Markdown、TXT 或 JSON 简历，自动建立结构化简历母版
- 重复文件识别和本地版本管理
- OpenAI-compatible 真实模型连接、连接测试和 AI 深度岗位分析
- 根据简历母版自动生成 3–5 组岗位搜索方向，AI 不可用时回退本地规则
- BOSS、智联、猎聘、拉勾内置桌面浏览器，保留独立登录态并支持当前页/列表采集
- Chrome 当前页面/列表采集助手，可在普通网页模式下作为备用方案
- 公开岗位 URL 解析、单个 JD 录入和最多 500 条 JSON 导入
- 五维岗位评分：硬性条件、技能匹配、经历证据、方向偏好、岗位质量
- 展示命中关键词、证据缺口、评分原因和置信度
- 扫描 JD 后自动规则预评分，一键为 Top 3 高匹配岗位生成独立简历
- 定制版本按 JD 重新排列相关章节和原始经历要点，不写入母版之外的事实
- 投递看板及状态流转，保留人工确认
- SQLite 本地存储，原始简历不上传第三方服务

## 快速开始

环境要求：Node.js 22.5 或更高版本（项目使用 Node 内置 SQLite）。推荐使用桌面模式：

```powershell
npm install
npm run desktop
```

该命令会完成构建、启动本地服务并打开 JobPilot CN 桌面窗口。在“岗位发现”中可直接登录和浏览招聘网站，登录态保存在 Electron 的独立本地会话中。

普通网页开发模式：

```powershell
npm run dev
```

打开 `http://127.0.0.1:5173`。普通网页受浏览器安全策略限制，不能直接嵌入招聘网站，应使用 Chrome 采集助手或公开 URL 导入。

生产构建与单进程启动：

```powershell
npm run build
npm start
```

此时打开 `http://127.0.0.1:8787`。

## 验证命令

```powershell
npm run typecheck
npm test
npm run build
npm run test:desktop
```

## 数据与配置

- 数据库：`data/jobpilot.db`
- 原始简历：`data/uploads/`
- 服务端口：环境变量 `PORT`，默认 `8787`
- 监听地址：环境变量 `HOST`，默认 `127.0.0.1`
- 数据目录：环境变量 `DATA_DIR`，默认 `data`

### AI 配置

可直接在“设置 → AI 模型连接”中输入 Base URL、模型名和 API Key。Base URL 可以填写服务域名、带 `/v1` 的地址或完整 `/chat/completions` 地址；连接测试会自动识别端点并显示最终请求地址。通过界面输入的密钥只保存在当前服务进程内，重启后失效。

需要持久化配置时，复制 `.env.example` 为 `.env` 并填写：

```dotenv
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=gpt-5-mini
```

本地 Ollama 可使用 `http://127.0.0.1:11434/v1`，API Key 留空。点击“测试连接”成功后，岗位详情会开放“AI 深度分析”。发送给模型的简历内容不包含手机号和邮箱。

### 内置招聘浏览器

运行 `npm run desktop` 后，“岗位发现”会出现内置招聘浏览器：

1. 系统根据当前简历母版自动生成搜索方向并默认打开最高匹配方向。
2. 选择一个推荐方向和 BOSS、智联、猎聘或拉勾。
3. 在内置页面中完成必要的登录或验证码，点击“扫描并匹配”。
4. 系统自动导入 JD 并完成规则预评分。
5. 点击“生成 Top 3 简历”，为高匹配岗位批量建立定制版本；AI 已配置时会先进行深度分析。

内置浏览器使用持久化的独立会话，不读取日常 Chrome 的密码、历史记录或 Cookie。遇到登录、验证码或设备验证时由用户在可见页面中完成。

### Chrome 岗位采集助手（备用）

1. 打开 `chrome://extensions/` 并开启开发者模式。
2. 点击“加载已解压的扩展程序”。
3. 选择 `D:\toudi\extension`。
4. 在招聘网站打开岗位详情或搜索列表，点击扩展图标进行采集。

采集助手读取当前页面中用户已经可以看到的岗位文字，不读取 Cookie、密码和浏览记录。页面要求登录或验证时，由用户在网站中正常完成。

`data/`、`.env`、构建产物和浏览器会话目录均被 Git 忽略。请勿提交个人简历、账号 Cookie 或招聘平台登录信息。

## API 概览

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/resumes/import` | 上传并解析原始简历 |
| `GET` | `/api/resumes/master` | 获取当前简历母版 |
| `POST` | `/api/search-plan` | 根据简历母版生成搜索方向 |
| `POST` | `/api/jobs/import` | 导入一个或最多 500 个岗位 |
| `POST` | `/api/jobs/import-url` | 解析公开岗位链接 |
| `POST` | `/api/jobs/capture` | 接收 Chrome 采集助手岗位 |
| `POST` | `/api/jobs/seed` | 载入演示岗位 |
| `POST` | `/api/jobs/analyze` | 批量评分 |
| `POST` | `/api/jobs/prepare` | 预筛岗位并批量生成高匹配简历 |
| `POST` | `/api/jobs/:id/analyze` | 规则或 AI 深度分析 |
| `POST` | `/api/jobs/:id/variants` | 生成岗位定制简历 |
| `POST` | `/api/ai/config` | 加载当前进程 AI 配置 |
| `POST` | `/api/ai/test` | 测试真实模型连接 |
| `PUT` | `/api/applications/:jobId/status` | 更新投递状态 |

## 平台采集边界

平台采集采用 Electron 内置浏览器或本地 Chrome 扩展，在用户主动点击后读取当前可见页面。平台页面结构变化时，可以使用公开 URL 或手工 JD 作为降级入口。平台条款和反自动化策略可能变化，因此本项目不提供验证码绕过、无人值守账号控制或批量自动投递。

## 技术结构

```text
src/client/    React + Vite 工作台
src/server/    Fastify API、解析、评分和 SQLite 数据层
src/shared/    前后端共享类型
electron/      Windows 桌面壳层和真实浏览器验收脚本
extension/     Chrome 本地岗位采集助手
data/          本地运行数据（不进入 Git）
```

## 许可证

本项目使用 MIT License。第三方依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
