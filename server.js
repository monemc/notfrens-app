const express = require('express');
const cors = require('cors');
const path = require('path');
const serverless = require('serverless-http');
require('dotenv').config();

const app = express();

// Environment Variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7583849213:AAHIuBdbO0mXRxunb8qyqI-B8zpjlyDNthw';
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://notfrens.app';
const TON_API_KEY = process.env.TON_API_KEY || 'a449ebf3378f11572f17d64e4ec01f059d6f8f77ee3dafc0f69bc73284384b0f';

const ADMIN_TELEGRAM_ID = parseInt(process.env.ADMIN_TELEGRAM_ID) || 123456789;

// USDT Configuration
const USDT_CONFIG = {
    ownerUsdtAddress: process.env.USDT_RECEIVING_ADDRESS || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI",
    premiumPrice: parseInt(process.env.PREMIUM_PRICE_USDT) || 11,
    autoVerification: process.env.AUTO_VERIFICATION === 'true' || true
};

console.log('🚀 NotFrens Backend Starting...');
console.log(`🌐 Domain: ${WEB_APP_URL}`);

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Storage
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
  
  console.log(`✅ Demo data created: ${users.length} users, ${allReferrals.length} referrals`);
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

// TON Connect manifest
const tonConnectManifest = {
  url: WEB_APP_URL,
  name: "NotFrens",
  iconUrl: `${WEB_APP_URL}/icon-192x192.png`,
  termsOfUseUrl: `${WEB_APP_URL}/terms`,
  privacyPolicyUrl: `${WEB_APP_URL}/privacy`
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

function getRealTimeStats() {
  const totalUsers = users.length;
  const totalClaims = claimRequests.length;
  const connectedWallets = walletConnections.length;
  const totalTransactions = tonTransactions.length;
  const totalUSDTPayments = usdtPayments.length;
  const activePremiumUsers = premiumUsers.filter(p => p.active).length;
  
  return {
    users: {
      total: totalUsers,
      withWallets: users.filter(u => u.walletAddress).length,
      premium: activePremiumUsers
    },
    claims: {
      total: totalClaims,
      pending: claimRequests.filter(c => c.status === 'pending').length,
      processed: claimRequests.filter(c => c.status === 'processed').length
    },
    ton: {
      connectedWallets: connectedWallets,
      totalTransactions: totalTransactions,
      apiEnabled: !!TON_API_KEY
    },
    payments: {
      totalUSDTPayments: totalUSDTPayments,
      verifiedPayments: usdtPayments.filter(p => p.status === 'verified').length,
      totalRevenue: usdtPayments
        .filter(p => p.status === 'verified')
        .reduce((sum, p) => sum + p.usdtEquivalent, 0),
      premiumUsers: activePremiumUsers
    }
  };
}

// Routes

// Main app route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// TON Connect manifest
app.get('/tonconnect-manifest.json', (req, res) => {
  res.json(tonConnectManifest);
});

// API Routes
app.get('/api/health', (req, res) => {
  const stats = getRealTimeStats();
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    users: stats.users.total,
    claims: stats.claims.total,
    version: '3.1.0',
    features: {
      tonWallet: true,
      usdtPayments: true,
      referralSystem: true,
      premiumLevels: true
    }
  });
});

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
      console.log(`👤 New user created: ${telegramId}`);
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
      referralLink: `https://t.me/${BOT_USERNAME}/notfrens?startapp=${telegramId}`,
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

// Add referral
app.post('/api/telegram-referral', (req, res) => {
  try {
    const { telegramId, referrerCode } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !referrerCode) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters'
      });
    }
    
    const referrerTelegramId = parseInt(referrerCode);
    
    if (telegramId === referrerTelegramId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot refer yourself'
      });
    }
    
    // Check if referrer exists
    const referrer = users.find(u => u.telegramId === referrerTelegramId);
    if (!referrer) {
      return res.status(404).json({
        success: false,
        error: 'Referrer not found'
      });
    }
    
    // Check if already referred
    const existingReferral = allReferrals.find(r => 
      r.referralId === telegramId && r.referrerId === referrerTelegramId
    );
    
    if (existingReferral) {
      return res.status(400).json({
        success: false,
        error: 'Already referred'
      });
    }
    
    // Add referral
    const newReferral = {
      referrerId: referrerTelegramId,
      referralId: telegramId,
      position: allReferrals.filter(r => r.referrerId === referrerTelegramId).length + 1,
      isStructural: true,
      timestamp: new Date().toISOString()
    };
    
    allReferrals.push(newReferral);
    
    // Update user's referrer info
    const user = users.find(u => u.telegramId === telegramId);
    if (user) {
      user.referrerTelegramId = referrerTelegramId;
      user.referrerCode = referrerCode;
    }
    
    console.log(`🔗 New referral: ${referrerTelegramId} -> ${telegramId}`);
    
    res.json({
      success: true,
      referral: newReferral,
      message: 'Referral added successfully'
    });
    
  } catch (error) {
    console.error('Error adding referral:', error);
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
    
    // Simulate balance check (replace with real TON API call)
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

// TON transaction notification
app.post('/api/ton/transaction', (req, res) => {
  try {
    const { hash, from, to, amount, comment } = req.body;
    
    const transaction = {
      id: tonTransactions.length + 1,
      hash,
      from,
      to,
      amount: parseFloat(amount),
      comment,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    
    tonTransactions.push(transaction);
    
    console.log(`⚡ TON Transaction: ${from} -> ${to}, ${amount} TON`);
    
    res.json({
      success: true,
      transaction,
      message: 'Transaction recorded'
    });
    
  } catch (error) {
    console.error('Error recording transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
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
    
    // Auto-verify if amount matches premium price
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
    
    console.log(`💰 USDT Payment: ${telegramId}, ${usdtEquivalent}, Status: ${payment.status}`);
    
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

// Admin stats
app.get('/api/admin/stats', (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        recentActivity: {
          newUsers: users.filter(u => 
            new Date(u.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
          ).length,
          recentClaims: claimRequests.filter(c => 
            new Date(c.requestedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
          ).length,
          recentPayments: usdtPayments.filter(p => 
            new Date(p.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
          ).length
        }
      },
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

// Catch all route - serve main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// Export for Netlify Functions
module.exports.handler = serverless(app);
