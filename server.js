const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
require('dotenv').config();

const app = express();

// Environment Variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7583849213:AAHIuBdbO0mXRxunb8qyqI-B8zpjlyDNthw';
const BOT_USERNAME = process.env.BOT_USERNAME || 'not_frens_bot';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://notfrens.app';
const TON_API_KEY = process.env.TON_API_KEY || 'a449ebf3378f11572f17d64e4ec01f059d6f8f77ee3dafc0f69bc73284384b0f';
const ADMIN_TELEGRAM_ID = parseInt(process.env.ADMIN_TELEGRAM_ID) || 123456789;

// Initialize Telegram Bot
let bot;
try {
  if (TELEGRAM_BOT_TOKEN && process.env.NODE_ENV !== 'production') {
    // Local development - use polling
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  } else if (TELEGRAM_BOT_TOKEN) {
    // Production - use webhook
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
  }
  console.log('🤖 Telegram Bot initialized');
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

// Storage (same as before)
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// Initialize demo data (same as before)
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
    }
  ];
  
  users.push(...sampleUsers);
  console.log(`✅ Demo data created: ${users.length} users`);
}

// Level configuration (same as before)
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

// ========================= TELEGRAM BOT COMMANDS =========================

if (bot) {
  // /start command with referral support
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const referralCode = match[1] ? match[1].trim() : null;
    
    console.log(`🚀 User ${userId} (@${username}) started bot`);
    
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
        `💎 <b>What you can do:</b>\n` +
        `• Connect your TON wallet\n` +
        `• Invite friends and earn NOTF tokens\n` +
        `• Buy Premium ($11 USDT) to unlock levels\n` +
        `• Complete 12 levels and claim up to $222,000!\n\n` +
        `🚀 <b>Ready to become a NotFren?</b>\n` +
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
          `🔗 <b>Your Personal Referral Link:</b>\n\n` +
          `<code>${referralLink}</code>\n\n` +
          `📱 <b>How to earn:</b>\n` +
          `1. Share your link with friends\n` +
          `2. They join and buy Premium ($11 USDT)\n` +
          `3. You get 100 NOTF tokens per referral\n` +
          `4. Complete levels to claim big rewards!\n\n` +
          `🎯 <b>Level Requirements:</b>\n` +
          `Level 3: 9 referrals → $30\n` +
          `Level 5: 81 referrals → $300\n` +
          `Level 7: 729 referrals → $1,800\n` +
          `Level 9: 6,561 referrals → $20,000\n` +
          `Level 12: 177,147 referrals → $222,000\n\n` +
          `⚠️ <i>All referrals must have Premium for level progression</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📤 Share Link', switch_inline_query: `Join me on NotFrens and earn crypto! ${referralLink}` }],
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
            `📊 <b>Your NotFrens Stats:</b>\n\n` +
            `👤 Username: @${user.username}\n` +
            `💰 Tokens: ${directReferrals * 100} NOTF\n` +
            `👥 Direct Referrals: ${directReferrals}\n` +
            `⭐ Premium: ${user.isPremium ? '✅ Active' : '❌ Not Active'}\n` +
            `🏆 Levels Completed: ${completedLevels}/12\n\n` +
            `💎 <b>Next Steps:</b>\n` +
            `${!user.isPremium ? '1. 💳 Buy Premium ($11 USDT) to unlock levels\n' : ''}` +
            `${directReferrals < 3 ? `2. 👥 Invite ${3 - directReferrals} more friends\n` : ''}` +
            `3. 🏆 Complete levels and claim rewards!\n\n` +
            `🎯 <b>Your Progress:</b>\n` +
            `Level 3: ${levels[3] ? levels[3].current : 0}/9 referrals\n` +
            `Level 5: ${levels[5] ? levels[5].current : 0}/81 referrals\n` +
            `Level 12: ${levels[12] ? levels[12].current : 0}/177,147 referrals`;
          
          await bot.sendMessage(chatId, statsMessage, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Open App', web_app: { url: `${WEB_APP_URL}?user=${userId}` }}],
                [{ text: '🔗 Get Referral Link', callback_data: 'get_referral' }]
              ]
            }
          });
        }
      }
      
      else if (data === 'help') {
        const helpMessage =
          `❓ <b>NotFrens Help</b>\n\n` +
          `<b>🎯 How NotFrens Works:</b>\n` +
          `1. 💎 Buy Premium subscription ($11 USDT)\n` +
          `2. 👥 Invite friends using your referral link\n` +
          `3. 🏆 Complete 12 levels (each needs 3x more referrals)\n` +
          `4. 💰 Claim rewards up to $222,000!\n\n` +
          `<b>🔗 Commands:</b>\n` +
          `/start - Start the bot\n` +
          `/help - Show this help\n` +
          `/stats - Show your statistics\n` +
          `/referral - Get your referral link\n\n` +
          `<b>💰 Reward Levels:</b>\n` +
          `Level 3 (9 refs): $30\n` +
          `Level 5 (81 refs): $300\n` +
          `Level 7 (729 refs): $1,800\n` +
          `Level 9 (6,561 refs): $20,000\n` +
          `Level 12 (177,147 refs): $222,000\n\n` +
          `⚠️ <i>Important: All your referrals must have Premium to count for level progression!</i>\n\n` +
          `🆘 Need support? Contact @YourSupportUsername`;
        
        await bot.sendMessage(chatId, helpMessage, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open App', web_app: { url: `${WEB_APP_URL}?user=${userId}` }}]
            ]
          }
        });
      }
      
      await bot.answerCallbackQuery(callbackQuery.id);
      
    } catch (error) {
      console.error('Error in callback:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error occurred' });
    }
  });
  
  // Simple commands
  bot.onText(/\/help/, (msg) => {
    bot.emit('callback_query', {
      message: { chat: { id: msg.chat.id } },
      from: { id: msg.from.id },
      data: 'help',
      id: 'help_cmd'
    });
  });
  
  bot.onText(/\/stats/, (msg) => {
    bot.emit('callback_query', {
      message: { chat: { id: msg.chat.id } },
      from: { id: msg.from.id },
      data: 'my_stats',
      id: 'stats_cmd'
    });
  });
  
  bot.onText(/\/referral/, (msg) => {
    bot.emit('callback_query', {
      message: { chat: { id: msg.chat.id } },
      from: { id: msg.from.id },
      data: 'get_referral',
      id: 'referral_cmd'
    });
  });
  
  // Error handling
  bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
  });
  
  bot.on('error', (error) => {
    console.error('Bot error:', error);
  });
}

// Utility functions (same as before)
function validateTelegramUserId(userId) {
  return userId && Number.isInteger(userId) && userId > 0;
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

// ========================= API ROUTES (same as before) =========================

// Main app route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    users: users.length,
    claims: claimRequests.length,
    version: '3.1.0',
    bot: bot ? 'connected' : 'disconnected',
    features: {
      tonWallet: true,
      usdtPayments: true,
      referralSystem: true,
      premiumLevels: true,
      telegramBot: !!bot
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

// Add referral (API endpoint)
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

// Webhook endpoint for Telegram
app.post('/webhook', (req, res) => {
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
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
              `🎉 <b>Premium Activated!</b>\n\n` +
              `✅ Your premium subscription is now active!\n` +
              `🔓 Level progression unlocked\n` +
              `💰 You can now claim rewards\n` +
              `🚀 Invite friends to advance through levels\n\n` +
              `📱 Open the app to see your progress!`,
              {
                parse_mode: 'HTML',
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

// Catch all route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// Export for serverless
module.exports.handler = serverless(app);

console.log('🚀 NotFrens Server started with Telegram Bot integration!');
console.log(`🤖 Bot: @${BOT_USERNAME}`);
console.log(`🌐 Web App: ${WEB_APP_URL}`);
// Admin panel route (server.js ga qo'shing)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Admin stats API (allaqachon bor)
app.get('/api/admin/stats', (req, res) => {
  // ... existing code
});
