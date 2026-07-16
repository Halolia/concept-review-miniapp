/**
 * 概念验证项目评审 - 评分维度配置
 * 严格对齐《概念验证项目专家评审意见表》
 * 注意：此文件提供 UI 展示用的 SCORING_DIMENSIONS；
 * 实际评分计算使用 utils/scoring.js 中的 SCORING_ITEMS
 */

const SCORING_DIMENSIONS = [
  {
    id: 'basis', title: '一、立项依据', weight: 5,
    items: [{ id: 'economicSignificance', label: '项目的经济社会意义', maxScore: 5 }]
  },
  {
    id: 'market', title: '二、市场分析', weight: 20,
    items: [
      { id: 'marketForecast', label: '市场分析预测的合理性', maxScore: 5 },
      { id: 'marketCompetitiveness', label: '产品的市场竞争优势和成长性', maxScore: 15 }
    ]
  },
  {
    id: 'tech', title: '三、技术可行性', weight: 30,
    items: [
      { id: 'technicalInnovation', label: '技术前瞻性、创新性、引领性和颠覆性', maxScore: 10 },
      { id: 'technicalMaturity', label: '项目成熟度（现状及所处阶段）', maxScore: 10 },
      { id: 'industrializationRoute', label: '产业化路线的可行性', maxScore: 10 }
    ]
  },
  {
    id: 'implementation', title: '四、实施方案', weight: 15,
    items: [
      { id: 'implementationMethod', label: '项目实施方式可行性', maxScore: 5 },
      { id: 'implementationSchedule', label: '实施进度安排合理性', maxScore: 5 },
      { id: 'milestoneFeasibility', label: '节点目标与考核指标可行性', maxScore: 5 }
    ]
  },
  {
    id: 'support', title: '五、保障条件', weight: 20,
    items: [
      { id: 'leaderCapability', label: '项目负责人综合能力水平', maxScore: 5 },
      { id: 'teamCapability', label: '团队成员能力及结构合理性', maxScore: 5 },
      { id: 'fundingReasonableness', label: '资金需求及筹措方案合理性', maxScore: 5 },
      { id: 'equipmentMaterialFeasibility', label: '主要设备和原料的可行性', maxScore: 5 }
    ]
  },
  {
    id: 'risk', title: '六、风险分析', weight: 10,
    items: [
      { id: 'economicBenefitProbability', label: '实现预期经济效益的可能性', maxScore: 5 },
      { id: 'technicalRiskControl', label: '技术风险和规避措施的合理性', maxScore: 5 }
    ]
  }
];

function getGrade(totalScore) {
  if (totalScore >= 90) return { label: '优秀', color: '#07c160' };
  if (totalScore >= 80) return { label: '良好', color: '#1989fa' };
  if (totalScore > 70) return { label: '一般', color: '#ff976a' };
  return { label: '不推荐', color: '#ee0a24' };
}

module.exports = { SCORING_DIMENSIONS, getGrade };
