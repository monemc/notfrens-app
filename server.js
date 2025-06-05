const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7583849213:AAHIuBdbO0mXRxunb8qyqI-B8zpjlyDNthw';
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://notfrens-app-behruzs-projects-93f6c51e.vercel.app';
const TON_API_KEY = process.env.TON_API_KEY || 'a449ebf3378f11572f17d64e4ec01f059d6f8f77ee3dafc0f69bc73284384b0f';
const TON_API_BASE = 'https://toncenter.com/api/v2';

// Admin & Deploy Configuration
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || 5864552188;
const DEPLOY_HOOK_URL = process.env.DEPLOY_HOOK_URL || 'https://api.vercel.com/v1/integrations/deploy/prj_IJT0VYlVHabGHiiIAFUe6kPFgeF6/ZqLPAIDQvD';

const USDT_CONFIG = {
  usdtReceivingAddress: process.env.USDT_RECEIVING_ADDRESS || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI", 
  tonReceivingAddress: process.env.TON_RECEIVING_ADDRESS || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI",   
  premiumPrice: parseInt(process.env.PREMIUM_PRICE_USDT) || 11,
  tonAlternativeAmount: parseFloat(process.env.TON_ALTERNATIVE_AMOUNT) || 0.1
};

const ADMIN_USER = process.env.ADMIN_USER || 'Guzal';
const ADMIN_PASS = process.env.ADMIN_PASS || 'guzalm1445';

console.log('🚀 NotFrens with Telegram Deploy Starting...');
console.log(`👤 Admin ID: ${ADMIN_TELEGRAM_ID}`);
console.log(`🌐 Domain: ${WEB_APP_URL}`);
console.log(`🔗 Deploy Hook: ${DEPLOY_HOOK_URL ? 'Set' : 'Missing'}`);

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
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('.', { index: false }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  next();
});

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
  
  console.log(`✅ Demo data created: ${users.length} users, ${allReferrals.length} referrals`);
}

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

app.get('/tonconnect-manifest.json', (req, res) => {
  res.json(tonConnectManifest);
});

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

// ========================= TELEGRAM BOT COMMANDS =========================

if (bot) {
  // Deploy command
  bot.onText(/\/deploy/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    console.log(`Deploy command from ${username} (ID: ${userId})`);
    
    if (userId == ADMIN_TELEGRAM_ID) {
      try {
        await bot.sendMessage(chatId, '🚀 Starting deployment...\n\n⏳ Please wait...');
        
        const response = await axios.post(DEPLOY_HOOK_URL);
        
        if (response.status === 200) {
          await bot.sendMessage(chatId, 
            '✅ **Deployment Started Successfully!**\n\n' +
            '🔄 Your NotFrens app is updating now\n' +
            '⏱️ Deployment will complete in 1-2 minutes\n' +
            '🌐 App URL: ' + WEB_APP_URL + '\n\n' +
            '📊 Use /status to check system health',
            { parse_mode: 'Markdown' }
          );
        } else {
          throw new Error('Deploy hook returned non-200 status');
        }
        
      } catch (error) {
        console.error('Deploy error:', error);
        await bot.sendMessage(chatId, 
          '❌ **Deployment Failed!**\n\n' +
          `Error: ${error.message}\n\n` +
          'Please check:\n' +
          '• Deploy hook URL is correct\n' +
          '• Environment variables are set\n' +
          '• Vercel project is accessible',
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      await bot.sendMessage(chatId, 
        '❌ **Access Denied**\n\n' +
        'Only admin can trigger deployments.\n' +
        `Your ID: \`${userId}\`\n` +
        `Required ID: \`${ADMIN_TELEGRAM_ID}\``,
        { parse_mode: 'Markdown' }
      );
    }
  });

  // Status command
  bot.onText(/\/status/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    if (userId == ADMIN_TELEGRAM_ID) {
      const stats = getRealTimeStats();
      
      await bot.sendMessage(chatId, 
        `📊 **NotFrens System Status**\n\n` +
        `👥 **Users:** ${stats.users.total}\n` +
        `💎 **Connected Wallets:** ${stats.users.withWallets}\n` +
        `🌟 **Premium Users:** ${stats.users.premium}\n` +
        `💰 **Total Payments:** ${stats.payments.totalUSDTPayments}\n` +
        `💵 **Total Revenue:** $${stats.payments.totalRevenue}\n` +
        `📈 **Pending Claims:** ${stats.claims.pending}\n` +
        `🔄 **TON Transactions:** ${stats.ton.totalTransactions}\n\n` +
        `🌐 **App URL:** ${WEB_APP_URL}\n` +
        `🤖 **Bot:** @${BOT_USERNAME}\n` +
        `🕐 **Last Updated:** ${new Date().toLocaleString()}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(chatId, '❌ Admin only command');
    }
  });

  // My ID command (for any user)
  bot.onText(/\/myid/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    await bot.sendMessage(chatId, 
      `👤 **Your Information:**\n\n` +
      `🆔 **Telegram ID:** \`${userId}\`\n` +
      `👋 **Name:** ${username}\n\n` +
      `${userId == ADMIN_TELEGRAM_ID ? '🔑 **Status:** Admin' : '👤 **Status:** User'}`,
      { parse_mode: 'Markdown' }
    );
  });

  // Help command
  bot.onText(/\/help/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    let helpText = `🤖 **NotFrens Bot Commands**\n\n` +
                   `🆔 /myid - Get your Telegram ID\n` +
                   `🚀 /start - Open NotFrens app\n`;
    
    if (userId == ADMIN_TELEGRAM_ID) {
      helpText += `\n🔑 **Admin Commands:**\n` +
                  `📊 /status - System status\n` +
                  `🚀 /deploy - Deploy application\n`;
    }
    
    await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
  });

  // Start command with referral
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const referralCode = match[1];
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        
        await bot.sendMessage(chatId, 
          `👋 **Welcome back, ${username}!**\n\n` +
          `🔗 **Your referral code:** \`${existingUser.referralCode}\`\n` +
          `👥 **Direct referrals:** ${users.filter(u => u.referrerTelegramId === telegramId).length}/3\n` +
          `💎 **Wallet:** ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 **Premium:** ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n` +
          `📱 **Open Web App:**`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '🚀 Open NotFrens App', web_app: { url: webAppUrl } }
              ]]
            }
          }
        );
        return;
      }
      
      let referrer = null;
      if (referralCode) {
        const referrerId = parseInt(referralCode);
        if (referrerId && !isNaN(referrerId)) {
          referrer = users.find(u => u.telegramId === referrerId);
        }
      }
      
      const newUser = {
        id: users.length + 1,
        telegramId: telegramId,
        username: username,
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        referralCode: telegramId.toString(),
        referrerTelegramId: referrer ? referrer.telegramId : null,
        referrerCode: referralCode || null,
        claimedLevels: {},
        walletAddress: null,
        isPremium: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      users.push(newUser);
      
      if (referrer) {
        const existingReferrals = allReferrals.filter(r => r.referrerId === referrer.telegramId);
        const isStructural = existingReferrals.length < 3;
        
        allReferrals.push({
          referrerId: referrer.telegramId,
          referralId: telegramId,
          position: existingReferrals.length + 1,
          isStructural: isStructural,
          timestamp: new Date().toISOString()
        });
      }
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      let welcomeMessage = `🎉 **Welcome to NotFrens, ${username}!**\n\n`;
      
      if (referrer) {
        welcomeMessage += `✅ You joined via ${referrer.username}'s referral!\n\n`;
      }
      
      welcomeMessage += 
        `🆔 **Your referral ID:** \`${newUser.telegramId}\`\n` +
        `📤 **Your referral link:**\n\`${referralLink}\`\n\n` +
        `💰 **Earn rewards by inviting friends:**\n` +
        `• Level 3 (9 referrals): $30\n` +
        `• Level 5 (81 referrals): $300\n` +
        `• Level 7 (729 referrals): $1,800\n` +
        `• Level 9 (6,561 referrals): $20,000\n` +
        `• Level 12 (177,147 referrals): $222,000\n\n` +
        `💎 **Connect your TON wallet in the app!**\n` +
        `🌟 **Upgrade to Premium for $11 USDT to unlock level progression!**`;
        
      await bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Open NotFrens App', web_app: { url: webAppUrl } }],
            [{ text: '📤 Share Referral', switch_inline_query: `Join NotFrens! Use my ID: ${telegramId}` }]
          ]
        }
      });
        
      if (referrer) {
        await bot.sendMessage(referrer.telegramId, 
          `🎉 **New referral joined!**\n\n` +
          `👤 ${username} joined via your ID\n` +
          `📊 Your referrals: ${users.filter(u => u.referrerTelegramId === referrer.telegramId).length}`
        ).catch(() => {});
      }
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
      await bot.sendMessage(chatId, 
        `❌ Sorry, there was an error. Please try again later.`
      );
    }
  });

  // Simple start command
  bot.onText(/^\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
    
    await bot.sendMessage(chatId, 
      `🚀 **Welcome to NotFrens!**\n\n` +
      `Hello ${username}! Ready to start earning?\n\n` +
      `📱 Click below to open the app:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Open NotFrens App', web_app: { url: webAppUrl } }
          ]]
        }
      }
    );
  });
}

// Routes
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'NotFrens Backend with Telegram Deploy Working!',
    timestamp: new Date().toISOString(),
    features: {
      telegram: !!bot,
      ton: !!TON_API_KEY,
      usdt: true,
      deploy: !!DEPLOY_HOOK_URL,
      admin: !!ADMIN_TELEGRAM_ID
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
      username: BOT_USERNAME,
      adminId: ADMIN_TELEGRAM_ID
    },
    deploy: {
      hookConfigured: !!DEPLOY_HOOK_URL,
      domain: WEB_APP_URL
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
    version: '3.1.0-telegram-deploy'
  });
});

app.get('/api/telegram-user/:telegramId', (req, res) => {
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
    console.error('❌ Get telegram user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/balance', async (req, res) => {
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

app.post('/api/ton/connect', async (req, res) => {
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

app.post('/api/ton/transaction', async (req, res) => {
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

app.post('/api/payment/usdt', async (req, res) => {
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
      
      // Send telegram notification if bot available
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
    
    // Check premium requirement
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
    
    // Send telegram notification
    if (bot) {
      bot.sendMessage(telegramId, 
        `💰 **Claim Request Submitted!**\n\n` +
        `📊 **Level:** ${level}\n` +
        `💵 **Amount:** ${levelData.reward.toLocaleString()}\n` +
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

// Webhook for production
if (bot && process.env.NODE_ENV === 'production') {
  app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
}

// Main app routes
app.get('/app.html', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'app.html'));
  } catch (error) {
    res.status(500).json({ error: 'File not found' });
  }
});

app.get('/', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'app.html'));
  } catch (error) {
    res.status(500).json({ error: 'File not found' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

app.use('*', (req, res) => {
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
      'POST /api/telegram-claim',
      'POST /webhook'
    ]
  });
});

// Export for Vercel
module.exports = app;

// Local development server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 NotFrens with Telegram Deploy Started!');
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📱 Frontend App: http://localhost:${PORT}`);
    console.log(`📡 API Base: http://localhost:${PORT}/api`);
    console.log(`💚 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🤖 Telegram Bot: @${BOT_USERNAME}`);
    console.log(`👤 Admin ID: ${ADMIN_TELEGRAM_ID}`);
    console.log(`🔗 Deploy Hook: ${DEPLOY_HOOK_URL ? 'Configured' : 'Missing'}`);
    console.log(`💰 USDT Address: ${USDT_CONFIG.usdtReceivingAddress}`);
    console.log('\n✅ Telegram Commands:');
    console.log('   /deploy - Deploy application (admin only)');
    console.log('   /status - System status (admin only)');
    console.log('   /myid - Get your Telegram ID');
    console.log('   /help - Show all commands');
    console.log('   /start - Open NotFrens app');
    console.log('\n🎯 Ready for production deploy!');
  });
}
