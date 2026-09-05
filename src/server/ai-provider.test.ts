import { afterEach, describe, expect, it, vi } from "vitest";
import type { Job, ResumeMaster, ResumeMasterData } from "../shared/types.js";
import { configureAI, fetchAIModels, getAIStatus, planSearchWithAI, scoreJobWithAI, testAIConnection } from "./ai-provider.js";
import { buildRuleSearchPlan } from "./search-planner.js";

afterEach(() => vi.unstubAllGlobals());

describe("AI provider", () => {
  it("discovers and filters upstream models from an OpenAI-compatible catalog", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("<html>provider console</html>", { status: 200, headers: { "Content-Type": "text/html" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [
        { id: "chat-primary" },
        { id: "text-embedding-3-small" },
        { name: "chat-secondary" },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAIModels({ baseUrl: "https://models.example.com", apiKey: "catalog-key" });

    expect(result.models).toEqual(["chat-primary", "chat-secondary"]);
    expect(result.endpoint).toBe("https://models.example.com/v1/models");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://models.example.com/models", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://models.example.com/v1/models", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer catalog-key" }) }));
  });

  it("does not reuse a configured API key after the provider URL changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "public-chat" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    configureAI({ baseUrl: "https://private.example.com/v1", apiKey: "private-key", model: "private-chat" });

    const status = configureAI({ baseUrl: "https://public.example.com/v1", model: "public-chat" });
    await fetchAIModels({ baseUrl: "https://another.example.com/v1" });

    expect(status.configured).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("https://another.example.com/v1/models", expect.objectContaining({ headers: { Accept: "application/json" } }));
  });

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

  it("creates structured search directions without sending contact details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      strategies: [
        { title: "数据分析师", query: "数据分析师 SQL", keywords: ["SQL", "Excel"], reason: "母版中有数据分析和 SQL 项目证据。", confidence: 92 },
        { title: "商业分析师", query: "商业分析师 Excel", keywords: ["Excel", "数据分析"], reason: "母版中的业务分析经历可以直接迁移。", confidence: 84 },
        { title: "BI 分析师", query: "BI 分析师 Power BI", keywords: ["Power BI", "SQL"], reason: "母版包含可验证的数据看板建设经历。", confidence: 80 },
      ],
    }) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    configureAI({ baseUrl: "https://models.example.com/v1", apiKey: "test-key", model: "test-model" });
    const master: ResumeMaster = {
      id: 1,
      version: 1,
      sourceId: 1,
      sourceFilename: "resume.txt",
      createdAt: "2026-09-05T00:00:00.000Z",
      data: {
        basics: { name: "张明", title: "数据分析师", email: "private@example.test", phone: "13800138000", location: "杭州", summary: "负责业务数据分析，联系 private@example.test。" },
        sourceText: "数据分析师 SQL Excel Power BI",
        sections: [{ id: "work", type: "experience", title: "工作经历", items: [{ id: "work-1", heading: "示例科技", subheading: "数据分析师", dateRange: "2022-至今", bullets: ["使用 SQL 和 Excel 分析业务数据，电话 13800138000"] }] }],
      },
    };

    const plan = await planSearchWithAI(master, buildRuleSearchPlan(master));
    const requestBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));

    expect(plan.mode).toBe("ai");
    expect(plan.strategies).toHaveLength(3);
    expect(JSON.stringify(requestBody)).not.toContain(master.data.basics.email);
    expect(JSON.stringify(requestBody)).not.toContain(master.data.basics.phone);
  });
});
