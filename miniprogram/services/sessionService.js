/**
 * 路演会话服务
 * 管理评审场次（session）的 CRUD
 */

const { call } = require('../utils/request');

/**
 * 管理员：获取所有会话列表
 */
async function listSessions() {
  const res = await call('adminListSessions');
  return res.data || [];
}

/**
 * 管理员：获取单个会话详情
 */
async function getSession(sessionId) {
  const res = await call('adminGetSession', { sessionId });
  return res.data;
}

/**
 * 管理员：创建会话
 * @param {object} session { name, date, deadline }
 */
async function createSession(session) {
  const res = await call('adminCreateSession', { session });
  return res.data;
}

/**
 * 管理员：更新会话
 */
async function updateSession(sessionId, updates) {
  const res = await call('adminUpdateSession', { sessionId, updates });
  return res.data;
}

/**
 * 管理员：开启会话（评审开始）
 */
async function openSession(sessionId) {
  const res = await call('adminOpenSession', { sessionId });
  return res.data;
}

/**
 * 管理员：关闭会话（评审结束，锁定所有评审）
 */
async function closeSession(sessionId) {
  const res = await call('adminCloseSession', { sessionId });
  return res.data;
}

/**
 * 管理员：获取会话进度数据
 */
async function getSessionProgress(sessionId) {
  const res = await call('adminGetSessionProgress', { sessionId });
  return res.data;
}

/**
 * 管理员：获取会话下的项目列表（含评审状态）
 */
async function listSessionProjects(sessionId) {
  const res = await call('adminListSessionProjects', { sessionId });
  return res.data || [];
}

/**
 * 管理员：新增项目到会话
 */
async function addProjectToSession(sessionId, project) {
  const res = await call('adminAddProjectToSession', { sessionId, project });
  return res.data;
}

/**
 * 管理员：从会话移除项目
 */
async function removeProjectFromSession(sessionId, projectId) {
  const res = await call('adminRemoveProjectFromSession', { sessionId, projectId });
  return res.data;
}

/**
 * 评审人：获取已绑定的会话项目列表
 */
async function getReviewerSession() {
  const res = await call('reviewerGetSession');
  return res.data || {};
}

module.exports = {
  listSessions,
  getSession,
  createSession,
  updateSession,
  openSession,
  closeSession,
  getSessionProgress,
  listSessionProjects,
  addProjectToSession,
  removeProjectFromSession,
  getReviewerSession
};
