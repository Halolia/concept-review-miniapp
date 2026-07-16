/**
 * 评审结果详情 — 路演现场评分
 * 管理员查看单项目各评委的评分详情
 * 支持 per-reviewer detail toggle
 */
const { isAdmin } = require('../../services/authService');
const { adminGetProjectResult, adminReturnReview } = require('../../services/reviewService');
const { SCORING_DIMENSIONS, getGrade } = require('../../utils/scoring');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    projectId: '', projectName: '', sessionId: '',
    reviews: [], avgScore: '-', avgGrade: { label: '-', color: '#999' },
    median: '-', maxScore: '-', minScore: '-', range: '-', avgFunding: '-',
    reviewCount: 0, totalAssignments: 0, loading: true,

    // Per-reviewer toggle
    expandedReviewers: {}  // { reviewerId: true }
  },

  onLoad(options) {
    this.setData({
      projectId: options.projectId || '',
      projectName: decodeURIComponent(options.projectName || ''),
      sessionId: options.sessionId || ''
    });
  },

  async onShow() {
    if (!isAdmin() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500); return;
    }
    await this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const reviews = await adminGetProjectResult(this.data.sessionId, this.data.projectId);
      const enriched = (reviews || []).map(r => {
        const grade = getGrade(r.totalScore);
        return {
          ...r,
          timeStr: r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '',
          gradeColor: grade ? grade.color : '#999',
          versionLabel: r.version > 1 ? `v${r.version}` : '',
          dimDetail: SCORING_DIMENSIONS.map(dim => ({
            dimId: dim.id, dimTitle: dim.title,
            items: dim.items.map(item => ({
              id: item.id, label: item.label, maxScore: item.maxScore,
              score: (r.scores && r.scores[item.id]) || 0
            }))
          }))
        };
      });

      // 计算统计
      const scores = enriched.filter(r =>
        ['submitted', 'resubmitted', 'locked'].includes(r.status)
      ).map(r => r.totalScore);
      let stats = { avgScore: '-', avgGrade: { label: '-', color: '#999' }, median: '-', maxScore: '-', minScore: '-', range: '-' };
      if (scores.length > 0) {
        const sorted = [...scores].sort((a, b) => a - b);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const median = sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
        const grade = getGrade(avg);
        stats = {
          avgScore: avg.toFixed(1),
          avgGrade: grade,
          median: median.toFixed(1),
          maxScore: sorted[sorted.length - 1],
          minScore: sorted[0],
          range: (sorted[sorted.length - 1] - sorted[0]).toFixed(1)
        };
      }
      const fundings = enriched
        .filter(r => ['submitted', 'resubmitted', 'locked'].includes(r.status))
        .map(r => r.recommendedFunding).filter(f => f !== null && f !== undefined);
      const avgFunding = fundings.length > 0
        ? (fundings.reduce((a, b) => a + b, 0) / fundings.length).toFixed(2)
        : '-';

      this.setData({
        loading: false, reviews: enriched,
        ...stats, avgFunding,
        reviewCount: scores.length,
        totalAssignments: enriched.length
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  /** 切换单个评委评审详情展开/收起 */
  toggleReviewerDetail(e) {
    const { id } = e.currentTarget.dataset;
    const expanded = { ...this.data.expandedReviewers };
    if (expanded[id]) {
      delete expanded[id];
    } else {
      expanded[id] = true;
    }
    this.setData({ expandedReviewers: expanded });
  },

  /** 退回评审 */
  returnReview(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: `退回 ${name || ''} 的评审`,
      content: '退回后评委可以修改并重新提交。请填写退回原因：',
      editable: true,
      placeholderText: '请输入退回原因',
      success: async (res) => {
        if (!res.confirm || !res.content) {
          wx.showToast({ title: '请填写退回原因', icon: 'none' }); return;
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
