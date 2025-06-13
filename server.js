const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
require('dotenv').config();

const app = express();

// Environment Variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7583849213:AAHIuBdbO0mXRxunb8qyqI-B8zpjlyDNthw';
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://notfrens.app';
const TON_API_KEY = process.env.TON_API_KEY || 'a449ebf3378f11572f17d64e4ec01f059d6f8f77ee3dafc0f69bc73284384b0f';
const ADMIN_TELEGRAM_ID = parseInt(process.env.ADMIN_TELEGRAM_ID) || 123456789;

console.log('🚀 Starting NotFrens Server...');
console.log('Environment:', {
  NODE_ENV: process.env.NODE_ENV || 'development',
  WEB_APP_URL,
  BOT_USERNAME,
  PORT: process.env.PORT || 3000
});

// Initialize Telegram Bot
let bot = null;
let botError = null;

const initBot = async () => {
  try {
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'your_bot_token_here') {
      bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
      
      // Test bot connection
      const botInfo = await bot.getMe();
      console.log(`✅ Telegram Bot connected: @${botInfo.username}`);
      return true;
    } else {
      console.log('⚠️ No valid bot token provided');
      return false;
    }
  } catch (error) {
    console.error('❌ Bot initialization failed:', error.message);
    botError = error.message;
    bot = null;
    return false;
  }
};

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Serve static files
app.use(express.static('.', { 
  index: false,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Storage (in-memory for demo)
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// Initialize demo data
const initializeDemoData = () => {
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
    
    console.log(`✅ Demo data initialized: ${users.length} users, ${allReferrals.length} referrals`);
  }
};

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

// ========================= TELEGRAM BOT SETUP =========================

const setupTelegramBot = () => {
  if (!bot) return;

  // Bot webhook handler
  app.post('/webhook', (req, res) => {
    try {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      console.error('Webhook error:', error);
      res.sendStatus(500);
    }
  });

  // Set webhook endpoint
  app.get('/set-webhook', async (req, res) => {
    try {
      if (!bot) {
        return res.status(500).json({ 
          success: false, 
          error: 'Bot not initialized' 
        });
      }
      
      const webhookUrl = `${WEB_APP_URL}/webhook`;
      await bot.setWebHook(webhookUrl);
      
      console.log(`✅ Webhook set: ${webhookUrl}`);
      
      res.json({ 
        success: true, 
        message: 'Webhook set successfully',
        webhookUrl 
      });
    } catch (error) {
      console.error('Webhook setup error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // /start command with referral support
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const referralCode = match[1] ? match[1].trim() : null;
    
    console.log(`🚀 User ${userId} (@${username}) started bot with referral: ${referralCode || 'none'}`);
    
    try {
      // Create or get user
      let user = users.find(u => u.telegramId === userId);
      if (!user) {
        user = {
          id: users.length + 1,
          telegramId: userId,
          username: username || `User${userId}`,
          firstName: msg.from.first_name || 'User',
          lastName: msg.from.last_name || '',
          referralCode: userId.toString(),
          referrerTelegramId: null,
          referrerCode: null,
          claimedLevels: {},
          walletAddress: null,
          isPremium: false,
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString()
        };
        users.push(user);
        console.log(`👤 New user created: ${userId}`);
      }
      
      // Handle referral
      if (referralCode && referralCode !== userId.toString()) {
        const cleanCode = referralCode.replace('ref', '');
        const referrerTelegramId = parseInt(cleanCode);
        
        if (!isNaN(referrerTelegramId) && referrerTelegramId !== userId) {
          const referrer = users.find(u => u.telegramId === referrerTelegramId);
          
          if (referrer && !user.referrerTelegramId) {
            // Add referral
            const existingReferral = allReferrals.find(r => 
              r.referralId === userId && r.referrerId === referrerTelegramId
            );
            
            if (!existingReferral) {
              allReferrals.push({
                referrerId: referrerTelegramId,
                referralId: userId,
                position: allReferrals.filter(r => r.referrerId === referrerTelegramId).length + 1,
                isStructural: true,
                timestamp: new Date().toISOString()
              });
              
              user.referrerTelegramId = referrerTelegramId;
              user.referrerCode = cleanCode;
              
              console.log(`🔗 Referral added: ${referrerTelegramId} -> ${userId}`);
              
              // Notify referrer
              try {
                await bot.sendMessage(referrerTelegramId,
                  `🎉 Great news! @${username} joined using your referral link!\n` +
                  `💰 You earned 100 NOTF tokens!\n` +
                  `📱 Open the app to see your progress!`,
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: '🚀 Open NotFrens App', web_app: { url: `${WEB_APP_URL}?user=${referrerTelegramId}` }}]
                      ]
                    }
                  }
                );
              } catch (error) {
                console.log('Could not notify referrer:', error.message);
              }
            }
          }
        }
      }
      
      // Welcome message with Web App button
      const welcomeMessage = 
        `🎉 Welcome to NotFrens, ${username}!\n\n` +
        `🌟 Your Web3 referral journey starts here!\n\n` +
        `💎 What you can do:\n` +
        `• Connect your TON wallet\n` +
        `• Invite friends and earn NOTF tokens\n` +
        `• Buy Premium ($11 USDT) to unlock levels\n` +
        `• Complete 12 levels and claim up to $222,000!\n\n` +
        `🚀 Ready to become a NotFren?\n` +
        `Tap the button below to open the app!`;
      
      const keyboard = {
        inline_keyboard: [
          [{ 
            text: '🚀 Open NotFrens App', 
            web_app: { url: `${WEB_APP_URL}?user=${userId}` }
          }],
          [
            { text: '👥 Get Referral Link', callback_data: 'get_referral' },
            { text: '📊 My Stats', callback_data: 'my_stats' }
          ],
          [{ text: '❓ Help', callback_data: 'help' }]
        ]
      };
      
      await bot.sendMessage(chatId, welcomeMessage, {
        reply_markup: keyboard,
        parse_mode: 'HTML'
      });
      
    } catch (error) {
      console.error('Error in /start:', error);
      await bot.sendMessage(chatId, 
        '❌ Something went wrong. Please try again.\n\n' +
        'If the problem persists, contact support.'
      );
    }
  });
  
  // Handle callback queries
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    try {
      if (data === 'get_referral') {
        const referralLink = `https://t.me/${BOT_USERNAME}?start=ref${userId}`;
        
        await bot.sendMessage(chatId,
          `🔗 Your Personal Referral Link:\n\n` +
          `${referralLink}\n\n` +
          `📱 Share this link with friends!\n` +
          `💰 Earn 100 NOTF tokens per referral\n` +
          `⭐ They need Premium to count for level progression`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📤 Share Link', switch_inline_query: `Join me on NotFrens! ${referralLink}` }],
                [{ text: '🚀 Open App', web_app: { url: `${WEB_APP_URL}?user=${userId}` }}]
              ]
            }
          }
        );
      }
      
      else if (data === 'my_stats') {
        const user = users.find(u => u.telegramId === userId);
        
        if (user) {
          const directReferrals = allReferrals.filter(r => r.referrerId === userId).length;
          const levels = calculateAllLevels(userId);
          const completedLevels = Object.values(levels).filter(l => l.completed).length;
          
          const statsMessage =
            `📊 Your NotFrens Stats:\n\n` +
            `👤 Username: @${user.username}\n` +
            `💰 Tokens: ${directReferrals * 100} NOTF\n` +
            `👥 Direct Referrals: ${directReferrals}\n` +
            `⭐ Premium: ${user.isPremium ? '✅ Active' : '❌ Not Active'}\n` +
            `🏆 Levels Completed: ${completedLevels}/12\n\n` +
            `💎 Next Steps:\n` +
            `${!user.isPremium ? '1. 💳 Buy Premium ($11 USDT)\n' : ''}` +
            `${directReferrals < 3 ? `2. 👥 Invite ${3 - directReferrals} more friends\n` : ''}` +
            `3. 🏆 Complete levels and claim rewards!`;
          
          await bot.sendMessage(chatId, statsMessage, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Open App', web_app: { url: `${WEB_APP_URL}?user=${userId}` }}],
                [{ text: '🔗 Get Referral Link', callback_data: 'get_referral' }]
              ]
            }
          });
        }
      }
      
      await bot.answerCallbackQuery(callbackQuery.id);
      
    } catch (error) {
      console.error('Error in callback:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error occurred' });
    }
  });
};

// ========================= ROUTES =========================

// Main app route
app.get('/', (req, res) => {
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

// Health check - bu eng muhim route
app.get('/api/health', (req, res) => {
  try {
    const healthData = {
      status: 'online',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '3.2.0',
      environment: process.env.NODE_ENV || 'development',
      server: {
        platform: process.platform,
        nodeVersion: process.version,
        memory: process.memoryUsage()
      },
      database: {
        users: users.length,
        claims: claimRequests.length,
        referrals: allReferrals.length,
        payments: usdtPayments.length,
        premiumUsers: premiumUsers.length
      },
      telegram: {
        bot: !!bot,
        botError: botError,
        botUsername: BOT_USERNAME
      },
      features: {
        tonWallet: true,
        usdtPayments: true,
        referralSystem: true,
        premiumLevels: true,
        telegramBot: !!bot
      },
      config: {
        webAppUrl: WEB_APP_URL,
        port: process.env.PORT || 3000
      }
    };
    
    console.log('Health check requested:', {
      timestamp: healthData.timestamp,
      users: healthData.database.users,
      bot: healthData.telegram.bot
    });
    
    res.json(healthData);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
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
    
    console.log(`🔗 Referral added via API: ${referrerTelegramId} -> ${telegramId}`);
    
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
        
        // Notify user via Telegram
        if (bot) {
          try {
            bot.sendMessage(telegramId,
              `🎉 Premium Activated!\n\n` +
              `✅ Your premium subscription is now active!\n` +
              `🔓 Level progression unlocked\n` +
              `💰 You can now claim rewards\n` +
              `🚀 Invite friends to advance through levels\n\n` +
              `📱 Open the app to see your progress!`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🚀 Open App', web_app: { url: `${WEB_APP_URL}?user=${telegramId}` }}],
                    [{ text: '🔗 Get Referral Link', callback_data: 'get_referral' }]
                  ]
                }
              }
            );
          } catch (error) {
            console.error('Error notifying premium activation:', error);
          }
        }
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
      },
      referrals: {
        total: allReferrals.length,
        active: allReferrals.filter(r => r.isStructural).length
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

// Debug endpoint
app.get('/api/debug', (req, res) => {
  try {
    res.json({
      success: true,
      debug: {
        users: users.length,
        claims: claimRequests.length,
        referrals: allReferrals.length,
        payments: usdtPayments.length,
        premium: premiumUsers.length,
        walletConnections: walletConnections.length,
        bot: !!bot,
        botError: botError,
        environment: process.env.NODE_ENV,
        webAppUrl: WEB_APP_URL,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// Catch all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// ========================= SERVER INITIALIZATION =========================

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize demo data
    initializeDemoData();
    
    // Initialize bot
    const botInitialized = await initBot();
    
    // Setup bot handlers if successful
    if (botInitialized) {
      setupTelegramBot();
    }
    
    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 NotFrens Server started successfully!`);
      console.log(`🌐 Port: ${PORT}`);
      console.log(`🔗 URL: ${WEB_APP_URL}`);
      console.log(`🤖 Bot: ${bot ? 'Connected' : 'Disconnected'}`);
      console.log(`📊 Users: ${users.length}`);
      console.log(`💰 Payments: ${usdtPayments.length}`);
      console.log(`🎯 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`⚡ Server ready to handle requests`);
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    return server;
    
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
