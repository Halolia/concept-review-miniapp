// app.js
const { DEBUG_MODE } = require('./utils/request');

App({
  globalData: {
    // 身份（正式模式由云函数返回，DEBUG 模式手动设置）
    currentUser: null,
    role: 'expert',       // 'admin' | 'expert' | 'leader' | 'guest'
    userName: '张教授',
    userStatus: 'active',

    // DEBUG 模式兼容旧逻辑
    currentReviewerId: 'r1',
    currentReviewerName: '张教授'
  },

  onLaunch() {
    // 始终初始化云开发（正式模式需要，DEBUG 模式无害）
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: 'your-env-id', // TODO: 替换为实际云环境 ID
          traceUser: true
        });
      } catch (e) {
        console.warn('云开发初始化失败（如未开通可忽略）:', e);
      }
    }

    if (DEBUG_MODE) {
      // 从本地读取角色设置（仅 DEBUG 模式）
      const role = wx.getStorageSync('cr_role');
      if (role) this.globalData.role = role;
      const name = wx.getStorageSync('cr_reviewer_name');
      if (name) this.globalData.currentReviewerName = name;
      const rid = wx.getStorageSync('cr_reviewer_id');
      if (rid) this.globalData.currentReviewerId = rid;
    }
  },

  switchRole(role) {
    this.globalData.role = role;
    wx.setStorageSync('cr_role', role);
  },

  setReviewer(id, name) {
    this.globalData.currentReviewerId = id;
    this.globalData.currentReviewerName = name;
    wx.setStorageSync('cr_reviewer_id', id);
    wx.setStorageSync('cr_reviewer_name', name);
  }
});
