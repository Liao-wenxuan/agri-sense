/**
 * ECharts 主题工具
 * 根据当前 theme store 自动返回匹配的图表 option
 */
import type { Ref } from 'vue'

export const PALETTE = {
  light: {
    textColor:    '#475569',
    axisLine:     '#cbd5e1',
    axisLabel:    '#64748b',
    splitLine:    '#e2e8f0',
    tooltipBg:    '#ffffff',
    tooltipText:  '#0f172a',
    legendText:   '#64748b',
  },
  dark: {
    textColor:    '#c9d1d9',
    axisLine:     '#30363d',
    axisLabel:    '#8b949e',
    splitLine:    '#21262d',
    tooltipBg:    '#1c2230',
    tooltipText:  '#f0f6fc',
    legendText:   '#c9d1d9',
  },
} as const

export function getChartTheme(isDark: boolean) {
  return isDark ? PALETTE.dark : PALETTE.light
}

/**
 * 给 ECharts option 注入主题色
 * 用法：const option = injectTheme(rawOption, isDark)
 */
export function injectTheme<T extends Record<string, any>>(option: T, isDark: boolean): T {
  const t = getChartTheme(isDark)
  option.textStyle = { ...(option.textStyle || {}), color: t.textColor }
  if (option.xAxis) {
    const xa = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis]
    xa.forEach((a: any) => {
      a.axisLine = { ...(a.axisLine || {}), lineStyle: { ...((a.axisLine && a.axisLine.lineStyle) || {}), color: t.axisLine } }
      a.axisLabel = { ...(a.axisLabel || {}), color: t.axisLabel }
    })
  }
  if (option.yAxis) {
    const ya = Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis]
    ya.forEach((a: any) => {
      a.axisLine = { ...(a.axisLine || {}), lineStyle: { ...((a.axisLine && a.axisLine.lineStyle) || {}), color: t.axisLine } }
      a.axisLabel = { ...(a.axisLabel || {}), color: t.axisLabel }
      a.splitLine = { ...(a.splitLine || {}), lineStyle: { ...((a.splitLine && a.splitLine.lineStyle) || {}), color: t.splitLine } }
    })
  }
  if (option.legend) {
    option.legend = { ...option.legend, textStyle: { ...(option.legend.textStyle || {}), color: t.legendText } }
  }
  if (option.tooltip) {
    option.tooltip = {
      ...option.tooltip,
      backgroundColor: t.tooltipBg,
      textStyle: { ...(option.tooltip.textStyle || {}), color: t.tooltipText },
      borderColor: t.axisLine,
    }
  }
  return option
}