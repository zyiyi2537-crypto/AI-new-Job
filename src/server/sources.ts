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
    status: "available",
    capabilities: ["打开搜索", "当前岗位", "列表采集", "保留登录态"],
    note: "桌面模式可直接内置浏览和采集，也可使用 Chrome 采集助手。",
  },
  {
    id: "zhaopin",
    name: "智联招聘",
    status: "available",
    capabilities: ["打开搜索", "当前岗位", "列表采集", "原始链接"],
    note: "支持桌面内置浏览器、公开 URL 和 Chrome 当前页面采集。",
  },
  {
    id: "liepin",
    name: "猎聘",
    status: "available",
    capabilities: ["打开搜索", "当前岗位", "列表采集", "原始链接"],
    note: "桌面模式中保留登录态并采集用户当前可见岗位。",
  },
  {
    id: "lagou",
    name: "拉勾",
    status: "available",
    capabilities: ["打开搜索", "当前岗位", "列表采集"],
    note: "支持桌面内置浏览器；页面改版时可回退到 URL 导入。",
  },
];
