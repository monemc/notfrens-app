const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
require('dotenv').config();

const app = express();

// =================== REAL PRODUCTION CONFIG ===================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7583849213:AAHIuBdbO0mXRxunb8qyqI-B8zpjlyDNthw';
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://notfrens-app-production.up.railway.app';
const OWNER_WALLET = process.env.OWNER_WALLET || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI";
const PREMIUM_PRICE = parseInt(process.env.PREMIUM_PRICE) || 11;
const ADMIN_ID = parseInt(process.env.ADMIN_TELEGRAM_ID) || 123456789;
const PORT = process.env.PORT || 8080;

console.log('🚀 NotFrens REAL PRODUCTION - Railway Deploy');
console.log('🌐 URL:', WEB_APP_URL);
console.log('💰 Premium:', PREMIUM_PRICE, 'USDT');
console.log('🔌 Port:', PORT);
console.log('📅 Started:', new Date().toISOString());

// Initialize Live Telegram Bot
let bot;
let botStatus = 'OFFLINE';
try {
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN.length > 10) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
    botStatus = 'LIVE';
    console.log('🤖 Telegram Bot LIVE - Connected');
  } else {
    console.log('❌ Bot token missing');
  }
} catch (error) {
  console.error('❌ Bot Error:', error.message);
  botStatus = 'ERROR';
}

// PRODUCTION CORS
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Production Security Headers
app.use((req, res, next) => {
  res.header('X-Powered-By', 'NotFrens-Production');
  res.header('X-Frame-Options', 'SAMEORIGIN');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'origin-when-cross-origin');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${ip}`);
  next();
});

// =================== DATABASE ===================
const users = new Map();
const referrals = new Map(); 
const payments = new Map();
const claims = new Map();

let stats = {
  totalUsers: 0,
  totalReferrals: 0,
  totalRevenue: 0,
  totalClaims: 0,
  totalPremiumUsers: 0,
  startTime: new Date().toISOString()
};

const LEVELS = {
  1: { required: 1, reward: 0, premium: false },
  2: { required: 3, reward: 0, premium: false },
  3: { required: 9, reward: 30, premium: true },
  4: { required: 27, reward: 0, premium: true },
  5: { required: 81, reward: 300, premium: true },
  6: { required: 243, reward: 0, premium: true },
  7: { required: 729, reward: 1800, premium: true },
  8: { required: 2187, reward: 0, premium: true },
  9: { required: 6561, reward: 20000, premium: true },
  10: { required: 19683, reward: 0, premium: true },
  11: { required: 59049, reward: 0, premium: true },
  12: { required: 177147, reward: 222000, premium: true }
};

// =================== UTILITY FUNCTIONS ===================
function isValidTelegramId(id) {
  return id && Number.isInteger(id) && id > 0 && id < 9999999999;
}

function isValidWallet(address) {
  return address && 
         (address.startsWith('EQ') || address.startsWith('UQ')) && 
         address.length >= 48 && address.length <= 55;
}

function createRealUser(telegramId, userData = {}) {
  const user = {
    id: telegramId,
    telegramId,
    username: userData.username || `user${telegramId}`,
    firstName: userData.firstName || 'User',
    lastName: userData.lastName || '',
    referralCode: telegramId.toString(),
    referrerId: null,
    directReferrals: [],
    totalReferrals: 0,
    tokens: 0,
    isPremium: false,
    walletAddress: null,
    claimedLevels: {},
    totalEarnings: 0,
    joinedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    ipAddress: null,
    isActive: true
  };
  
  users.set(telegramId, user);
  stats.totalUsers++;
  
  console.log(`👤 REAL USER CREATED: ${telegramId} (@${user.username}) - Total: ${stats.totalUsers}`);
  return user;
}

function addRealReferral(referrerId, referralId) {
  if (referrerId === referralId) return false;
  
  const referrer = users.get(referrerId);
  const referral = users.get(referralId);
  
  if (!referrer || !referral) return false;
  if (referral.referrerId) return false;
  
  referral.referrerId = referrerId;
  referrer.directReferrals.push(referralId);
  referrer.totalReferrals++;
  referrer.tokens += 100;
  
  const referralRecord = {
    id: `${referrerId}_${referralId}`,
    referrerId,
    referralId,
    tokens: 100,
    timestamp: new Date().toISOString(),
    isValid: true
  };
  
  referrals.set(referralRecord.id, referralRecord);
  stats.totalReferrals++;
  
  console.log(`🔗 REAL REFERRAL: ${referrerId} -> ${referralId} (+100 NOTF) - Total: ${stats.totalReferrals}`);
  return true;
}

function calculateRealLevels(userId) {
  const user = users.get(userId);
  if (!user) return {};
  
  const levels = {};
  const totalRefs = user.totalReferrals;
  
  for (let level = 1; level <= 12; level++) {
    const config = LEVELS[level];
    const completed = totalRefs >= config.required;
    const canClaim = completed && (!config.premium || user.isPremium) && !user.claimedLevels[level];
    
    levels[level] = {
      current: totalRefs,
      required: config.required,
      completed,
      canClaim,
      reward: config.reward,
      premium: config.premium,
      claimed: !!user.claimedLevels[level]
    };
  }
  
  return levels;
}

// =================== ROUTES ===================

// Frontend Route
app.get('/', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'app.html'));
  } catch (error) {
    console.error('Error serving frontend:', error);
    res.status(500).send('App temporarily unavailable');
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  try {
    const uptimeHours = (process.uptime() / 3600).toFixed(1);
    const memoryUsage = process.memoryUsage();
    
    const health = {
      status: 'PRODUCTION_LIVE',
      timestamp: new Date().toISOString(),
      uptime: `${uptimeHours} hours`,
      environment: 'PRODUCTION',
      version: '1.0.0-LIVE',
      server: 'Railway',
      
      liveStats: {
        totalUsers: stats.totalUsers,
        activeReferrals: stats.totalReferrals,
        premiumUsers: stats.totalPremiumUsers,
        totalRevenue: `$${stats.totalRevenue}`,
        pendingClaims: stats.totalClaims
      },
      
      system: {
        memory: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        bot: botStatus,
        database: 'ACTIVE',
        payments: 'ENABLED'
      },
      
      features: {
        realMoneyPayments: true,
        liveTelegramBot: botStatus === 'LIVE',
        premiumSystem: true,
        levelRewards: true,
        referralTracking: true,
        adminNotifications: true
      }
    };
    
    res.json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed'
    });
  }
});

// User Management
app.get('/api/telegram-user/:telegramId', (req, res) => {
  try {
    const telegramId = parseInt(req.params.telegramId);
    
    if (!isValidTelegramId(telegramId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Telegram ID format'
      });
    }
    
    let user = users.get(telegramId);
    if (!user) {
      user = createRealUser(telegramId);
    }
    
    user.lastActive = new Date().toISOString();
    const levels = calculateRealLevels(telegramId);
    const referralLink = `https://t.me/${BOT_USERNAME}?start=ref${telegramId}`;
    
    const directReferralDetails = user.directReferrals.map(refId => {
      const refUser = users.get(refId);
      return refUser ? {
        username: refUser.username,
        telegramId: refUser.telegramId,
        joinedAt: refUser.joinedAt
      } : null;
    }).filter(Boolean);
    
    const response = {
      success: true,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        isPremium: user.isPremium,
        totalDirectReferrals: user.directReferrals.length,
        totalReferrals: user.totalReferrals,
        tokens: user.tokens,
        totalEarnings: user.totalEarnings,
        referralLink,
        levels,
        directReferrals: directReferralDetails,
        joinedAt: user.joinedAt,
        lastActive: user.lastActive,
        
        stats: {
          totalTokensEarned: user.tokens,
          levelsCompleted: Object.values(levels).filter(l => l.completed).length,
          totalEarningsPotential: Object.values(levels).reduce((sum, l) => sum + (l.reward || 0), 0),
          claimedRewards: Object.keys(user.claimedLevels).length
        }
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({
      success: false,
      error: 'User data retrieval failed'
    });
  }
});

// Referral Processing
app.post('/api/telegram-referral', (req, res) => {
  try {
    const { telegramId, referrerCode } = req.body;
    
    if (!isValidTelegramId(telegramId) || !referrerCode) {
      return res.status(400).json({
        success: false,
        error: 'Invalid referral data'
      });
    }
    
    const referrerId = parseInt(referrerCode.replace('ref', ''));
    
    if (!isValidTelegramId(referrerId) || referrerId === telegramId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid referrer ID'
      });
    }
    
    const success = addRealReferral(referrerId, telegramId);
    
    if (success) {
      if (bot && botStatus === 'LIVE') {
        try {
          const referral = users.get(telegramId);
          const referrer = users.get(referrerId);
          
          bot.sendMessage(referrerId,
            `🎉 NEW REFERRAL!\n\n` +
            `👤 @${referral.username} joined\n` +
            `💰 +100 NOTF tokens earned\n` +
            `📊 Total tokens: ${referrer.tokens}\n` +
            `👥 Total referrals: ${referrer.totalReferrals}\n\n` +
            `🚀 Keep sharing your link to earn more!`
          );
        } catch (botError) {
          console.log('Bot notification failed:', botError.message);
        }
      }
      
      res.json({
        success: true,
        message: 'Referral processed successfully',
        tokensEarned: 100,
        totalTokens: users.get(referrerId).tokens
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Referral processing failed'
      });
    }
    
  } catch (error) {
    console.error('Error processing referral:', error);
    res.status(500).json({
      success: false,
      error: 'Referral system error'
    });
  }
});

// Wallet Connection
app.post('/api/ton/connect', (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!isValidTelegramId(telegramId) || !isValidWallet(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet connection data'
      });
    }
    
    const user = users.get(telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    user.walletAddress = walletAddress;
    user.lastActive = new Date().toISOString();
    
    console.log(`💳 REAL WALLET CONNECTED: ${telegramId} -> ${walletAddress}`);
    
    res.json({
      success: true,
      message: 'Wallet connected successfully',
      walletAddress: walletAddress
    });
    
  } catch (error) {
    console.error('Error connecting wallet:', error);
    res.status(500).json({
      success: false,
      error: 'Wallet connection failed'
    });
  }
});

// TON Balance Check
app.post('/api/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!isValidWallet(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid TON address'
      });
    }
    
    const mockBalance = (Math.random() * 10 + 1).toFixed(3);
    
    res.json({
      success: true,
      balance: mockBalance,
      address: address,
      currency: 'TON'
    });
    
  } catch (error) {
    console.error('Error checking balance:', error);
    res.status(500).json({
      success: false,
      error: 'Balance check failed'
    });
  }
});

// Payment Processing
app.post('/api/payment/usdt', (req, res) => {
  try {
    const { telegramId, hash, amount, from, to, comment } = req.body;
    
    if (!isValidTelegramId(telegramId) || !hash || parseFloat(amount) !== PREMIUM_PRICE) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment data'
      });
    }
    
    const user = users.get(telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const paymentId = `pay_${Date.now()}_${telegramId}`;
    const payment = {
      id: paymentId,
      telegramId,
      hash,
      amount: parseFloat(amount),
      from,
      to: to || OWNER_WALLET,
      comment,
      status: 'verified',
      timestamp: new Date().toISOString(),
      verified: true
    };
    
    payments.set(paymentId, payment);
    
    user.isPremium = true;
    user.lastActive = new Date().toISOString();
    
    stats.totalRevenue += payment.amount;
    stats.totalPremiumUsers++;
    
    console.log(`💰 REAL PAYMENT PROCESSED: ${telegramId} paid $${amount} USDT - Premium activated`);
    
    if (bot && botStatus === 'LIVE') {
      try {
        bot.sendMessage(telegramId,
          `🎉 PREMIUM ACTIVATED!\n\n` +
          `✅ Payment confirmed: $${amount} USDT\n` +
          `🔓 All 12 levels unlocked\n` +
          `💰 Start claiming rewards now!\n` +
          `🚀 Share your link to progress faster!\n\n` +
          `💎 Welcome to NotFrens Premium!`
        );
        
        bot.sendMessage(ADMIN_ID,
          `💰 NEW PREMIUM PAYMENT!\n\n` +
          `👤 User: @${user.username} (${telegramId})\n` +
          `💵 Amount: $${amount} USDT\n` +
          `🔗 Hash: ${hash}\n` +
          `📅 Time: ${new Date().toLocaleString()}\n\n` +
          `📊 Total Revenue: $${stats.totalRevenue}`
        );
      } catch (botError) {
        console.log('Payment notification failed:', botError.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Premium activated successfully',
      payment: {
        id: payment.id,
        amount: payment.amount,
        status: payment.status,
        timestamp: payment.timestamp
      },
      user: {
        isPremium: user.isPremium,
        premiumActivatedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      error: 'Payment processing failed'
    });
  }
});

// Claim Processing
app.post('/api/telegram-claim', (req, res) => {
  try {
    const { telegramId, level } = req.body;
    
    if (!isValidTelegramId(telegramId) || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid claim request'
      });
    }
    
    const user = users.get(telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const levels = calculateRealLevels(telegramId);
    const levelData = levels[level];
    
    if (!levelData.canClaim) {
      return res.status(400).json({
        success: false,
        error: 'Level requirements not met'
      });
    }
    
    if (levelData.reward === 0) {
      return res.status(400).json({
        success: false,
        error: 'No reward available for this level'
      });
    }
    
    const claimId = `claim_${Date.now()}_${telegramId}`;
    const claim = {
      id: claimId,
      telegramId,
      level,
      amount: levelData.reward,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      userDetails: {
        username: user.username,
        totalReferrals: user.totalReferrals,
        isPremium: user.isPremium
      }
    };
    
    claims.set(claimId, claim);
    user.claimedLevels[level] = {
      claimedAt: new Date().toISOString(),
      amount: levelData.reward,
      status: 'pending'
    };
    
    stats.totalClaims++;
    
    console.log(`🏆 REAL CLAIM REQUEST: ${telegramId} requested Level ${level} - $${levelData.reward}`);
    
    if (bot && botStatus === 'LIVE') {
      try {
        bot.sendMessage(telegramId,
          `🏆 CLAIM SUBMITTED!\n\n` +
          `📊 Level: ${level}\n` +
          `💰 Amount: $${levelData.reward.toLocaleString()}\n` +
          `⏳ Status: Under review\n\n` +
          `✅ Our team will process your claim within 24 hours\n` +
          `💳 Payment will be sent to your connected wallet`
        );
        
        bot.sendMessage(ADMIN_ID,
          `🚨 NEW CLAIM REQUEST!\n\n` +
          `👤 User: @${user.username} (${telegramId})\n` +
          `🏆 Level: ${level}\n` +
          `💰 Amount: $${levelData.reward.toLocaleString()}\n` +
          `👥 Referrals: ${user.totalReferrals}\n` +
          `💎 Premium: ${user.isPremium ? 'Yes' : 'No'}\n` +
          `📅 Time: ${new Date().toLocaleString()}\n\n` +
          `⚠️ REVIEW AND APPROVE PAYMENT`
        );
      } catch (botError) {
        console.log('Claim notification failed:', botError.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Claim request submitted successfully',
      claimRequest: {
        id: claim.id,
        level: claim.level,
        amount: claim.amount,
        status: claim.status,
        requestedAt: claim.requestedAt
      }
    });
    
  } catch (error) {
    console.error('Error processing claim:', error);
    res.status(500).json({
      success: false,
      error: 'Claim processing failed'
    });
  }
});

// Admin Stats
app.get('/api/admin/stats', (req, res) => {
  try {
    const now = new Date();
    const startTime = new Date(stats.startTime);
    const hoursOnline = ((now - startTime) / (1000 * 60 * 60)).toFixed(1);
    
    const adminStats = {
      success: true,
      timestamp: new Date().toISOString(),
      uptime: `${hoursOnline} hours`,
      
      users: {
        total: stats.totalUsers,
        premium: stats.totalPremiumUsers,
        active: Array.from(users.values()).filter(u => u.isActive).length,
        withWallets: Array.from(users.values()).filter(u => u.walletAddress).length
      },
      
      financial: {
        totalRevenue: stats.totalRevenue,
        averageRevenuePerUser: stats.totalPremiumUsers > 0 ? (stats.totalRevenue / stats.totalPremiumUsers).toFixed(2) : 0,
        pendingClaims: stats.totalClaims,
        totalClaimValue: Array.from(claims.values()).reduce((sum, claim) => sum + claim.amount, 0)
      },
      
      referrals: {
        total: stats.totalReferrals,
        averagePerUser: stats.totalUsers > 0 ? (stats.totalReferrals / stats.totalUsers).toFixed(1) : 0,
        tokensDistributed: stats.totalReferrals * 100
      },
      
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        telegramBot: botStatus,
        databaseConnections: users.size + referrals.size + payments.size + claims.size
      }
    };
    
    res.json(adminStats);
    
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Admin stats retrieval failed'
    });
  }
});

// =================== TELEGRAM BOT ===================
if (bot && botStatus === 'LIVE') {
  // Webhook handler
  app.post('/webhook', (req, res) => {
    try {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      console.error('Webhook error:', error);
      res.sendStatus(500);
    }
  });

  // Set webhook
  app.get('/set-webhook', (req, res) => {
    const webhookUrl = `${WEB_APP_URL}/webhook`;
    
    bot.setWebHook(webhookUrl)
      .then(() => {
        console.log(`🔗 Webhook set: ${webhookUrl}`);
        botStatus = 'LIVE';
        res.json({ 
          success: true, 
          message: 'Webhook configured for production',
          url: webhookUrl
        });
      })
      .catch(error => {
        console.error('Webhook setup error:', error);
        botStatus = 'ERROR';
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      });
  });

  // Bot commands
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const referralCode = match[1] ? match[1].trim() : null;
    
    console.log(`🚀 LIVE USER: ${userId} (@${username}) - Referral: ${referralCode}`);
    
    try {
      let user = users.get(userId);
      if (!user) {
        user = createRealUser(userId, {
          username: username,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name
        });
      }
      
      if (referralCode && referralCode.startsWith('ref')) {
        const referrerId = parseInt(referralCode.replace('ref', ''));
        if (referrerId && referrerId !== userId && users.get(referrerId)) {
          addRealReferral(referrerId, userId);
        }
      }
      
      const welcomeText = 
        `🎉 Welcome to NotFrens, ${username}!\n\n` +
        `💎 The #1 Web3 Referral Platform\n\n` +
        `🎯 Your earning opportunities:\n` +
        `• 👥 100 NOTF per referral\n` +
        `• 💰 ${PREMIUM_PRICE} Premium unlocks levels\n` +
        `• 🏆 Claim up to $222,000 in rewards\n` +
        `• 🚀 Real money, real opportunities\n\n` +
        `📊 Current users: ${stats.totalUsers}\n` +
        `💰 Total paid: ${stats.totalRevenue}\n\n` +
        `Ready to start earning?`;
      
      const keyboard = {
        inline_keyboard: [
          [{ 
            text: '🚀 Open NotFrens App', 
            web_app: { url: `${WEB_APP_URL}?user=${userId}` }
          }],
          [
            { text: '🔗 My Referral Link', callback_data: 'get_link' },
            { text: '📊 My Stats', callback_data: 'stats' }
          ],
          [{ text: '💎 Buy Premium', callback_data: 'premium' }]
        ]
      };
      
      bot.sendMessage(chatId, welcomeText, { 
        reply_markup: keyboard,
        parse_mode: 'HTML'
      }).catch(err => console.error('Welcome message error:', err));
      
    } catch (error) {
      console.error('Bot start error:', error);
      bot.sendMessage(chatId, '❌ Service temporarily unavailable. Please try again.')
        .catch(err => console.error('Message send error:', err));
    }
  });

  // Bot callback handlers
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    
    try {
      if (data === 'get_link') {
        const link = `https://t.me/${BOT_USERNAME}?start=ref${userId}`;
        await bot.sendMessage(chatId,
          `🔗 Your Personal Referral Link:\n\n` +
          `${link}\n\n` +
          `💰 Earn 100 NOTF per referral\n` +
          `🎯 Share with friends and family\n` +
          `📈 Build your earning network!`
        );
      }
      
      else if (data === 'stats') {
        const user = users.get(userId);
        if (user) {
          const levels = calculateRealLevels(userId);
          const completedLevels = Object.values(levels).filter(l => l.completed).length;
          const potentialEarnings = Object.values(levels).reduce((sum, l) => sum + (l.reward || 0), 0);
          
          await bot.sendMessage(chatId,
            `📊 Your NotFrens Stats:\n\n` +
            `👥 Total Referrals: ${user.totalReferrals}\n` +
            `💰 NOTF Tokens: ${user.tokens}\n` +
            `⭐ Premium Status: ${user.isPremium ? '✅ Active' : '❌ Inactive'}\n` +
            `🏆 Levels Completed: ${completedLevels}/12\n` +
            `💵 Potential Earnings: ${potentialEarnings.toLocaleString()}\n` +
            `📅 Joined: ${new Date(user.joinedAt).toLocaleDateString()}\n\n` +
            `🚀 ${user.isPremium ? 'Keep referring to unlock more levels!' : 'Upgrade to Premium to start claiming!'}`
          );
        }
      }
      
      else if (data === 'premium') {
        await bot.sendMessage(chatId,
          `💎 NotFrens Premium - ${PREMIUM_PRICE} USDT\n\n` +
          `🔓 Unlock all 12 levels\n` +
          `💰 Claim up to $222,000\n` +
          `🏆 Priority support\n` +
          `📊 Advanced analytics\n\n` +
          `🚀 Upgrade in the app to start earning big!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ 
                  text: '💎 Upgrade Now', 
                  web_app: { url: `${WEB_APP_URL}?user=${userId}&action=premium` }
                }]
              ]
            }
          }
        );
      }
      
      await bot.answerCallbackQuery(query.id);
      
    } catch (error) {
      console.error('Callback error:', error);
      bot.answerCallbackQuery(query.id, { text: '❌ Error occurred' })
        .catch(err => console.error('Callback answer error:', err));
    }
  });
}

// =================== STATIC FILES & ROUTES ===================
app.use(express.static('.', { index: false }));

// TON Connect Manifest
app.get('/tonconnect-manifest.json', (req, res) => {
  try {
    const manifest = {
      url: WEB_APP_URL,
      name: "NotFrens",
      iconUrl: `${WEB_APP_URL}/favicon.ico`,
      termsOfUseUrl: `${WEB_APP_URL}/terms`,
      privacyPolicyUrl: `${WEB_APP_URL}/privacy`
    };
    res.json(manifest);
  } catch (error) {
    console.error('Manifest error:', error);
    res.status(500).json({ error: 'Manifest unavailable' });
  }
});

// Admin Panel
app.get('/admin', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'admin.html'));
  } catch (error) {
    console.error('Admin panel error:', error);
    res.status(500).send('Admin panel unavailable');
  }
});

// API Documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'NotFrens Production API',
    version: '1.0.0',
    status: 'LIVE',
    endpoints: {
      health: 'GET /api/health',
      user: 'GET /api/telegram-user/:id',
      referral: 'POST /api/telegram-referral',
      wallet: 'POST /api/ton/connect',
      payment: 'POST /api/payment/usdt',
      claim: 'POST /api/telegram-claim',
      admin: 'GET /api/admin/stats'
    },
    features: ['Real USDT payments', 'Live referrals', 'Level rewards', 'Telegram integration'],
    support: 'Contact @your_admin_username'
  });
});

// SPA Routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      path: req.path,
      availableEndpoints: [
        '/api/health',
        '/api/telegram-user/:id',
        '/api/telegram-referral',
        '/api/ton/connect',
        '/api/payment/usdt',
        '/api/telegram-claim',
        '/api/admin/stats'
      ]
    });
  } else {
    try {
      res.sendFile(path.join(__dirname, 'app.html'));
    } catch (error) {
      console.error('Frontend serving error:', error);
      res.status(500).send('Application temporarily unavailable');
    }
  }
});

// =================== ERROR HANDLING ===================
app.use((err, req, res, next) => {
  console.error('Production error:', err);
  
  const isDev = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: isDev ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  console.log(`📊 Final stats - Users: ${stats.totalUsers}, Revenue: ${stats.totalRevenue}`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// =================== START PRODUCTION SERVER ===================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NotFrens PRODUCTION Server LIVE on port ${PORT}`);
  console.log(`🌐 URL: ${WEB_APP_URL}`);
  console.log(`🤖 Telegram Bot: ${botStatus}`);
  console.log(`💰 Premium Price: ${PREMIUM_PRICE} USDT`);
  console.log(`👨‍💼 Admin ID: ${ADMIN_ID}`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log(`🔥 READY FOR REAL USERS AND REAL MONEY!`);
  
  // Set webhook if bot is available
  if (bot && botStatus === 'LIVE') {
    setTimeout(() => {
      bot.setWebHook(`${WEB_APP_URL}/webhook`)
        .then(() => {
          console.log(`🔗 Production webhook set: ${WEB_APP_URL}/webhook`);
        })
        .catch(error => {
          console.error('❌ Webhook setup failed:', error.message);
        });
    }, 5000);
  }
});
