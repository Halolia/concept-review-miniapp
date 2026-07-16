const { isAdmin, isLeader } = require('../../services/authService');
const { adminGetProjectResult, adminReturnReview } = require('../../services/reviewService');
const { adminGetSummary } = require('../../services/summaryService');
const { SCORING_DIMENSIONS, getGrade } = require('../../utils/scoring');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    projectId: '', projectName: '', roundId: '',
    reviews: [], avgScore: '-', avgGrade: { label: '-', color: '#999' },
    median: '-', maxScore: '-', minScore: '-', range: '-', avgFunding: '-',
    reviewCount: 0, totalAssignments: 0, loading: true
  },

  onLoad(options) {
    this.setData({
      projectId: options.projectId,
      projectName: decodeURIComponent(options.projectName || ''),
      roundId: options.roundId || ''
    });
  },

  async onShow() {
    if (!isAdmin() && !isLeader() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500); return;
    }
    await this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const reviews = await adminGetProjectResult(this.data.projectId, this.data.roundId);
      let summaryRes;
      try { summaryRes = await adminGetSummary(this.data.roundId); } catch (e) { summaryRes = { rankings: [] }; }
      const ranking = (summaryRes.rankings || []).find(r => r.projectId === this.data.projectId);

      const enriched = (reviews || []).map(r => {
        const grade = getGrade(r.totalScore);
        return {
          ...r,
          timeStr: r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '',
          gradeColor: grade ? grade.color : '#999', versionLabel: r.version > 1 ? `v${r.version}` : '',
          dimDetail: SCORING_DIMENSIONS.map(dim => ({
            dimId: dim.id, dimTitle: dim.title,
            items: dim.items.map(item => ({
              id: item.id, label: item.label, maxScore: item.maxScore,
              score: (r.scores && r.scores[item.id]) || 0
            }))
          }))
        };
      });

      this.setData({
        loading: false, reviews: enriched,
        avgScore: ranking ? ranking.avgScore : '-',
        avgGrade: ranking ? getGrade(parseFloat(ranking.avgScore) || 0) : { label: '-', color: '#999' },
        median: ranking ? ranking.median : '-', maxScore: ranking ? ranking.maxScore : '-',
        minScore: ranking ? ranking.minScore : '-', range: ranking ? ranking.range : '-',
        avgFunding: ranking ? ranking.avgFunding : '-',
        reviewCount: ranking ? ranking.reviewCount : enriched.length,
        totalAssignments: ranking ? ranking.totalAssignments : 0,
        reviewStatus: ranking ? ranking.reviewStatus : '未开始'
      });
    } catch (e) { this.setData({ loading: false }); }
  },

  // ── 管理员退回评审 ──
  returnReview(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: `退回 ${name || ''} 的评审`,
      content: '退回后专家可以修改并重新提交。请填写退回原因：',
      editable: true,
      placeholderText: '请输入退回原因',
      success: async (res) => {
        if (!res.confirm || !res.content) {
          wx.showToast({ title: '请填写退回原因', icon: 'none' });
          return;
        }
        try {
          await adminReturnReview(id, res.content);
          wx.showToast({ title: '已退回', icon: 'success' });
          this.loadData();
        } catch (e) {}
      }
    });
  }
});
