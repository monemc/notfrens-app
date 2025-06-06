const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========================= ENVIRONMENT VARIABLES CHECK =========================
function checkEnvironmentVariables() {
    const requiredVars = [
        'TELEGRAM_BOT_TOKEN',
        'BOT_USERNAME', 
        'ADMIN_TELEGRAM_ID',
        'TON_API_KEY',
        'USDT_RECEIVING_ADDRESS'
    ];
    
    const missingVars = [];
    const configStatus = {};
    
    requiredVars.forEach(varName => {
        if (!process.env[varName]) {
            missingVars.push(varName);
            configStatus[varName] = '❌ Missing';
        } else {
            configStatus[varName] = '✅ Set';
        }
    });
    
    console.log('\n🔧 Environment Variables Check:');
    Object.keys(configStatus).forEach(key => {
        console.log(`   ${key}: ${configStatus[key]}`);
    });
    
    if (missingVars.length > 0) {
        console.log('\n⚠️ Missing Environment Variables:');
        missingVars.forEach(varName => {
            console.log(`   - ${varName}`);
        });
        console.log('\n📝 Please add these to your hosting platform (Vercel/Netlify)');
    } else {
        console.log('\n✅ All required environment variables are set!');
    }
    
    return {
        allSet: missingVars.length === 0,
        missing: missingVars,
        status: configStatus
    };
}

// Check environment variables on startup
const envCheck = checkEnvironmentVariables();

// Configuration with fallbacks
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7583849213:AAHIuBdbO0mXRxunb8qyqI-B8zpjlyDNthw';
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || process.env.URL || 'https://notfrens-app-behruzs-projects-93f6c51e.vercel.app';
const TON_API_KEY = process.env.TON_API_KEY || 'a449ebf3378f11572f17d64e4ec01f059d6f8f77ee3dafc0f69bc73284384b0f';
const TON_API_BASE = 'https://toncenter.com/api/v2';

// Admin & Deploy Configuration
const ADMIN_TELEGRAM_ID = parseInt(process.env.ADMIN_TELEGRAM_ID) || 5864552188;
const DEPLOY_HOOK_URL = process.env.DEPLOY_HOOK_URL || 'https://api.vercel.com/v1/integrations/deploy/prj_IJT0VYlVHabGHiiIAFUe6kPFgeF6/ZqLPAIDQvD';

// USDT Configuration - OWNER WALLET ONLY
const USDT_CONFIG = {
    ownerUsdtAddress: process.env.USDT_RECEIVING_ADDRESS || "UQCpLxU30SVhlQ049kja71GohOM43YR3emTT3igMHsntmlkI", 
    premiumPrice: parseInt(process.env.PREMIUM_PRICE_USDT) || 11,
    autoVerification: process.env.AUTO_VERIFICATION === 'true' || true,
    verificationTimeout: parseInt(process.env.VERIFICATION_TIMEOUT) || 30000 // 30 seconds for demo
};

const ADMIN_USER = process.env.ADMIN_USER || 'Guzal';
const ADMIN_PASS = process.env.ADMIN_PASS || 'guzalm1445';

console.log('\n🚀 NotFrens Backend Starting...');
console.log(`👤 Admin ID: ${ADMIN_TELEGRAM_ID}`);
console.log(`🌐 Domain: ${WEB_APP_URL}`);
console.log(`💰 Owner USDT Wallet: ${USDT_CONFIG.ownerUsdtAddress}`);
console.log(`🔗 Deploy Hook: ${DEPLOY_HOOK_URL ? 'Configured' : 'Missing'}`);

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

// ========================= STORAGE =========================
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

// Level configuration with premium requirement
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
  const user = users.find(u => u.telegramId === userTelegramId);
  const isPremium = user ? user.isPremium : false;
  
  for (let level = 1; level <= 12; level++) {
    const required = LEVEL_CONFIG[level].required;
    const totalReferrals = calculateTotalReferrals(userTelegramId, level);
    const levelCompleted = totalReferrals >= required;
    
    // Premium requirement for progression
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
    },
    environment: envCheck
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
          'Please check environment variables',
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

  // Status command with environment check
  bot.onText(/\/status/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    if (userId == ADMIN_TELEGRAM_ID) {
      const stats = getRealTimeStats();
      
      let envStatus = '✅ All Set';
      if (!stats.environment.allSet) {
        envStatus = `❌ Missing: ${stats.environment.missing.join(', ')}`;
      }
      
      await bot.sendMessage(chatId, 
        `📊 **NotFrens System Status**\n\n` +
        `👥 **Users:** ${stats.users.total}\n` +
        `💎 **Connected Wallets:** ${stats.users.withWallets}\n` +
        `🌟 **Premium Users:** ${stats.users.premium}\n` +
        `💰 **USDT Payments:** ${stats.payments.totalUSDTPayments}\n` +
        `💵 **Total Revenue:** $${stats.payments.totalRevenue}\n` +
        `📈 **Pending Claims:** ${stats.claims.pending}\n` +
        `🔄 **TON Transactions:** ${stats.ton.totalTransactions}\n\n` +
        `
