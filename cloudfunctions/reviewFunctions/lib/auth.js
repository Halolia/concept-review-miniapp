/**
 * 云函数权限校验中间件 v2.0
 * 支持两种身份体系：
 *   1. 管理员/领导 → users 表校验（admin 动作）
 *   2. 评审专家 → reviewer_invitations 表校验（reviewer 动作）
 *
 * 每个 action 调用前必须通过此模块校验身份和权限
 */

/** 需要 users 表校验的管理员动作 */
const ADMIN_ACTIONS = [
  // 旧版项目管理（保持兼容）
  'adminListProjects',
  'adminGetProject',
  'adminCreateProject',
  'adminUpdateProject',
  'adminArchiveProject',
  // 旧版用户管理（保持兼容）
  'adminListUsers',
  'adminCreateOrBindUser',
  'adminBindUserOpenid',
  'adminUnbindUserOpenid',
  'adminDisableUser',
  'adminEnableUser',
  // 新版路演场次管理
  'adminListSessions',
  'adminGetSession',
  'adminCreateSession',
  'adminUpdateSession',
  'adminOpenSession',
  'adminCloseSession',
  // 新版场次项目管理
  'adminAddProject',
  'adminImportProjects',
  'adminUpdateProjectInSession',
  'adminRemoveProject',
  // 新版评审专家管理
  'adminAddReviewer',
  'adminGenerateQR',
  'adminResetBinding',
  'adminRegenerateToken',
  'adminDisableReviewer',
  'adminEnableReviewer',
  'adminListReviewers',
  // 新版回避管理
  'adminSetRecusal',
  'adminRemoveRecusal',
  'adminListRecusals',
  // 新版统计与汇总
  'adminGetSessionProgress',
  'adminGetSummary',
  // 新版解锁评审
  'adminUnlockReview',
];

/** 需要 reviewer_invitations 表校验的评审专家动作 */
const REVIEWER_ACTIONS = [
  'getMySession',
  'getMyProjects',
  'getMyReview',
  'saveMyReviewDraft',
  'submitMyReview',
];

/** 无需身份校验的公开动作 */
const PUBLIC_ACTIONS = [
  'getMyOpenid',
  'getCurrentUser',
  'scanInvite',
  'bindInvite',
];

/**
 * 校验管理员/领导权限（基于 users 表）
 * @param {object} db - 数据库实例
 * @param {string} openid - 微信 OPENID
 * @param {string} action - 动作名
 * @returns {{ ok: true, user: object } | { ok: false, code: string, message: string }}
 */
async function verifyAuth(db, openid, action) {
  if (!openid) {
    return { ok: false, code: 'UNAUTHORIZED', message: '未获取到用户身份' };
  }

  let user;
  try {
    const res = await db.collection('users').where({ openid }).get();
    if (!res.data || res.data.length === 0) {
      return { ok: false, code: 'USER_NOT_FOUND', message: '账号待管理员开通' };
    }
    user = res.data[0];
  } catch (e) {
    return { ok: false, code: 'DB_ERROR', message: '查询用户失败' };
  }

  if (user.status !== 'active') {
    return { ok: false, code: 'USER_DISABLED', message: '账号已被禁用' };
  }

  if (!ADMIN_ACTIONS.includes(action)) {
    return { ok: false, code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` };
  }

  // admin 专属 + leader 可读动作
  const leaderReadable = [
    'adminListProjects', 'adminGetProject', 'adminListSessions', 'adminGetSession',
    'adminGetSummary', 'adminGetSessionProgress',
  ];
  if (user.role !== 'admin' && !(user.role === 'leader' && leaderReadable.includes(action))) {
    return { ok: false, code: 'PERMISSION_DENIED', message: '无权限执行该操作' };
  }

  return { ok: true, user };
}

/**
 * 校验评审专家权限（基于 reviewer_invitations 表）
 * @param {object} db - 数据库实例
 * @param {string} openid - 微信 OPENID
 * @param {string} [sessionId] - 可选，限定 session 范围
 * @returns {{ ok: true, reviewer: object } | { ok: false, code: string, message: string }}
 */
async function verifyReviewerAuth(db, openid, sessionId) {
  if (!openid) {
    return { ok: false, code: 'UNAUTHORIZED', message: '未获取到用户身份' };
  }

  const query = {
    boundOpenid: openid,
    bindingStatus: 'bound',
    status: 'active',
  };
  if (sessionId) query.sessionId = sessionId;

  try {
    const res = await db.collection('reviewer_invitations').where(query).get();
    if (!res.data || res.data.length === 0) {
      return { ok: false, code: 'REVIEWER_NOT_FOUND', message: sessionId ? '您不是该场次的评审专家' : '未找到绑定的评审身份' };
    }
    const reviewer = res.data[0];

    // 检查场次状态
    const session = await db.collection('review_sessions').doc(reviewer.sessionId).get();
    if (!session.data) {
      return { ok: false, code: 'SESSION_NOT_FOUND', message: '场次不存在' };
    }
    if (session.data.status === 'closed') {
      return { ok: false, code: 'SESSION_CLOSED', message: '评审场次已关闭' };
    }

    return { ok: true, reviewer, session: session.data };
  } catch (e) {
    if (e.errCode === -1) {
      return { ok: false, code: 'SESSION_NOT_FOUND', message: '场次不存在' };
    }
    return { ok: false, code: 'DB_ERROR', message: '查询评审身份失败' };
  }
}

/**
 * 判断 action 是否为公开动作（无需身份校验）
 */
function isPublicAction(action) {
  return PUBLIC_ACTIONS.includes(action);
}

/**
 * 判断 action 是否为评审专家动作
 */
function isReviewerAction(action) {
  return REVIEWER_ACTIONS.includes(action);
}

module.exports = { verifyAuth, verifyReviewerAuth, isPublicAction, isReviewerAction };
