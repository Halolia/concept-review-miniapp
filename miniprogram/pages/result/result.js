const { isAdmin, isLeader } = require('../../services/authService');
const { adminGetProjectResult } = require('../../services/reviewService');
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
  }
});
