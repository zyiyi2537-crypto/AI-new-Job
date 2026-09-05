import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ApplicationStatus,
  Job,
  JobStatus,
  MatchAnalysis,
  Overview,
  ResumeMaster,
  ResumeMasterData,
  ResumeVariant,
  ScoreDimension,
} from "../shared/types.js";

const dataDir = path.resolve(process.env.DATA_DIR || "data");
mkdirSync(dataDir, { recursive: true });

export const uploadDir = path.join(dataDir, "uploads");
mkdirSync(uploadDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "jobpilot.db"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;");

db.exec(`
  CREATE TABLE IF NOT EXISTS resume_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE,
    stored_path TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    parser TEXT NOT NULL,
    imported_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resume_masters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL,
    source_id INTEGER NOT NULL REFERENCES resume_sources(id),
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_job_id TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    salary_text TEXT NOT NULL DEFAULT '',
    salary_min INTEGER,
    salary_max INTEGER,
    description TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    posted_at TEXT NOT NULL DEFAULT '',
    collected_at TEXT NOT NULL,
    raw_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE(source, source_job_id)
  );

  CREATE TABLE IF NOT EXISTS match_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    master_id INTEGER NOT NULL REFERENCES resume_masters(id),
    total_score REAL NOT NULL,
    confidence REAL NOT NULL,
    verdict TEXT NOT NULL,
    dimensions_json TEXT NOT NULL,
    matched_keywords_json TEXT NOT NULL,
    missing_keywords_json TEXT NOT NULL,
    strengths_json TEXT NOT NULL,
    gaps_json TEXT NOT NULL,
    analysis_mode TEXT NOT NULL DEFAULT 'rules',
    ai_model TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resume_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    master_id INTEGER NOT NULL REFERENCES resume_masters(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    content_json TEXT NOT NULL,
    rationale_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES resume_variants(id),
    status TEXT NOT NULL DEFAULT 'to_analyze',
    notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
  CREATE INDEX IF NOT EXISTS idx_analyses_job ON match_analyses(job_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_variants_job ON resume_variants(job_id, created_at DESC);
`);

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Row[];
  if (!columns.some((entry) => String(entry.name) === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("match_analyses", "analysis_mode", "TEXT NOT NULL DEFAULT 'rules'");
ensureColumn("match_analyses", "ai_model", "TEXT NOT NULL DEFAULT ''");
ensureColumn("match_analyses", "summary", "TEXT NOT NULL DEFAULT ''");

const now = () => new Date().toISOString();

function json<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

type Row = Record<string, unknown>;

function mapAnalysis(row?: Row): MatchAnalysis | undefined {
  if (!row) return undefined;
  return {
    id: Number(row.id),
    jobId: Number(row.job_id),
    totalScore: Number(row.total_score),
    confidence: Number(row.confidence),
    verdict: String(row.verdict) as MatchAnalysis["verdict"],
    dimensions: json<ScoreDimension[]>(row.dimensions_json, []),
    matchedKeywords: json<string[]>(row.matched_keywords_json, []),
    missingKeywords: json<string[]>(row.missing_keywords_json, []),
    strengths: json<string[]>(row.strengths_json, []),
    gaps: json<string[]>(row.gaps_json, []),
    analysisMode: String(row.analysis_mode || "rules") as MatchAnalysis["analysisMode"],
    aiModel: String(row.ai_model || ""),
    summary: String(row.summary || ""),
    createdAt: String(row.created_at),
  };
}

function mapJob(row: Row): Job {
  return {
    id: Number(row.id),
    source: String(row.source),
    sourceJobId: String(row.source_job_id),
    title: String(row.title),
    company: String(row.company),
    location: String(row.location),
    salaryText: String(row.salary_text),
    salaryMin: row.salary_min == null ? null : Number(row.salary_min),
    salaryMax: row.salary_max == null ? null : Number(row.salary_max),
    description: String(row.description),
    url: String(row.url),
    status: String(row.status) as JobStatus,
    postedAt: String(row.posted_at),
    collectedAt: String(row.collected_at),
  };
}

export function latestMaster(): ResumeMaster | null {
  const row = db
    .prepare(`SELECT m.*, s.filename FROM resume_masters m JOIN resume_sources s ON s.id=m.source_id ORDER BY m.version DESC LIMIT 1`)
    .get() as Row | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    version: Number(row.version),
    sourceId: Number(row.source_id),
    sourceFilename: String(row.filename),
    data: json<ResumeMasterData>(row.data_json, {} as ResumeMasterData),
    createdAt: String(row.created_at),
  };
}

export function sourceByHash(sha256: string): { id: number; master: ResumeMaster | null } | null {
  const row = db.prepare("SELECT id FROM resume_sources WHERE sha256=?").get(sha256) as Row | undefined;
  if (!row) return null;
  const masterRow = db
    .prepare(`SELECT m.*, s.filename FROM resume_masters m JOIN resume_sources s ON s.id=m.source_id WHERE source_id=? ORDER BY version DESC LIMIT 1`)
    .get(Number(row.id)) as Row | undefined;
  if (!masterRow) return { id: Number(row.id), master: null };
  return {
    id: Number(row.id),
    master: {
      id: Number(masterRow.id),
      version: Number(masterRow.version),
      sourceId: Number(masterRow.source_id),
      sourceFilename: String(masterRow.filename),
      data: json<ResumeMasterData>(masterRow.data_json, {} as ResumeMasterData),
      createdAt: String(masterRow.created_at),
    },
  };
}

export function createResumeMaster(input: {
  filename: string;
  mimeType: string;
  sha256: string;
  storedPath: string;
  rawText: string;
  parser: string;
  data: ResumeMasterData;
}): ResumeMaster {
  const importedAt = now();
  const source = db
    .prepare(`INSERT INTO resume_sources(filename,mime_type,sha256,stored_path,raw_text,parser,imported_at) VALUES(?,?,?,?,?,?,?)`)
    .run(input.filename, input.mimeType, input.sha256, input.storedPath, input.rawText, input.parser, importedAt);
  const versionRow = db.prepare("SELECT COALESCE(MAX(version),0)+1 AS version FROM resume_masters").get() as Row;
  const version = Number(versionRow.version);
  const master = db
    .prepare("INSERT INTO resume_masters(version,source_id,data_json,created_at) VALUES(?,?,?,?)")
    .run(version, Number(source.lastInsertRowid), JSON.stringify(input.data), importedAt);
  return latestMaster() ?? {
    id: Number(master.lastInsertRowid),
    version,
    sourceId: Number(source.lastInsertRowid),
    sourceFilename: input.filename,
    data: input.data,
    createdAt: importedAt,
  };
}

export function updateMaster(data: ResumeMasterData): ResumeMaster | null {
  const master = latestMaster();
  if (!master) return null;
  db.prepare("UPDATE resume_masters SET data_json=? WHERE id=?").run(JSON.stringify(data), master.id);
  return latestMaster();
}

export function insertJob(input: Omit<Job, "id" | "collectedAt" | "analysis">): { id: number; inserted: boolean } {
  const result = db
    .prepare(`INSERT OR IGNORE INTO jobs(source,source_job_id,title,company,location,salary_text,salary_min,salary_max,description,url,status,posted_at,collected_at,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      input.source,
      input.sourceJobId,
      input.title,
      input.company,
      input.location,
      input.salaryText,
      input.salaryMin,
      input.salaryMax,
      input.description,
      input.url,
      input.status,
      input.postedAt,
      now(),
      JSON.stringify(input),
    );
  if (result.changes) return { id: Number(result.lastInsertRowid), inserted: true };
  const existing = db.prepare("SELECT id FROM jobs WHERE source=? AND source_job_id=?").get(input.source, input.sourceJobId) as Row;
  return { id: Number(existing.id), inserted: false };
}

export function listJobs(filters: { status?: string; source?: string; query?: string } = {}): Job[] {
  const clauses: string[] = [];
  const values: string[] = [];
  if (filters.status) {
    clauses.push("j.status=?");
    values.push(filters.status);
  }
  if (filters.source) {
    clauses.push("j.source=?");
    values.push(filters.source);
  }
  if (filters.query) {
    clauses.push("(j.title LIKE ? OR j.company LIKE ? OR j.description LIKE ?)");
    const q = `%${filters.query}%`;
    values.push(q, q, q);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT j.* FROM jobs j ${where} ORDER BY j.collected_at DESC, j.id DESC`).all(...values) as Row[];
  const latestAnalysis = db.prepare("SELECT * FROM match_analyses WHERE job_id=? ORDER BY created_at DESC LIMIT 1");
  return rows.map((row) => ({ ...mapJob(row), analysis: mapAnalysis(latestAnalysis.get(Number(row.id)) as Row | undefined) }));
}

export function getJob(id: number): Job | null {
  const row = db.prepare("SELECT * FROM jobs WHERE id=?").get(id) as Row | undefined;
  if (!row) return null;
  const analysis = db.prepare("SELECT * FROM match_analyses WHERE job_id=? ORDER BY created_at DESC LIMIT 1").get(id) as Row | undefined;
  return { ...mapJob(row), analysis: mapAnalysis(analysis) };
}

export function saveAnalysis(masterId: number, analysis: Omit<MatchAnalysis, "id" | "createdAt">): MatchAnalysis {
  const createdAt = now();
  const result = db
    .prepare(`INSERT INTO match_analyses(job_id,master_id,total_score,confidence,verdict,dimensions_json,matched_keywords_json,missing_keywords_json,strengths_json,gaps_json,analysis_mode,ai_model,summary,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      analysis.jobId,
      masterId,
      analysis.totalScore,
      analysis.confidence,
      analysis.verdict,
      JSON.stringify(analysis.dimensions),
      JSON.stringify(analysis.matchedKeywords),
      JSON.stringify(analysis.missingKeywords),
      JSON.stringify(analysis.strengths),
      JSON.stringify(analysis.gaps),
      analysis.analysisMode,
      analysis.aiModel,
      analysis.summary,
      createdAt,
    );
  db.prepare("UPDATE jobs SET status=? WHERE id=?").run(analysis.verdict === "recommended" ? "shortlisted" : "analyzed", analysis.jobId);
  return { ...analysis, id: Number(result.lastInsertRowid), createdAt };
}

export function createVariant(input: {
  jobId: number;
  masterId: number;
  name: string;
  content: ResumeMasterData;
  rationale: string[];
}): ResumeVariant {
  const createdAt = now();
  const result = db
    .prepare("INSERT INTO resume_variants(job_id,master_id,name,status,content_json,rationale_json,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(input.jobId, input.masterId, input.name, "draft", JSON.stringify(input.content), JSON.stringify(input.rationale), createdAt);
  db.prepare(`INSERT INTO applications(job_id,variant_id,status,updated_at) VALUES(?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET variant_id=excluded.variant_id,status='to_review',updated_at=excluded.updated_at`)
    .run(input.jobId, Number(result.lastInsertRowid), "to_review", createdAt);
  return getVariant(Number(result.lastInsertRowid))!;
}

export function getVariant(id: number): ResumeVariant | null {
  const row = db
    .prepare(`SELECT v.*,j.title job_title,j.company FROM resume_variants v JOIN jobs j ON j.id=v.job_id WHERE v.id=?`)
    .get(id) as Row | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    jobId: Number(row.job_id),
    masterId: Number(row.master_id),
    jobTitle: String(row.job_title),
    company: String(row.company),
    name: String(row.name),
    status: String(row.status) as ResumeVariant["status"],
    content: json<ResumeMasterData>(row.content_json, {} as ResumeMasterData),
    rationale: json<string[]>(row.rationale_json, []),
    createdAt: String(row.created_at),
  };
}

export function findVariantForJobAndMaster(jobId: number, masterId: number): ResumeVariant | null {
  const row = db
    .prepare("SELECT id FROM resume_variants WHERE job_id=? AND master_id=? ORDER BY created_at DESC LIMIT 1")
    .get(jobId, masterId) as Row | undefined;
  return row ? getVariant(Number(row.id)) : null;
}

export function listVariants(): ResumeVariant[] {
  const rows = db.prepare(`SELECT v.id FROM resume_variants v ORDER BY v.created_at DESC`).all() as Row[];
  return rows.map((row) => getVariant(Number(row.id))!).filter(Boolean);
}

const applicationStatuses: ApplicationStatus[] = [
  "to_analyze",
  "to_tailor",
  "to_review",
  "to_apply",
  "applied",
  "talking",
  "interviewing",
  "offer",
  "closed",
];

export function listApplications(): Array<Record<string, unknown>> {
  return db
    .prepare(`SELECT a.*,j.title,j.company,j.source,v.name variant_name FROM applications a JOIN jobs j ON j.id=a.job_id LEFT JOIN resume_variants v ON v.id=a.variant_id ORDER BY a.updated_at DESC`)
    .all() as Row[];
}

export function setApplicationStatus(jobId: number, status: ApplicationStatus): void {
  if (!applicationStatuses.includes(status)) throw new Error("Invalid application status");
  db.prepare(`INSERT INTO applications(job_id,status,updated_at) VALUES(?,?,?) ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`)
    .run(jobId, status, now());
}

export function overview(): Overview {
  const count = (sql: string) => Number((db.prepare(sql).get() as Row).count);
  const applications = Object.fromEntries(applicationStatuses.map((status) => [status, 0])) as Record<ApplicationStatus, number>;
  for (const row of db.prepare("SELECT status,COUNT(*) count FROM applications GROUP BY status").all() as Row[]) {
    applications[String(row.status) as ApplicationStatus] = Number(row.count);
  }
  return {
    hasResume: Boolean(latestMaster()),
    jobs: count("SELECT COUNT(*) count FROM jobs"),
    analyzed: count("SELECT COUNT(*) count FROM jobs WHERE status IN ('analyzed','shortlisted')"),
    shortlisted: count("SELECT COUNT(*) count FROM jobs WHERE status='shortlisted'"),
    variants: count("SELECT COUNT(*) count FROM resume_variants"),
    applications,
  };
}

export function resetDatabaseForTests(): void {
  db.exec("DELETE FROM applications; DELETE FROM resume_variants; DELETE FROM match_analyses; DELETE FROM jobs; DELETE FROM resume_masters; DELETE FROM resume_sources;");
}
