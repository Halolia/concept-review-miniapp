/**
 * 评审打分页 —— 核心页面
 * 支持：草稿保存 / 正式提交 / 退回重提 / 只读查看
 */
const app = getApp();
const { SCORING_DIMENSIONS, getBarColor, calcTotal } = require('../../utils/scoring');
const { getCurrentUserSync } = require('../../services/authService');
const { expertGetReviewDraft, expertSubmitReview, expertSaveReviewDraft } = require('../../services/reviewService');
const { DEBUG_MODE } = require('../../utils/request');

/**
 * 拷贝 dimensions 并嵌入当前分数和进度条数据（WXML 只能读字段，不能调方法）
 */
function buildDimensions(scores) {
  return SCORING_DIMENSIONS.map(dim => ({
    ...dim,
    items: dim.items.map(item => {
      const currentScore = Number(scores[item.id]) || 0;
      const maxScore = item.maxScore;
      const progressPercent = maxScore > 0 ? (currentScore / maxScore * 100) : 0;
      const progressColor = getBarColor(currentScore, maxScore);
      return { ...item, currentScore, progressPercent, progressColor };
    })
  }));
}

Page({
  data: {
    projectId: '',
    projectName: '',
    assignmentId: '',
    isReadonly: false,
    isReturned: false,
    dimensions: buildDimensions({}),
    scores: {},
    totalScore: 0,
    grade: { label: '-', color: '#999' },
    comments: '',
    recommendedFunding: '',
    fundingComment: '',
    reviewerName: '',
    returnReason: '',
    submitting: false,
    saving: false,
    isEdit: false,
    savedReviewId: null,
    version: 1,
    reviewStatus: ''
  },

  onLoad(options) {
    const projectId = options.projectId;
    const projectName = decodeURIComponent(options.projectName || '');
    const assignmentId = options.assignmentId || '';
    const readonly = options.readonly === 'true';

    const scores = {};
    SCORING_DIMENSIONS.forEach(dim => {
      dim.items.forEach(item => { scores[item.id] = 0; });
    });

    let reviewerName = '';
    if (DEBUG_MODE) {
      reviewerName = app.globalData.currentReviewerName;
    } else {
      const user = getCurrentUserSync();
      reviewerName = user ? user.name : '';
    }

    this.setData({
      projectId, projectName, assignmentId,
      isReadonly: readonly,
      scores, reviewerName,
      dimensions: buildDimensions(scores)
    });

    this.loadReview();
  },

  /**
   * 加载评审数据
   * - 只读模式：调用 expertGetReviewDraft 找任何状态的记录（draft/submitted/returned/locked）
   * - 编辑模式：找 draft 或 returned
   */
  async loadReview() {
    // 先尝试 draft 专用接口
    const draft = await expertGetReviewDraft(this.data.assignmentId).catch(() => null);

    if (draft) {
      this.applyReview(draft);
      this.setData({ isEdit: true, savedReviewId: draft._id, version: draft.version || 1 });
      return;
    }

    // draft 没找到，尝试从本地 DEBUG 数据找（含 submitted/returned/locked）
    if (this.data.isReadonly || DEBUG_MODE) {
      const allReviews = wx.getStorageSync('cr_reviews_all') || [];
      const saved = allReviews.find(
        r => r.assignmentId === this.data.assignmentId ||
             r._id === this.data.assignmentId
      );
      if (saved) this.applyReview(saved);
    }

    // 退回状态：加载已有记录用于编辑
    if (!this.data.isReadonly) {
      const allReviews = wx.getStorageSync('cr_reviews_all') || [];
      const returned = allReviews.find(
        r => (r.assignmentId === this.data.assignmentId) && r.status === 'returned'
      );
      if (returned) {
        this.applyReview(returned);
        this.setData({ isEdit: true, savedReviewId: returned._id, version: returned.version || 1 });
      }
    }
  },

  applyReview(review) {
    const newScores = {};
    SCORING_DIMENSIONS.forEach(dim => {
      dim.items.forEach(item => { newScores[item.id] = 0; });
    });
    if (review.scores) {
      Object.keys(newScores).forEach(k => {
        if (review.scores[k] !== undefined) newScores[k] = Number(review.scores[k]) || 0;
      });
    }

    this.setData({
      scores: newScores,
      comments: review.comments || '',
      recommendedFunding: String(review.recommendedFunding || ''),
      fundingComment: review.fundingComment || '',
      reviewerName: review.expertName || review.reviewerName || this.data.reviewerName,
      reviewStatus: review.status || '',
      isReturned: review.status === 'returned',
      returnReason: review.returnReason || '',
      totalScore: review.totalScore || 0,
      grade: review.grade ? { label: review.grade, color: getBarColor(0, 1) === '#07c160' ? '#07c160' : '#999' } : { label: '-', color: '#999' }
    });
    this.recalcTotal();
  },

  // ── 评分操作 ──

  increase(e) {
    if ((this.data.isReadonly && !this.data.isReturned) || this.data.reviewStatus === 'locked') return;
    const key = e.currentTarget.dataset.key;
    const max = parseInt(e.currentTarget.dataset.max);
    const val = this.data.scores[key] || 0;
    if (val < max) {
      const scores = { ...this.data.scores, [key]: val + 1 };
      this.setData({ scores, dimensions: buildDimensions(scores) });
    }
  },

  decrease(e) {
    if ((this.data.isReadonly && !this.data.isReturned) || this.data.reviewStatus === 'locked') return;
    const key = e.currentTarget.dataset.key;
    const val = this.data.scores[key] || 0;
    if (val > 0) {
      const scores = { ...this.data.scores, [key]: val - 1 };
      this.setData({ scores, dimensions: buildDimensions(scores) });
    }
  },

  onManualInput(e) {
    if ((this.data.isReadonly && !this.data.isReturned) || this.data.reviewStatus === 'locked') return;
    const key = e.currentTarget.dataset.key;
    const raw = parseInt(e.detail.value);
    const val = isNaN(raw) ? 0 : raw;
    const scores = { ...this.data.scores, [key]: val };
    this.setData({ scores, dimensions: buildDimensions(scores) });
  },

  onBlurCheck(e) {
    const key = e.currentTarget.dataset.key;
    let val = this.data.scores[key] || 0;
    let maxScore = 5;
    for (const dim of SCORING_DIMENSIONS) {
      const item = dim.items.find(i => i.id === key);
      if (item) { maxScore = item.maxScore; break; }
    }
    if (val < 0) val = 0;
    if (val > maxScore) val = maxScore;
    if (val !== this.data.scores[key]) {
      const scores = { ...this.data.scores, [key]: val };
      this.setData({ scores, dimensions: buildDimensions(scores) });
    }
  },

  recalcTotal() {
    const result = calcTotal(this.data.scores);
    this.setData({ totalScore: result.totalScore, grade: result.grade });
  },

  onCommentInput(e) { this.setData({ comments: e.detail.value }); },
  onFundingInput(e) { this.setData({ recommendedFunding: e.detail.value }); },
  onFundingCommentInput(e) { this.setData({ fundingComment: e.detail.value }); },
  onNameInput(e) {
    if (DEBUG_MODE) this.setData({ reviewerName: e.detail.value });
  },

  // ── 保存草稿 ──
  async saveDraft() {
    if ((this.data.isReadonly && !this.data.isReturned) || this.data.reviewStatus === 'locked') return;
    if (this.data.saving) return;

    this.setData({ saving: true });
    try {
      await expertSaveReviewDraft({
        assignmentId: this.data.assignmentId,
        scores: this.data.scores,
        comments: this.data.comments,
        recommendedFunding: this.data.recommendedFunding,
        fundingComment: this.data.fundingComment
      });
      wx.showToast({ title: '草稿已保存', icon: 'success' });
    } catch (e) {
      console.error('保存草稿失败:', e);
    } finally {
      this.setData({ saving: false });
    }
  },

  // ── 提交评审 ──
  submitReview() {
    const { scores, comments, recommendedFunding, reviewerName, isReadonly, isReturned, reviewStatus } = this.data;
    if ((isReadonly && !isReturned) || reviewStatus === 'locked') return;

    if (DEBUG_MODE && !reviewerName.trim()) {
      wx.showToast({ title: '请输入评审专家姓名', icon: 'none' }); return;
    }
    if (!comments.trim()) {
      wx.showToast({ title: '请输入评审意见', icon: 'none' }); return;
    }
    const funding = parseFloat(recommendedFunding);
    if (recommendedFunding && (isNaN(funding) || funding < 0)) {
      wx.showToast({ title: '建议经费需为合法非负数字', icon: 'none' }); return;
    }

    let hasZero = false;
    SCORING_DIMENSIONS.forEach(dim => {
      dim.items.forEach(item => { if ((scores[item.id] || 0) === 0) hasZero = true; });
    });
    if (hasZero) {
      wx.showModal({
        title: '提示',
        content: '有评分项尚未打分（当前为0分），确认提交吗？',
        success: (res) => { if (res.confirm) this.doSubmit(); }
      });
      return;
    }
    this.doSubmit();
  },

  async doSubmit() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    try {
      await expertSubmitReview(
        this.data.assignmentId,
        this.data.scores,
        this.data.comments,
        this.data.recommendedFunding,
        this.data.fundingComment
      );
      wx.showToast({ title: this.data.isReturned ? '重新提交成功' : '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (e) {
      this.setData({ submitting: false });
    }
  }
});
