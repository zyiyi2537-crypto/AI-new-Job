# JobPilot CN

JobPilot CN 是一个面向国内求职场景的本地 AI 求职工作台。当前版本先打通“导入原始简历 → 导入岗位 JD → 解释性评分 → 生成岗位定制简历 → 跟踪投递状态”的完整闭环。

完整产品范围、验收标准和路线图见 [产品需求文档](docs/PRD.md)。

> 当前为可运行的本地 MVP。BOSS 直聘、智联招聘、猎聘和拉勾通过用户触发的 Chrome 采集助手接入，也支持公开岗位 URL、手工 JD 和 JSON 导入。系统不会绕过验证、自动提交投递或自动向 HR 发送消息。

## 已实现

- 上传 PDF、DOCX、Markdown、TXT 或 JSON 简历，自动建立结构化简历母版
- 重复文件识别和本地版本管理
- OpenAI-compatible 真实模型连接、连接测试和 AI 深度岗位分析
- BOSS、智联、猎聘、拉勾搜索入口与 Chrome 当前页面/列表采集助手
- 公开岗位 URL 解析、单个 JD 录入和最多 500 条 JSON 导入
- 五维岗位评分：硬性条件、技能匹配、经历证据、方向偏好、岗位质量
- 展示命中关键词、证据缺口、评分原因和置信度
- 为每个岗位生成独立简历版本，不写入原始简历之外的经历事实
- 投递看板及状态流转，保留人工确认
- SQLite 本地存储，原始简历不上传第三方服务

## 快速开始

环境要求：Node.js 22.5 或更高版本（项目使用 Node 内置 SQLite）。

```powershell
npm install
npm run dev
```

打开 `http://127.0.0.1:5173`。API 默认监听 `http://127.0.0.1:8787`。

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
```

## 数据与配置

- 数据库：`data/jobpilot.db`
- 原始简历：`data/uploads/`
- 服务端口：环境变量 `PORT`，默认 `8787`
- 监听地址：环境变量 `HOST`，默认 `127.0.0.1`
- 数据目录：环境变量 `DATA_DIR`，默认 `data`

### AI 配置

可直接在“设置 → AI 模型连接”中输入 Base URL、模型名和 API Key。通过界面输入的密钥只保存在当前服务进程内，重启后失效。

需要持久化配置时，复制 `.env.example` 为 `.env` 并填写：

```dotenv
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=gpt-5-mini
```

本地 Ollama 可使用 `http://127.0.0.1:11434/v1`，API Key 留空。点击“测试连接”成功后，岗位详情会开放“AI 深度分析”。发送给模型的简历内容不包含手机号和邮箱。

### Chrome 岗位采集助手

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
| `POST` | `/api/jobs/import` | 导入一个或最多 500 个岗位 |
| `POST` | `/api/jobs/import-url` | 解析公开岗位链接 |
| `POST` | `/api/jobs/capture` | 接收 Chrome 采集助手岗位 |
| `POST` | `/api/jobs/seed` | 载入演示岗位 |
| `POST` | `/api/jobs/analyze` | 批量评分 |
| `POST` | `/api/jobs/:id/analyze` | 规则或 AI 深度分析 |
| `POST` | `/api/jobs/:id/variants` | 生成岗位定制简历 |
| `POST` | `/api/ai/config` | 加载当前进程 AI 配置 |
| `POST` | `/api/ai/test` | 测试真实模型连接 |
| `PUT` | `/api/applications/:jobId/status` | 更新投递状态 |

## 平台采集边界

平台采集采用本地 Chrome 扩展，在用户主动点击后读取当前可见页面。平台页面结构变化时，可以使用公开 URL 或手工 JD 作为降级入口。平台条款和反自动化策略可能变化，因此本项目不提供验证码绕过、无人值守账号控制或批量自动投递。

## 技术结构

```text
src/client/    React + Vite 工作台
src/server/    Fastify API、解析、评分和 SQLite 数据层
src/shared/    前后端共享类型
extension/     Chrome 本地岗位采集助手
data/          本地运行数据（不进入 Git）
```

## 许可证

本项目使用 MIT License。第三方依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
