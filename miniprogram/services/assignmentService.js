/**
 * 评审指派服务
 */

const { call } = require('../utils/request');

/**
 * 专家：获取我的指派列表（含项目信息和评审状态）
 */
async function expertListAssignments() {
  const res = await call('expertListAssignments');
  return res.data || [];
}

/**
 * 管理员：获取所有指派（按项目/批次）
 */
async function adminListAssignments(roundId) {
  const res = await call('adminListAssignments', { roundId });
  return res.data || [];
}

/**
 * 管理员：为项目指派专家
 */
async function adminAssignExpert(projectId, roundId, expertId) {
  const res = await call('adminAssignExpert', { projectId, roundId, expertId });
  return res.data;
}

/**
 * 管理员：移除指派
 */
async function adminRemoveAssignment(assignmentId, reason) {
  const res = await call('adminRemoveAssignment', { assignmentId, reason });
  return res.data;
}

module.exports = {
  expertListAssignments,
  adminListAssignments,
  adminAssignExpert,
  adminRemoveAssignment
};
