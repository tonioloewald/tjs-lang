/**
 * Where is the model's answer? Ask, rather than assume.
 *
 * A reasoning model can leave `content` empty and put the answer in `reasoning_content`. It is
 * not an edge case or a broken server — measured against `qwen/qwen3.8-27b`, asking for
 * structured output makes it the NORMAL case:
 *
 *     response_format: json_schema
 *     -> finish_reason  : 'stop'
 *        content        : ''
 *        reasoning_content: '{"name": "John Smith", "age": 35, …}'
 *        completion_tokens: 22
 *
 * Twenty-two tokens and a clean stop, so this is not truncation or an exhausted budget — the
 * model simply routes the whole answer through the reasoning channel. A caller that reads
 * `content` gets `''`, and `JSON.parse('')` fails with "Unexpected EOF", which reads like a
 * malformed response rather than like looking in the wrong place.
 *
 * `content` wins when both are present: it is the real channel, and the reasoning trace is
 * only a fallback for models that misroute.
 *
 * ## Why this is its own module
 *
 * It lived in `batteries/audit.ts`, and every parallel implementation that did not import from
 * there kept the old behaviour — six call sites in `demo/src/capabilities.ts` still read
 * `message.content` directly, so four LLM playground examples failed with "Unexpected EOF"
 * while the batteries handled the same models correctly. That is the third duplicate in this
 * area to drift the same way: the vision probe was a local copy that still sent a 1x1 PNG
 * after the shared one was fixed, and `findVisionModel` judged a thinking model blind for
 * exactly this reason — an empty `content` read as "cannot do this".
 *
 * A leaf with no dependencies, so nothing has an excuse to copy it.
 */

/** An OpenAI-shaped assistant message, as far as we care about it. */
export interface AnswerBearingMessage {
  content?: unknown
  reasoning_content?: unknown
  reasoning?: unknown
}

/** The answer text, from whichever channel actually holds it. `''` when there is none. */
export function messageText(
  message: AnswerBearingMessage | null | undefined
): string {
  if (!message) return ''
  const content = typeof message.content === 'string' ? message.content : ''
  if (content.trim()) return content
  const reasoning =
    typeof message.reasoning_content === 'string'
      ? message.reasoning_content
      : typeof message.reasoning === 'string'
      ? message.reasoning
      : ''
  return reasoning
}

/**
 * The message with `content` backfilled from the reasoning channel when it is empty.
 *
 * For callers that hand the whole message onward (the battery atoms return OpenAI message
 * shape, not a string). The raw fields are left in place for anything that wants them, and a
 * message whose `content` is already populated is returned untouched — never copied, so
 * identity is preserved for the overwhelmingly common case.
 */
export function withAnswerContent<T extends AnswerBearingMessage>(
  message: T | null | undefined
): T | { content: string } {
  if (!message) return { content: '' }
  const text = messageText(message)
  return text && !message.content ? { ...message, content: text } : message
}
