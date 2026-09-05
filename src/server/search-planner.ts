import type { ResumeMaster, SearchPlan, SearchStrategy } from "../shared/types.js";
import { normalizeCityName } from "../shared/cities.js";
import { extractSkills } from "./scoring.js";

const rolePattern = /[A-Za-z0-9+#./\u4e00-\u9fff]{0,14}(?:产品经理|项目经理|工程师|分析师|设计师|架构师|研究员|顾问|开发|测试|运营|销售)/g;

function cleanRole(value: string): string {
  return value
    .replace(/(?:19|20)\d{2}.*$/g, "")
    .replace(/^(?:高级|资深|初级|中级)?\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function inferRoles(master: ResumeMaster): string[] {
  const structured = master.data.sections.flatMap((section) => section.items.flatMap((item) => [item.heading, item.subheading]));
  const matches = [master.data.basics.title, ...structured]
    .flatMap((value) => value.match(rolePattern) || [])
    .map(cleanRole)
    .filter((value) => value.length >= 2);
  const genericRoles = new Set(["工程师", "开发", "测试", "运营", "销售"]);
  return unique([cleanRole(master.data.basics.title), ...matches])
    .filter((value) => value.length >= 2 && !genericRoles.has(value))
    .filter((role, index, all) => !all.slice(0, index).some((earlier) => earlier !== role && earlier.includes(role)));
}

function adjacentRoles(skills: string[]): string[] {
  const has = (...targets: string[]) => targets.some((target) => skills.includes(target));
  const roles: string[] = [];
  if (has("大模型", "LLM", "RAG", "Agent") && has("产品设计", "需求分析", "用户研究", "PRD")) roles.push("AI 产品经理");
  if (has("大模型", "LLM", "RAG", "Agent") && has("Python", "FastAPI", "Java", "Node.js")) roles.push("AI 应用工程师");
  if (has("SQL", "Excel", "Power BI", "Tableau", "数据分析", "数据可视化")) roles.push("数据分析师");
  if (has("React", "Vue", "Angular", "JavaScript", "TypeScript")) roles.push("前端工程师");
  if (has("Java", "Spring")) roles.push("Java 工程师");
  if (has("Python", "FastAPI", "Django", "Flask")) roles.push("Python 工程师");
  return roles;
}

function skillsForRole(role: string, skills: string[]): string[] {
  const groups: Array<[RegExp, string[]]> = [
    [/AI|大模型|智能|算法/i, ["大模型", "LLM", "RAG", "Agent", "Python", "FastAPI"]],
    [/数据|BI|商业分析/i, ["SQL", "Excel", "Power BI", "Tableau", "数据分析", "数据可视化", "Python"]],
    [/前端|Web/i, ["React", "Vue", "Angular", "TypeScript", "JavaScript"]],
    [/Java|后端/i, ["Java", "Spring", "MySQL", "Redis", "微服务", "Docker"]],
    [/Python/i, ["Python", "FastAPI", "Django", "Flask", "MySQL"]],
    [/运维|DevOps/i, ["Linux", "Docker", "Kubernetes", "DevOps", "CI/CD"]],
    [/产品|项目经理/i, ["产品设计", "需求分析", "用户研究", "PRD", "项目管理", "数据分析"]],
  ];
  const targets = groups.find(([pattern]) => pattern.test(role))?.[1] || [];
  const relevant = targets.filter((target) => skills.includes(target));
  return relevant.length ? relevant : skills.filter((skill) => !["Git", "Linux", "Excel"].includes(skill));
}

function makeStrategy(title: string, keywords: string[], reason: string, confidence: number): Omit<SearchStrategy, "id"> {
  const usefulKeywords = keywords.filter((keyword) => !title.toLowerCase().includes(keyword.toLowerCase())).slice(0, 2);
  return {
    title,
    query: [title, ...usefulKeywords].join(" ").slice(0, 60),
    keywords: keywords.slice(0, 5),
    reason,
    confidence,
  };
}

export function buildRuleSearchPlan(master: ResumeMaster, requestedCity = ""): SearchPlan {
  const resumeText = master.data.sourceText || JSON.stringify(master.data);
  const skills = extractSkills(resumeText);
  const roles = inferRoles(master);
  const adjacent = adjacentRoles(skills);
  const primaryTitle = roles[0] || adjacent[0] || "相关岗位";
  const primarySkills = skillsForRole(primaryTitle, skills);
  const drafts: Array<Omit<SearchStrategy, "id">> = [
    makeStrategy(primaryTitle, [], "直接沿用母版中的目标职位，优先寻找职责最接近的岗位。", 94),
  ];
  if (primarySkills.length) {
    drafts.push(makeStrategy(primaryTitle, primarySkills, `用母版中已有的 ${primarySkills.slice(0, 2).join("、")} 缩小搜索范围。`, 88));
  }
  for (const role of unique([...roles.slice(1), ...adjacent])) {
    if (role === primaryTitle) continue;
    drafts.push(makeStrategy(role, skillsForRole(role, skills), `根据母版中的可迁移经历扩展到相邻方向：${role}。`, 78));
  }
  if (drafts.length < 3 && skills.length) {
    drafts.push(makeStrategy(primaryTitle, skills.slice().reverse(), "换一组已验证技能组合，避免只依赖单一搜索词。", 74));
  }

  const seen = new Set<string>();
  const strategies = drafts
    .filter((strategy) => {
      const key = strategy.query.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map((strategy, index) => ({ ...strategy, id: `strategy-${index + 1}` }));

  return {
    masterId: master.id,
    masterVersion: master.version,
    city: normalizeCityName(requestedCity || master.data.basics.location),
    mode: "rules",
    generatedAt: new Date().toISOString(),
    skills: skills.slice(0, 10),
    strategies,
  };
}
