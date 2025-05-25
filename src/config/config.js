require('dotenv').config();

module.exports = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY,
    databaseId: process.env.NOTION_DATABASE_ID
  },
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  threadAnalysis: {
    minReplies: parseInt(process.env.MIN_THREAD_REPLIES || '5', 10),
    waitMinutes: parseInt(process.env.MIN_THREAD_WAIT_MINUTES || '30', 10)
  },
  groupAnalysis: {
    timeGapMinutes: parseInt(process.env.GROUP_TIME_GAP_MINUTES || '5', 10),
    waitMinutes: parseInt(process.env.GROUP_WAIT_MINUTES || '5', 10),
    immediateAnalysisGapMinutes: parseInt(process.env.GROUP_IMMEDIATE_GAP_MINUTES || '3', 10),
    enableAutoAnalysis: process.env.ENABLE_GROUP_AUTO_ANALYSIS !== 'false'
  }
}; 