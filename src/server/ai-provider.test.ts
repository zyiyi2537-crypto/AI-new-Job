import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job, ResumeMasterData } from "../shared/types.js";
import { configureAI, getAIStatus, scoreJobWithAI, testAIConnection } from "./ai-provider.js";

afterEach(() => vi.unstubAllGlobals());

describe("AI provider", () => {
  it("uses an OpenAI-compatible chat completion for connection tests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    configureAI({ baseUrl: "https://models.example.com/v1", apiKey: "test-key", model: "test-model" });

    const result = await testAIConnection();

    expect(result.ok).toBe(true);
    expect(getAIStatus().configured).toBe(true);
    expect(result.status.resolvedEndpoint).toBe("https://models.example.com/v1/chat/completions");
    expect(fetchMock).toHaveBeenCalledWith("https://models.example.com/v1/chat/completions", expect.objectContaining({ method: "POST" }));
  });

  it("discovers /v1/chat/completions when a provider base domain serves HTML", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("<html>provider console</html>", { status: 200, headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    configureAI({ baseUrl: "https://models.example.com", apiKey: "test-key", model: "test-model" });

    const result = await testAIConnection();

    expect(result.status.resolvedEndpoint).toBe("https://models.example.com/v1/chat/completions");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://models.example.com/chat/completions", expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://models.example.com/v1/chat/completions", expect.any(Object));
  });

  it("adds validated model explanations without replacing deterministic scores", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        summary: "岗位需要的数据分析能力在候选人的项目经历中有直接证据。",
        strengths: ["工作经历中明确使用 SQL 和 Excel 完成数据分析"],
        gaps: ["当前材料没有 Power BI 的直接使用证据"],
        dimensionReasons: {
          hard: "本科经历覆盖学历要求",
          skills: "SQL 与 Excel 直接命中",
          evidence: "相关技能出现在工作经历中",
          preference: "当前方向与数据分析岗位相关",
          quality: "JD 职责与要求较清晰",
        },
      }) } }] }), { status: 200 })));
    configureAI({ baseUrl: "https://models.example.com/v1", apiKey: "test-key", model: "test-model" });
    const master: ResumeMasterData = {
      basics: { name: "张明", title: "数据分析师", email: "a@example.com", phone: "13800138000", location: "杭州", summary: "" },
      sourceText: "本科 SQL Excel 数据分析",
      sections: [{ id: "experience-01", type: "experience", title: "工作经历", items: [{ id: "work-01", heading: "数据分析师", subheading: "", dateRange: "2022-至今", bullets: ["使用 SQL 和 Excel 完成数据分析"] }] }],
    };
    const job: Job = { id: 1, source: "manual", sourceJobId: "1", title: "数据分析师", company: "目标公司", location: "杭州", salaryText: "20-30K", salaryMin: 20, salaryMax: 30, description: "要求本科，熟练使用 SQL、Excel 和 Power BI 完成业务数据分析并输出建议。", url: "", status: "new", postedAt: "", collectedAt: "" };

    const result = await scoreJobWithAI(job, master);

    expect(result.analysisMode).toBe("ai");
    expect(result.aiModel).toBe("test-model");
    expect(result.summary).toContain("直接证据");
    expect(result.dimensions).toHaveLength(5);
    expect(result.gaps[0]).toContain("Power BI");
  });
});
