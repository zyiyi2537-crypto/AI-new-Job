export interface CityOption {
  name: string;
  bossCode: string;
}

export const CITY_GROUPS: ReadonlyArray<{ label: string; options: ReadonlyArray<CityOption> }> = [
  { label: "不限", options: [{ name: "全国", bossCode: "" }] },
  { label: "热门城市", options: [
    { name: "北京", bossCode: "101010100" },
    { name: "上海", bossCode: "101020100" },
    { name: "广州", bossCode: "101280100" },
    { name: "深圳", bossCode: "101280600" },
    { name: "杭州", bossCode: "101210100" },
    { name: "成都", bossCode: "101270100" },
    { name: "苏州", bossCode: "101190400" },
    { name: "武汉", bossCode: "101200100" },
    { name: "西安", bossCode: "101110100" },
    { name: "南京", bossCode: "101190100" },
    { name: "天津", bossCode: "101030100" },
    { name: "重庆", bossCode: "101040100" },
    { name: "长沙", bossCode: "101250100" },
    { name: "郑州", bossCode: "101180100" },
    { name: "厦门", bossCode: "101230200" },
  ] },
  { label: "华东", options: [
    { name: "无锡", bossCode: "101190200" },
    { name: "宁波", bossCode: "101210400" },
    { name: "合肥", bossCode: "101220100" },
    { name: "福州", bossCode: "101230100" },
    { name: "南昌", bossCode: "101240100" },
    { name: "济南", bossCode: "101120100" },
    { name: "青岛", bossCode: "101120200" },
  ] },
  { label: "华北与东北", options: [
    { name: "石家庄", bossCode: "101090100" },
    { name: "太原", bossCode: "101100100" },
    { name: "沈阳", bossCode: "101070100" },
    { name: "大连", bossCode: "101070200" },
    { name: "长春", bossCode: "101060100" },
    { name: "哈尔滨", bossCode: "101050100" },
    { name: "呼和浩特", bossCode: "101080100" },
  ] },
  { label: "华南与西南", options: [
    { name: "珠海", bossCode: "101280700" },
    { name: "佛山", bossCode: "101280800" },
    { name: "东莞", bossCode: "101281600" },
    { name: "南宁", bossCode: "101300100" },
    { name: "海口", bossCode: "101310100" },
    { name: "贵阳", bossCode: "101260100" },
    { name: "昆明", bossCode: "101290100" },
    { name: "拉萨", bossCode: "101140100" },
  ] },
  { label: "西北", options: [
    { name: "兰州", bossCode: "101160100" },
    { name: "西宁", bossCode: "101150100" },
    { name: "银川", bossCode: "101170100" },
    { name: "乌鲁木齐", bossCode: "101130100" },
  ] },
];

export const CITY_OPTIONS = CITY_GROUPS.flatMap((group) => group.options);

export function normalizeCityName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, "").replace(/市$/, "");
  if (!normalized || normalized === "全国") return "全国";
  const exact = CITY_OPTIONS.find((city) => city.name === normalized);
  if (exact) return exact.name;
  return CITY_OPTIONS.find((city) => city.name !== "全国" && normalized.includes(city.name))?.name || "全国";
}

export function bossCityCode(value: string): string {
  const city = normalizeCityName(value);
  return CITY_OPTIONS.find((option) => option.name === city)?.bossCode || "";
}
