/**
 * 邮件通知（nodemailer 实现）
 * 真实使用请在 Render / .env 配置：
 *   SMTP_HOST    SMTP 服务器域名（如 smtp.qq.com / smtp.gmail.com）
 *   SMTP_PORT    端口（QQ/Gmail SSL=465，TLS=587）
 *   SMTP_USER    登录账号
 *   SMTP_PASS    授权码（QQ 邮箱需要在「设置→账户」生成专用授权码）
 *   SMTP_FROM    发件人显示名 + 邮箱
 *
 * 未配置时所有 sendAlertEmail 调用降级为 console 打印（mock），不报错。
 */
import nodemailer from 'nodemailer'
import { config } from '../lib/config'

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (transporter) return transporter
  if (!config.SMTP.host) return null
  transporter = nodemailer.createTransport({
    host: config.SMTP.host,
    port: config.SMTP.port,
    // 465 = implicit TLS；587 = STARTTLS（部分云平台 465 出口被拦，587 更稳）
    secure: config.SMTP.port === 465,
    requireTLS: config.SMTP.port === 587,
    auth: { user: config.SMTP.user, pass: config.SMTP.pass },
    // 显式缩短超时，避免请求挂死
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    // QQ SMTP 部分出口对自签证书敏感，放宽校验
    tls: { rejectUnauthorized: false },
  })
  return transporter
}

/**
 * 检查 SMTP 是否已配置（用于 seed 时自动决定默认 channels）
 */
export function isSmtpConfigured(): boolean {
  return Boolean(config.SMTP.host && config.SMTP.user && config.SMTP.pass)
}

const SEVERITY_COLOR: Record<string, string> = {
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#7f1d1d',
}

const SEVERITY_LABEL: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
}

export async function sendAlertEmail(alert: any) {
  const t = getTransporter()
  if (!t) {
    console.log(`📧 [Mock Email — 未配置 SMTP] 告警 #${alert.id}: ${alert.message}`)
    return { sent: false, reason: 'smtp_not_configured' }
  }

  const severity = String(alert.severity || 'medium')
  const color = SEVERITY_COLOR[severity] || '#6b7280'
  const label = SEVERITY_LABEL[severity] || severity

  const subject = `【AgriSense 告警·${label}级】${alert.metric} 异常（${alert.value?.toFixed?.(2) ?? alert.value}）`

  const html = `
  <div style="font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #f8fafc;">
    <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08);">
      <div style="height: 4px; background: ${color};"></div>
      <div style="padding: 24px;">
        <h2 style="margin: 0 0 16px; color: #0f172a; font-size: 18px;">
          🌱 AgriSense 环境异常告警
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
          <tr><td style="padding: 6px 0; color: #64748b;">指标</td><td style="padding: 6px 0;"><b>${alert.metric}</b></td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">当前值</td><td style="padding: 6px 0;"><b style="color: ${color};">${alert.value?.toFixed?.(2) ?? alert.value}</b></td></tr>
          ${alert.threshold != null ? `<tr><td style="padding: 6px 0; color: #64748b;">阈值</td><td style="padding: 6px 0;">${alert.op || ''} ${alert.threshold}</td></tr>` : ''}
          <tr><td style="padding: 6px 0; color: #64748b;">等级</td><td style="padding: 6px 0;"><span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${label} 级</span></td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">来源</td><td style="padding: 6px 0;">${alert.source === 'algorithm' ? '算法检测' : '阈值规则'}</td></tr>
          ${alert.z_score != null ? `<tr><td style="padding: 6px 0; color: #64748b;">Z-Score</td><td style="padding: 6px 0;">${alert.z_score.toFixed(2)}</td></tr>` : ''}
          <tr><td style="padding: 6px 0; color: #64748b;">时间</td><td style="padding: 6px 0;">${alert.created_at}</td></tr>
        </table>
        <p style="margin: 16px 0 0; padding: 12px; background: #f1f5f9; border-radius: 4px; font-size: 13px; color: #475569;">
          ${alert.message || ''}
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
          本邮件由 AgriSense 自动发出 · 登录系统查看详情
        </p>
      </div>
    </div>
  </div>
  `

  try {
    await t.sendMail({
      from: config.SMTP.from,
      to: config.SMTP.user, // 默认发给配置者本人
      subject,
      html,
    })
    console.log(`📧 [Email Sent] ${alert.message}`)
    return { sent: true }
  } catch (err: any) {
    console.error('[Email Error]', err?.message || err)
    return { sent: false, reason: err?.message || 'send_failed' }
  }
}