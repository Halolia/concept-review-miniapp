/**
 * 评审打分页 v1.0.2
 */
const app = getApp();
const { SCORING_DIMENSIONS, getBarColor, calcTotal } = require('../../utils/scoring');
const { getCurrentUserSync } = require('../../services/authService');
const { expertGetMyReview, expertSubmitReview, expertSaveReviewDraft } = require('../../services/reviewService');
const { DEBUG_MODE } = require('../../utils/request');

function buildDimensions(scores) {
  return SCORING_DIMENSIONS.map(dim => ({
    ...dim,
    items: dim.items.map(item => {
      const currentScore = Number(scores[item.id]) || 0;
      const ms = item.maxScore;
      return {
        ...item,
        currentScore,
        progressPercent: ms > 0 ? (currentScore / ms * 100) : 0,
        progressColor: getBarColor(currentScore, ms)
      };
    })
  }));
}

Page({
  data: {
    projectId: '', projectName: '', assignmentId: '',
    isReadonly: false, isReturned: false,
    dimensions: buildDimensions({}), scores: {},
    totalScore: 0, grade: { label: '-', color: '#999' },
    comments: '', recommendedFunding: '', fundingComment: '',
    reviewerName: '', returnReason: '',
    submitting: false, saving: false,
    isEdit: false, savedReviewId: null, version: 1, reviewStatus: ''
  },

  onLoad(options) {
    const projectId = options.projectId;
    const projectName = decodeURIComponent(options.projectName || '');
    const assignmentId = options.assignmentId || '';
    const readonly = options.readonly === 'true';

    const scores = {};
    SCORING_DIMENSIONS.forEach(dim => { dim.items.forEach(item => { scores[item.id] = 0; }); });

    let reviewerName = '';
    if (DEBUG_MODE) {
      reviewerName = app.globalData.currentReviewerName;
    } else {
      const user = getCurrentUserSync();
      reviewerName = user ? user.name : '';
    }

    this.setData({
      projectId, projectName, assignmentId,
      isReadonly: readonly, scores, reviewerName,
      dimensions: buildDimensions(scores)
    });
    this.loadReview();
  },

  // ── 统一更新评分 ──
  updateScores(nextScores) {
    const result = calcTotal(nextScores);
    this.setData({
      scores: nextScores,
      dimensions: buildDimensions(nextScores),
      totalScore: result.totalScore,
      grade: result.grade
    });
  },

  // ── 加载评审 ──
  async loadReview() {
    const review = await expertGetMyReview(this.data.assignmentId).catch(() => null);
    if (review) {
      this.applyReview(review);
      this.setData({ isEdit: true, savedReviewId: review._id, version: review.version || 1 });
    }
  },

  applyReview(review) {
    const newScores = {};
    SCORING_DIMENSIONS.forEach(dim => { dim.items.forEach(item => { newScores[item.id] = 0; }); });
    if (review.scores) {
      Object.keys(newScores).forEach(k => { if (review.scores[k] !== undefined) newScores[k] = Number(review.scores[k]) || 0; });
    }
    this.setData({
      scores: newScores,
      comments: review.comments || '',
      recommendedFunding: String(review.recommendedFunding || ''),
      fundingComment: review.fundingComment || '',
      reviewerName: review.expertName || review.reviewerName || this.data.reviewerName,
      reviewStatus: review.status || '',
      isReturned: review.status === 'returned',
      returnReason: review.returnReason || ''
    });
    this.updateScores(newScores);
  },

  // ── 评分操作 ──
  increase(e) {
    if ((this.data.isReadonly && !this.data.isReturned) || this.data.reviewStatus === 'locked') return;
    const key = e.currentTarget.dataset.key;
    const max = parseInt(e.currentTarget.dataset.max);
    const val = this.data.scores[key] || 0;
    if (val < max) {
      this.updateScores({ ...this.data.scores, [key]: val + 1 });
    }
  },

  decrease(e) {
    if ((this.data.isReadonly && !this.data.isReturned) || this.data.reviewStatus === 'locked') return;
    const key = e.currentTarget.dataset.key;
    const val = this.data.scores[key] || 0;
    if (val > 0) {
      this.updateScores({ ...this.data.scores, [key]: val - 1 });
    }
  },

  onManualInput(e) {
    if ((this.data.isReadonly && !this.data.isReturned) || this.data.reviewStatus === 'locked') return;
    const key = e.currentTarget.dataset.key;
    const raw = parseInt(e.detail.value);
    this.updateScores({ ...this.data.scores, [key]: isNaN(raw) ? 0 : raw });
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
      this.updateScores({ ...this.data.scores, [key]: val });
    }
  },

  onCommentInput(e) { this.setData({ comments: e.detail.value }); },
  onFundingInput(e) { this.setData({ recommendedFunding: e.detail.value }); },
  onFundingCommentInput(e) { this.setData({ fundingComment: e.detail.value }); },
  onNameInput(e) { if (DEBUG_MODE) this.setData({ reviewerName: e.detail.value }); },

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
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
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
    // 经费必填
    if (!recommendedFunding && recommendedFunding !== '0') {
      wx.showToast({ title: '建议经费不能为空', icon: 'none' }); return;
    }
    const funding = parseFloat(recommendedFunding);
    if (isNaN(funding) || funding < 0) {
      wx.showToast({ title: '建议经费需为合法非负数字', icon: 'none' }); return;
    }
    if (funding === 0 && (!this.data.fundingComment || !this.data.fundingComment.trim())) {
      wx.showToast({ title: '经费为0万元时请填写经费说明', icon: 'none' }); return;
    }

    let hasZero = false;
    SCORING_DIMENSIONS.forEach(dim => {
      dim.items.forEach(item => { if ((scores[item.id] || 0) === 0) hasZero = true; });
    });
    if (hasZero) {
      wx.showModal({
        title: '提示', content: '有评分项尚未打分（当前为0分），确认提交吗？',
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
        this.data.assignmentId, this.data.scores, this.data.comments,
        this.data.recommendedFunding, this.data.fundingComment
      );
      wx.showToast({ title: this.data.isReturned ? '重新提交成功' : '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  }
});
