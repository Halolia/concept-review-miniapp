/**
 * 扫码绑定页 — 路演现场评分
 * 处理邀请 token：查找 → 确认绑定 → 跳转首页
 */
const app = getApp();
const { scanInvite, bindInvite } = require('../../services/inviteService');

Page({
  data: {
    token: '',
    inviteInfo: null,
    loading: true,
    error: '',
    binding: false
  },

  onLoad(options) {
    const token = options.token || '';
    this.setData({ token });
    if (token) {
      this.lookupInvite(token);
    } else {
      this.setData({ loading: false, error: '未找到邀请码，请重新扫描二维码' });
    }
  },

  /** 查看邀请码信息 */
  async lookupInvite(token) {
    this.setData({ loading: true, error: '' });
    try {
      const info = await scanInvite(token);
      this.setData({
        loading: false,
        inviteInfo: info
      });
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || '邀请码无效或已过期'
      });
    }
  },

  /** 确认绑定 */
  async confirmBind() {
    if (this.data.binding) return;
    this.setData({ binding: true });
    try {
      const result = await bindInvite(this.data.token);
      // 设置全局身份
      app.setReviewerInfo({
        name: result.reviewerName || this.data.inviteInfo.reviewerName,
        sessionId: result.sessionId || this.data.inviteInfo.sessionId,
        sessionName: result.sessionName || this.data.inviteInfo.sessionName,
        reviewerId: result.reviewerId || this.data.inviteInfo.reviewerId
      });
      wx.showToast({ title: '绑定成功', icon: 'success' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' });
      }, 1000);
    } catch (e) {
      this.setData({ binding: false });
      wx.showToast({ title: e.message || '绑定失败', icon: 'none' });
    }
  },

  /** 取消，返回首页 */
  goBack() {
    wx.navigateBack({ delta: 1 });
    // 如果无法返回，跳转到首页
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/index/index' });
    }, 300);
  }
});
