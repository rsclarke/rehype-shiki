import * as shiki from 'shiki'
import {BUNDLED_LANGUAGES} from 'shiki-languages'
import {Node} from 'unist'
import visit from 'unist-util-visit'
import hastToString from 'hast-util-to-string'
import u from 'unist-builder'

interface NodeWithChildren extends Node {
  children?: Node[]
  value?: string
}

function tokensToHast(lines: shiki.IThemedToken[][]) {
  let tree = []

  for (const line of lines) {
    if (line.length === 0) {
      tree.push(u('text', '\n'))
    } else {
      for (const token of line) {
        tree.push(
          u(
            'element',
            {
              tagName: 'span',
              properties: {style: `color: ${token.color!}`}
            },
            [u('text', token.content)]
          )
        )
      }

      tree.push(u('text', '\n'))
    }
  }

  // Remove the last \n
  tree.pop()

  return tree
}

function addStyle(node: Node, style: string) {
  const props = (node.properties || {}) as Record<string, string>

  props.style = props.style ? props.style + ';' + style : style
  node.properties = props
}

function codeLanguage(node: Node) {
  const props = (node.properties || {}) as Record<string, string[]>
  const className = props.className || []

  let value: string

  for (const element of className) {
    value = element

    if (value.startsWith('language-')) {
      return value.slice(9)
    }
  }

  return null
}

interface PluginOptions {
  theme?: string
  useBackground?: boolean
  langs?: shiki.ILanguageRegistration[]
}

let highlighter: shiki.Highlighter

function attacher(options: PluginOptions = {}) {
  const {theme = 'nord', useBackground = true, langs = []} = options

  return transformer

  async function transformer(tree: NodeWithChildren) {
    highlighter ||= await shiki.getHighlighter({
      theme,
      langs: [...BUNDLED_LANGUAGES, ...langs]
    })

    visit(tree, 'element', (node, _, parent) => {
      if (!parent || parent.tagName !== 'pre' || node.tagName !== 'code') {
        return
      }

      if (useBackground) {
        addStyle(node, 'background: ' + highlighter.getBackgroundColor())
      }

      const lang = codeLanguage(node)

      if (!lang) {
        // Unknown language, fall back to a foreground colour
        addStyle(node, 'color: ' + highlighter.getForegroundColor())
        return
      }

      const tokens = highlighter.codeToThemedTokens(hastToString(node), lang)
      const tree = tokensToHast(tokens)

      node.children = tree
    })
  }
}

export = attacher
