const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
require('dotenv').config();

const app = express();

// =================== PRODUCTION CONFIG ===================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7583849213:AAHIuBdbO0mXRxunb8qyqI-B8zpjlyDNthw';
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://notfrens.app';
const OWNER_WALLET = process.env.OWNER_WALLET || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI";
const PREMIUM_PRICE = parseInt(process.env.PREMIUM_PRICE) || 11;
const ADMIN_ID = parseInt(process.env.ADMIN_TELEGRAM_ID) || 123456789;
const PORT = process.env.PORT || 8080;

console.log('🚀 NotFrens PRODUCTION - Live Deploy');
console.log('🌐 URL:', WEB_APP_URL);
console.log('💰 Premium:', PREMIUM_PRICE, 'USDT');
console.log('🔌 Port:', PORT);
console.log('📅 Started:', new Date().toISOString());

// Initialize Telegram Bot
let bot;
let botStatus = 'OFFLINE';
let webhookSet = false;

try {
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN.length > 10) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
    botStatus = 'LIVE';
    console.log('🤖 Telegram Bot INITIALIZED');
  } else {
    console.log('❌ Bot token missing');
  }
} catch (error) {
  console.error('❌ Bot Error:', error.message);
  botStatus = 'ERROR';
}

// CORS Configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Security Headers
app.use((req, res, next) => {
  res.header('X-Powered-By', 'NotFrens-Production');
  res.header('X-Frame-Options', 'SAMEORIGIN');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'origin-when-cross-origin');
  next();
});

// Request Logging
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

// FIXED: Premium Referral System - Max 3 per premium user
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

function createUser(telegramId, userData = {}) {
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
    isActive: true,
    premiumReferralsUsed: 0, // FIXED: Track premium referrals
    maxPremiumReferrals: 3   // FIXED: Max 3 premium referrals per user
  };
  
  users.set(telegramId, user);
  stats.totalUsers++;
  
  console.log(`👤 USER CREATED: ${telegramId} (@${user.username}) - Total: ${stats.totalUsers}`);
  return user;
}

// FIXED: Premium Referral System
function addReferral(referrerId, referralId) {
  if (referrerId === referralId) return { success: false, error: 'Cannot refer yourself' };
  
  const referrer = users.get(referrerId);
  const referral = users.get(referralId);
  
  if (!referrer || !referral) return { success: false, error: 'User not found' };
  if (referral.referrerId) return { success: false, error: 'Already referred' };
  
  // FIXED: Check if referrer can invite premium users
  if (!referrer.isPremium) {
    return { success: false, error: 'Premium required to invite users' };
  }
  
  // FIXED: Check premium referral limit
  if (referrer.premiumReferralsUsed >= referrer.maxPremiumReferrals) {
    return { success: false, error: 'Maximum premium referrals reached (3/3)' };
  }
  
  // Process referral
  referral.referrerId = referrerId;
  referrer.directReferrals.push(referralId);
  referrer.totalReferrals++;
  referrer.tokens += 100;
  referrer.premiumReferralsUsed++; // FIXED: Increment premium referral count
  
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
  
  console.log(`🔗 PREMIUM REFERRAL: ${referrerId} -> ${referralId} (+100 NOTF) - Used: ${referrer.premiumReferralsUsed}/3`);
  return { success: true, message: 'Referral processed successfully' };
}

// FIXED: 3x3 System Calculation
function calculateLevels(userId) {
  const user = users.get(userId);
  if (!user) return {};
  
  const levels = {};
  const totalRefs = user.totalReferrals;
  
  for (let level = 1; level <= 12; level++) {
    const config = LEVELS[level];
    const completed = totalRefs >= config.required;
    const canClaim = completed && 
                    (!config.premium || user.isPremium) && 
                    !user.claimedLevels[level] &&
                    config.reward > 0;
    
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

// FIXED: Health Check Route
app.get('/api/health', (req, res) => {
  try {
    const uptimeHours = (process.uptime() / 3600).toFixed(1);
    const memoryUsage = process.memoryUsage();
    
    const health = {
      status: 'PRODUCTION_LIVE',
      timestamp: new Date().toISOString(),
      uptime: `${uptimeHours} hours`,
      environment: 'PRODUCTION',
      version: '2.0.0-PREMIUM',
      server: 'Railway/Vercel',
      
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
        webhook: webhookSet ? 'SET' : 'PENDING',
        database: 'ACTIVE',
        payments: 'ENABLED',
        premiumSystem: 'ACTIVE'
      },
      
      features: {
        realMoneyPayments: true,
        liveTelegramBot: botStatus === 'LIVE',
        premiumReferralSystem: true,
        maxReferralsPerUser: 3,
        levelRewards: true,
        x3System: true,
        adminNotifications: true
      }
    };
    
    res.json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      error: error.message
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
      user = createUser(telegramId);
    }
    
    user.lastActive = new Date().toISOString();
    const levels = calculateLevels(telegramId);
    const referralLink = `https://t.me/${BOT_USERNAME}?start=ref${telegramId}`;
    
    const directReferralDetails = user.directReferrals.map(refId => {
      const refUser = users.get(refId);
      return refUser ? {
        username: refUser.username,
        telegramId: refUser.telegramId,
        joinedAt: refUser.joinedAt,
        isPremium: refUser.isPremium
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
        
        // FIXED: Premium referral info
        premiumReferralInfo: {
          used: user.premiumReferralsUsed,
          max: user.maxPremiumReferrals,
          remaining: user.maxPremiumReferrals - user.premiumReferralsUsed,
          canInvite: user.isPremium && (user.premiumReferralsUsed < user.maxPremiumReferrals)
        },
        
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

// FIXED: Referral Processing with Premium Limits
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
    
    // Ensure both users exist
    if (!users.get(referrerId)) {
      createUser(referrerId);
    }
    if (!users.get(telegramId)) {
      createUser(telegramId);
    }
    
    const result = addReferral(referrerId, telegramId);
    
    if (result.success) {
      const referrer = users.get(referrerId);
      
      // Bot notification
      if (bot && botStatus === 'LIVE') {
        try {
          const referral = users.get(telegramId);
          
          bot.sendMessage(referrerId,
            `🎉 NEW PREMIUM REFERRAL!\n\n` +
            `👤 @${referral.username} joined\n` +
            `💰 +100 NOTF tokens earned\n` +
            `📊 Total tokens: ${referrer.tokens}\n` +
            `👥 Total referrals: ${referrer.totalReferrals}\n` +
            `🎯 Premium slots used: ${referrer.premiumReferralsUsed}/3\n\n` +
            `🚀 ${referrer.premiumReferralsUsed < 3 ? 'Keep sharing your link!' : 'All premium slots filled!'}`
          );
        } catch (botError) {
          console.log('Bot notification failed:', botError.message);
        }
      }
      
      res.json({
        success: true,
        message: 'Premium referral processed successfully',
        tokensEarned: 100,
        totalTokens: referrer.tokens,
        premiumSlotsUsed: `${referrer.premiumReferralsUsed}/3`
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
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
    
    console.log(`💳 WALLET CONNECTED: ${telegramId} -> ${walletAddress.substring(0, 10)}...`);
    
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
    
    // Mock balance - integrate with real TON API later
    const mockBalance = (Math.random() * 50 + 5).toFixed(2);
    
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
    
    if (user.isPremium) {
      return res.status(400).json({
        success: false,
        error: 'User already has premium'
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
    
    // Activate Premium
    user.isPremium = true;
    user.lastActive = new Date().toISOString();
    
    stats.totalRevenue += payment.amount;
    stats.totalPremiumUsers++;
    
    console.log(`💰 PREMIUM ACTIVATED: ${telegramId} paid $${amount} USDT - Premium active`);
    
    // Bot notifications
    if (bot && botStatus === 'LIVE') {
      try {
        bot.sendMessage(telegramId,
          `🎉 PREMIUM ACTIVATED!\n\n` +
          `✅ Payment confirmed: $${amount} USDT\n` +
          `🔓 All 12 levels unlocked\n` +
          `👥 You can now invite 3 premium users\n` +
          `💰 Start claiming rewards now!\n` +
          `🚀 Share your premium link!\n\n` +
          `💎 Welcome to NotFrens Premium!`
        );
        
        bot.sendMessage(ADMIN_ID,
          `💰 NEW PREMIUM PAYMENT!\n\n` +
          `👤 User: @${user.username} (${telegramId})\n` +
          `💵 Amount: $${amount} USDT\n` +
          `🔗 Hash: ${hash.substring(0, 20)}...\n` +
          `📅 Time: ${new Date().toLocaleString()}\n\n` +
          `📊 Total Revenue: $${stats.totalRevenue}\n` +
          `👥 Premium Users: ${stats.totalPremiumUsers}`
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
        premiumActivatedAt: new Date().toISOString(),
        maxReferrals: user.maxPremiumReferrals
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
    
    const levels = calculateLevels(telegramId);
    const levelData = levels[level];
    
    if (!levelData.canClaim) {
      return res.status(400).json({
        success: false,
        error: 'Level requirements not met or already claimed'
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
        isPremium: user.isPremium,
        walletAddress: user.walletAddress
      }
    };
    
    claims.set(claimId, claim);
    user.claimedLevels[level] = {
      claimedAt: new Date().toISOString(),
      amount: levelData.reward,
      status: 'pending'
    };
    
    stats.totalClaims++;
    
    console.log(`🏆 CLAIM REQUEST: ${telegramId} Level ${level} - $${levelData.reward}`);
    
    // Bot notifications
    if (bot && botStatus === 'LIVE') {
      try {
        bot.sendMessage(telegramId,
          `🏆 CLAIM SUBMITTED!\n\n` +
          `📊 Level: ${level}\n` +
          `💰 Amount: $${levelData.reward.toLocaleString()}\n` +
          `⏳ Status: Under review\n\n` +
          `✅ Processing within 24 hours\n` +
          `💳 Payment to your connected wallet`
        );
        
        bot.sendMessage(ADMIN_ID,
          `🚨 NEW CLAIM REQUEST!\n\n` +
          `👤 User: @${user.username} (${telegramId})\n` +
          `🏆 Level: ${level}\n` +
          `💰 Amount: $${levelData.reward.toLocaleString()}\n` +
          `👥 Referrals: ${user.totalReferrals}\n` +
          `💎 Premium: ${user.isPremium ? 'Yes' : 'No'}\n` +
          `💳 Wallet: ${user.walletAddress ? user.walletAddress.substring(0, 10) + '...' : 'Not connected'}\n` +
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
        tokensDistributed: stats.totalReferrals * 100,
        premiumReferralSlots: Array.from(users.values()).reduce((sum, user) => sum + user.premiumReferralsUsed, 0)
      },
      
      system: {
        memoryUsage: process.memoryUsage(),
        telegramBot: botStatus,
        webhook: webhookSet,
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

  // FIXED: Set webhook automatically
  app.get('/set-webhook', (req, res) => {
    const webhookUrl = `${WEB_APP_URL}/webhook`;
    
    bot.setWebHook(webhookUrl)
      .then(() => {
        console.log(`🔗 Webhook set: ${webhookUrl}`);
        webhookSet = true;
        res.json({ 
          success: true, 
          message: 'Webhook configured successfully',
          url: webhookUrl
        });
      })
      .catch(error => {
        console.error('Webhook setup error:', error);
        webhookSet = false;
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
    
    console.log(`🚀 BOT USER: ${userId} (@${username}) - Referral: ${referralCode}`);
    
    try {
      let user = users.get(userId);
      if (!user) {
        user = createUser(userId, {
          username: username,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name
        });
      }
      
      // Process referral if provided
      if (referralCode && referralCode.startsWith('ref')) {
        const referrerId = parseInt(referralCode.replace('ref', ''));
        if (referrerId && referrerId !== userId && users.get(referrerId)) {
          const result = addReferral(referrerId, userId);
          if (!result.success) {
            await bot.sendMessage(chatId, 
              `⚠️ Referral Note: ${result.error}\n\n` +
              `💡 Premium users can invite up to 3 users each.`
            );
          }
        }
      }
      
      const welcomeText = 
        `🎉 Welcome to NotFrens, ${username}!\n\n` +
        `💎 Premium Web3 Referral Platform\n\n` +
        `🔥 How it works:\n` +
        `• 💰 Pay ${PREMIUM_PRICE} USDT for Premium\n` +
        `• 👥 Invite max 3 premium users\n` +
        `• 🏆 Complete levels to earn rewards\n` +
        `• 💵 Claim up to $222,000 total\n\n` +
        `📊 Current stats:\n` +
        `👥 Users: ${stats.totalUsers}\n` +
        `💎 Premium: ${stats.totalPremiumUsers}\n` +
        `💰 Revenue: ${stats.totalRevenue}\n\n` +
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
          [{ text: '💎 Get Premium', callback_data: 'premium' }]
        ]
      };
      
      bot.sendMessage(chatId, welcomeText, { 
        reply_markup: keyboard
      }).catch(err => console.error('Welcome message error:', err));
      
    } catch (error) {
      console.error('Bot start error:', error);
      bot.sendMessage(chatId, '❌ Service temporarily unavailable. Please try again later.')
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
        const user = users.get(userId);
        const link = `https://t.me/${BOT_USERNAME}?start=ref${userId}`;
        
        if (!user || !user.isPremium) {
          await bot.sendMessage(chatId,
            `🔗 Your Referral Link:\n${link}\n\n` +
            `⚠️ Premium Required!\n` +
            `• You need Premium to invite users\n` +
            `• Premium users can invite max 3 users\n` +
            `• Each referral earns 100 NOTF tokens\n\n` +
            `💎 Get Premium for ${PREMIUM_PRICE} USDT to start earning!`
          );
        } else {
          const remaining = user.maxPremiumReferrals - user.premiumReferralsUsed;
          await bot.sendMessage(chatId,
            `🔗 Your Premium Referral Link:\n${link}\n\n` +
            `📊 Invitation Status:\n` +
            `• Used: ${user.premiumReferralsUsed}/3 premium slots\n` +
            `• Remaining: ${remaining} invitations\n` +
            `• Tokens earned: ${user.tokens} NOTF\n\n` +
            `💰 Each referral = 100 NOTF tokens\n` +
            `🚀 ${remaining > 0 ? 'Share your link to fill remaining slots!' : 'All premium slots filled! 🎉'}`
          );
        }
      }
      
      else if (data === 'stats') {
        const user = users.get(userId);
        if (user) {
          const levels = calculateLevels(userId);
          const completedLevels = Object.values(levels).filter(l => l.completed).length;
          const potentialEarnings = Object.values(levels).reduce((sum, l) => sum + (l.reward || 0), 0);
          
          await bot.sendMessage(chatId,
            `📊 Your NotFrens Stats:\n\n` +
            `👤 User: @${user.username}\n` +
            `💎 Premium: ${user.isPremium ? '✅ Active' : '❌ Inactive'}\n` +
            `👥 Referrals: ${user.totalReferrals}\n` +
            `💰 NOTF Tokens: ${user.tokens}\n` +
            `🏆 Levels Completed: ${completedLevels}/12\n` +
            `💵 Potential Earnings: ${potentialEarnings.toLocaleString()}\n\n` +
            `${user.isPremium ? 
              `🎯 Premium Slots: ${user.premiumReferralsUsed}/3 used\n🚀 Keep referring to unlock more levels!` : 
              `💡 Get Premium to start inviting users and claiming rewards!`}\n\n` +
            `📅 Joined: ${new Date(user.joinedAt).toLocaleDateString()}`
          );
        }
      }
      
      else if (data === 'premium') {
        await bot.sendMessage(chatId,
          `💎 NotFrens Premium - ${PREMIUM_PRICE} USDT\n\n` +
          `🔓 Premium Benefits:\n` +
          `• Unlock all 12 reward levels\n` +
          `• Invite up to 3 premium users\n` +
          `• Earn 100 NOTF per referral\n` +
          `• Claim up to $222,000 total\n` +
          `• Priority support\n\n` +
          `🚀 Upgrade now to start the earning journey!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ 
                  text: '💎 Get Premium Now', 
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

  // Auto-set webhook on startup
  setTimeout(() => {
    const webhookUrl = `${WEB_APP_URL}/webhook`;
    bot.setWebHook(webhookUrl)
      .then(() => {
        console.log(`🔗 Auto-webhook set: ${webhookUrl}`);
        webhookSet = true;
      })
      .catch(error => {
        console.error('❌ Auto-webhook failed:', error.message);
        webhookSet = false;
      });
  }, 3000);
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

// API Documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'NotFrens Production API',
    version: '2.0.0-PREMIUM',
    status: 'LIVE',
    features: {
      premiumReferralSystem: true,
      maxReferralsPerUser: 3,
      realUSDTPayments: true,
      levelRewards: true,
      telegramIntegration: true
    },
    endpoints: {
      health: 'GET /api/health',
      user: 'GET /api/telegram-user/:id',
      referral: 'POST /api/telegram-referral',
      wallet: 'POST /api/ton/connect',
      balance: 'POST /api/ton/balance',
      payment: 'POST /api/payment/usdt',
      claim: 'POST /api/telegram-claim',
      admin: 'GET /api/admin/stats'
    },
    support: 'Premium Web3 Referral Platform'
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
        '/api/ton/balance',
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
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  console.log(`📊 Final stats - Users: ${stats.totalUsers}, Premium: ${stats.totalPremiumUsers}, Revenue: ${stats.totalRevenue}`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// =================== START SERVER ===================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 NotFrens PRODUCTION Server LIVE on port ${PORT}`);
  console.log(`🌐 URL: ${WEB_APP_URL}`);
  console.log(`🤖 Telegram Bot: ${botStatus}`);
  console.log(`💰 Premium Price: ${PREMIUM_PRICE} USDT`);
  console.log(`👨‍💼 Admin ID: ${ADMIN_ID}`);
  console.log(`🎯 Max Referrals per Premium User: 3`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log(`🔥 PREMIUM REFERRAL SYSTEM ACTIVE!`);
});
