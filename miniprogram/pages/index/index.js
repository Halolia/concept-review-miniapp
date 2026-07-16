const app = getApp();
const { getCurrentUser, isAdmin, isExpert, isLeader } = require('../../services/authService');
const { adminGetSummary } = require('../../services/summaryService');
const { expertListAssignments } = require('../../services/assignmentService');
const { DEBUG_MODE } = require('../../utils/request');
const { MOCK_REVIEWERS } = require('../../utils/constants');

Page({
  data: {
    role: 'guest', userName: '', userStatus: 'active',
    loading: true, showRoleSwitch: DEBUG_MODE,
    reviewerNames: [], reviewerIndex: 0,
    currentReviewer: { id: 'r1', name: '张教授' },
    stats: { totalProjects: 0, pendingReviews: 0, doneReviews: 0, returnedReviews: 0, unassigned: 0, inProgress: 0, completed: 0, closed: 0 }
  },

  async onShow() {
    if (DEBUG_MODE) { this.setupDebugMode(); } else { await this.setupProdMode(); }
    await this.loadStats();
  },

  setupDebugMode() {
    const ad = app.globalData;
    const role = ad.role;
    const names = MOCK_REVIEWERS.map(r => r.name);
    const idx = MOCK_REVIEWERS.findIndex(r => r.id === ad.currentReviewerId);
    this.setData({
      role, userName: role === 'admin' ? '管理员' : ad.currentReviewerName,
      loading: false, reviewerNames: names,
      reviewerIndex: idx >= 0 ? idx : 0,
      currentReviewer: { id: ad.currentReviewerId, name: ad.currentReviewerName }
    });
  },

  async setupProdMode() {
    try {
      const user = await getCurrentUser();
      if (user && user.status === 'active') {
        this.setData({ role: user.role, userName: user.name, userStatus: user.status, loading: false });
      } else {
        this.setData({ role: 'guest', loading: false });
      }
    } catch (e) { this.setData({ role: 'guest', loading: false }); }
  },

  switchRole(e) { if (!DEBUG_MODE) return; const role = e.currentTarget.dataset.role; app.switchRole(role); this.setData({ role, userName: role === 'admin' ? '管理员' : this.data.currentReviewer.name }); this.loadStats(); },
  onReviewerChange(e) { if (!DEBUG_MODE) return; const idx = e.detail.value; const r = MOCK_REVIEWERS[idx]; app.setReviewer(r.id, r.name); this.setData({ currentReviewer: r, reviewerIndex: idx, userName: r.name }); this.loadStats(); },

  async loadStats() {
    const role = this.data.role;
    if (role === 'admin' || role === 'leader') {
      try {
        const res = await adminGetSummary();
        const ranks = res.rankings || [];
        const stats = {
          totalProjects: res.totalProjects || 0,
          pendingReviews: 0, doneReviews: 0, returnedReviews: 0,
          unassigned: ranks.filter(r => r.reviewStatus === '未分配').length,
          inProgress: ranks.filter(r => r.reviewStatus === '评审中').length,
          completed: ranks.filter(r => r.reviewStatus === '已完成').length,
          closed: ranks.filter(r => r.reviewStatus === '已关闭').length
        };
        stats.pendingReviews = stats.unassigned + stats.inProgress;
        stats.doneReviews = stats.completed + stats.closed;
        this.setData({ stats });
      } catch (e) { console.error('统计失败:', e); }
    } else if (role === 'expert') {
      try {
        const asgns = await expertListAssignments();
        this.setData({
          stats: {
            totalProjects: asgns.length,
            pendingReviews: asgns.filter(a => ['assigned', 'draft'].includes(a.status)).length,
            doneReviews: asgns.filter(a => ['submitted', 'resubmitted', 'locked'].includes(a.status)).length,
            returnedReviews: asgns.filter(a => a.status === 'returned').length,
            unassigned: 0, inProgress: 0, completed: 0, closed: 0
          }
        });
      } catch (e) { console.error('专家统计失败:', e); }
    }
  },

  goProjects(e) {
    wx.navigateTo({ url: `/pages/projects/projects?status=${e.currentTarget?.dataset?.status || 'all'}` });
  },

  goSummary() {
    if (!isAdmin() && !isLeader() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限', icon: 'none' }); return;
    }
    wx.navigateTo({ url: '/pages/summary/summary' });
  },

  goAdmin() {
    if (!isAdmin() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限', icon: 'none' }); return;
    }
    wx.navigateTo({ url: '/pages/admin/admin' });
  }
});
