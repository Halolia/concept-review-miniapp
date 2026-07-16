/**
 * 数据初始化脚本 v1.0.1
 * 将 Mock 数据转换为云数据库初始数据
 *
 * 改进：
 *   - 创建 reviewerIdMap 正确映射
 *   - 幂等：重复执行不重复创建
 *   - 用户按 openid 匹配
 *   - 指派使用真实 user._id
 *   - 输出创建/跳过/失败数量
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ═══ 初始数据 ═══

const MOCK_PROJECTS = [
  { key: 'p1', name: '煤基或生物质基微/纳米碳材料的规模化生产及应用开发', institution: '上海火山雨资源再生科技有限公司', leader: '' },
  { key: 'p2', name: '无内衬全碳纤复合材料液氢储罐', institution: '江南大学', leader: '乔巍' },
  { key: 'p3', name: '智能MOFs电子鼻精准识别复杂、痕量有毒有害物质技术', institution: '盐城工学院', leader: '解明华' },
  { key: 'p4', name: '水系二次电池', institution: '盐城师范学院', leader: '刘昱' },
  { key: 'p5', name: '锌铁液流电池', institution: '苏州纳米所', leader: '周小春' },
  { key: 'p6', name: '光纤电流传感器', institution: '中国矿业大学', leader: '许少毅' },
  { key: 'p7', name: '全地形检测修复管涵智能机器人系统', institution: '上海市政工程设计研究总院集团有限公司', leader: '李高波' },
  { key: 'p8', name: '低空航空器氢动力系统研制与应用', institution: '同济大学', leader: '楚天阔' },
  { key: 'p9', name: '风电机组机舱吊装孔防坠落安全装置', institution: '中广核（江苏）新能源有限公司', leader: '徐秀祥' },
  { key: 'p10', name: '废弃风机叶片制备高价值多孔碳材料', institution: '上海交通大学', leader: '黄亮国' },
  { key: 'p11', name: '火砂电池储能', institution: '中科金山环境工程（北京）有限公司', leader: '戴昊波' }
];

const MOCK_REVIEWERS = [
  { key: 'r1', name: '张教授', openid: 'MOCK_EXPERT_R1_OPENID' },
  { key: 'r2', name: '李工', openid: 'MOCK_EXPERT_R2_OPENID' },
  { key: 'r3', name: '王博士', openid: 'MOCK_EXPERT_R3_OPENID' },
  { key: 'r4', name: '赵研究员', openid: 'MOCK_EXPERT_R4_OPENID' },
  { key: 'r5', name: '陈主任', openid: 'MOCK_EXPERT_R5_OPENID' }
];

const ASSIGNMENTS = {
  p1: ['r1', 'r2', 'r5'],
  p2: ['r1', 'r3'],
  p3: ['r2', 'r4', 'r5'],
  p4: ['r1', 'r3'],
  p5: ['r2', 'r4'],
  p6: ['r1', 'r5'],
  p7: ['r3', 'r4'],
  p8: ['r2', 'r5'],
  p9: ['r1', 'r3'],
  p10: ['r4', 'r5'],
  p11: ['r2', 'r3']
};

// ⚠️ 替换为实际管理员的微信 OPENID
function getAdminOpenid() {
  return process.env.ADMIN_OPENID || 'ADMIN_OPENID_PLACEHOLDER';
}

// ═══ 主流程 ═══

async function initData() {
  const results = { users: { created: 0, skipped: 0 }, projects: { created: 0, skipped: 0 }, rounds: { created: 0, skipped: 0 }, assignments: { created: 0, skipped: 0 }, errors: [] };
  const adminOpenid = getAdminOpenid();
  const reviewerIdMap = {}; // mockKey → cloudUser._id

  try {
    // ── 1. 管理员 ──
    const adminRes = await db.collection('users').where({ openid: adminOpenid }).get();
    if (!adminRes.data || adminRes.data.length === 0) {
      const r = await db.collection('users').add({ data: { openid: adminOpenid, name: '管理员', role: 'admin', organization: '', title: '', phone: '', bindingStatus: 'bound', status: 'active', createdAt: db.serverDate(), updatedAt: db.serverDate() } });
      results.users.created++;
    } else { results.users.skipped++; }

    // ── 2. 专家 ──
    for (const rev of MOCK_REVIEWERS) {
      // 按 openid 查找（幂等）
      const existing = await db.collection('users').where({ openid: rev.openid }).get();
      if (existing.data && existing.data.length > 0) {
        reviewerIdMap[rev.key] = existing.data[0]._id;
        results.users.skipped++;
      } else {
        const r = await db.collection('users').add({ data: { openid: rev.openid, name: rev.name, role: 'expert', organization: '', title: '', phone: '', bindingStatus: 'pending', status: 'active', createdAt: db.serverDate(), updatedAt: db.serverDate() } });
        reviewerIdMap[rev.key] = r._id;
        results.users.created++;
      }
    }

    // ── 3. 默认批次 ──
    let roundId;
    const existingRounds = await db.collection('review_rounds').get();
    if (!existingRounds.data || existingRounds.data.length === 0) {
      const r = await db.collection('review_rounds').add({ data: { name: '第一批评审', roundNo: 1, status: 'draft', startAt: null, deadline: null, closedAt: null, createdBy: adminOpenid, createdAt: db.serverDate(), updatedAt: db.serverDate() } });
      roundId = r._id;
      results.rounds.created++;
    } else {
      roundId = existingRounds.data[0]._id;
      results.rounds.skipped++;
    }

    // ── 4. 项目 ──
    const projectIdMap = {}; // mockKey → cloudProject._id
    const existingProjects = await db.collection('projects').get();

    for (const mp of MOCK_PROJECTS) {
      const existing = existingProjects.data.find(p => p.name === mp.name);
      if (!existing) {
        const r = await db.collection('projects').add({ data: { name: mp.name, institution: mp.institution, leader: mp.leader, description: '', status: 'active', createdBy: adminOpenid, createdAt: db.serverDate(), updatedAt: db.serverDate() } });
        projectIdMap[mp.key] = r._id;
        results.projects.created++;
      } else {
        projectIdMap[mp.key] = existing._id;
        results.projects.skipped++;
      }
    }

    // ── 5. 指派关系 ──
    const existingAssignments = await db.collection('review_assignments').where({ roundId }).get();
    const existingKeys = new Set(existingAssignments.data.map(a => `${a.projectId}_${a.expertId}`));

    for (const [projectKey, expertKeys] of Object.entries(ASSIGNMENTS)) {
      const projectId = projectIdMap[projectKey];
      if (!projectId) continue;
      for (const expertKey of expertKeys) {
        const expertId = reviewerIdMap[expertKey];
        if (!expertId) continue;
        const key = `${projectId}_${expertId}`;
        if (!existingKeys.has(key)) {
          await db.collection('review_assignments').add({ data: { projectId, roundId, expertId, status: 'assigned', assignedAt: db.serverDate(), updatedAt: db.serverDate() } });
          results.assignments.created++;
        } else {
          results.assignments.skipped++;
        }
      }
    }

  } catch (e) {
    results.errors.push(e.message || String(e));
  }

  return { ok: true, message: '初始化完成', results, reviewerIdMap };
}

module.exports = { initData };
