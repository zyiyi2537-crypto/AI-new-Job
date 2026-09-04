import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  FileCheck2,
  FileText,
  FolderSearch,
  Gauge,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import type { Job, Overview, ResumeMaster, ResumeMasterData, ResumeVariant, SourceDefinition } from "../shared/types";
import { api } from "./api";

type Page = "overview" | "resume" | "discover" | "jobs" | "variants" | "applications" | "settings";

const navItems: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "resume", label: "简历母版", icon: UserRound },
  { id: "discover", label: "岗位发现", icon: FolderSearch },
  { id: "jobs", label: "岗位库", icon: BriefcaseBusiness },
  { id: "variants", label: "简历版本", icon: FileCheck2 },
  { id: "applications", label: "投递看板", icon: BarChart3 },
  { id: "settings", label: "设置", icon: Settings },
];

const statusLabels: Record<string, string> = {
  new: "待分析",
  analyzed: "已分析",
  shortlisted: "推荐",
  ignored: "已忽略",
  expired: "已失效",
  to_analyze: "待分析",
  to_tailor: "待定制",
  to_review: "待确认",
  to_apply: "待投递",
  applied: "已投递",
  talking: "沟通中",
  interviewing: "面试中",
  offer: "Offer",
  closed: "已结束",
};

function Button({ children, icon: Icon, variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: typeof Plus; variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

function IconButton({ label, icon: Icon, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: typeof Plus }) {
  return <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}><Icon size={18} /></button>;
}

function EmptyState({ icon: Icon, title, body, action }: { icon: typeof FileText; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <Icon size={30} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

function ResumeUpload({ onUploaded, compact = false }: { onUploaded: (master: ResumeMaster) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.uploadResume(file);
      onUploaded(result.master);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`upload-zone ${dragging ? "is-dragging" : ""} ${compact ? "is-compact" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]); }}
    >
      <input ref={inputRef} type="file" accept=".pdf,.docx,.md,.txt,.json" hidden onChange={(event) => void upload(event.target.files?.[0])} />
      <div className="upload-icon">{busy ? <LoaderCircle className="spin" size={24} /> : <Upload size={24} />}</div>
      <div>
        <h3>{busy ? "正在解析简历" : compact ? "上传新版原始简历" : "上传你的现有简历"}</h3>
        <p>{compact ? "系统会识别差异，不会覆盖历史版本" : "PDF、DOCX、Markdown、TXT 或 JSON，最大 10 MB"}</p>
      </div>
      <Button icon={Upload} variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "处理中" : "选择文件"}</Button>
      {error ? <div className="inline-error"><AlertTriangle size={15} />{error}</div> : null}
    </div>
  );
}

function FirstRun({ onUploaded }: { onUploaded: (master: ResumeMaster) => void }) {
  return (
    <main className="onboarding">
      <header className="onboarding-header">
        <div className="brand-mark"><BriefcaseBusiness size={21} /></div>
        <div><strong>JobPilot CN</strong><span>本地 AI 求职工作台</span></div>
      </header>
      <section className="onboarding-main">
        <div className="onboarding-copy">
          <div className="eyebrow">第一步 / 建立简历母版</div>
          <h1>从你已有的简历开始</h1>
          <p>系统自动提取教育、工作、项目和技能。你只需要校对识别结果，不必重新填写整份资料。</p>
          <div className="trust-row"><ShieldCheck size={18} /><span>文件和解析结果仅保存在本机</span></div>
        </div>
        <ResumeUpload onUploaded={onUploaded} />
        <div className="process-strip" aria-label="导入流程">
          <span><b>1</b> 上传原始简历</span><ChevronRight size={16} />
          <span><b>2</b> 自动解析</span><ChevronRight size={16} />
          <span><b>3</b> 校对关键信息</span><ChevronRight size={16} />
          <span><b>4</b> 开始匹配岗位</span>
        </div>
      </section>
    </main>
  );
}

function ResumeDocument({ data, dense = false }: { data: ResumeMasterData; dense?: boolean }) {
  return (
    <article className={`resume-document ${dense ? "is-dense" : ""}`}>
      <header>
        <h2>{data.basics.name}</h2>
        <div className="resume-title">{data.basics.title}</div>
        <p>{[data.basics.phone, data.basics.email, data.basics.location].filter(Boolean).join(" · ")}</p>
      </header>
      {data.basics.summary ? <section><h3>个人概况</h3><p>{data.basics.summary}</p></section> : null}
      {data.sections.map((section) => (
        <section key={section.id}>
          <h3>{section.title}</h3>
          {section.items.map((item) => (
            <div className="resume-item" key={item.id}>
              <div className="resume-item-heading"><strong>{item.heading}</strong><span>{item.dateRange}</span></div>
              {item.subheading ? <div className="resume-subheading">{item.subheading}</div> : null}
              {item.bullets.length ? <ul>{item.bullets.map((bullet, index) => <li key={`${item.id}-${index}`}>{bullet}</li>)}</ul> : null}
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}

function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{actions ? <div className="page-actions">{actions}</div> : null}</div>;
}

function OverviewPage({ overview, master, jobs, onNavigate }: { overview: Overview; master: ResumeMaster; jobs: Job[]; onNavigate: (page: Page) => void }) {
  const high = jobs.filter((job) => (job.analysis?.totalScore || 0) >= 75).slice(0, 4);
  return (
    <>
      <PageHeader title="求职总览" subtitle="查看岗位筛选和简历定制进度" actions={<Button icon={FolderSearch} onClick={() => onNavigate("discover")}>发现岗位</Button>} />
      <div className="metrics-row">
        <div className="metric"><span>岗位总数</span><strong>{overview.jobs}</strong><small>已导入的岗位</small></div>
        <div className="metric"><span>已完成评分</span><strong>{overview.analyzed}</strong><small>包含推荐岗位</small></div>
        <div className="metric accent"><span>高匹配岗位</span><strong>{overview.shortlisted}</strong><small>建议优先处理</small></div>
        <div className="metric"><span>定制简历</span><strong>{overview.variants}</strong><small>按岗位独立保存</small></div>
      </div>
      <div className="dashboard-grid">
        <section className="workspace-section">
          <div className="section-heading"><div><h2>优先岗位</h2><p>按当前简历母版的匹配分排序</p></div><Button variant="ghost" onClick={() => onNavigate("jobs")}>查看全部</Button></div>
          {high.length ? <div className="priority-list">{high.map((job) => <div className="priority-row" key={job.id}><div className="score-ring">{job.analysis?.totalScore}</div><div className="grow"><strong>{job.title}</strong><span>{job.company} · {job.location || "地点未提供"}</span></div><span className="tag tag-green">推荐</span></div>)}</div> : <EmptyState icon={Gauge} title="还没有高匹配岗位" body="导入岗位并运行评分后，优先岗位会显示在这里。" />}
        </section>
        <section className="workspace-section">
          <div className="section-heading"><div><h2>当前简历母版</h2><p>版本 {master.version} · {master.sourceFilename}</p></div><Button variant="ghost" onClick={() => onNavigate("resume")}>查看母版</Button></div>
          <div className="master-summary">
            <div className="avatar-letter">{master.data.basics.name.slice(0, 1)}</div>
            <div><strong>{master.data.basics.name}</strong><span>{master.data.basics.title || "待确认目标职位"}</span></div>
          </div>
          <dl className="compact-stats"><div><dt>章节</dt><dd>{master.data.sections.length}</dd></div><div><dt>经历条目</dt><dd>{master.data.sections.reduce((sum, section) => sum + section.items.length, 0)}</dd></div><div><dt>导入日期</dt><dd>{new Date(master.createdAt).toLocaleDateString("zh-CN")}</dd></div></dl>
        </section>
      </div>
      <section className="workspace-section next-actions">
        <div className="section-heading"><div><h2>建议动作</h2><p>按当前数据状态生成</p></div></div>
        <div className="action-row">
          <button onClick={() => onNavigate("discover")}><FolderSearch size={19} /><span><strong>导入目标岗位</strong><small>粘贴 JD 或载入示例岗位</small></span><ArrowRight size={17} /></button>
          <button onClick={() => onNavigate("jobs")}><Sparkles size={19} /><span><strong>运行岗位评分</strong><small>查看证据、缺口与风险</small></span><ArrowRight size={17} /></button>
          <button onClick={() => onNavigate("variants")}><FileCheck2 size={19} /><span><strong>审阅定制简历</strong><small>每个岗位保存独立版本</small></span><ArrowRight size={17} /></button>
        </div>
      </section>
    </>
  );
}

function ResumePage({ master, onUploaded }: { master: ResumeMaster; onUploaded: (master: ResumeMaster) => void }) {
  return (
    <>
      <PageHeader title="简历母版" subtitle="所有岗位版本都从这份已上传的事实底稿派生" />
      <div className="split-layout resume-layout">
        <section className="workspace-section source-panel">
          <div className="section-heading"><div><h2>原始资料</h2><p>当前版本及解析状态</p></div><span className="tag tag-green"><Check size={13} />已解析</span></div>
          <dl className="detail-list"><div><dt>文件</dt><dd>{master.sourceFilename}</dd></div><div><dt>母版版本</dt><dd>v{master.version}</dd></div><div><dt>导入时间</dt><dd>{new Date(master.createdAt).toLocaleString("zh-CN")}</dd></div><div><dt>章节数量</dt><dd>{master.data.sections.length}</dd></div></dl>
          <ResumeUpload compact onUploaded={onUploaded} />
          <div className="notice"><ShieldCheck size={17} /><p>重新上传会创建新版本。已经确认的历史母版不会被静默覆盖。</p></div>
        </section>
        <div className="document-stage"><ResumeDocument data={master.data} /></div>
      </div>
    </>
  );
}

function DiscoverPage({ sources, onChanged }: { sources: SourceDefinition[]; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ title: "", company: "", location: "", salaryText: "", url: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      await api.importJob({ ...form, source: "manual", salaryMin: null, salaryMax: null, postedAt: "" });
      setForm({ title: "", company: "", location: "", salaryText: "", url: "", description: "" });
      setMessage("岗位已导入，可以前往岗位库评分。");
      await onChanged();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "导入失败"); }
    finally { setBusy(false); }
  };
  const seed = async () => { setBusy(true); await api.seedJobs(); await onChanged(); setMessage("已载入两个示例岗位。"); setBusy(false); };
  return (
    <>
      <PageHeader title="岗位发现" subtitle="连接招聘平台，或先粘贴一个真实 JD 验证分析流程" actions={<Button icon={Database} variant="secondary" disabled={busy} onClick={() => void seed()}>载入示例岗位</Button>} />
      <section className="workspace-section">
        <div className="section-heading"><div><h2>招聘平台</h2><p>平台采集器采用独立适配器，登录和故障互不影响</p></div></div>
        <div className="source-grid">{sources.map((source) => <div className="source-row" key={source.id}><div className={`source-logo source-${source.id}`}>{source.name.slice(0, 1)}</div><div className="grow"><strong>{source.name}</strong><span>{source.note}</span><div className="capabilities">{source.capabilities.map((item) => <em key={item}>{item}</em>)}</div></div><span className={`tag ${source.status === "available" ? "tag-green" : source.status === "planned" ? "tag-muted" : "tag-amber"}`}>{source.status === "available" ? "可用" : source.status === "planned" ? "规划中" : "待接入"}</span></div>)}</div>
      </section>
      <section className="workspace-section form-section">
        <div className="section-heading"><div><h2>粘贴岗位 JD</h2><p>岗位至少需要名称、公司和 20 字以上的职位描述</p></div></div>
        <form className="job-form" onSubmit={submit}>
          <label><span>岗位名称</span><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：AI 产品经理" /></label>
          <label><span>公司</span><input required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="公司名称" /></label>
          <label><span>城市</span><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="杭州" /></label>
          <label><span>薪资</span><input value={form.salaryText} onChange={(e) => setForm({ ...form, salaryText: e.target.value })} placeholder="20-35K" /></label>
          <label className="full"><span>原始链接</span><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></label>
          <label className="full"><span>职位描述</span><textarea required minLength={20} rows={8} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="粘贴完整职责和任职要求" /></label>
          <div className="form-footer"><span className="form-message">{message}</span><Button icon={Plus} disabled={busy}>{busy ? "正在导入" : "导入岗位"}</Button></div>
        </form>
      </section>
    </>
  );
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="score-badge empty">--</span>;
  return <span className={`score-badge ${score >= 75 ? "good" : score >= 55 ? "medium" : "low"}`}>{score}</span>;
}

function JobsPage({ jobs, refresh }: { jobs: Job[]; refresh: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<number | null>(jobs[0]?.id || null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => { if (!selectedId && jobs[0]) setSelectedId(jobs[0].id); }, [jobs, selectedId]);
  const selected = jobs.find((job) => job.id === selectedId) || null;
  const filtered = jobs.filter((job) => `${job.title}${job.company}${job.description}`.toLowerCase().includes(query.toLowerCase()));
  const analyze = async (id: number) => { setBusy(true); try { await api.analyzeJob(id); await refresh(); } finally { setBusy(false); } };
  const analyzeAll = async () => { setBusy(true); try { await api.analyzeAll(); await refresh(); } finally { setBusy(false); } };
  const createVariant = async (id: number) => { setBusy(true); try { await api.createVariant(id); await refresh(); } finally { setBusy(false); } };
  return (
    <>
      <PageHeader title="岗位库" subtitle="统一查看岗位、评分依据和简历证据缺口" actions={<Button icon={Sparkles} disabled={busy || !jobs.length} onClick={() => void analyzeAll()}>批量评分</Button>} />
      <div className="jobs-toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索岗位或公司" /></div><div className="toolbar-count"><ListFilter size={16} />{filtered.length} 个岗位</div></div>
      {!jobs.length ? <EmptyState icon={BriefcaseBusiness} title="岗位库还是空的" body="前往岗位发现页粘贴 JD，或载入示例岗位。" /> : <div className="jobs-layout">
        <div className="job-table-wrap"><table className="job-table"><thead><tr><th>匹配</th><th>岗位 / 公司</th><th>地点</th><th>薪资</th><th>来源</th><th>状态</th></tr></thead><tbody>{filtered.map((job) => <tr className={selectedId === job.id ? "selected" : ""} key={job.id} onClick={() => setSelectedId(job.id)}><td><ScoreBadge score={job.analysis?.totalScore} /></td><td><strong>{job.title}</strong><span>{job.company}</span></td><td>{job.location || "--"}</td><td>{job.salaryText || "--"}</td><td>{job.source}</td><td><span className={`tag ${job.status === "shortlisted" ? "tag-green" : "tag-muted"}`}>{statusLabels[job.status]}</span></td></tr>)}</tbody></table></div>
        {selected ? <aside className="job-detail"><div className="job-detail-header"><div><h2>{selected.title}</h2><p>{selected.company} · {selected.location || "地点未提供"}</p></div><ScoreBadge score={selected.analysis?.totalScore} /></div><div className="job-meta"><span>{selected.salaryText || "薪资未提供"}</span><span>{selected.source}</span>{selected.postedAt ? <span>{selected.postedAt}</span> : null}</div>{selected.analysis ? <><div className="verdict-line"><span className="tag tag-green">{selected.analysis.verdict === "recommended" ? "建议优先申请" : selected.analysis.verdict === "consider" ? "可进一步评估" : "暂不推荐"}</span><small>置信度 {selected.analysis.confidence}%</small></div><div className="dimension-list">{selected.analysis.dimensions.map((dimension) => <div key={dimension.key}><div><span>{dimension.label}</span><b>{dimension.score}</b></div><div className="progress"><i style={{ width: `${dimension.score}%` }} /></div><small>{dimension.reasons[0]}</small></div>)}</div><div className="keyword-block"><h3>命中证据</h3><div>{selected.analysis.matchedKeywords.length ? selected.analysis.matchedKeywords.map((item) => <span className="keyword hit" key={item}>{item}</span>) : <small>尚无直接命中</small>}</div><h3>待补证据</h3><div>{selected.analysis.missingKeywords.length ? selected.analysis.missingKeywords.map((item) => <span className="keyword missing" key={item}>{item}</span>) : <small>未识别到明显技能缺口</small>}</div></div></> : <div className="analysis-prompt"><Gauge size={26} /><h3>尚未评分</h3><p>评分会展示硬条件、技能、经历证据、方向偏好和岗位质量。</p></div>}<div className="job-description"><h3>职位描述</h3><p>{selected.description}</p></div><div className="detail-actions"><Button icon={RefreshCw} variant="secondary" disabled={busy} onClick={() => void analyze(selected.id)}>{selected.analysis ? "重新评分" : "开始评分"}</Button><Button icon={WandSparkles} disabled={busy} onClick={() => void createVariant(selected.id)}>生成岗位简历</Button></div></aside> : null}
      </div>}
    </>
  );
}

function VariantsPage({ variants }: { variants: ResumeVariant[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(variants[0]?.id || null);
  useEffect(() => { if (!selectedId && variants[0]) setSelectedId(variants[0].id); }, [variants, selectedId]);
  const selected = variants.find((variant) => variant.id === selectedId) || null;
  return (
    <>
      <PageHeader title="简历版本" subtitle="每个岗位拥有独立版本，所有修改都基于原始简历事实" />
      {!variants.length ? <EmptyState icon={FileCheck2} title="还没有岗位定制版本" body="在岗位详情中完成评分并点击“生成岗位简历”。" /> : <div className="variants-layout"><aside className="variant-list">{variants.map((variant) => <button key={variant.id} className={selectedId === variant.id ? "active" : ""} onClick={() => setSelectedId(variant.id)}><FileText size={18} /><span><strong>{variant.jobTitle}</strong><small>{variant.company} · {new Date(variant.createdAt).toLocaleDateString("zh-CN")}</small></span><ChevronRight size={16} /></button>)}</aside>{selected ? <div className="variant-content"><section className="rationale"><div className="section-heading"><div><h2>{selected.name}</h2><p>生成依据</p></div><span className="tag tag-amber">草稿待确认</span></div><ul>{selected.rationale.map((reason) => <li key={reason}><Check size={15} />{reason}</li>)}</ul></section><div className="document-stage"><ResumeDocument data={selected.content} dense /></div></div> : null}</div>}
    </>
  );
}

function ApplicationsPage({ applications, refresh }: { applications: Array<Record<string, unknown>>; refresh: () => Promise<void> }) {
  const statuses = ["to_review", "to_apply", "applied", "talking", "interviewing", "offer", "closed"];
  return (
    <>
      <PageHeader title="投递看板" subtitle="投递和消息发送保留人工确认，岗位与简历版本完整关联" />
      {!applications.length ? <EmptyState icon={BarChart3} title="还没有投递记录" body="生成岗位定制简历后，系统会自动建立待确认记录。" /> : <div className="application-board">{statuses.map((status) => { const items = applications.filter((item) => item.status === status); return <section key={status}><header><span>{statusLabels[status]}</span><b>{items.length}</b></header><div>{items.map((item) => <article key={String(item.id)}><strong>{String(item.title)}</strong><p>{String(item.company)}</p><small>{String(item.variant_name || "尚未选择简历")}</small><select value={String(item.status)} onChange={async (event) => { await api.setApplicationStatus(Number(item.job_id), event.target.value); await refresh(); }}>{statuses.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></article>)}</div></section>; })}</div>}
    </>
  );
}

function SettingsPage() {
  return (
    <>
      <PageHeader title="设置" subtitle="本地数据、AI 服务和平台连接策略" />
      <div className="settings-layout">
        <section className="workspace-section"><div className="section-heading"><div><h2>数据与隐私</h2><p>首版数据仅保存在当前电脑</p></div><ShieldCheck size={20} /></div><dl className="detail-list"><div><dt>数据库</dt><dd>data/jobpilot.db</dd></div><div><dt>原始简历</dt><dd>data/uploads</dd></div><div><dt>Cookie 策略</dt><dd>不导出明文 Cookie</dd></div></dl></section>
        <section className="workspace-section"><div className="section-heading"><div><h2>AI 服务</h2><p>当前 MVP 使用可解释的本地规则评分</p></div><Sparkles size={20} /></div><div className="notice"><CircleHelp size={17} /><p>模型供应商配置将在下一里程碑开放。没有 API Key 时，上传、岗位导入、评分和版本生成仍可使用。</p></div></section>
        <section className="workspace-section"><div className="section-heading"><div><h2>投递保护</h2><p>默认安全模式</p></div><ShieldCheck size={20} /></div><dl className="detail-list"><div><dt>批量准备</dt><dd><span className="tag tag-green">允许</span></dd></div><div><dt>自动提交</dt><dd><span className="tag tag-muted">关闭</span></dd></div><div><dt>AI 自动回复</dt><dd><span className="tag tag-muted">关闭</span></dd></div></dl></section>
      </div>
    </>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [master, setMaster] = useState<ResumeMaster | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [variants, setVariants] = useState<ResumeVariant[]>([]);
  const [applications, setApplications] = useState<Array<Record<string, unknown>>>([]);
  const [sources, setSources] = useState<SourceDefinition[]>([]);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [nextOverview, nextJobs, nextVariants, nextApplications, nextSources] = await Promise.all([api.overview(), api.jobs(), api.variants(), api.applications(), api.sources()]);
      setOverview(nextOverview); setJobs(nextJobs); setVariants(nextVariants); setApplications(nextApplications); setSources(nextSources);
      if (nextOverview.hasResume) setMaster(await api.master()); else setMaster(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "无法连接本地服务"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const currentNav = useMemo(() => navItems.find((item) => item.id === page), [page]);
  const navigate = (next: Page) => { setPage(next); setSidebarOpen(false); };
  const uploaded = async (nextMaster: ResumeMaster) => { setMaster(nextMaster); await refresh(); setPage("overview"); };

  if (loading) return <div className="app-loading"><LoaderCircle className="spin" size={28} /><span>正在打开本地工作台</span></div>;
  if (!master) return <FirstRun onUploaded={(item) => void uploaded(item)} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand"><div className="brand-mark"><BriefcaseBusiness size={20} /></div><div><strong>JobPilot CN</strong><span>AI 求职工作台</span></div><IconButton className="mobile-close" label="关闭菜单" icon={X} onClick={() => setSidebarOpen(false)} /></div>
        <nav>{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span>{item.id === "jobs" && jobs.length ? <b>{jobs.length}</b> : null}</button>; })}</nav>
        <div className="sidebar-status"><div><span className="status-dot" /><strong>本地模式</strong></div><p>数据保存在当前电脑</p></div>
      </aside>
      {sidebarOpen ? <button className="sidebar-backdrop" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} /> : null}
      <main className="main-panel">
        <div className="mobile-bar"><IconButton label="打开菜单" icon={Menu} onClick={() => setSidebarOpen(true)} /><strong>{currentNav?.label}</strong><IconButton label="刷新数据" icon={RefreshCw} onClick={() => void refresh()} /></div>
        {error ? <div className="global-error"><AlertTriangle size={17} />{error}<button onClick={() => void refresh()}>重试</button></div> : null}
        <div className="page-content">
          {page === "overview" && overview ? <OverviewPage overview={overview} master={master} jobs={jobs} onNavigate={navigate} /> : null}
          {page === "resume" ? <ResumePage master={master} onUploaded={(item) => void uploaded(item)} /> : null}
          {page === "discover" ? <DiscoverPage sources={sources} onChanged={refresh} /> : null}
          {page === "jobs" ? <JobsPage jobs={jobs} refresh={refresh} /> : null}
          {page === "variants" ? <VariantsPage variants={variants} /> : null}
          {page === "applications" ? <ApplicationsPage applications={applications} refresh={refresh} /> : null}
          {page === "settings" ? <SettingsPage /> : null}
        </div>
      </main>
    </div>
  );
}
