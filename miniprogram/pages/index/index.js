/**
 * 首页 — 路演现场评分
 * Admin：会话列表 + 创建入口
 * Reviewer：已绑定 → 显示项目列表 + 进度
 */
const app = getApp();
const { getCurrentUser } = require('../../services/authService');
const { getReviewerSession } = require('../../services/sessionService');
const { listSessions } = require('../../services/sessionService');

Page({
  data: {
    role: 'guest',        // 'admin' | 'reviewer' | 'guest'
    userName: '',
    loading: true,

    // Admin
    sessions: [],

    // Reviewer
    sessionName: '',
    reviewerName: '',
    projects: [],
    progress: { done: 0, total: 0 }
  },

  async onShow() {
    this.setData({ loading: true });
    try {
      const user = await getCurrentUser();
      if (user && user.role === 'admin' && user.status === 'active') {
        app.setAdminInfo(user.name);
        this.setData({ role: 'admin', userName: user.name, loading: false });
        await this.loadSessions();
      } else if (user && user.role === 'expert' && user.status === 'active') {
        // 评审人已绑定 → 加载会话中的项目
        await this.loadReviewerDashboard(user);
      } else {
        // 尝试从本地 token 恢复评审人身份
        await this.tryRestoreReviewer();
      }
    } catch (e) {
      this.setData({ role: 'guest', loading: false });
    }
  },

  /** 管理员：加载会话列表 */
  async loadSessions() {
    try {
      const sessions = await listSessions();
      this.setData({ sessions });
    } catch (e) {
      console.error('加载会话失败:', e);
    }
  },

  /** 评审人：加载项目列表 */
  async loadReviewerDashboard(user) {
    try {
      const data = await getReviewerSession();
      const projects = (data.projects || []).map(p => ({
        ...p,
        statusLabel: this.getStatusLabel(p.myStatus),
        statusClass: this.getStatusClass(p.myStatus)
      }));
      const done = projects.filter(p =>
        ['submitted', 'resubmitted', 'locked'].includes(p.myStatus)
      ).length;
      this.setData({
        role: 'reviewer',
        userName: user.name,
        sessionName: data.sessionName || '',
        reviewerName: user.name,
        projects,
        progress: { done, total: projects.length },
        loading: false
      });
    } catch (e) {
      this.setData({ role: 'guest', loading: false });
    }
  },

  /** 从本地 token 恢复评审人身份 */
  async tryRestoreReviewer() {
    try {
      const tokenStr = wx.getStorageSync('cr_session_token');
      if (!tokenStr) {
        this.setData({ role: 'guest', loading: false });
        return;
      }
      const data = await getReviewerSession();
      if (data && data.projects) {
        const token = JSON.parse(tokenStr);
        const projects = (data.projects || []).map(p => ({
          ...p,
          statusLabel: this.getStatusLabel(p.myStatus),
          statusClass: this.getStatusClass(p.myStatus)
        }));
        const done = projects.filter(p =>
          ['submitted', 'resubmitted', 'locked'].includes(p.myStatus)
        ).length;
        this.setData({
          role: 'reviewer',
          userName: token.name || '',
          sessionName: data.sessionName || '',
          reviewerName: token.name || '',
          projects,
          progress: { done, total: projects.length },
          loading: false
        });
      } else {
        this.setData({ role: 'guest', loading: false });
      }
    } catch (e) {
      this.setData({ role: 'guest', loading: false });
    }
  },

  getStatusLabel(status) {
    const map = {
      'none': '待评分', 'draft': '草稿',
      'submitted': '已提交', 'resubmitted': '已提交',
      'locked': '已锁定'
    };
    return map[status] || '待评分';
  },

  getStatusClass(status) {
    const map = {
      'none': 'tag-pending', 'draft': 'tag-warn',
      'submitted': 'tag-good', 'resubmitted': 'tag-good',
      'locked': 'tag-pending'
    };
    return map[status] || 'tag-pending';
  },

  /** 进入项目评审 */
  goReview(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/review/review?projectId=${id}&projectName=${encodeURIComponent(name)}`
    });
  },

  /** 管理员：创建新会话 */
  goCreateSession() {
    wx.navigateTo({ url: '/pages/admin/admin' });
  },

  /** 管理员：进入会话管理 */
  goSession(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/admin/admin?sessionId=${id}` });
  },

  /** 管理员：查看进度看板 */
  goProgress(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/progress/progress?sessionId=${id}` });
  },

  /** 扫码绑定回调（来自 open-type="scanCode"） */
  onScanCode(e) {
    const result = (e.detail && e.detail.result) || '';
    const token = this.extractToken(result);
    if (token) {
      wx.navigateTo({ url: `/pages/scan/scan?token=${encodeURIComponent(token)}` });
    } else {
      wx.showToast({ title: '无效的二维码', icon: 'none' });
    }
  },

  /** 从扫描结果中提取 token */
  extractToken(result) {
    if (!result) return null;
    // 支持三种格式:
    // 1. 直接 token: abc123
    // 2. query 参数: ?token=abc123
    // 3. 小程序码路径: pages/scan/scan?token=abc123
    try {
      const url = decodeURIComponent(result);
      const match = url.match(/[?&]token=([^&]+)/);
      if (match) return match[1];
    } catch (e) {}
    // 如果结果就是 token 本身（短码）
    if (result.length < 256 && !result.includes('/')) return result.trim();
    return null;
  },

  /** 管理员：进入结果 */
  goResult(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/result/result?projectId=${id}&projectName=${encodeURIComponent(name)}`
    });
  }
});
