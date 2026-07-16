const { expertGetProjectDetail } = require('../../services/projectService');
const { expertListAssignments } = require('../../services/assignmentService');
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
    try {
      const detail = await expertGetProjectDetail(this.data.projectId);
      if (!detail) {
        wx.showToast({ title: '项目不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500); return;
      }

      const project = detail.project || detail;
      const assignment = detail.assignment || {};
      const currentRound = detail.currentRound || null;

      // 获取最新的指派信息（优先用 assignmentId）
      let assignmentStatus = assignment.status || 'assigned';
      let assignmentId = this.data.assignmentId || assignment._id || '';
      let returnReason = '';

      const assignments = await expertListAssignments().catch(() => []);
      const myAsgn = assignments.find(a =>
        a._id === assignmentId || a.projectId === this.data.projectId
      );
      if (myAsgn) {
        assignmentStatus = myAsgn.status;
        assignmentId = myAsgn._id;
        if (myAsgn.review) returnReason = myAsgn.review.returnReason || '';
      }

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
