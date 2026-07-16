/**
 * 邀请码服务
 * 评审人扫码绑定流程
 */

const { call } = require('../utils/request');

/**
 * 扫描邀请码，查找会话和评审人信息
 * @param {string} token 二维码中的邀请 token
 * @returns {{ sessionId, sessionName, reviewerId, reviewerName, isBound, openid }}
 */
async function scanInvite(token) {
  const res = await call('scanInvite', { token });
  return res.data;
}

/**
 * 确认绑定邀请
 * @param {string} token 邀请 token
 */
async function bindInvite(token) {
  const res = await call('bindInvite', { token });
  return res.data;
}

/**
 * 管理员：为评审人生成邀请 token
 * @param {string} sessionId
 * @param {string} reviewerId
 */
async function generateInviteToken(sessionId, reviewerId) {
  const res = await call('adminGenerateInviteToken', { sessionId, reviewerId });
  return res.data;
}

/**
 * 管理员：重置评审人绑定状态
 * @param {string} sessionId
 * @param {string} reviewerId
 */
async function resetBinding(sessionId, reviewerId) {
  const res = await call('adminResetBinding', { sessionId, reviewerId });
  return res.data;
}

module.exports = {
  scanInvite,
  bindInvite,
  generateInviteToken,
  resetBinding
};
