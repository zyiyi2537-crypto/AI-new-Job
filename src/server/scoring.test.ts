import { describe, expect, it } from "vitest";
import type { Job, MatchAnalysis, ResumeMasterData } from "../shared/types.js";
import { extractSkills, scoreJob, tailorResume } from "./scoring.js";

const master: ResumeMasterData = {
  basics: {
    name: "张明",
    title: "数据产品经理",
    email: "zhangming@example.com",
    phone: "13800138000",
    location: "杭州",
    summary: "负责数据产品和企业级项目。",
  },
  sections: [
    {
      id: "experience-01",
      type: "experience",
      title: "工作经历",
      items: [{ id: "work-01", heading: "示例科技", subheading: "产品经理", dateRange: "2021-至今", bullets: ["使用 SQL 和 Excel 分析业务数据", "编写 PRD 并开展用户研究"] }],
    },
    {
      id: "education-01",
      type: "education",
      title: "教育经历",
      items: [{ id: "edu-01", heading: "示例大学", subheading: "本科", dateRange: "2017-2021", bullets: [] }],
    },
  ],
  sourceText: "张明 数据产品经理 本科 SQL Excel PRD 用户研究 项目管理",
};

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    source: "manual",
    sourceJobId: "job-1",
    title: "数据产品经理",
    company: "目标公司",
    location: "杭州",
    salaryText: "20-30K",
    salaryMin: 20,
    salaryMax: 30,
    description: "负责数据产品的需求分析、PRD 和用户研究，使用 SQL、Excel 完成数据分析，要求本科及以上学历并具备项目管理经验。",
    url: "",
    status: "new",
    postedAt: "",
    collectedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("job matching", () => {
  it("extracts known skills without case sensitivity", () => {
    expect(extractSkills("python, SQL, power bi and React")).toEqual(expect.arrayContaining(["Python", "SQL", "React", "Power BI"]));
  });

  it("returns an explainable five-dimensional score", () => {
    const result = scoreJob(job(), master);

    expect(result.dimensions).toHaveLength(5);
    expect(result.matchedKeywords).toEqual(expect.arrayContaining(["SQL", "Excel", "PRD", "用户研究"]));
    expect(result.totalScore).toBeGreaterThanOrEqual(55);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.dimensions.every((dimension) => dimension.reasons.length > 0)).toBe(true);
  });

  it("does not inject unsupported facts into a tailored resume", () => {
    const analysis = { ...scoreJob(job(), master), id: 1, createdAt: "2026-09-04T00:00:00.000Z" } satisfies MatchAnalysis;
    const tailored = tailorResume(job(), master, analysis);

    expect(tailored.content.basics.name).toBe(master.basics.name);
    expect(tailored.content.basics.email).toBe(master.basics.email);
    expect(tailored.content.sections.map(({ id, items }) => ({ id, items }))).toEqual(expect.arrayContaining(master.sections.map(({ id, items }) => ({ id, items }))));
    expect(tailored.content.sourceText).toBe(master.sourceText);
    expect(tailored.rationale.join(" ")).toContain("不添加原始简历之外的事实");
  });
});
