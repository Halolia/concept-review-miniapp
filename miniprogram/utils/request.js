/**
 * 云函数调用统一封装 — 路演现场评分
 * - 环境配置接入
 * - 统一 error 抛出
 * - DEBUG 模式使用相同业务规则
 */

let envConfig;
try {
  envConfig = require('../config/env');
} catch (e) {
  envConfig = require('../config/env.example');
}

const DEBUG_MODE = envConfig.debugMode !== false;
const CLOUD_FUNC_NAME = envConfig.cloudFunctionName || 'reviewFunctions';

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

async function call(action, data = {}, options = {}) {
  const opts = { showLoading: true, loadingText: '加载中…', ...options };
  if (DEBUG_MODE) {
    const result = await localFallback(action, data);
    return unwrapResult(result);
  }
  return callCloud(action, data, opts);
}

// ═══ DEBUG 本地降级 ═══

const { SCORING_ITEMS } = require('./scoring');
const { calcTotal, getGrade } = require('./scoring');

const debugData = {
  sessions: null, projects: null, reviewers: null,
  reviews: null, invites: null
};

function initDebugData() {
  if (!debugData.sessions) {
    debugData.sessions = [
      { _id: 's1', name: '2024年第一批路演', date: '2024-12-20', deadline: '2024-12-20 18:00', status: 'open', createdAt: Date.now() }
    ];
  }
  if (!debugData.projects) {
    let p = wx.getStorageSync('cr_session_projects');
    if (!p || p.length === 0) {
      p = [
        { _id: 'p1', name: '煤基碳纳米材料的规模化应用', institution: '上海火山雨资源再生科技有限公司', leader: '', sessionId: 's1' },
        { _id: 'p2', name: '无内衬全碳纤复合材料液氢储罐', institution: '江南大学', leader: '乔巍', sessionId: 's1' },
        { _id: 'p3', name: '智能MOFs电子鼻精准识别技术', institution: '盐城工学院', leader: '解明华', sessionId: 's1' },
        { _id: 'p4', name: '水系二次电池', institution: '盐城师范学院', leader: '刘昱', sessionId: 's1' },
        { _id: 'p5', name: '锌铁液流电池', institution: '苏州纳米所', leader: '周小春', sessionId: 's1' }
      ];
      wx.setStorageSync('cr_session_projects', p);
    }
    debugData.projects = p;
  }
  if (!debugData.reviewers) {
    debugData.reviewers = [
      { _id: 'r1', openid: '', name: '张教授', role: 'expert', organization: '清华大学', title: '教授', bindingStatus: 'pending', status: 'active' },
      { _id: 'r2', openid: '', name: '李工', role: 'expert', organization: '中科院', title: '研究员', bindingStatus: 'pending', status: 'active' },
      { _id: 'r3', openid: '', name: '王博士', role: 'expert', organization: '上海交大', title: '副教授', bindingStatus: 'pending', status: 'active' },
      { _id: 'admin_1', openid: 'admin_1', name: '管理员', role: 'admin', organization: '', title: '', bindingStatus: 'bound', status: 'active' }
    ];
  }
  if (!debugData.reviews) {
    debugData.reviews = wx.getStorageSync('cr_reviews_debug') || [];
  }
  if (!debugData.invites) {
    debugData.invites = {};
  }
}

async function localFallback(action, data) {
  initDebugData();
  const app = getApp();
  const role = app.globalData.role;

  switch (action) {
    // ── 用户身份 ──
    case 'getMyOpenid':
      return { ok: true, data: { openid: 'DEBUG_OPENID_' + (role === 'admin' ? 'admin' : app.globalData.reviewerId || 'r1') } };

    case 'getCurrentUser':
      if (role === 'admin') return { ok: true, data: { _id: 'admin_1', name: '管理员', role: 'admin', status: 'active' } };
      return { ok: true, data: { _id: 'r1', name: '张教授', role: 'expert', status: 'active' } };

    // ── 会话管理 ──
    case 'adminListSessions':
      return { ok: true, data: debugData.sessions };

    case 'adminGetSession':
      return { ok: true, data: debugData.sessions.find(s => s._id === data.sessionId) || null };

    case 'adminCreateSession': {
      const s = {
        _id: 's' + Date.now(),
        name: (data.session && data.session.name) || '新场次',
        date: (data.session && data.session.date) || '',
        deadline: (data.session && data.session.deadline) || '',
        status: 'draft',
        createdAt: Date.now()
      };
      debugData.sessions.push(s);
      return { ok: true, data: s };
    }

    case 'adminUpdateSession': {
      const su = debugData.sessions.find(s => s._id === data.sessionId);
      if (su && data.updates) {
        ['name', 'date', 'deadline'].forEach(k => {
          if (data.updates[k] !== undefined) su[k] = data.updates[k];
        });
      }
      return { ok: true, data: su };
    }

    case 'adminOpenSession': {
      const so = debugData.sessions.find(s => s._id === data.sessionId);
      if (!so) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };
      if (so.status !== 'draft') return { ok: false, code: 'STATUS_ERROR', message: '只能开启草稿状态的场次' };
      so.status = 'open';
      return { ok: true, data: so };
    }

    case 'adminCloseSession': {
      const sc = debugData.sessions.find(s => s._id === data.sessionId);
      if (!sc) return { ok: false, code: 'NOT_FOUND', message: '场次不存在' };
      if (sc.status !== 'open') return { ok: false, code: 'STATUS_ERROR', message: '只能关闭进行中的场次' };
      sc.status = 'closed';
      // 锁定所有评审
      debugData.reviews.forEach(r => {
        if (['submitted', 'resubmitted'].includes(r.status)) r.status = 'locked';
      });
      wx.setStorageSync('cr_reviews_debug', debugData.reviews);
      return { ok: true, data: sc };
    }

    // ── 会话项目 ──
    case 'adminListSessionProjects':
      return { ok: true, data: debugData.projects.filter(p => p.sessionId === data.sessionId) };

    case 'adminAddProjectToSession': {
      const proj = {
        _id: 'p' + Date.now(),
        name: (data.project && data.project.name) || '',
        institution: (data.project && data.project.institution) || '',
        leader: (data.project && data.project.leader) || '',
        description: (data.project && data.project.description) || '',
        sessionId: data.sessionId
      };
      debugData.projects.push(proj);
      wx.setStorageSync('cr_session_projects', debugData.projects);
      return { ok: true, data: proj };
    }

    case 'adminRemoveProjectFromSession': {
      const idx = debugData.projects.findIndex(p => p._id === data.projectId && p.sessionId === data.sessionId);
      if (idx >= 0) debugData.projects.splice(idx, 1);
      wx.setStorageSync('cr_session_projects', debugData.projects);
      return { ok: true, data: { removed: true } };
    }

    // ── 进度 ──
    case 'adminGetSessionProgress': {
      const progs = debugData.projects.filter(p => p.sessionId === data.sessionId);
      const reviewers = debugData.reviewers.filter(r => r.role === 'expert');
      const revs = debugData.reviews.filter(r => r.sessionId === data.sessionId);

      const projectProgress = progs.map(p => {
        const pr = revs.filter(r => r.projectId === p._id);
        const submitted = pr.filter(r => ['submitted', 'resubmitted', 'locked'].includes(r.status)).length;
        return { projectId: p._id, projectName: p.name, submitted, total: reviewers.length };
      });

      const reviewerProgress = reviewers.map(r => {
        const rr = revs.filter(rv => rv.reviewerId === r._id);
        const scored = rr.filter(rv => ['submitted', 'resubmitted', 'locked'].includes(rv.status)).length;
        return { reviewerId: r._id, reviewerName: r.name, scored, total: progs.length };
      });

      return { ok: true, data: { projectProgress, reviewerProgress } };
    }

    // ── 评审记录 ──
    case 'reviewerGetSession': {
      const reviewerId = app.globalData.reviewerId || 'r1';
      const sessionId = app.globalData.sessionId || 's1';
      const projs = debugData.projects.filter(p => p.sessionId === sessionId);
      const enriched = projs.map(p => {
        const rev = debugData.reviews.find(r => r.projectId === p._id && r.reviewerId === reviewerId);
        return { ...p, myStatus: rev ? rev.status : 'none' };
      });
      return { ok: true, data: { sessionId, sessionName: '2024年第一批路演', projects: enriched } };
    }

    case 'reviewerGetMyReview': {
      const reviewerId = app.globalData.reviewerId || 'r1';
      const rev = debugData.reviews.find(r =>
        r.sessionId === data.sessionId && r.projectId === data.projectId && r.reviewerId === reviewerId
      );
      return { ok: true, data: rev || null };
    }

    case 'reviewerSaveDraft': {
      const reviewerId = app.globalData.reviewerId || 'r1';
      let rev = debugData.reviews.find(r =>
        r.sessionId === data.sessionId && r.projectId === data.projectId && r.reviewerId === reviewerId
      );
      const rd = data.data || {};
      const funding = rd.recommendedFunding !== undefined && rd.recommendedFunding !== '' ? Number(rd.recommendedFunding) : null;
      const draft = {
        _id: rev ? rev._id : 'rev_' + Date.now(),
        sessionId: data.sessionId, projectId: data.projectId, reviewerId,
        expertName: app.globalData.userName || '张教授',
        scores: rd.scores || {}, totalScore: 0, grade: '',
        comments: rd.comments || '', recommendedFunding: funding,
        fundingComment: rd.fundingComment || '',
        status: 'draft', version: rev ? rev.version : 1,
        updatedAt: Date.now(), createdAt: rev ? rev.createdAt : Date.now()
      };
      if (rev) {
        const i = debugData.reviews.indexOf(rev);
        debugData.reviews[i] = draft;
      } else {
        debugData.reviews.push(draft);
      }
      wx.setStorageSync('cr_reviews_debug', debugData.reviews);
      return { ok: true, data: draft };
    }

    case 'reviewerSubmitReview': {
      const reviewerId = app.globalData.reviewerId || 'r1';
      const rd2 = data.data || {};
      const { scores, comments, recommendedFunding, fundingComment } = rd2;
      if (!scores || !comments) return { ok: false, code: 'INVALID_PARAM', message: '评分数据不完整' };
      const funding = Number(recommendedFunding);
      if (isNaN(funding) || funding < 0) return { ok: false, code: 'INVALID_FUNDING', message: '经费不合法' };
      if (funding === 0 && (!fundingComment || !fundingComment.trim())) return { ok: false, code: 'FUNDING_COMMENT', message: '经费为0需填写说明' };

      let rev = debugData.reviews.find(r =>
        r.sessionId === data.sessionId && r.projectId === data.projectId && r.reviewerId === reviewerId
      );
      const calc = calcTotal(scores);
      const isResubmit = rev && ['submitted', 'resubmitted'].includes(rev.status);
      const newRev = {
        _id: rev ? rev._id : 'rev_' + Date.now(),
        sessionId: data.sessionId, projectId: data.projectId, reviewerId,
        expertName: app.globalData.userName || '张教授',
        scores, totalScore: calc.totalScore, grade: calc.grade.label,
        comments: comments.trim(), recommendedFunding: funding,
        fundingComment: (fundingComment || '').trim(),
        status: isResubmit ? 'resubmitted' : 'submitted',
        version: isResubmit ? ((rev && rev.version) || 1) + 1 : 1,
        submittedAt: Date.now(), updatedAt: Date.now(),
        createdAt: rev ? rev.createdAt : Date.now()
      };
      if (rev) {
        const i = debugData.reviews.indexOf(rev);
        debugData.reviews[i] = newRev;
      } else {
        debugData.reviews.push(newRev);
      }
      wx.setStorageSync('cr_reviews_debug', debugData.reviews);
      return { ok: true, data: newRev };
    }

    case 'adminGetProjectResult': {
      let revs = debugData.reviews.filter(r => r.projectId === data.projectId);
      if (data.sessionId) revs = revs.filter(r => r.sessionId === data.sessionId);
      return { ok: true, data: revs };
    }

    case 'adminReturnReview': {
      const rrr = debugData.reviews.find(r => r._id === data.reviewId);
      if (rrr) { rrr.status = 'returned'; rrr.returnReason = data.reason; wx.setStorageSync('cr_reviews_debug', debugData.reviews); }
      return { ok: true, data: rrr };
    }

    // ── 邀请 ──
    case 'scanInvite': {
      if (!data.token) return { ok: false, code: 'INVALID_TOKEN', message: '无效的邀请码' };
      // DEBUG: 解析 token 格式 sessionId_reviewerId
      const parts = data.token.split('_');
      const sessionId = parts[0] || 's1';
      const reviewerId = parts[1] || 'r1';
      const session = debugData.sessions.find(s => s._id === sessionId);
      const reviewer = debugData.reviewers.find(r => r._id === reviewerId);
      if (!session || !reviewer) return { ok: false, code: 'NOT_FOUND', message: '邀请码无效' };
      const isBound = debugData.invites[data.token] || false;
      return {
        ok: true,
        data: {
          sessionId, sessionName: session.name,
          reviewerId, reviewerName: reviewer.name,
          organization: reviewer.organization,
          isBound
        }
      };
    }

    case 'bindInvite': {
      if (!data.token) return { ok: false, code: 'INVALID_TOKEN', message: '无效的邀请码' };
      const parts2 = data.token.split('_');
      const sid2 = parts2[0] || 's1';
      const rid2 = parts2[1] || 'r1';
      const session = debugData.sessions.find(s => s._id === sid2);
      const reviewer = debugData.reviewers.find(r => r._id === rid2);
      if (!session || !reviewer) return { ok: false, code: 'NOT_FOUND', message: '邀请码无效' };
      if (debugData.invites[data.token]) return { ok: false, code: 'ALREADY_BOUND', message: '已绑定' };
      debugData.invites[data.token] = true;
      return {
        ok: true,
        data: { sessionId: sid2, sessionName: session.name, reviewerId: rid2, reviewerName: reviewer.name }
      };
    }

    case 'adminGenerateInviteToken': {
      const token = `${data.sessionId}_${data.reviewerId}`;
      debugData.invites[token] = false;
      return { ok: true, data: { token } };
    }

    case 'adminResetBinding': {
      const token = `${data.sessionId}_${data.reviewerId}`;
      delete debugData.invites[token];
      return { ok: true, data: { reset: true } };
    }

    // ── 评委管理 (复用旧逻辑) ──
    case 'adminListUsers':
      return { ok: true, data: debugData.reviewers };

    case 'adminCreateOrBindUser': {
      const u = {
        _id: data.userData.openid || 'r' + Date.now(),
        openid: data.userData.openid || '',
        name: data.userData.name,
        role: 'expert',
        organization: data.userData.organization || '',
        title: data.userData.title || '',
        bindingStatus: data.userData.openid ? 'bound' : 'pending',
        status: 'active'
      };
      debugData.reviewers.push(u);
      return { ok: true, data: u };
    }

    case 'adminBindUserOpenid': {
      const u2 = debugData.reviewers.find(r => r._id === data.userId);
      if (u2) u2.openid = data.openid;
      return { ok: true, data: { bindingStatus: 'bound' } };
    }

    default:
      return { ok: false, code: 'UNKNOWN_ACTION', message: `未知操作: ${action}` };
  }
}

module.exports = { call, DEBUG_MODE };
