const serverless = require('serverless-http');

// Import your Express app
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const app = express();

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || process.env.URL || 'https://your-app.netlify.app';
const TON_API_KEY = process.env.TON_API_KEY;
const TON_API_BASE = 'https://toncenter.com/api/v2';

// Admin & Deploy Configuration
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || 5864552188;
const DEPLOY_HOOK_URL = process.env.DEPLOY_HOOK_URL;

const USDT_CONFIG = {
  usdtReceivingAddress: process.env.USDT_RECEIVING_ADDRESS || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI", 
  tonReceivingAddress: process.env.TON_RECEIVING_ADDRESS || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI",   
  premiumPrice: parseInt(process.env.PREMIUM_PRICE_USDT) || 11,
  tonAlternativeAmount: parseFloat(process.env.TON_ALTERNATIVE_AMOUNT) || 0.1
};

// Bot initialization
let bot;
try {
  if (TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('✅ Telegram Bot initialized');
  }
} catch (error) {
  console.error('❌ Bot init failed:', error.message);
}

// Middleware
app.use(cors());
app.use(express.json());

// Storage (in production use database)
let users = [
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
  }
];

let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// Level configuration
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
  return {
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
    ton: {
      connectedWallets: walletConnections.length,
      totalTransactions: tonTransactions.length,
      apiEnabled: !!TON_API_KEY
    },
    payments: {
      totalUSDTPayments: usdtPayments.length,
      verifiedPayments: usdtPayments.filter(p => p.status === 'verified').length,
      totalRevenue: usdtPayments
        .filter(p => p.status === 'verified')
        .reduce((sum, p) => sum + p.usdtEquivalent, 0),
      premiumUsers: premiumUsers.filter(p => p.active).length
    }
  };
}

// TON API functions
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
    return { success: false, error: error.message };
  }
}

// ====================== BOT COMMANDS ======================
if (bot) {
  // Deploy command
  bot.onText(/\/deploy/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    if (userId == ADMIN_TELEGRAM_ID) {
      try {
        await bot.sendMessage(chatId, '🚀 Starting Netlify deployment...');
        
        if (DEPLOY_HOOK_URL) {
          const response = await axios.post(DEPLOY_HOOK_URL);
          if (response.status === 200) {
            await bot.sendMessage(chatId, '✅ Netlify deployment started!');
          }
        } else {
          await bot.sendMessage(chatId, '⚠️ Deploy hook not configured for Netlify');
        }
        
      } catch (error) {
        await bot.sendMessage(chatId, '❌ Deploy failed: ' + error.message);
      }
    } else {
      await bot.sendMessage(chatId, '❌ Admin only command');
    }
  });

  // Status command
  bot.onText(/\/status/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    if (userId == ADMIN_TELEGRAM_ID) {
      const stats = getRealTimeStats();
      
      await bot.sendMessage(chatId, 
        `📊 **NotFrens Status (Netlify)**\n\n` +
        `👥 Users: ${stats.users.total}\n` +
        `💎 Wallets: ${stats.users.withWallets}\n` +
        `🌟 Premium: ${stats.users.premium}\n` +
        `💰 Payments: ${stats.payments.totalUSDTPayments}\n` +
        `💵 Revenue: $${stats.payments.totalRevenue}\n` +
        `📈 Claims: ${stats.claims.pending} pending\n\n` +
        `🌐 Platform: Netlify\n` +
        `🕐 Time: ${new Date().toLocaleString()}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(chatId, '❌ Admin only command');
    }
  });

  // My ID command
  bot.onText(/\/myid/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    await bot.sendMessage(chatId, 
      `🆔 Your Telegram ID: \`${userId}\`\n` +
      `${userId == ADMIN_TELEGRAM_ID ? '🔑 Status: Admin' : '👤 Status: User'}`,
      { parse_mode: 'Markdown' }
    );
  });
}

// ====================== API ROUTES ======================

// Health check
app.get('/health', (req, res) => {
  const stats = getRealTimeStats();
  res.json({
    success: true,
    status: 'healthy - Netlify',
    timestamp: new Date().toISOString(),
    telegram: {
      bot: !!bot,
      username: BOT_USERNAME,
      adminId: ADMIN_TELEGRAM_ID
    },
    deploy: {
      platform: 'Netlify',
      hookConfigured: !!DEPLOY_HOOK_URL,
      domain: WEB_APP_URL
    },
    users: stats.users.total,
    version: '3.1.0-netlify'
  });
});

// TON Connect manifest
app.get('/tonconnect-manifest.json', (req, res) => {
  res.json(tonConnectManifest);
});

// Get user data
app.get('/telegram-user/:telegramId', (req, res) => {
  try {
    const { telegramId } = req.params;
    
    const user = users.find(u => u.telegramId === parseInt(telegramId));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.lastActive = new Date().toISOString();
    const levels = calculateAllLevels(user.telegramId);
    const directReferrals = users.filter(u => u.referrerTelegramId === user.telegramId);

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
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// TON Balance
app.post('/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !validateTonAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid TON address'
      });
    }
    
    const result = await getTonBalance(address);
    
    if (result.success) {
      res.json({
        success: true,
        balance: result.balance,
        address: address
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error getting balance'
    });
  }
});

// Wallet connect
app.post('/ton/connect', async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !validateTonAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid telegram ID or wallet address'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (user) {
      user.walletAddress = walletAddress;
      user.lastActive = new Date().toISOString();
    }
    
    walletConnections.push({
      telegramId,
      walletAddress,
      connectedAt: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Wallet connected successfully',
      walletAddress,
      telegramId
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error connecting wallet'
    });
  }
});

// Record transaction
app.post('/ton/transaction', async (req, res) => {
  try {
    const { hash, from, to, amount, comment } = req.body;
    
    const transaction = {
      id: tonTransactions.length + 1,
      hash,
      from,
      to,
      amount,
      comment,
      timestamp: new Date().toISOString(),
      status: 'verified'
    };
    
    tonTransactions.push(transaction);
    
    res.json({
      success: true,
      message: 'Transaction recorded successfully',
      transaction
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error recording transaction'
    });
  }
});

// USDT Payment
app.post('/payment/usdt', async (req, res) => {
  try {
    const { telegramId, type, hash, from, amount, comment, usdtEquivalent } = req.body;
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid telegram ID'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const payment = {
      id: usdtPayments.length + 1,
      telegramId,
      type,
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
    
    // Auto-verify after 5 seconds for demo
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
      
      // Send telegram notification
      if (bot) {
        bot.sendMessage(telegramId, 
          '🎉 **Premium Activated!**\n\n' +
          '✅ Your premium subscription is now active\n' +
          '🚀 Level progression unlocked\n' +
          '💰 Higher rewards enabled\n\n' +
          'Thank you for your payment!',
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    }, 5000);
    
    res.json({
      success: true,
      message: 'Payment processing started',
      payment: {
        id: payment.id,
        status: payment.status,
        usdtEquivalent: payment.usdtEquivalent,
        message: 'Your payment is being processed. Premium will be activated within 10 seconds.'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error processing payment'
    });
  }
});

// Claim rewards
app.post('/telegram-claim', async (req, res) => {
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
    
    if (!user.isPremium) {
      return res.status(400).json({
        success: false,
        error: 'Premium subscription required for claiming rewards'
      });
    }
    
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
    
    if (user.claimedLevels[level]) {
      return res.status(400).json({
        success: false,
        error: `Level ${level} already claimed`
      });
    }
    
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
    
    if (bot) {
      bot.sendMessage(telegramId, 
        `💰 **Claim Request Submitted!**\n\n` +
        `📊 **Level:** ${level}\n` +
        `💵 **Amount:** $${levelData.reward.toLocaleString()}\n` +
        `⏳ **Status:** Pending Review\n\n` +
        `We'll process your claim within 24 hours.`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
    
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
    res.status(500).json({
      success: false,
      error: 'Server error processing claim'
    });
  }
});

// Webhook
app.post('/webhook', (req, res) => {
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

// Export serverless function
module.exports.handler = serverless(app);
