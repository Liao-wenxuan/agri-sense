import 'dotenv/config'

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'agri-sense-dev-secret-change-me',
  JWT_EXPIRES_IN: '7d' as any,
  SMTP: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@agri-sense.local',
  },
}