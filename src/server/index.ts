import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { z } from "zod";
import type { ApplicationStatus, Job, SearchPlan } from "../shared/types.js";
import { configureAI, fetchAIModels, getAIStatus, planSearchWithAI, scoreJobWithAI, testAIConnection } from "./ai-provider.js";
import {
  createResumeMaster,
  createVariant,
  findVariantForJobAndMaster,
  getJob,
  insertJob,
  latestMaster,
  listApplications,
  listJobs,
  listVariants,
  overview,
  saveAnalysis,
  setApplicationStatus,
  sourceByHash,
  updateMaster,
  uploadDir,
} from "./database.js";
import { extractResumeText, structureResume } from "./resume-parser.js";
import { buildSearchLinks, detectSource, importJobFromUrl } from "./job-page-parser.js";
import { scoreJob, tailorResume } from "./scoring.js";
import { buildRuleSearchPlan } from "./search-planner.js";
import { sources } from "./sources.js";

const app = Fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 });
let cachedSearchPlan: SearchPlan | null = null;
await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const jobInput = z.object({
  source: z.string().trim().min(1).default("manual"),
  sourceJobId: z.string().trim().optional(),
  title: z.string().trim().min(1),
  company: z.string().trim().min(1),
  location: z.string().trim().default(""),
  salaryText: z.string().trim().default(""),
  salaryMin: z.number().nullable().default(null),
  salaryMax: z.number().nullable().default(null),
  description: z.string().trim().min(20),
  url: z.string().trim().default(""),
  postedAt: z.string().trim().default(""),
});

app.setErrorHandler((error, _request, reply) => {
  const normalized = error instanceof Error ? error : new Error("请求处理失败");
  const statusCode = "statusCode" in normalized && typeof normalized.statusCode === "number" ? normalized.statusCode : 400;
  reply.status(statusCode).send({ error: normalized.message || "请求处理失败" });
});

app.get("/api/health", async () => ({ status: "ok", version: "0.6.0", time: new Date().toISOString() }));
app.get("/api/overview", async () => overview());
app.get("/api/sources", async () => sources);
app.get("/api/ai/status", async () => getAIStatus());
app.post("/api/ai/config", async (request) => {
  const body = z.object({ baseUrl: z.string(), apiKey: z.string().optional(), model: z.string() }).parse(request.body);
  return configureAI(body);
});
app.post("/api/ai/models", async (request) => {
  const body = z.object({ baseUrl: z.string(), apiKey: z.string().optional() }).parse(request.body);
  return fetchAIModels(body);
});
app.post("/api/ai/test", async () => testAIConnection());
app.post("/api/search-plan", async (request, reply) => {
  const body = z.object({
    city: z.string().trim().max(40).default(""),
    preferAI: z.boolean().default(true),
    refresh: z.boolean().default(false),
  }).default({ city: "", preferAI: true, refresh: false }).parse(request.body);
  const master = latestMaster();
  if (!master) return reply.status(409).send({ error: "请先上传原始简历" });
  const city = body.city || master.data.basics.location || "全国";
  if (!body.refresh && cachedSearchPlan?.masterId === master.id && cachedSearchPlan.city === city && (!body.preferAI || cachedSearchPlan.mode === "ai")) {
    return cachedSearchPlan;
  }
  const baseline = buildRuleSearchPlan(master, city);
  if (!body.preferAI || !getAIStatus().configured) {
    cachedSearchPlan = baseline;
    return baseline;
  }
  try {
    cachedSearchPlan = await planSearchWithAI(master, baseline);
  } catch (error) {
    cachedSearchPlan = {
      ...baseline,
      fallbackReason: `AI 规划暂不可用，已使用本地母版分析：${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
  return cachedSearchPlan;
});
app.get("/api/sources/search-links", async (request) => {
  const query = z.object({ q: z.string().trim().min(1), city: z.string().trim().default("") }).parse(request.query);
  return buildSearchLinks(query.q, query.city);
});
app.get("/api/collector/info", async () => ({
  extensionPath: path.resolve("extension"),
  supportedSources: ["boss", "zhaopin", "liepin", "lagou", "51job", "web"],
}));
app.get("/api/resumes/master", async (_request, reply) => {
  const master = latestMaster();
  if (!master) return reply.status(404).send({ error: "尚未上传原始简历" });
  return master;
});

app.post("/api/resumes/import", async (request, reply) => {
  const part = await request.file();
  if (!part) return reply.status(400).send({ error: "请选择简历文件" });
  const extension = path.extname(part.filename).toLowerCase();
  const allowed = new Set([".pdf", ".docx", ".md", ".txt", ".json"]);
  if (!allowed.has(extension)) return reply.status(415).send({ error: "支持 PDF、DOCX、Markdown、TXT 和 JSON 文件" });

  const buffer = await part.toBuffer();
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const existing = sourceByHash(sha256);
  if (existing?.master) return { duplicate: true, master: existing.master };

  const safeName = part.filename.replace(/[^\p{L}\p{N}._-]+/gu, "_");
  const storedPath = path.join(uploadDir, `${randomUUID()}-${safeName}`);
  await writeFile(storedPath, buffer);
  const extracted = await extractResumeText(part.filename, part.mimetype, buffer);
  const data = structureResume(extracted.text);
  const master = createResumeMaster({
    filename: part.filename,
    mimeType: part.mimetype,
    sha256,
    storedPath,
    rawText: extracted.text,
    parser: extracted.parser,
    data,
  });
  return reply.status(201).send({ duplicate: false, parser: extracted.parser, master });
});

app.put("/api/resumes/master", async (request, reply) => {
  const body = z.object({ data: z.unknown() }).parse(request.body);
  const current = latestMaster();
  if (!current) return reply.status(404).send({ error: "尚未上传原始简历" });
  const merged = { ...current.data, ...(body.data as object) };
  return updateMaster(merged);
});

app.get("/api/jobs", async (request) => {
  const query = z.object({ status: z.string().optional(), source: z.string().optional(), q: z.string().optional() }).parse(request.query);
  return listJobs({ status: query.status, source: query.source, query: query.q });
});

app.get("/api/jobs/:id", async (request, reply) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const job = getJob(id);
  if (!job) return reply.status(404).send({ error: "岗位不存在" });
  return job;
});

app.post("/api/jobs/import", async (request, reply) => {
  const body = z.union([jobInput, z.array(jobInput).min(1).max(500)]).parse(request.body);
  const items = Array.isArray(body) ? body : [body];
  const results = items.map((item) => {
    const sourceJobId = item.sourceJobId || createHash("sha1").update(`${item.source}|${item.url}|${item.company}|${item.title}|${item.location}`).digest("hex");
    return insertJob({ ...item, sourceJobId, status: "new" });
  });
  return reply.status(201).send({ received: items.length, inserted: results.filter((item) => item.inserted).length, ids: results.map((item) => item.id) });
});

app.post("/api/jobs/import-url", async (request, reply) => {
  const { url } = z.object({ url: z.string().url() }).parse(request.body);
  const item = await importJobFromUrl(url);
  const result = insertJob(item);
  return reply.status(201).send({ inserted: result.inserted ? 1 : 0, ids: [result.id], job: getJob(result.id) });
});

app.post("/api/jobs/capture", async (request, reply) => {
  const capturedJob = z.object({
    source: z.string().trim().optional(),
    sourceJobId: z.string().trim().optional(),
    title: z.string().trim().min(1),
    company: z.string().trim().default("待确认公司"),
    location: z.string().trim().default(""),
    salaryText: z.string().trim().default(""),
    description: z.string().trim().min(20),
    url: z.string().url(),
    postedAt: z.string().trim().default(""),
  });
  const parsedBody = z.union([
    capturedJob,
    z.array(capturedJob).min(1).max(100),
    z.object({ jobs: z.array(capturedJob).min(1).max(100), autoAnalyze: z.boolean().default(false) }),
  ]).parse(request.body);
  const autoAnalyze = !Array.isArray(parsedBody) && "jobs" in parsedBody ? parsedBody.autoAnalyze : false;
  const items = Array.isArray(parsedBody) ? parsedBody : "jobs" in parsedBody ? parsedBody.jobs : [parsedBody];
  const results = items.map((item) => insertJob({
    ...item,
    source: item.source || detectSource(item.url),
    sourceJobId: item.sourceJobId || createHash("sha1").update(item.url).digest("hex"),
    salaryMin: null,
    salaryMax: null,
    status: "new",
  }));
  const ids = [...new Set(results.map((item) => item.id))];
  const topMatches = autoAnalyze && latestMaster()
    ? ids.map((id) => {
      const job = getJob(id)!;
      const analysis = analyzeOne(job);
      return { id, title: job.title, company: job.company, score: analysis.totalScore };
    }).sort((a, b) => b.score - a.score)
    : [];
  return reply.status(201).send({
    received: items.length,
    inserted: results.filter((item) => item.inserted).length,
    ids,
    analyzed: topMatches.length,
    topMatches: topMatches.slice(0, 5),
  });
});

app.post("/api/jobs/seed", async (_request, reply) => {
  const samples: Array<Omit<Job, "id" | "collectedAt" | "analysis">> = [
    {
      source: "demo",
      sourceJobId: "demo-ai-product-manager",
      title: "AI 产品经理",
      company: "示例科技",
      location: "杭州",
      salaryText: "20-35K",
      salaryMin: 20,
      salaryMax: 35,
      description: "负责 AI 产品需求分析、PRD、用户研究和项目管理，理解大模型、RAG 与 Agent，能够推动研发和设计协作。有数据分析、A/B测试经验优先。本科及以上学历。",
      url: "https://example.com/jobs/ai-product-manager",
      status: "new",
      postedAt: new Date().toISOString().slice(0, 10),
    },
    {
      source: "demo",
      sourceJobId: "demo-data-analyst",
      title: "数据分析师",
      company: "示例零售",
      location: "上海",
      salaryText: "15-25K",
      salaryMin: 15,
      salaryMax: 25,
      description: "使用 SQL、Python 和 Excel 完成业务数据分析，建设 Power BI 数据看板，与产品和运营团队协作并输出分析建议。要求本科及以上学历。",
      url: "https://example.com/jobs/data-analyst",
      status: "new",
      postedAt: new Date().toISOString().slice(0, 10),
    },
  ];
  const results = samples.map(insertJob);
  return reply.status(201).send({ inserted: results.filter((item) => item.inserted).length });
});

function analyzeOne(job: Job) {
  const master = latestMaster();
  if (!master) throw new Error("请先上传原始简历，再进行岗位评分");
  return saveAnalysis(master.id, scoreJob(job, master.data));
}

app.post("/api/jobs/:id/analyze", async (request, reply) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const { mode } = z.object({ mode: z.enum(["rules", "ai"]).default("rules") }).default({ mode: "rules" }).parse(request.body);
  const job = getJob(id);
  if (!job) return reply.status(404).send({ error: "岗位不存在" });
  if (mode === "ai") {
    const master = latestMaster();
    if (!master) return reply.status(409).send({ error: "请先上传原始简历" });
    return saveAnalysis(master.id, await scoreJobWithAI(job, master.data));
  }
  return analyzeOne(job);
});

app.post("/api/jobs/analyze", async () => {
  const jobs = listJobs();
  return { analyzed: jobs.length, results: jobs.map(analyzeOne) };
});

app.post("/api/jobs/prepare", async (request, reply) => {
  const body = z.object({
    ids: z.array(z.number().int().positive()).min(1).max(100).optional(),
    maxVariants: z.number().int().min(1).max(10).default(3),
    minScore: z.number().min(0).max(100).default(55),
    mode: z.enum(["auto", "rules", "ai"]).default("auto"),
  }).default({ maxVariants: 3, minScore: 55, mode: "auto" }).parse(request.body);
  const master = latestMaster();
  if (!master) return reply.status(409).send({ error: "请先上传原始简历" });
  const jobs = body.ids ? body.ids.map(getJob).filter((job): job is Job => Boolean(job)) : listJobs();
  if (!jobs.length) return reply.status(409).send({ error: "没有可处理的岗位，请先扫描岗位列表" });

  const ranked = jobs
    .map((job) => ({ job, analysis: saveAnalysis(master.id, scoreJob(job, master.data)) }))
    .filter((entry) => entry.analysis.totalScore >= body.minScore)
    .sort((a, b) => b.analysis.totalScore - a.analysis.totalScore)
    .slice(0, body.maxVariants);
  const useAI = body.mode === "ai" || (body.mode === "auto" && getAIStatus().configured);
  const failures: string[] = [];
  const prepared = [];

  for (const entry of ranked) {
    let analysis = entry.analysis;
    if (useAI) {
      try {
        analysis = saveAnalysis(master.id, await scoreJobWithAI(entry.job, master.data));
      } catch (error) {
        failures.push(`${entry.job.title}：${error instanceof Error ? error.message : "AI 分析失败，已使用规则结果"}`);
      }
    }
    if (analysis.totalScore < body.minScore) continue;
    const existing = findVariantForJobAndMaster(entry.job.id, master.id);
    const tailored = existing ? null : tailorResume(entry.job, master.data, analysis);
    const variant = existing || createVariant({
      jobId: entry.job.id,
      masterId: master.id,
      name: `${entry.job.company}-${entry.job.title}-定制版`,
      content: tailored!.content,
      rationale: tailored!.rationale,
    });
    prepared.push({
      jobId: entry.job.id,
      title: entry.job.title,
      company: entry.job.company,
      score: analysis.totalScore,
      analysisMode: analysis.analysisMode,
      variantId: variant.id,
      reused: Boolean(existing),
    });
  }
  return { scanned: jobs.length, eligible: ranked.length, prepared, failures };
});

app.post("/api/jobs/:id/variants", async (request, reply) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const job = getJob(id);
  const master = latestMaster();
  if (!job) return reply.status(404).send({ error: "岗位不存在" });
  if (!master) return reply.status(409).send({ error: "请先上传原始简历" });
  const analysis = job.analysis || analyzeOne(job);
  const tailored = tailorResume(job, master.data, analysis);
  return reply.status(201).send(createVariant({
    jobId: job.id,
    masterId: master.id,
    name: `${job.company}-${job.title}-定制版`,
    content: tailored.content,
    rationale: tailored.rationale,
  }));
});

app.get("/api/variants", async () => listVariants());
app.get("/api/applications", async () => listApplications());
app.put("/api/applications/:jobId/status", async (request) => {
  const { jobId } = z.object({ jobId: z.coerce.number().int().positive() }).parse(request.params);
  const { status } = z.object({ status: z.string() }).parse(request.body);
  setApplicationStatus(jobId, status as ApplicationStatus);
  return { ok: true };
});

const distDir = path.resolve("dist");
if (existsSync(distDir)) {
  await app.register(fastifyStatic, { root: distDir });
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/")) return reply.status(404).send({ error: "接口不存在" });
    return reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
await app.listen({ port, host });
