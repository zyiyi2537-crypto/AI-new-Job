import { z } from "zod";
import type { AIStatus, Job, MatchAnalysis, ResumeMasterData, ScoreDimension } from "../shared/types.js";
import { scoreJob } from "./scoring.js";

const aiResponseSchema = z.object({
  summary: z.string().trim().min(10).max(500),
  strengths: z.array(z.string().trim().min(2).max(180)).max(8),
  gaps: z.array(z.string().trim().min(2).max(180)).max(8),
  dimensionReasons: z.object({
    hard: z.string().trim().min(2).max(180),
    skills: z.string().trim().min(2).max(180),
    evidence: z.string().trim().min(2).max(180),
    preference: z.string().trim().min(2).max(180),
    quality: z.string().trim().min(2).max(180),
  }),
});

type AIConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  source: AIStatus["source"];
};

const environmentConfig: AIConfig = {
  baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
  apiKey: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "",
  source: process.env.OPENAI_MODEL && (process.env.OPENAI_API_KEY || /localhost|127\.0\.0\.1/.test(process.env.OPENAI_BASE_URL || "")) ? "environment" : "none",
};

let activeConfig = { ...environmentConfig };
let lastCheckedAt = "";
let lastError = "";
let resolvedEndpoint = "";

function providerLabel(baseUrl: string): string {
  if (/api\.openai\.com/i.test(baseUrl)) return "OpenAI";
  if (/localhost|127\.0\.0\.1/i.test(baseUrl)) return "本地模型";
  return "OpenAI-compatible";
}

function isConfigured(config = activeConfig): boolean {
  const local = /localhost|127\.0\.0\.1/.test(config.baseUrl);
  return Boolean(config.baseUrl && config.model && (config.apiKey || local));
}

export function getAIStatus(): AIStatus {
  return {
    configured: isConfigured(),
    baseUrl: activeConfig.baseUrl,
    resolvedEndpoint,
    model: activeConfig.model,
    providerLabel: providerLabel(activeConfig.baseUrl),
    source: isConfigured() ? activeConfig.source : "none",
    lastCheckedAt,
    lastError,
  };
}

export function configureAI(input: { baseUrl: string; apiKey?: string; model: string }): AIStatus {
  const parsed = z.object({
    baseUrl: z.string().url().refine((value) => /^https?:\/\//.test(value), "AI 地址必须使用 http 或 https"),
    apiKey: z.string().max(500).optional(),
    model: z.string().trim().min(1).max(120),
  }).parse(input);
  activeConfig = {
    baseUrl: parsed.baseUrl.replace(/\/+$/, ""),
    apiKey: parsed.apiKey?.trim() || activeConfig.apiKey,
    model: parsed.model,
    source: "runtime",
  };
  lastError = "";
  resolvedEndpoint = "";
  return getAIStatus();
}

function extractMessageContent(payload: unknown): string {
  const parsed = z.object({
    choices: z.array(z.object({ message: z.object({ content: z.union([z.string(), z.array(z.object({ text: z.string() }))]) }) })).min(1),
  }).safeParse(payload);
  if (!parsed.success) throw new Error("模型接口返回成功，但没有 choices[0].message.content；请检查 API 地址是否包含 /v1");
  const content = parsed.data.choices[0].message.content;
  return typeof content === "string" ? content : content.map((item) => item.text).join("");
}

function parseJsonContent(content: string): unknown {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized);
}

function endpointCandidates(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(normalized)) return [normalized];
  if (/\/v\d+$/i.test(normalized)) return [`${normalized}/chat/completions`];
  return [`${normalized}/chat/completions`, `${normalized}/v1/chat/completions`];
}

function errorMessage(payload: unknown, status: number): string {
  const parsed = z.object({
    error: z.union([z.string(), z.object({ message: z.string().optional() })]).optional(),
    message: z.string().optional(),
  }).safeParse(payload);
  if (!parsed.success) return `AI 请求失败 (${status})`;
  if (typeof parsed.data.error === "string") return parsed.data.error;
  return parsed.data.error?.message || parsed.data.message || `AI 请求失败 (${status})`;
}

async function requestCompletion(endpoint: string, system: string, user: string, includeResponseFormat: boolean, signal: AbortSignal): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (activeConfig.apiKey) headers.Authorization = `Bearer ${activeConfig.apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model: activeConfig.model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      ...(includeResponseFormat ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const raw = await response.text();
  let payload: unknown = {};
  try { payload = JSON.parse(raw); } catch { /* HTML and plain-text responses are handled below. */ }
  if (!response.ok) {
    const message = errorMessage(payload, response.status);
    if (includeResponseFormat && [400, 422].includes(response.status) && /response[_ -]?format|json[_ -]?object/i.test(`${message} ${raw}`)) {
      return requestCompletion(endpoint, system, user, false, signal);
    }
    throw Object.assign(new Error(message), { status: response.status });
  }
  return extractMessageContent(payload);
}

async function chatJson(system: string, user: string): Promise<unknown> {
  if (!isConfigured()) throw new Error("AI 尚未配置，请先在设置中填写模型连接信息");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const candidates = endpointCandidates(activeConfig.baseUrl);
    let lastCandidateError: Error | null = null;
    for (const [index, endpoint] of candidates.entries()) {
      try {
        const content = await requestCompletion(endpoint, system, user, true, controller.signal);
        resolvedEndpoint = endpoint;
        return parseJsonContent(content);
      } catch (error) {
        lastCandidateError = error instanceof Error ? error : new Error("AI 请求失败");
        const status = "status" in lastCandidateError ? Number(lastCandidateError.status) : 0;
        const mayTryVersionedEndpoint = index < candidates.length - 1 && (status === 0 || status === 404 || status === 405 || /没有 choices/.test(lastCandidateError.message));
        if (!mayTryVersionedEndpoint) throw lastCandidateError;
      }
    }
    throw lastCandidateError || new Error("AI 请求失败");
  } catch (error) {
    const normalized = error instanceof Error && error.name === "AbortError" ? new Error("AI 请求超过 60 秒，请检查模型服务") : error;
    lastError = normalized instanceof Error ? normalized.message : "AI 请求失败";
    throw normalized;
  } finally {
    clearTimeout(timeout);
  }
}

export async function testAIConnection(): Promise<{ ok: true; latencyMs: number; status: AIStatus }> {
  const startedAt = Date.now();
  const result = z.object({ ok: z.boolean() }).parse(await chatJson(
    "You are a connection test. Return JSON only.",
    'Return exactly this JSON object: {"ok":true}',
  ));
  if (!result.ok) throw new Error("模型连接成功，但返回内容未通过校验");
  lastCheckedAt = new Date().toISOString();
  lastError = "";
  return { ok: true, latencyMs: Date.now() - startedAt, status: getAIStatus() };
}

function resumeEvidence(master: ResumeMasterData): string {
  return JSON.stringify({
    basics: { name: master.basics.name, title: master.basics.title, location: master.basics.location, summary: master.basics.summary },
    sections: master.sections,
  });
}

export async function scoreJobWithAI(job: Job, master: ResumeMasterData): Promise<Omit<MatchAnalysis, "id" | "createdAt">> {
  const baseline = scoreJob(job, master);
  const result = aiResponseSchema.parse(await chatJson(
    [
      "你是严谨的中文求职匹配分析器。只输出 JSON，不得编造候选人的经历、学历、技能或数字。",
      "根据给定的简历证据、岗位 JD 和本地规则基线，解释匹配证据与真实缺口。",
      "输出字段必须是 summary、strengths、gaps、dimensionReasons；dimensionReasons 必须包含 hard、skills、evidence、preference、quality。",
      "strengths 与 gaps 中每一项都要具体、可由输入内容核对。",
    ].join("\n"),
    JSON.stringify({ job, resume: JSON.parse(resumeEvidence(master)), ruleBaseline: baseline }),
  ));
  const reasons = result.dimensionReasons;
  const dimensions = baseline.dimensions.map((dimension): ScoreDimension => ({
    ...dimension,
    reasons: [reasons[dimension.key], ...dimension.reasons].filter(Boolean).slice(0, 3),
  }));
  return {
    ...baseline,
    dimensions,
    strengths: result.strengths,
    gaps: result.gaps,
    analysisMode: "ai",
    aiModel: activeConfig.model,
    summary: result.summary,
    confidence: Math.min(100, baseline.confidence + 8),
  };
}
