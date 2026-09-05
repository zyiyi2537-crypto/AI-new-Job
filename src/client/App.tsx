import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  Gauge,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Menu,
  MapPin,
  Plus,
  Radar,
  RefreshCw,
  Search,
  ScanSearch,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  WandSparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AIStatus, Job, Overview, ResumeMaster, ResumeMasterData, ResumeVariant, SearchLink, SearchPlan, SearchStrategy, SourceDefinition } from "../shared/types";
import { CITY_GROUPS, normalizeCityName } from "../shared/cities";
import { api } from "./api";
import { collectJobsFromPage, type CapturedJob } from "./job-capture";

type Page = "overview" | "resume" | "discover" | "jobs" | "variants" | "applications" | "settings";

const navItems: Array<{ id: Page; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "resume", label: "简历母版", icon: UserRound },
  { id: "discover", label: "岗位发现", icon: Radar },
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

function Button({ children, icon: Icon, variant = "primary", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

function IconButton({ label, icon: Icon, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: LucideIcon }) {
  return <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}><Icon size={18} /></button>;
}

function Tag({ children, tone = "neutral", icon: Icon }: { children: React.ReactNode; tone?: "green" | "amber" | "red" | "blue" | "neutral"; icon?: LucideIcon }) {
  return <span className={`tag tag-${tone}`}>{Icon ? <Icon size={12} /> : null}{children}</span>;
}

function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state"><Icon size={30} /><h3>{title}</h3><p>{body}</p>{action}</div>;
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
      <div className="upload-copy">
        <h3>{busy ? "正在解析简历" : compact ? "上传新版简历" : "把现有简历拖到这里"}</h3>
        <p>{compact ? "创建新母版版本，历史版本继续保留" : "PDF、DOCX、Markdown、TXT、JSON，最大 10 MB"}</p>
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
        <div className="brand-mark"><BriefcaseBusiness size={20} /></div>
        <div><strong>JobPilot CN</strong><span>本地 AI 求职工作台</span></div>
        <Tag tone="green" icon={ShieldCheck}>本地数据</Tag>
      </header>
      <section className="onboarding-main">
        <div className="onboarding-copy">
          <span className="eyebrow">建立可信事实底稿</span>
          <h1>上传一份简历，开始筛选真实岗位</h1>
          <p>系统会提取教育、工作、项目与技能。后续每份岗位简历都从这份事实母版派生，不要求你重新填写整套资料。</p>
        </div>
        <ResumeUpload onUploaded={onUploaded} />
        <div className="process-strip">
          <span><b>01</b> 上传并解析</span><ChevronRight size={15} />
          <span><b>02</b> 自动规划方向</span><ChevronRight size={15} />
          <span><b>03</b> 扫描并匹配 JD</span><ChevronRight size={15} />
          <span><b>04</b> 生成岗位简历</span>
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

function aiStatusView(status: AIStatus): { label: string; detail: string; tone: "green" | "amber" | "red"; connected: boolean } {
  if (status.lastError) return { label: "连接失败", detail: status.model || "检查模型配置", tone: "red", connected: false };
  if (status.configured && status.lastCheckedAt) return { label: "已连接", detail: status.model, tone: "green", connected: true };
  if (status.configured) return { label: "待测试", detail: status.model, tone: "amber", connected: false };
  return { label: "未配置", detail: "规则模式可用", tone: "amber", connected: false };
}

function OverviewPage({ overview, master, jobs, aiStatus, onNavigate }: { overview: Overview; master: ResumeMaster; jobs: Job[]; aiStatus: AIStatus; onNavigate: (page: Page) => void }) {
  const priority = [...jobs].filter((job) => job.analysis).sort((a, b) => (b.analysis?.totalScore || 0) - (a.analysis?.totalScore || 0)).slice(0, 5);
  const aiView = aiStatusView(aiStatus);
  return (
    <>
      <PageHeader title="求职总览" subtitle="从岗位进入、匹配分析到投递结果的统一工作区" actions={<Button icon={Radar} onClick={() => onNavigate("discover")}>发现岗位</Button>} />
      <section className="metric-band">
        <div><span>岗位池</span><strong>{overview.jobs}</strong><small>已去重入库</small></div>
        <div><span>已分析</span><strong>{overview.analyzed}</strong><small>规则或 AI</small></div>
        <div className="metric-focus"><span>高匹配</span><strong>{overview.shortlisted}</strong><small>建议优先处理</small></div>
        <div><span>岗位简历</span><strong>{overview.variants}</strong><small>独立版本</small></div>
        <div><span>AI 引擎</span><strong className="metric-text">{aiView.label}</strong><small>{aiView.detail}</small></div>
      </section>
      <div className="dashboard-grid">
        <section className="surface priority-panel">
          <div className="section-heading"><div><h2>优先队列</h2><p>按最近一次匹配得分排序</p></div><Button variant="ghost" onClick={() => onNavigate("jobs")}>全部岗位</Button></div>
          {priority.length ? <div className="priority-list">{priority.map((job) => (
            <button className="priority-row" key={job.id} onClick={() => onNavigate("jobs")}>
              <span className={`score-number ${(job.analysis?.totalScore || 0) >= 75 ? "good" : "medium"}`}>{job.analysis?.totalScore}</span>
              <span className="grow"><strong>{job.title}</strong><small>{job.company} · {job.location || "地点待确认"}</small></span>
              <Tag tone={job.analysis?.analysisMode === "ai" ? "blue" : "neutral"} icon={job.analysis?.analysisMode === "ai" ? Bot : Gauge}>{job.analysis?.analysisMode === "ai" ? "AI" : "规则"}</Tag>
              <ArrowRight size={16} />
            </button>
          ))}</div> : <EmptyState icon={Gauge} title="还没有分析结果" body="导入岗位后运行规则评分或 AI 深度分析。" action={<Button variant="secondary" onClick={() => onNavigate("discover")}>导入岗位</Button>} />}
        </section>
        <aside className="surface control-panel">
          <div className="section-heading"><div><h2>当前母版</h2><p>v{master.version} · {master.sourceFilename}</p></div><Tag tone="green" icon={Check}>可用</Tag></div>
          <div className="profile-line"><div className="avatar-letter">{master.data.basics.name.slice(0, 1)}</div><div><strong>{master.data.basics.name}</strong><span>{master.data.basics.title || "目标职位待确认"}</span></div></div>
          <dl className="detail-list compact"><div><dt>章节</dt><dd>{master.data.sections.length}</dd></div><div><dt>经历条目</dt><dd>{master.data.sections.reduce((sum, section) => sum + section.items.length, 0)}</dd></div><div><dt>更新时间</dt><dd>{new Date(master.createdAt).toLocaleDateString("zh-CN")}</dd></div></dl>
          <Button variant="secondary" className="full-button" onClick={() => onNavigate("resume")}>检查简历母版</Button>
        </aside>
      </div>
      <section className="next-band">
        <button onClick={() => onNavigate("discover")}><Radar size={19} /><span><strong>采集岗位</strong><small>搜索平台、URL 或 Chrome 助手</small></span><ArrowRight size={16} /></button>
        <button onClick={() => onNavigate("jobs")}><Sparkles size={19} /><span><strong>深度分析</strong><small>查看证据、缺口与 AI 解释</small></span><ArrowRight size={16} /></button>
        <button onClick={() => onNavigate("applications")}><ClipboardCheck size={19} /><span><strong>推进投递</strong><small>人工确认并记录结果</small></span><ArrowRight size={16} /></button>
      </section>
    </>
  );
}

function ResumePage({ master, onUploaded }: { master: ResumeMaster; onUploaded: (master: ResumeMaster) => void }) {
  return (
    <>
      <PageHeader title="简历母版" subtitle="岗位分析和定制版本使用的事实来源" actions={<Tag tone="green" icon={ShieldCheck}>本地保存</Tag>} />
      <div className="resume-workbench">
        <aside className="surface source-panel">
          <div className="section-heading"><div><h2>资料来源</h2><p>解析状态与版本</p></div><Tag tone="green" icon={Check}>已解析</Tag></div>
          <dl className="detail-list"><div><dt>文件</dt><dd>{master.sourceFilename}</dd></div><div><dt>版本</dt><dd>v{master.version}</dd></div><div><dt>导入时间</dt><dd>{new Date(master.createdAt).toLocaleString("zh-CN")}</dd></div></dl>
          <ResumeUpload compact onUploaded={onUploaded} />
          <div className="notice"><ShieldCheck size={17} /><p>上传新版会创建新母版，不静默覆盖已生成的岗位版本。</p></div>
        </aside>
        <div className="document-stage"><ResumeDocument data={master.data} /></div>
      </div>
    </>
  );
}

type ImportMode = "url" | "manual";

const isDesktopShell = () => new URLSearchParams(window.location.search).get("desktop") === "1" || /Electron\//i.test(navigator.userAgent);

function EmbeddedRecruitmentBrowser({ links, aiStatus, onChanged }: { links: SearchLink[]; aiStatus: AIStatus; onChanged: () => Promise<void> }) {
  const [webview, setWebview] = useState<HTMLWebViewElement | null>(null);
  const [activeId, setActiveId] = useState("boss");
  const [requestedUrl, setRequestedUrl] = useState(links.find((link) => link.id === "boss")?.url || "https://www.zhipin.com/");
  const [address, setAddress] = useState(requestedUrl);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [busy, setBusy] = useState<"current" | "list" | "prepare" | "">("");
  const [capturedIds, setCapturedIds] = useState<number[]>([]);
  const [message, setMessage] = useState("招聘网站登录态只保存在这个桌面应用中。");

  const syncNavigation = useCallback(() => {
    if (!webview) return;
    const currentUrl = webview.getURL();
    if (currentUrl) setAddress(currentUrl);
    setCanGoBack(webview.canGoBack());
    setCanGoForward(webview.canGoForward());
  }, [webview]);

  useEffect(() => {
    if (!webview) return undefined;
    const started = () => setLoading(true);
    const stopped = () => { setLoading(false); syncNavigation(); };
    const navigated = () => syncNavigation();
    const failed = (event: Event) => {
      const detail = event as Event & { errorDescription?: string; validatedURL?: string };
      if (detail.errorDescription === "ERR_ABORTED") return;
      setLoading(false);
      setMessage(`页面加载失败：${detail.errorDescription || detail.validatedURL || "未知错误"}`);
    };
    webview.addEventListener("did-start-loading", started);
    webview.addEventListener("did-stop-loading", stopped);
    webview.addEventListener("did-navigate", navigated);
    webview.addEventListener("did-navigate-in-page", navigated);
    webview.addEventListener("did-fail-load", failed);
    return () => {
      webview.removeEventListener("did-start-loading", started);
      webview.removeEventListener("did-stop-loading", stopped);
      webview.removeEventListener("did-navigate", navigated);
      webview.removeEventListener("did-navigate-in-page", navigated);
      webview.removeEventListener("did-fail-load", failed);
    };
  }, [syncNavigation, webview]);

  useEffect(() => {
    const next = links.find((link) => link.id === activeId);
    if (!next || next.url === requestedUrl) return;
    setRequestedUrl(next.url);
    setAddress(next.url);
  }, [activeId, links, requestedUrl]);

  const navigate = (nextUrl: string) => {
    let parsed: URL;
    try { parsed = new URL(nextUrl); }
    catch { setMessage("请输入完整的 http 或 https 地址。"); return; }
    if (!/^https?:$/.test(parsed.protocol)) { setMessage("只支持 http 或 https 页面。"); return; }
    setRequestedUrl(parsed.toString());
    setAddress(parsed.toString());
    setMessage("正在打开招聘页面...");
    if (webview) void webview.loadURL(parsed.toString());
  };

  const switchPlatform = (link: SearchLink) => {
    setActiveId(link.id);
    navigate(link.url);
  };

  const capture = async (mode: "current" | "list") => {
    if (!webview || loading) { setMessage("请等待招聘页面加载完成。"); return; }
    setBusy(mode);
    setMessage(mode === "current" ? "正在读取当前岗位..." : "正在扫描当前列表...");
    try {
      const script = `(${collectJobsFromPage.toString()})(${JSON.stringify(mode)})`;
      const captured = await webview.executeJavaScript<CapturedJob[]>(script, true);
      const jobs = Array.isArray(captured) ? captured.filter((job) => job.title && job.description?.length >= 20 && /^https?:/.test(job.url)) : [];
      if (!jobs.length) throw new Error(mode === "current" ? "当前页面不是完整岗位详情，请打开一个岗位后重试" : "当前页面没有识别到岗位列表，请确认列表已加载");
      const result = await api.captureJobs(jobs, true);
      setCapturedIds(result.ids);
      const top = result.topMatches[0];
      setMessage(`读取 ${result.received} 条，新增 ${result.inserted} 条，已自动评分 ${result.analyzed} 条${top ? `；当前最高 ${top.score} 分：${top.title}` : ""}。`);
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "岗位采集失败");
    } finally {
      setBusy("");
    }
  };

  const prepare = async () => {
    if (!capturedIds.length) return;
    setBusy("prepare");
    setMessage(aiStatus.configured ? "正在用 AI 深度分析高匹配岗位并生成简历..." : "正在按母版为高匹配岗位生成简历...");
    try {
      const result = await api.prepareJobs(capturedIds, { maxVariants: 3, minScore: 55, mode: "auto" });
      const aiCount = result.prepared.filter((item) => item.analysisMode === "ai").length;
      const reused = result.prepared.filter((item) => item.reused).length;
      if (!result.prepared.length) {
        setMessage(result.failures[0] || "当前岗位均未达到 55 分，暂不生成简历。");
      } else {
        setMessage(`已准备 ${result.prepared.length} 份岗位简历${aiCount ? `，其中 ${aiCount} 份完成 AI 深度分析` : ""}${reused ? `；复用 ${reused} 份已有版本` : ""}。`);
      }
      await onChanged();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "岗位简历生成失败");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="surface embedded-browser">
      <header className="embedded-browser-head">
        <div><h2>内置招聘浏览器</h2><p>登录、搜索、查看岗位并直接采集到岗位库</p></div>
        <Tag tone="green" icon={Globe2}>桌面模式</Tag>
      </header>
      <div className="embedded-platform-tabs" role="tablist">
        {links.map((link) => <button key={link.id} className={activeId === link.id ? "active" : ""} onClick={() => switchPlatform(link)}><span className={`source-logo source-${link.id}`}>{link.name.slice(0, 1)}</span>{link.name}</button>)}
      </div>
      <div className="browser-toolbar">
        <IconButton icon={ArrowLeft} label="后退" disabled={!canGoBack} onClick={() => webview?.goBack()} />
        <IconButton icon={ArrowRight} label="前进" disabled={!canGoForward} onClick={() => webview?.goForward()} />
        <IconButton icon={RefreshCw} label="刷新招聘页面" onClick={() => webview?.reload()} />
        <form onSubmit={(event) => { event.preventDefault(); navigate(address); }}><Globe2 size={15} /><input aria-label="招聘页面地址" value={address} onChange={(event) => setAddress(event.target.value)} /><button>打开</button></form>
        <Button icon={FileText} variant="secondary" disabled={Boolean(busy) || loading} onClick={() => void capture("current")}>{busy === "current" ? "读取中" : "采集当前岗位"}</Button>
        <Button icon={ScanSearch} disabled={Boolean(busy) || loading} onClick={() => void capture("list")}>{busy === "list" ? "扫描评分中" : "扫描并匹配"}</Button>
      </div>
      <div className={`webview-stage ${loading ? "is-loading" : ""}`}>
        {loading ? <div className="webview-loading"><LoaderCircle className="spin" size={20} />正在加载招聘网站</div> : null}
        <webview ref={setWebview} src={requestedUrl} partition="persist:jobpilot-recruitment" useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" />
      </div>
      <div className="browser-result-bar">
        <div className={`browser-message ${/失败|没有|不是|请等待|请输入|未达到/.test(message) ? "error" : ""}`}><ShieldCheck size={15} />{message}</div>
        {capturedIds.length ? <Button icon={WandSparkles} disabled={Boolean(busy)} onClick={() => void prepare()}>{busy === "prepare" ? "正在生成" : "生成 Top 3 简历"}</Button> : null}
      </div>
    </section>
  );
}

function DiscoverPage({ master, aiStatus, sources, jobCount, onChanged }: { master: ResumeMaster; aiStatus: AIStatus; sources: SourceDefinition[]; jobCount: number; onChanged: () => Promise<void> }) {
  const [query, setQuery] = useState(master.data.basics.title || "相关岗位");
  const [city, setCity] = useState(normalizeCityName(master.data.basics.location));
  const [links, setLinks] = useState<SearchLink[]>([]);
  const [plan, setPlan] = useState<SearchPlan | null>(null);
  const [activeStrategyId, setActiveStrategyId] = useState("");
  const [planning, setPlanning] = useState(true);
  const [planMessage, setPlanMessage] = useState("");
  const [collectorPath, setCollectorPath] = useState("D:\\toudi\\extension");
  const [mode, setMode] = useState<ImportMode>("url");
  const [url, setUrl] = useState("");
  const [form, setForm] = useState({ title: "", company: "", location: "", salaryText: "", url: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const desktopMode = isDesktopShell();

  const useStrategy = async (strategy: SearchStrategy, nextCity = city) => {
    setActiveStrategyId(strategy.id);
    setQuery(strategy.query);
    setLinks(await api.searchLinks(strategy.query, nextCity));
  };

  const createPlan = async (refresh = false) => {
    setPlanning(true);
    setPlanMessage(aiStatus.configured ? "AI 正在从母版生成求职方向..." : "正在从母版提取求职方向...");
    try {
      const next = await api.searchPlan(city, { preferAI: aiStatus.configured, refresh });
      setPlan(next);
      setCity(next.city);
      if (next.strategies[0]) await useStrategy(next.strategies[0], next.city);
      setPlanMessage(next.fallbackReason || `已生成 ${next.strategies.length} 个方向，默认打开匹配度最高的一组。`);
    } catch (caught) {
      setPlanMessage(caught instanceof Error ? caught.message : "无法从母版生成搜索方向");
    } finally {
      setPlanning(false);
    }
  };

  useEffect(() => {
    void api.collectorInfo().then((info) => setCollectorPath(info.extensionPath)).catch(() => undefined);
    void createPlan(false);
  }, [master.id]);

  const createLinks = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try { setLinks(await api.searchLinks(query, city)); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "无法生成搜索入口"); }
    finally { setBusy(false); }
  };

  const importUrl = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("正在读取岗位页面...");
    try {
      const result = await api.importJobUrl(url);
      setMessage(result.inserted ? `已导入：${result.job.title} @ ${result.job.company}` : "该岗位已存在，未重复写入。");
      setUrl("");
      await onChanged();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "URL 导入失败"); }
    finally { setBusy(false); }
  };

  const importManual = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api.importJob({ ...form, source: "manual", salaryMin: null, salaryMax: null, postedAt: "" });
      setForm({ title: "", company: "", location: "", salaryText: "", url: "", description: "" });
      setMessage("岗位已写入岗位库。");
      await onChanged();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "导入失败"); }
    finally { setBusy(false); }
  };

  const copyPath = async () => {
    await navigator.clipboard.writeText(collectorPath);
    setMessage("扩展目录已复制。");
  };

  return (
    <>
      <PageHeader title="岗位发现" subtitle="从简历母版自动规划方向，扫描 JD 后完成匹配和岗位简历准备" actions={<div className="live-count"><span className="status-dot" />岗位库已有 <b>{jobCount}</b> 条</div>} />
      <section className="discovery-command">
        <div className="command-top">
          <div className="command-heading"><Radar size={20} /><div><h2>母版驱动搜索</h2><p>母版 v{master.version} · {master.data.basics.title || "未识别目标职位"} · {plan?.skills.slice(0, 4).join(" / ") || "正在读取技能"}</p></div></div>
          <Tag tone={plan?.mode === "ai" ? "blue" : "green"} icon={plan?.mode === "ai" ? Bot : Gauge}>{plan?.mode === "ai" ? "AI 规划" : "本地规划"}</Tag>
        </div>
        {planning ? <div className="strategy-loading"><LoaderCircle className="spin" size={17} />{planMessage}</div> : plan ? <div className="strategy-list" role="radiogroup" aria-label="母版推荐搜索方向">{plan.strategies.map((strategy) => (
          <button key={strategy.id} role="radio" aria-checked={activeStrategyId === strategy.id} className={activeStrategyId === strategy.id ? "active" : ""} onClick={() => void useStrategy(strategy)}>
            <span className="strategy-score">{strategy.confidence}</span>
            <span><strong>{strategy.title}</strong><code>{strategy.query}</code><small>{strategy.reason}</small></span>
            {activeStrategyId === strategy.id ? <Check size={16} /> : <ChevronRight size={16} />}
          </button>
        ))}</div> : null}
        <div className={`plan-status ${/不可用|无法|失败/.test(planMessage) ? "warning" : ""}`}><Sparkles size={15} /><span>{planMessage}</span><Button type="button" icon={RefreshCw} variant="ghost" disabled={planning} onClick={() => void createPlan(true)}>{aiStatus.configured ? "AI 重新规划" : "重新提取"}</Button></div>
        <form className="search-command" onSubmit={createLinks}>
          <label><span>当前搜索词（可微调）</span><div><Search size={17} /><input required value={query} onChange={(event) => setQuery(event.target.value)} /></div></label>
          <label><span>目标城市</span><div><MapPin size={17} /><select aria-label="目标城市" value={city} onChange={(event) => setCity(event.target.value)}>{CITY_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}</optgroup>)}</select></div></label>
          <Button icon={Radar} disabled={busy}>应用搜索</Button>
        </form>
        {!desktopMode ? <div className="platform-launches">{links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer"><span className={`source-logo source-${link.id}`}>{link.name.slice(0, 1)}</span><span><strong>{link.name}</strong><small>打开搜索结果</small></span><ArrowUpRight size={16} /></a>)}</div> : null}
      </section>

      {desktopMode ? <EmbeddedRecruitmentBrowser links={links} aiStatus={aiStatus} onChanged={onChanged} /> : <section className="surface desktop-browser-prompt"><div><Globe2 size={20} /><span><strong>内置招聘浏览器需要桌面模式</strong><small>运行 <code>npm run desktop</code>，即可在项目内登录和浏览 BOSS、智联、猎聘、拉勾。</small></span></div><Tag tone="blue">网页模式</Tag></section>}

      <div className="discovery-grid">
        <section className="surface source-status-panel">
          <div className="section-heading"><div><h2>数据来源</h2><p>每种来源独立工作，失败不会影响已有岗位</p></div><Tag tone="green">4 个平台可采集</Tag></div>
          <div className="source-table">{sources.map((source) => {
            const link = links.find((item) => item.id === source.id);
            return <div className="source-row" key={source.id}>
              <span className={`source-logo source-${source.id}`}>{source.name.slice(0, 1)}</span>
              <span className="grow"><strong>{source.name}</strong><small>{source.note}</small></span>
              <Tag tone={source.status === "available" ? "green" : "amber"}>{source.status === "available" ? "可用" : "需登录"}</Tag>
              {link ? <a className="icon-link" href={link.url} target="_blank" rel="noreferrer" title={`打开 ${source.name}`}><ExternalLink size={16} /></a> : null}
            </div>;
          })}</div>
        </section>

        <aside className="surface collector-panel">
          <div className="section-heading"><div><h2>{desktopMode ? "Chrome 采集助手（备用）" : "Chrome 采集助手"}</h2><p>采集已登录页面中的可见岗位</p></div><Tag tone="blue" icon={Zap}>本地桥接</Tag></div>
          <ol className="setup-steps"><li><b>1</b><span>打开 <code>chrome://extensions/</code> 并启用开发者模式</span></li><li><b>2</b><span>加载已解压扩展，选择下方目录</span></li><li><b>3</b><span>在招聘页面点击扩展，采集当前岗位或列表</span></li></ol>
          <div className="path-field"><code>{collectorPath}</code><IconButton icon={Copy} label="复制扩展目录" onClick={() => void copyPath()} /></div>
          <div className="notice"><ShieldCheck size={16} /><p>扩展不读取 Cookie、密码或浏览记录，不执行自动投递。</p></div>
        </aside>
      </div>

      <section className="surface import-panel">
        <div className="import-tabs" role="tablist">
          <button className={mode === "url" ? "active" : ""} onClick={() => setMode("url")}><Link2 size={15} />岗位链接</button>
          <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><FileText size={15} />粘贴 JD</button>
        </div>
        {mode === "url" ? <form className="url-form" onSubmit={importUrl}>
          <div><h2>导入公开岗位链接</h2><p>优先读取页面中的 JobPosting 结构化数据；遇到登录墙时改用 Chrome 采集助手。</p></div>
          <label><Link2 size={17} /><input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://招聘网站/岗位详情" /></label>
          <Button icon={ArrowRight} disabled={busy}>{busy ? "读取中" : "读取并入库"}</Button>
        </form> : <form className="job-form" onSubmit={importManual}>
          <label><span>岗位名称</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：AI 产品经理" /></label>
          <label><span>公司</span><input required value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="公司名称" /></label>
          <label><span>岗位城市</span><select value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })}><option value="">请选择城市</option>{CITY_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}</optgroup>)}</select></label>
          <label><span>薪资</span><input value={form.salaryText} onChange={(event) => setForm({ ...form, salaryText: event.target.value })} placeholder="20-35K" /></label>
          <label className="full"><span>原始链接</span><input value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://..." /></label>
          <label className="full"><span>职位描述</span><textarea required minLength={20} rows={7} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="粘贴完整职责和任职要求" /></label>
          <div className="form-footer"><Button icon={Plus} disabled={busy}>导入岗位</Button></div>
        </form>}
        {message ? <div className={`form-message ${/失败|无法|没有|错误/.test(message) ? "error" : ""}`}>{message}</div> : null}
      </section>
    </>
  );
}

function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="score-badge empty">--</span>;
  return <span className={`score-badge ${score >= 75 ? "good" : score >= 55 ? "medium" : "low"}`}>{score}</span>;
}

function JobsPage({ jobs, aiStatus, refresh, onConfigureAI }: { jobs: Job[]; aiStatus: AIStatus; refresh: () => Promise<void>; onConfigureAI: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(jobs[0]?.id || null);
  const [busyAction, setBusyAction] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { if (!selectedId && jobs[0]) setSelectedId(jobs[0].id); }, [jobs, selectedId]);
  const selected = jobs.find((job) => job.id === selectedId) || null;
  const filtered = jobs.filter((job) => `${job.title}${job.company}${job.description}`.toLowerCase().includes(query.toLowerCase()));

  const analyze = async (id: number, mode: "rules" | "ai") => {
    setBusyAction(mode);
    setMessage(mode === "ai" ? "AI 正在结合简历证据分析岗位..." : "正在运行本地规则评分...");
    try { await api.analyzeJob(id, mode); await refresh(); setMessage(mode === "ai" ? "AI 深度分析已完成。" : "规则评分已完成。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "分析失败"); }
    finally { setBusyAction(""); }
  };
  const analyzeAll = async () => {
    setBusyAction("batch");
    try { await api.analyzeAll(); await refresh(); setMessage(`已完成 ${jobs.length} 个岗位的规则评分。`); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "批量评分失败"); }
    finally { setBusyAction(""); }
  };
  const createVariant = async (id: number) => {
    setBusyAction("variant");
    try { await api.createVariant(id); await refresh(); setMessage("已生成岗位定制简历，可前往简历版本审阅。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "生成失败"); }
    finally { setBusyAction(""); }
  };

  return (
    <>
      <PageHeader title="岗位库" subtitle="比较岗位、规则评分和 AI 证据分析" actions={<Button icon={Gauge} variant="secondary" disabled={Boolean(busyAction) || !jobs.length} onClick={() => void analyzeAll()}>批量规则评分</Button>} />
      <div className="jobs-toolbar"><div className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索岗位、公司或 JD" /></div><span>{filtered.length} / {jobs.length} 个岗位</span></div>
      {message ? <div className="action-message"><CircleHelp size={15} />{message}</div> : null}
      {!jobs.length ? <EmptyState icon={BriefcaseBusiness} title="岗位库还是空的" body="前往岗位发现页，从真实链接或浏览器页面采集岗位。" /> : <div className="jobs-layout">
        <div className="job-table-wrap"><table className="job-table"><thead><tr><th>匹配</th><th>岗位 / 公司</th><th>地点</th><th>薪资</th><th>来源</th><th>状态</th></tr></thead><tbody>{filtered.map((job) => <tr className={selectedId === job.id ? "selected" : ""} key={job.id} onClick={() => setSelectedId(job.id)}><td><ScoreBadge score={job.analysis?.totalScore} /></td><td><strong>{job.title}</strong><span>{job.company}</span></td><td>{job.location || "--"}</td><td>{job.salaryText || "--"}</td><td>{job.source}</td><td><Tag tone={job.status === "shortlisted" ? "green" : "neutral"}>{statusLabels[job.status]}</Tag></td></tr>)}</tbody></table></div>
        {selected ? <aside className="job-detail">
          <div className="job-detail-header"><div><h2>{selected.title}</h2><p>{selected.company} · {selected.location || "地点待确认"}</p></div><ScoreBadge score={selected.analysis?.totalScore} /></div>
          <div className="job-meta"><span>{selected.salaryText || "薪资待确认"}</span><span>{selected.source}</span>{selected.url ? <a href={selected.url} target="_blank" rel="noreferrer">原岗位 <ExternalLink size={12} /></a> : null}</div>
          {selected.analysis ? <>
            <div className="analysis-provenance"><Tag tone={selected.analysis.analysisMode === "ai" ? "blue" : "neutral"} icon={selected.analysis.analysisMode === "ai" ? Bot : Gauge}>{selected.analysis.analysisMode === "ai" ? `AI · ${selected.analysis.aiModel}` : "本地规则"}</Tag><small>置信度 {selected.analysis.confidence}%</small></div>
            <p className="analysis-summary">{selected.analysis.summary}</p>
            <div className="dimension-list">{selected.analysis.dimensions.map((dimension) => <div key={dimension.key}><div><span>{dimension.label}</span><b>{dimension.score}</b></div><div className="progress"><i style={{ width: `${dimension.score}%` }} /></div><small>{dimension.reasons[0]}</small></div>)}</div>
            <div className="evidence-columns"><div><h3>优势证据</h3>{selected.analysis.strengths.length ? <ul>{selected.analysis.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : <small>暂无明确优势证据</small>}</div><div><h3>真实缺口</h3>{selected.analysis.gaps.length ? <ul>{selected.analysis.gaps.map((item) => <li key={item}>{item}</li>)}</ul> : <small>未识别到关键缺口</small>}</div></div>
          </> : <div className="analysis-prompt"><Gauge size={27} /><h3>选择分析方式</h3><p>规则评分完全本地；AI 深度分析会把脱敏后的经历和 JD 发送到已配置模型。</p></div>}
          <div className="job-description"><h3>职位描述</h3><p>{selected.description}</p></div>
          <div className="detail-actions">
            <Button icon={Gauge} variant="secondary" disabled={Boolean(busyAction)} onClick={() => void analyze(selected.id, "rules")}>{busyAction === "rules" ? "评分中" : "规则评分"}</Button>
            {aiStatus.configured ? <Button icon={Bot} disabled={Boolean(busyAction)} onClick={() => void analyze(selected.id, "ai")}>{busyAction === "ai" ? "AI 分析中" : "AI 深度分析"}</Button> : <Button icon={KeyRound} variant="secondary" onClick={onConfigureAI}>配置 AI</Button>}
            <Button icon={WandSparkles} variant="ghost" disabled={Boolean(busyAction)} onClick={() => void createVariant(selected.id)}>生成简历</Button>
          </div>
        </aside> : null}
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
      <PageHeader title="简历版本" subtitle="每个岗位独立保存，所有内容都从简历母版派生" />
      {!variants.length ? <EmptyState icon={FileCheck2} title="还没有岗位版本" body="在岗位详情完成分析后生成该岗位的定制简历。" /> : <div className="variants-layout">
        <aside className="variant-list">{variants.map((variant) => <button key={variant.id} className={selectedId === variant.id ? "active" : ""} onClick={() => setSelectedId(variant.id)}><FileText size={17} /><span><strong>{variant.jobTitle}</strong><small>{variant.company} · {new Date(variant.createdAt).toLocaleDateString("zh-CN")}</small></span><ChevronRight size={15} /></button>)}</aside>
        {selected ? <div className="variant-content"><section className="surface rationale"><div className="section-heading"><div><h2>{selected.name}</h2><p>生成依据</p></div><Tag tone="amber">草稿待确认</Tag></div><ul>{selected.rationale.map((reason) => <li key={reason}><Check size={15} />{reason}</li>)}</ul></section><div className="document-stage"><ResumeDocument data={selected.content} dense /></div></div> : null}
      </div>}
    </>
  );
}

function ApplicationsPage({ applications, refresh }: { applications: Array<Record<string, unknown>>; refresh: () => Promise<void> }) {
  const statuses = ["to_review", "to_apply", "applied", "talking", "interviewing", "offer", "closed"];
  return (
    <>
      <PageHeader title="投递看板" subtitle="岗位、简历版本和结果完整关联；最终发送保留人工确认" />
      {!applications.length ? <EmptyState icon={BarChart3} title="还没有投递记录" body="生成岗位定制简历后会自动创建待确认记录。" /> : <div className="application-board">{statuses.map((status) => {
        const items = applications.filter((item) => item.status === status);
        return <section key={status}><header><span>{statusLabels[status]}</span><b>{items.length}</b></header><div>{items.map((item) => <article key={String(item.id)}><strong>{String(item.title)}</strong><p>{String(item.company)}</p><small>{String(item.variant_name || "尚未选择简历")}</small><select value={String(item.status)} onChange={async (event) => { await api.setApplicationStatus(Number(item.job_id), event.target.value); await refresh(); }}>{statuses.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></article>)}</div></section>;
      })}</div>}
    </>
  );
}

function SettingsPage({ aiStatus, onChanged }: { aiStatus: AIStatus; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ baseUrl: aiStatus.baseUrl || "https://api.openai.com/v1", model: aiStatus.model || "gpt-5-mini", apiKey: "" });
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [catalogEndpoint, setCatalogEndpoint] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"" | "warning" | "error">("");
  const autoSyncStarted = useRef(false);
  const aiView = aiStatusView(aiStatus);
  useEffect(() => { setForm((current) => ({ ...current, baseUrl: aiStatus.baseUrl || current.baseUrl, model: aiStatus.model || current.model })); }, [aiStatus.baseUrl, aiStatus.model]);
  const syncModels = useCallback(async (config: { baseUrl: string; apiKey: string; model: string }, automatic = false) => {
    setSyncing(true);
    if (!automatic) { setMessage("正在读取上游模型目录..."); setMessageTone(""); }
    try {
      const catalog = await api.aiModels({ baseUrl: config.baseUrl, apiKey: config.apiKey });
      const selectedModel = catalog.models.includes(config.model.trim()) ? config.model.trim() : catalog.models[0];
      setModels(catalog.models);
      setCatalogEndpoint(catalog.endpoint);
      setForm((current) => ({ ...current, model: selectedModel }));
      setMessageTone(catalog.models.includes(config.model.trim()) ? "" : "warning");
      setMessage(catalog.models.includes(config.model.trim())
        ? `已${automatic ? "自动" : ""}同步 ${catalog.total} 个可用模型。`
        : `已${automatic ? "自动" : ""}同步 ${catalog.total} 个可用模型；原模型不可用，已选择 ${selectedModel}，请点击“应用配置”。`);
    } catch (caught) {
      setModels([]);
      setCatalogEndpoint("");
      setMessageTone("error");
      setMessage(`${automatic ? "自动" : ""}同步失败：${caught instanceof Error ? caught.message : "无法读取模型目录"}；仍可手工填写模型名称。`);
    } finally {
      setSyncing(false);
    }
  }, []);
  useEffect(() => {
    if (autoSyncStarted.current || !aiStatus.configured || !aiStatus.baseUrl) return;
    autoSyncStarted.current = true;
    void syncModels({ baseUrl: aiStatus.baseUrl, apiKey: "", model: aiStatus.model }, true);
  }, [aiStatus.baseUrl, aiStatus.configured, aiStatus.model, syncModels]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(""); setMessageTone("");
    try { await api.configureAI(form); await onChanged(); setForm((current) => ({ ...current, apiKey: "" })); setMessage("配置已载入当前服务进程，请运行连接测试。"); }
    catch (caught) { setMessageTone("error"); setMessage(caught instanceof Error ? caught.message : "配置失败"); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setMessageTone(""); setMessage("正在请求模型...");
    try { const result = await api.testAI(); await onChanged(); setMessage(`连接成功，响应耗时 ${result.latencyMs} ms；实际端点：${result.status.resolvedEndpoint}`); }
    catch (caught) { await onChanged(); setMessageTone("error"); setMessage(caught instanceof Error ? caught.message : "连接测试失败"); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="设置" subtitle="连接真实 AI、查看本地数据和采集边界" actions={<Tag tone={aiView.tone} icon={Bot}>AI {aiView.label}</Tag>} />
      <div className="settings-grid">
        <section className="surface ai-settings">
          <div className="section-heading"><div><h2>AI 模型连接</h2><p>支持填写服务域名、`/v1` Base URL 或完整 `/chat/completions` 地址</p></div><Bot size={21} /></div>
          <form onSubmit={save}>
            <label><span>API Base URL</span><input type="url" required value={form.baseUrl} onChange={(event) => { setForm({ ...form, baseUrl: event.target.value }); setModels([]); setCatalogEndpoint(""); }} placeholder="https://api.openai.com/v1" /></label>
            <div className="model-field">
              <div className="model-field-heading"><label htmlFor="ai-model">模型名称</label><button type="button" className="model-sync" disabled={busy || syncing || !form.baseUrl} onClick={() => void syncModels(form)}><RefreshCw className={syncing ? "spin" : ""} size={13} />{syncing ? "同步中" : "同步模型"}</button></div>
              {models.length
                ? <select id="ai-model" required value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}>{models.map((model) => <option key={model} value={model}>{model}</option>)}</select>
                : <input id="ai-model" required value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="同步失败时可手工填写" />}
              {catalogEndpoint ? <small title={catalogEndpoint}>来源：{catalogEndpoint}</small> : null}
            </div>
            <label className="full"><span>API Key（仅保存在当前进程内）</span><div className="secret-input"><KeyRound size={16} /><input type="password" value={form.apiKey} onChange={(event) => { setForm({ ...form, apiKey: event.target.value }); setModels([]); setCatalogEndpoint(""); }} placeholder={aiStatus.configured ? "同一地址留空则保持当前密钥" : "sk-...；本地 Ollama 可留空"} /></div></label>
            <div className="settings-actions"><Button icon={Check} disabled={busy || syncing}>应用配置</Button><Button type="button" icon={Zap} variant="secondary" disabled={busy || syncing || !aiStatus.configured} onClick={() => void test()}>测试连接</Button></div>
          </form>
          {message ? <div className={`settings-message ${messageTone}`}>{message}</div> : null}
          <dl className="connection-details"><div><dt>提供方</dt><dd>{aiStatus.providerLabel}</dd></div><div><dt>模型</dt><dd>{aiStatus.model || "未设置"}</dd></div><div><dt>实际端点</dt><dd>{aiStatus.resolvedEndpoint || "测试后自动识别"}</dd></div><div><dt>配置来源</dt><dd>{aiStatus.source === "environment" ? ".env" : aiStatus.source === "runtime" ? "当前进程" : "未配置"}</dd></div><div><dt>上次测试</dt><dd>{aiStatus.lastCheckedAt ? new Date(aiStatus.lastCheckedAt).toLocaleString("zh-CN") : "尚未测试"}</dd></div></dl>
        </section>
        <aside className="settings-side">
          <section className="surface"><div className="section-heading"><div><h2>数据与隐私</h2><p>默认仅保存在当前电脑</p></div><ShieldCheck size={20} /></div><dl className="detail-list"><div><dt>数据库</dt><dd>data/jobpilot.db</dd></div><div><dt>原始简历</dt><dd>data/uploads</dd></div><div><dt>模型传输</dt><dd>不发送手机号与邮箱</dd></div></dl></section>
          <section className="surface"><div className="section-heading"><div><h2>自动化边界</h2><p>账号安全优先</p></div><CircleHelp size={20} /></div><dl className="detail-list"><div><dt>岗位采集</dt><dd><Tag tone="green">用户触发</Tag></dd></div><div><dt>批量准备</dt><dd><Tag tone="green">允许</Tag></dd></div><div><dt>最终投递</dt><dd><Tag tone="neutral">人工确认</Tag></dd></div></dl></section>
        </aside>
      </div>
    </>
  );
}

function AIIndicator({ status, onClick }: { status: AIStatus; onClick: () => void }) {
  const view = aiStatusView(status);
  return <button className={`ai-indicator ${view.connected ? "online" : ""}`} onClick={onClick}><span className="ai-pulse"><Bot size={15} /></span><span><strong>{status.configured ? `${status.providerLabel} · ${view.label}` : "AI 未配置"}</strong><small>{status.configured ? status.model : "点击配置模型"}</small></span><ChevronRight size={14} /></button>;
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
  const [aiStatus, setAIStatus] = useState<AIStatus>({ configured: false, baseUrl: "", resolvedEndpoint: "", model: "", providerLabel: "AI", source: "none", lastCheckedAt: "", lastError: "" });

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [nextOverview, nextJobs, nextVariants, nextApplications, nextSources, nextAI] = await Promise.all([api.overview(), api.jobs(), api.variants(), api.applications(), api.sources(), api.aiStatus()]);
      setOverview(nextOverview);
      setJobs(nextJobs);
      setVariants(nextVariants);
      setApplications(nextApplications);
      setSources(nextSources);
      setAIStatus(nextAI);
      setMaster(nextOverview.hasResume ? await api.master() : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法连接本地服务");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const currentNav = useMemo(() => navItems.find((item) => item.id === page), [page]);
  const navigate = (next: Page) => { setPage(next); setSidebarOpen(false); };
  const uploaded = async (nextMaster: ResumeMaster) => { setMaster(nextMaster); await refresh(); setPage("overview"); };

  if (loading) return <div className="app-loading"><LoaderCircle className="spin" size={27} /><span>正在连接本地工作台</span></div>;
  if (!master) return <FirstRun onUploaded={(item) => void uploaded(item)} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand"><div className="brand-mark"><BriefcaseBusiness size={19} /></div><div><strong>JobPilot CN</strong><span>AI 求职工作台</span></div><IconButton className="mobile-close" label="关闭菜单" icon={X} onClick={() => setSidebarOpen(false)} /></div>
        <nav>{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.label}</span>{item.id === "jobs" && jobs.length ? <b>{jobs.length}</b> : null}</button>; })}</nav>
        <div className="sidebar-footer"><AIIndicator status={aiStatus} onClick={() => navigate("settings")} /><div className="local-state"><span className="status-dot" /><span><strong>本地服务运行中</strong><small>数据保存在当前电脑</small></span></div></div>
      </aside>
      {sidebarOpen ? <button className="sidebar-backdrop" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} /> : null}
      <main className="main-panel">
        <div className="utility-bar"><div className="mobile-nav"><IconButton label="打开菜单" icon={Menu} onClick={() => setSidebarOpen(true)} /><strong>{currentNav?.label}</strong></div><div className="utility-spacer" /><AIIndicator status={aiStatus} onClick={() => navigate("settings")} /><IconButton label="刷新数据" icon={RefreshCw} onClick={() => void refresh()} /></div>
        {error ? <div className="global-error"><AlertTriangle size={17} />{error}<button onClick={() => void refresh()}>重试</button></div> : null}
        <div className="page-content">
          {page === "overview" && overview ? <OverviewPage overview={overview} master={master} jobs={jobs} aiStatus={aiStatus} onNavigate={navigate} /> : null}
          {page === "resume" ? <ResumePage master={master} onUploaded={(item) => void uploaded(item)} /> : null}
          {page === "discover" ? <DiscoverPage master={master} aiStatus={aiStatus} sources={sources} jobCount={jobs.length} onChanged={refresh} /> : null}
          {page === "jobs" ? <JobsPage jobs={jobs} aiStatus={aiStatus} refresh={refresh} onConfigureAI={() => navigate("settings")} /> : null}
          {page === "variants" ? <VariantsPage variants={variants} /> : null}
          {page === "applications" ? <ApplicationsPage applications={applications} refresh={refresh} /> : null}
          {page === "settings" ? <SettingsPage aiStatus={aiStatus} onChanged={refresh} /> : null}
        </div>
      </main>
    </div>
  );
}
