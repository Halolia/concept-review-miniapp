/**
 * 概念验证项目专家评审系统 - 业务云函数
 *
 * 所有 action 必须执行：
 *   1. 获取 OPENID
 *   2. 查询 users 验证身份
 *   3. 验证状态 active
 *   4. 验证角色权限
 *   5. 执行业务逻辑
 */

const cloud = require('wx-server-sdk');
const { verifyAuth } = require('./lib/auth');
const { log } = require('./lib/audit');
const { SCORING_ITEMS, validateAndCalculate, getGrade } = require('./lib/scoring');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ─── 环境配置 ───
const MAX_REVIEWS_PER_ASSIGNMENT = 1; // 每个指派只允许一份评审（草稿 + submitted 算一条）

exports.main = async (event, context) => {
  const { action, data = {} } = event;
  const { OPENID } = cloud.getWXContext();

  console.log(`[${action}] OPENID=${OPENID}`);

  try {
    // getCurrentUser 在内部做 auth
    if (action === 'getCurrentUser') {
      return await handleGetCurrentUser();
    }

    // 其余 action 统一做权限校验
    const auth = await verifyAuth(db, OPENID, action);
    if (!auth.ok) return auth;
    const user = auth.user;

    // 路由
    switch (action) {
      // ─── 项目管理 ───
      case 'adminListProjects':       return await adminListProjects(user);
      case 'adminGetProject':         return await adminGetProject(user, data);
      case 'adminCreateProject':      return await adminCreateProject(user, data);
      case 'adminUpdateProject':      return await adminUpdateProject(user, data);
      case 'adminArchiveProject':     return await adminArchiveProject(user, data);

      // ─── 用户管理 ───
      case 'adminListUsers':          return await adminListUsers(user);
      case 'adminCreateOrBindUser':   return await adminCreateOrBindUser(user, data);
      case 'adminDisableUser':        return await adminDisableUser(user, data);
      case 'adminEnableUser':         return await adminEnableUser(user, data);

      // ─── 评审批次 ───
      case 'adminListReviewRounds':   return await adminListReviewRounds(user);
      case 'adminCreateReviewRound':  return await adminCreateReviewRound(user, data);
      case 'adminOpenReviewRound':    return await adminOpenReviewRound(user, data);
      case 'adminCloseReviewRound':   return await adminCloseReviewRound(user, data);

      // ─── 指派管理 ───
      case 'adminListAssignments':    return await adminListAssignments(user, data);
      case 'adminAssignExpert':       return await adminAssignExpert(user, data);
      case 'adminRemoveAssignment':   return await adminRemoveAssignment(user, data);

      // ─── 评审管理 ───
      case 'adminReturnReview':       return await adminReturnReview(user, data);
      case 'adminGetProjectResult':   return await adminGetProjectResult(user, data);
      case 'adminGetSummary':         return await adminGetSummary(user, data);

      // ─── 专家侧 ───
      case 'expertListProjects':      return await expertListProjects(user);
      case 'expertGetProjectDetail':  return await expertGetProjectDetail(user, data);
      case 'expertListAssignments':   return await expertListAssignments(user);
      case 'expertGetReviewDraft':    return await expertGetReviewDraft(user, data);
      case 'expertSaveReviewDraft':   return await expertSaveReviewDraft(user, data);
      case 'expertSubmitReview':      return await expertSubmitReview(user, data);

      // ─── 领导侧 ───
      case 'leaderGetSummary':        return await leaderGetSummary(user, data);

      default:
        return { ok: false, code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error(`[${action}] 服务端异常:`, err);
    return { ok: false, code: 'SERVER_ERROR', message: '服务异常，请稍后重试' };
  }
};

// ═══════════════════════════════════════════
// 用户身份
// ═══════════════════════════════════════════

async function handleGetCurrentUser() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, code: 'UNAUTHORIZED', message: '未获取到用户身份' };

  const res = await db.collection('users').where({ openid: OPENID }).get();
  if (!res.data || res.data.length === 0) {
    return { ok: false, code: 'USER_NOT_FOUND', message: '账号待管理员开通' };
  }

  const user = res.data[0];
  if (user.status !== 'active') {
    return { ok: false, code: 'USER_DISABLED', message: '账号已被禁用' };
  }

  return {
    ok: true,
    data: {
      _id: user._id,
      name: user.name,
      role: user.role,
      organization: user.organization || '',
      title: user.title || '',
      status: user.status
    }
  };
}

// ═══════════════════════════════════════════
// 项目管理（admin）
// ═══════════════════════════════════════════

async function adminListProjects(user) {
  const res = await db.collection('projects')
    .where({ status: _.neq('terminated') })
    .orderBy('createdAt', 'desc')
    .get();
  return { ok: true, data: res.data };
}

async function adminGetProject(user, { projectId }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };
  const res = await db.collection('projects').doc(projectId).get();
  return { ok: true, data: res.data };
}

async function adminCreateProject(user, { project }) {
  if (!project || !project.name) return { ok: false, code: 'INVALID_PARAM', message: '项目名称不能为空' };

  const doc = {
    name: project.name.trim(),
    institution: (project.institution || '').trim(),
    leader: (project.leader || '').trim(),
    description: (project.description || '').trim(),
    status: 'active',
    createdBy: user._id,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  const res = await db.collection('projects').add({ data: doc });
  await log(db, user, 'CREATE_PROJECT', 'project', res._id, null, doc);

  return { ok: true, data: { ...doc, _id: res._id } };
}

async function adminUpdateProject(user, { projectId, updates }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };

  const before = await db.collection('projects').doc(projectId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };

  const allowedFields = { name: 1, institution: 1, leader: 1, description: 1 };
  const patch = { updatedAt: db.serverDate() };
  for (const k of Object.keys(updates || {})) {
    if (allowedFields[k]) patch[k] = (updates[k] || '').trim();
  }

  await db.collection('projects').doc(projectId).update({ data: patch });
  await log(db, user, 'UPDATE_PROJECT', 'project', projectId, before.data, { ...before.data, ...patch });

  return { ok: true, data: { ...before.data, ...patch } };
}

async function adminArchiveProject(user, { projectId, reason }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };

  const before = await db.collection('projects').doc(projectId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };

  await db.collection('projects').doc(projectId).update({
    data: { status: 'archived', updatedAt: db.serverDate() }
  });
  await log(db, user, 'ARCHIVE_PROJECT', 'project', projectId, before.data, { status: 'archived' }, reason);

  return { ok: true, data: { ...before.data, status: 'archived' } };
}

// ═══════════════════════════════════════════
// 用户管理（admin）
// ═══════════════════════════════════════════

async function adminListUsers(user) {
  const res = await db.collection('users').where({ status: _.neq('terminated') }).get();
  return { ok: true, data: res.data };
}

async function adminCreateOrBindUser(user, { userData }) {
  if (!userData || !userData.openid) return { ok: false, code: 'INVALID_PARAM', message: '缺少 openid' };

  // 幂等：检查是否已存在
  const existing = await db.collection('users').where({ openid: userData.openid }).get();
  if (existing.data && existing.data.length > 0) {
    // 更新
    const u = existing.data[0];
    const patch = {
      name: userData.name || u.name,
      role: userData.role || u.role,
      organization: userData.organization || u.organization || '',
      title: userData.title || u.title || '',
      updatedAt: db.serverDate()
    };
    await db.collection('users').doc(u._id).update({ data: patch });
    await log(db, user, 'UPDATE_USER', 'user', u._id, u, patch);
    return { ok: true, data: { ...u, ...patch } };
  }

  const doc = {
    openid: userData.openid,
    name: (userData.name || '').trim(),
    role: userData.role || 'expert',
    organization: (userData.organization || '').trim(),
    title: (userData.title || '').trim(),
    phone: (userData.phone || '').trim(),
    status: 'active',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  const res = await db.collection('users').add({ data: doc });
  await log(db, user, 'CREATE_USER', 'user', res._id, null, doc);

  return { ok: true, data: { ...doc, _id: res._id } };
}

async function adminDisableUser(user, { userId, reason }) {
  if (!userId) return { ok: false, code: 'INVALID_PARAM', message: '缺少用户ID' };

  const before = await db.collection('users').doc(userId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };

  await db.collection('users').doc(userId).update({
    data: { status: 'disabled', updatedAt: db.serverDate() }
  });
  await log(db, user, 'DISABLE_USER', 'user', userId, before.data, { status: 'disabled' }, reason);

  return { ok: true, data: { ...before.data, status: 'disabled' } };
}

async function adminEnableUser(user, { userId }) {
  if (!userId) return { ok: false, code: 'INVALID_PARAM', message: '缺少用户ID' };

  const before = await db.collection('users').doc(userId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };

  await db.collection('users').doc(userId).update({
    data: { status: 'active', updatedAt: db.serverDate() }
  });
  await log(db, user, 'ENABLE_USER', 'user', userId, before.data, { status: 'active' });

  return { ok: true, data: { ...before.data, status: 'active' } };
}

// ═══════════════════════════════════════════
// 评审批次（admin）
// ═══════════════════════════════════════════

async function adminListReviewRounds(user) {
  const res = await db.collection('review_rounds')
    .orderBy('createdAt', 'desc')
    .get();
  return { ok: true, data: res.data };
}

async function adminCreateReviewRound(user, { round }) {
  if (!round || !round.name) return { ok: false, code: 'INVALID_PARAM', message: '批次名称不能为空' };

  const doc = {
    name: round.name.trim(),
    roundNo: round.roundNo || 1,
    status: 'draft',
    startAt: null,
    deadline: null,
    closedAt: null,
    createdBy: user._id,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  const res = await db.collection('review_rounds').add({ data: doc });
  await log(db, user, 'CREATE_ROUND', 'review_round', res._id, null, doc);

  return { ok: true, data: { ...doc, _id: res._id } };
}

async function adminOpenReviewRound(user, { roundId }) {
  if (!roundId) return { ok: false, code: 'INVALID_PARAM', message: '缺少批次ID' };

  const before = await db.collection('review_rounds').doc(roundId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };

  const patch = { status: 'open', startAt: db.serverDate(), updatedAt: db.serverDate() };
  await db.collection('review_rounds').doc(roundId).update({ data: patch });
  await log(db, user, 'OPEN_ROUND', 'review_round', roundId, before.data, { ...before.data, ...patch });

  return { ok: true, data: { ...before.data, ...patch } };
}

async function adminCloseReviewRound(user, { roundId }) {
  if (!roundId) return { ok: false, code: 'INVALID_PARAM', message: '缺少批次ID' };

  const before = await db.collection('review_rounds').doc(roundId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };

  const patch = { status: 'closed', closedAt: db.serverDate(), updatedAt: db.serverDate() };
  await db.collection('review_rounds').doc(roundId).update({ data: patch });

  // 将所有 submitted/resubmitted 的 review 锁定
  await db.collection('reviews')
    .where({ roundId, status: _.in(['submitted', 'resubmitted']) })
    .update({ data: { status: 'locked', updatedAt: db.serverDate() } });

  // 将所有 submitted 的 assignment 锁定
  await db.collection('review_assignments')
    .where({ roundId, status: _.in(['submitted', 'resubmitted']) })
    .update({ data: { status: 'locked', updatedAt: db.serverDate() } });

  await log(db, user, 'CLOSE_ROUND', 'review_round', roundId, before.data, { ...before.data, ...patch });

  return { ok: true, data: { ...before.data, ...patch } };
}

// ═══════════════════════════════════════════
// 指派管理（admin）
// ═══════════════════════════════════════════

async function adminListAssignments(user, { roundId }) {
  let query = {};
  if (roundId) query.roundId = roundId;
  const res = await db.collection('review_assignments').where(query).get();
  return { ok: true, data: res.data };
}

async function adminAssignExpert(user, { projectId, roundId, expertId }) {
  if (!projectId || !roundId || !expertId) {
    return { ok: false, code: 'INVALID_PARAM', message: '缺少必要参数' };
  }

  // 检查是否已指派
  const existing = await db.collection('review_assignments')
    .where({ projectId, roundId, expertId })
    .get();
  if (existing.data && existing.data.length > 0) {
    return { ok: false, code: 'ALREADY_ASSIGNED', message: '该专家已分配到此项目' };
  }

  const doc = {
    projectId,
    roundId,
    expertId,
    status: 'assigned',
    assignedAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  const res = await db.collection('review_assignments').add({ data: doc });
  await log(db, user, 'ASSIGN_EXPERT', 'review_assignment', res._id, null, doc);

  return { ok: true, data: { ...doc, _id: res._id } };
}

async function adminRemoveAssignment(user, { assignmentId, reason }) {
  if (!assignmentId) return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };

  const before = await db.collection('review_assignments').doc(assignmentId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '指派不存在' };

  // 检查是否已提交
  if (before.data.status === 'submitted' || before.data.status === 'resubmitted') {
    if (!reason) {
      return { ok: false, code: 'REASON_REQUIRED', message: '该专家已提交评审，移除需要填写原因' };
    }
  }

  await db.collection('review_assignments').doc(assignmentId).remove();
  await log(db, user, 'REMOVE_ASSIGNMENT', 'review_assignment', assignmentId, before.data, null, reason);

  return { ok: true, message: '已移除' };
}

// ═══════════════════════════════════════════
// 评审管理（admin）
// ═══════════════════════════════════════════

async function adminReturnReview(user, { reviewId, reason }) {
  if (!reviewId) return { ok: false, code: 'INVALID_PARAM', message: '缺少评审ID' };
  if (!reason) return { ok: false, code: 'REASON_REQUIRED', message: '退回需要填写原因' };

  const before = await db.collection('reviews').doc(reviewId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '评审记录不存在' };

  const patch = {
    status: 'returned',
    returnReason: reason,
    returnedAt: db.serverDate(),
    updatedAt: db.serverDate()
  };

  await db.collection('reviews').doc(reviewId).update({ data: patch });
  // 同步更新 assignment 状态
  if (before.data.assignmentId) {
    await db.collection('review_assignments').doc(before.data.assignmentId).update({
      data: { status: 'returned', updatedAt: db.serverDate() }
    });
  }

  await log(db, user, 'RETURN_REVIEW', 'review', reviewId, before.data, { ...before.data, ...patch }, reason);

  return { ok: true, data: { ...before.data, ...patch } };
}

async function adminGetProjectResult(user, { projectId, roundId }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };

  let query = { projectId };
  if (roundId) query.roundId = roundId;

  const reviews = await db.collection('reviews').where(query).get();
  return { ok: true, data: reviews.data };
}

async function adminGetSummary(user, { roundId }) {
  let query = {};
  if (roundId) query.roundId = roundId;
  // 只查已提交/已锁定/重提交的
  query.status = _.in(['submitted', 'resubmitted', 'locked']);

  const reviews = await db.collection('reviews').where(query).get();
  const assignments = roundId
    ? await db.collection('review_assignments').where({ roundId }).get()
    : await db.collection('review_assignments').get();

  const projects = await db.collection('projects')
    .where({ status: _.neq('terminated') })
    .get();

  return {
    ok: true,
    data: buildSummary(projects.data, reviews.data, assignments.data, roundId)
  };
}

// ═══════════════════════════════════════════
// 领导侧
// ═══════════════════════════════════════════

async function leaderGetSummary(user, { roundId }) {
  // 与 adminGetSummary 逻辑相同，但通过 auth 的 role 检查区分
  return await adminGetSummary(user, { roundId });
}

// ═══════════════════════════════════════════
// 专家侧
// ═══════════════════════════════════════════

async function expertListProjects(user) {
  // 查出该专家的所有指派
  const assignments = await db.collection('review_assignments')
    .where({ expertId: user._id })
    .get();

  const projectIds = [...new Set(assignments.data.map(a => a.projectId))];
  if (projectIds.length === 0) return { ok: true, data: [] };

  const projects = await db.collection('projects')
    .where({ _id: _.in(projectIds) })
    .get();

  return { ok: true, data: projects.data };
}

async function expertGetProjectDetail(user, { projectId }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };

  // 验证该专家被指派到此项目
  const assignment = await db.collection('review_assignments')
    .where({ projectId, expertId: user._id })
    .get();

  if (!assignment.data || assignment.data.length === 0) {
    return { ok: false, code: 'NOT_ASSIGNED', message: '您未被分配到此项目' };
  }

  const project = await db.collection('projects').doc(projectId).get();

  // 获取当前活动的评审批次
  const rounds = await db.collection('review_rounds')
    .where({ status: _.neq('draft') })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  return {
    ok: true,
    data: {
      project: project.data,
      assignment: assignment.data[0],
      currentRound: rounds.data[0] || null
    }
  };
}

async function expertListAssignments(user) {
  const assignments = await db.collection('review_assignments')
    .where({ expertId: user._id })
    .get();

  if (assignments.data.length === 0) return { ok: true, data: [] };

  // 关联项目信息
  const projectIds = [...new Set(assignments.data.map(a => a.projectId))];
  const projects = await db.collection('projects')
    .where({ _id: _.in(projectIds) })
    .get();
  const projectMap = {};
  projects.data.forEach(p => { projectMap[p._id] = p; });

  // 关联评审记录
  const reviewRes = await db.collection('reviews')
    .where({ expertId: user._id })
    .get();
  const reviewMap = {};
  reviewRes.data.forEach(r => { reviewMap[r.assignmentId] = r; });

  const result = assignments.data.map(a => ({
    ...a,
    project: projectMap[a.projectId] || null,
    review: reviewMap[a._id] || null
  }));

  return { ok: true, data: result };
}

async function expertGetReviewDraft(user, { assignmentId }) {
  if (!assignmentId) return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };

  // 验证指派属于该专家
  const assignment = await db.collection('review_assignments').doc(assignmentId).get();
  if (!assignment.data || assignment.data.expertId !== user._id) {
    return { ok: false, code: 'NOT_ASSIGNED', message: '无权限访问' };
  }

  // 查 draft
  const res = await db.collection('reviews')
    .where({ assignmentId, status: 'draft' })
    .get();

  return { ok: true, data: res.data[0] || null };
}

async function expertSaveReviewDraft(user, { reviewData }) {
  if (!reviewData || !reviewData.assignmentId) {
    return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };
  }

  // 验证指派
  const assignment = await db.collection('review_assignments').doc(reviewData.assignmentId).get();
  if (!assignment.data || assignment.data.expertId !== user._id) {
    return { ok: false, code: 'NOT_ASSIGNED', message: '无权限' };
  }

  // 检查批次状态
  const round = await db.collection('review_rounds').doc(assignment.data.roundId).get();
  if (!round.data || round.data.status !== 'open') {
    return { ok: false, code: 'ROUND_CLOSED', message: '评审批次未开放' };
  }

  // 检查是否已有 submitted
  const existing = await db.collection('reviews')
    .where({ assignmentId: reviewData.assignmentId, status: 'draft' })
    .get();

  const doc = {
    projectId: assignment.data.projectId,
    roundId: assignment.data.roundId,
    assignmentId: reviewData.assignmentId,
    expertId: user._id,
    expertName: user.name,
    scores: reviewData.scores || {},
    totalScore: 0,
    grade: '',
    comments: reviewData.comments || '',
    recommendedFunding: Number(reviewData.recommendedFunding) || 0,
    fundingComment: reviewData.fundingComment || '',
    status: 'draft',
    version: (existing.data[0] && existing.data[0].version) || 1,
    submittedAt: null,
    updatedAt: db.serverDate()
  };

  if (existing.data.length > 0) {
    // 更新草稿
    const eid = existing.data[0]._id;
    await db.collection('reviews').doc(eid).update({ data: doc });
    return { ok: true, data: { ...doc, _id: eid } };
  }

  doc.createdAt = db.serverDate();
  const res = await db.collection('reviews').add({ data: doc });
  return { ok: true, data: { ...doc, _id: res._id } };
}

async function expertSubmitReview(user, { assignmentId, scores, comments, recommendedFunding, fundingComment }) {
  // ─── 参数校验 ───
  if (!assignmentId) return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };

  // ─── 验证指派关系 ───
  const assignment = await db.collection('review_assignments').doc(assignmentId).get();
  if (!assignment.data) return { ok: false, code: 'NOT_FOUND', message: '指派不存在' };
  if (assignment.data.expertId !== user._id) {
    return { ok: false, code: 'NOT_ASSIGNED', message: '您未被分配到此项目' };
  }
  if (assignment.data.status === 'locked') {
    return { ok: false, code: 'LOCKED', message: '评审批次已关闭，无法提交' };
  }

  // ─── 验证批次状态 ───
  const round = await db.collection('review_rounds').doc(assignment.data.roundId).get();
  if (!round.data || round.data.status !== 'open') {
    return { ok: false, code: 'ROUND_CLOSED', message: '评审批次未开放' };
  }

  // ─── 幂等检查：是否有已提交记录 ───
  const existingSubmitted = await db.collection('reviews')
    .where({ assignmentId, status: _.in(['submitted', 'resubmitted', 'locked']) })
    .get();
  if (existingSubmitted.data.length > 0 && assignment.data.status !== 'returned') {
    return { ok: false, code: 'ALREADY_SUBMITTED', message: '您已提交评审，不能重复提交' };
  }

  // ─── 校验评分 ───
  const calc = validateAndCalculate(scores);
  if (!calc.ok) {
    return { ok: false, code: 'INVALID_SCORE', message: calc.error };
  }

  // ─── 校验意见 ───
  if (!comments || !comments.trim()) {
    return { ok: false, code: 'COMMENTS_REQUIRED', message: '评审意见不能为空' };
  }

  // ─── 校验经费 ───
  const funding = Number(recommendedFunding);
  if (isNaN(funding) || funding < 0) {
    return { ok: false, code: 'INVALID_FUNDING', message: '建议经费需为合法非负数字' };
  }

  // ─── 写入评审记录 ───
  const now = db.serverDate();
  const isReturned = assignment.data.status === 'returned';
  const newStatus = isReturned ? 'resubmitted' : 'submitted';

  // 查找旧记录（可能是 draft 或 returned）
  const existing = await db.collection('reviews')
    .where({ assignmentId, status: _.in(['draft', 'returned']) })
    .get();

  const reviewDoc = {
    projectId: assignment.data.projectId,
    roundId: assignment.data.roundId,
    assignmentId,
    expertId: user._id,
    expertName: user.name,
    scores,
    totalScore: calc.totalScore,
    grade: calc.grade,
    comments: comments.trim(),
    recommendedFunding: funding,
    fundingComment: (fundingComment || '').trim(),
    status: newStatus,
    version: isReturned ? ((existing.data[0] && existing.data[0].version) || 1) + 1 : 1,
    submittedAt: now,
    updatedAt: now
  };

  let reviewId;
  if (existing.data.length > 0) {
    reviewId = existing.data[0]._id;
    await db.collection('reviews').doc(reviewId).update({ data: reviewDoc });
  } else {
    reviewDoc.createdAt = now;
    const res = await db.collection('reviews').add({ data: reviewDoc });
    reviewId = res._id;
  }

  // ─── 更新指派状态 ───
  await db.collection('review_assignments').doc(assignmentId).update({
    data: { status: newStatus, submittedAt: now, updatedAt: now }
  });

  // ─── 审计 ───
  await log(db, user, isReturned ? 'RESUBMIT_REVIEW' : 'SUBMIT_REVIEW', 'review', reviewId, null, reviewDoc);

  return { ok: true, data: { ...reviewDoc, _id: reviewId } };
}

// ═══════════════════════════════════════════
// 汇总计算
// ═══════════════════════════════════════════

function buildSummary(projects, reviews, assignments, roundId) {
  const projectMap = {};
  projects.forEach(p => { projectMap[p._id] = p; });

  // 按项目聚合
  const reviewMap = {}; // projectId → [scores]
  const fundingMap = {}; // projectId → [fundings]

  reviews.forEach(r => {
    if (!reviewMap[r.projectId]) reviewMap[r.projectId] = [];
    reviewMap[r.projectId].push(r.totalScore);
    if (!fundingMap[r.projectId]) fundingMap[r.projectId] = [];
    fundingMap[r.projectId].push(Number(r.recommendedFunding) || 0);
  });

  // 每个项目的指派数
  const assignmentMap = {};
  assignments.forEach(a => {
    if (!assignmentMap[a.projectId]) assignmentMap[a.projectId] = 0;
    assignmentMap[a.projectId]++;
  });

  const rankings = [];

  for (const [projectId, scores] of Object.entries(reviewMap)) {
    if (scores.length === 0) continue;

    const project = projectMap[projectId];
    if (!project) continue;

    const sorted = [...scores].sort((a, b) => a - b);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const range = max - min;
    const grade = getGrade(avg);

    const fundings = fundingMap[projectId] || [];
    const avgFunding = fundings.length > 0
      ? (fundings.reduce((a, b) => a + b, 0) / fundings.length).toFixed(2)
      : '-';

    const totalAssignments = assignmentMap[projectId] || 0;
    const submittedCount = scores.length;

    let reviewStatus;
    if (submittedCount === 0) reviewStatus = '待开始';
    else if (submittedCount < totalAssignments) reviewStatus = '评审中';
    else reviewStatus = '已完成';

    rankings.push({
      projectId,
      projectName: project.name,
      institution: project.institution || '',
      avgScore: avg.toFixed(1),
      median: median.toFixed(1),
      minScore: min,
      maxScore: max,
      range: range.toFixed(1),
      gradeLabel: grade.label,
      gradeColor: grade.color,
      avgFunding,
      reviewCount: submittedCount,
      totalAssignments,
      reviewStatus: totalAssignments === 0 ? '未分配' : reviewStatus
    });
  }

  rankings.sort((a, b) => parseFloat(b.avgScore) - parseFloat(a.avgScore));
  rankings.forEach((r, i) => { r.rank = i + 1; });

  // 全局统计
  const totalProjects = projects.length;
  const totalReviews = reviews.length;
  const allScores = rankings.map(r => parseFloat(r.avgScore));
  const avgAll = allScores.length > 0
    ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
    : '-';

  return {
    totalProjects, totalReviews, avgScore: avgAll,
    rankings
  };
}
