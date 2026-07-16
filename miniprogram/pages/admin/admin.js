/**
 * 管理后台 — 路演现场评分
 * Tab 1：活动管理（会话 CRUD + 开关）
 * Tab 2：项目管理（添加项目到当前会话）
 * Tab 3：评委管理（添加评审人 + 生成QR + 绑定状态）
 * Tab 4：进度看板（项目/评审人维度）
 */
const { isAdmin } = require('../../services/authService');
const {
  listSessions, createSession, updateSession, openSession, closeSession,
  listSessionProjects, addProjectToSession, removeProjectFromSession,
  getSessionProgress
} = require('../../services/sessionService');
const { adminListUsers, adminCreateOrBindUser, adminBindUserOpenid } = require('../../services/reviewerService');
const { generateInviteToken, resetBinding } = require('../../services/inviteService');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    activeTab: 'session',     // session | project | reviewer | progress
    loading: false,

    // Session
    sessions: [],
    selectedSessionId: '',
    selectedSession: null,
    newSession: { name: '', date: '', deadline: '' },
    editSessionId: '',
    editSessionData: { name: '', date: '', deadline: '' },

    // Project
    sessionProjects: [],
    newProject: { name: '', institution: '', leader: '', description: '' },

    // Reviewer
    reviewers: [],
    newReviewer: { openid: '', name: '', organization: '', title: '' },
    bindInputOpenid: '',
    bindingUserId: '',
    inviteQRSessionId: '',

    // Progress
    projectProgress: [],
    reviewerProgress: []
  },

  onLoad(options) {
    if (options.sessionId) {
      this.setData({ selectedSessionId: options.sessionId, activeTab: 'session' });
    }
  },

  onShow() {
    if (!isAdmin() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [sessions, users] = await Promise.all([
        listSessions(),
        adminListUsers()
      ]);

      const experts = (users || []).filter(u => u.role === 'expert');

      let selId = this.data.selectedSessionId;
      const exists = sessions.some(s => s._id === selId);
      if (!exists && sessions.length > 0) {
        selId = sessions[0]._id;
      }

      const sel = sessions.find(s => s._id === selId) || null;

      // 加载项目列表
      let sessionProjects = [];
      if (selId) {
        try { sessionProjects = await listSessionProjects(selId); } catch (e) {}
      }

      // 加载进度
      let projectProgress = [], reviewerProgress = [];
      if (selId) {
        try {
          const progress = await getSessionProgress(selId);
          projectProgress = progress.projectProgress || [];
          reviewerProgress = progress.reviewerProgress || [];
        } catch (e) {}
      }

      this.setData({
        loading: false, sessions,
        selectedSessionId: selId, selectedSession: sel,
        reviewers: experts,
        sessionProjects,
        projectProgress, reviewerProgress
      });
    } catch (e) {
      console.error('加载管理数据失败:', e);
      this.setData({ loading: false });
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  selectSession(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedSessionId: id });
    this.loadData();
  },

  // ═══ Tab 1: 活动管理 ═══

  onNewSessionInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['newSession.' + field]: e.detail.value });
  },

  async createSession() {
    const { name, date, deadline } = this.data.newSession;
    if (!name.trim()) {
      wx.showToast({ title: '请输入场次名称', icon: 'none' }); return;
    }
    try {
      await createSession({ name: name.trim(), date: date.trim(), deadline: deadline.trim() });
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ newSession: { name: '', date: '', deadline: '' } });
      this.loadData();
    } catch (e) {}
  },

  async doOpenSession(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.data.sessions.find(x => x._id === id);
    if (!s) return;
    wx.showModal({
      title: '开启场次',
      content: `确认开启"${s.name}"？开启后评审人可进行评分。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await openSession(id);
            wx.showToast({ title: '已开启', icon: 'success' });
            this.loadData();
          } catch (e) {}
        }
      }
    });
  },

  async doCloseSession(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.data.sessions.find(x => x._id === id);
    if (!s) return;
    wx.showModal({
      title: '关闭场次',
      content: `确认关闭"${s.name}"？关闭后所有评审锁定为只读。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await closeSession(id);
            wx.showToast({ title: '已关闭', icon: 'success' });
            this.loadData();
          } catch (e) {}
        }
      }
    });
  },

  startEditSession(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.data.sessions.find(x => x._id === id);
    if (!s) return;
    this.setData({
      editSessionId: id,
      editSessionData: { name: s.name || '', date: s.date || '', deadline: s.deadline || '' }
    });
  },

  cancelEditSession() {
    this.setData({ editSessionId: '', editSessionData: { name: '', date: '', deadline: '' } });
  },

  onEditSessionInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['editSessionData.' + field]: e.detail.value });
  },

  async saveEditSession() {
    const { editSessionId, editSessionData } = this.data;
    if (!editSessionData.name.trim()) {
      wx.showToast({ title: '场次名称不能为空', icon: 'none' }); return;
    }
    try {
      await updateSession(editSessionId, {
        name: editSessionData.name.trim(),
        date: editSessionData.date.trim() || undefined,
        deadline: editSessionData.deadline.trim() || undefined
      });
      wx.showToast({ title: '更新成功', icon: 'success' });
      this.setData({ editSessionId: '', editSessionData: { name: '', date: '', deadline: '' } });
      this.loadData();
    } catch (e) {}
  },

  // ═══ Tab 2: 项目管理 ═══

  onProjInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['newProject.' + field]: e.detail.value });
  },

  async addProject() {
    const { name, institution, leader, description } = this.data.newProject;
    if (!name.trim()) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' }); return;
    }
    if (!this.data.selectedSessionId) {
      wx.showToast({ title: '请先选择或创建场次', icon: 'none' }); return;
    }
    try {
      await addProjectToSession(this.data.selectedSessionId, {
        name: name.trim(), institution: institution.trim(),
        leader: leader.trim(), description: description.trim()
      });
      wx.showToast({ title: '添加成功', icon: 'success' });
      this.setData({ newProject: { name: '', institution: '', leader: '', description: '' } });
      this.loadData();
    } catch (e) {}
  },

  async removeProject(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '移除项目',
      content: `确认从当前场次中移除项目"${name}"？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await removeProjectFromSession(this.data.selectedSessionId, id);
            wx.showToast({ title: '已移除', icon: 'success' });
            this.loadData();
          } catch (e) {}
        }
      }
    });
  },

  async importProjects() {
    wx.showToast({ title: '暂不支持批量导入', icon: 'none' });
  },

  // ═══ Tab 3: 评委管理 ═══

  onRevInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['newReviewer.' + field]: e.detail.value });
  },

  async addReviewer() {
    const { name } = this.data.newReviewer;
    if (!name.trim()) {
      wx.showToast({ title: '请输入评委姓名', icon: 'none' }); return;
    }
    try {
      await adminCreateOrBindUser({
        openid: this.data.newReviewer.openid.trim(),
        name: name.trim(),
        role: 'expert',
        organization: this.data.newReviewer.organization.trim(),
        title: this.data.newReviewer.title.trim()
      });
      wx.showToast({ title: '添加成功', icon: 'success' });
      this.setData({ newReviewer: { openid: '', name: '', organization: '', title: '' } });
      this.loadData();
    } catch (e) {}
  },

  startBindOpenid(e) {
    const { id } = e.currentTarget.dataset;
    this.setData({ bindingUserId: id, bindInputOpenid: '' });
  },

  cancelBindOpenid() {
    this.setData({ bindingUserId: '', bindInputOpenid: '' });
  },

  onBindOpenidInput(e) {
    this.setData({ bindInputOpenid: e.detail.value });
  },

  async confirmBindOpenid() {
    const { bindingUserId, bindInputOpenid } = this.data;
    if (!bindInputOpenid.trim()) {
      wx.showToast({ title: '请输入OPENID', icon: 'none' }); return;
    }
    try {
      await adminBindUserOpenid(bindingUserId, bindInputOpenid.trim());
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.setData({ bindingUserId: '', bindInputOpenid: '' });
      this.loadData();
    } catch (e) {}
  },

  /** 生成邀请二维码 */
  async generateQR(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!this.data.selectedSessionId) {
      wx.showToast({ title: '请先选择场次', icon: 'none' }); return;
    }
    try {
      const result = await generateInviteToken(this.data.selectedSessionId, id);
      wx.showModal({
        title: `邀请：${name}`,
        content: `邀请Token已生成：\n${result.token}\n\n将此token生成二维码供评委扫描`,
        showCancel: false
      });
    } catch (e) {
      wx.showToast({ title: e.message || '生成失败', icon: 'none' });
    }
  },

  /** 重置绑定 */
  async doResetBinding(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!this.data.selectedSessionId) return;
    wx.showModal({
      title: '重置绑定',
      content: `确认重置"${name}"的绑定状态？该评委需重新扫码绑定。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await resetBinding(this.data.selectedSessionId, id);
            wx.showToast({ title: '已重置', icon: 'success' });
            this.loadData();
          } catch (e) {}
        }
      }
    });
  },

  // ═══ Tab 4: 进度看板 ═══

  /** 管理员：对项目设置回避 */
  async toggleRecusal(e) {
    const { id, recused } = e.currentTarget.dataset;
    // TODO: 调用 recusal API
    wx.showToast({ title: recused ? '已取消回避' : '已设置回避', icon: 'none' });
  }
});
