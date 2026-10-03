import type { OutputFormat } from '@/types/workspace'

const OUTPUT_FORMAT_ASPECT: Record<OutputFormat, number> = {
  '9:16': 9 / 16,
  '1:1': 1,
  '16:9': 16 / 9,
}

export function outputFormatAspect(format: OutputFormat): number {
  return OUTPUT_FORMAT_ASPECT[format]
}

export function outputFormatCssAspect(format: OutputFormat): string {
  return format.replace(':', ' / ')
}
