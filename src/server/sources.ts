import type { SourceDefinition } from "../shared/types.js";

export const sources: SourceDefinition[] = [
  {
    id: "manual",
    name: "手工 / JSON 导入",
    status: "available",
    capabilities: ["粘贴 JD", "批量 JSON", "立即评分"],
    note: "无需登录，适合验证完整工作流。",
  },
  {
    id: "boss",
    name: "BOSS 直聘",
    status: "needs_login",
    capabilities: ["岗位列表", "薪资", "完整 JD", "原始链接"],
    note: "平台适配器开发中；将使用独立浏览器配置并由用户手动登录。",
  },
  {
    id: "zhaopin",
    name: "智联招聘",
    status: "needs_login",
    capabilities: ["岗位列表", "薪资", "完整 JD", "原始链接"],
    note: "平台适配器开发中；出现验证时会立即暂停。",
  },
  {
    id: "liepin",
    name: "猎聘",
    status: "needs_login",
    capabilities: ["岗位列表", "薪资", "完整 JD", "原始链接"],
    note: "平台适配器开发中；首版不执行自动投递。",
  },
  {
    id: "lagou",
    name: "拉勾",
    status: "planned",
    capabilities: ["岗位列表", "完整 JD"],
    note: "计划在 v0.2 接入。",
  },
];
