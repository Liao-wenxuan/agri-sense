/**
 * 邮件通知（占位实现）
 * 真实使用请配置 .env 中的 SMTP_HOST/PORT/USER/PASS
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
    secure: config.SMTP.port === 465,
    auth: { user: config.SMTP.user, pass: config.SMTP.pass },
  })
  return transporter
}

export async function sendAlertEmail(alert: any) {
  const t = getTransporter()
  if (!t) {
    console.log(`📧 [Mock Email] 告警 ${alert.id}: ${alert.message}`)
    return
  }
  try {
    await t.sendMail({
      from: config.SMTP.from,
      to: config.SMTP.user,  // 默认发给配置者
      subject: `【AgriSense 告警】${alert.metric} 异常`,
      html: `
        <h2>环境异常告警</h2>
        <p><b>指标：</b>${alert.metric}</p>
        <p><b>当前值：</b>${alert.value}</p>
        <p><b>阈值：</b>${alert.op || ''} ${alert.threshold}</p>
        <p><b>等级：</b>${alert.severity}</p>
        <p><b>时间：</b>${alert.created_at}</p>
      `,
    })
    console.log(`📧 [Email Sent] ${alert.message}`)
  } catch (err) {
    console.error('[Email Error]', err)
  }
}