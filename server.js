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

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('.', { index: false }));

// Storage
let users = new Map();
let premiumUsers = new Map();
let referralMatrix = new Map(); // userId -> { level, position, referrals: [] }
let claimRequests = [];
let usdtPayments = [];
let userReferralCodes = new Map(); // userId -> unique code

// Generate unique referral code
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Level Configuration for 3x3 Matrix
const LEVEL_CONFIG = {
  1: { required: 3, reward: 30, canClaim: true },     // 3 direct
  2: { required: 9, reward: 90, canClaim: true },     // 3x3 = 9
  3: { required: 27, reward: 270, canClaim: true },   // 3x3x3 = 27
  4: { required: 81, reward: 810, canClaim: true },   // 3^4 = 81
  5: { required: 243, reward: 2430, canClaim: true }, // 3^5 = 243
  6: { required: 729, reward: 7290, canClaim: true }, // 3^6 = 729
  7: { required: 2187, reward: 21870, canClaim: true }, // 3^7 = 2187
  8: { required: 6561, reward: 65610, canClaim: true }, // 3^8 = 6561
  9: { required: 19683, reward: 196830, canClaim: true }, // 3^9 = 19683
  10: { required: 59049, reward: 590490, canClaim: true }, // 3^10 = 59049
  11: { required: 177147, reward: 1771470, canClaim: true }, // 3^11 = 177147
  12: { required: 531441, reward: 5314410, canClaim: true }  // 3^12 = 531441
};

// Calculate referrals at specific level for user
function calculateReferralsAtLevel(userId, targetLevel) {
  let count = 0;
  
  function countAtLevel(currentUserId, currentLevel, target) {
    if (currentLevel > target) return;
    
    const userMatrix = referralMatrix.get(currentUserId);
    if (!userMatrix || !userMatrix.referrals) return;
    
    if (currentLevel === target) {
      count += userMatrix.referrals.length;
      return;
    }
    
    // Recurse to next level
    userMatrix.referrals.forEach(referralId => {
      countAtLevel(referralId, currentLevel + 1, target);
    });
  }
  
  countAtLevel(userId, 1, targetLevel);
  return count;
}

// Calculate total referrals up to level
function calculateTotalReferrals(userId, upToLevel) {
  let total = 0;
  for (let level = 1; level <= upToLevel; level++) {
    total += calculateReferralsAtLevel(userId, level);
  }
  return total;
}

// Calculate user levels and progress
function calculateUserLevels(userId) {
  const levels = {};
  const isPremium = premiumUsers.has(userId);
  
  if (!isPremium) {
    // Non-premium users show all levels as locked
    for (let level = 1; level <= 12; level++) {
      levels[level] = {
        current: 0,
        required: LEVEL_CONFIG[level].required,
        completed: false,
        reward: LEVEL_CONFIG[level].reward,
        canClaim: false,
        locked: true
      };
    }
    return levels;
  }
  
  // Premium users can see their progress
  for (let level = 1; level <= 12; level++) {
    const required = LEVEL_CONFIG[level].required;
    const current = calculateTotalReferrals(userId, level);
    const completed = current >= required;
    
    levels[level] = {
      current,
      required,
      completed,
      reward: LEVEL_CONFIG[level].reward,
      canClaim: completed && LEVEL_CONFIG[level].canClaim,
      locked: false
    };
  }
  
  return levels;
}

// Add referral to matrix
function addReferralToMatrix(referrerId, referralId) {
  // Only premium users can refer others
  if (!premiumUsers.has(referrerId)) {
    return { success: false, error: 'Referrer must be premium' };
  }
  
  // Get or create referrer matrix
  let referrerMatrix = referralMatrix.get(referrerId);
  if (!referrerMatrix) {
    referrerMatrix = { level: 1, position: 1, referrals: [] };
    referralMatrix.set(referrerId, referrerMatrix);
  }
  
  // Check if referrer has space (max 3 direct referrals)
  if (referrerMatrix.referrals.length >= 3) {
    return { success: false, error: 'Referrer has reached maximum referrals (3)' };
  }
  
  // Add referral
  referrerMatrix.referrals.push(referralId);
  
  // Create matrix for new user
  const newUserMatrix = {
    level: referrerMatrix.level + 1,
    position: referrerMatrix.referrals.length,
    referrals: [],
    referrer: referrerId
  };
  referralMatrix.set(referralId, newUserMatrix);
  
  console.log(`🔗 Matrix referral added: ${referrerId} -> ${referralId} (Position: ${newUserMatrix.position})`);
  
  return { success: true, matrix: newUserMatrix };
}

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

  // /start command with referral support
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const referralCode = match[1] ? match[1].trim() : null;
    
    console.log(`🚀 User ${userId} (@${username}) started bot with code: ${referralCode}`);
    
    try {
      // Create or get user
      let user = users.get(userId);
      if (!user) {
        const uniqueCode = generateReferralCode();
        user = {
          telegramId: userId,
          username: username || `User${userId}`,
          firstName: msg.from.first_name || 'User',
          lastName: msg.from.last_name || '',
          referralCode: uniqueCode,
          referredBy: null,
          isPremium: false,
          joinedAt: new Date().toISOString(),
          lastActive: new Date().toISOString()
        };
        
        users.set(userId, user);
        userReferralCodes.set(uniqueCode, userId);
        console.log(`👤 New user created: ${userId} with code: ${uniqueCode}`);
      }
      
      // Handle referral if provided
      if (referralCode && referralCode.startsWith('ref')) {
        const cleanCode = referralCode.replace('ref', '');
        const referrerId = userReferralCodes.get(cleanCode);
        
        if (referrerId && referrerId !== userId && !user.referredBy) {
          const referrer = users.get(referrerId);
          
          if (referrer && premiumUsers.has(referrerId)) {
            // Try to add to matrix
            const result = addReferralToMatrix(referrerId, userId);
            
            if (result.success) {
              user.referredBy = referrerId;
              
              // Notify referrer
              try {
                await bot.sendMessage(referrerId,
                  `🎉 New referral joined your matrix!\n` +
                  `👤 @${username}\n` +
                  `📍 Position: ${result.matrix.position}/3\n` +
                  `📊 Level: ${result.matrix.level}\n\n` +
                  `💎 Your matrix is growing! Check your progress in the app.`,
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [{ text: '🚀 Open NotFrens App', web_app: { url: `${WEB_APP_URL}?user=${referrerId}` }}]
                      ]
                    }
                  }
                );
              } catch (error) {
                console.log('Could not notify referrer:', error.message);
              }
            } else {
              console.log(`❌ Referral failed: ${result.error}`);
            }
          } else {
            console.log(`❌ Referrer ${referrerId} is not premium`);
          }
        }
      }
      
      // Welcome message
      const welcomeMessage = 
        `🎉 Welcome to NotFrens Matrix System!\n\n` +
        `💎 Premium-Only Referral System:\n` +
        `• Buy Premium ($11 USDT) to start referring\n` +
        `• 3x3 Matrix System - Each premium user can refer 3 people\n` +
        `• Complete 12 levels and earn up to $5,314,410!\n` +
        `• Your unique referral code: ${user.referralCode}\n\n` +
        `${user.isPremium ? '✅ You are Premium!' : '❌ Purchase Premium to unlock matrix!'}\n\n` +
        `🚀 Tap below to open the app!`;
      
      const keyboard = {
        inline_keyboard: [
          [{ 
            text: '🚀 Open NotFrens App', 
            web_app: { url: `${WEB_APP_URL}?user=${userId}` }
          }],
          [
            { text: '👥 My Matrix', callback_data: 'my_matrix' },
            { text: '💎 Buy Premium', callback_data: 'buy_premium' }
          ]
        ]
      };
      
      await bot.sendMessage(chatId, welcomeMessage, {
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('Error in /start:', error);
      await bot.sendMessage(chatId, 
        '❌ Something went wrong. Please try again.'
      );
    }
  });
  
  // Handle callback queries
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    try {
      if (data === 'my_matrix') {
        const user = users.get(userId);
        const matrix = referralMatrix.get(userId);
        const isPremium = premiumUsers.has(userId);
        
        let matrixInfo = `📊 Your Matrix Status:\n\n`;
        matrixInfo += `💎 Premium: ${isPremium ? '✅ Active' : '❌ Required'}\n`;
        matrixInfo += `🔑 Your Code: ${user?.referralCode || 'N/A'}\n`;
        
        if (isPremium && matrix) {
          matrixInfo += `📍 Level: ${matrix.level}\n`;
          matrixInfo += `👥 Direct Referrals: ${matrix.referrals.length}/3\n\n`;
          
          if (matrix.referrals.length > 0) {
            matrixInfo += `Your Referrals:\n`;
            for (let i = 0; i < matrix.referrals.length; i++) {
              const refUser = users.get(matrix.referrals[i]);
              matrixInfo += `${i + 1}. @${refUser?.username || 'Unknown'}\n`;
            }
          }
        } else if (!isPremium) {
          matrixInfo += `\n❌ Purchase Premium to start building your matrix!`;
        }
        
        await bot.sendMessage(chatId, matrixInfo, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open App', web_app: { url: `${WEB_APP_URL}?user=${userId}` }}]
            ]
          }
        });
      }
      
      else if (data === 'buy_premium') {
        await bot.sendMessage(chatId,
          `💎 Premium Membership - $11 USDT\n\n` +
          `✅ Benefits:\n` +
          `• Unlock matrix referral system\n` +
          `• Refer up to 3 premium members\n` +
          `• Earn from 12 matrix levels\n` +
          `• Access to claim rewards\n\n` +
          `🚀 Open the app to purchase!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Open App & Buy Premium', web_app: { url: `${WEB_APP_URL}?user=${userId}` }}]
              ]
            }
          }
        );
      }
      
      await bot.answerCallbackQuery(callbackQuery.id);
      
    } catch (error) {
      console.error('Error in callback:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Error occurred' });
    }
  });
}

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
    name: "NotFrens Matrix",
    iconUrl: `${WEB_APP_URL}/icon-192x192.png`
  };
  res.json(manifest);
});

// ========================= API ROUTES =========================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    users: users.size,
    premiumUsers: premiumUsers.size,
    claims: claimRequests.length,
    version: '4.0.0',
    system: 'Premium Matrix 3x3'
  });
});

// Debug endpoint
app.get('/api/debug', (req, res) => {
  res.json({
    success: true,
    users: users.size,
    premiumUsers: premiumUsers.size,
    matrix: referralMatrix.size,
    claims: claimRequests.length,
    payments: usdtPayments.length
  });
});

// Get user data
app.get('/api/telegram-user/:telegramId', (req, res) => {
  try {
    const telegramId = parseInt(req.params.telegramId);
    
    if (!telegramId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Telegram ID' 
      });
    }
    
    // Get or create user
    let user = users.get(telegramId);
    if (!user) {
      const uniqueCode = generateReferralCode();
      user = {
        telegramId,
        username: `User${telegramId}`,
        firstName: 'New',
        lastName: 'User',
        referralCode: uniqueCode,
        referredBy: null,
        isPremium: false,
        joinedAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      users.set(telegramId, user);
      userReferralCodes.set(uniqueCode, telegramId);
    }
    
    // Update last active
    user.lastActive = new Date().toISOString();
    
    // Get matrix info
    const matrix = referralMatrix.get(telegramId);
    const isPremium = premiumUsers.has(telegramId);
    const levels = calculateUserLevels(telegramId);
    
    // Get referrals info
    const directReferrals = matrix ? matrix.referrals.map(refId => {
      const refUser = users.get(refId);
      return {
        telegramId: refId,
        username: refUser?.username || 'Unknown',
        isPremium: premiumUsers.has(refId)
      };
    }) : [];
    
    const userResponse = {
      ...user,
      isPremium,
      matrix: matrix || { level: 0, position: 0, referrals: [] },
      levels,
      directReferrals,
      totalDirectReferrals: directReferrals.length,
      referralLink: `https://t.me/${BOT_USERNAME}?start=ref${user.referralCode}`,
      stats: {
        matrixLevel: matrix?.level || 0,
        totalReferrals: calculateTotalReferrals(telegramId, 12),
        completedLevels: Object.values(levels).filter(l => l.completed).length,
        totalEarningsPotential: Object.values(levels).reduce((sum, l) => sum + l.reward, 0)
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

// USDT payment for premium
app.post('/api/payment/usdt', (req, res) => {
  try {
    const { telegramId, type, hash, from, to, amount, comment, usdtEquivalent } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Telegram ID'
      });
    }
    
    const payment = {
      id: usdtPayments.length + 1,
      telegramId,
      type: type || 'premium_purchase',
      hash,
      from,
      to,
      amount: parseFloat(amount),
      comment,
      usdtEquivalent: parseFloat(usdtEquivalent),
      timestamp: new Date().toISOString(),
      status: 'verified', // Auto-verify for demo
      verifiedAt: new Date().toISOString()
    };
    
    usdtPayments.push(payment);
    
    // Activate premium if payment is $11
    if (parseFloat(usdtEquivalent) === 11) {
      const user = users.get(telegramId);
      if (user) {
        user.isPremium = true;
        premiumUsers.set(telegramId, {
          activatedAt: new Date().toISOString(),
          paymentId: payment.id
        });
        
        console.log(`⭐ Premium activated for user ${telegramId}`);
        
        // Notify user via Telegram
        if (bot) {
          try {
            bot.sendMessage(telegramId,
              `🎉 Premium Activated!\n\n` +
              `✅ You can now build your 3x3 matrix!\n` +
              `🔗 Your referral code: ${user.referralCode}\n` +
              `👥 You can refer up to 3 premium members\n` +
              `💰 Start earning from matrix levels!\n\n` +
              `📱 Open the app to see your matrix!`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '🚀 Open App', web_app: { url: `${WEB_APP_URL}?user=${telegramId}` }}]
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
    
    res.json({
      success: true,
      payment,
      message: 'Premium activated! You can now build your matrix!'
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
    
    if (!telegramId || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid parameters'
      });
    }
    
    const user = users.get(telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user is premium
    if (!premiumUsers.has(telegramId)) {
      return res.status(403).json({
        success: false,
        error: 'Premium required'
      });
    }
    
    // Check level completion
    const levels = calculateUserLevels(telegramId);
    const currentLevel = levels[level];
    
    if (!currentLevel || !currentLevel.completed || !currentLevel.canClaim) {
      return res.status(400).json({
        success: false,
        error: 'Level not completed or already claimed'
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
      processedAt: null
    };
    
    claimRequests.push(claimRequest);
    
    console.log(`💰 New claim request: User ${telegramId}, Level ${level}, Amount $${currentLevel.reward}`);
    
    // Notify admin via Telegram
    if (bot && ADMIN_TELEGRAM_ID) {
      try {
        bot.sendMessage(ADMIN_TELEGRAM_ID,
          `🚨 NEW CLAIM REQUEST!\n\n` +
          `👤 User: ${user.username} (${telegramId})\n` +
          `🏆 Level: ${level}\n` +
          `💰 Amount: $${currentLevel.reward.toLocaleString()}\n` +
          `📅 Time: ${new Date().toLocaleString()}\n\n` +
          `Review in admin panel: ${WEB_APP_URL}/admin`
        );
      } catch (error) {
        console.error('Error notifying admin:', error);
      }
    }
    
    res.json({
      success: true,
      claimRequest,
      message: 'Claim request submitted! Admin will review shortly.'
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
        total: users.size,
        premium: premiumUsers.size,
        free: users.size - premiumUsers.size
      },
      matrix: {
        totalNodes: referralMatrix.size,
        activeMatrixes: referralMatrix.size
      },
      claims: {
        total: claimRequests.length,
        pending: claimRequests.filter(c => c.status === 'pending').length,
        processed: claimRequests.filter(c => c.status === 'processed').length,
        totalAmount: claimRequests.reduce((sum, c) => sum + c.amount, 0)
      },
      payments: {
        total: usdtPayments.length,
        totalRevenue: usdtPayments.reduce((sum, p) => sum + p.usdtEquivalent, 0)
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

// TON wallet connection
app.post('/api/ton/connect', (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    const user = users.get(telegramId);
    if (user) {
      user.walletAddress = walletAddress;
      user.lastActive = new Date().toISOString();
    }
    
    res.json({
      success: true,
      message: 'Wallet connected successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// TON balance check
app.post('/api/ton/balance', async (req, res) => {
  try {
    const mockBalance = (Math.random() * 10).toFixed(3);
    res.json({
      success: true,
      balance: mockBalance,
      address: req.body.address
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check balance'
    });
  }
});

// Add referral endpoint
app.post('/api/add-referral', (req, res) => {
  try {
    const { telegramId, referralCode } = req.body;
    
    if (!telegramId || !referralCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing parameters'
      });
    }
    
    const referrerId = userReferralCodes.get(referralCode);
    
    if (!referrerId) {
      return res.status(404).json({
        success: false,
        error: 'Invalid referral code'
      });
    }
    
    if (referrerId === telegramId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot refer yourself'
      });
    }
    
    // Check if referrer is premium
    if (!premiumUsers.has(referrerId)) {
      return res.status(400).json({
        success: false,
        error: 'Referrer must be premium'
      });
    }
    
    const result = addReferralToMatrix(referrerId, telegramId);
    
    if (result.success) {
      const user = users.get(telegramId);
      if (user) {
        user.referredBy = referrerId;
      }
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error adding referral:', error);
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

// ========================= START SERVER =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NotFrens Matrix Server running on port ${PORT}`);
    console.log(`🌐 URL: ${WEB_APP_URL}`);
    console.log(`🤖 Bot: ${bot ? 'Connected' : 'Disconnected'}`);
    console.log(`💎 Premium Matrix System 3x3`);
    console.log(`📊 Users: ${users.size}, Premium: ${premiumUsers.size}`);
});
