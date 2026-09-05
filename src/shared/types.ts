export type FactStatus = "confirmed" | "pending" | "inferred" | "rejected";
export type JobStatus = "new" | "analyzed" | "shortlisted" | "ignored" | "expired";
export type ApplicationStatus =
  | "to_analyze"
  | "to_tailor"
  | "to_review"
  | "to_apply"
  | "applied"
  | "talking"
  | "interviewing"
  | "offer"
  | "closed";

export interface ResumeBasics {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
}

export interface ResumeItem {
  id: string;
  heading: string;
  subheading: string;
  dateRange: string;
  bullets: string[];
}

export interface ResumeSection {
  id: string;
  type: "education" | "experience" | "projects" | "skills" | "certifications" | "languages" | "other";
  title: string;
  items: ResumeItem[];
}

export interface ResumeMasterData {
  basics: ResumeBasics;
  sections: ResumeSection[];
  sourceText: string;
}

export interface ResumeMaster {
  id: number;
  version: number;
  sourceId: number;
  sourceFilename: string;
  data: ResumeMasterData;
  createdAt: string;
}

export interface Job {
  id: number;
  source: string;
  sourceJobId: string;
  title: string;
  company: string;
  location: string;
  salaryText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  url: string;
  status: JobStatus;
  postedAt: string;
  collectedAt: string;
  analysis?: MatchAnalysis;
}

export interface ScoreDimension {
  key: "hard" | "skills" | "evidence" | "preference" | "quality";
  label: string;
  score: number;
  weight: number;
  reasons: string[];
}

export interface MatchAnalysis {
  id: number;
  jobId: number;
  totalScore: number;
  confidence: number;
  verdict: "recommended" | "consider" | "not_recommended";
  dimensions: ScoreDimension[];
  matchedKeywords: string[];
  missingKeywords: string[];
  strengths: string[];
  gaps: string[];
  analysisMode: "rules" | "ai";
  aiModel: string;
  summary: string;
  createdAt: string;
}

export interface ResumeVariant {
  id: number;
  jobId: number;
  masterId: number;
  jobTitle: string;
  company: string;
  name: string;
  status: "draft" | "reviewed" | "exported" | "used";
  content: ResumeMasterData;
  rationale: string[];
  createdAt: string;
}

export interface Overview {
  hasResume: boolean;
  jobs: number;
  analyzed: number;
  shortlisted: number;
  variants: number;
  applications: Record<ApplicationStatus, number>;
}

export interface SourceDefinition {
  id: string;
  name: string;
  status: "available" | "planned" | "needs_login";
  capabilities: string[];
  note: string;
}

export interface AIStatus {
  configured: boolean;
  baseUrl: string;
  resolvedEndpoint: string;
  model: string;
  providerLabel: string;
  source: "environment" | "runtime" | "none";
  lastCheckedAt: string;
  lastError: string;
}

export interface AIModelCatalog {
  models: string[];
  endpoint: string;
  fetchedAt: string;
  total: number;
}

export interface SearchLink {
  id: string;
  name: string;
  url: string;
}

export interface SearchStrategy {
  id: string;
  title: string;
  query: string;
  keywords: string[];
  reason: string;
  confidence: number;
}

export interface SearchPlan {
  masterId: number;
  masterVersion: number;
  city: string;
  mode: "rules" | "ai";
  generatedAt: string;
  skills: string[];
  strategies: SearchStrategy[];
  fallbackReason?: string;
}

export interface PreparedJob {
  jobId: number;
  title: string;
  company: string;
  score: number;
  analysisMode: "rules" | "ai";
  variantId: number;
  reused: boolean;
}
