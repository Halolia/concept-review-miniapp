/**
 * 评分常量与计算 —— 客户端 + 云函数共享
 * 所有评分规则集中管理，禁止页面内重复实现
 */

// 15 个评分子项定义（与 constants.js SCORING_DIMENSIONS 对齐）
const SCORING_ITEMS = {
  // 一、立项依据 5分
  economicSignificance:   { id: 'economicSignificance',   max: 5,  label: '项目的经济社会意义',            dimension: '立项依据',        dimensionIndex: 1 },
  // 二、市场分析 20分
  marketForecast:         { id: 'marketForecast',         max: 5,  label: '市场分析预测的合理性',            dimension: '市场分析',        dimensionIndex: 2 },
  marketCompetitiveness:  { id: 'marketCompetitiveness',  max: 15, label: '产品的市场竞争优势和成长性',      dimension: '市场分析',        dimensionIndex: 2 },
  // 三、技术可行性 30分
  technicalInnovation:    { id: 'technicalInnovation',    max: 10, label: '技术前瞻性、创新性、引领性和颠覆性', dimension: '技术可行性',    dimensionIndex: 3 },
  technicalMaturity:      { id: 'technicalMaturity',      max: 10, label: '项目成熟度（现状及所处阶段）',    dimension: '技术可行性',      dimensionIndex: 3 },
  industrializationRoute: { id: 'industrializationRoute', max: 10, label: '产业化路线的可行性',              dimension: '技术可行性',      dimensionIndex: 3 },
  // 四、实施方案 15分
  implementationMethod:   { id: 'implementationMethod',   max: 5,  label: '项目实施方式可行性',              dimension: '实施方案',        dimensionIndex: 4 },
  implementationSchedule: { id: 'implementationSchedule', max: 5,  label: '实施进度安排合理性',              dimension: '实施方案',        dimensionIndex: 4 },
  milestoneFeasibility:   { id: 'milestoneFeasibility',   max: 5,  label: '节点目标与考核指标可行性',        dimension: '实施方案',        dimensionIndex: 4 },
  // 五、保障条件 20分
  leaderCapability:       { id: 'leaderCapability',       max: 5,  label: '项目负责人综合能力水平',          dimension: '保障条件',        dimensionIndex: 5 },
  teamCapability:         { id: 'teamCapability',         max: 5,  label: '团队成员能力及结构合理性',        dimension: '保障条件',        dimensionIndex: 5 },
  fundingReasonableness:  { id: 'fundingReasonableness',  max: 5,  label: '资金需求及筹措方案合理性',        dimension: '保障条件',        dimensionIndex: 5 },
  equipmentMaterialFeasibility: { id: 'equipmentMaterialFeasibility', max: 5, label: '主要设备和原料的可行性', dimension: '保障条件',    dimensionIndex: 5 },
  // 六、风险分析 10分
  economicBenefitProbability: { id: 'economicBenefitProbability', max: 5, label: '实现预期经济效益的可能性', dimension: '风险分析',    dimensionIndex: 6 },
  technicalRiskControl:       { id: 'technicalRiskControl',       max: 5, label: '技术风险和规避措施的合理性', dimension: '风险分析',    dimensionIndex: 6 },
};

// 按维度分组的展示结构（UI 用）
const SCORING_DIMENSIONS = [
  {
    id: 'basis', title: '一、立项依据', weight: 5,
    items: [ SCORING_ITEMS.economicSignificance ]
  },
  {
    id: 'market', title: '二、市场分析', weight: 20,
    items: [ SCORING_ITEMS.marketForecast, SCORING_ITEMS.marketCompetitiveness ]
  },
  {
    id: 'tech', title: '三、技术可行性', weight: 30,
    items: [ SCORING_ITEMS.technicalInnovation, SCORING_ITEMS.technicalMaturity, SCORING_ITEMS.industrializationRoute ]
  },
  {
    id: 'implementation', title: '四、实施方案', weight: 15,
    items: [ SCORING_ITEMS.implementationMethod, SCORING_ITEMS.implementationSchedule, SCORING_ITEMS.milestoneFeasibility ]
  },
  {
    id: 'support', title: '五、保障条件', weight: 20,
    items: [ SCORING_ITEMS.leaderCapability, SCORING_ITEMS.teamCapability, SCORING_ITEMS.fundingReasonableness, SCORING_ITEMS.equipmentMaterialFeasibility ]
  },
  {
    id: 'risk', title: '六、风险分析', weight: 10,
    items: [ SCORING_ITEMS.economicBenefitProbability, SCORING_ITEMS.technicalRiskControl ]
  }
];

const TOTAL_SCORE = 100;

/**
 * 根据总分计算等级
 * 优秀：90～100 | 良好：80～89.99 | 一般：70.01～79.99 | 不推荐：0～70
 */
function getGrade(totalScore) {
  const s = Number(totalScore);
  if (s >= 90) return { label: '优秀', color: '#07c160' };
  if (s >= 80) return { label: '良好', color: '#1989fa' };
  if (s > 70)  return { label: '一般', color: '#ff976a' };
  return { label: '不推荐', color: '#ee0a24' };
}

/**
 * 服务端专用：根据 scores 对象校验 + 计算总分 + 等级
 * @param {Object} scores - { economicSignificance: 3, marketForecast: 4, ... }
 * @returns {{ ok: true, totalScore: number, grade: string } | { ok: false, error: string }}
 */
function validateAndCalculate(scores) {
  if (!scores || typeof scores !== 'object') {
    return { ok: false, error: '评分数据为空' };
  }

  let totalScore = 0;
  const keys = Object.keys(SCORING_ITEMS);

  for (const key of keys) {
    const item = SCORING_ITEMS[key];
    const val = scores[key];

    // 必须存在
    if (val === undefined || val === null) {
      return { ok: false, error: `缺少评分项: ${item.label}` };
    }

    // 必须是数字
    const num = Number(val);
    if (isNaN(num)) {
      return { ok: false, error: `评分项 ${item.label} 不是有效数字: ${val}` };
    }

    // 不低于 0
    if (num < 0) {
      return { ok: false, error: `评分项 ${item.label} 不能为负数` };
    }

    // 不超过满分
    if (num > item.max) {
      return { ok: false, error: `评分项 ${item.label} 超过满分 ${item.max}` };
    }

    totalScore += num;
  }

  if (totalScore !== TOTAL_SCORE) {
    return { ok: false, error: `总分 ${totalScore} 不等于 ${TOTAL_SCORE}` };
  }

  return {
    ok: true,
    totalScore,
    grade: getGrade(totalScore).label
  };
}

/**
 * 客户端用：从 scores 对象计算总分 + 等级（不做严格校验）
 */
function calcTotal(scores) {
  let total = 0;
  for (const key of Object.keys(SCORING_ITEMS)) {
    total += Number(scores[key]) || 0;
  }
  return { totalScore: total, grade: getGrade(total) };
}

/**
 * 获取所有评分子项的 ID 列表（带 max）
 */
function getItemMaxMap() {
  const map = {};
  for (const key of Object.keys(SCORING_ITEMS)) {
    map[key] = SCORING_ITEMS[key].max;
  }
  return map;
}

module.exports = {
  SCORING_ITEMS,
  SCORING_DIMENSIONS,
  TOTAL_SCORE,
  getGrade,
  validateAndCalculate,
  calcTotal,
  getItemMaxMap
};
