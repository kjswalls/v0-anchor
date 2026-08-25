/**
 * Whoever is answering. The chat surface is named after the provider, so the
 * placeholder, the empty state and the tab header all have to agree — three
 * places computing the same ternary is how "Message Beacon…" ends up under an
 * OpenClaw transcript.
 */
export function chatAssistantName(provider: string): string {
  return provider === 'openclaw' ? 'OpenClaw' : 'Beacon';
}

/**
 * The same name, qualified by WHICH agent when there is more than one to mean.
 * Header rows use this; anything speaking to the user in a sentence uses the
 * bare name above.
 */
export function chatAssistantLabel(provider: string, agentIdDisplay?: string | null): string {
  const name = chatAssistantName(provider);
  return provider === 'openclaw' && agentIdDisplay ? `${name} · ${agentIdDisplay}` : name;
}

/**
 * Strips reasoning/internal tags from AI assistant output.
 *
 * Handles:
 * - <think>...</think> blocks (and unclosed <think>...EOF)
 * - <final>...</final> wrappers (content preserved, tags removed; unclosed tags also handled)
 * - [[reply_to ...]] routing tags (anywhere in the string)
 */
export function stripReasoningTags(text: string): string {
  // Remove <think>...</think> OR unclosed <think>...EOF
  let out = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
  // Unwrap <final>...</final> OR strip unclosed <final>...EOF
  out = out.replace(/<final>([\s\S]*?)(?:<\/final>|$)/gi, '$1')
  // Remove [[reply_to ...]] routing tags
  out = out.replace(/\[\[reply_to[^\]]*\]\]/gi, '')
  return out
}
