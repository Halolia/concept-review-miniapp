// app.js — 路演现场评分小程序
let envConfig;
try { envConfig = require('./config/env'); } catch (e) { envConfig = require('./config/env.example'); }

App({
  globalData: {
    currentUser: null,
    role: 'guest',          // 'admin' | 'reviewer' | 'guest'
    userName: '',
    sessionId: '',          // 当前绑定会话ID
    sessionName: '',
    reviewerId: ''
  },

  onLaunch() {
    if (wx.cloud) {
      try {
        wx.cloud.init({ env: envConfig.cloudEnvId, traceUser: true });
      } catch (e) {
        console.warn('云开发初始化失败:', e);
      }
    }
  },

  /** 设置当前评审人身份 */
  setReviewerInfo(info) {
    this.globalData.role = 'reviewer';
    this.globalData.userName = info.name || '';
    this.globalData.sessionId = info.sessionId || '';
    this.globalData.sessionName = info.sessionName || '';
    this.globalData.reviewerId = info.reviewerId || '';
    wx.setStorageSync('cr_session_token', JSON.stringify({
      sessionId: info.sessionId,
      reviewerId: info.reviewerId,
      name: info.name
    }));
  },

  /** 清除评审人身份 */
  clearReviewerInfo() {
    this.globalData.role = 'guest';
    this.globalData.userName = '';
    this.globalData.sessionId = '';
    this.globalData.sessionName = '';
    this.globalData.reviewerId = '';
    wx.removeStorageSync('cr_session_token');
  },

  /** 设置管理员 */
  setAdminInfo(name) {
    this.globalData.role = 'admin';
    this.globalData.userName = name || '管理员';
    wx.setStorageSync('cr_is_admin', '1');
  }
});
