/**
 * 概念验证项目专家评审系统 - 业务云函数 v1.0.2
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

exports.main = async (event, context) => {
  const { action, data = {} } = event;
  const { OPENID } = cloud.getWXContext();
  console.log(`[${action}] OPENID=${OPENID}`);

  try {
    // 无需身份校验的公开 action
    if (action === 'getCurrentUser') return await handleGetCurrentUser();
    if (action === 'getMyOpenid')   return await handleGetMyOpenid();

    const auth = await verifyAuth(db, OPENID, action);
    if (!auth.ok) return auth;
    const user = auth.user;

    switch (action) {
      case 'adminListProjects':        return await adminListProjects(user);
      case 'adminGetProject':          return await adminGetProject(user, data);
      case 'adminCreateProject':       return await adminCreateProject(user, data);
      case 'adminUpdateProject':       return await adminUpdateProject(user, data);
      case 'adminArchiveProject':      return await adminArchiveProject(user, data);
      case 'adminListUsers':           return await adminListUsers(user);
      case 'adminCreateOrBindUser':    return await adminCreateOrBindUser(user, data);
      case 'adminBindUserOpenid':      return await adminBindUserOpenid(user, data);
      case 'adminUnbindUserOpenid':    return await adminUnbindUserOpenid(user, data);
      case 'adminDisableUser':         return await adminDisableUser(user, data);
      case 'adminEnableUser':          return await adminEnableUser(user, data);
      case 'adminListReviewRounds':    return await adminListReviewRounds(user);
      case 'adminCreateReviewRound':   return await adminCreateReviewRound(user, data);
      case 'adminUpdateReviewRound':   return await adminUpdateReviewRound(user, data);
      case 'adminOpenReviewRound':     return await adminOpenReviewRound(user, data);
      case 'adminCloseReviewRound':    return await adminCloseReviewRound(user, data);
      case 'adminForceCloseReviewRound': return await adminForceCloseReviewRound(user, data);
      case 'adminListAssignments':     return await adminListAssignments(user, data);
      case 'adminAssignExpert':        return await adminAssignExpert(user, data);
      case 'adminRemoveAssignment':    return await adminRemoveAssignment(user, data);
      case 'adminReturnReview':        return await adminReturnReview(user, data);
      case 'adminGetProjectResult':    return await adminGetProjectResult(user, data);
      case 'adminGetSummary':          return await adminGetSummary(user, data);
      case 'expertListProjects':       return await expertListProjects(user);
      case 'expertGetProjectDetail':   return await expertGetProjectDetail(user, data);
      case 'expertListAssignments':    return await expertListAssignments(user);
      case 'expertGetMyReview':        return await expertGetMyReview(user, data);
      case 'expertGetReviewDraft':     return await expertGetReviewDraft(user, data);
      case 'expertSaveReviewDraft':    return await expertSaveReviewDraft(user, data);
      case 'expertSubmitReview':       return await expertSubmitReview(user, data);
      case 'leaderGetSummary':         return await leaderGetSummary(user, data);
      case 'leaderGetProjectResult':   return await adminGetProjectResult(user, data);
      default:
        return { ok: false, code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error(`[${action}] 服务端异常:`, err);
    return { ok: false, code: 'SERVER_ERROR', message: '服务异常，请稍后重试' };
  }
};

// ═══════════════════ 用户身份 ═══════════════════

/** 查询当前用户信息（需在 users 集合中存在） */
async function handleGetCurrentUser() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, code: 'UNAUTHORIZED', message: '未获取到用户身份' };
  const res = await db.collection('users').where({ openid: OPENID }).get();
  if (!res.data || res.data.length === 0) return { ok: false, code: 'USER_NOT_FOUND', message: '账号待管理员开通' };
  const user = res.data[0];
  if (user.status !== 'active') return { ok: false, code: 'USER_DISABLED', message: '账号已被禁用' };
  return { ok: true, data: { _id: user._id, name: user.name, role: user.role, organization: user.organization || '', title: user.title || '', status: user.status } };
}

/** 获取当前调用者的 OPENID（无需在 users 集合中存在） */
async function handleGetMyOpenid() {
  const { OPENID } = cloud.getWXContext();
  return { ok: true, data: { openid: OPENID || '' } };
}

// ═══════════════════ 项目管理 ═══════════════════

async function adminListProjects(user) {
  const res = await db.collection('projects').where({ status: _.neq('terminated') }).orderBy('createdAt', 'desc').get();
  return { ok: true, data: res.data };
}

async function adminGetProject(user, { projectId }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };
  const res = await db.collection('projects').doc(projectId).get();
  return { ok: true, data: res.data };
}

async function adminCreateProject(user, { project }) {
  if (!project || !project.name) return { ok: false, code: 'INVALID_PARAM', message: '项目名称不能为空' };
  const doc = { name: project.name.trim(), institution: (project.institution || '').trim(), leader: (project.leader || '').trim(), description: (project.description || '').trim(), status: 'active', createdBy: user._id, createdAt: db.serverDate(), updatedAt: db.serverDate() };
  const res = await db.collection('projects').add({ data: doc });
  await log(db, user, 'CREATE_PROJECT', 'project', res._id, null, doc);
  return { ok: true, data: { ...doc, _id: res._id } };
}

async function adminUpdateProject(user, { projectId, updates }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };
  const before = await db.collection('projects').doc(projectId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
  const allowed = { name: 1, institution: 1, leader: 1, description: 1 };
  const patch = { updatedAt: db.serverDate() };
  for (const k of Object.keys(updates || {})) { if (allowed[k]) patch[k] = (updates[k] || '').trim(); }
  await db.collection('projects').doc(projectId).update({ data: patch });
  await log(db, user, 'UPDATE_PROJECT', 'project', projectId, before.data, { ...before.data, ...patch });
  return { ok: true, data: { ...before.data, ...patch } };
}

async function adminArchiveProject(user, { projectId, reason }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };
  const before = await db.collection('projects').doc(projectId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
  await db.collection('projects').doc(projectId).update({ data: { status: 'archived', updatedAt: db.serverDate() } });
  await log(db, user, 'ARCHIVE_PROJECT', 'project', projectId, before.data, { status: 'archived' }, reason);
  return { ok: true, data: { ...before.data, status: 'archived' } };
}

// ═══════════════════ 用户管理 ═══════════════════

async function adminListUsers(user) {
  const res = await db.collection('users').where({ status: _.neq('terminated') }).get();
  return { ok: true, data: res.data };
}

async function adminCreateOrBindUser(user, { userData }) {
  if (!userData || !userData.name) return { ok: false, code: 'INVALID_PARAM', message: '缺少用户姓名' };

  // 如果有 openid，检查是否已存在
  if (userData.openid) {
    const existing = await db.collection('users').where({ openid: userData.openid }).get();
    if (existing.data && existing.data.length > 0) {
      const u = existing.data[0];
      const patch = { name: userData.name || u.name, role: userData.role || u.role, organization: userData.organization || u.organization || '', title: userData.title || u.title || '', updatedAt: db.serverDate() };
      if (!u.openid) patch.openid = userData.openid;
      await db.collection('users').doc(u._id).update({ data: patch });
      await log(db, user, 'UPDATE_USER', 'user', u._id, u, patch);
      return { ok: true, data: { ...u, ...patch } };
    }
  }

  // 创建待绑定用户（openid 可以为空）
  const doc = {
    openid: (userData.openid || '').trim(),
    name: (userData.name || '').trim(),
    role: userData.role || 'expert',
    organization: (userData.organization || '').trim(),
    title: (userData.title || '').trim(),
    phone: (userData.phone || '').trim(),
    bindingStatus: userData.openid ? 'bound' : 'pending',
    status: 'active',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };
  const res = await db.collection('users').add({ data: doc });
  await log(db, user, 'CREATE_USER', 'user', res._id, null, doc);
  return { ok: true, data: { ...doc, _id: res._id } };
}

async function adminBindUserOpenid(user, { userId, openid }) {
  if (!userId || !openid) return { ok: false, code: 'INVALID_PARAM', message: '缺少参数' };
  const target = await db.collection('users').doc(userId).get();
  if (!target.data) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  const dup = await db.collection('users').where({ openid, _id: _.neq(userId) }).get();
  if (dup.data && dup.data.length > 0) return { ok: false, code: 'DUPLICATE_OPENID', message: '该 OPENID 已被其他用户绑定' };
  const patch = { openid, bindingStatus: 'bound', updatedAt: db.serverDate() };
  await db.collection('users').doc(userId).update({ data: patch });
  await log(db, user, 'BIND_OPENID', 'user', userId, target.data, { ...target.data, ...patch });
  return { ok: true, data: { ...target.data, ...patch } };
}

/** 管理员解绑用户 OPENID —— 设为空并标记 pending，不删除任何指派 */
async function adminUnbindUserOpenid(user, { userId }) {
  if (!userId) return { ok: false, code: 'INVALID_PARAM', message: '缺少用户ID' };
  const target = await db.collection('users').doc(userId).get();
  if (!target.data) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  const patch = { openid: '', bindingStatus: 'pending', updatedAt: db.serverDate() };
  await db.collection('users').doc(userId).update({ data: patch });
  await log(db, user, 'UNBIND_OPENID', 'user', userId, target.data, { ...target.data, ...patch });
  return { ok: true, data: { ...target.data, ...patch } };
}

async function adminDisableUser(user, { userId, reason }) {
  if (!userId) return { ok: false, code: 'INVALID_PARAM', message: '缺少用户ID' };
  const before = await db.collection('users').doc(userId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  await db.collection('users').doc(userId).update({ data: { status: 'disabled', updatedAt: db.serverDate() } });
  await log(db, user, 'DISABLE_USER', 'user', userId, before.data, { status: 'disabled' }, reason);
  return { ok: true, data: { ...before.data, status: 'disabled' } };
}

async function adminEnableUser(user, { userId }) {
  if (!userId) return { ok: false, code: 'INVALID_PARAM', message: '缺少用户ID' };
  const before = await db.collection('users').doc(userId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  await db.collection('users').doc(userId).update({ data: { status: 'active', updatedAt: db.serverDate() } });
  await log(db, user, 'ENABLE_USER', 'user', userId, before.data, { status: 'active' });
  return { ok: true, data: { ...before.data, status: 'active' } };
}

// ═══════════════════ 评审批次 ═══════════════════

async function adminListReviewRounds(user) {
  const res = await db.collection('review_rounds').orderBy('createdAt', 'desc').get();
  return { ok: true, data: res.data };
}

async function adminCreateReviewRound(user, { round }) {
  if (!round || !round.name) return { ok: false, code: 'INVALID_PARAM', message: '批次名称不能为空' };
  const doc = { name: round.name.trim(), roundNo: round.roundNo || 1, status: 'draft', startAt: null, deadline: round.deadline ? new Date(round.deadline) : null, closedAt: null, createdBy: user._id, createdAt: db.serverDate(), updatedAt: db.serverDate() };
  const res = await db.collection('review_rounds').add({ data: doc });
  await log(db, user, 'CREATE_ROUND', 'review_round', res._id, null, doc);
  return { ok: true, data: { ...doc, _id: res._id } };
}

async function adminUpdateReviewRound(user, { roundId, updates }) {
  if (!roundId) return { ok: false, code: 'INVALID_PARAM', message: '缺少批次ID' };
  const before = await db.collection('review_rounds').doc(roundId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };
  if (before.data.status === 'closed') return { ok: false, code: 'ROUND_CLOSED', message: '已关闭批次不可修改' };
  const allowed = { name: 1, deadline: 1 };
  const patch = { updatedAt: db.serverDate() };
  for (const k of Object.keys(updates || {})) {
    if (allowed[k]) patch[k] = k === 'deadline' ? (updates[k] ? new Date(updates[k]) : null) : (updates[k] || '').trim();
  }
  await db.collection('review_rounds').doc(roundId).update({ data: patch });
  await log(db, user, 'UPDATE_ROUND', 'review_round', roundId, before.data, { ...before.data, ...patch });
  return { ok: true, data: { ...before.data, ...patch } };
}

/** 开启评审批次（仅允许从 draft 状态开启） */
async function adminOpenReviewRound(user, { roundId }) {
  if (!roundId) return { ok: false, code: 'INVALID_PARAM', message: '缺少批次ID' };
  const before = await db.collection('review_rounds').doc(roundId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };

  // 仅允许从 draft 状态开启
  if (before.data.status !== 'draft') {
    if (before.data.status === 'open') return { ok: false, code: 'ALREADY_OPEN', message: '批次已开启' };
    return { ok: false, code: 'INVALID_STATUS', message: '只能从草稿状态开启批次' };
  }

  // 至少存在一个指派
  const assignments = await db.collection('review_assignments').where({ roundId, status: _.neq('removed') }).get();
  if (!assignments.data || assignments.data.length === 0) {
    return { ok: false, code: 'NO_ASSIGNMENTS', message: '该批次没有指派专家，请先分配' };
  }

  // 检查是否有其他 open 批次
  const otherOpen = await db.collection('review_rounds').where({ status: 'open', _id: _.neq(roundId) }).get();
  if (otherOpen.data && otherOpen.data.length > 0) return { ok: false, code: 'ANOTHER_OPEN', message: '已有其他开放批次，请先关闭' };

  // 检查截止日期是否已过期（如果设置了的话）
  if (before.data.deadline && Date.now() > new Date(before.data.deadline).getTime()) {
    return { ok: false, code: 'DEADLINE_PAST', message: '截止日期已过，请先修改截止日期' };
  }

  const patch = { status: 'open', startAt: db.serverDate(), updatedAt: db.serverDate() };
  await db.collection('review_rounds').doc(roundId).update({ data: patch });
  await log(db, user, 'OPEN_ROUND', 'review_round', roundId, before.data, { ...before.data, ...patch });
  return { ok: true, data: { ...before.data, ...patch } };
}

/** 关闭评审批次（要求所有指派已完成提交） */
async function adminCloseReviewRound(user, { roundId }) {
  if (!roundId) return { ok: false, code: 'INVALID_PARAM', message: '缺少批次ID' };
  const before = await db.collection('review_rounds').doc(roundId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };

  // 检查所有指派是否已提交
  const assignmentsRes = await db.collection('review_assignments').where({ roundId, status: _.neq('removed') }).get();
  const assignments = assignmentsRes.data || [];
  const total = assignments.length;
  const completed = assignments.filter(a => ['submitted', 'resubmitted'].includes(a.status)).length;
  const unfinished = total - completed;

  if (unfinished > 0) {
    return {
      ok: false,
      code: 'UNFINISHED_ASSIGNMENTS',
      message: '存在未完成的评审',
      data: { total, completed, unfinished }
    };
  }

  const patch = { status: 'closed', closedAt: db.serverDate(), updatedAt: db.serverDate() };
  await db.collection('review_rounds').doc(roundId).update({ data: patch });

  // 已提交 → locked
  await db.collection('reviews').where({ roundId, status: _.in(['submitted', 'resubmitted']) }).update({ data: { status: 'locked', updatedAt: db.serverDate() } });
  await db.collection('review_assignments').where({ roundId, status: _.in(['submitted', 'resubmitted']) }).update({ data: { status: 'locked', updatedAt: db.serverDate() } });
  // 未提交 → closed_unsubmitted（正常情况下此时不会再有未提交的，但保留兜底）
  await db.collection('review_assignments').where({ roundId, status: _.nin(['locked', 'removed']) }).update({ data: { status: 'closed_unsubmitted', updatedAt: db.serverDate() } });

  await log(db, user, 'CLOSE_ROUND', 'review_round', roundId, before.data, { ...before.data, ...patch });
  return { ok: true, data: { ...before.data, ...patch } };
}

/** 强制关闭评审批次（跳过"全部提交"检查，管理员确认） */
async function adminForceCloseReviewRound(user, { roundId, reason }) {
  if (!roundId) return { ok: false, code: 'INVALID_PARAM', message: '缺少批次ID' };
  const before = await db.collection('review_rounds').doc(roundId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };

  const patch = { status: 'closed', closedAt: db.serverDate(), updatedAt: db.serverDate() };
  await db.collection('review_rounds').doc(roundId).update({ data: patch });

  // 已提交/重新提交 → locked
  await db.collection('reviews').where({ roundId, status: _.in(['submitted', 'resubmitted']) }).update({ data: { status: 'locked', updatedAt: db.serverDate() } });
  await db.collection('review_assignments').where({ roundId, status: _.in(['submitted', 'resubmitted']) }).update({ data: { status: 'locked', updatedAt: db.serverDate() } });
  // 未提交 → closed_unsubmitted
  await db.collection('review_assignments').where({ roundId, status: _.nin(['locked', 'removed']) }).update({ data: { status: 'closed_unsubmitted', updatedAt: db.serverDate() } });

  await log(db, user, 'FORCE_CLOSE_ROUND', 'review_round', roundId, before.data, { ...before.data, ...patch }, reason);
  return { ok: true, data: { ...before.data, ...patch } };
}

// ═══════════════════ 指派管理 ═══════════════════

async function adminListAssignments(user, { roundId }) {
  let query = { status: _.neq('removed') };
  if (roundId) query.roundId = roundId;
  const res = await db.collection('review_assignments').where(query).get();
  return { ok: true, data: res.data };
}

async function adminAssignExpert(user, { projectId, roundId, expertId }) {
  if (!projectId || !roundId || !expertId) return { ok: false, code: 'INVALID_PARAM', message: '缺少必要参数' };

  // 校验项目状态
  const project = await db.collection('projects').doc(projectId).get();
  if (!project.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
  if (project.data.status !== 'active') return { ok: false, code: 'PROJECT_ARCHIVED', message: '项目已归档' };

  // 检查批次状态
  const round = await db.collection('review_rounds').doc(roundId).get();
  if (!round.data) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };
  if (round.data.status === 'closed') return { ok: false, code: 'ROUND_CLOSED', message: '已关闭批次不可新增指派' };
  // 幂等检查
  const existing = await db.collection('review_assignments').where({ projectId, roundId, expertId }).get();
  if (existing.data && existing.data.length > 0) return { ok: false, code: 'ALREADY_ASSIGNED', message: '该专家已分配到此项目' };
  const doc = { projectId, roundId, expertId, status: 'assigned', assignedAt: db.serverDate(), updatedAt: db.serverDate() };
  const res = await db.collection('review_assignments').add({ data: doc });
  await log(db, user, 'ASSIGN_EXPERT', 'review_assignment', res._id, null, doc);
  return { ok: true, data: { ...doc, _id: res._id } };
}

// P1-6: 软删除指派
async function adminRemoveAssignment(user, { assignmentId, reason }) {
  if (!assignmentId) return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };
  const before = await db.collection('review_assignments').doc(assignmentId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '指派不存在' };
  if (['submitted', 'resubmitted'].includes(before.data.status) && !reason) {
    return { ok: false, code: 'REASON_REQUIRED', message: '该专家已提交评审，移除需要填写原因' };
  }
  const patch = { status: 'removed', removedAt: db.serverDate(), removedBy: user._id, removedReason: reason || '', updatedAt: db.serverDate() };
  await db.collection('review_assignments').doc(assignmentId).update({ data: patch });

  // 作废关联评审
  const relatedReview = await db.collection('reviews').where({ assignmentId }).get();
  if (relatedReview.data && relatedReview.data.length > 0) {
    for (const r of relatedReview.data) {
      await db.collection('reviews').doc(r._id).update({ data: { status: 'invalidated', invalidatedAt: db.serverDate(), invalidatedBy: user._id, invalidatedReason: reason || '' } });
    }
  }
  await log(db, user, 'REMOVE_ASSIGNMENT', 'review_assignment', assignmentId, before.data, patch, reason);
  return { ok: true, message: '已移除（评审记录已作废）' };
}

// ═══════════════════ 评审管理 ═══════════════════

async function adminReturnReview(user, { reviewId, reason }) {
  if (!reviewId) return { ok: false, code: 'INVALID_PARAM', message: '缺少评审ID' };
  if (!reason) return { ok: false, code: 'REASON_REQUIRED', message: '退回需要填写原因' };
  const before = await db.collection('reviews').doc(reviewId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '评审记录不存在' };
  const patch = { status: 'returned', returnReason: reason, returnedAt: db.serverDate(), updatedAt: db.serverDate() };
  await db.collection('reviews').doc(reviewId).update({ data: patch });
  if (before.data.assignmentId) {
    await db.collection('review_assignments').doc(before.data.assignmentId).update({ data: { status: 'returned', updatedAt: db.serverDate() } });
  }
  await log(db, user, 'RETURN_REVIEW', 'review', reviewId, before.data, { ...before.data, ...patch }, reason);
  return { ok: true, data: { ...before.data, ...patch } };
}

// P1-8: 只统计有效状态
async function adminGetProjectResult(user, { projectId, roundId, includeNonFinal }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };
  if (!roundId) return { ok: false, code: 'INVALID_PARAM', message: '缺少评审批次ID' };
  let query = { projectId, roundId };
  if (!includeNonFinal) query.status = _.in(['submitted', 'resubmitted', 'locked']);
  const reviews = await db.collection('reviews').where(query).get();
  return { ok: true, data: reviews.data };
}

async function adminGetSummary(user, { roundId }) {
  if (!roundId) return { ok: false, code: 'INVALID_PARAM', message: '缺少评审批次ID' };
  let query = { status: _.in(['submitted', 'resubmitted', 'locked']), roundId };
  const reviews = await db.collection('reviews').where(query).get();

  let asgnQuery = { status: _.neq('removed'), roundId };
  const assignments = await db.collection('review_assignments').where(asgnQuery).get();

  const assignedProjectIds = [...new Set(assignments.data.map(a => a.projectId))];
  const projects = assignedProjectIds.length > 0
    ? (await db.collection('projects').where({ _id: _.in(assignedProjectIds), status: _.neq('terminated') }).get()).data
    : [];

  const round = (await db.collection('review_rounds').doc(roundId).get()).data;
  return { ok: true, data: buildSummary(projects, reviews.data, assignments.data, round) };
}

function leaderGetSummary(user, { roundId }) {
  return adminGetSummary(user, { roundId });
}

// ═══════════════════ 专家侧 ═══════════════════

async function expertListProjects(user) {
  const assignments = await db.collection('review_assignments').where({ expertId: user._id, status: _.neq('removed') }).get();
  const projectIds = [...new Set(assignments.data.map(a => a.projectId))];
  if (projectIds.length === 0) return { ok: true, data: [] };
  const projects = await db.collection('projects').where({ _id: _.in(projectIds) }).get();
  return { ok: true, data: projects.data };
}

async function expertGetProjectDetail(user, { assignmentId }) {
  if (!assignmentId) return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };
  const assignmentRes = await db.collection('review_assignments').doc(assignmentId).get();
  if (!assignmentRes.data) return { ok: false, code: 'NOT_FOUND', message: '指派不存在' };
  const assignment = assignmentRes.data;
  if (assignment.expertId !== user._id) return { ok: false, code: 'NOT_ASSIGNED', message: '您未被分配到此项目' };
  if (assignment.status === 'removed') return { ok: false, code: 'ASSIGNMENT_REMOVED', message: '该指派已被移除' };
  const project = await db.collection('projects').doc(assignment.projectId).get();
  if (!project.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
  if (project.data.status !== 'active') return { ok: false, code: 'PROJECT_ARCHIVED', message: '项目已归档' };
  const round = await db.collection('review_rounds').doc(assignment.roundId).get().catch(() => ({ data: null }));
  return { ok: true, data: { project: project.data, assignment, currentRound: round.data } };
}

async function expertListAssignments(user) {
  const assignments = await db.collection('review_assignments').where({ expertId: user._id, status: _.neq('removed') }).get();
  if (assignments.data.length === 0) return { ok: true, data: [] };
  const projectIds = [...new Set(assignments.data.map(a => a.projectId))];
  const projects = await db.collection('projects').where({ _id: _.in(projectIds) }).get();
  const projectMap = {}; projects.data.forEach(p => { projectMap[p._id] = p; });
  // 查所有评审（不限状态）
  const reviewRes = await db.collection('reviews').where({ expertId: user._id }).get();
  const reviewMap = {}; reviewRes.data.forEach(r => { reviewMap[r.assignmentId] = r; });
  const result = assignments.data.map(a => ({ ...a, project: projectMap[a.projectId] || null, review: reviewMap[a._id] || null }));
  return { ok: true, data: result };
}

// P0-5: 查询所有状态的评审（不限于 draft）
async function expertGetMyReview(user, { assignmentId }) {
  if (!assignmentId) return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };
  const assignment = await db.collection('review_assignments').doc(assignmentId).get();
  if (!assignment.data || assignment.data.expertId !== user._id) return { ok: false, code: 'NOT_ASSIGNED', message: '无权限' };
  try {
    const res = await db.collection('reviews').doc(assignmentId).get();
    return { ok: true, data: res.data || null };
  } catch (e) {
    return { ok: true, data: null };
  }
}

// 保留旧接口查询草稿
async function expertGetReviewDraft(user, { assignmentId }) {
  if (!assignmentId) return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };
  const assignment = await db.collection('review_assignments').doc(assignmentId).get();
  if (!assignment.data || assignment.data.expertId !== user._id) return { ok: false, code: 'NOT_ASSIGNED', message: '无权限' };
  try {
    const res = await db.collection('reviews').doc(assignmentId).get();
    return { ok: true, data: res.data || null };
  } catch (e) {
    return { ok: true, data: null };
  }
}

// P1-7: 增加截止日期校验 + 归档项目检查
async function expertSaveReviewDraft(user, { reviewData }) {
  if (!reviewData || !reviewData.assignmentId) return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };
  const assignment = await db.collection('review_assignments').doc(reviewData.assignmentId).get();
  if (!assignment.data || assignment.data.expertId !== user._id) return { ok: false, code: 'NOT_ASSIGNED', message: '无权限' };
  if (!['assigned', 'draft', 'returned'].includes(assignment.data.status)) return { ok: false, code: 'STATUS_ERROR', message: '当前状态不可保存草稿' };

  // 校验项目未被归档
  const project = await db.collection('projects').doc(assignment.data.projectId).get();
  if (!project.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
  if (project.data.status !== 'active') return { ok: false, code: 'PROJECT_ARCHIVED', message: '项目已归档' };

  const round = await db.collection('review_rounds').doc(assignment.data.roundId).get();
  if (!round.data || round.data.status !== 'open') return { ok: false, code: 'ROUND_CLOSED', message: '评审批次未开放' };
  if (round.data.deadline && Date.now() > new Date(round.data.deadline).getTime()) return { ok: false, code: 'DEADLINE_EXPIRED', message: '已超过截止日期' };

  const doc = {
    _id: reviewData.assignmentId,
    projectId: assignment.data.projectId, roundId: assignment.data.roundId, assignmentId: reviewData.assignmentId,
    expertId: user._id, expertName: user.name,
    scores: reviewData.scores || {}, totalScore: 0, grade: '',
    comments: reviewData.comments || '', recommendedFunding: Number(reviewData.recommendedFunding) || 0, fundingComment: reviewData.fundingComment || '',
    status: 'draft', version: 1, submittedAt: null, updatedAt: db.serverDate(), createdAt: db.serverDate()
  };

  // P0-7: 使用 assignmentId 作为 _id 实现幂等
  try {
    const existing = await db.collection('reviews').doc(reviewData.assignmentId).get();
    doc.version = (existing.data && existing.data.version) || 1;
    doc.createdAt = existing.data ? existing.data.createdAt : db.serverDate();
    if (assignment.data.status === 'returned') doc.returnReason = existing.data ? existing.data.returnReason : '';
  } catch (e) { /* 首次创建 */ }

  await db.collection('reviews').doc(reviewData.assignmentId).set({ data: doc });
  if (assignment.data.status === 'assigned') {
    await db.collection('review_assignments').doc(reviewData.assignmentId).update({ data: { status: 'draft', updatedAt: db.serverDate() } });
  }
  return { ok: true, data: doc };
}

// P0-7: 幂等提交，P1-7: 截止日期校验 + 归档项目检查
async function expertSubmitReview(user, { assignmentId, scores, comments, recommendedFunding, fundingComment }) {
  if (!assignmentId) return { ok: false, code: 'INVALID_PARAM', message: '缺少指派ID' };
  const assignment = await db.collection('review_assignments').doc(assignmentId).get();
  if (!assignment.data) return { ok: false, code: 'NOT_FOUND', message: '指派不存在' };
  if (assignment.data.expertId !== user._id) return { ok: false, code: 'NOT_ASSIGNED', message: '您未被分配到此项目' };
  if (['locked', 'closed_unsubmitted'].includes(assignment.data.status)) return { ok: false, code: 'LOCKED', message: '无法提交' };
  if (['submitted', 'resubmitted'].includes(assignment.data.status) && assignment.data.status !== 'returned') return { ok: false, code: 'ALREADY_SUBMITTED', message: '您已提交评审，不能重复提交' };

  // 校验项目未被归档
  const project = await db.collection('projects').doc(assignment.data.projectId).get();
  if (!project.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
  if (project.data.status !== 'active') return { ok: false, code: 'PROJECT_ARCHIVED', message: '项目已归档' };

  const round = await db.collection('review_rounds').doc(assignment.data.roundId).get();
  if (!round.data || round.data.status !== 'open') return { ok: false, code: 'ROUND_CLOSED', message: '评审批次未开放' };
  // P1-7: 截止日期校验
  if (round.data.deadline && Date.now() > new Date(round.data.deadline).getTime()) return { ok: false, code: 'DEADLINE_EXPIRED', message: '已超过截止日期' };

  const calc = validateAndCalculate(scores);
  if (!calc.ok) return { ok: false, code: 'INVALID_SCORE', message: calc.error };
  if (!comments || !comments.trim()) return { ok: false, code: 'COMMENTS_REQUIRED', message: '评审意见不能为空' };
  const funding = Number(recommendedFunding);
  if (isNaN(funding) || funding < 0) return { ok: false, code: 'INVALID_FUNDING', message: '建议经费需为合法非负数字' };

  const now = db.serverDate();
  const isReturned = assignment.data.status === 'returned';
  const newStatus = isReturned ? 'resubmitted' : 'submitted';

  // P0-7: 使用 doc(assignmentId).set() 确保幂等
  let existingVersion = 1, existingCreatedAt = now;
  try {
    const existing = await db.collection('reviews').doc(assignmentId).get();
    existingVersion = (existing.data && existing.data.version) || 1;
    existingCreatedAt = existing.data ? existing.data.createdAt : now;
  } catch (e) { /* 首次 */ }

  const reviewDoc = {
    _id: assignmentId,
    projectId: assignment.data.projectId, roundId: assignment.data.roundId, assignmentId,
    expertId: user._id, expertName: user.name,
    scores, totalScore: calc.totalScore, grade: calc.grade,
    comments: comments.trim(), recommendedFunding: funding, fundingComment: (fundingComment || '').trim(),
    status: newStatus, version: isReturned ? existingVersion + 1 : existingVersion,
    submittedAt: now, updatedAt: now, createdAt: existingCreatedAt
  };

  await db.collection('reviews').doc(assignmentId).set({ data: reviewDoc });
  await db.collection('review_assignments').doc(assignmentId).update({ data: { status: newStatus, submittedAt: now, updatedAt: now } });
  await log(db, user, isReturned ? 'RESUBMIT_REVIEW' : 'SUBMIT_REVIEW', 'review', assignmentId, null, reviewDoc);
  return { ok: true, data: reviewDoc };
}

// ═══════════════════ 汇总计算（P0-8 重写） ═══════════════════

function buildSummary(projects, reviews, assignments, round) {
  const projectMap = {};
  projects.forEach(p => { projectMap[p._id] = p; });

  // 按项目聚合有效评分
  const reviewByProject = {};  // projectId → [scores]
  const fundingByProject = {}; // projectId → [fundings]
  reviews.forEach(r => {
    if (!reviewByProject[r.projectId]) reviewByProject[r.projectId] = [];
    reviewByProject[r.projectId].push(r.totalScore);
    if (!fundingByProject[r.projectId]) fundingByProject[r.projectId] = [];
    fundingByProject[r.projectId].push(Number(r.recommendedFunding) || 0);
  });

  // 按项目聚合指派（排除 removed）
  const assignmentByProject = {};
  const submittedByProject = {};
  assignments.forEach(a => {
    if (!assignmentByProject[a.projectId]) assignmentByProject[a.projectId] = 0;
    if (!submittedByProject[a.projectId]) submittedByProject[a.projectId] = 0;
    assignmentByProject[a.projectId]++;
    if (['submitted', 'resubmitted', 'locked'].includes(a.status)) submittedByProject[a.projectId]++;
  });

  const isClosed = round && round.status === 'closed';
  const rankings = [];

  // P0-8: 遍历所有项目（不仅是已有评分的）
  for (const project of projects) {
    const pid = project._id;
    const totalAssignments = assignmentByProject[pid] || 0;
    const submittedCount = submittedByProject[pid] || 0;
    const scores = reviewByProject[pid] || [];
    const fundings = fundingByProject[pid] || [];

    let reviewStatus;
    if (totalAssignments === 0) reviewStatus = '未分配';
    else if (submittedCount === 0) reviewStatus = '待开始';
    else if (submittedCount < totalAssignments) reviewStatus = '评审中';
    else reviewStatus = isClosed ? '已关闭' : '已完成';

    if (scores.length === 0) {
      rankings.push({
        projectId: pid, projectName: project.name, institution: project.institution || '',
        avgScore: '-', median: '-', minScore: '-', maxScore: '-', range: '-',
        gradeLabel: '-', gradeColor: '#999', avgFunding: '-',
        reviewCount: 0, totalAssignments, submittedCount, reviewStatus,
        isFormalRanking: isClosed && submittedCount === totalAssignments
      });
      continue;
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const mid = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
    const grade = getGrade(avg);
    const avgFunding = fundings.length > 0 ? (fundings.reduce((a, b) => a + b, 0) / fundings.length).toFixed(2) : '-';

    rankings.push({
      projectId: pid, projectName: project.name, institution: project.institution || '',
      avgScore: avg.toFixed(1), median: mid.toFixed(1), minScore: sorted[0], maxScore: sorted[sorted.length - 1], range: (sorted[sorted.length - 1] - sorted[0]).toFixed(1),
      gradeLabel: grade.label, gradeColor: grade.color, avgFunding,
      reviewCount: submittedCount, totalAssignments, submittedCount, reviewStatus,
      isFormalRanking: isClosed && submittedCount === totalAssignments
    });
  }

  rankings.sort((a, b) => {
    if (a.avgScore === '-') return 1;
    if (b.avgScore === '-') return -1;
    return parseFloat(b.avgScore) - parseFloat(a.avgScore);
  });
  rankings.forEach((r, i) => { r.rank = i + 1; });

  const totalProjects = projects.length;
  const totalReviews = reviews.length;
  const allScores = rankings.filter(r => r.avgScore !== '-').map(r => parseFloat(r.avgScore));
  const avgAll = allScores.length > 0 ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) : '-';

  return { totalProjects, totalReviews, avgScore: avgAll, rankings, isClosed };
}
