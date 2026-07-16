/**
 * 评审打分页 — 路演现场评分
 * 状态：none(新) / draft(草稿) / submitted(已提交可修改) / locked(已锁定只读)
 */
const { SCORING_DIMENSIONS, getBarColor, calcTotal } = require('../../utils/scoring');
const { getMyReview, saveDraft, submitReview } = require('../../services/reviewService');

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
    projectId: '', projectName: '',
    reviewStatus: 'none',  // none | draft | submitted | locked
    dimensions: buildDimensions({}), scores: {},
    totalScore: 0, grade: { label: '-', color: '#999' },
    comments: '', recommendedFunding: '', fundingComment: '',
    reviewerName: '', reviewId: '',
    submitting: false, saving: false,
    confirmed: false       // 签名确认 checkbox
  },

  onLoad(options) {
    const projectId = options.projectId;
    const projectName = decodeURIComponent(options.projectName || '');

    const scores = {};
    SCORING_DIMENSIONS.forEach(dim => {
      dim.items.forEach(item => { scores[item.id] = 0; });
    });

    const app = getApp();
    const reviewerName = app.globalData.userName || '';

    this.setData({
      projectId, projectName,
      scores, reviewerName,
      dimensions: buildDimensions(scores)
    });
    this.loadExistingReview();
  },

  /** 加载已有评审 */
  async loadExistingReview() {
    try {
      const app = getApp();
      const review = await getMyReview(
        app.globalData.sessionId,
        this.data.projectId
      );
      if (review) {
        const newScores = {};
        SCORING_DIMENSIONS.forEach(dim => {
          dim.items.forEach(item => {
            newScores[item.id] = review.scores && review.scores[item.id] !== undefined
              ? Number(review.scores[item.id]) : 0;
          });
        });
        this.setData({
          scores: newScores,
          comments: review.comments || '',
          recommendedFunding: String(review.recommendedFunding || ''),
          fundingComment: review.fundingComment || '',
          reviewerName: review.expertName || review.reviewerName || this.data.reviewerName,
          reviewStatus: review.status || 'none',
          reviewId: review._id || '',
        });
        this.updateScores(newScores);
      }
    } catch (e) {
      // 无已有评审，保持 none 状态
    }
  },

  /** 统一更新评分 */
  updateScores(nextScores) {
    const result = calcTotal(nextScores);
    this.setData({
      scores: nextScores,
      dimensions: buildDimensions(nextScores),
      totalScore: result.totalScore,
      grade: result.grade
    });
  },

  /** 是否可编辑：非 locked 即可 */
  get editable() {
    return this.data.reviewStatus !== 'locked';
  },

  // ── 评分操作 ──
  increase(e) {
    if (!this.editable) return;
    const key = e.currentTarget.dataset.key;
    const max = parseInt(e.currentTarget.dataset.max);
    const val = this.data.scores[key] || 0;
    if (val < max) {
      this.updateScores({ ...this.data.scores, [key]: val + 1 });
    }
  },

  decrease(e) {
    if (!this.editable) return;
    const key = e.currentTarget.dataset.key;
    const val = this.data.scores[key] || 0;
    if (val > 0) {
      this.updateScores({ ...this.data.scores, [key]: val - 1 });
    }
  },

  onManualInput(e) {
    if (!this.editable) return;
    const key = e.currentTarget.dataset.key;
    const raw = parseInt(e.detail.value);
    this.updateScores({ ...this.data.scores, [key]: isNaN(raw) ? 0 : raw });
  },

  onBlurCheck(e) {
    if (!this.editable) return;
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
  onConfirmChange() { this.setData({ confirmed: !this.data.confirmed }); },

  // ── 保存草稿 ──
  async saveDraft() {
    if (!this.editable || this.data.saving) return;
    this.setData({ saving: true });
    try {
      const app = getApp();
      await saveDraft(app.globalData.sessionId, this.data.projectId, {
        scores: this.data.scores,
        comments: this.data.comments,
        recommendedFunding: this.data.recommendedFunding,
        fundingComment: this.data.fundingComment
      });
      this.setData({ reviewStatus: 'draft' });
      wx.showToast({ title: '草稿已保存', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // ── 提交评审 ──
  submitReview() {
    if (!this.editable) return;

    const { scores, comments, recommendedFunding, confirmed } = this.data;
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
    if (!confirmed) {
      wx.showToast({ title: '请勾选确认签名', icon: 'none' }); return;
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
      const app = getApp();
      await submitReview(app.globalData.sessionId, this.data.projectId, {
        scores: this.data.scores,
        comments: this.data.comments,
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
