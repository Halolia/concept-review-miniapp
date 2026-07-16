/**
 * 云函数权限校验中间件
 * 每个 action 调用前必须通过此模块校验身份和权限
 */

const ALLOWED_ROLES = {
  // 管理员专属
  adminListProjects:           ['admin'],
  adminGetProject:             ['admin'],
  adminCreateProject:          ['admin'],
  adminUpdateProject:          ['admin'],
  adminArchiveProject:         ['admin'],
  adminListUsers:              ['admin'],
  adminCreateOrBindUser:       ['admin'],
  adminDisableUser:            ['admin'],
  adminEnableUser:             ['admin'],
  adminListAssignments:        ['admin'],
  adminAssignExpert:           ['admin'],
  adminRemoveAssignment:       ['admin'],
  adminReturnReview:           ['admin'],
  adminGetProjectResult:       ['admin'],
  adminGetSummary:             ['admin'],
  adminListReviewRounds:       ['admin'],
  adminCreateReviewRound:      ['admin'],
  adminOpenReviewRound:        ['admin'],
  adminCloseReviewRound:       ['admin'],

  // 专家专属
  expertListProjects:          ['expert'],
  expertGetProjectDetail:      ['expert'],
  expertListAssignments:       ['expert'],
  expertGetReviewDraft:        ['expert'],
  expertSaveReviewDraft:       ['expert'],
  expertSubmitReview:          ['expert'],

  // 管理员 + 领导
  leaderGetSummary:            ['admin', 'leader'],
};

/**
 * 校验当前用户是否有权限执行指定 action
 * @param {object} db - 数据库实例
 * @param {string} openid - 微信 OPENID
 * @param {string} action - 动作名
 * @returns {{ ok: true, user: object } | { ok: false, code: string, message: string }}
 */
async function verifyAuth(db, openid, action) {
  // 1. 必须有 OPENID
  if (!openid) {
    return { ok: false, code: 'UNAUTHORIZED', message: '未获取到用户身份' };
  }

  // 2. 查询 users 集合
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

  // 3. 检查用户状态
  if (user.status !== 'active') {
    return { ok: false, code: 'USER_DISABLED', message: '账号已被禁用' };
  }

  // 4. getCurrentUser 不需要角色检查
  if (action === 'getCurrentUser') {
    return { ok: true, user };
  }

  // 5. 检查角色权限
  const allowedRoles = ALLOWED_ROLES[action];
  if (!allowedRoles) {
    return { ok: false, code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` };
  }

  if (!allowedRoles.includes(user.role)) {
    return { ok: false, code: 'PERMISSION_DENIED', message: '无权限执行该操作' };
  }

  return { ok: true, user };
}

module.exports = { verifyAuth };
