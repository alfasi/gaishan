import * as OpenCC from 'opencc-js'

const converter = OpenCC.Converter({ from: 'tw', to: 'cn' })

/**
 * Convert traditional Chinese text to simplified.
 * @param {string} text
 * @returns {string}
 */
export function toSimplified(text) {
  return converter(text)
}
