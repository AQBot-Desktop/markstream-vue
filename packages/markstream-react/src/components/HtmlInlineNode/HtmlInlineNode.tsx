import type { ComponentType } from 'react'
import type { NodeComponentProps } from '../../types/node-component'
import type { HtmlToken } from '../../utils/htmlToReact'
import React, { useEffect, useRef, useState } from 'react'
import { BLOCKED_HTML_TAGS as BLOCKED_TAGS, convertHtmlAttrsToProps, sanitizeHtmlContent } from 'stream-markdown-parser'
import { getCustomNodeComponents } from '../../customComponents'
import {
  hasCustomHtmlComponents,
  isCustomHtmlComponent,
  normalizeDomAttrs,
  sanitizeHtmlAttrs,
  tokenizeHtml,
} from '../../utils/htmlToReact'

const SHOULD_LOG = (() => {
  try {
    return Boolean((import.meta as any).env?.DEV)
  }
  catch {}
  return false
})()

function warn(message: string) {
  if (SHOULD_LOG)
    console.warn(message)
}

function logError(message: string, err: unknown) {
  if (SHOULD_LOG)
    console.error(message, err)
}

function convertAttrsToProps(attrs: Record<string, string>): Record<string, any> {
  return convertHtmlAttrsToProps(attrs)
}

/**
 * Build React element tree from tokens
 */
function buildReactElementTree(
  tokens: HtmlToken[],
  customComponents: Record<string, ComponentType<any>>,
): React.ReactNode[] {
  let autoKeySeed = 0
  const stack: Array<{ tagName: string, children: React.ReactNode[], attrs?: Record<string, string> }> = []
  const rootNodes: React.ReactNode[] = []

  for (const token of tokens) {
    if (token.type === 'text') {
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      target.push(token.content!)
    }
    else if (token.type === 'self_closing') {
      const element = createReactElement(token.tagName!, token.attrs || {}, [], customComponents, `ms-html-${autoKeySeed++}`)
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      element != null && target.push(element)
    }
    else if (token.type === 'tag_open') {
      stack.push({ tagName: token.tagName!, children: [], attrs: token.attrs })
    }
    else if (token.type === 'tag_close') {
      const closingTag = token.tagName!.toLowerCase()

      // Find matching opening tag (handle nested same tags)
      let matchedIndex = -1
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName.toLowerCase() === closingTag) {
          matchedIndex = i
          break
        }
      }

      if (matchedIndex !== -1) {
        // Pop all tags until the matched one (auto-closing intermediate tags)
        while (stack.length > matchedIndex) {
          const opening = stack.pop()!
          const element = createReactElement(opening.tagName, opening.attrs || {}, opening.children, customComponents, `ms-html-${autoKeySeed++}`)

          if (stack.length > 0)
            element != null && stack[stack.length - 1].children.push(element)
          else
            element != null && rootNodes.push(element)

          // Warn if auto-closing tags
          if (opening.tagName.toLowerCase() !== closingTag && stack.length > matchedIndex) {
            warn(`Auto-closing unclosed tag: <${opening.tagName}>`)
          }
        }
      }
      else {
        // No matching opening tag, warn and ignore
        warn(`Ignoring closing tag with no matching opening tag: </${token.tagName}>`)
      }
    }
  }

  // Handle any remaining unclosed tags
  while (stack.length > 0) {
    const unclosed = stack.pop()!
    const element = createReactElement(unclosed.tagName, unclosed.attrs || {}, unclosed.children, customComponents, `ms-html-${autoKeySeed++}`)
    element != null && rootNodes.push(element)
    warn(`Auto-closing unclosed tag: <${unclosed.tagName}>`)
  }

  return rootNodes
}

/**
 * Create React element for a tag
 */
function createReactElement(
  tagName: string,
  attrs: Record<string, string>,
  children: React.ReactNode[],
  customComponents: Record<string, ComponentType<any>>,
  autoKey: string,
): React.ReactNode {
  if (BLOCKED_TAGS.has(tagName.toLowerCase()))
    return null

  const sanitizedAttrs = sanitizeHtmlAttrs(attrs)
  const explicitKey = (sanitizedAttrs as any).key
  const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : autoKey

  if (isCustomHtmlComponent(tagName, customComponents)) {
    // It's a custom React component
    const component = customComponents[tagName] || customComponents[tagName.toLowerCase()]
    const convertedAttrs = convertAttrsToProps(sanitizedAttrs)
    return React.createElement(component as ComponentType<any>, { ...convertedAttrs, key: elementKey }, ...children)
  }
  else {
    // It's a standard HTML element
    return React.createElement(tagName, { ...normalizeDomAttrs(sanitizedAttrs), key: elementKey }, ...children)
  }
}

/**
 * Parse HTML content to React elements
 */
function parseHtmlToReactNodes(
  content: string,
  customComponents: Record<string, ComponentType<any>>,
): React.ReactNode[] | null {
  if (!content)
    return []

  try {
    const tokens = tokenizeHtml(content)
    const nodes = buildReactElementTree(tokens, customComponents)
    return nodes
  }
  catch (error) {
    logError('Failed to parse HTML to React nodes:', error)
    return null
  }
}

export function HtmlInlineNode(props: NodeComponentProps<{
  type: 'html_inline'
  content: string
  loading?: boolean
  autoClosed?: boolean
}>) {
  const { node, customId } = props
  const containerRef = useRef<HTMLSpanElement>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Get custom components from global registry
  const customComponents = getCustomNodeComponents(customId)
  const safeHtmlContent = React.useMemo(() => sanitizeHtmlContent(node.content ?? ''), [node.content])

  // Computed property to determine render mode and content
  const renderMode = React.useMemo(() => {
    const content = node.content
    if (!content)
      return { mode: 'html', content: '' }

    // Check if content contains custom components
    if (!hasCustomHtmlComponents(content, customComponents))
      return { mode: 'html', content }

    // Parse and build React element tree
    const nodes = parseHtmlToReactNodes(content, customComponents)
    if (nodes === null)
      return { mode: 'html', content } // Fallback to dangerouslySetInnerHTML if parsing fails

    return { mode: 'dynamic', nodes }
  }, [node.content, customComponents])

  // Use DOM manipulation for pure HTML (mode: 'html')
  useEffect(() => {
    if (!isClient || !containerRef.current || renderMode.mode !== 'html')
      return

    const host = containerRef.current
    host.innerHTML = ''
    const template = document.createElement('template')
    template.innerHTML = safeHtmlContent
    host.appendChild(template.content.cloneNode(true))
  }, [renderMode.mode, isClient, safeHtmlContent])

  // Loading state handling
  if (node.loading && !node.autoClosed) {
    return (
      <span className="html-inline-node html-inline-node--loading">
        {node.content}
      </span>
    )
  }

  // Dynamic rendering for custom components
  if (renderMode.mode === 'dynamic') {
    return (
      <span
        className="html-inline-node"
        style={{ display: 'inline' }}
      >
        {renderMode.nodes}
      </span>
    )
  }

  // Fallback to DOM rendering for standard HTML
  return (
    <span
      ref={containerRef}
      className="html-inline-node"
      style={{ display: 'inline' }}
    />
  )
}

export default HtmlInlineNode
