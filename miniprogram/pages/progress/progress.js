/**
 * 进度看板 — 路演现场评分（管理员视图）
 * 两个维度：按项目、按评委
 */
const { isAdmin } = require('../../services/authService');
const { listSessions, getSessionProgress } = require('../../services/sessionService');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    loading: true,
    sessions: [],
    selectedSessionId: '',
    selectedSession: null,

    projectProgress: [],
    reviewerProgress: [],

    // 筛选
    projectFilter: 'all',   // all | done | pending
    reviewerFilter: 'all'   // all | done | pending
  },

  onLoad(options) {
    if (options.sessionId) {
      this.setData({ selectedSessionId: options.sessionId });
    }
  },

  async onShow() {
    if (!isAdmin() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500); return;
    }
    this.setData({ loading: true });
    try {
      const sessions = await listSessions();
      let selId = this.data.selectedSessionId;
      if (!selId || !sessions.some(s => s._id === selId)) {
        selId = sessions.length > 0 ? sessions[0]._id : '';
      }
      const selSession = sessions.find(s => s._id === selId) || null;

      let projectProgress = [], reviewerProgress = [];
      if (selId) {
        try {
          const progress = await getSessionProgress(selId);
          projectProgress = progress.projectProgress || [];
          reviewerProgress = progress.reviewerProgress || [];
        } catch (e) {}
      }

      this.setData({
        loading: false, sessions,
        selectedSessionId: selId, selectedSession: selSession,
        projectProgress, reviewerProgress
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  selectSession(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedSessionId: id });
    this.onShow(); // 重新加载
  },

  // 筛选
  setProjectFilter(e) {
    this.setData({ projectFilter: e.currentTarget.dataset.filter });
  },

  setReviewerFilter(e) {
    this.setData({ reviewerFilter: e.currentTarget.dataset.filter });
  },

  get filteredProjects() {
    const { projectProgress, projectFilter } = this.data;
    if (projectFilter === 'done') return projectProgress.filter(p => (p.submitted || 0) >= (p.total || 1));
    if (projectFilter === 'pending') return projectProgress.filter(p => (p.submitted || 0) < (p.total || 0));
    return projectProgress;
  },

  get filteredReviewers() {
    const { reviewerProgress, reviewerFilter } = this.data;
    if (reviewerFilter === 'done') return reviewerProgress.filter(r => (r.scored || 0) >= (r.total || 1));
    if (reviewerFilter === 'pending') return reviewerProgress.filter(r => (r.scored || 0) < (r.total || 0));
    return reviewerProgress;
  },

  /** 查看项目详情 */
  goResult(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/result/result?projectId=${id}&projectName=${encodeURIComponent(name)}&sessionId=${this.data.selectedSessionId}`
    });
  }
});
