// Template registry — maps template codes to builder functions.
// To add a new template: create a builder file and add one entry here.

import { buildBasicTemplate } from "./basic"
import { buildCompactTemplate } from "./compact"
import { buildModernTemplate } from "./modern"
import type { TemplateBuilder } from "./types"

export const templateRegistry: Record<string, TemplateBuilder> = {
  basic: buildBasicTemplate,
  modern: buildModernTemplate,
  compact: buildCompactTemplate,
}

/**
 * Returns the builder function for a given template code.
 * Falls back to Basic if the code is not found.
 */
export function getTemplateBuilder(
  code: string | null | undefined,
): TemplateBuilder {
  if (code && templateRegistry[code]) {
    return templateRegistry[code]
  }
  return templateRegistry.basic
}
