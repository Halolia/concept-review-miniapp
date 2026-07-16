/**
 * 云函数调用统一封装
 * - 自动 loading
 * - 统一错误处理
 * - 支持 DEBUG 模式本地降级
 */

const DEBUG_MODE = true; // ⚠️ 云开发环境就绪后改为 false
const CLOUD_FUNC_NAME = 'reviewFunctions';

/**
 * 调用业务云函数
 * @param {string} action - 云函数动作名
 * @param {object} data - 请求参数（不含 role/expertId/openid）
 * @param {object} options
 * @returns {Promise<object>}
 */
async function call(action, data = {}, options = {}) {
  const { showLoading = true, loadingText = '加载中…' } = options;

  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true });
  }

  try {
    if (DEBUG_MODE) {
      wx.hideLoading();
      return await localFallback(action, data);
    }

    const res = await wx.cloud.callFunction({
      name: CLOUD_FUNC_NAME,
      data: { action, data }
    });

    wx.hideLoading();

    if (!res.result) {
      throw new Error('云函数无响应');
    }

    if (!res.result.ok) {
      const msg = res.result.message || '操作失败';
      if (res.result.code !== 'USER_NOT_FOUND') {
        wx.showToast({ title: msg, icon: 'none', duration: 2000 });
      }
      return res.result;
    }

    return res.result;
  } catch (err) {
    wx.hideLoading();
    console.error(`[${action}] 调用失败:`, err);

    const errMsg = err.errMsg || err.message || '';

    if (errMsg.includes('-1') || errMsg.includes('fail')) {
      wx.showToast({ title: '网络异常，请检查网络', icon: 'none' });
    } else if (err.errCode === -502001) {
      wx.showToast({ title: '数据库异常', icon: 'none' });
    } else {
      wx.showToast({ title: err.message || '操作失败', icon: 'none', duration: 2000 });
    }

    throw err;
  }
}

/**
 * DEBUG 模式：使用本地 localStorage 降级实现
 */
const { MOCK_PROJECTS, MOCK_REVIEWERS, SCORING_DIMENSIONS } = require('./constants');
const { calcTotal, getGrade } = require('./scoring');

const debugData = {
  projects: null,
  reviewers: null,
  rounds: null,
  reviews: null,
  assignments: null
};

function initDebugData() {
  // 项目
  if (!debugData.projects) {
    let p = wx.getStorageSync('cr_projects_all');
    if (!p || p.length === 0) {
      p = MOCK_PROJECTS.map(m => ({
        ...m,
        _id: m.id,
        description: '',
        status: 'active',
        createdBy: 'admin',
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

  // 评委（用户）
  if (!debugData.reviewers) {
    let r = wx.getStorageSync('cr_reviewers_all');
    if (!r || r.length === 0) {
      r = [...MOCK_REVIEWERS];
      wx.setStorageSync('cr_reviewers_all', r);
    }
    debugData.reviewers = r;
  }

  // 评审批次
  if (!debugData.rounds) {
    debugData.rounds = [{
      _id: 'round_001',
      name: '第一批评审',
      roundNo: 1,
      status: 'open',
      startAt: Date.now(),
      deadline: null,
      closedAt: null,
      createdBy: 'admin',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }];
  }

  // 评审记录
  if (!debugData.reviews) {
    debugData.reviews = wx.getStorageSync('cr_reviews_all') || [];
  }

  // 指派
  if (!debugData.assignments) {
    debugData.assignments = [];
    debugData.projects.forEach(p => {
      (p.reviewers || []).forEach(rid => {
        debugData.assignments.push({
          _id: `asgn_${p.id}_${rid}`,
          projectId: p.id,
          roundId: 'round_001',
          expertId: rid,
          status: debugData.reviews.some(r => r.projectId === p.id && r.expertId === rid) ? 'submitted' : 'assigned',
          assignedAt: Date.now(),
          updatedAt: Date.now()
        });
      });
    });
  }
}

async function localFallback(action, data) {
  initDebugData();

  const app = getApp();
  const currentRole = app.globalData.role;
  const currentReviewerId = app.globalData.currentReviewerId;
  const currentReviewerName = app.globalData.currentReviewerName;

  switch (action) {
    case 'getCurrentUser': {
      if (currentRole === 'admin') {
        return { ok: true, data: { _id: 'admin_1', name: '管理员', role: 'admin', organization: '', title: '', status: 'active' } };
      }
      return { ok: true, data: { _id: currentReviewerId, name: currentReviewerName, role: 'expert', organization: '', title: '', status: 'active' } };
    }

    case 'adminListProjects': {
      const projects = debugData.projects.map(p => {
        const relatedReviews = debugData.reviews.filter(r => r.projectId === p._id);
        const total = relatedReviews.reduce((s, r) => s + r.totalScore, 0);
        const avgScore = relatedReviews.length > 0 ? (total / relatedReviews.length).toFixed(1) : null;
        const assignments = debugData.assignments.filter(a => a.projectId === p._id);
        const submittedCount = assignments.filter(a => a.status === 'submitted' || a.status === 'resubmitted').length;
        return { ...p, avgScore, reviewCount: relatedReviews.length, submittedCount, totalAssignments: assignments.length };
      });
      return { ok: true, data: projects };
    }

    case 'adminCreateProject': {
      const p = {
        _id: 'p' + Date.now(),
        name: data.project.name,
        institution: data.project.institution || '',
        leader: data.project.leader || '',
        description: data.project.description || '',
        status: 'active',
        createdBy: 'admin',
        reviewers: [],
        assignedReviewers: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      debugData.projects.push(p);
      wx.setStorageSync('cr_projects_all', debugData.projects);
      return { ok: true, data: p };
    }

    case 'adminUpdateProject': {
      const idx = debugData.projects.findIndex(p => p._id === data.projectId);
      if (idx < 0) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
      const allowed = ['name', 'institution', 'leader', 'description'];
      allowed.forEach(k => {
        if (data.updates && data.updates[k] !== undefined) debugData.projects[idx][k] = data.updates[k];
      });
      debugData.projects[idx].updatedAt = Date.now();
      wx.setStorageSync('cr_projects_all', debugData.projects);
      return { ok: true, data: debugData.projects[idx] };
    }

    case 'adminArchiveProject': {
      const idx = debugData.projects.findIndex(p => p._id === data.projectId);
      if (idx < 0) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
      debugData.projects[idx].status = 'archived';
      wx.setStorageSync('cr_projects_all', debugData.projects);
      return { ok: true, data: debugData.projects[idx] };
    }

    case 'adminListUsers': {
      const users = debugData.reviewers.map(r => ({
        _id: r.id, openid: r.id, name: r.name, role: 'expert', organization: '', title: '', status: 'active'
      }));
      users.unshift({ _id: 'admin_1', openid: 'admin_1', name: '管理员', role: 'admin', organization: '', title: '', status: 'active' });
      return { ok: true, data: users };
    }

    case 'adminCreateOrBindUser': {
      const newUser = {
        _id: data.userData.openid || 'r' + Date.now(),
        openid: data.userData.openid,
        name: data.userData.name,
        role: data.userData.role || 'expert',
        organization: data.userData.organization || '',
        title: data.userData.title || '',
        status: 'active'
      };
      debugData.reviewers.push({ id: newUser._id, name: newUser.name });
      wx.setStorageSync('cr_reviewers_all', debugData.reviewers);
      return { ok: true, data: newUser };
    }

    case 'adminDisableUser': {
      const u = debugData.reviewers.find(r => r.id === data.userId);
      if (u) {
        const idx = debugData.reviewers.indexOf(u);
        debugData.reviewers.splice(idx, 1);
        wx.setStorageSync('cr_reviewers_all', debugData.reviewers);
      }
      return { ok: true, data: { status: 'disabled' } };
    }

    case 'adminEnableUser': return { ok: true, data: { status: 'active' } };

    case 'adminListReviewRounds': return { ok: true, data: debugData.rounds };

    case 'adminCreateReviewRound': {
      const r = {
        _id: 'round_' + Date.now(),
        name: (data.round && data.round.name) || '新批次',
        roundNo: (data.round && data.round.roundNo) || 1,
        status: 'draft',
        startAt: null,
        deadline: null,
        closedAt: null,
        createdBy: 'admin',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      debugData.rounds.push(r);
      return { ok: true, data: r };
    }

    case 'adminOpenReviewRound': {
      const r = debugData.rounds.find(r => r._id === data.roundId);
      if (r) { r.status = 'open'; r.startAt = Date.now(); }
      return { ok: true, data: r };
    }

    case 'adminCloseReviewRound': {
      debugData.rounds.forEach(r => { if (r._id === data.roundId) r.status = 'closed'; });
      return { ok: true, data: {} };
    }

    case 'adminListAssignments': {
      return { ok: true, data: debugData.assignments };
    }

    case 'adminAssignExpert': {
      const aid = `asgn_${data.projectId}_${data.expertId}`;
      const exists = debugData.assignments.find(a => a._id === aid);
      if (exists) return { ok: false, code: 'ALREADY_ASSIGNED', message: '该专家已分配' };
      const a = { _id: aid, projectId: data.projectId, roundId: data.roundId || 'round_001', expertId: data.expertId, status: 'assigned', assignedAt: Date.now(), updatedAt: Date.now() };
      debugData.assignments.push(a);
      // 同步到 project
      const proj = debugData.projects.find(p => p._id === data.projectId);
      if (proj && !proj.reviewers.includes(data.expertId)) {
        proj.reviewers.push(data.expertId);
        const rev = debugData.reviewers.find(r => r.id === data.expertId);
        proj.assignedReviewers.push(rev || { id: data.expertId, name: data.expertId });
        wx.setStorageSync('cr_projects_all', debugData.projects);
      }
      return { ok: true, data: a };
    }

    case 'adminRemoveAssignment': {
      debugData.assignments = debugData.assignments.filter(a => a._id !== data.assignmentId);
      return { ok: true, message: '已移除' };
    }

    case 'adminReturnReview': {
      const rev = debugData.reviews.find(r => r._id === data.reviewId);
      if (rev) rev.status = 'returned';
      wx.setStorageSync('cr_reviews_all', debugData.reviews);
      return { ok: true, data: rev };
    }

    case 'adminGetProjectResult': {
      const revs = debugData.reviews.filter(r => r.projectId === data.projectId);
      return { ok: true, data: revs };
    }

    case 'adminGetSummary': {
      const projectScores = {};
      debugData.projects.forEach(p => { projectScores[p._id] = { projectName: p.name, institution: p.institution, scores: [], fundings: [] }; });
      debugData.reviews.forEach(r => {
        if (projectScores[r.projectId]) {
          projectScores[r.projectId].scores.push(r.totalScore);
          projectScores[r.projectId].fundings.push(r.recommendedFunding || 0);
        }
      });
      const rankings = Object.entries(projectScores)
        .filter(([_, d]) => d.scores.length > 0)
        .map(([pid, d]) => {
          const sorted = [...d.scores].sort((a, b) => a - b);
          const avg = d.scores.reduce((a, b) => a + b, 0) / d.scores.length;
          const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
          const avgFund = d.fundings.length > 0 ? (d.fundings.reduce((a, b) => a + b, 0) / d.fundings.length).toFixed(2) : '-';
          const grade = getGrade(avg);
          return { projectId: pid, projectName: d.projectName, institution: d.institution, avgScore: avg.toFixed(1), median: median.toFixed(1), minScore: sorted[0], maxScore: sorted[sorted.length - 1], range: (sorted[sorted.length - 1] - sorted[0]).toFixed(1), gradeLabel: grade.label, gradeColor: grade.color, avgFunding: avgFund, reviewCount: d.scores.length, totalAssignments: d.scores.length, reviewStatus: '已完成' };
        })
        .sort((a, b) => parseFloat(b.avgScore) - parseFloat(a.avgScore));
      rankings.forEach((r, i) => { r.rank = i + 1; });
      return { ok: true, data: { totalProjects: debugData.projects.length, totalReviews: debugData.reviews.length, avgScore: rankings.length > 0 ? (rankings.reduce((s, r) => s + parseFloat(r.avgScore), 0) / rankings.length).toFixed(1) : '-', rankings } };
    }

    // 专家侧
    case 'expertListProjects': {
      const myProjects = debugData.projects.filter(p => p.reviewers && p.reviewers.includes(currentReviewerId));
      return { ok: true, data: myProjects };
    }

    case 'expertGetProjectDetail': {
      const proj = debugData.projects.find(p => p._id === data.projectId);
      if (!proj) return { ok: false, code: 'NOT_FOUND', message: '项目不存在' };
      const asgn = debugData.assignments.find(a => a.projectId === data.projectId && a.expertId === currentReviewerId);
      if (!asgn) return { ok: false, code: 'NOT_ASSIGNED', message: '您未被分配到此项目' };
      return { ok: true, data: { project: proj, assignment: asgn, currentRound: debugData.rounds[0] || null } };
    }

    case 'expertListAssignments': {
      const myAssignments = debugData.assignments
        .filter(a => a.expertId === currentReviewerId)
        .map(a => {
          const proj = debugData.projects.find(p => p._id === a.projectId);
          const rev = debugData.reviews.find(r => r.assignmentId === a._id);
          return { ...a, project: proj || null, review: rev || null };
        });
      return { ok: true, data: myAssignments };
    }

    case 'expertGetMyReview': {
      const rev2 = debugData.reviews.find(r => r.assignmentId === data.assignmentId);
      return { ok: true, data: rev2 || null };
    }

    case 'expertGetReviewDraft': {
      const rev = debugData.reviews.find(r => r.assignmentId === data.assignmentId && r.status === 'draft');
      return { ok: true, data: rev || null };
    }

    case 'expertSaveReviewDraft': {
      const { scores, comments, recommendedFunding, fundingComment } = data.reviewData;
      const existing = debugData.reviews.find(r => r.assignmentId === data.reviewData.assignmentId && r.status === 'draft');
      const draft = {
        _id: existing ? existing._id : 'draft_' + Date.now(),
        projectId: existing ? existing.projectId : '',
        roundId: existing ? existing.roundId : 'round_001',
        assignmentId: data.reviewData.assignmentId,
        expertId: currentReviewerId,
        expertName: currentReviewerName,
        scores: scores || {},
        totalScore: 0,
        grade: '',
        comments: comments || '',
        recommendedFunding: Number(recommendedFunding) || 0,
        fundingComment: fundingComment || '',
        status: 'draft',
        version: existing ? existing.version : 1,
        submittedAt: null,
        updatedAt: Date.now(),
        createdAt: existing ? existing.createdAt : Date.now()
      };
      if (existing) {
        const idx = debugData.reviews.indexOf(existing);
        debugData.reviews[idx] = draft;
      } else {
        debugData.reviews.push(draft);
      }
      wx.setStorageSync('cr_reviews_all', debugData.reviews);
      return { ok: true, data: draft };
    }

    case 'expertSubmitReview': {
      const { assignmentId, scores, comments, recommendedFunding, fundingComment } = data;
      // 找到指派
      const asgn = debugData.assignments.find(a => a._id === assignmentId);
      if (!asgn) return { ok: false, code: 'NOT_FOUND', message: '指派不存在' };

      // 幂等检查
      const existingDone = debugData.reviews.find(r => r.assignmentId === assignmentId && ['submitted', 'resubmitted', 'locked'].includes(r.status));
      if (existingDone && asgn.status !== 'returned') {
        return { ok: false, code: 'ALREADY_SUBMITTED', message: '您已提交评审' };
      }

      // 简单校验
      if (!scores || !comments) return { ok: false, code: 'INVALID_PARAM', message: '评分数据不完整' };

      const calc = calcTotal(scores);
      const isReturned = asgn.status === 'returned';
      const newStatus = isReturned ? 'resubmitted' : 'submitted';

      const existing = debugData.reviews.find(r => r.assignmentId === assignmentId && ['draft', 'returned'].includes(r.status));
      const review = {
        _id: existing ? existing._id : 'review_' + Date.now(),
        projectId: asgn.projectId,
        roundId: asgn.roundId,
        assignmentId,
        expertId: currentReviewerId,
        expertName: currentReviewerName,
        scores,
        totalScore: calc.totalScore,
        grade: calc.grade.label,
        comments: comments.trim(),
        recommendedFunding: Number(recommendedFunding) || 0,
        fundingComment: (fundingComment || '').trim(),
        status: newStatus,
        version: isReturned ? ((existing && existing.version) || 1) + 1 : 1,
        submittedAt: Date.now(),
        updatedAt: Date.now(),
        createdAt: existing ? existing.createdAt : Date.now()
      };

      if (existing) {
        const idx = debugData.reviews.indexOf(existing);
        debugData.reviews[idx] = review;
      } else {
        debugData.reviews.push(review);
      }

      // 更新指派状态
      asgn.status = newStatus;
      asgn.updatedAt = Date.now();

      wx.setStorageSync('cr_reviews_all', debugData.reviews);
      return { ok: true, data: review };
    }

    case 'leaderGetSummary': return await localFallback('adminGetSummary', data);

    default:
      return { ok: false, code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` };
  }
}

module.exports = { call, DEBUG_MODE };
