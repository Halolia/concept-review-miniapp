/**
 * 用户身份服务
 * 正式模式通过云函数获取 OPENID → 查询 users 集合 → 返回角色/姓名/状态
 */

const { call, DEBUG_MODE } = require('../utils/request');

let _currentUser = null;

/**
 * 获取当前用户身份
 * 正式：云函数 → users 集合查询
 * DEBUG：允许本地模拟
 */
async function getCurrentUser() {
  try {
    const res = await call('getCurrentUser', {}, { showLoading: true, loadingText: '获取身份…' });
    if (res.ok && res.data) {
      _currentUser = res.data;
      // 缓存到全局
      const app = getApp();
      app.globalData.currentUser = res.data;
      app.globalData.role = res.data.role;
      app.globalData.userName = res.data.name;
      app.globalData.userStatus = res.data.status;
      return res.data;
    }
    // 未绑定用户
    _currentUser = { _id: null, role: 'guest', name: '', status: 'disabled' };
    return _currentUser;
  } catch (err) {
    _currentUser = { _id: null, role: 'guest', name: '', status: 'disabled' };
    return _currentUser;
  }
}

/**
 * 获取缓存的当前用户（不发起网络请求）
 */
function getCurrentUserSync() {
  if (_currentUser) return _currentUser;
  const app = getApp();
  if (app.globalData.currentUser) {
    _currentUser = app.globalData.currentUser;
    return _currentUser;
  }
  return null;
}

/**
 * 检查当前用户是否有指定角色
 */
function hasRole(role) {
  const user = _currentUser || getApp().globalData.currentUser;
  if (!user || user.status !== 'active') return false;
  if (DEBUG_MODE) return true; // DEBUG 模式跳过权限
  return user.role === role;
}

/**
 * 是否为管理员
 */
function isAdmin() {
  const user = _currentUser || getApp().globalData.currentUser;
  if (DEBUG_MODE) return getApp().globalData.role === 'admin';
  return user && user.role === 'admin' && user.status === 'active';
}

/**
 * 是否为专家
 */
function isExpert() {
  const user = _currentUser || getApp().globalData.currentUser;
  if (DEBUG_MODE) return getApp().globalData.role === 'expert';
  return user && user.role === 'expert' && user.status === 'active';
}

/**
 * 是否为领导
 */
function isLeader() {
  const user = _currentUser || getApp().globalData.currentUser;
  return user && user.role === 'leader' && user.status === 'active';
}

module.exports = {
  getCurrentUser,
  getCurrentUserSync,
  hasRole,
  isAdmin,
  isExpert,
  isLeader
};
