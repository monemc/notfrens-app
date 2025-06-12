const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
require('dotenv').config();

const app = express();

// Environment Variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7583849213:AAHIuBdbO0mXRxunb8qyqI-B8zpjlyDNthw';
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://notfrens-app-production.up.railway.app';
const TON_API_KEY = process.env.TON_API_KEY || 'a449ebf3378f11572f17d64e4ec01f059d6f8f77ee3dafc0f69bc73284384b0f';
const ADMIN_TELEGRAM_ID = parseInt(process.env.ADMIN_TELEGRAM_ID) || 123456789;

// Initialize Telegram Bot
let bot;
try {
  if (TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
    console.log('🤖 Telegram Bot initialized');
  }
} catch (error) {
  console.error('❌ Bot init failed:', error.message);
}

// CORS ni to'g'rilash
app.use(cors({
  origin: ['https://notfrens-app-production.up.railway.app', 'https://notfrens.app', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// OPTIONS requestlarni handle qilish
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers qo'shish
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  
  // OPTIONS request uchun
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Serve static files
app.use(express.static('.', { index: false }));

// Storage (in-memory for demo)
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// Initialize demo data
if (users.length === 0) {
  const sampleUsers = [
    {
      id: 1,
      telegramId: 123456789,
      username: 'DemoUser',
      firstName: 'Demo',
      lastName: 'User',
      referralCode: '123456789',
      referrerTelegramId: null,
      referrerCode: null,
      claimedLevels: {},
      walletAddress: null,
      isPremium: false,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    },
    {
      id: 2,
      telegramId: 987654321,
      username: 'Friend1',
      firstName: 'Friend',
      lastName: 'One',
      referralCode: '987654321',
      referrerTelegramId: 123456789,
      referrerCode: '123456789',
      claimedLevels: {},
      walletAddress: null,
      isPremium: false,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    }
  ];
  
  users.push(...sampleUsers);
  
  allReferrals.push({
    referrerId: 123456789,
    referralId: 987654321,
    position: 1,
    isStructural: true,
    timestamp: new Date().toISOString()
  });
  
  console.log(`✅ Demo data created: ${users.length} users`);
}

// Level configuration
const LEVEL_CONFIG = {
  1: { required: 1, reward: 0, premiumRequired: false },
  2: { required: 3, reward: 0, premiumRequired: false },
  3: { required: 9, reward: 30, premiumRequired: true },
  4: { required: 27, reward: 0, premiumRequired: true },
  5: { required: 81, reward: 300, premiumRequired: true },
  6: { required: 243, reward: 0, premiumRequired: true },
  7: { required: 729, reward: 1800, premiumRequired: true },
  8: { required: 2187, reward: 0, premiumRequired: true },
  9: { required: 6561, reward: 20000, premiumRequired: true },
  10: { required: 19683, reward: 0, premiumRequired: true },
  11: { required: 59049, reward: 0, premiumRequired: true },
  12: { required: 177147, reward: 222000, premiumRequired: true }
};

// Utility functions
function validateTelegramUserId(userId) {
  return userId && Number.isInteger(userId) && userId > 0;
}

function validateTonAddress(address) {
  return address && 
         (address.startsWith('EQ') || address.startsWith('UQ')) && 
         address.length >= 48;
}

function calculateTotalReferrals(userTelegramId, targetLevel) {
  let totalCount = 0;
  
  function countReferralsAtLevel(telegramId, currentLevel, maxLevel) {
    if (currentLevel > maxLevel) return 0;
    
    const directRefs = allReferrals
      .filter(r => r.referrerId === telegramId && r.isStructural)
      .map(r => users.find(u => u.telegramId === r.referralId))
      .filter(u => u);
    
    totalCount += directRefs.length;
    
    if (currentLevel < maxLevel) {
      directRefs.forEach(ref => {
        countReferralsAtLevel(ref.telegramId, currentLevel + 1, maxLevel);
      });
    }
  }
  
  countReferralsAtLevel(userTelegramId, 1, targetLevel);
  return totalCount;
}

function calculateAllLevels(userTelegramId) {
  const levels = {};
  const user = users.find(u => u.telegramId === userTelegramId);
  const isPremium = user ? user.isPremium : false;
  
  for (let level = 1; level <= 12; level++) {
    const required = LEVEL_CONFIG[level].required;
    const totalReferrals = calculateTotalReferrals(userTelegramId, level);
    const levelCompleted = totalReferrals >= required;
    
    const canProgress = !LEVEL_CONFIG[level].premiumRequired || isPremium;
    
    levels[level] = {
      current: totalReferrals,
      required: required,
      completed: levelCompleted && canProgress,
      reward: LEVEL_CONFIG[level].reward,
      hasReward: LEVEL_CONFIG[level].reward > 0,
      premiumRequired: LEVEL_CONFIG[level].premiumRequired,
      canProgress: canProgress
    };
  }
  
  return levels;
}

// ========================= ROUTES =========================

// Root health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'NotFrens API is running',
    timestamp: new Date().toISOString()
  });
});

// Main app route
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// Admin panel route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// TON Connect manifest
app.get('/tonconnect-manifest.json', (req, res) => {
  const manifest = {
    url: WEB_APP_URL,
    name: "NotFrens",
    iconUrl: `${WEB_APP_URL}/icon-192x192.png`,
    termsOfUseUrl: `${WEB_APP_URL}/terms`,
    privacyPolicyUrl: `${WEB_APP_URL}/privacy`
  };
  res.json(manifest);
});

// ========================= API ROUTES =========================

// Health check - MUHIM: Bu route birinchi bo'lishi kerak
app.get('/api/health', (req, res) => {
  try {
    res.status(200).json({
      status: 'online',
      timestamp: new Date().toISOString(),
      users: users.length,
      claims: claimRequests.length,
      payments: usdtPayments.length,
      version: '3.1.0',
      bot: bot ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      features: {
        tonWallet: true,
        usdtPayments: true,
        referralSystem: true,
        premiumLevels: true,
        telegramBot: !!bot
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Catch-all route uchun oldin barcha API routelarni yozish kerak

// Get user data
app.get('/api/telegram-user/:telegramId', (req, res) => {
  try {
    const telegramId = parseInt(req.params.telegramId);
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Telegram ID' 
      });
    }
    
    let user = users.find(u => u.telegramId === telegramId);
    
    if (!user) {
      // Create new user
      user = {
        id: users.length + 1,
        telegramId: telegramId,
        username: `User${telegramId}`,
        firstName: 'New',
        lastName: 'User',
        referralCode: telegramId.toString(),
        referrerTelegramId: null,
        referrerCode: null,
        claimedLevels: {},
        walletAddress: null,
        isPremium: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      users.push(user);
      console.log(`👤 New user created via API: ${telegramId}`);
    }
    
    // Update last active
    user.lastActive = new Date().toISOString();
    
    // Calculate referrals and levels
    const directReferrals = allReferrals
      .filter(r => r.referrerId === telegramId)
      .map(r => users.find(u => u.telegramId === r.referralId))
      .filter(u => u)
      .map(u => ({
        username: u.username,
        telegramId: u.telegramId,
        firstName: u.firstName
      }));
    
    const levels = calculateAllLevels(telegramId);
    const totalDirectReferrals = directReferrals.length;
    
    const userResponse = {
      ...user,
      totalDirectReferrals,
      directReferrals,
      levels,
      referralLink: `https://t.me/${BOT_USERNAME}?start=ref${telegramId}`,
      stats: {
        totalTokensEarned: totalDirectReferrals * 100,
        levelsCompleted: Object.values(levels).filter(l => l.completed).length,
        totalEarningsPotential: Object.values(levels).reduce((sum, l) => sum + (l.reward || 0), 0)
      }
    };
    
    res.json({
      success: true,
      user: userResponse
    });
    
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// TON wallet connection
app.post('/api/ton/connect', (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !validateTonAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters'
      });
    }
    
    // Update user wallet
    const user = users.find(u => u.telegramId === telegramId);
    if (user) {
      user.walletAddress = walletAddress;
      user.lastActive = new Date().toISOString();
    }
    
    // Store wallet connection
    const existingConnection = walletConnections.find(c => 
      c.telegramId === telegramId || c.walletAddress === walletAddress
    );
    
    if (!existingConnection) {
      walletConnections.push({
        telegramId,
        walletAddress,
        connectedAt: new Date().toISOString(),
        status: 'active'
      });
    }
    
    console.log(`💳 Wallet connected: ${telegramId} -> ${walletAddress}`);
    
    res.json({
      success: true,
      message: 'Wallet connected successfully'
    });
    
  } catch (error) {
    console.error('Error connecting wallet:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// TON balance check
app.post('/api/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!validateTonAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid TON address'
      });
    }
    
    // Mock balance for demo
    const mockBalance = (Math.random() * 10).toFixed(3);
    
    res.json({
      success: true,
      balance: mockBalance,
      address: address
    });
    
  } catch (error) {
    console.error('Error checking balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check balance'
    });
  }
});

// USDT payment notification
app.post('/api/payment/usdt', (req, res) => {
  try {
    const { telegramId, type, hash, from, to, amount, comment, usdtEquivalent } = req.body;
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Telegram ID'
      });
    }
    
    const payment = {
      id: usdtPayments.length + 1,
      telegramId,
      type: type || 'usdt_direct',
      hash,
      from,
      to,
      amount: parseFloat(amount),
      comment,
      usdtEquivalent: parseFloat(usdtEquivalent),
      timestamp: new Date().toISOString(),
      status: 'pending',
      verifiedAt: null
    };
    
    usdtPayments.push(payment);
    
    // Auto-verify premium payment
    const USDT_CONFIG = {
      ownerUsdtAddress: process.env.USDT_RECEIVING_ADDRESS || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI",
      premiumPrice: parseInt(process.env.PREMIUM_PRICE_USDT) || 11
    };
    
    if (parseFloat(usdtEquivalent) === USDT_CONFIG.premiumPrice && to === USDT_CONFIG.ownerUsdtAddress) {
      payment.status = 'verified';
      payment.verifiedAt = new Date().toISOString();
      
      // Activate premium for user
      const user = users.find(u => u.telegramId === telegramId);
      if (user) {
        user.isPremium = true;
        
        // Add to premium users list
        premiumUsers.push({
          telegramId,
          activatedAt: new Date().toISOString(),
          paymentId: payment.id,
          active: true
        });
        
        console.log(`⭐ Premium activated for user ${telegramId}`);
      }
    }
    
    console.log(`💰 USDT Payment: ${telegramId}, $${usdtEquivalent}, Status: ${payment.status}`);
    
    res.json({
      success: true,
      payment,
      message: payment.status === 'verified' ? 'Premium activated!' : 'Payment received, verification pending'
    });
    
  } catch (error) {
    console.error('Error processing USDT payment:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Claim reward
app.post('/api/telegram-claim', (req, res) => {
  try {
    const { telegramId, level } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check premium requirement
    const levelConfig = LEVEL_CONFIG[level];
    if (levelConfig.premiumRequired && !user.isPremium) {
      return res.status(403).json({
        success: false,
        error: 'Premium required for this level'
      });
    }
    
    // Check if already claimed
    if (user.claimedLevels[level]) {
      return res.status(400).json({
        success: false,
        error: 'Level already claimed'
      });
    }
    
    // Check if level is completed
    const levels = calculateAllLevels(telegramId);
    const currentLevel = levels[level];
    
    if (!currentLevel || !currentLevel.completed) {
      return res.status(400).json({
        success: false,
        error: 'Level not completed'
      });
    }
    
    if (currentLevel.reward === 0) {
      return res.status(400).json({
        success: false,
        error: 'No reward for this level'
      });
    }
    
    // Create claim request
    const claimRequest = {
      id: claimRequests.length + 1,
      telegramId,
      level,
      amount: currentLevel.reward,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      processedAt: null,
      adminNotes: null
    };
    
    claimRequests.push(claimRequest);
    
    // Mark as claimed
    user.claimedLevels[level] = {
      claimedAt: new Date().toISOString(),
      amount: currentLevel.reward,
      status: 'pending'
    };
    
    console.log(`💰 Claim request: User ${telegramId}, Level ${level}, Amount ${currentLevel.reward}`);
    
    res.json({
      success: true,
      claimRequest,
      message: 'Claim request submitted successfully'
    });
    
  } catch (error) {
    console.error('Error processing claim:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Admin stats
app.get('/api/admin/stats', (req, res) => {
  try {
    const stats = {
      users: {
        total: users.length,
        withWallets: users.filter(u => u.walletAddress).length,
        premium: premiumUsers.filter(p => p.active).length
      },
      claims: {
        total: claimRequests.length,
        pending: claimRequests.filter(c => c.status === 'pending').length,
        processed: claimRequests.filter(c => c.status === 'processed').length
      },
      payments: {
        totalUSDTPayments: usdtPayments.length,
        verifiedPayments: usdtPayments.filter(p => p.status === 'verified').length,
        totalRevenue: usdtPayments
          .filter(p => p.status === 'verified')
          .reduce((sum, p) => sum + p.usdtEquivalent, 0)
      }
    };
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ========================= TELEGRAM BOT COMMANDS =========================

if (bot) {
  // Bot webhook handler
  app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  // Set webhook
  app.get('/set-webhook', async (req, res) => {
    try {
      await bot.setWebHook(`${WEB_APP_URL}/webhook`);
      res.json({ success: true, message: 'Webhook set successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

// Catch all route - MUHIM: Bu eng oxirida bo'lishi kerak
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// ========================= ERROR HANDLING =========================

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  });
});

// ========================= START SERVER =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NotFrens Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🤖 Bot: ${bot ? 'Connected' : 'Disconnected'}`);
    console.log(`📊 Users: ${users.length}`);
    console.log(`💰 Payments: ${usdtPayments.length}`);
    console.log(`🎯 Ready to serve at: ${WEB_APP_URL}`);
    console.log(`❤️ Health check: ${WEB_APP_URL}/api/health`);
});
