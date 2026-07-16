/**
 * 路演现场评分系统 - 业务云函数 v2.0
 *
 * 身份体系：
 *   - 管理员/领导 → users 表（admin / leader）
 *   - 评审专家   → reviewer_invitations 表（token 扫码绑定 OPENID）
 *
 * 评审流程：
 *   扫码 → scanInvite（查看场次信息）
 *      → bindInvite（绑定 OPENID）
 *      → getMySession / getMyProjects（查看项目列表，自动排除回避项）
 *      → saveMyReviewDraft（保存草稿）
 *      → submitMyReview（提交评审，可重复提交覆盖）
 *      → 场次关闭后所有评审锁定
 */

const cloud = require('wx-server-sdk');
const { verifyAuth, verifyReviewerAuth, isPublicAction, isReviewerAction } = require('./lib/auth');
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
    // ═══ 公开动作（无需身份校验） ═══
    if (action === 'getMyOpenid')   return await handleGetMyOpenid();
    if (action === 'getCurrentUser') return await handleGetCurrentUser();
    if (action === 'scanInvite')    return await scanInvite(data);
    if (action === 'bindInvite')    return await bindInvite(OPENID, data);

    // ═══ 评审专家动作（reviewer_invitations 校验） ═══
    if (isReviewerAction(action)) {
      const reviewerAuth = await verifyReviewerAuth(db, OPENID, data.sessionId);
      if (!reviewerAuth.ok) return reviewerAuth;
      const { reviewer, session } = reviewerAuth;

      switch (action) {
        case 'getMySession':       return await getMySession(reviewer, session);
        case 'getMyProjects':      return await getMyProjects(reviewer, session, data);
        case 'getMyReview':        return await getMyReview(reviewer, session, data);
        case 'saveMyReviewDraft':  return await saveMyReviewDraft(reviewer, session, data);
        case 'submitMyReview':     return await submitMyReview(reviewer, session, data);
      }
    }

    // ═══ 管理员/领导动作（users 表校验） ═══
    const auth = await verifyAuth(db, OPENID, action);
    if (!auth.ok) return auth;
    const user = auth.user;

    switch (action) {
      // 旧版项目管理（保持兼容）
      case 'adminListProjects':        return await adminListProjects(user);
      case 'adminGetProject':          return await adminGetProject(user, data);
      case 'adminCreateProject':       return await adminCreateProject(user, data);
      case 'adminUpdateProject':       return await adminUpdateProject(user, data);
      case 'adminArchiveProject':      return await adminArchiveProject(user, data);
      // 旧版用户管理（保持兼容）
      case 'adminListUsers':           return await adminListUsers(user);
      case 'adminCreateOrBindUser':    return await adminCreateOrBindUser(user, data);
      case 'adminBindUserOpenid':      return await adminBindUserOpenid(user, data);
      case 'adminUnbindUserOpenid':    return await adminUnbindUserOpenid(user, data);
      case 'adminDisableUser':         return await adminDisableUser(user, data);
      case 'adminEnableUser':          return await adminEnableUser(user, data);
      // 新版场次管理
      case 'adminListSessions':        return await adminListSessions(user);
      case 'adminGetSession':          return await adminGetSession(user, data);
      case 'adminCreateSession':       return await adminCreateSession(user, data);
      case 'adminUpdateSession':       return await adminUpdateSession(user, data);
      case 'adminOpenSession':         return await adminOpenSession(user, data);
      case 'adminCloseSession':        return await adminCloseSession(user, data);
      // 新版场次项目管理
      case 'adminAddProject':          return await adminAddProject(user, data);
      case 'adminImportProjects':      return await adminImportProjects(user, data);
      case 'adminUpdateProjectInSession': return await adminUpdateProjectInSession(user, data);
      case 'adminRemoveProject':       return await adminRemoveProject(user, data);
      // 新版评审专家管理
      case 'adminListReviewers':       return await adminListReviewers(user, data);
      case 'adminAddReviewer':         return await adminAddReviewer(user, data);
      case 'adminGenerateQR':          return await adminGenerateQR(user, data);
      case 'adminResetBinding':        return await adminResetBinding(user, data);
      case 'adminRegenerateToken':     return await adminRegenerateToken(user, data);
      case 'adminDisableReviewer':     return await adminDisableReviewer(user, data);
      case 'adminEnableReviewer':      return await adminEnableReviewer(user, data);
      // 新版回避管理
      case 'adminSetRecusal':          return await adminSetRecusal(user, data);
      case 'adminRemoveRecusal':       return await adminRemoveRecusal(user, data);
      case 'adminListRecusals':        return await adminListRecusals(user, data);
      // 新版统计与汇总
      case 'adminGetSessionProgress':  return await adminGetSessionProgress(user, data);
      case 'adminGetSummary':          return await adminGetSummary(user, data);
      // 新版解锁评审
      case 'adminUnlockReview':        return await adminUnlockReview(user, data);

      default:
        return { ok: false, code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error(`[${action}] 服务端异常:`, err);
    return { ok: false, code: 'SERVER_ERROR', message: '服务异常，请稍后重试' };
  }
};

// ═══════════════════════════════════════════════════════════════
//  公开动作
// ═══════════════════════════════════════════════════════════════

/** 获取当前调用者的 OPENID */
async function handleGetMyOpenid() {
  const { OPENID } = cloud.getWXContext();
  return { ok: true, data: { openid: OPENID || '' } };
}

/** 查询当前用户身份（users 表） */
async function handleGetCurrentUser() {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, code: 'UNAUTHORIZED', message: '未获取到用户身份' };

  // 先查 users 表
  const userRes = await db.collection('users').where({ openid: OPENID }).get();
  if (userRes.data && userRes.data.length > 0) {
    const u = userRes.data[0];
    if (u.status !== 'active') return { ok: false, code: 'USER_DISABLED', message: '账号已被禁用' };
    return { ok: true, data: { _id: u._id, name: u.name, role: u.role, organization: u.organization || '', title: u.title || '', type: 'admin' } };
  }

  // 再查 reviewer_invitations 表
  const revRes = await db.collection('reviewer_invitations').where({ boundOpenid: OPENID, bindingStatus: 'bound', status: 'active' }).get();
  if (revRes.data && revRes.data.length > 0) {
    const r = revRes.data[0];
    return { ok: true, data: { _id: r._id, name: r.reviewerName, organization: r.organization || '', title: r.title || '', type: 'reviewer' } };
  }

  return { ok: false, code: 'USER_NOT_FOUND', message: '账号待管理员开通' };
}

// ═══════════════════════════════════════════════════════════════
//  扫码邀请 & 绑定（评审专家侧入口）
// ═══════════════════════════════════════════════════════════════

/**
 * scanInvite(inviteToken)
 * 评审专家扫描二维码后，查看邀请信息（场次 + 评审人信息）
 * 不绑定 OPENID，仅预览
 */
async function scanInvite({ inviteToken }) {
  if (!inviteToken) return { ok: false, code: 'INVALID_PARAM', message: '缺少邀请令牌' };

  let invitation;
  try {
    const res = await db.collection('reviewer_invitations').where({ token: inviteToken }).get();
    if (!res.data || res.data.length === 0) {
      return { ok: false, code: 'INVALID_TOKEN', message: '邀请链接无效或已失效' };
    }
    invitation = res.data[0];
  } catch (e) {
    return { ok: false, code: 'INVALID_TOKEN', message: '查询邀请失败' };
  }

  if (invitation.status !== 'active') {
    return { ok: false, code: 'INVITATION_DISABLED', message: '该邀请已被禁用' };
  }

  // 获取场次信息
  let session;
  try {
    session = (await db.collection('review_sessions').doc(invitation.sessionId).get()).data;
  } catch (e) {
    return { ok: false, code: 'SESSION_NOT_FOUND', message: '评审场次不存在' };
  }

  if (session.status === 'closed') {
    return { ok: false, code: 'SESSION_CLOSED', message: '评审场次已关闭' };
  }

  return {
    ok: true,
    data: {
      invitation: {
        reviewerName: invitation.reviewerName,
        organization: invitation.organization || '',
        title: invitation.title || '',
        bindingStatus: invitation.bindingStatus,
        token: invitation.token,
      },
      session: {
        _id: session._id,
        name: session.name,
        eventDate: session.eventDate,
        startTime: session.startTime,
        deadline: session.deadline,
        status: session.status,
      },
    },
  };
}

/**
 * bindInvite(inviteToken)
 * 评审专家确认绑定 OPENID 到邀请
 * 规则：首次绑定（pending → bound），已绑定到同一 OPENID 为幂等，不同 OPENID 拒绝
 */
async function bindInvite(openid, { inviteToken }) {
  if (!openid) return { ok: false, code: 'UNAUTHORIZED', message: '未获取到用户身份' };
  if (!inviteToken) return { ok: false, code: 'INVALID_PARAM', message: '缺少邀请令牌' };

  // 查找邀请
  const res = await db.collection('reviewer_invitations').where({ token: inviteToken }).get();
  if (!res.data || res.data.length === 0) {
    return { ok: false, code: 'INVALID_TOKEN', message: '邀请链接无效或已失效' };
  }
  const invitation = res.data[0];

  if (invitation.status !== 'active') {
    return { ok: false, code: 'INVITATION_DISABLED', message: '该邀请已被禁用' };
  }

  // 检查场次状态
  let session;
  try {
    session = (await db.collection('review_sessions').doc(invitation.sessionId).get()).data;
  } catch (e) {
    return { ok: false, code: 'SESSION_NOT_FOUND', message: '评审场次不存在' };
  }
  if (session.status === 'closed') {
    return { ok: false, code: 'SESSION_CLOSED', message: '评审场次已关闭' };
  }

  // 已绑定到同一 OPENID → 幂等返回
  if (invitation.bindingStatus === 'bound' && invitation.boundOpenid === openid) {
    return {
      ok: true,
      message: '您已绑定',
      data: {
        reviewerName: invitation.reviewerName,
        organization: invitation.organization || '',
        sessionId: invitation.sessionId,
        sessionName: session.name,
      },
    };
  }

  // 已绑定到不同 OPENID → 拒绝
  if (invitation.bindingStatus === 'bound' && invitation.boundOpenid !== openid) {
    return { ok: false, code: 'ALREADY_BOUND', message: '该邀请已被其他微信账号绑定' };
  }

  // 检查该 OPENID 是否已绑定到同场次的其他邀请（一个 OPENID 每场次只能绑定一个邀请）
  const dupCheck = await db.collection('reviewer_invitations').where({
    sessionId: invitation.sessionId,
    boundOpenid: openid,
    bindingStatus: 'bound',
    status: 'active',
    _id: _.neq(invitation._id),
  }).get();
  if (dupCheck.data && dupCheck.data.length > 0) {
    return { ok: false, code: 'DUPLICATE_BINDING', message: '您的微信已绑定该场次的其他评审身份' };
  }

  // 执行绑定
  const now = db.serverDate();
  const patch = {
    boundOpenid: openid,
    bindingStatus: 'bound',
    boundAt: now,
    updatedAt: now,
  };
  await db.collection('reviewer_invitations').doc(invitation._id).update({ data: patch });
  await log(db, { _id: openid, name: invitation.reviewerName }, 'BIND_INVITE', 'reviewer_invitation', invitation._id, invitation, { ...invitation, ...patch });

  return {
    ok: true,
    message: '绑定成功',
    data: {
      reviewerName: invitation.reviewerName,
      organization: invitation.organization || '',
      sessionId: invitation.sessionId,
      sessionName: session.name,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  评审专家侧动作
// ═══════════════════════════════════════════════════════════════

/**
 * getMySession
 * 获取评审专家当前绑定的场次信息
 */
async function getMySession(reviewer, session) {
  // 统计项目数
  const totalProjects = await db.collection('session_projects')
    .where({ sessionId: session._id, status: _.neq('removed') }).count();
  const exclusions = await db.collection('review_exclusions')
    .where({ sessionId: session._id, reviewerInvitationId: reviewer._id }).count();

  return {
    ok: true,
    data: {
      session: {
        _id: session._id,
        name: session.name,
        eventDate: session.eventDate,
        startTime: session.startTime,
        deadline: session.deadline,
        status: session.status,
      },
      reviewer: {
        name: reviewer.reviewerName,
        organization: reviewer.organization || '',
        title: reviewer.title || '',
      },
      stats: {
        totalProjects: totalProjects.total,
        recusedProjects: exclusions.total,
        availableProjects: totalProjects.total - exclusions.total,
      },
    },
  };
}

/**
 * getMyProjects(sessionId)
 * 获取场次中评审专家可见的项目列表（排除已回避的）
 */
async function getMyProjects(reviewer, session, { sessionId }) {
  // 获取所有活跃项目
  const projectsRes = await db.collection('session_projects')
    .where({ sessionId: session._id, status: _.neq('removed') })
    .orderBy('order', 'asc')
    .get();
  const allProjects = projectsRes.data || [];

  // 获取该评审专家的回避列表
  const exclusionsRes = await db.collection('review_exclusions')
    .where({ sessionId: session._id, reviewerInvitationId: reviewer._id })
    .get();
  const excludedProjectKeys = new Set((exclusionsRes.data || []).map(e => e.projectKey));

  // 获取该评审专家已有的评审记录
  const reviewsRes = await db.collection('reviews')
    .where({ sessionId: session._id, reviewerId: reviewer._id })
    .get();
  const reviewMap = {};
  (reviewsRes.data || []).forEach(r => { reviewMap[r.projectId] = r; });

  // 过滤并组装
  const projects = [];
  for (const p of allProjects) {
    if (excludedProjectKeys.has(p.projectId || p._id)) continue;

    const existingReview = reviewMap[p.projectId || p._id];
    projects.push({
      ...p,
      recused: excludedProjectKeys.has(p.projectId || p._id),
      reviewStatus: existingReview ? existingReview.status : null,
      myScore: existingReview ? existingReview.totalScore : null,
      myGrade: existingReview ? existingReview.grade : null,
    });
  }

  return { ok: true, data: projects };
}

/**
 * getMyReview(sessionId, projectId)
 * 获取评审专家对某个项目的评审记录
 */
async function getMyReview(reviewer, session, { projectId }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };

  // 检查回避
  const exclusion = await db.collection('review_exclusions').where({
    sessionId: session._id, reviewerInvitationId: reviewer._id,
    projectKey: projectId,
  }).get();
  if (exclusion.data && exclusion.data.length > 0) {
    return { ok: false, code: 'PROJECT_RECUSED', message: '该项目您已回避' };
  }

  const reviewId = `${session._id}_${projectId}_${reviewer._id}`;
  try {
    const res = await db.collection('reviews').doc(reviewId).get();
    return { ok: true, data: res.data || null };
  } catch (e) {
    return { ok: true, data: null };
  }
}

/**
 * saveMyReviewDraft({ sessionId, projectId, scores, comments, recommendedFunding, fundingComment })
 * 保存评审草稿（不校验完整性，允许部分填写）
 */
async function saveMyReviewDraft(reviewer, session, data) {
  const { projectId, scores, comments, recommendedFunding, fundingComment } = data;
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };

  if (session.status !== 'open') {
    return { ok: false, code: 'SESSION_NOT_OPEN', message: '评审场次未开放' };
  }

  // 检查回避
  const exclusion = await db.collection('review_exclusions').where({
    sessionId: session._id, reviewerInvitationId: reviewer._id, projectKey: projectId,
  }).get();
  if (exclusion.data && exclusion.data.length > 0) {
    return { ok: false, code: 'PROJECT_RECUSED', message: '该项目您已回避' };
  }

  // 检查项目存在
  let project;
  try {
    project = (await db.collection('session_projects').doc(projectId).get()).data;
  } catch (e) {
    return { ok: false, code: 'PROJECT_NOT_FOUND', message: '项目不存在' };
  }
  if (!project || project.status === 'removed') {
    return { ok: false, code: 'PROJECT_NOT_FOUND', message: '项目不存在' };
  }

  // 检查截止时间
  if (session.deadline && Date.now() > new Date(session.deadline).getTime()) {
    return { ok: false, code: 'DEADLINE_EXPIRED', message: '已超过评审截止时间' };
  }

  const reviewId = `${session._id}_${projectId}_${reviewer._id}`;
  const now = db.serverDate();

  let existingVersion = 1, existingCreatedAt = now;
  try {
    const existing = await db.collection('reviews').doc(reviewId).get();
    existingVersion = (existing.data && existing.data.version) || 1;
    existingCreatedAt = existing.data ? existing.data.createdAt : now;
  } catch (e) { /* 首次创建 */ }

  const doc = {
    _id: reviewId,
    sessionId: session._id,
    projectId,
    reviewerId: reviewer._id,
    reviewerNameSnapshot: reviewer.reviewerName,
    scores: scores || {},
    totalScore: 0,
    grade: '',
    comments: (comments || '').trim(),
    recommendedFunding: Number(recommendedFunding) || 0,
    fundingComment: (fundingComment || '').trim(),
    status: 'draft',
    version: existingVersion,
    submittedAt: null,
    updatedAt: now,
    createdAt: existingCreatedAt,
  };

  await db.collection('reviews').doc(reviewId).set({ data: doc });
  return { ok: true, data: doc };
}

/**
 * submitMyReview({ sessionId, projectId, scores, comments, recommendedFunding, fundingComment })
 * 提交评审（可覆盖已有提交）
 * 规则：draft → submitted，already submitted → 覆盖（version++）
 */
async function submitMyReview(reviewer, session, data) {
  const { projectId, scores, comments, recommendedFunding, fundingComment } = data;
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };

  if (session.status !== 'open') {
    return { ok: false, code: 'SESSION_NOT_OPEN', message: '评审场次未开放' };
  }

  // 检查锁定状态（已有评审且为 locked 状态）
  const reviewId = `${session._id}_${projectId}_${reviewer._id}`;
  let existingReview = null;
  try {
    existingReview = (await db.collection('reviews').doc(reviewId).get()).data;
  } catch (e) { /* 首次提交 */ }
  if (existingReview && existingReview.status === 'locked') {
    return { ok: false, code: 'REVIEW_LOCKED', message: '评审已锁定，无法修改' };
  }

  // 检查回避
  const exclusion = await db.collection('review_exclusions').where({
    sessionId: session._id, reviewerInvitationId: reviewer._id, projectKey: projectId,
  }).get();
  if (exclusion.data && exclusion.data.length > 0) {
    return { ok: false, code: 'PROJECT_RECUSED', message: '该项目您已回避' };
  }

  // 检查项目存在
  let project;
  try {
    project = (await db.collection('session_projects').doc(projectId).get()).data;
  } catch (e) {
    return { ok: false, code: 'PROJECT_NOT_FOUND', message: '项目不存在' };
  }
  if (!project || project.status === 'removed') {
    return { ok: false, code: 'PROJECT_NOT_FOUND', message: '项目不存在' };
  }

  // 检查截止时间
  if (session.deadline && Date.now() > new Date(session.deadline).getTime()) {
    return { ok: false, code: 'DEADLINE_EXPIRED', message: '已超过评审截止时间' };
  }

  // 校验评分
  const calc = validateAndCalculate(scores);
  if (!calc.ok) return { ok: false, code: 'INVALID_SCORE', message: calc.error };

  // 评审意见必填
  if (!comments || !comments.trim()) {
    return { ok: false, code: 'COMMENTS_REQUIRED', message: '评审意见不能为空' };
  }

  const funding = Number(recommendedFunding);
  if (isNaN(funding) || funding < 0) {
    return { ok: false, code: 'INVALID_FUNDING', message: '建议经费需为合法非负数字' };
  }

  const now = db.serverDate();
  const newVersion = existingReview ? (existingReview.version || 1) + 1 : 1;
  const createdAt = existingReview ? existingReview.createdAt : now;

  const doc = {
    _id: reviewId,
    sessionId: session._id,
    projectId,
    reviewerId: reviewer._id,
    reviewerNameSnapshot: reviewer.reviewerName,
    scores,
    totalScore: calc.totalScore,
    grade: calc.grade,
    comments: comments.trim(),
    recommendedFunding: funding,
    fundingComment: (fundingComment || '').trim(),
    status: 'submitted',
    version: newVersion,
    submittedAt: now,
    updatedAt: now,
    createdAt,
  };

  await db.collection('reviews').doc(reviewId).set({ data: doc });
  await log(db, { _id: reviewer._id, name: reviewer.reviewerName },
    existingReview ? 'RESUBMIT_REVIEW' : 'SUBMIT_REVIEW', 'review', reviewId, existingReview, doc);

  return { ok: true, data: doc };
}

// ═══════════════════════════════════════════════════════════════
//  旧版项目管理（保持兼容）
// ═══════════════════════════════════════════════════════════════

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
  const doc = {
    name: project.name.trim(),
    institution: (project.institution || '').trim(),
    leader: (project.leader || '').trim(),
    description: (project.description || '').trim(),
    status: 'active',
    createdBy: user._id,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
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

// ═══════════════════════════════════════════════════════════════
//  旧版用户管理（保持兼容）
// ═══════════════════════════════════════════════════════════════

async function adminListUsers(user) {
  const res = await db.collection('users').where({ status: _.neq('terminated') }).get();
  return { ok: true, data: res.data };
}

async function adminCreateOrBindUser(user, { userData }) {
  if (!userData || !userData.name) return { ok: false, code: 'INVALID_PARAM', message: '缺少用户姓名' };
  if (userData.openid) {
    const existing = await db.collection('users').where({ openid: userData.openid }).get();
    if (existing.data && existing.data.length > 0) {
      const u = existing.data[0];
      const patch = {
        name: userData.name || u.name, role: userData.role || u.role,
        organization: userData.organization || u.organization || '',
        title: userData.title || u.title || '', updatedAt: db.serverDate(),
      };
      if (!u.openid) patch.openid = userData.openid;
      await db.collection('users').doc(u._id).update({ data: patch });
      await log(db, user, 'UPDATE_USER', 'user', u._id, u, patch);
      return { ok: true, data: { ...u, ...patch } };
    }
  }
  const doc = {
    openid: (userData.openid || '').trim(), name: (userData.name || '').trim(),
    role: userData.role || 'expert', organization: (userData.organization || '').trim(),
    title: (userData.title || '').trim(), phone: (userData.phone || '').trim(),
    bindingStatus: userData.openid ? 'bound' : 'pending', status: 'active',
    createdAt: db.serverDate(), updatedAt: db.serverDate(),
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

// ═══════════════════════════════════════════════════════════════
//  新版场次管理
// ═══════════════════════════════════════════════════════════════

async function adminListSessions(user) {
  const res = await db.collection('review_sessions').orderBy('createdAt', 'desc').get();
  return { ok: true, data: res.data };
}

async function adminGetSession(user, { sessionId }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };
  const res = await db.collection('review_sessions').doc(sessionId).get();
  return { ok: true, data: res.data };
}

async function adminCreateSession(user, { session }) {
  if (!session || !session.name) return { ok: false, code: 'INVALID_PARAM', message: '场次名称不能为空' };
  const doc = {
    name: session.name.trim(),
    eventDate: session.eventDate || null,
    startTime: session.startTime || null,
    deadline: session.deadline ? new Date(session.deadline) : null,
    status: 'draft',
    createdBy: user._id,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
    closedAt: null,
  };
  const res = await db.collection('review_sessions').add({ data: doc });
  await log(db, user, 'CREATE_SESSION', 'review_session', res._id, null, doc);
  return { ok: true, data: { ...doc, _id: res._id } };
}

async function adminUpdateSession(user, { sessionId, updates }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };
  const before = await db.collection('review_sessions').doc(sessionId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };
  if (before.data.status === 'closed') return { ok: false, code: 'SESSION_CLOSED', message: '已关闭场次不可修改' };
  const allowed = { name: 1, eventDate: 1, startTime: 1, deadline: 1 };
  const patch = { updatedAt: db.serverDate() };
  for (const k of Object.keys(updates || {})) {
    if (allowed[k]) {
      patch[k] = (k === 'deadline')
        ? (updates[k] ? new Date(updates[k]) : null)
        : (updates[k] || '').trim();
    }
  }
  await db.collection('review_sessions').doc(sessionId).update({ data: patch });
  await log(db, user, 'UPDATE_SESSION', 'review_session', sessionId, before.data, { ...before.data, ...patch });
  return { ok: true, data: { ...before.data, ...patch } };
}

async function adminOpenSession(user, { sessionId }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };
  const before = await db.collection('review_sessions').doc(sessionId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };
  if (before.data.status === 'open') return { ok: false, code: 'ALREADY_OPEN', message: '场次已开启' };
  if (before.data.status !== 'draft') return { ok: false, code: 'INVALID_STATUS', message: '只能从草稿状态开启场次' };

  // 检查截止日期
  if (before.data.deadline && Date.now() > new Date(before.data.deadline).getTime()) {
    return { ok: false, code: 'DEADLINE_PAST', message: '截止日期已过，请先修改截止日期' };
  }

  const patch = { status: 'open', updatedAt: db.serverDate() };
  await db.collection('review_sessions').doc(sessionId).update({ data: patch });
  await log(db, user, 'OPEN_SESSION', 'review_session', sessionId, before.data, { ...before.data, ...patch });
  return { ok: true, data: { ...before.data, ...patch } };
}

async function adminCloseSession(user, { sessionId }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };
  const before = await db.collection('review_sessions').doc(sessionId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };
  if (before.data.status === 'closed') return { ok: false, code: 'ALREADY_CLOSED', message: '场次已关闭' };
  if (before.data.status !== 'open') return { ok: false, code: 'INVALID_STATUS', message: '只能关闭已开启的场次' };

  const patch = { status: 'closed', closedAt: db.serverDate(), updatedAt: db.serverDate() };
  await db.collection('review_sessions').doc(sessionId).update({ data: patch });

  // 锁定该场次所有已提交的评审
  await db.collection('reviews').where({ sessionId, status: 'submitted' }).update({
    data: { status: 'locked', updatedAt: db.serverDate() },
  });
  // 锁定该场次所有草稿（标记为 closed_draft）
  await db.collection('reviews').where({ sessionId, status: 'draft' }).update({
    data: { status: 'locked', updatedAt: db.serverDate() },
  });

  await log(db, user, 'CLOSE_SESSION', 'review_session', sessionId, before.data, { ...before.data, ...patch });
  return { ok: true, data: { ...before.data, ...patch } };
}

// ═══════════════════════════════════════════════════════════════
//  新版场次项目管理
// ═══════════════════════════════════════════════════════════════

async function adminAddProject(user, { sessionId, project }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };
  if (!project || !project.name) return { ok: false, code: 'INVALID_PARAM', message: '项目名称不能为空' };

  const session = await db.collection('review_sessions').doc(sessionId).get();
  if (!session.data) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };
  if (session.data.status === 'closed') return { ok: false, code: 'SESSION_CLOSED', message: '已关闭场次不可添加项目' };

  // 计算下一个 order
  const maxOrderRes = await db.collection('session_projects')
    .where({ sessionId, status: _.neq('removed') })
    .orderBy('order', 'desc').limit(1).get();
  const nextOrder = (maxOrderRes.data && maxOrderRes.data.length > 0) ? (maxOrderRes.data[0].order || 0) + 1 : 1;

  const doc = {
    sessionId,
    projectId: project.projectId || null,  // 可关联全局 projects 表
    name: project.name.trim(),
    institution: (project.institution || '').trim(),
    leader: (project.leader || '').trim(),
    order: project.order || nextOrder,
    status: 'active',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
  const res = await db.collection('session_projects').add({ data: doc });
  await log(db, user, 'ADD_PROJECT', 'session_project', res._id, null, doc);
  return { ok: true, data: { ...doc, _id: res._id } };
}

async function adminImportProjects(user, { sessionId, projects }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };
  if (!projects || !Array.isArray(projects) || projects.length === 0) {
    return { ok: false, code: 'INVALID_PARAM', message: '项目列表不能为空' };
  }

  const session = await db.collection('review_sessions').doc(sessionId).get();
  if (!session.data) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };
  if (session.data.status === 'closed') return { ok: false, code: 'SESSION_CLOSED', message: '已关闭场次不可添加项目' };

  const maxOrderRes = await db.collection('session_projects')
    .where({ sessionId, status: _.neq('removed') })
    .orderBy('order', 'desc').limit(1).get();
  let nextOrder = (maxOrderRes.data && maxOrderRes.data.length > 0) ? (maxOrderRes.data[0].order || 0) + 1 : 1;

  const added = [];
  const now = db.serverDate();
  for (const p of projects) {
    if (!p.name) continue;
    const doc = {
      sessionId,
      projectId: p.projectId || null,
      name: p.name.trim(),
      institution: (p.institution || '').trim(),
      leader: (p.leader || '').trim(),
      order: p.order || nextOrder++,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const res = await db.collection('session_projects').add({ data: doc });
    added.push({ ...doc, _id: res._id });
  }
  await log(db, user, 'IMPORT_PROJECTS', 'session_project', sessionId, null, { count: added.length });
  return { ok: true, data: added, message: `成功导入 ${added.length} 个项目` };
}

async function adminUpdateProjectInSession(user, { projectId, updates }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };
  const before = await db.collection('session_projects').doc(projectId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
  const allowed = { name: 1, institution: 1, leader: 1, order: 1 };
  const patch = { updatedAt: db.serverDate() };
  for (const k of Object.keys(updates || {})) {
    if (allowed[k]) patch[k] = typeof updates[k] === 'string' ? updates[k].trim() : updates[k];
  }
  await db.collection('session_projects').doc(projectId).update({ data: patch });
  await log(db, user, 'UPDATE_PROJECT_SESSION', 'session_project', projectId, before.data, { ...before.data, ...patch });
  return { ok: true, data: { ...before.data, ...patch } };
}

async function adminRemoveProject(user, { projectId, reason }) {
  if (!projectId) return { ok: false, code: 'INVALID_PARAM', message: '缺少项目ID' };
  const before = await db.collection('session_projects').doc(projectId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
  const patch = { status: 'removed', updatedAt: db.serverDate() };
  await db.collection('session_projects').doc(projectId).update({ data: patch });
  await log(db, user, 'REMOVE_PROJECT', 'session_project', projectId, before.data, patch, reason);
  return { ok: true, message: '项目已移除' };
}

// ═══════════════════════════════════════════════════════════════
//  新版评审专家管理
// ═══════════════════════════════════════════════════════════════

async function adminListReviewers(user, { sessionId }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };
  const res = await db.collection('reviewer_invitations')
    .where({ sessionId, status: _.neq('terminated') })
    .orderBy('createdAt', 'desc')
    .get();
  return { ok: true, data: res.data };
}

async function adminAddReviewer(user, { sessionId, reviewer }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };
  if (!reviewer || !reviewer.reviewerName) return { ok: false, code: 'INVALID_PARAM', message: '评审专家姓名不能为空' };

  const session = await db.collection('review_sessions').doc(sessionId).get();
  if (!session.data) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };

  const now = db.serverDate();
  const doc = {
    sessionId,
    reviewerName: reviewer.reviewerName.trim(),
    organization: (reviewer.organization || '').trim(),
    title: (reviewer.title || '').trim(),
    token: '',  // 占位，写入后再设置为 _id
    boundOpenid: '',
    bindingStatus: 'pending',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    boundAt: null,
  };

  const res = await db.collection('reviewer_invitations').add({ data: doc });
  // 写入后设置 token = _id（初次）
  await db.collection('reviewer_invitations').doc(res._id).update({
    data: { token: res._id },
  });

  const finalDoc = { ...doc, _id: res._id, token: res._id };
  await log(db, user, 'ADD_REVIEWER', 'reviewer_invitation', res._id, null, finalDoc);
  return { ok: true, data: finalDoc };
}

/**
 * adminGenerateQR({ invitationId })
 * 生成小程序码，scene 参数为邀请 token
 * 返回小程序码的 cloudID 或 buffer
 */
async function adminGenerateQR(user, { invitationId }) {
  if (!invitationId) return { ok: false, code: 'INVALID_PARAM', message: '缺少邀请ID' };

  const inv = await db.collection('reviewer_invitations').doc(invitationId).get();
  if (!inv.data) return { ok: false, code: 'NOT_FOUND', message: '邀请不存在' };
  if (inv.data.status !== 'active') return { ok: false, code: 'INVITATION_DISABLED', message: '邀请已禁用' };

  try {
    const qrResult = await cloud.openapi.wxacode.getUnlimited({
      scene: inv.data.token,
      page: 'pages/review/review',  // 评审页面路径
      width: 280,
      checkPath: false,
      envVersion: 'release',
    });

    // 上传到云存储并返回 fileID
    const uploadResult = await cloud.uploadFile({
      cloudPath: `qrcodes/${inv.data.sessionId}/${invitationId}.png`,
      fileContent: qrResult.buffer,
    });

    return { ok: true, data: { fileID: uploadResult.fileID, token: inv.data.token } };
  } catch (e) {
    console.error('生成二维码失败:', e);

    // 如果没有 wxacode 权限，降级为仅返回 token
    return {
      ok: true,
      data: {
        token: inv.data.token,
        reviewerName: inv.data.reviewerName,
        note: '二维码生成需要小程序码权限，当前仅返回令牌',
      },
    };
  }
}

/**
 * adminResetBinding({ invitationId, reason })
 * 重置评审专家的 OPENID 绑定状态 → pending
 */
async function adminResetBinding(user, { invitationId, reason }) {
  if (!invitationId) return { ok: false, code: 'INVALID_PARAM', message: '缺少邀请ID' };
  const before = await db.collection('reviewer_invitations').doc(invitationId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '邀请不存在' };

  const patch = {
    bindingStatus: 'pending',
    boundOpenid: '',
    boundAt: null,
    updatedAt: db.serverDate(),
  };
  await db.collection('reviewer_invitations').doc(invitationId).update({ data: patch });
  await log(db, user, 'RESET_BINDING', 'reviewer_invitation', invitationId, before.data, { ...before.data, ...patch }, reason);
  return { ok: true, data: { ...before.data, ...patch } };
}

/**
 * adminRegenerateToken({ invitationId })
 * 重新生成邀请 token（用于邀请链接泄露后重置）
 */
async function adminRegenerateToken(user, { invitationId }) {
  if (!invitationId) return { ok: false, code: 'INVALID_PARAM', message: '缺少邀请ID' };
  const before = await db.collection('reviewer_invitations').doc(invitationId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '邀请不存在' };

  // 生成新 token（暂时使用微信云数据库的 ObjectId 作为随机串）
  const { getNewId } = require('./lib/id');
  const newToken = getNewId();

  const patch = {
    token: newToken,
    updatedAt: db.serverDate(),
  };
  await db.collection('reviewer_invitations').doc(invitationId).update({ data: patch });
  await log(db, user, 'REGENERATE_TOKEN', 'reviewer_invitation', invitationId, before.data, { ...before.data, ...patch });

  return { ok: true, data: { ...before.data, ...patch } };
}

async function adminDisableReviewer(user, { invitationId, reason }) {
  if (!invitationId) return { ok: false, code: 'INVALID_PARAM', message: '缺少邀请ID' };
  const before = await db.collection('reviewer_invitations').doc(invitationId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '邀请不存在' };
  const patch = { status: 'disabled', updatedAt: db.serverDate() };
  await db.collection('reviewer_invitations').doc(invitationId).update({ data: patch });
  await log(db, user, 'DISABLE_REVIEWER', 'reviewer_invitation', invitationId, before.data, patch, reason);
  return { ok: true, data: { ...before.data, ...patch } };
}

async function adminEnableReviewer(user, { invitationId }) {
  if (!invitationId) return { ok: false, code: 'INVALID_PARAM', message: '缺少邀请ID' };
  const before = await db.collection('reviewer_invitations').doc(invitationId).get();
  if (!before.data) return { ok: false, code: 'NOT_FOUND', message: '邀请不存在' };
  const patch = { status: 'active', updatedAt: db.serverDate() };
  await db.collection('reviewer_invitations').doc(invitationId).update({ data: patch });
  await log(db, user, 'ENABLE_REVIEWER', 'reviewer_invitation', invitationId, before.data, patch);
  return { ok: true, data: { ...before.data, ...patch } };
}

// ═══════════════════════════════════════════════════════════════
//  新版回避管理
// ═══════════════════════════════════════════════════════════════

async function adminListRecusals(user, { sessionId }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };
  const res = await db.collection('review_exclusions').where({ sessionId }).get();
  return { ok: true, data: res.data };
}

/**
 * adminSetRecusal({ sessionId, projectKey, reviewerInvitationId, reason })
 * 设置评审专家对某个项目的回避
 */
async function adminSetRecusal(user, { sessionId, projectKey, reviewerInvitationId, reason }) {
  if (!sessionId || !projectKey || !reviewerInvitationId) {
    return { ok: false, code: 'INVALID_PARAM', message: '缺少必要参数' };
  }

  // 检查场次
  const session = await db.collection('review_sessions').doc(sessionId).get();
  if (!session.data) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };

  // 检查评审专家
  const reviewer = await db.collection('reviewer_invitations').doc(reviewerInvitationId).get();
  if (!reviewer.data) return { ok: false, code: 'NOT_FOUND', message: '评审专家不存在' };

  // 幂等检查
  const existing = await db.collection('review_exclusions').where({
    sessionId, projectKey, reviewerInvitationId,
  }).get();
  if (existing.data && existing.data.length > 0) {
    return { ok: false, code: 'ALREADY_RECUSED', message: '该回避关系已存在' };
  }

  const doc = {
    sessionId,
    projectKey,
    reviewerInvitationId,
    reason: reason || '',
    createdAt: db.serverDate(),
  };
  const res = await db.collection('review_exclusions').add({ data: doc });
  await log(db, user, 'SET_RECUSAL', 'review_exclusion', res._id, null, doc);
  return { ok: true, data: { ...doc, _id: res._id } };
}

/**
 * adminRemoveRecusal({ sessionId, projectKey, reviewerInvitationId })
 * 移除回避关系
 */
async function adminRemoveRecusal(user, { sessionId, projectKey, reviewerInvitationId }) {
  if (!sessionId || !projectKey || !reviewerInvitationId) {
    return { ok: false, code: 'INVALID_PARAM', message: '缺少必要参数' };
  }

  const existing = await db.collection('review_exclusions').where({
    sessionId, projectKey, reviewerInvitationId,
  }).get();
  if (!existing.data || existing.data.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: '回避关系不存在' };
  }

  const recusal = existing.data[0];
  await db.collection('review_exclusions').doc(recusal._id).remove();
  await log(db, user, 'REMOVE_RECUSAL', 'review_exclusion', recusal._id, recusal, null);
  return { ok: true, message: '回避已移除' };
}

// ═══════════════════════════════════════════════════════════════
//  新版评审解锁
// ═══════════════════════════════════════════════════════════════

/**
 * adminUnlockReview({ reviewId, reason })
 * 管理员解锁单个评审（如评审专家需要修改已锁定的评审）
 */
async function adminUnlockReview(user, { reviewId, reason }) {
  if (!reviewId) return { ok: false, code: 'INVALID_PARAM', message: '缺少评审ID' };
  if (!reason) return { ok: false, code: 'REASON_REQUIRED', message: '解锁需要填写原因' };

  let before;
  try {
    before = (await db.collection('reviews').doc(reviewId).get()).data;
  } catch (e) {
    return { ok: false, code: 'NOT_FOUND', message: '评审记录不存在' };
  }

  if (before.status !== 'locked') {
    return { ok: false, code: 'NOT_LOCKED', message: '该评审未锁定' };
  }

  // 检查场次状态（解锁时需要场次为 open）
  const session = await db.collection('review_sessions').doc(before.sessionId).get();
  if (!session.data) return { ok: false, code: 'SESSION_NOT_FOUND', message: '场次不存在' };
  if (session.data.status !== 'open') {
    return { ok: false, code: 'SESSION_NOT_OPEN', message: '场次未开启，无法解锁评审' };
  }

  const patch = {
    status: 'submitted',
    unlockReason: reason,
    unlockedAt: db.serverDate(),
    unlockedBy: user._id,
    updatedAt: db.serverDate(),
  };
  await db.collection('reviews').doc(reviewId).update({ data: patch });
  await log(db, user, 'UNLOCK_REVIEW', 'review', reviewId, before, { ...before, ...patch }, reason);
  return { ok: true, data: { ...before, ...patch } };
}

// ═══════════════════════════════════════════════════════════════
//  新版进度统计
// ═══════════════════════════════════════════════════════════════

/**
 * adminGetSessionProgress({ sessionId })
 * 返回场次评审进度：
 *   - perProject: 每个项目的 submitted/total 评审数
 *   - perReviewer: 每个评审专家的 scored/total 项目数
 */
async function adminGetSessionProgress(user, { sessionId }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };

  // 获取所有项目
  const projectsRes = await db.collection('session_projects')
    .where({ sessionId, status: _.neq('removed') }).get();
  const projects = projectsRes.data || [];

  // 获取所有活跃评审专家
  const reviewersRes = await db.collection('reviewer_invitations')
    .where({ sessionId, status: 'active' }).get();
  const reviewers = reviewersRes.data || [];

  // 获取所有评审记录
  const reviewsRes = await db.collection('reviews')
    .where({ sessionId }).get();
  const reviews = reviewsRes.data || [];

  // 获取所有回避
  const exclusionsRes = await db.collection('review_exclusions')
    .where({ sessionId }).get();
  const exclusions = exclusionsRes.data || [];

  // 建立回避索引: key = `${reviewerInvitationId}_${projectKey}`
  const exclusionSet = new Set(exclusions.map(e => `${e.reviewerInvitationId}_${e.projectKey}`));

  // 建立评审索引: key = `${projectId}_${reviewerId}` → review
  const reviewMap = {};
  reviews.forEach(r => {
    reviewMap[`${r.projectId}_${r.reviewerId}`] = r;
  });

  // 计算每个项目的进度
  const perProject = projects.map(p => {
    let submitted = 0;
    const eligibleReviewers = [];

    for (const rv of reviewers) {
      if (exclusionSet.has(`${rv._id}_${p._id}`)) continue; // 回避
      eligibleReviewers.push(rv._id);
      const review = reviewMap[`${p._id}_${rv._id}`];
      if (review && ['submitted', 'locked'].includes(review.status)) {
        submitted++;
      }
    }

    return {
      projectId: p._id,
      projectName: p.name,
      institution: p.institution || '',
      leader: p.leader || '',
      totalReviewers: eligibleReviewers.length,
      submittedCount: submitted,
      completionRate: eligibleReviewers.length > 0
        ? `${Math.round((submitted / eligibleReviewers.length) * 100)}%`
        : 'N/A',
      isComplete: eligibleReviewers.length > 0 && submitted === eligibleReviewers.length,
    };
  });

  // 计算每个评审专家的进度
  const perReviewer = reviewers.map(rv => {
    let scored = 0;
    const eligibleProjects = [];

    for (const p of projects) {
      if (exclusionSet.has(`${rv._id}_${p._id}`)) continue;
      eligibleProjects.push(p._id);
      const review = reviewMap[`${p._id}_${rv._id}`];
      if (review && ['submitted', 'locked'].includes(review.status)) {
        scored++;
      }
    }

    return {
      reviewerId: rv._id,
      reviewerName: rv.reviewerName,
      organization: rv.organization || '',
      bindingStatus: rv.bindingStatus,
      totalProjects: eligibleProjects.length,
      scoredCount: scored,
      completionRate: eligibleProjects.length > 0
        ? `${Math.round((scored / eligibleProjects.length) * 100)}%`
        : 'N/A',
      isComplete: eligibleProjects.length > 0 && scored === eligibleProjects.length,
    };
  });

  return {
    ok: true,
    data: {
      sessionId,
      totalProjects: projects.length,
      totalReviewers: reviewers.length,
      totalExclusions: exclusions.length,
      totalReviews: reviews.length,
      submittedReviews: reviews.filter(r => ['submitted', 'locked'].includes(r.status)).length,
      perProject,
      perReviewer,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  新版汇总排名
// ═══════════════════════════════════════════════════════════════

/**
 * adminGetSummary({ sessionId })
 * 返回场次内的项目排名
 */
async function adminGetSummary(user, { sessionId }) {
  if (!sessionId) return { ok: false, code: 'INVALID_PARAM', message: '缺少场次ID' };

  const session = await db.collection('review_sessions').doc(sessionId).get();
  if (!session.data) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };

  // 获取所有项目
  const projectsRes = await db.collection('session_projects')
    .where({ sessionId, status: _.neq('removed') }).get();
  const projects = projectsRes.data || [];

  // 获取所有评审记录（只统计已提交和已锁定的）
  const reviewsRes = await db.collection('reviews')
    .where({ sessionId, status: _.in(['submitted', 'locked']) }).get();
  const reviews = reviewsRes.data || [];

  // 获取所有活跃评审专家
  const reviewersRes = await db.collection('reviewer_invitations')
    .where({ sessionId, status: 'active' }).get();
  const reviewers = reviewersRes.data || [];

  // 获取所有回避
  const exclusionsRes = await db.collection('review_exclusions')
    .where({ sessionId }).get();
  const exclusions = exclusionsRes.data || [];
  const exclusionSet = new Set(exclusions.map(e => `${e.reviewerInvitationId}_${e.projectKey}`));

  // 计算每个项目的有效评审人数（排除回避）
  const eligibleCountByProject = {};
  for (const p of projects) {
    let count = 0;
    for (const rv of reviewers) {
      if (!exclusionSet.has(`${rv._id}_${p._id}`)) count++;
    }
    eligibleCountByProject[p._id] = count;
  }

  // 按项目聚合评分
  const reviewByProject = {};
  const fundingByProject = {};
  reviews.forEach(r => {
    if (!reviewByProject[r.projectId]) reviewByProject[r.projectId] = [];
    reviewByProject[r.projectId].push(r.totalScore);
    if (!fundingByProject[r.projectId]) fundingByProject[r.projectId] = [];
    fundingByProject[r.projectId].push(Number(r.recommendedFunding) || 0);
  });

  const isClosed = session.data.status === 'closed';
  const rankings = [];

  for (const project of projects) {
    const pid = project._id;
    const eligibleCount = eligibleCountByProject[pid] || 0;
    const scores = reviewByProject[pid] || [];
    const fundings = fundingByProject[pid] || [];

    let reviewStatus;
    if (eligibleCount === 0) reviewStatus = '无评审专家';
    else if (scores.length === 0) reviewStatus = '待评审';
    else if (scores.length < eligibleCount) reviewStatus = '评审中';
    else reviewStatus = isClosed ? '已关闭' : '已完成';

    if (scores.length === 0) {
      rankings.push({
        projectId: pid,
        projectName: project.name,
        institution: project.institution || '',
        leader: project.leader || '',
        avgScore: '-', median: '-', minScore: '-', maxScore: '-', range: '-',
        gradeLabel: '-', gradeColor: '#999', avgFunding: '-',
        reviewCount: 0, eligibleCount, reviewStatus,
        isFormalRanking: false,
      });
      continue;
    }

    const sorted = [...scores].sort((a, b) => a - b);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const mid = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const grade = getGrade(avg);
    const avgFunding = fundings.length > 0
      ? (fundings.reduce((a, b) => a + b, 0) / fundings.length).toFixed(2)
      : '-';

    rankings.push({
      projectId: pid,
      projectName: project.name,
      institution: project.institution || '',
      leader: project.leader || '',
      avgScore: avg.toFixed(1),
      median: mid.toFixed(1),
      minScore: sorted[0],
      maxScore: sorted[sorted.length - 1],
      range: (sorted[sorted.length - 1] - sorted[0]).toFixed(1),
      gradeLabel: grade.label,
      gradeColor: grade.color,
      avgFunding,
      reviewCount: scores.length,
      eligibleCount,
      reviewStatus,
      isFormalRanking: isClosed && scores.length === eligibleCount,
    });
  }

  // 按平均分降序排列
  rankings.sort((a, b) => {
    if (a.avgScore === '-') return 1;
    if (b.avgScore === '-') return -1;
    return parseFloat(b.avgScore) - parseFloat(a.avgScore);
  });
  rankings.forEach((r, i) => { r.rank = i + 1; });

  const allScores = rankings.filter(r => r.avgScore !== '-').map(r => parseFloat(r.avgScore));
  const avgAll = allScores.length > 0
    ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
    : '-';

  return {
    ok: true,
    data: {
      session: {
        _id: session.data._id,
        name: session.data.name,
        eventDate: session.data.eventDate,
        status: session.data.status,
      },
      isClosed,
      totalProjects: projects.length,
      totalReviewers: reviewers.length,
      totalReviews: reviews.length,
      avgScore: avgAll,
      rankings,
    },
  };
}
