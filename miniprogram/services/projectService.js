/**
 * 项目服务
 */

const { call } = require('../utils/request');

/**
 * 管理员获取所有项目列表
 */
async function adminListProjects() {
  const res = await call('adminListProjects');
  return res.data || [];
}

/**
 * 管理员获取单个项目详情
 */
async function adminGetProject(projectId) {
  const res = await call('adminGetProject', { projectId });
  return res.data;
}

/**
 * 专家获取被指派的项目列表
 */
async function expertListProjects() {
  const res = await call('expertListProjects');
  return res.data || [];
}

/**
 * 专家获取单个项目详情（含指派信息）
 */
async function expertGetProjectDetail(projectId) {
  const res = await call('expertGetProjectDetail', { projectId });
  return res.data;
}

/**
 * 管理员创建项目
 */
async function adminCreateProject(project) {
  const res = await call('adminCreateProject', { project });
  return res.data;
}

/**
 * 管理员更新项目
 */
async function adminUpdateProject(projectId, updates) {
  const res = await call('adminUpdateProject', { projectId, updates });
  return res.data;
}

/**
 * 管理员归档项目
 */
async function adminArchiveProject(projectId, reason) {
  const res = await call('adminArchiveProject', { projectId, reason });
  return res.data;
}

module.exports = {
  adminListProjects,
  adminGetProject,
  expertListProjects,
  expertGetProjectDetail,
  adminCreateProject,
  adminUpdateProject,
  adminArchiveProject
};
