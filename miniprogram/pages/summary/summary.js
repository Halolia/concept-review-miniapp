const { isAdmin, isLeader } = require('../../services/authService');
const { adminGetSummary } = require('../../services/summaryService');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    summary: { totalProjects: 0, totalReviews: 0, avgScore: '-' },
    rankings: [],
    loading: true
  },

  async onShow() {
    if (!isAdmin() && !isLeader() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    await this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const res = await adminGetSummary();

      this.setData({
        loading: false,
        summary: {
          totalProjects: res.totalProjects || 0,
          totalReviews: res.totalReviews || 0,
          avgScore: res.avgScore || '-'
        },
        rankings: (res.rankings || []).map(r => ({
          ...r,
          gradeClass: r.gradeLabel === '优秀' ? 'excellent' :
                     r.gradeLabel === '良好' ? 'good' :
                     r.gradeLabel === '一般' ? 'normal' : 'fail'
        }))
      });
    } catch (e) {
      console.error('加载汇总失败:', e);
      this.setData({ loading: false });
    }
  },

  goResult(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/result/result?projectId=${id}&projectName=${encodeURIComponent(name)}` });
  }
});
