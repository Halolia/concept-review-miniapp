const { expertGetProjectDetail, expertListAssignments } = require('../../services/projectService');
const { isExpert } = require('../../services/authService');
const { DEBUG_MODE } = require('../../utils/request');

Page({
  data: {
    loading: true,
    projectId: '',
    projectName: '',
    project: {},
    currentRound: null,
    assignmentStatus: 'assigned',
    assignmentId: '',
    returnReason: '',
    canReview: false
  },

  onLoad(options) {
    const projectId = options.projectId;
    const projectName = decodeURIComponent(options.projectName || '');
    this.setData({ projectId, projectName });
  },

  async onShow() {
    if (!isExpert() && !DEBUG_MODE) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    await this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      // 并行获取项目详情和指派列表
      const [detail, assignments] = await Promise.all([
        expertGetProjectDetail(this.data.projectId),
        expertListAssignments()
      ]);

      if (!detail) {
        wx.showToast({ title: '项目不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      const project = detail.project || detail;
      const assignment = detail.assignment || {};
      const currentRound = detail.currentRound || null;

      // 从指派列表获取最新状态
      let assignmentStatus = assignment.status || 'assigned';
      let returnReason = '';
      let myReview = null;

      if (assignments && assignments.length) {
        const myAsgn = assignments.find(a => a.projectId === this.data.projectId);
        if (myAsgn) {
          assignmentStatus = myAsgn.status;
          if (myAsgn.review) {
            myReview = myAsgn.review;
            returnReason = myAsgn.review.returnReason || '';
          }
        }
      }

      // 判断是否可操作
      const canReview = !['locked'].includes(assignmentStatus) && currentRound && currentRound.status === 'open';

      this.setData({
        loading: false,
        project,
        currentRound,
        assignmentStatus,
        assignmentId: assignment._id || assignment.assignmentId || '',
        returnReason,
        canReview
      });
    } catch (err) {
      this.setData({ loading: false });
      console.error('加载项目详情失败:', err);
    }
  },

  goReview() {
    const { projectId, projectName, assignmentId, assignmentStatus } = this.data;
    const isReadonly = ['submitted', 'resubmitted', 'locked'].includes(assignmentStatus) && assignmentStatus !== 'returned';
    wx.navigateTo({
      url: `/pages/review/review?projectId=${projectId}&projectName=${encodeURIComponent(projectName)}&assignmentId=${assignmentId}&readonly=${isReadonly}`
    });
  }
});
