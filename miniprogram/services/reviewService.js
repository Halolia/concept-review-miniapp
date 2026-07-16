/**
 * 评审记录服务 v1.1
 * 统一使用对象参数
 */

const { call } = require('../utils/request');

/**
 * 获取我的评审
 */
async function getMyReview(sessionId, projectId) {
  const res = await call('getMyReview', { sessionId, projectId });
  return res.data;
}

/**
 * 保存草稿
 */
async function saveDraft(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('参数格式错误');
  const res = await call('saveDraft', { reviewData: payload });
  return res.data;
}

/**
 * 提交评审 —— 统一对象参数
 * @param {object} payload
 * @param {string} payload.sessionId
 * @param {string} payload.projectId
 * @param {string} payload.reviewerId
 * @param {string} payload.reviewerName
 * @param {object} payload.scores - 15项评分
 * @param {string} payload.comments - 评审意见
 * @param {string} payload.recommendedFunding - 建议经费
 * @param {string} payload.fundingComment - 经费说明
 */
async function submitReview(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('提交参数格式错误');

  const {
    sessionId, projectId, reviewerId, reviewerName,
    scores, comments, recommendedFunding, fundingComment
  } = payload;

  const res = await call('expertSubmitReview', {
    sessionId, projectId, reviewerId, reviewerName,
    scores, comments, recommendedFunding, fundingComment
  });
  return res.data;
}

/**
 * 管理员获取项目评审结果
 */
async function adminGetProjectResult(sessionId, projectId) {
  const res = await call('adminGetProjectResult', { sessionId, projectId });
  return res.data;
}

/**
 * 管理员退回评审
 */
async function adminReturnReview(reviewId, reason) {
  const res = await call('adminReturnReview', { reviewId, reason });
  return res.data;
}

module.exports = { getMyReview, saveDraft, submitReview, adminGetProjectResult, adminReturnReview };
