/**
 * 数据初始化脚本
 * 将 Mock 数据和现有 Storage 数据迁移到云数据库
 *
 * 使用方法：
 *   1. 在微信开发者工具中打开云开发控制台
 *   2. 将本脚本内容粘贴到云函数 reviewFunctions 中，添加一个 'initData' action
 *   3. 或直接在云开发控制台手动执行
 *
 * 特性：
 *   - 幂等：重复执行不会重复创建
 *   - 安全：不覆盖已有数据
 */

// ⚠️ 以下代码需在云函数环境中执行

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ═══ 初始数据 ═══

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

const MOCK_REVIEWERS = [
  { id: 'r1', name: '张教授' },
  { id: 'r2', name: '李工' },
  { id: 'r3', name: '王博士' },
  { id: 'r4', name: '赵研究员' },
  { id: 'r5', name: '陈主任' }
];

// 指派关系
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

// ═══ 初始化管理员账号 ═══

function getAdminOpenid() {
  // ⚠️ 替换为实际管理员的微信 OPENID
  // 可通过 wx.login + 云函数获取
  return 'ADMIN_OPENID_PLACEHOLDER';
}

// ═══ 主流程 ═══

async function initData() {
  const results = { users: 0, projects: 0, rounds: 0, assignments: 0, skipped: 0 };
  const adminOpenid = getAdminOpenid();

  // ── 1. 初始化管理员 ──
  const existingAdmin = await db.collection('users').where({ openid: adminOpenid }).get();
  if (!existingAdmin.data || existingAdmin.data.length === 0) {
    await db.collection('users').add({
      data: {
        openid: adminOpenid,
        name: '管理员',
        role: 'admin',
        organization: '',
        title: '',
        phone: '',
        status: 'active',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    results.users++;
  } else {
    results.skipped++;
  }

  // ── 2. 初始化专家 ──
  for (const rev of MOCK_REVIEWERS) {
    // 用 id 作为临时的 openid（正式使用时需替换为真实 OPENID）
    const existing = await db.collection('users').where({ openid: rev.id }).get();
    if (!existing.data || existing.data.length === 0) {
      await db.collection('users').add({
        data: {
          openid: rev.id,
          name: rev.name,
          role: 'expert',
          organization: '',
          title: '',
          phone: '',
          status: 'active',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      results.users++;
    } else {
      results.skipped++;
    }
  }

  // ── 3. 创建默认评审批次 ──
  const existingRounds = await db.collection('review_rounds').get();
  let roundId;
  if (!existingRounds.data || existingRounds.data.length === 0) {
    const res = await db.collection('review_rounds').add({
      data: {
        name: '第一批评审',
        roundNo: 1,
        status: 'open',
        startAt: db.serverDate(),
        deadline: null,
        closedAt: null,
        createdBy: adminOpenid,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    roundId = res._id;
    results.rounds++;
  } else {
    roundId = existingRounds.data[0]._id;
    results.skipped++;
  }

  // ── 4. 初始化项目 ──
  const existingProjects = await db.collection('projects').get();
  const projectIdMap = {};

  for (const mp of MOCK_PROJECTS) {
    const existing = existingProjects.data.find(p => p.name === mp.name);
    if (!existing) {
      const res = await db.collection('projects').add({
        data: {
          name: mp.name,
          institution: mp.institution,
          leader: mp.leader,
          description: '',
          status: 'active',
          createdBy: adminOpenid,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      projectIdMap[mp.id] = res._id;
      results.projects++;
    } else {
      projectIdMap[mp.id] = existing._id;
      results.skipped++;
    }
  }

  // ── 5. 建立指派关系 ──
  const existingAssignments = await db.collection('review_assignments').get();
  const existingKeys = new Set(existingAssignments.data.map(a => `${a.projectId}_${a.expertId}`));

  for (const [projectKey, expertIds] of Object.entries(ASSIGNMENTS)) {
    const projectId = projectIdMap[projectKey];
    if (!projectId) continue;

    for (const expertId of expertIds) {
      const key = `${projectId}_${expertId}`;
      if (existingKeys.has(key)) {
        results.skipped++;
        continue;
      }

      await db.collection('review_assignments').add({
        data: {
          projectId,
          roundId,
          expertId,
          status: 'assigned',
          assignedAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      results.assignments++;
      existingKeys.add(key); // 防止同批重复
    }
  }

  return {
    ok: true,
    message: '数据初始化完成',
    results
  };
}

// 导出（在云函数中通过 initData action 调用）
module.exports = { initData };

// ═══ 使用说明 ═══
//
// 1. 在云函数 index.js 中添加：
//    case 'initData': return await initData();
//
// 2. 将 getAdminOpenid() 中的占位符替换为管理员的真实 OPENID
//
// 3. 通过小程序调用：
//    wx.cloud.callFunction({ name: 'reviewFunctions', data: { action: 'initData' } })
//
// 4. 查看控制台日志确认结果
