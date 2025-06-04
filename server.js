const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========================= BOT CONFIGURATION =========================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7583849213:AAHIuBdbO0mXRxunb8qyqI-B8zpjlyDNthw';
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || `https://notfrens.app`;

// ========================= TON CONFIGURATION =========================
const TON_API_KEY = process.env.TON_API_KEY || 'a449ebf3378f11572f17d64e4ec01f059d6f8f77ee3dafc0f69bc73284384b0f';
const TON_API_BASE = 'https://toncenter.com/api/v2';

// ========================= USDT PAYMENT CONFIGURATION =========================
const USDT_CONFIG = {
  usdtReceivingAddress: process.env.USDT_RECEIVING_ADDRESS || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI", 
  tonReceivingAddress: process.env.TON_RECEIVING_ADDRESS || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI",   
  premiumPrice: parseInt(process.env.PREMIUM_PRICE_USDT) || 11,
  tonAlternativeAmount: parseFloat(process.env.TON_ALTERNATIVE_AMOUNT) || 0.1,
  usdtContractAddress: process.env.USDT_CONTRACT_ADDRESS || "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
  autoVerification: process.env.AUTO_VERIFICATION === 'true' || false,
  verificationTimeout: parseInt(process.env.VERIFICATION_TIMEOUT) || 24 * 60 * 60 * 1000
};

// ========================= ADMIN CONFIGURATION =========================
const ADMIN_USER = process.env.ADMIN_USER || 'Guzal';
const ADMIN_PASS = process.env.ADMIN_PASS || 'guzalm1445';
let adminSessions = new Set();

console.log('\n🚀 NotFrens Complete Backend Starting...');
console.log('🔧 Configuration:');
console.log(`   📡 PORT: ${PORT}`);
console.log(`   🤖 BOT: @${BOT_USERNAME}`);
console.log(`   🌐 URL: ${WEB_APP_URL}`);
console.log(`   💎 TON API: ${TON_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   💰 USDT Address: ${USDT_CONFIG.usdtReceivingAddress}`);
console.log(`   🔑 Admin: ${ADMIN_USER}`);

// ========================= TELEGRAM BOT SETUP =========================
let bot;
try {
  if (TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('✅ Telegram Bot initialized successfully');
  } else {
    console.log('⚠️ Telegram Bot token not found');
  }
} catch (error) {
  console.error('❌ Telegram Bot initialization failed:', error.message);
}

// ========================= MIDDLEWARE =========================
app.use(cors({
  origin: function(origin, callback) {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files middleware
app.use(express.static('.', {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  },
  index: false
}));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ========================= SIMPLE FILE-BASED STORAGE =========================
// Serverless uchun oddiy file storage (production da database kerak)
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// Sample data initialization
if (users.length === 0) {
  console.log('🎮 Creating sample data...');
  
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
    },
    {
      id: 3,
      telegramId: 555666777,
      username: 'Friend2',
      firstName: 'Friend',
      lastName: 'Two',
      referralCode: '555666777',
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
  
  allReferrals.push(
    {
      referrerId: 123456789,
      referralId: 987654321,
      position: 1,
      isStructural: true,
      timestamp: new Date().toISOString()
    },
    {
      referrerId: 123456789,
      referralId: 555666777,
      position: 2,
      isStructural: true,
      timestamp: new Date().toISOString()
    }
  );
  
  console.log(`✅ Created ${users.length} sample users and ${allReferrals.length} referrals`);
}

// ========================= LEVEL CONFIGURATION =========================
const LEVEL_CONFIG = {
  1: { required: 1, reward: 0 },
  2: { required: 3, reward: 0 },
  3: { required: 9, reward: 30 },
  4: { required: 27, reward: 0 },
  5: { required: 81, reward: 300 },
  6: { required: 243, reward: 0 },
  7: { required: 729, reward: 1800 },
  8: { required: 2187, reward: 0 },
  9: { required: 6561, reward: 20000 },
  10: { required: 19683, reward: 0 },
  11: { required: 59049, reward: 0 },
  12: { required: 177147, reward: 222000 }
};

// ========================= TON CONNECT MANIFEST =========================
const tonConnectManifest = {
  url: WEB_APP_URL,
  name: "NotFrens",
  iconUrl: `${WEB_APP_URL}/icon-192x192.png`,
  termsOfUseUrl: `${WEB_APP_URL}/terms`,
  privacyPolicyUrl: `${WEB_APP_URL}/privacy`
};

app.get('/tonconnect-manifest.json', (req, res) => {
  console.log('📋 TON Connect manifest requested');
  res.json(tonConnectManifest);
});

// ========================= UTILITY FUNCTIONS =========================
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

function getAllReferrals(userTelegramId) {
  const userReferrals = allReferrals.filter(r => r.referrerId === userTelegramId);
  const structural = userReferrals.filter(r => r.isStructural);
  const extra = userReferrals.filter(r => !r.isStructural);
  
  return {
    total: userReferrals.length,
    structural: structural.length,
    extra: extra.length,
    structuralUsers: structural.map(r => users.find(u => u.telegramId === r.referralId)).filter(u => u),
    extraUsers: extra.map(r => users.find(u => u.telegramId === r.referralId)).filter(u => u)
  };
}

function calculateAllLevels(userTelegramId) {
  const levels = {};
  
  for (let level = 1; level <= 12; level++) {
    const required = LEVEL_CONFIG[level].required;
    const totalReferrals = calculateTotalReferrals(userTelegramId, level);
    
    levels[level] = {
      current: totalReferrals,
      required: required,
      completed: totalReferrals >= required,
      reward: LEVEL_CONFIG[level].reward,
      hasReward: LEVEL_CONFIG[level].reward > 0
    };
  }
  
  return levels;
}

function getRealTimeStats() {
  const totalUsers = users.length;
  const totalClaims = claimRequests.length;
  const pendingClaims = claimRequests.filter(c => c.status === 'pending').length;
  const processedClaims = claimRequests.filter(c => c.status === 'processed').length;
  const rejectedClaims = claimRequests.filter(c => c.status === 'rejected').length;
  const connectedWallets = walletConnections.length;
  const totalTransactions = tonTransactions.length;
  const totalUSDTPayments = usdtPayments.length;
  const activePremiumUsers = premiumUsers.filter(p => p.active).length;
  
  return {
    users: {
      total: totalUsers,
      withReferrals: users.filter(u => {
        const directRefs = users.filter(ref => ref.referrerTelegramId === u.telegramId);
        return directRefs.length > 0;
      }).length,
      withWallets: users.filter(u => u.walletAddress).length,
      premium: activePremiumUsers
    },
    claims: {
      total: totalClaims,
      pending: pendingClaims,
      processed: processedClaims,
      rejected: rejectedClaims
    },
    ton: {
      connectedWallets: connectedWallets,
      totalTransactions: totalTransactions,
      apiEnabled: !!TON_API_KEY
    },
    payments: {
      totalUSDTPayments: totalUSDTPayments,
      pendingPayments: usdtPayments.filter(p => p.status === 'pending').length,
      verifiedPayments: usdtPayments.filter(p => p.status === 'verified').length,
      totalRevenue: usdtPayments
        .filter(p => p.status === 'verified')
        .reduce((sum, p) => sum + p.usdtEquivalent, 0),
      premiumUsers: activePremiumUsers
    },
    telegram: {
      botUsername: BOT_USERNAME,
      totalUsers: totalUsers,
      activeBot: !!bot
    }
  };
}

// ========================= TON API FUNCTIONS - TUZATILGAN =========================
async function getTonBalance(address) {
  try {
    const url = `${TON_API_BASE}/getAddressInformation`;
    const headers = TON_API_KEY ? { 'X-API-Key': TON_API_KEY } : {};
    
    const response = await axios.post(url, { address }, { headers });
    
    if (response.data.ok) {
      const balance = response.data.result.balance;
      const tonBalance = (parseInt(balance) / 1000000000).toFixed(3);
      return { success: true, balance: tonBalance };
    } else {
      return { success: false, error: 'Failed to get balance' };
    }
  } catch (error) {
    console.error('❌ TON API Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function getTransactionInfo(hash) {
  try {
    const url = `${TON_API_BASE}/getTransactions`;
    const headers = TON_API_KEY ? { 'X-API-Key': TON_API_KEY } : {};
    
    const response = await axios.post(url, { 
      address: hash,
      limit: 1 
    }, { headers });
    
    if (response.data.ok) {
      return { success: true, data: response.data.result };
    } else {
      return { success: false, error: 'Transaction not found' };
    }
  } catch (error) {
    console.error('❌ TON Transaction API Error:', error.message);
    return { success: false, error: error.message };
  }
}

// ========================= BASIC ROUTES =========================
app.get('/api/test', (req, res) => {
  console.log('🧪 API Test called');
  res.json({
    success: true,
    message: 'NotFrens Complete Backend Working! All features integrated.',
    timestamp: new Date().toISOString(),
    features: {
      telegram: !!bot,
      ton: !!TON_API_KEY || 'basic',
      usdt: true,
      admin: true,
      cors: true
    }
  });
});

app.get('/api/health', (req, res) => {
  const stats = getRealTimeStats();
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    telegram: {
      bot: !!bot,
      username: BOT_USERNAME
    },
    ton: {
      apiEnabled: !!TON_API_KEY,
      connectedWallets: stats.ton.connectedWallets,
      totalTransactions: stats.ton.totalTransactions
    },
    usdt: {
      paymentsEnabled: true,
      totalPayments: stats.payments.totalUSDTPayments,
      totalRevenue: stats.payments.totalRevenue,
      premiumUsers: stats.payments.premiumUsers
    },
    users: stats.users.total,
    claims: stats.claims.total,
    cors: 'enabled',
    version: '3.0.0-complete'
  });
});

// ========================= USER ROUTES =========================
app.get('/api/telegram-user/:telegramId', (req, res) => {
  try {
    const { telegramId } = req.params;
    console.log(`🔍 API Request: Get user ${telegramId}`);
    
    const user = users.find(u => u.telegramId === parseInt(telegramId));
    if (!user) {
      console.log(`❌ User not found: ${telegramId}`);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.lastActive = new Date().toISOString();
    const levels = calculateAllLevels(user.telegramId);
    const directReferrals = users.filter(u => u.referrerTelegramId === user.telegramId);

    console.log(`✅ User data sent: ${user.username} (${directReferrals.length} referrals)`);

    res.json({
      success: true,
      user: {
        ...user,
        levels,
        directReferrals: directReferrals.map(u => ({
          telegramId: u.telegramId,
          username: u.username,
          joinedAt: u.createdAt
        })),
        totalDirectReferrals: directReferrals.length,
        referralLink: `https://t.me/${BOT_USERNAME}?start=${user.referralCode}`,
        isPremium: user.isPremium
      },
      message: 'User information retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Get telegram user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= TON INTEGRATION ROUTES - QO'SHILDI =========================
app.post('/api/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !validateTonAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid TON address'
      });
    }
    
    console.log(`💎 Getting TON balance for: ${address}`);
    const result = await getTonBalance(address);
    
    if (result.success) {
      console.log(`✅ Balance retrieved: ${result.balance} TON`);
      res.json({
        success: true,
        balance: result.balance,
        address: address
      });
    } else {
      console.log(`❌ Balance error: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ TON balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error getting balance'
    });
  }
});

app.post('/api/ton/connect', async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !validateTonAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid telegram ID or wallet address'
      });
    }
    
    console.log(`🔗 Connecting wallet ${walletAddress} to user ${telegramId}`);
    
    // Update user wallet
    const user = users.find(u => u.telegramId === telegramId);
    if (user) {
      user.walletAddress = walletAddress;
      user.lastActive = new Date().toISOString();
    }
    
    // Save wallet connection
    walletConnections.push({
      telegramId,
      walletAddress,
      connectedAt: new Date().toISOString()
    });
    
    console.log(`✅ Wallet connected successfully`);
    res.json({
      success: true,
      message: 'Wallet connected successfully',
      walletAddress,
      telegramId
    });
    
  } catch (error) {
    console.error('❌ Wallet connect error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error connecting wallet'
    });
  }
});

app.post('/api/ton/transaction', async (req, res) => {
  try {
    const { hash, from, to, amount, comment } = req.body;
    
    console.log(`📤 Recording TON transaction: ${amount} TON from ${from} to ${to}`);
    
    // Save transaction
    const transaction = {
      id: tonTransactions.length + 1,
      hash,
      from,
      to,
      amount,
      comment,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    tonTransactions.push(transaction);
    
    // Try to verify transaction
    if (hash) {
      const verification = await getTransactionInfo(hash);
      if (verification.success) {
        transaction.status = 'verified';
        transaction.verification = verification.data;
      }
    }
    
    console.log(`✅ Transaction recorded with status: ${transaction.status}`);
    res.json({
      success: true,
      message: 'Transaction recorded successfully',
      transaction
    });
    
  } catch (error) {
    console.error('❌ Transaction record error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error recording transaction'
    });
  }
});

// ========================= USDT PAYMENT ROUTES - QO'SHILDI =========================
app.post('/api/payment/usdt', async (req, res) => {
  try {
    const { telegramId, type, hash, from, amount, comment, usdtEquivalent } = req.body;
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid telegram ID'
      });
    }
    
    console.log(`💰 Processing USDT payment: ${usdtEquivalent} USDT for user ${telegramId}`);
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Create payment record
    const payment = {
      id: usdtPayments.length + 1,
      telegramId,
      type, // 'direct_usdt' or 'ton_comment'
      hash,
      from,
      amount,
      comment,
      usdtEquivalent,
      status: 'pending',
      createdAt: new Date().toISOString(),
      verifiedAt: null
    };
    
    usdtPayments.push(payment);
    
    // For demo purposes, auto-verify after 5 seconds
    setTimeout(() => {
      payment.status = 'verified';
      payment.verifiedAt = new Date().toISOString();
      
      // Activate premium
      user.isPremium = true;
      
      premiumUsers.push({
        telegramId: user.telegramId,
        activatedAt: new Date().toISOString(),
        paymentId: payment.id,
        active: true
      });
      
      console.log(`✅ Premium activated for user ${telegramId}`);
    }, 5000);
    
    res.json({
      success: true,
      message: 'Payment processing started',
      payment: {
        id: payment.id,
        status: payment.status,
        usdtEquivalent: payment.usdtEquivalent,
        message: 'Your payment is being processed. Premium will be activated within 5 minutes.'
      }
    });
    
  } catch (error) {
    console.error('❌ USDT payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error processing payment'
    });
  }
});

// ========================= CLAIMS ROUTE - QO'SHILDI =========================
app.post('/api/telegram-claim', async (req, res) => {
  try {
    const { telegramId, level } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid telegram ID or level'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if level is completed
    const levels = calculateAllLevels(telegramId);
    const levelData = levels[level];
    
    if (!levelData.completed) {
      return res.status(400).json({
        success: false,
        error: `Level ${level} not completed. Need ${levelData.required} referrals, have ${levelData.current}`
      });
    }
    
    if (!levelData.hasReward || levelData.reward === 0) {
      return res.status(400).json({
        success: false,
        error: `Level ${level} has no reward`
      });
    }
    
    // Check if already claimed
    if (user.claimedLevels[level]) {
      return res.status(400).json({
        success: false,
        error: `Level ${level} already claimed`
      });
    }
    
    // Create claim request
    const claimRequest = {
      id: claimRequests.length + 1,
      telegramId,
      level,
      amount: levelData.reward,
      status: 'pending',
      createdAt: new Date().toISOString(),
      processedAt: null
    };
    
    claimRequests.push(claimRequest);
    user.claimedLevels[level] = true;
    
    console.log(`💰 Claim request created: Level ${level} - $${levelData.reward} for user ${telegramId}`);
    
    res.json({
      success: true,
      message: 'Claim request submitted successfully',
      claimRequest: {
        id: claimRequest.id,
        level: claimRequest.level,
        amount: claimRequest.amount,
        status: claimRequest.status
      }
    });
    
  } catch (error) {
    console.error('❌ Claim request error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error processing claim'
    });
  }
});

// ========================= MAIN APP ROUTES =========================
app.get('/app.html', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'app.html'));
  } catch (error) {
    console.error('Error serving app.html:', error);
    res.status(500).json({ error: 'File not found' });
  }
});

app.get('/', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'app.html'));
  } catch (error) {
    console.error('Error serving index:', error);
    res.status(500).json({ error: 'File not found' });
  }
});

// ========================= ERROR HANDLING =========================
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

app.use('*', (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    availableRoutes: [
      'GET /',
      'GET /app.html',
      'GET /api/test',
      'GET /api/health',
      'GET /tonconnect-manifest.json',
      'GET /api/telegram-user/:id',
      'POST /api/ton/balance',
      'POST /api/ton/connect', 
      'POST /api/ton/transaction',
      'POST /api/payment/usdt',
      'POST /api/telegram-claim'
    ]
  });
});

// ========================= EXPORT FOR VERCEL =========================
module.exports = app;

// Local development server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 NotFrens Backend Server Started!');
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📱 Frontend App: http://localhost:${PORT}`);
    console.log(`📡 API Base: http://localhost:${PORT}/api`);
    console.log(`💚 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🤖 Telegram Bot: @${BOT_USERNAME}`);
  });
}
