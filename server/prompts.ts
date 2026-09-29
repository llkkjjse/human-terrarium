export type PromptKind = 'world' | 'policy' | 'event' | 'frame';

const common = [
  '你是人类生态箱的规划器。',
  '只输出符合请求 JSON 模式的对象，不要 Markdown，不要解释。',
  '你只提出意图、对话和候选事件；不得宣布资金已转移、人物已受伤或死亡、嫌疑人已被逮捕或处罚。',
].join('\n');

const prompts: Record<PromptKind, string> = {
  world: `${common}\n\u53ea\u751f\u6210\u7cbe\u7b80\u7684\u793e\u4f1a\u84dd\u56fe\uff1a\u540d\u79f0\u3001\u63cf\u8ff0\u3001\u65f6\u4ee3\u53c2\u6570\u548c\u521d\u59cb\u653f\u7b56\u3002\u4e0d\u8981\u751f\u6210\u5c45\u6c11\u3001\u8d44\u4ea7\u3001\u5730\u533a\u6216\u4e8b\u4ef6\uff0c\u8fd9\u4e9b\u7531\u672c\u5730\u6a21\u62df\u5668\u521b\u5efa\u3002`,
  policy: `${common}\n把玩家政策编译为结构化规则，不擅自增加政策目的。`,
  event: `${common}\n把玩家强制事件原文翻译为可执行结构化变更，保留原文。`,
  frame: `${common}\n为全部 24 名居民各返回一个动作或 continue。自定义特性优先于玩家目标。`,
};

export function systemPrompt(kind: PromptKind): string {
  return prompts[kind];
}
