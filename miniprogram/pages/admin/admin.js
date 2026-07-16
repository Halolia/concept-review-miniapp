/**
 * 管理后台
 * 四 Tab：项目管理 / 评委指派 / 评委管理 / 评审批次
 */
const { isAdmin } = require('../../services/authService');
const { adminListProjects, adminCreateProject, adminUpdateProject, adminArchiveProject } = require('../../services/projectService');
const { adminListUsers, adminCreateOrBindUser, adminDisableUser, adminEnableUser, adminBindUserOpenid } = require('../../services/reviewerService');
const { adminListAssignments, adminAssignExpert, adminRemoveAssignment } = require('../../services/assignmentService');
const { adminListReviewRounds, adminCreateReviewRound, adminUpdateReviewRound, adminOpenReviewRound, adminCloseReviewRound } = require('../../services/summaryService');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    activeTab: 'projects',
    projects: [],
    reviewers: [],         // users 中 role=expert 的
    allReviewerNames: [],
    rounds: [],
    selectedRoundId: '',   // 当前选中的批次的 _id
    newProject: { name: '', institution: '', leader: '', description: '' },
    newReviewer: { openid: '', name: '', role: 'expert', organization: '', title: '' },
    newRound: { name: '', roundNo: '', deadline: '' },
    showRoundCreate: false,
    editRoundId: '',
    editRoundData: { name: '', deadline: '' },
    bindInputOpenid: '',
    bindingUserId: '',
    loading: false
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
      // 先加载项目和用户和批次
      const [projects, users, rounds] = await Promise.all([
        adminListProjects(),
        adminListUsers(),
        adminListReviewRounds()
      ]);

      // 专家列表
      const experts = (users || []).filter(u => u.role === 'expert');
      const expertMap = {};
      experts.forEach(e => { expertMap[e._id] = e; });

      const allReviewerNames = experts.map(e => e.name || e._id);

      // 选中第一个批次（如果还没有选中或选中的批次已被删除）
      const roundsList = rounds || [];
      let selectedRoundId = this.data.selectedRoundId;
      const roundExists = roundsList.some(r => r._id === selectedRoundId);
      if (!roundExists) {
        selectedRoundId = roundsList.length > 0 ? roundsList[0]._id : '';
      }

      // 按选中批次加载指派
      let assignments = [];
      if (selectedRoundId) {
        try { assignments = await adminListAssignments(selectedRoundId); } catch (e) {}
      }

      // 只按当前批次丰富项目数据
      const enrichedProjects = (projects || []).map(p => {
        const projAssignments = (assignments || []).filter(a => a.projectId === p._id);
        const assignedReviewers = projAssignments.map(a => {
          const e = expertMap[a.expertId];
          return { _id: a._id, id: a.expertId, name: e ? e.name : a.expertId, status: a.status, assignmentId: a._id };
        });
        const submittedCount = assignedReviewers.filter(r => ['submitted', 'resubmitted', 'locked'].includes(r.status)).length;
        return { ...p, assignedReviewers, reviewers: assignedReviewers.map(r => r.id), submittedCount };
      });

      this.setData({
        loading: false,
        projects: enrichedProjects,
        reviewers: experts,
        allReviewerNames,
        rounds: roundsList,
        selectedRoundId
      });
    } catch (e) {
      console.error('加载管理数据失败:', e);
      this.setData({ loading: false });
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  // ═══ 评审批次 Tab ═══

  toggleRoundCreate() {
    this.setData({ showRoundCreate: !this.data.showRoundCreate });
  },

  onNewRoundInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['newRound.' + field]: e.detail.value });
  },

  async createRound() {
    const { name, roundNo, deadline } = this.data.newRound;
    if (!name.trim() || !roundNo.trim()) {
      wx.showToast({ title: '请填写批次名称和批次号', icon: 'none' });
      return;
    }
    try {
      await adminCreateReviewRound({
        name: name.trim(),
        roundNo: roundNo.trim(),
        deadline: deadline.trim() || undefined
      });
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({
        newRound: { name: '', roundNo: '', deadline: '' },
        showRoundCreate: false
      });
      this.loadData();
    } catch (e) {}
  },

  async selectRound(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedRoundId: id });
    await this.loadData();
  },

  async openRound(e) {
    const id = e.currentTarget.dataset.id;
    const r = this.data.rounds.find(x => x._id === id);
    if (!r) return;
    wx.showModal({
      title: '开启批次',
      content: `确认开启评审批次"${r.name}"？开启后专家可进行评审。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await adminOpenReviewRound(id);
            wx.showToast({ title: '已开启', icon: 'success' });
            this.loadData();
          } catch (e) {}
        }
      }
    });
  },

  async closeRound(e) {
    const id = e.currentTarget.dataset.id;
    const r = this.data.rounds.find(x => x._id === id);
    if (!r) return;
    wx.showModal({
      title: '关闭批次',
      content: `确认关闭评审批次"${r.name}"？关闭后专家不可再提交评审。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await adminCloseReviewRound(id);
            wx.showToast({ title: '已关闭', icon: 'success' });
            this.loadData();
          } catch (e) {}
        }
      }
    });
  },

  startEditRound(e) {
    const id = e.currentTarget.dataset.id;
    const r = this.data.rounds.find(x => x._id === id);
    if (!r) return;
    this.setData({
      editRoundId: id,
      editRoundData: { name: r.name || '', deadline: r.deadline || '' }
    });
  },

  cancelEditRound() {
    this.setData({ editRoundId: '', editRoundData: { name: '', deadline: '' } });
  },

  onEditRoundInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['editRoundData.' + field]: e.detail.value });
  },

  async saveEditRound() {
    const { editRoundId, editRoundData } = this.data;
    if (!editRoundData.name.trim()) {
      wx.showToast({ title: '批次名称不能为空', icon: 'none' });
      return;
    }
    try {
      await adminUpdateReviewRound(editRoundId, {
        name: editRoundData.name.trim(),
        deadline: editRoundData.deadline.trim() || undefined
      });
      wx.showToast({ title: '更新成功', icon: 'success' });
      this.setData({ editRoundId: '', editRoundData: { name: '', deadline: '' } });
      this.loadData();
    } catch (e) {}
  },

  // ═══ 项目管理 ═══

  onProjInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['newProject.' + field]: e.detail.value });
  },

  async addProject() {
    const { name, institution, leader, description } = this.data.newProject;
    if (!name.trim()) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' });
      return;
    }
    try {
      await adminCreateProject({ name, institution, leader, description });
      wx.showToast({ title: '添加成功', icon: 'success' });
      this.setData({ newProject: { name: '', institution: '', leader: '', description: '' } });
      this.loadData();
    } catch (e) {}
  },

  archiveProject(e) {
    const id = e.currentTarget.dataset.id;
    const p = this.data.projects.find(x => x._id === id);
    if (!p) return;
    const hasReviews = (p.submittedCount || 0) > 0;

    wx.showModal({
      title: hasReviews ? '确认归档' : '确认归档',
      content: hasReviews
        ? `项目"${p.name}"已有 ${p.submittedCount} 条评审记录，归档后不可再修改评审。确认归档？`
        : `确认归档项目"${p.name}"？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await adminArchiveProject(id, '管理员归档');
            wx.showToast({ title: '已归档', icon: 'success' });
            this.loadData();
          } catch (e) {}
        }
      }
    });
  },

  // ═══ 评委指派 ═══

  async assignReviewer(e) {
    const projectId = e.currentTarget.dataset.projectId;
    const reviewerIdx = e.detail.value;
    const reviewer = this.data.reviewers[reviewerIdx];
    if (!reviewer) return;
    if (!this.data.selectedRoundId) {
      wx.showToast({ title: '请先在"评审批次"中选择当前批次', icon: 'none' });
      return;
    }

    try {
      await adminAssignExpert(projectId, this.data.selectedRoundId, reviewer._id);
      wx.showToast({ title: '已分配', icon: 'success' });
      this.loadData();
    } catch (e) {}
  },

  async removeReviewer(e) {
    const { assignmentId, name, projectId, submitted } = e.currentTarget.dataset;
    const isSubmitted = submitted === 'true';
    const message = isSubmitted
      ? `专家"${name}"已提交评审，移除将清除其评审数据。请填写移除原因：`
      : `确定将专家"${name}"从该项目移除？`;

    if (isSubmitted) {
      wx.showModal({
        title: '⚠️ 重要警告',
        content: message,
        editable: true,
        placeholderText: '请输入移除原因',
        success: async (res) => {
          if (res.confirm) {
            try {
              await adminRemoveAssignment(assignmentId, res.content || '管理员手动移除');
              wx.showToast({ title: '已移除', icon: 'success' });
              this.loadData();
            } catch (e) {}
          }
        }
      });
    } else {
      wx.showModal({
        title: '移除专家',
        content: message,
        success: async (res) => {
          if (res.confirm) {
            try {
              await adminRemoveAssignment(assignmentId);
              wx.showToast({ title: '已移除', icon: 'success' });
              this.loadData();
            } catch (e) {}
          }
        }
      });
    }
  },

  // ═══ 评委管理 ═══

  onRevInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['newReviewer.' + field]: e.detail.value });
  },

  async addReviewer() {
    const { openid, name } = this.data.newReviewer;
    if (!name.trim()) {
      wx.showToast({ title: '请输入专家姓名', icon: 'none' });
      return;
    }
    try {
      await adminCreateOrBindUser({
        openid: openid.trim(),
        name: name.trim(),
        role: 'expert',
        organization: this.data.newReviewer.organization.trim(),
        title: this.data.newReviewer.title.trim()
      });
      wx.showToast({ title: '添加成功', icon: 'success' });
      this.setData({ newReviewer: { openid: '', name: '', role: 'expert', organization: '', title: '' } });
      this.loadData();
    } catch (e) {}
  },

  startBindOpenid(e) {
    const { id, name } = e.currentTarget.dataset;
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
      wx.showToast({ title: '请输入OPENID', icon: 'none' });
      return;
    }
    try {
      await adminBindUserOpenid(bindingUserId, bindInputOpenid.trim());
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.setData({ bindingUserId: '', bindInputOpenid: '' });
      this.loadData();
    } catch (e) {}
  },

  async unbindOpenid(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '解绑OPENID',
      content: `确定解绑专家"${name}"的OPENID？解绑后该专家需要通过其他方式重新绑定。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await adminBindUserOpenid(id, '');
            wx.showToast({ title: '已解绑', icon: 'success' });
            this.loadData();
          } catch (e) {}
        }
      }
    });
  },

  async disableReviewer(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '停用专家',
      content: `确定停用专家"${name}"？停用后该专家将无法继续访问系统。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await adminDisableUser(id, '管理员停用');
            wx.showToast({ title: '已停用', icon: 'success' });
            this.loadData();
          } catch (e) {}
        }
      }
    });
  },

  async enableReviewer(e) {
    const { id } = e.currentTarget.dataset;
    try {
      await adminEnableUser(id);
      wx.showToast({ title: '已启用', icon: 'success' });
      this.loadData();
    } catch (e) {}
  }
});
