import { describe, expect, it } from "vitest";
import { structureResume } from "./resume-parser.js";

describe("structureResume", () => {
  it("extracts contact details and common Chinese resume sections", () => {
    const resume = structureResume(`张明\nAI 产品经理\n13800138000\nzhangming@example.com\n个人总结\n5 年互联网产品经验，负责过企业级 AI 产品从需求调研到上线复盘的完整过程。\n工作经历\n示例科技｜高级产品经理 2021.03-至今\n- 负责 RAG 知识库产品规划与项目管理\n- 推动研发、设计和运营团队协作\n项目经历\n智能客服平台 2023.01-2023.12\n- 完成用户研究和需求分析\n专业技能\nPRD、Axure、数据分析、SQL`);

    expect(resume.basics.name).toBe("张明");
    expect(resume.basics.email).toBe("zhangming@example.com");
    expect(resume.basics.phone).toContain("13800138000");
    expect(resume.basics.location).toBe("");
    expect(resume.sections.map((section) => section.type)).toEqual(expect.arrayContaining(["experience", "projects", "skills"]));
    expect(resume.sections.filter((section) => section.type === "other")).toHaveLength(0);
    expect(resume.sourceText).toContain("RAG");
  });

  it("keeps a usable fallback structure when headings are missing", () => {
    const resume = structureResume("李雷\n数据分析师\n杭州\n熟练使用 SQL、Python 和 Excel 完成业务分析与数据可视化。\n其他\n可接受短期出差");

    expect(resume.basics.name).toBe("李雷");
    expect(resume.basics.title).toBe("数据分析师");
    expect(resume.basics.location).toBe("杭州");
    expect(resume.sections.length).toBeGreaterThan(0);
    expect(resume.sourceText).toContain("Python");
  });

  it("handles line-oriented PDF text with spaced Chinese names and alternate headings", () => {
    const resume = structureResume(`1 / 2\n李 雷\nAI 应用工程师\n手机：13900000000 邮箱：candidate@example.test\n核心 能力\n大模型应用与 RAG 后端开发\n工作 经历\n示例科技有限公司｜AI 工程师 2026.01 – 至今\n• 完成大模型 API 接入和接口联调\n项目 经历\n企业知识平台｜文档 RAG 检索项目\n• 使用 FastAPI、MySQL 和 Chroma 构建检索链路\n教育 与成果\n示例大学｜软件工程｜本科 2022 – 2026`);

    expect(resume.basics.name).toBe("李雷");
    expect(resume.basics.title).toBe("AI 应用工程师");
    expect(resume.sections.map((section) => section.type)).toEqual(expect.arrayContaining(["skills", "experience", "projects", "education"]));
    expect(resume.sourceText).not.toContain("1 / 2");
  });
});
