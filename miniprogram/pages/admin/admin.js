/**
 * 管理后台
 * 三 Tab：项目管理 / 评委指派 / 评委管理（users 集合）
 */
const { isAdmin } = require('../../services/authService');
const { adminListProjects, adminCreateProject, adminUpdateProject, adminArchiveProject } = require('../../services/projectService');
const { adminListUsers, adminCreateOrBindUser, adminDisableUser, adminEnableUser } = require('../../services/reviewerService');
const { adminListAssignments, adminAssignExpert, adminRemoveAssignment } = require('../../services/assignmentService');
const { adminListReviewRounds, adminCreateReviewRound } = require('../../services/summaryService');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    activeTab: 'projects',
    projects: [],
    reviewers: [],         // users 中 role=expert 的
    allReviewerNames: [],
    rounds: [],
    currentRoundId: '',
    newProject: { name: '', institution: '', leader: '', description: '' },
    newReviewer: { openid: '', name: '', role: 'expert', organization: '', title: '' },
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
      const [projects, users, assignments, rounds] = await Promise.all([
        adminListProjects(),
        adminListUsers(),
        adminListAssignments(),
        adminListReviewRounds()
      ]);

      // 专家列表
      const experts = (users || []).filter(u => u.role === 'expert');
      const expertMap = {};
      experts.forEach(e => { expertMap[e._id] = e; });

      const allReviewerNames = experts.map(e => e.name || e._id);

      // 当前活跃批次
      const currentRoundId = (rounds && rounds.length > 0) ? rounds[0]._id : '';

      // 丰富项目数据
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
        rounds: rounds || [],
        currentRoundId
      });
    } catch (e) {
      console.error('加载管理数据失败:', e);
      this.setData({ loading: false });
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
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

    try {
      await adminAssignExpert(projectId, this.data.currentRoundId, reviewer._id);
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
      // 需要填写原因
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
        openid: openid.trim() || 'placeholder_' + Date.now(),
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
