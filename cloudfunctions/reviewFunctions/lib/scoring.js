/**
 * 评分常量与计算 —— 客户端 + 云函数共享
 * 所有评分规则集中管理，禁止页面内重复实现
 */

// 15 个评分子项定义
const SCORING_ITEMS = {
  economicSignificance:   { id: 'economicSignificance',   maxScore: 5,  label: '项目的经济社会意义',            dimension: '立项依据',        dimensionIndex: 1 },
  marketForecast:         { id: 'marketForecast',         maxScore: 5,  label: '市场分析预测的合理性',            dimension: '市场分析',        dimensionIndex: 2 },
  marketCompetitiveness:  { id: 'marketCompetitiveness',  maxScore: 15, label: '产品的市场竞争优势和成长性',      dimension: '市场分析',        dimensionIndex: 2 },
  technicalInnovation:    { id: 'technicalInnovation',    maxScore: 10, label: '技术前瞻性、创新性、引领性和颠覆性', dimension: '技术可行性',    dimensionIndex: 3 },
  technicalMaturity:      { id: 'technicalMaturity',      maxScore: 10, label: '项目成熟度（现状及所处阶段）',    dimension: '技术可行性',      dimensionIndex: 3 },
  industrializationRoute: { id: 'industrializationRoute', maxScore: 10, label: '产业化路线的可行性',              dimension: '技术可行性',      dimensionIndex: 3 },
  implementationMethod:   { id: 'implementationMethod',   maxScore: 5,  label: '项目实施方式可行性',              dimension: '实施方案',        dimensionIndex: 4 },
  implementationSchedule: { id: 'implementationSchedule', maxScore: 5,  label: '实施进度安排合理性',              dimension: '实施方案',        dimensionIndex: 4 },
  milestoneFeasibility:   { id: 'milestoneFeasibility',   maxScore: 5,  label: '节点目标与考核指标可行性',        dimension: '实施方案',        dimensionIndex: 4 },
  leaderCapability:       { id: 'leaderCapability',       maxScore: 5,  label: '项目负责人综合能力水平',          dimension: '保障条件',        dimensionIndex: 5 },
  teamCapability:         { id: 'teamCapability',         maxScore: 5,  label: '团队成员能力及结构合理性',        dimension: '保障条件',        dimensionIndex: 5 },
  fundingReasonableness:  { id: 'fundingReasonableness',  maxScore: 5,  label: '资金需求及筹措方案合理性',        dimension: '保障条件',        dimensionIndex: 5 },
  equipmentMaterialFeasibility: { id: 'equipmentMaterialFeasibility', maxScore: 5, label: '主要设备和原料的可行性', dimension: '保障条件',    dimensionIndex: 5 },
  economicBenefitProbability: { id: 'economicBenefitProbability', maxScore: 5, label: '实现预期经济效益的可能性', dimension: '风险分析',    dimensionIndex: 6 },
  technicalRiskControl:       { id: 'technicalRiskControl',       maxScore: 5, label: '技术风险和规避措施的合理性', dimension: '风险分析',    dimensionIndex: 6 },
};

// 按维度分组的展示结构（UI 用）
const SCORING_DIMENSIONS = [
  { id: 'basis', title: '一、立项依据', weight: 5,
    items: [ SCORING_ITEMS.economicSignificance ] },
  { id: 'market', title: '二、市场分析', weight: 20,
    items: [ SCORING_ITEMS.marketForecast, SCORING_ITEMS.marketCompetitiveness ] },
  { id: 'tech', title: '三、技术可行性', weight: 30,
    items: [ SCORING_ITEMS.technicalInnovation, SCORING_ITEMS.technicalMaturity, SCORING_ITEMS.industrializationRoute ] },
  { id: 'implementation', title: '四、实施方案', weight: 15,
    items: [ SCORING_ITEMS.implementationMethod, SCORING_ITEMS.implementationSchedule, SCORING_ITEMS.milestoneFeasibility ] },
  { id: 'support', title: '五、保障条件', weight: 20,
    items: [ SCORING_ITEMS.leaderCapability, SCORING_ITEMS.teamCapability, SCORING_ITEMS.fundingReasonableness, SCORING_ITEMS.equipmentMaterialFeasibility ] },
  { id: 'risk', title: '六、风险分析', weight: 10,
    items: [ SCORING_ITEMS.economicBenefitProbability, SCORING_ITEMS.technicalRiskControl ] }
];

// 验证满分合计为 100（模块加载时检查）
const _checkSum = Object.values(SCORING_ITEMS).reduce((s, item) => s + item.maxScore, 0);
if (_checkSum !== 100) {
  console.error(`[scoring] 评分项满分合计 ${_checkSum} !== 100，配置错误！`);
}

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
 * 进度条颜色
 */
function getBarColor(score, maxScore) {
  if (maxScore <= 0) return '#e5e5e5';
  const ratio = score / maxScore;
  if (ratio >= 0.9) return '#07c160';
  if (ratio >= 0.6) return '#1989fa';
  if (ratio >= 0.3) return '#ff976a';
  return '#ee0a24';
}

/**
 * 服务端专用：根据 scores 对象校验 + 计算总分 + 等级
 * 业务规则：15项必须存在、每项0~满分、总分0~100均合法
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

    if (val === undefined || val === null) {
      return { ok: false, error: `缺少评分项: ${item.label}` };
    }

    const num = Number(val);
    if (isNaN(num)) {
      return { ok: false, error: `评分项 ${item.label} 不是有效数字: ${val}` };
    }

    if (num < 0) {
      return { ok: false, error: `评分项 ${item.label} 不能为负数` };
    }

    if (num > item.maxScore) {
      return { ok: false, error: `评分项 ${item.label} 超过满分 ${item.maxScore}` };
    }

    totalScore += num;
  }

  // 0~100 均为合法总分
  if (totalScore < 0 || totalScore > TOTAL_SCORE) {
    return { ok: false, error: `总分 ${totalScore} 不在 0～${TOTAL_SCORE} 范围` };
  }

  return { ok: true, totalScore, grade: getGrade(totalScore).label };
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

module.exports = {
  SCORING_ITEMS,
  SCORING_DIMENSIONS,
  TOTAL_SCORE,
  getGrade,
  getBarColor,
  validateAndCalculate,
  calcTotal
};
