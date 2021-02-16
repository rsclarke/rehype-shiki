import * as shiki from 'shiki'
import {BUNDLED_LANGUAGES} from 'shiki-languages'
import {Node} from 'unist'
import visit from 'unist-util-visit'
import hastToString from 'hast-util-to-string'
import u from 'unist-builder'
import clone from 'fast-copy'

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

function addClass(node: Node, className: string) {
  const props = (node.properties || {}) as Record<string, string[]>
  props.className = props.className
    ? [...props.className, className]
    : [className]
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

type Theme = string | shiki.IShikiTheme

interface PluginOptions {
  theme?: string
  darkTheme?: Theme
  useBackground?: boolean
  langs?: shiki.ILanguageRegistration[]
}

let lightHighlighter: shiki.Highlighter
let darkHighlighter: shiki.Highlighter | undefined

function highlightBlock(
  highlighter: shiki.Highlighter,
  node: Node,
  options: {
    useBackground?: boolean
  }
) {
  if (options.useBackground) {
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
}

let light: Theme
let dark: Theme

async function getTheme(theme: Theme) {
  return typeof theme === 'string'
    ? shiki.BUNDLED_THEMES.includes(theme)
      ? theme
      : shiki.loadTheme(theme)
    : theme
}

function attacher(options: PluginOptions = {}) {
  const {theme = 'nord', darkTheme, useBackground = true, langs = []} = options

  return transformer

  async function transformer(tree: NodeWithChildren) {
    light ||= await getTheme(theme)
    lightHighlighter ||= await shiki.getHighlighter({
      theme: light,
      langs: [...BUNDLED_LANGUAGES, ...langs]
    })

    if (darkTheme) {
      dark ||= await getTheme(darkTheme)
      darkHighlighter ||= await shiki.getHighlighter({
        theme: dark,
        langs: [...BUNDLED_LANGUAGES, ...langs]
      })
    }

    visit(tree, 'element', (node, index, parent) => {
      if (
        !parent ||
        parent.tagName !== 'pre' ||
        node.tagName !== 'code' ||
        node.dark
      ) {
        return
      }

      highlightBlock(lightHighlighter, node, {useBackground})
      addClass(node, 'syntax-light')

      const darkNode = clone(node)
      darkNode.dark = true
      addClass(darkNode, 'syntax-dark')

      if (darkHighlighter) {
        highlightBlock(darkHighlighter, darkNode, {useBackground})
        parent.children.splice(index + 1, 0, darkNode)
      }
    })
  }
}

export = attacher
