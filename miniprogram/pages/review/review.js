/**
 * 评审打分页 —— 核心页面
 * 支持：草稿保存 / 正式提交 / 退回重提 / 只读查看
 */
const app = getApp();
const { SCORING_DIMENSIONS } = require('../../utils/scoring');
const { getCurrentUserSync } = require('../../services/authService');
const { expertGetReviewDraft, expertSaveReviewDraft, expertSubmitReview } = require('../../services/reviewService');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    projectId: '',
    projectName: '',
    assignmentId: '',
    isReadonly: false,       // 提交后只读
    isReturned: false,       // 退回重提
    dimensions: SCORING_DIMENSIONS,
    scores: {},
    totalScore: 0,
    grade: { label: '-', color: '#999' },
    comments: '',
    recommendedFunding: '',  // 建议经费（万元）
    fundingComment: '',      // 经费说明
    reviewerName: '',
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

    // 初始化所有评分为 0
    const scores = {};
    SCORING_DIMENSIONS.forEach(dim => {
      dim.items.forEach(item => { scores[item.id] = 0; });
    });

    // 获取用户名
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
      scores, reviewerName
    });

    this.loadDraft();
  },

  async loadDraft() {
    if (this.data.isReadonly) {
      // 只读模式：加载已提交的评审
      try {
        const review = await expertGetReviewDraft(this.data.assignmentId);
        // 草稿就是 null，找已提交的（通过本地存储兜底）
        if (review) {
          this.applyReview(review);
        } else if (DEBUG_MODE) {
          // DEBUG 模式从存储找
          const allReviews = wx.getStorageSync('cr_reviews_all') || [];
          const saved = allReviews.find(r => r.assignmentId === this.data.assignmentId);
          if (saved) this.applyReview(saved);
        }
      } catch (e) { console.error('加载评审失败:', e); }
      return;
    }

    // 编辑模式：加载草稿或已退回的
    try {
      const draft = await expertGetReviewDraft(this.data.assignmentId);
      if (draft) {
        this.applyReview(draft);
        this.setData({ isEdit: true, savedReviewId: draft._id, version: draft.version || 1 });
      }
    } catch (e) { console.error('加载草稿失败:', e); }
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
      isReturned: review.status === 'returned'
    });
    this.recalcTotal();
  },

  increase(e) {
    if (this.data.isReadonly && !this.data.isReturned) return;
    const key = e.currentTarget.dataset.key;
    const max = parseInt(e.currentTarget.dataset.max);
    const val = this.data.scores[key] || 0;
    if (val < max) {
      const scores = { ...this.data.scores, [key]: val + 1 };
      this.setData({ scores });
      this.recalcTotal();
    }
  },

  decrease(e) {
    if (this.data.isReadonly && !this.data.isReturned) return;
    const key = e.currentTarget.dataset.key;
    const val = this.data.scores[key] || 0;
    if (val > 0) {
      const scores = { ...this.data.scores, [key]: val - 1 };
      this.setData({ scores });
      this.recalcTotal();
    }
  },

  onManualInput(e) {
    if (this.data.isReadonly && !this.data.isReturned) return;
    const key = e.currentTarget.dataset.key;
    const raw = parseInt(e.detail.value);
    const val = isNaN(raw) ? 0 : raw;
    const scores = { ...this.data.scores, [key]: val };
    this.setData({ scores });
    this.recalcTotal();
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
      this.setData({ scores });
      this.recalcTotal();
    }
  },

  recalcTotal() {
    const { calcTotal } = require('../../utils/scoring');
    const result = calcTotal(this.data.scores);
    this.setData({ totalScore: result.totalScore, grade: result.grade });
  },

  getBarColor(score, max) {
    if (!score || !max) return '#e5e5e5';
    const ratio = score / max;
    if (ratio >= 0.9) return '#07c160';
    if (ratio >= 0.6) return '#1989fa';
    if (ratio >= 0.3) return '#ff976a';
    return '#ee0a24';
  },

  onCommentInput(e) { this.setData({ comments: e.detail.value }); },
  onFundingInput(e) { this.setData({ recommendedFunding: e.detail.value }); },
  onFundingCommentInput(e) { this.setData({ fundingComment: e.detail.value }); },
  onNameInput(e) {
    // 只在 DEBUG 模式下允许修改姓名
    if (DEBUG_MODE) this.setData({ reviewerName: e.detail.value });
  },

  // ── 保存草稿 ──
  async saveDraft() {
    if (this.data.isReadonly && !this.data.isReturned) return;
    if (this.data.saving) return;

    this.setData({ saving: true });
    try {
      const reviewData = {
        assignmentId: this.data.assignmentId,
        scores: this.data.scores,
        comments: this.data.comments,
        recommendedFunding: this.data.recommendedFunding,
        fundingComment: this.data.fundingComment
      };
      await expertSaveReviewDraft(reviewData);
      wx.showToast({ title: '草稿已保存', icon: 'success' });
    } catch (e) {
      console.error('保存草稿失败:', e);
    } finally {
      this.setData({ saving: false });
    }
  },

  // ── 提交评审 ──
  submitReview() {
    const { scores, comments, recommendedFunding, reviewerName, isReadonly, isReturned } = this.data;

    if (isReadonly && !isReturned) return;

    if (DEBUG_MODE && !reviewerName.trim()) {
      wx.showToast({ title: '请输入评审专家姓名', icon: 'none' });
      return;
    }

    if (!comments.trim()) {
      wx.showToast({ title: '请输入评审意见', icon: 'none' });
      return;
    }

    const funding = parseFloat(recommendedFunding);
    if (recommendedFunding && (isNaN(funding) || funding < 0)) {
      wx.showToast({ title: '建议经费需为合法非负数字', icon: 'none' });
      return;
    }

    // 检查是否有未评分的项
    let hasZero = false;
    SCORING_DIMENSIONS.forEach(dim => {
      dim.items.forEach(item => {
        if ((scores[item.id] || 0) === 0) hasZero = true;
      });
    });
    if (hasZero) {
      wx.showModal({
        title: '提示',
        content: '有评分项尚未打分（当前为0分），确认提交吗？',
        success: (res) => {
          if (res.confirm) this.doSubmit();
        }
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
