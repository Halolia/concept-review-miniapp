const { isAdmin, isLeader } = require('../../services/authService');
const { adminGetProjectResult } = require('../../services/reviewService');
const { adminGetSummary } = require('../../services/summaryService');
const { SCORING_DIMENSIONS, getGrade } = require('../../utils/scoring');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    projectId: '',
    projectName: '',
    project: {},
    reviews: [],
    avgScore: '-',
    avgGrade: { label: '-', color: '#999' },
    median: '-',
    maxScore: '-',
    minScore: '-',
    range: '-',
    avgFunding: '-',
    reviewCount: 0,
    totalAssignments: 0,
    loading: true
  },

  onLoad(options) {
    this.setData({
      projectId: options.projectId,
      projectName: decodeURIComponent(options.projectName || '')
    });
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
      // 获取评审记录
      const reviews = await adminGetProjectResult(this.data.projectId);

      // 获取汇总中的统计信息
      let summaryRes;
      try {
        summaryRes = await adminGetSummary();
      } catch (e) { summaryRes = { rankings: [] }; }

      const ranking = (summaryRes.rankings || []).find(r => r.projectId === this.data.projectId);

      // 丰富评审记录: 添加维度详情
      const enriched = (reviews || []).map(r => {
        const grade = getGrade(r.totalScore);
        const dimDetail = SCORING_DIMENSIONS.map(dim => ({
          dimId: dim.id,
          dimTitle: dim.title,
          items: dim.items.map(item => ({
            id: item.id,
            label: item.label,
            maxScore: item.maxScore,
            score: (r.scores && r.scores[item.id]) || 0
          }))
        }));

        return {
          ...r,
          timeStr: r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '',
          gradeColor: grade ? grade.color : '#999',
          dimDetail,
          versionLabel: r.version > 1 ? `v${r.version}` : ''
        };
      });

      this.setData({
        loading: false,
        reviews: enriched,
        avgScore: ranking ? ranking.avgScore : '-',
        avgGrade: ranking ? getGrade(parseFloat(ranking.avgScore)) : { label: '-', color: '#999' },
        median: ranking ? ranking.median : '-',
        maxScore: ranking ? ranking.maxScore : '-',
        minScore: ranking ? ranking.minScore : '-',
        range: ranking ? ranking.range : '-',
        avgFunding: ranking ? ranking.avgFunding : '-',
        reviewCount: ranking ? ranking.reviewCount : enriched.length,
        totalAssignments: ranking ? ranking.totalAssignments : 0,
        reviewStatus: ranking ? ranking.reviewStatus : '未开始'
      });
    } catch (e) {
      console.error('加载评审详情失败:', e);
      this.setData({ loading: false });
    }
  }
});
