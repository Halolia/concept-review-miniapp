/**
 * 概念验证项目评审 - 评分维度配置
 * 严格对齐《概念验证项目专家评审意见表》
 */

const SCORING_DIMENSIONS = [
  {
    id: 'basis',
    title: '一、立项依据',
    weight: 5,
    items: [
      { id: 'basis_economic', label: '项目的经济社会意义', maxScore: 5 }
    ]
  },
  {
    id: 'market',
    title: '二、市场分析',
    weight: 20,
    items: [
      { id: 'market_analysis', label: '市场分析预测的合理性', maxScore: 5 },
      { id: 'market_advantage', label: '产品的市场竞争优势和成长性', maxScore: 15 }
    ]
  },
  {
    id: 'tech',
    title: '三、技术可行性',
    weight: 30,
    items: [
      { id: 'tech_innovation', label: '技术前瞻性、创新性、引领性和颠覆性', maxScore: 10 },
      { id: 'tech_maturity', label: '项目成熟度（现状及所处阶段）', maxScore: 10 },
      { id: 'tech_industrialization', label: '产业化路线的可行性', maxScore: 10 }
    ]
  },
  {
    id: 'implementation',
    title: '四、实施方案',
    weight: 15,
    items: [
      { id: 'impl_method', label: '项目实施方式可行性', maxScore: 5 },
      { id: 'impl_schedule', label: '实施进度安排合理性', maxScore: 5 },
      { id: 'impl_milestone', label: '节点目标与考核指标可行性', maxScore: 5 }
    ]
  },
  {
    id: 'support',
    title: '五、保障条件',
    weight: 20,
    items: [
      { id: 'support_leader', label: '项目负责人综合能力水平', maxScore: 5 },
      { id: 'support_team', label: '团队成员能力及结构合理性', maxScore: 5 },
      { id: 'support_funding', label: '资金需求及筹措方案合理性', maxScore: 5 },
      { id: 'support_equipment', label: '主要设备和原料的可行性', maxScore: 5 }
    ]
  },
  {
    id: 'risk',
    title: '六、风险分析',
    weight: 10,
    items: [
      { id: 'risk_economic', label: '实现预期经济效益的可能性', maxScore: 5 },
      { id: 'risk_technical', label: '技术风险和规避措施的合理性', maxScore: 5 }
    ]
  }
];

/**
 * 根据总分计算等级
 */
function getGrade(totalScore) {
  if (totalScore >= 90) return { label: '优秀', color: '#07c160' };
  if (totalScore >= 80) return { label: '良好', color: '#1989fa' };
  if (totalScore > 70)  return { label: '一般', color: '#ff976a' };
  return { label: '不推荐', color: '#ee0a24' };
}

/**
 * Mock 评审专家列表
 */
const MOCK_REVIEWERS = [
  { id: 'r1', name: '张教授' },
  { id: 'r2', name: '李工' },
  { id: 'r3', name: '王博士' },
  { id: 'r4', name: '赵研究员' },
  { id: 'r5', name: '陈主任' }
];

/**
 * Mock 项目数据（来自文档）
 */
const MOCK_PROJECTS = [
  { id: 'p1', name: '煤基或生物质基微/纳米碳材料的规模化生产及应用开发', institution: '上海火山雨资源再生科技有限公司', leader: '' },
  { id: 'p2', name: '无内衬全碳纤复合材料液氢储罐', institution: '江南大学', leader: '乔巍' },
  { id: 'p3', name: '智能MOFs电子鼻精准识别复杂、痕量有毒有害物质技术', institution: '盐城工学院', leader: '解明华' },
  { id: 'p4', name: '水系二次电池', institution: '盐城师范学院', leader: '刘昱' },
  { id: 'p5', name: '锌铁液流电池', institution: '苏州纳米所', leader: '周小春' },
  { id: 'p6', name: '光纤电流传感器', institution: '中国矿业大学', leader: '许少毅' },
  { id: 'p7', name: '全地形检测修复管涵智能机器人系统', institution: '上海市政工程设计研究总院集团有限公司', leader: '李高波' },
  { id: 'p8', name: '低空航空器氢动力系统研制与应用', institution: '同济大学', leader: '楚天阔' },
  { id: 'p9', name: '风电机组机舱吊装孔防坠落安全装置', institution: '中广核（江苏）新能源有限公司', leader: '徐秀祥' },
  { id: 'p10', name: '废弃风机叶片制备高价值多孔碳材料', institution: '上海交通大学', leader: '黄亮国' },
  { id: 'p11', name: '火砂电池储能', institution: '中科金山环境工程（北京）有限公司', leader: '戴昊波' }
];

// 给每个项目随机分配 2-3 个评审专家
MOCK_PROJECTS.forEach(p => {
  const count = 2 + Math.floor(Math.random() * 2);
  const shuffled = [...MOCK_REVIEWERS].sort(() => Math.random() - 0.5);
  p.reviewers = shuffled.slice(0, count).map(r => r.id);
});

module.exports = {
  SCORING_DIMENSIONS,
  getGrade,
  MOCK_REVIEWERS,
  MOCK_PROJECTS
};
