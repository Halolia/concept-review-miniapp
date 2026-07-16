const { expertGetProjectDetail } = require('../../services/projectService');
const { isExpert } = require('../../services/authService');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    loading: true, projectId: '', projectName: '', assignmentId: '',
    project: {}, currentRound: null, assignmentStatus: 'assigned',
    returnReason: '', canReview: false
  },

  onLoad(options) {
    this.setData({
      projectId: options.projectId || '',
      projectName: decodeURIComponent(options.projectName || ''),
      assignmentId: options.assignmentId || ''
    });
  },

  async onShow() {
    if (!isExpert() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500); return;
    }
    await this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });

    if (!this.data.assignmentId) {
      wx.showToast({ title: '缺少指派信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      this.setData({ loading: false });
      return;
    }

    try {
      const detail = await expertGetProjectDetail(this.data.assignmentId);
      if (!detail) {
        wx.showToast({ title: '项目不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500); return;
      }

      const project = detail.project || detail;
      const assignment = detail.assignment || {};
      const currentRound = detail.currentRound || null;
      const assignmentStatus = assignment.status || 'assigned';
      const assignmentId = assignment._id || this.data.assignmentId;
      const returnReason = assignment.returnReason || '';

      const canReview = !['locked', 'closed_unsubmitted', 'removed'].includes(assignmentStatus)
        && currentRound && currentRound.status === 'open'
        && project.status === 'active';

      this.setData({ loading: false, project, currentRound, assignmentStatus, assignmentId, returnReason, canReview });
    } catch (err) {
      this.setData({ loading: false });
      console.error('加载项目详情失败:', err);
    }
  },

  goReview() {
    const { projectId, projectName, assignmentId, assignmentStatus } = this.data;
    const isReadonly = ['submitted', 'resubmitted', 'locked', 'closed_unsubmitted'].includes(assignmentStatus) && assignmentStatus !== 'returned';
    wx.navigateTo({
      url: `/pages/review/review?projectId=${projectId}&projectName=${encodeURIComponent(projectName)}&assignmentId=${assignmentId}&readonly=${isReadonly}`
    });
  }
});
