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
import type { ApplicationStatus, Job } from "../shared/types.js";
import { configureAI, getAIStatus, scoreJobWithAI, testAIConnection } from "./ai-provider.js";
import {
  createResumeMaster,
  createVariant,
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
import { sources } from "./sources.js";

const app = Fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 });
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

app.get("/api/health", async () => ({ status: "ok", version: "0.2.0", time: new Date().toISOString() }));
app.get("/api/overview", async () => overview());
app.get("/api/sources", async () => sources);
app.get("/api/ai/status", async () => getAIStatus());
app.post("/api/ai/config", async (request) => {
  const body = z.object({ baseUrl: z.string(), apiKey: z.string().optional(), model: z.string() }).parse(request.body);
  return configureAI(body);
});
app.post("/api/ai/test", async () => testAIConnection());
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
  const body = z.union([capturedJob, z.array(capturedJob).min(1).max(100)]).parse(request.body);
  const items = Array.isArray(body) ? body : [body];
  const results = items.map((item) => insertJob({
    ...item,
    source: item.source || detectSource(item.url),
    sourceJobId: item.sourceJobId || createHash("sha1").update(item.url).digest("hex"),
    salaryMin: null,
    salaryMax: null,
    status: "new",
  }));
  return reply.status(201).send({ received: items.length, inserted: results.filter((item) => item.inserted).length, ids: results.map((item) => item.id) });
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
