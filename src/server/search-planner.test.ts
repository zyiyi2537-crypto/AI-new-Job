import { describe, expect, it } from "vitest";
import type { ResumeMaster } from "../shared/types.js";
import { buildRuleSearchPlan } from "./search-planner.js";

const master: ResumeMaster = {
  id: 7,
  version: 2,
  sourceId: 3,
  sourceFilename: "resume.docx",
  createdAt: "2026-09-05T00:00:00.000Z",
  data: {
    basics: { name: "测试用户", title: "数据产品经理", email: "candidate@example.test", phone: "13900000000", location: "杭州", summary: "负责企业数据产品。" },
    sourceText: "数据产品经理 本科 SQL Excel Power BI PRD 用户研究 项目管理 大模型 RAG",
    sections: [{ id: "experience-01", type: "experience", title: "工作经历", items: [{ id: "work-01", heading: "示例科技", subheading: "产品经理", dateRange: "2022-至今", bullets: ["使用 SQL 和 Power BI 建设数据产品", "负责 PRD 与用户研究"] }] }],
  },
};

describe("resume-driven search planning", () => {
  it("uses the resume title, location and proven skills", () => {
    const plan = buildRuleSearchPlan(master);

    expect(plan.city).toBe("杭州");
    expect(plan.strategies[0].title).toBe("数据产品经理");
    expect(plan.strategies.some((strategy) => strategy.query.includes("SQL") || strategy.query.includes("Power BI"))).toBe(true);
    expect(plan.skills).toEqual(expect.arrayContaining(["SQL", "Power BI", "PRD"]));
  });

  it("returns distinct search queries and never includes personal contact data", () => {
    const plan = buildRuleSearchPlan(master, "上海");
    const serialized = JSON.stringify(plan);

    expect(plan.city).toBe("上海");
    expect(new Set(plan.strategies.map((strategy) => strategy.query)).size).toBe(plan.strategies.length);
    expect(plan.strategies.some((strategy) => strategy.title === "工程师")).toBe(false);
    expect(serialized).not.toContain(master.data.basics.email);
    expect(serialized).not.toContain(master.data.basics.phone);
  });
});
