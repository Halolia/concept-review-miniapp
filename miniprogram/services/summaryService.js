/**
 * 汇总统计服务
 */

const { call } = require('../utils/request');

/**
 * 管理员：获取汇总数据（排名等）
 */
async function adminGetSummary(roundId) {
  const res = await call('adminGetSummary', { roundId });
  return res.data || {};
}

/**
 * 领导：获取汇总数据
 */
async function leaderGetSummary(roundId) {
  const res = await call('leaderGetSummary', { roundId });
  return res.data || {};
}

/**
 * 管理员：获取评审批次列表
 */
async function adminListReviewRounds() {
  const res = await call('adminListReviewRounds');
  return res.data || [];
}

/**
 * 管理员：创建评审批次
 */
async function adminCreateReviewRound(round) {
  const res = await call('adminCreateReviewRound', { round });
  return res.data;
}

/**
 * 管理员：开启评审批次
 */
async function adminOpenReviewRound(roundId) {
  const res = await call('adminOpenReviewRound', { roundId });
  return res.data;
}

/**
 * 管理员：关闭评审批次
 */
async function adminCloseReviewRound(roundId) {
  const res = await call('adminCloseReviewRound', { roundId });
  return res.data;
}

module.exports = {
  adminGetSummary,
  leaderGetSummary,
  adminListReviewRounds,
  adminCreateReviewRound,
  adminOpenReviewRound,
  adminCloseReviewRound
};
