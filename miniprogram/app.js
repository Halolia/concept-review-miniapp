// app.js v1.0.2 — 环境配置接入
// 加载环境配置
let envConfig;
try { envConfig = require('./config/env'); } catch (e) { envConfig = require('./config/env.example'); }

App({
  globalData: {
    currentUser: null,
    role: envConfig.debugMode ? 'expert' : 'guest',
    userName: '张教授',
    userStatus: 'active',
    currentReviewerId: 'r1',
    currentReviewerName: '张教授'
  },

  onLaunch() {
    if (wx.cloud) {
      try {
        wx.cloud.init({ env: envConfig.cloudEnvId, traceUser: true });
      } catch (e) {
        console.warn('云开发初始化失败:', e);
        if (!envConfig.debugMode && envConfig.cloudEnvId) {
          console.error('正式模式但云环境未配置！');
        }
      }
    }

    if (envConfig.debugMode) {
      const role = wx.getStorageSync('cr_role');
      if (role) this.globalData.role = role;
      const name = wx.getStorageSync('cr_reviewer_name');
      if (name) this.globalData.currentReviewerName = name;
      const rid = wx.getStorageSync('cr_reviewer_id');
      if (rid) this.globalData.currentReviewerId = rid;
    }
  },

  switchRole(role) {
    this.globalData.role = role; wx.setStorageSync('cr_role', role);
  },
  setReviewer(id, name) {
    this.globalData.currentReviewerId = id; this.globalData.currentReviewerName = name;
    wx.setStorageSync('cr_reviewer_id', id); wx.setStorageSync('cr_reviewer_name', name);
  }
});
