const app = getApp();
const { getCurrentUser, isAdmin, isExpert } = require('../../services/authService');
const { adminGetSummary } = require('../../services/summaryService');
const { expertListAssignments } = require('../../services/assignmentService');
const { adminListProjects } = require('../../services/projectService');
const { DEBUG_MODE } = require('../../utils/request');
const { MOCK_REVIEWERS } = require('../../utils/constants');

Page({
  data: {
    role: 'guest',      // 实际角色
    userName: '',
    userStatus: 'active',
    loading: true,
    showRoleSwitch: DEBUG_MODE,
    // DEBUG 模式
    reviewerNames: [],
    reviewerIndex: 0,
    currentReviewer: { id: 'r1', name: '张教授' },
    // 统计数据
    stats: { totalProjects: 0, pendingReviews: 0, doneReviews: 0, returnedReviews: 0, unassigned: 0, inProgress: 0, completed: 0, roundsToClose: 0 }
  },

  async onShow() {
    if (DEBUG_MODE) {
      this.setupDebugMode();
    } else {
      await this.setupProdMode();
    }
    await this.loadStats();
  },

  // ── DEBUG 模式 ──
  setupDebugMode() {
    const appData = app.globalData;
    const role = appData.role;
    const reviewerNames = MOCK_REVIEWERS.map(r => r.name);
    const reviewerIndex = MOCK_REVIEWERS.findIndex(r => r.id === appData.currentReviewerId);

    this.setData({
      role,
      userName: role === 'admin' ? '管理员' : appData.currentReviewerName,
      loading: false,
      reviewerNames,
      reviewerIndex: reviewerIndex >= 0 ? reviewerIndex : 0,
      currentReviewer: { id: appData.currentReviewerId, name: appData.currentReviewerName }
    });
  },

  // ── 正式模式 ──
  async setupProdMode() {
    try {
      const user = await getCurrentUser();
      if (user && user.status === 'active') {
        this.setData({
          role: user.role,
          userName: user.name,
          userStatus: user.status,
          loading: false
        });
      } else {
        this.setData({ role: 'guest', loading: false });
      }
    } catch (err) {
      this.setData({ role: 'guest', loading: false });
    }
  },

  // DEBUG 角色切换
  switchRole(e) {
    if (!DEBUG_MODE) return;
    const role = e.currentTarget.dataset.role;
    app.switchRole(role);
    this.setData({ role, userName: role === 'admin' ? '管理员' : this.data.currentReviewer.name });
    this.loadStats();
  },

  // DEBUG 专家选择
  onReviewerChange(e) {
    if (!DEBUG_MODE) return;
    const idx = e.detail.value;
    const r = MOCK_REVIEWERS[idx];
    app.setReviewer(r.id, r.name);
    this.setData({ currentReviewer: r, reviewerIndex: idx, userName: r.name });
    this.loadStats();
  },

  // ── 加载统计数据 ──
  async loadStats() {
    const role = this.data.role;

    if (role === 'admin') {
      try {
        // 获取项目列表
        const projects = await adminListProjects();

        // 获取汇总数据（含评审状态）
        let summaryRes;
        try {
          summaryRes = await adminGetSummary();
        } catch (e) { summaryRes = { rankings: [] }; }

        const rankings = summaryRes.rankings || [];
        const completed = rankings.filter(r => r.reviewStatus === '已完成').length;
        const inProgress = rankings.filter(r => r.reviewStatus === '评审中').length;
        const unassigned = projects.filter(p => (!p.reviewers || p.reviewers.length === 0)).length;
        const pending = rankings.filter(r => r.reviewStatus === '待开始').length;

        this.setData({
          stats: {
            totalProjects: projects.length,
            pendingReviews: pending + inProgress,
            doneReviews: completed,
            returnedReviews: 0,
            unassigned,
            inProgress,
            completed,
            roundsToClose: 1
          }
        });
      } catch (e) {
        console.error('加载管理统计失败:', e);
      }
    } else if (role === 'expert') {
      try {
        const assignments = await expertListAssignments();
        const pending = assignments.filter(a => a.status === 'assigned').length;
        const done = assignments.filter(a => ['submitted', 'resubmitted', 'locked'].includes(a.status)).length;
        const returned = assignments.filter(a => a.status === 'returned').length;

        this.setData({
          stats: {
            totalProjects: assignments.length,
            pendingReviews: pending,
            doneReviews: done,
            returnedReviews: returned,
            unassigned: 0, inProgress: 0, completed: 0, roundsToClose: 0
          }
        });
      } catch (e) {
        console.error('加载专家统计失败:', e);
      }
    }
  },

  goProjects(e) {
    const status = e.currentTarget?.dataset?.status || 'all';
    wx.navigateTo({ url: `/pages/projects/projects?status=${status}` });
  },

  goSummary() {
    if (!isAdmin() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/summary/summary' });
  },

  goAdmin() {
    if (!isAdmin() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/admin/admin' });
  }
});
