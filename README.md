# JobPilot CN

JobPilot CN 是一个面向国内求职场景的本地 AI 求职工作台。当前版本先打通“导入原始简历 → 导入岗位 JD → 解释性评分 → 生成岗位定制简历 → 跟踪投递状态”的完整闭环。

完整产品范围、验收标准和路线图见 [产品需求文档](docs/PRD.md)。

> 当前为可运行的 MVP。BOSS 直聘、智联招聘、猎聘等平台的自动采集适配器仍在开发中；目前通过手工粘贴 JD 或 JSON 接口导入岗位。系统不会自动提交投递或自动向 HR 发送消息。

## 已实现

- 上传 PDF、DOCX、Markdown、TXT 或 JSON 简历，自动建立结构化简历母版
- 重复文件识别和本地版本管理
- 单个 JD 录入、批量 JSON 导入接口与示例岗位
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

`data/`、`.env`、构建产物和浏览器会话目录均被 Git 忽略。请勿提交个人简历、账号 Cookie 或招聘平台登录信息。

## API 概览

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/resumes/import` | 上传并解析原始简历 |
| `GET` | `/api/resumes/master` | 获取当前简历母版 |
| `POST` | `/api/jobs/import` | 导入一个或最多 500 个岗位 |
| `POST` | `/api/jobs/seed` | 载入演示岗位 |
| `POST` | `/api/jobs/analyze` | 批量评分 |
| `POST` | `/api/jobs/:id/variants` | 生成岗位定制简历 |
| `PUT` | `/api/applications/:jobId/status` | 更新投递状态 |

## 计划中的平台能力

平台采集将采用独立适配器和独立浏览器配置，用户手动登录；遇到验证码、风控或登录失效时立即暂停。后续优先顺序为 BOSS 直聘、智联招聘、猎聘、拉勾。平台条款和反自动化策略可能变化，因此不会承诺无人值守的批量自动投递。

## 技术结构

```text
src/client/    React + Vite 工作台
src/server/    Fastify API、解析、评分和 SQLite 数据层
src/shared/    前后端共享类型
data/          本地运行数据（不进入 Git）
```

## 许可证

本项目使用 MIT License。第三方依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
