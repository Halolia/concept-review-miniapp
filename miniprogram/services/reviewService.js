/**
 * 评审记录服务
 */

const { call } = require('../utils/request');

/**
 * 专家：获取评审草稿（已废弃，请用 expertGetMyReview）
 */
async function expertGetReviewDraft(assignmentId) {
  const res = await call('expertGetReviewDraft', { assignmentId });
  return res.data;
}

/**
 * 专家：获取我的评审记录（不限状态）
 */
async function expertGetMyReview(assignmentId) {
  const res = await call('expertGetMyReview', { assignmentId });
  return res.data;
}

/**
 * 专家：保存评审草稿
 */
async function expertSaveReviewDraft(reviewData) {
  const res = await call('expertSaveReviewDraft', { reviewData });
  return res.data;
}

/**
 * 专家：提交评审
 * @param {string} assignmentId
 * @param {object} scores - 15 项分数
 * @param {string} comments - 评审意见
 * @param {number} recommendedFunding - 建议经费（万元）
 * @param {string} fundingComment - 经费说明
 */
async function expertSubmitReview(assignmentId, scores, comments, recommendedFunding, fundingComment) {
  const res = await call('expertSubmitReview', {
    assignmentId, scores, comments, recommendedFunding, fundingComment
  });
  return res.data;
}

/**
 * 管理员：退回评审
 */
async function adminReturnReview(reviewId, reason) {
  const res = await call('adminReturnReview', { reviewId, reason });
  return res.data;
}

/**
 * 管理员：获取项目的评审结果
 */
async function adminGetProjectResult(projectId, roundId) {
  const res = await call('adminGetProjectResult', { projectId, roundId });
  return res.data;
}

module.exports = {
  expertGetReviewDraft,
  expertGetMyReview,
  expertSaveReviewDraft,
  expertSubmitReview,
  adminReturnReview,
  adminGetProjectResult
};
