/* ============================================================
   智行江畔 V6.9 —— 问卷真实数据（2026年10月 本校大一新生 N=29）
   本文件为只读数据源，禁止修改数值。
   答辩引用规范：引用"79.3%不知道部门办公室"时，须同时注明
   sq2 多选（"找不到校内办公地点/部门" 23/29）与
   sq3 单选（"各部门办公室位置与电话" 23/29）两个数据点双佐证。
   ============================================================ */
const surveyData = {
  meta: { title: "📊 需求调研验证", n: 29, note: "2026年10月 面向本校大一新生" },
  questions: [
    { id: "sq1", type: "single", q: "1. 你所在的年级是？",
      chart: "pie",
      options: [
        { label: "大一", count: 29 },
        { label: "大二", count: 0 },
        { label: "大三", count: 0 },
        { label: "大四", count: 0 } ] },
    { id: "sq2", type: "multi", q: "2. 开学以来，你在校园生活中遇到过哪些困扰？（多选）",
      chart: "bar",
      note: "多选，各选项占比独立按29人计算，总和可超过100%，禁止归一化",
      options: [
        { label: "食堂高峰期排队久", count: 23 },
        { label: "找不到校内办公地点/部门", count: 23 },
        { label: "不清楚办事流程（报修/报销/补办证件）", count: 20 },
        { label: "不了解图书馆座位/开放时间", count: 18 },
        { label: "校园导航靠问路、效率低", count: 17 },
        { label: "不了解医保报销政策", count: 15 },
        { label: "其他", count: 3 } ] },
    { id: "sq3", type: "single", q: "3. 以下哪类校园信息你最不清楚？",
      chart: "bar",
      options: [
        { label: "各部门办公室位置与电话", count: 23 },
        { label: "教务/学工各类办事流程", count: 19 },
        { label: "校历与考试时间节点", count: 12 },
        { label: "医保与报销政策", count: 11 },
        { label: "都清楚", count: 2 } ] },
    { id: "sq4", type: "multi", q: "4. 你希望校园助手具备哪些功能？（多选）",
      chart: "bar",
      note: "多选，各选项占比独立按29人计算，总和可超过100%，禁止归一化",
      options: [
        { label: "课程/学业智能问答", count: 23 },
        { label: "校园办事指南（流程化指引）", count: 19 },
        { label: "食堂拥挤度/排队时间预测", count: 16 },
        { label: "校园地图导航+楼栋查询", count: 15 },
        { label: "校历/考试倒计时提醒", count: 14 },
        { label: "图书馆空座查询", count: 12 } ] },
    { id: "sq5", type: "single", q: "5. 遇到问题时你通常如何解决？",
      chart: "pie",
      options: [
        { label: "问学长学姐/同学", count: 14 },
        { label: "在群里问辅导员", count: 8 },
        { label: "自己搜学校官网/公众号", count: 5 },
        { label: "不知道怎么解决", count: 2 } ] },
    { id: "sq6", type: "single", q: "6. 如果有这样一个集地图、指南、AI问答于一体的校园助手，你会使用吗？",
      chart: "pie",
      options: [
        { label: "会，经常使用", count: 16 },
        { label: "会，偶尔使用", count: 10 },
        { label: "看情况", count: 3 },
        { label: "不会", count: 0 } ] },
    { id: "sq7", type: "single", q: "7. 你常去哪个食堂？",
      chart: "pie",
      options: [
        { label: "麦庐二食堂", count: 6 },
        { label: "麦庐一食堂", count: 5 },
        { label: "蛟桥一食堂", count: 5 },
        { label: "麦庐三食堂", count: 4 },
        { label: "蛟桥二食堂", count: 4 },
        { label: "其他/不固定", count: 5 } ] },
    { id: "sq8", type: "single", q: "8. 你能接受食堂高峰期最长等多久？",
      chart: "bar",
      options: [
        { label: "10分钟以内", count: 17 },
        { label: "10-20分钟", count: 9 },
        { label: "20-30分钟", count: 2 },
        { label: "30分钟以上也能接受", count: 1 } ] },
    { id: "sq9", type: "multi", q: "9. 以下哪些“实时状态”功能对你最有用？（多选）",
      chart: "bar",
      note: "多选，各选项占比独立按29人计算，总和可超过100%，禁止归一化",
      options: [
        { label: "实时查场地空闲（操场/自习室）", count: 12 },
        { label: "食堂窗口拥挤度", count: 11 },
        { label: "快递站排队情况", count: 9 },
        { label: "图书馆空座数", count: 8 } ] },
    { id: "sq10", type: "single", q: "10. 你最希望AI助手回答哪类问题？",
      chart: "bar",
      options: [
        { label: "办事流程类（补办证件/报销等）", count: 15 },
        { label: "课程学习类", count: 7 },
        { label: "校园生活类（吃住行）", count: 5 },
        { label: "都无所谓", count: 2 } ] }
  ],
  openEnded: {
    id: "sq11", q: "11. 哪栋楼的厕所更干净整洁？（开放题）",
    note: "原始回答保留在问卷平台详情中，本面板不展示个体回答，仅提示查看渠道"
  }
};
