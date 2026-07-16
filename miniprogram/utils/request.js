/**
 * 云函数调用统一封装 v1.0.2
 * - 环境配置接入
 * - 统一 error 抛出（ok=false 不再静默返回）
 * - DEBUG 模式使用相同业务规则
 */

// 环境配置接入
let envConfig;
try {
  envConfig = require('../config/env');
} catch (e) {
  envConfig = require('../config/env.example');
}

const DEBUG_MODE = envConfig.debugMode !== false;
const CLOUD_FUNC_NAME = envConfig.cloudFunctionName || 'reviewFunctions';

/**
 * 统一解包结果：ok=false 必须 throw
 */
function unwrapResult(result) {
  if (!result) throw new Error('服务无响应');
  if (!result.ok) {
    const error = new Error(result.message || '操作失败');
    error.code = result.code || 'BUSINESS_ERROR';
    error.result = result;
    throw error;
  }
  return result;
}

/**
 * 调用云函数（正式模式）
 */
async function callCloud(action, data, options) {
  const { showLoading, loadingText } = options;
  if (showLoading) wx.showLoading({ title: loadingText, mask: true });

  try {
    const res = await wx.cloud.callFunction({ name: CLOUD_FUNC_NAME, data: { action, data } });
    wx.hideLoading();
    if (!res.result) throw new Error('云函数无响应');
    return unwrapResult(res.result);
  } catch (err) {
    wx.hideLoading();
    if (err.code && err.code !== 'USER_NOT_FOUND') {
      wx.showToast({ title: err.message, icon: 'none', duration: 2000 });
    } else if (!err.code) {
      const msg = err.errMsg || err.message || '';
      if (msg.includes('-1') || msg.includes('fail')) {
        wx.showToast({ title: '网络异常，请检查网络', icon: 'none' });
      } else {
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      }
    }
    throw err;
  }
}

/**
 * 统一入口
 */
async function call(action, data = {}, options = {}) {
  const opts = { showLoading: true, loadingText: '加载中…', ...options };

  if (DEBUG_MODE) {
    const result = await localFallback(action, data);
    return unwrapResult(result);
  }

  return callCloud(action, data, opts);
}

// ═══════════════════ DEBUG 本地降级 ═══════════════════

const { MOCK_PROJECTS, MOCK_REVIEWERS, SCORING_DIMENSIONS } = require('./constants');
const { calcTotal, getGrade } = require('./scoring');

const debugData = { projects: null, reviewers: null, rounds: null, reviews: null, assignments: null };

function initDebugData() {
  if (!debugData.projects) {
    let p = wx.getStorageSync('cr_projects_all');
    if (!p || p.length === 0) {
      p = MOCK_PROJECTS.map(m => ({
        ...m, _id: m.id, description: '', status: 'active', createdBy: 'admin',
        reviewers: m.reviewers || [],
        assignedReviewers: (m.reviewers || []).map(rid => {
          const r = MOCK_REVIEWERS.find(x => x.id === rid);
          return r || { id: rid, name: rid, _id: rid };
        })
      }));
      wx.setStorageSync('cr_projects_all', p);
    }
    debugData.projects = p;
  }
  if (!debugData.reviewers) {
    let r = wx.getStorageSync('cr_reviewers_all');
    if (!r || r.length === 0) { r = [...MOCK_REVIEWERS]; wx.setStorageSync('cr_reviewers_all', r); }
    debugData.reviewers = r;
  }
  if (!debugData.rounds) {
    debugData.rounds = [{ _id: 'round_001', name: '第一批评审', roundNo: 1, status: 'open', startAt: Date.now(), deadline: null, closedAt: null, createdBy: 'admin', createdAt: Date.now(), updatedAt: Date.now() }];
  }
  if (!debugData.reviews) debugData.reviews = wx.getStorageSync('cr_reviews_all') || [];
  if (!debugData.assignments) {
    debugData.assignments = [];
    debugData.projects.forEach(p => {
      (p.reviewers || []).forEach(rid => {
        debugData.assignments.push({
          _id: `asgn_${p.id}_${rid}`, projectId: p.id, roundId: 'round_001', expertId: rid,
          status: debugData.reviews.some(r => r.projectId === p.id && r.expertId === rid) ? 'submitted' : 'assigned',
          assignedAt: Date.now(), updatedAt: Date.now()
        });
      });
    });
  }
}

// 与云端 buildSummary 一致的 DEBUG 汇总计算
function buildDebugSummary(projects, reviews, assignments, isClosed) {
  const aByP = {}, sByP = {};
  assignments.forEach(a => {
    if (a.status === 'removed') return;
    if (!aByP[a.projectId]) aByP[a.projectId] = { total: 0, submitted: 0 };
    aByP[a.projectId].total++;
    if (['submitted', 'resubmitted', 'locked'].includes(a.status)) aByP[a.projectId].submitted++;
  });
  const rByP = {}, fByP = {};
  reviews.forEach(r => {
    if (['invalidated'].includes(r.status)) return;
    if (!rByP[r.projectId]) rByP[r.projectId] = [];
    rByP[r.projectId].push(r.totalScore);
    if (!fByP[r.projectId]) fByP[r.projectId] = [];
    fByP[r.projectId].push(r.recommendedFunding || 0);
  });

  const rankings = [];
  for (const p of projects) {
    const pid = p._id;
    const ta = (aByP[pid] || { total: 0 }).total;
    const sc = (aByP[pid] || { submitted: 0 }).submitted;
    const scores = rByP[pid] || [];
    let status;
    if (ta === 0) status = '未分配';
    else if (sc === 0) status = '待开始';
    else if (sc < ta) status = '评审中';
    else status = isClosed ? '已关闭' : '已完成';

    if (scores.length === 0) {
      rankings.push({ projectId: pid, projectName: p.name, institution: p.institution || '', avgScore: '-', median: '-', minScore: '-', maxScore: '-', range: '-', gradeLabel: '-', gradeColor: '#999', avgFunding: '-', reviewCount: 0, totalAssignments: ta, submittedCount: sc, reviewStatus: status });
      continue;
    }
    const sorted = [...scores].sort((a, b) => a - b);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
    const grade = getGrade(avg);
    const fundings = fByP[pid] || [];
    const avgFund = fundings.length > 0 ? (fundings.reduce((a, b) => a + b, 0) / fundings.length).toFixed(2) : '-';
    rankings.push({ projectId: pid, projectName: p.name, institution: p.institution || '', avgScore: avg.toFixed(1), median: median.toFixed(1), minScore: sorted[0], maxScore: sorted[sorted.length - 1], range: (sorted[sorted.length - 1] - sorted[0]).toFixed(1), gradeLabel: grade.label, gradeColor: grade.color, avgFunding: avgFund, reviewCount: sc, totalAssignments: ta, submittedCount: sc, reviewStatus: status });
  }
  rankings.sort((a, b) => { if (a.avgScore === '-') return 1; if (b.avgScore === '-') return -1; return parseFloat(b.avgScore) - parseFloat(a.avgScore); });
  rankings.forEach((r, i) => { r.rank = i + 1; });
  const allScores = rankings.filter(r => r.avgScore !== '-').map(r => parseFloat(r.avgScore));
  return { totalProjects: projects.length, totalReviews: reviews.length, avgScore: allScores.length > 0 ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) : '-', rankings };
}

async function localFallback(action, data) {
  initDebugData();
  const app = getApp();
  const role = app.globalData.role;
  const rid = app.globalData.currentReviewerId;
  const rname = app.globalData.currentReviewerName;

  switch (action) {
    case 'getMyOpenid': return { ok: true, data: { openid: 'DEBUG_OPENID_' + (role === 'admin' ? 'admin' : rid) } };
    case 'getCurrentUser':
      if (role === 'admin') return { ok: true, data: { _id: 'admin_1', name: '管理员', role: 'admin', organization: '', title: '', status: 'active' } };
      return { ok: true, data: { _id: rid, name: rname, role: 'expert', organization: '', title: '', status: 'active' } };

    case 'adminListProjects': {
      const sum = buildDebugSummary(debugData.projects, debugData.reviews, debugData.assignments, false);
      const map = {}; sum.rankings.forEach(r => { map[r.projectId] = r; });
      return { ok: true, data: debugData.projects.map(p => ({ ...p, ...(map[p._id] || { reviewCount: 0, submittedCount: 0, totalAssignments: 0, reviewStatus: '未分配' }) })) };
    }

    case 'adminCreateProject': {
      const p = { _id: 'p' + Date.now(), name: data.project.name, institution: data.project.institution || '', leader: data.project.leader || '', description: data.project.description || '', status: 'active', createdBy: 'admin', reviewers: [], assignedReviewers: [], createdAt: Date.now(), updatedAt: Date.now() };
      debugData.projects.push(p); wx.setStorageSync('cr_projects_all', debugData.projects); return { ok: true, data: p };
    }

    case 'adminUpdateProject': {
      const idx = debugData.projects.findIndex(p => p._id === data.projectId);
      if (idx < 0) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
      ['name', 'institution', 'leader', 'description'].forEach(k => { if (data.updates && data.updates[k] !== undefined) debugData.projects[idx][k] = data.updates[k]; });
      wx.setStorageSync('cr_projects_all', debugData.projects); return { ok: true, data: debugData.projects[idx] };
    }

    case 'adminArchiveProject': {
      const idx = debugData.projects.findIndex(p => p._id === data.projectId);
      if (idx < 0) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
      debugData.projects[idx].status = 'archived'; wx.setStorageSync('cr_projects_all', debugData.projects); return { ok: true, data: debugData.projects[idx] };
    }

    case 'adminListUsers': {
      const users = debugData.reviewers.map(r => ({ _id: r.id, openid: r.id, name: r.name, role: 'expert', organization: '', title: '', bindingStatus: 'pending', status: 'active' }));
      users.unshift({ _id: 'admin_1', openid: 'admin_1', name: '管理员', role: 'admin', organization: '', title: '', bindingStatus: 'bound', status: 'active' });
      return { ok: true, data: users };
    }

    case 'adminCreateOrBindUser': {
      const newUser = { _id: data.userData.openid || 'r' + Date.now(), openid: data.userData.openid || '', name: data.userData.name, role: data.userData.role || 'expert', organization: data.userData.organization || '', title: data.userData.title || '', bindingStatus: data.userData.openid ? 'bound' : 'pending', status: 'active' };
      debugData.reviewers.push({ id: newUser._id, name: newUser.name });
      wx.setStorageSync('cr_reviewers_all', debugData.reviewers); return { ok: true, data: newUser };
    }

    case 'adminBindUserOpenid': {
      const u2 = debugData.reviewers.find(r => r.id === data.userId);
      if (u2) { u2.openid = data.openid; wx.setStorageSync('cr_reviewers_all', debugData.reviewers); }
      return { ok: true, data: { bindingStatus: 'bound' } };
    }

    case 'adminUnbindUserOpenid': {
      const u3 = debugData.reviewers.find(r => r.id === data.userId);
      if (u3) { u3.openid = ''; wx.setStorageSync('cr_reviewers_all', debugData.reviewers); }
      return { ok: true, data: { bindingStatus: 'pending' } };
    }

    case 'adminDisableUser': {
      const u = debugData.reviewers.find(r => r.id === data.userId);
      if (u) { const i = debugData.reviewers.indexOf(u); debugData.reviewers.splice(i, 1); wx.setStorageSync('cr_reviewers_all', debugData.reviewers); }
      return { ok: true, data: { status: 'disabled' } };
    }
    case 'adminEnableUser': return { ok: true, data: { status: 'active' } };

    case 'adminListReviewRounds': return { ok: true, data: debugData.rounds };

    case 'adminCreateReviewRound': {
      const rn = { _id: 'round_' + Date.now(), name: (data.round && data.round.name) || '新批次', roundNo: (data.round && data.round.roundNo) || 1, status: 'draft', startAt: null, deadline: (data.round && data.round.deadline) ? new Date(data.round.deadline).toISOString() : null, closedAt: null, createdBy: 'admin', createdAt: Date.now(), updatedAt: Date.now() };
      debugData.rounds.push(rn); return { ok: true, data: rn };
    }

    case 'adminUpdateReviewRound': {
      const rn2 = debugData.rounds.find(r => r._id === data.roundId);
      if (rn2) { if (data.updates.name) rn2.name = data.updates.name; if (data.updates.deadline !== undefined) rn2.deadline = data.updates.deadline ? new Date(data.updates.deadline).toISOString() : null; }
      return { ok: true, data: rn2 };
    }

    case 'adminOpenReviewRound': {
      const r = debugData.rounds.find(r => r._id === data.roundId);
      if (!r) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };
      if (r.status !== 'draft') return { ok: false, code: 'STATUS_ERROR', message: '只有草稿状态才能开启' };
      const hasAssignments = debugData.assignments.some(a => a.roundId === data.roundId);
      if (!hasAssignments) return { ok: false, code: 'NO_ASSIGNMENTS', message: '批次下没有指派，无法开启' };
      r.status = 'open'; r.startAt = Date.now(); return { ok: true, data: r };
    }

    case 'adminCloseReviewRound': {
      const rc = debugData.rounds.find(r => r._id === data.roundId);
      if (!rc) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };
      const asgns = debugData.assignments.filter(a => a.roundId === data.roundId && a.status !== 'removed');
      const submitted = asgns.filter(a => ['submitted', 'resubmitted', 'locked'].includes(a.status)).length;
      if (submitted < asgns.length) return { ok: false, code: 'UNFINISHED_ASSIGNMENTS', data: { total: asgns.length, completed: submitted, unfinished: asgns.length - submitted } };
      rc.status = 'closed'; rc.closedAt = Date.now(); return { ok: true, data: rc };
    }

    case 'adminForceCloseReviewRound': {
      const rf = debugData.rounds.find(r => r._id === data.roundId);
      if (!rf) return { ok: false, code: 'NOT_FOUND', message: '批次不存在' };
      rf.status = 'closed'; rf.closedAt = Date.now();
      debugData.assignments.forEach(a => { if (a.roundId === data.roundId && !['submitted', 'resubmitted', 'locked', 'removed'].includes(a.status)) a.status = 'closed_unsubmitted'; });
      debugData.reviews.forEach(r => { if (r.roundId === data.roundId && ['submitted', 'resubmitted'].includes(r.status)) r.status = 'locked'; });
      wx.setStorageSync('cr_reviews_all', debugData.reviews);
      return { ok: true, data: rf };
    }

    case 'adminListAssignments': {
      let list = debugData.assignments;
      if (data.roundId) list = list.filter(a => a.roundId === data.roundId);
      return { ok: true, data: list.filter(a => a.status !== 'removed') };
    }

    case 'adminAssignExpert': {
      const proj = debugData.projects.find(p => p._id === data.projectId);
      if (proj && proj.status === 'archived') return { ok: false, code: 'PROJECT_ARCHIVED', message: '项目已归档' };
      const aid = `asgn_${data.projectId}_${data.expertId}_${data.roundId || 'round_001'}`;
      if (debugData.assignments.find(a => a._id === aid)) return { ok: false, code: 'ALREADY_ASSIGNED', message: '该专家已分配' };
      const a = { _id: aid, projectId: data.projectId, roundId: data.roundId || 'round_001', expertId: data.expertId, status: 'assigned', assignedAt: Date.now(), updatedAt: Date.now() };
      debugData.assignments.push(a);
      if (proj && !proj.reviewers.includes(data.expertId)) {
        proj.reviewers.push(data.expertId);
        const rev = debugData.reviewers.find(r => r.id === data.expertId);
        proj.assignedReviewers.push(rev || { id: data.expertId, name: data.expertId });
        wx.setStorageSync('cr_projects_all', debugData.projects);
      }
      return { ok: true, data: a };
    }

    case 'adminRemoveAssignment': {
      const arm = debugData.assignments.find(a => a._id === data.assignmentId);
      if (arm) { arm.status = 'removed'; arm.removedAt = Date.now(); arm.removedReason = data.reason || ''; }
      const rev = debugData.reviews.find(r => r.assignmentId === data.assignmentId);
      if (rev) { rev.status = 'invalidated'; wx.setStorageSync('cr_reviews_all', debugData.reviews); }
      return { ok: true, message: '已移除' };
    }

    case 'adminReturnReview': {
      const rr = debugData.reviews.find(r => r._id === data.reviewId);
      if (rr) { rr.status = 'returned'; rr.returnReason = data.reason; wx.setStorageSync('cr_reviews_all', debugData.reviews); }
      return { ok: true, data: rr };
    }

    case 'adminGetProjectResult': {
      let revs = debugData.reviews.filter(r => r.projectId === data.projectId);
      if (data.roundId) revs = revs.filter(r => r.roundId === data.roundId);
      if (!data.includeNonFinal) revs = revs.filter(r => ['submitted', 'resubmitted', 'locked'].includes(r.status));
      return { ok: true, data: revs };
    }

    case 'adminGetSummary':
    case 'leaderGetSummary': {
      let ps = debugData.projects, rs = debugData.reviews, as = debugData.assignments;
      if (data.roundId) { ps = ps.filter(p => debugData.assignments.some(a => a.roundId === data.roundId && a.projectId === p._id)); as = as.filter(a => a.roundId === data.roundId); rs = rs.filter(r => r.roundId === data.roundId); }
      const round = data.roundId ? debugData.rounds.find(r => r._id === data.roundId) : null;
      return { ok: true, data: buildDebugSummary(ps, rs, as, round ? round.status === 'closed' : false) };
    }

    case 'leaderGetProjectResult': return await localFallback('adminGetProjectResult', data);

    case 'expertListProjects': return { ok: true, data: debugData.projects.filter(p => p.reviewers && p.reviewers.includes(rid)) };

    case 'expertGetProjectDetail': {
      const proj2 = debugData.projects.find(p => p._id === data.projectId);
      if (!proj2) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
      if (proj2.status === 'archived') return { ok: false, code: 'PROJECT_ARCHIVED', message: '项目已归档' };
      let asgn = debugData.assignments.find(a => a.projectId === data.projectId && a.expertId === rid);
      if (data.assignmentId) asgn = debugData.assignments.find(a => a._id === data.assignmentId && a.expertId === rid);
      if (!asgn) return { ok: false, code: 'NOT_ASSIGNED', message: '您未被分配到此项目' };
      const round = debugData.rounds.find(r => r._id === asgn.roundId) || null;
      return { ok: true, data: { project: proj2, assignment: asgn, currentRound: round } };
    }

    case 'expertListAssignments': {
      const myAsgns = debugData.assignments.filter(a => a.expertId === rid && a.status !== 'removed')
        .map(a => {
          const proj = debugData.projects.find(p => p._id === a.projectId);
          const rev = debugData.reviews.find(r => r.assignmentId === a._id);
          const round = debugData.rounds.find(r => r._id === a.roundId);
          return { ...a, project: proj || null, review: rev || null, round: round || null };
        });
      return { ok: true, data: myAsgns };
    }

    case 'expertGetMyReview':
    case 'expertGetReviewDraft': {
      const rev = debugData.reviews.find(r => r.assignmentId === data.assignmentId);
      return { ok: true, data: rev || null };
    }

    case 'expertSaveReviewDraft': {
      const aid2 = data.reviewData.assignmentId;
      const asgn2 = debugData.assignments.find(a => a._id === aid2);
      if (!asgn2) return { ok: false, code: 'NOT_FOUND', message: '指派不存在' };
      const proj3 = debugData.projects.find(p => p._id === asgn2.projectId);
      if (proj3 && proj3.status === 'archived') return { ok: false, code: 'PROJECT_ARCHIVED', message: '项目已归档' };
      const existing = debugData.reviews.find(r => r.assignmentId === aid2);
      const draft = { _id: existing ? existing._id : aid2, projectId: asgn2.projectId, roundId: asgn2.roundId, assignmentId: aid2, expertId: rid, expertName: rname, scores: data.reviewData.scores || {}, totalScore: 0, grade: '', comments: data.reviewData.comments || '', recommendedFunding: Number(data.reviewData.recommendedFunding) || 0, fundingComment: data.reviewData.fundingComment || '', status: 'draft', version: existing ? existing.version : 1, submittedAt: null, updatedAt: Date.now(), createdAt: existing ? existing.createdAt : Date.now() };
      if (existing) { const i = debugData.reviews.indexOf(existing); debugData.reviews[i] = draft; } else { debugData.reviews.push(draft); }
      asgn2.status = 'draft'; wx.setStorageSync('cr_reviews_all', debugData.reviews);
      return { ok: true, data: draft };
    }

    case 'expertSubmitReview': {
      const { assignmentId: aid3, scores, comments, recommendedFunding, fundingComment } = data;
      const asgn3 = debugData.assignments.find(a => a._id === aid3);
      if (!asgn3) return { ok: false, code: 'NOT_FOUND', message: '指派不存在' };
      const proj4 = debugData.projects.find(p => p._id === asgn3.projectId);
      if (proj4 && proj4.status === 'archived') return { ok: false, code: 'PROJECT_ARCHIVED', message: '项目已归档' };
      const done = debugData.reviews.find(r => r.assignmentId === aid3 && ['submitted', 'resubmitted', 'locked'].includes(r.status));
      if (done && asgn3.status !== 'returned') return { ok: false, code: 'ALREADY_SUBMITTED', message: '您已提交评审' };
      if (!scores || !comments) return { ok: false, code: 'INVALID_PARAM', message: '评分数据不完整' };
      if (!recommendedFunding && recommendedFunding !== 0 && recommendedFunding !== '0') return { ok: false, code: 'FUNDING_REQUIRED', message: '建议经费不能为空' };
      const funding = Number(recommendedFunding);
      if (isNaN(funding) || funding < 0) return { ok: false, code: 'INVALID_FUNDING', message: '建议经费需为合法非负数字' };
      if (funding === 0 && (!fundingComment || !fundingComment.trim())) return { ok: false, code: 'FUNDING_COMMENT_REQUIRED', message: '经费为0万元时请填写经费说明' };
      const calc = calcTotal(scores); const isRet = asgn3.status === 'returned';
      const existing = debugData.reviews.find(r => r.assignmentId === aid3);
      const review = { _id: existing ? existing._id : aid3, projectId: asgn3.projectId, roundId: asgn3.roundId, assignmentId: aid3, expertId: rid, expertName: rname, scores, totalScore: calc.totalScore, grade: calc.grade.label, comments: comments.trim(), recommendedFunding: funding, fundingComment: (fundingComment || '').trim(), status: isRet ? 'resubmitted' : 'submitted', version: isRet ? ((existing && existing.version) || 1) + 1 : 1, submittedAt: Date.now(), updatedAt: Date.now(), createdAt: existing ? existing.createdAt : Date.now() };
      if (existing) { const i = debugData.reviews.indexOf(existing); debugData.reviews[i] = review; } else { debugData.reviews.push(review); }
      asgn3.status = isRet ? 'resubmitted' : 'submitted'; wx.setStorageSync('cr_reviews_all', debugData.reviews);
      return { ok: true, data: review };
    }

    default:
      return { ok: false, code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` };
  }
}

module.exports = { call, DEBUG_MODE };
