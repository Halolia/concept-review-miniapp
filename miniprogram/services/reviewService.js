/**
 * 评审记录服务 — 路演现场评分
 */

const { call } = require('../utils/request');

/**
 * 评审人：获取我对某项目的评审（若有）
 * @param {string} sessionId
 * @param {string} projectId
 */
async function getMyReview(sessionId, projectId) {
  const res = await call('reviewerGetMyReview', { sessionId, projectId });
  return res.data;
}

/**
 * 评审人：保存评审草稿
 * @param {string} sessionId
 * @param {string} projectId
 * @param {object} data { scores, comments, recommendedFunding, fundingComment }
 */
async function saveDraft(sessionId, projectId, data) {
  const res = await call('reviewerSaveDraft', { sessionId, projectId, data });
  return res.data;
}

/**
 * 评审人：提交评审
 * @param {string} sessionId
 * @param {string} projectId
 * @param {object} data { scores, comments, recommendedFunding, fundingComment }
 */
async function submitReview(sessionId, projectId, data) {
  const res = await call('reviewerSubmitReview', { sessionId, projectId, data });
  return res.data;
}

/**
 * 管理员：获取项目的评审结果
 */
async function adminGetProjectResult(sessionId, projectId) {
  const res = await call('adminGetProjectResult', { sessionId, projectId });
  return res.data;
}

/**
 * 管理员：退回评审
 */
async function adminReturnReview(reviewId, reason) {
  const res = await call('adminReturnReview', { reviewId, reason });
  return res.data;
}

module.exports = {
  getMyReview,
  saveDraft,
  submitReview,
  adminGetProjectResult,
  adminReturnReview
};
