const { isAdmin, isLeader } = require('../../services/authService');
const { adminGetSummary, leaderGetSummary, adminListReviewRounds } = require('../../services/summaryService');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    summary: { totalProjects: 0, totalReviews: 0, avgScore: '-' },
    rankings: [], rounds: [], selectedRoundId: '',
    loading: true, isLeader: false
  },

  async onShow() {
    if (!isAdmin() && !isLeader() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500); return;
    }
    this.setData({ isLeader: isLeader() && !isAdmin() });
    await this.loadRounds();
  },

  async loadRounds() {
    try {
      const rounds = await adminListReviewRounds();
      const selId = this.data.selectedRoundId || (rounds.length > 0 ? rounds[0]._id : '');
      this.setData({ rounds, selectedRoundId: selId });
      await this.loadData();
    } catch (e) { this.setData({ loading: false }); }
  },

  onRoundChange(e) {
    const selectedRoundId = this.data.rounds[e.detail.value]._id;
    this.setData({ selectedRoundId });
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const service = this.data.isLeader ? leaderGetSummary : adminGetSummary;
      const res = await service(this.data.selectedRoundId);
      const currentRound = this.data.rounds.find(r => r._id === this.data.selectedRoundId);
      this.setData({
        loading: false,
        summary: { totalProjects: res.totalProjects || 0, totalReviews: res.totalReviews || 0, avgScore: res.avgScore || '-', isClosed: !!res.isClosed },
        rankings: (res.rankings || []).map(r => ({
          ...r,
          gradeClass: r.gradeLabel === '优秀' ? 'excellent' : r.gradeLabel === '良好' ? 'good' : r.gradeLabel === '一般' ? 'normal' : 'fail'
        }))
      });
    } catch (e) { this.setData({ loading: false }); }
  },

  goResult(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/result/result?projectId=${id}&projectName=${encodeURIComponent(name)}&roundId=${this.data.selectedRoundId}` });
  }
});
