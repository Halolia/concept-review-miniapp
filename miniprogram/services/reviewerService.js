/**
 * 专家/用户管理服务
 */

const { call } = require('../utils/request');

/**
 * 管理员获取所有用户列表
 */
async function adminListUsers() {
  const res = await call('adminListUsers');
  return res.data || [];
}

/**
 * 管理员添加/绑定用户
 */
async function adminCreateOrBindUser(userData) {
  const res = await call('adminCreateOrBindUser', { userData });
  return res.data;
}

/**
 * 管理员禁用用户
 */
async function adminDisableUser(userId, reason) {
  const res = await call('adminDisableUser', { userId, reason });
  return res.data;
}

/**
 * 管理员启用用户
 */
async function adminEnableUser(userId) {
  const res = await call('adminEnableUser', { userId });
  return res.data;
}

module.exports = {
  adminListUsers,
  adminCreateOrBindUser,
  adminDisableUser,
  adminEnableUser
};
