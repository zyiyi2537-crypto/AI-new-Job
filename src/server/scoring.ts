import type { Job, MatchAnalysis, ResumeMasterData, ResumeSection, ScoreDimension } from "../shared/types.js";

const skillVocabulary = [
  "Java", "Python", "JavaScript", "TypeScript", "React", "Vue", "Angular", "Node.js", "Go", "Rust", "C++", "C#",
  "SQL", "MySQL", "PostgreSQL", "Redis", "MongoDB", "Docker", "Kubernetes", "Linux", "Git", "AWS", "Azure", "GCP",
  "Spring", "FastAPI", "Django", "Flask", "Next.js", "数据分析", "数据可视化", "机器学习", "深度学习", "大模型",
  "LLM", "RAG", "Agent", "产品设计", "需求分析", "用户研究", "项目管理", "增长", "运营", "销售", "Excel",
  "Power BI", "Tableau", "Figma", "Axure", "PRD", "A/B测试", "微服务", "高并发", "DevOps", "CI/CD",
];

const educationRanks: Record<string, number> = { 博士: 4, 硕士: 3, 本科: 2, 大专: 1 };

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

export function extractSkills(text: string): string[] {
  const normalized = normalize(text);
  return skillVocabulary.filter((skill) => normalized.includes(skill.toLowerCase()));
}

function sectionText(section: ResumeSection): string {
  return section.items.flatMap((item) => [item.heading, item.subheading, ...item.bullets]).join(" ");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hardScore(job: Job, resumeText: string): ScoreDimension {
  const reasons: string[] = [];
  let score = 80;
  const requiredEducation = Object.entries(educationRanks).find(([degree]) => job.description.includes(degree));
  const ownedEducation = Object.entries(educationRanks).find(([degree]) => resumeText.includes(degree));
  if (requiredEducation && ownedEducation) {
    if (ownedEducation[1] >= requiredEducation[1]) reasons.push(`学历材料覆盖岗位要求：${requiredEducation[0]}`);
    else {
      score -= 35;
      reasons.push(`学历可能不满足岗位要求：需要${requiredEducation[0]}`);
    }
  } else {
    reasons.push("学历或经验要求信息不完整，降低评分置信度");
  }
  const exp = job.description.match(/(\d+)[-–至](\d+)年|至少(\d+)年|([1-9])年以上/);
  if (exp) reasons.push(`岗位包含明确经验要求：${exp[0]}，需人工核对履历时间`);
  else reasons.push("未检测到明确的经验年限门槛");
  return { key: "hard", label: "硬性条件", score: clamp(score), weight: 30, reasons };
}

export function scoreJob(job: Job, master: ResumeMasterData): Omit<MatchAnalysis, "id" | "createdAt"> {
  const resumeText = master.sourceText || JSON.stringify(master);
  const jobSkills = extractSkills(`${job.title} ${job.description}`);
  const resumeSkills = extractSkills(resumeText);
  const matchedKeywords = jobSkills.filter((skill) => resumeSkills.includes(skill));
  const missingKeywords = jobSkills.filter((skill) => !resumeSkills.includes(skill));
  const skillScore = jobSkills.length ? (matchedKeywords.length / jobSkills.length) * 100 : 55;

  const evidenceSections = master.sections.filter((section) => section.type === "experience" || section.type === "projects");
  const evidenceHits = evidenceSections
    .map((section) => ({ section, hits: matchedKeywords.filter((skill) => normalize(sectionText(section)).includes(skill.toLowerCase())) }))
    .filter((entry) => entry.hits.length > 0);
  const evidenceScore = evidenceSections.length ? Math.min(100, 35 + evidenceHits.length * 18 + matchedKeywords.length * 5) : 25;

  const titleTokens = job.title.toLowerCase().match(/[a-z][a-z0-9.+#-]{1,}|[\u4e00-\u9fff]{2,}/g) || [];
  const preferenceHits = titleTokens.filter((token) => normalize(resumeText).includes(token));
  const preferenceScore = titleTokens.length ? Math.min(100, 45 + (preferenceHits.length / titleTokens.length) * 55) : 55;

  const riskWords = ["外包", "驻场", "薪资面议", "接受无薪", "高强度", "狼性", "单休"];
  const foundRisks = riskWords.filter((word) => `${job.title}${job.description}${job.salaryText}`.includes(word));
  const qualityScore = clamp(85 - foundRisks.length * 14 - (job.description.length < 120 ? 20 : 0));
  const hard = hardScore(job, resumeText);
  const dimensions: ScoreDimension[] = [
    hard,
    {
      key: "skills", label: "技能匹配", score: clamp(skillScore), weight: 25,
      reasons: jobSkills.length ? [`命中 ${matchedKeywords.length}/${jobSkills.length} 个可识别技能`] : ["JD 中未识别到明确技能清单"],
    },
    {
      key: "evidence", label: "经历证据", score: clamp(evidenceScore), weight: 20,
      reasons: evidenceHits.length ? evidenceHits.slice(0, 3).map((entry) => `${entry.section.title}覆盖：${entry.hits.join("、")}`) : ["尚未在工作或项目经历中找到直接技能证据"],
    },
    {
      key: "preference", label: "方向偏好", score: clamp(preferenceScore), weight: 15,
      reasons: preferenceHits.length ? [`履历与岗位名称存在关联：${preferenceHits.slice(0, 4).join("、")}`] : ["岗位方向与当前履历标题关联较弱"],
    },
    {
      key: "quality", label: "岗位质量", score: qualityScore, weight: 10,
      reasons: foundRisks.length ? [`检测到风险词：${foundRisks.join("、")}`] : [job.description.length >= 120 ? "JD 信息相对完整" : "JD 内容较短，建议打开原页面核对"],
    },
  ];
  const totalScore = clamp(dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / 100);
  const confidence = clamp(45 + Math.min(25, job.description.length / 20) + Math.min(20, resumeText.length / 100) + (jobSkills.length ? 10 : 0));
  return {
    jobId: job.id,
    totalScore,
    confidence,
    verdict: totalScore >= 75 ? "recommended" : totalScore >= 55 ? "consider" : "not_recommended",
    dimensions,
    matchedKeywords,
    missingKeywords,
    strengths: matchedKeywords.slice(0, 6).map((skill) => `简历中已有 ${skill} 相关证据`),
    gaps: missingKeywords.slice(0, 6).map((skill) => `岗位提到 ${skill}，当前简历未找到直接证据`),
    analysisMode: "rules",
    aiModel: "",
    summary: totalScore >= 75 ? "规则评分显示岗位与当前简历匹配度较高。" : totalScore >= 55 ? "岗位具备部分匹配证据，建议核对关键缺口。" : "当前简历对该岗位的直接证据较少。",
  };
}

export function tailorResume(job: Job, master: ResumeMasterData, analysis: MatchAnalysis): { content: ResumeMasterData; rationale: string[] } {
  const relevantTerms = [...analysis.matchedKeywords, ...job.title.toLowerCase().match(/[a-z][a-z0-9.+#-]{1,}|[\u4e00-\u9fff]{2,}/g) || []];
  const textRelevance = (text: string) => relevantTerms.reduce((score, term) => score + (normalize(text).includes(term.toLowerCase()) ? 1 : 0), 0);
  const relevance = (section: ResumeSection) => {
    return textRelevance(sectionText(section));
  };
  const prioritized = master.sections
    .map((section, index) => ({
      section: {
        ...structuredClone(section),
        items: section.items.map((item) => ({
          ...structuredClone(item),
          bullets: item.bullets
            .map((bullet, bulletIndex) => ({ bullet, bulletIndex, relevance: textRelevance(bullet) }))
            .sort((a, b) => b.relevance - a.relevance || a.bulletIndex - b.bulletIndex)
            .map(({ bullet }) => bullet),
        })),
      },
      index,
      relevance: relevance(section),
    }))
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .map(({ section }) => section);

  const skillLine = analysis.matchedKeywords.slice(0, 5).join("、");
  const targetSummary = skillLine
    ? `面向${job.title}岗位，具备${skillLine}相关经验。以下内容均来自已上传的原始简历，请在投递前核对措辞与事实。`
    : `面向${job.title}岗位的定制版本。当前直接技能证据有限，建议补充可验证的相关项目后再投递。`;
  return {
    content: {
      ...structuredClone(master),
      basics: { ...master.basics, title: job.title, summary: targetSummary },
      sections: prioritized,
    },
    rationale: [
      `目标岗位：${job.title} @ ${job.company}`,
      analysis.matchedKeywords.length ? `优先展示命中技能：${analysis.matchedKeywords.join("、")}` : "未发现明确技能命中，保留原始章节顺序",
      "在每段经历中优先排列与 JD 直接相关的原始要点，未改写事实内容。",
      analysis.missingKeywords.length ? `未写入缺少证据的关键词：${analysis.missingKeywords.join("、")}` : "未检测到明显技能缺口",
      "本版本仅调整摘要、目标职位和章节顺序，不添加原始简历之外的事实。",
    ],
  };
}
