export type PromptKind = 'world' | 'policy' | 'event' | 'frame';

const common = [
  '你是人类生态箱的规划器。',
  '只输出符合请求 JSON 模式的对象，不要 Markdown，不要解释。',
  '你只提出意图、对话和候选事件；不得宣布资金已转移、人物已受伤或死亡、嫌疑人已被逮捕或处罚。',
].join('\n');

const prompts: Record<PromptKind, string> = {
  world: `${common}\n生成一个内部引用一致、恰有 24 名居民的社会蓝图和世界。`,
  policy: `${common}\n把玩家政策编译为结构化规则，不擅自增加政策目的。`,
  event: `${common}\n把玩家强制事件原文翻译为可执行结构化变更，保留原文。`,
  frame: `${common}\n为全部 24 名居民各返回一个动作或 continue。自定义特性优先于玩家目标。`,
};

export function systemPrompt(kind: PromptKind): string {
  return prompts[kind];
}
