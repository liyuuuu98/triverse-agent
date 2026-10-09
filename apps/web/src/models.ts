export function modelDisplayName(model: { id: string; label: string }): string {
  const claude = /^claude-(sonnet|opus|haiku)-(\d+(?:[.-]\d+)*)$/.exec(model.id);
  if (claude) return `Claude ${capitalize(claude[1])} ${claude[2].replaceAll("-", ".")}`;
  const gpt = /^gpt-(\d+(?:\.\d+)*)-(sol|astra|luna)$/.exec(model.id);
  if (gpt) return `GPT-${gpt[1]} ${capitalize(gpt[2])}`;
  if (model.id === "deepseek-flash") return "DeepSeek V4.1 Flash";
  return model.label;
}

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}
