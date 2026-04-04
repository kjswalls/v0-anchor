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
