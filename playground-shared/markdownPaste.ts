interface TextareaSelectionLike {
  value: string
  selectionStart: number | null
  selectionEnd: number | null
}

export interface MarkdownPasteResult {
  nextValue: string
  selectionStart: number
  selectionEnd: number
}

export function normalizePastedMarkdownNewlines(content: string) {
  if (!content.includes('\\n') || /[\r\n]/.test(content))
    return content

  let normalized = ''
  let changed = false

  for (let index = 0; index < content.length; index++) {
    if (content[index] !== '\\') {
      normalized += content[index]
      continue
    }

    let slashEnd = index
    while (slashEnd < content.length && content[slashEnd] === '\\')
      slashEnd++

    const slashCount = slashEnd - index
    const nextChar = content[slashEnd]

    if (nextChar === 'n' && slashCount % 2 === 1) {
      normalized += '\\'.repeat((slashCount - 1) / 2)
      normalized += '\n'
      changed = true
      index = slashEnd
      continue
    }

    normalized += '\\'.repeat(slashCount)
    index = slashEnd - 1
  }

  return changed ? normalized : content
}

export function resolveMarkdownTextareaPaste(
  textarea: TextareaSelectionLike,
  pasted: string,
): MarkdownPasteResult | null {
  if (!pasted || !pasted.includes('\\n') || /[\r\n]/.test(pasted))
    return null

  const normalized = normalizePastedMarkdownNewlines(pasted)
  const selectionStart = textarea.selectionStart ?? textarea.value.length
  const selectionEnd = textarea.selectionEnd ?? textarea.value.length
  const nextValue = `${textarea.value.slice(0, selectionStart)}${normalized}${textarea.value.slice(selectionEnd)}`
  const cursor = selectionStart + normalized.length

  return {
    nextValue,
    selectionStart: cursor,
    selectionEnd: cursor,
  }
}
