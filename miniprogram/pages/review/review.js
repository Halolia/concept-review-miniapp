/**
 * 评审打分页 v1.1
 */
const app = getApp();
const { SCORING_DIMENSIONS, getBarColor, calcTotal } = require('../../utils/scoring');
const { getCurrentUserSync } = require('../../services/authService');
const { submitReview, saveDraft, getMyReview } = require('../../services/reviewService');
const { DEBUG_MODE } = require('../../utils/request');

function buildDimensions(scores) {
  return SCORING_DIMENSIONS.map(dim => ({
    ...dim,
    items: dim.items.map(item => {
      const currentScore = Number(scores[item.id]) || 0;
      const ms = item.maxScore;
      return {
        ...item, currentScore,
        progressPercent: ms > 0 ? (currentScore / ms * 100) : 0,
        progressColor: getBarColor(currentScore, ms)
      };
    })
  }));
}

Page({
  data: {
    projectId: '', projectName: '', sessionId: '',
    reviewerId: '', reviewerName: '',
    dimensions: buildDimensions({}), scores: {},
    totalScore: 0, grade: { label: '-', color: '#999' },
    comments: '', recommendedFunding: '', fundingComment: '',
    confirmed: false,
    reviewStatus: '',
    submitting: false, saving: false
  },

  onLoad(options) {
    const projectId = options.projectId;
    const projectName = decodeURIComponent(options.projectName || '');
    const sessionId = options.sessionId || '';

    let reviewerName = '';
    let reviewerId = '';
    if (DEBUG_MODE) {
      reviewerName = app.globalData.currentReviewerName;
      reviewerId = app.globalData.currentReviewerId;
    } else {
      const user = getCurrentUserSync();
      reviewerName = user ? user.name : '';
      reviewerId = user ? user._id : '';
    }

    const scores = {};
    SCORING_DIMENSIONS.forEach(dim => { dim.items.forEach(item => { scores[item.id] = 0; }); });

    this.setData({
      projectId, projectName, sessionId,
      reviewerId, reviewerName,
      scores, confirmed: false,
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
    const review = await getMyReview(this.data.sessionId, this.data.projectId).catch(() => null);
    if (review) this.applyReview(review);
  },

  applyReview(review) {
    const newScores = {};
    SCORING_DIMENSIONS.forEach(dim => { dim.items.forEach(item => { newScores[item.id] = 0; }); });
    if (review.scores) {
      Object.keys(newScores).forEach(k => { if (review.scores[k] !== undefined) newScores[k] = Number(review.scores[k]) || 0; });
    }
    this.updateScores(newScores);
    this.setData({
      comments: review.comments || '',
      recommendedFunding: String(review.recommendedFunding || ''),
      fundingComment: review.fundingComment || '',
      reviewStatus: review.status || '',
      reviewerName: review.reviewerNameSnapshot || review.expertName || this.data.reviewerName,
      confirmed: false // 重新进入时重置确认状态
    });
  },

  // ── 评分操作 ──
  increase(e) {
    if (this.data.reviewStatus === 'locked') return;
    const key = e.currentTarget.dataset.key;
    const max = parseInt(e.currentTarget.dataset.max);
    const val = this.data.scores[key] || 0;
    if (val < max) this.updateScores({ ...this.data.scores, [key]: val + 1 });
  },

  decrease(e) {
    if (this.data.reviewStatus === 'locked') return;
    const key = e.currentTarget.dataset.key;
    const val = this.data.scores[key] || 0;
    if (val > 0) this.updateScores({ ...this.data.scores, [key]: val - 1 });
  },

  onManualInput(e) {
    if (this.data.reviewStatus === 'locked') return;
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
    if (val !== this.data.scores[key]) this.updateScores({ ...this.data.scores, [key]: val });
  },

  onCommentInput(e) { this.setData({ comments: e.detail.value }); },
  onFundingInput(e) { this.setData({ recommendedFunding: e.detail.value }); },
  onFundingCommentInput(e) { this.setData({ fundingComment: e.detail.value }); },

  // checkbox-group 变更
  onConfirmChange(e) {
    const values = Array.isArray(e.detail.value) ? e.detail.value : [];
    this.setData({ confirmed: values.includes('confirmed') });
  },

  // ── 保存草稿 ──
  async saveDraft() {
    if (this.data.reviewStatus === 'locked') return;
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      await saveDraft({
        sessionId: this.data.sessionId,
        projectId: this.data.projectId,
        reviewerId: this.data.reviewerId,
        scores: this.data.scores, comments: this.data.comments,
        recommendedFunding: this.data.recommendedFunding,
        fundingComment: this.data.fundingComment
      });
      wx.showToast({ title: '草稿已保存', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally { this.setData({ saving: false }); }
  },

  // ── 提交评审 ──
  submitReview() {
    const { scores, comments, recommendedFunding, confirmed, reviewStatus } = this.data;
    if (reviewStatus === 'locked') return;

    if (!confirmed) {
      wx.showToast({ title: '请勾选确认签名', icon: 'none' }); return;
    }
    if (!comments.trim()) {
      wx.showToast({ title: '请输入评审意见', icon: 'none' }); return;
    }
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
      await submitReview({
        sessionId: this.data.sessionId, projectId: this.data.projectId,
        reviewerId: this.data.reviewerId, reviewerName: this.data.reviewerName,
        scores: this.data.scores, comments: this.data.comments,
        recommendedFunding: this.data.recommendedFunding,
        fundingComment: this.data.fundingComment
      });
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  }
});
