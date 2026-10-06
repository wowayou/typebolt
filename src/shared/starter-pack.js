/* Starter snippet packs written on first install (only when there are no snippets).
 * Sample data, so these strings are intentionally not routed through chrome.i18n. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TypeBoltStarter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EN = [
    { name: 'Thanks', shortcut: ';thx', content: 'Thanks so much! I really appreciate your help.' },
    { name: 'Be right back', shortcut: ';brb', content: "I'm tied up at the moment. I'll get back to you as soon as I can." },
    { name: 'Email sign-off', shortcut: ';sig', content: 'Best regards,\n{input:Your name}' },
    { name: 'Today', shortcut: ';today', content: '{date:dddd, YYYY-MM-DD}' },
    { name: 'Date and time', shortcut: ';now', content: '{date} {time}' },
    { name: 'Meeting follow-up', shortcut: ';mtg', content: 'Hi {input:Name},\n\nThanks for your time on {date:dddd}. Here is a summary of what we discussed:\n\n- {cursor}\n\nBest,\n{input:Name}' },
    { name: 'AI: Translate', shortcut: ';tr', content: 'Translate the following text into {input:Target language}. Keep the original tone and formatting, and return only the translation.\n\nText:\n{cursor}' },
    { name: 'AI: Summarize', shortcut: ';sum', content: 'Summarize the text below in {input:Number} bullet points. Focus on decisions, numbers and action items.\n\nText:\n{cursor}' },
    { name: 'AI: Fix writing', shortcut: ';fix', content: 'Fix the grammar, spelling and clarity of the text below without changing its meaning. Return only the corrected text.\n\nText:\n{cursor}' },
    { name: 'AI: Explain', shortcut: ';exp', content: 'Explain {input:Topic} to {input:Audience}. Use plain language, one concrete example and no jargon.{cursor}' },
    { name: 'AI: Code review', shortcut: ';rev', content: 'Review the following {input:Language} code. List bugs first, then risky spots, then style nits. Be specific and short.\n\n```\n{cursor}\n```' },
  ];

  const ZH = [
    { name: '谢谢', shortcut: ';xiexie', content: '非常感谢！谢谢你的帮助。' },
    { name: '稍后回复', shortcut: ';shaohou', content: '您好，我现在手头有事，稍后第一时间回复您。' },
    { name: '邮件落款', shortcut: ';qm', content: '此致\n敬礼！\n{input:姓名}' },
    { name: '今天日期', shortcut: ';rq', content: '{date:YYYY年MM月DD日 dddd}' },
    { name: '日期和时间', shortcut: ';sj', content: '{date} {time}' },
    { name: '会议跟进', shortcut: ';hy', content: '{input:称呼}，您好：\n\n感谢您在{date:M月D日}抽时间沟通，现将会议要点整理如下：\n\n- {cursor}\n\n如有补充，请随时告诉我。' },
    { name: 'AI：翻译', shortcut: ';fy', content: '请把下面的文字翻译成{input:目标语言}，保持原有语气和格式，只输出译文。\n\n原文：\n{cursor}' },
    { name: 'AI：总结', shortcut: ';zj', content: '请用 {input:条数} 条要点总结下面的内容，重点保留结论、数字和待办事项。\n\n内容：\n{cursor}' },
    { name: 'AI：润色', shortcut: ';rs', content: '请润色下面的文字，修正错别字和语病，使表达更清晰自然，不改变原意，只输出润色后的文字。\n\n原文：\n{cursor}' },
    { name: 'AI：讲解', shortcut: ';jt', content: '请向{input:受众}讲解{input:主题}，用通俗的语言，举一个具体例子，避免术语。{cursor}' },
    { name: 'AI：代码审查', shortcut: ';cr', content: '请审查下面的 {input:编程语言} 代码：先列出 bug，再列出风险点，最后是风格建议，要具体且简短。\n\n```\n{cursor}\n```' },
  ];

  function getPack(uiLanguage) {
    const lang = String(uiLanguage || '').toLowerCase();
    return (lang.startsWith('zh') ? ZH : EN).map((s) => ({ ...s }));
  }

  return { EN, ZH, getPack };
});
