/* ============================================================
   智行江畔 V6.6 —— 问卷数据（6道题，全部挂 window 全局）
   持久化键：zxsj66_survey；JSON 导入后写回 localStorage，刷新优先恢复
   ============================================================ */
window.surveyData = [
  {
    id: 'sq1', title: '你每月在校园生活服务上的支出大约是？', chart: 'bar',
    options: [
      { text: '300元以下', count: 0 },
      { text: '300-600元', count: 0 },
      { text: '600-1000元', count: 0 },
      { text: '1000元以上', count: 0 }
    ]
  },
  {
    id: 'sq2', title: '你最常使用的校园服务是？（多选 top1）', chart: 'pie',
    options: [
      { text: '食堂餐饮', count: 0 },
      { text: '快递收发', count: 0 },
      { text: '医保/医疗服务', count: 0 },
      { text: '打印/文具', count: 0 },
      { text: '运动场馆', count: 0 }
    ]
  },
  {
    id: 'sq3', title: '你是否遇到过"不知道该去哪个部门办事"的情况？', chart: 'pie',
    options: [
      { text: '经常遇到', count: 0 },
      { text: '偶尔遇到', count: 0 },
      { text: '几乎没有', count: 0 }
    ]
  },
  {
    id: 'sq4', title: '你希望校园地图优先标注哪类点位？', chart: 'bar',
    options: [
      { text: '食堂及窗口评价', count: 0 },
      { text: '办事部门位置', count: 0 },
      { text: '医疗与药店', count: 0 },
      { text: '快递与超市', count: 0 }
    ]
  },
  {
    id: 'sq5', title: '你平时通过什么渠道了解办事流程？', chart: 'bar',
    options: [
      { text: '辅导员/班级群', count: 0 },
      { text: '学校官网/教务处', count: 0 },
      { text: '学长学姐口口相传', count: 0 },
      { text: '基本没有渠道', count: 0 }
    ]
  },
  {
    id: 'sq6', title: '如果有一个"办事路径规划+问题搜索"的校园助手，你会？', chart: 'pie',
    options: [
      { text: '立即使用并推荐给同学', count: 0 },
      { text: '先观望一下', count: 0 },
      { text: '不太需要', count: 0 }
    ]
  }
];
