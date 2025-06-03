message = 
          `🎉 Premium Activated!\n\n` +
          `✅ Your ${payment.usdtEquivalent} USDT payment has been verified!\n` +
          `🌟 Premium features are now active in your account.\n\n` +
          `Thank you for upgrading to NotFrens Premium!`;
      } else if (status === 'rejected') {
        message = 
          `❌ Payment Issue\n\n` +
          `Your USDT payment could not be verified.\n` +
          `${note ? `Reason: ${note}` : ''}\n\n` +
          `Please contact support for assistance.`;
      }
      
      if (message) {
        bot.sendMessage(payment.telegramId, message).catch(err => 
          console.error('Error sending payment verification notification:', err)
        );
      }
    }
    
    res.json({
      success: true,
      payment: payment,
      message: 'Payment verification updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/admin/claims/:id/update', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    
    const claim = claimRequests.find(c => c.id === parseInt(id));
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    
    claim.status = status;
    claim.note = note || '';
    claim.updatedAt = new Date().toISOString();
    
    console.log(`✅ Claim ${id} updated: ${status}`);
    
    if (bot && (status === 'processed' || status === 'rejected')) {
      const message = status === 'processed' 
        ? `✅ Your Level ${claim.level} claim (${claim.amount.toLocaleString()}) has been APPROVED and processed!`
        : `❌ Your Level ${claim.level} claim has been rejected. ${note || 'Please contact support.'}`;
        
      bot.sendMessage(claim.telegramId, message).catch(err => 
        console.error('Error sending claim update notification:', err)
      );
    }
    
    res.json({
      success: true,
      claim: claim,
      message: 'Claim updated successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/premium-users', requireAdmin, (req, res) => {
  try {
    const premiumUsersWithDetails = premiumUsers.map(premium => {
      const user = users.find(u => u.telegramId === premium.telegramId);
      const payment = usdtPayments.find(p => p.id === premium.paymentId);
      
      return {
        ...premium,
        userDetails: user ? {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          referrals: users.filter(u => u.referrerTelegramId === premium.telegramId).length
        } : null,
        paymentDetails: payment ? {
          amount: payment.usdtEquivalent,
          type: payment.type,
          createdAt: payment.createdAt
        } : null
      };
    });
    
    res.json({
      success: true,
      premiumUsers: premiumUsersWithDetails,
      summary: {
        total: premiumUsers.length,
        active: premiumUsers.filter(p => p.active).length,
        totalRevenue: usdtPayments
          .filter(p => p.status === 'verified')
          .reduce((sum, p) => sum + p.usdtEquivalent, 0)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= WEBHOOK ENDPOINTS =========================
app.post('/webhook/payment', (req, res) => {
  try {
    const { txHash, amount, from, to, comment } = req.body;
    
    console.log('💰 Webhook payment notification:', { txHash, amount, from, to, comment });
    
    const matchingPayment = usdtPayments.find(p => 
      p.status === 'pending' && 
      p.comment && 
      comment.includes(p.telegramId.toString())
    );
    
    if (matchingPayment && amount >= matchingPayment.usdtEquivalent) {
      matchingPayment.status = 'verified';
      matchingPayment.verifiedAt = new Date().toISOString();
      matchingPayment.transactionHash = txHash;
      
      premiumUsers.push({
        telegramId: matchingPayment.telegramId,
        username: matchingPayment.username,
        activatedAt: new Date().toISOString(),
        paymentId: matchingPayment.id,
        active: true
      });
      
      const user = users.find(u => u.telegramId === matchingPayment.telegramId);
      if (user) {
        user.isPremium = true;
      }
      
      console.log(`✅ Auto-verified payment: ${matchingPayment.id}`);
      
      if (bot) {
        bot.sendMessage(matchingPayment.telegramId,
          `🎉 Premium Activated!\n\n` +
          `Your ${amount} USDT payment has been automatically verified!\n` +
          `Premium features are now active.`
        );
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false });
  }
});

// ========================= ADMIN PANEL HTML =========================
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>NotFrens - Admin Panel</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .header { background: #333; color: white; padding: 20px; text-align: center; }
            .login-form { background: white; padding: 30px; border-radius: 8px; max-width: 400px; margin: 50px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .dashboard { display: none; }
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
            .stat-card { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
            .table { background: white; border-radius: 8px; overflow: hidden; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .table-header { background: #007bff; color: white; padding: 15px; font-weight: bold; }
            .table-row { padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
            .btn { background: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; margin: 2px; }
            .btn:hover { background: #0056b3; }
            .btn-success { background: #28a745; }
            .btn-danger { background: #dc3545; }
            .btn-warning { background: #ffc107; color: black; }
            input[type="text"], input[type="password"], select { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
            .status-pending { color: #ffc107; font-weight: bold; }
            .status-verified { color: #28a745; font-weight: bold; }
            .status-processed { color: #28a745; font-weight: bold; }
            .status-rejected { color: #dc3545; font-weight: bold; }
            .refresh-btn { position: fixed; bottom: 20px; right: 20px; background: #007bff; color: white; border: none; padding: 15px; border-radius: 50%; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
            .tabs { display: flex; background: white; border-radius: 8px; margin: 20px 0; overflow: hidden; }
            .tab { flex: 1; padding: 15px; text-align: center; cursor: pointer; background: #f8f9fa; border-right: 1px solid #ddd; }
            .tab.active { background: #007bff; color: white; }
            .tab-content { display: none; }
            .tab-content.active { display: block; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🚀 NotFrens Complete Admin Panel</h1>
            <p>Manage Users, Payments, Claims & TON Transactions</p>
        </div>
        
        <div class="container">
            <!-- Login Form -->
            <div id="loginForm" class="login-form">
                <h2>🔐 Admin Login</h2>
                <input type="text" id="username" placeholder="Username" value="Guzal">
                <input type="password" id="password" placeholder="Password">
                <button onclick="login()" class="btn" style="width: 100%; padding: 12px;">Login</button>
                <div id="loginError" style="color: red; margin-top: 10px; display: none;"></div>
            </div>
            
            <!-- Dashboard -->
            <div id="dashboard" class="dashboard">
                <!-- Stats Cards -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-number" id="totalUsers">0</div>
                        <div>Total Users</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="totalClaims">0</div>
                        <div>Total Claims</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="totalPayments">0</div>
                        <div>USDT Payments</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="totalRevenue">$0</div>
                        <div>Total Revenue</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="premiumUsers">0</div>
                        <div>Premium Users</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="tonTransactions">0</div>
                        <div>TON Transactions</div>
                    </div>
                </div>
                
                <!-- Tabs -->
                <div class="tabs">
                    <div class="tab active" onclick="showTab('payments')">💰 USDT Payments</div>
                    <div class="tab" onclick="showTab('claims')">🏆 Claims</div>
                    <div class="tab" onclick="showTab('transactions')">💎 TON Transactions</div>
                    <div class="tab" onclick="showTab('users')">👥 Users</div>
                </div>
                
                <!-- USDT Payments Tab -->
                <div id="paymentsTab" class="tab-content active">
                    <div class="table">
                        <div class="table-header">💰 Pending USDT Payments (Requires Action)</div>
                        <div id="pendingPaymentsTable">Loading...</div>
                    </div>
                    
                    <div class="table">
                        <div class="table-header">💵 All USDT Payments</div>
                        <div id="paymentsTable">Loading...</div>
                    </div>
                </div>
                
                <!-- Claims Tab -->
                <div id="claimsTab" class="tab-content">
                    <div class="table">
                        <div class="table-header">🔄 Pending Claims (Requires Action)</div>
                        <div id="pendingClaimsTable">Loading...</div>
                    </div>
                    
                    <div class="table">
                        <div class="table-header">🏆 All Claims</div>
                        <div id="claimsTable">Loading...</div>
                    </div>
                </div>
                
                <!-- TON Transactions Tab -->
                <div id="transactionsTab" class="tab-content">
                    <div class="table">
                        <div class="table-header">💎 Recent TON Transactions</div>
                        <div id="transactionsTable">Loading...</div>
                    </div>
                </div>
                
                <!-- Users Tab -->
                <div id="usersTab" class="tab-content">
                    <div class="table">
                        <div class="table-header">👥 Recent Users</div>
                        <div id="usersTable">Loading...</div>
                    </div>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <button onclick="loadStats()" class="btn">🔄 Refresh Data</button>
                    <button onclick="logout()" class="btn btn-danger">🚪 Logout</button>
                </div>
            </div>
        </div>
        
        <button onclick="loadStats()" class="refresh-btn" title="Refresh Data">🔄</button>
        
        <script>
            let token = localStorage.getItem('adminToken');
            let activeTab = 'payments';
            
            if (token) {
                showDashboard();
            }
            
            async function login() {
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                
                if (!username || !password) {
                    showError('Please enter username and password');
                    return;
                }
                
                try {
                    const response = await fetch('/admin/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        token = data.token;
                        localStorage.setItem('adminToken', token);
                        showDashboard();
                    } else {
                        showError(data.message);
                    }
                } catch (error) {
                    showError('Network error. Please check your connection.');
                }
            }
            
            function showError(message) {
                const errorDiv = document.getElementById('loginError');
                errorDiv.textContent = message;
                errorDiv.style.display = 'block';
                setTimeout(() => {
                    errorDiv.style.display = 'none';
                }, 3000);
            }
            
            function logout() {
                localStorage.removeItem('adminToken');
                token = null;
                document.getElementById('loginForm').style.display = 'block';
                document.getElementById('dashboard').style.display = 'none';
            }
            
            async function showDashboard() {
                document.getElementById('loginForm').style.display = 'none';
                document.getElementById('dashboard').style.display = 'block';
                await loadStats();
            }
            
            function showTab(tabName) {
                activeTab = tabName;
                
                // Update tab buttons
                document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
                event.target.classList.add('active');
                
                // Update tab content
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                document.getElementById(tabName + 'Tab').classList.add('active');
                
                loadStats();
            }
            
            async function loadStats() {
                try {
                    const [statsResponse, paymentsResponse, claimsResponse, transactionsResponse] = await Promise.all([
                        fetch('/admin/stats', {
                            headers: { 'Authorization': 'Bearer ' + token }
                        }),
                        fetch('/admin/payments', {
                            headers: { 'Authorization': 'Bearer ' + token }
                        }),
                        fetch('/admin/claims', {
                            headers: { 'Authorization': 'Bearer ' + token }
                        }),
                        fetch('/admin/transactions', {
                            headers: { 'Authorization': 'Bearer ' + token }
                        })
                    ]);
                    
                    if (!statsResponse.ok) {
                        logout();
                        return;
                    }
                    
                    const statsData = await statsResponse.json();
                    const paymentsData = await paymentsResponse.json();
                    const claimsData = await claimsResponse.json();
                    const transactionsData = await transactionsResponse.json();
                    
                    const stats = statsData.stats;
                    
                    // Update stats cards
                    document.getElementById('totalUsers').textContent = stats.users.total;
                    document.getElementById('totalClaims').textContent = stats.claims.total;
                    document.getElementById('totalPayments').textContent = stats.payments.totalUSDTPayments;
                    document.getElementById('totalRevenue').textContent = '    users: stats.users.total,
    claims: stats.claims.total,
    cors: 'enabled',
    version: '3.0.0-complete'
  });
});

app.get('/app.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// ========================= TON API ROUTES =========================
app.post('/api/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !validateTonAddress(address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TON address'
      });
    }

    console.log(`💎 Getting balance for: ${address}`);
    
    const result = await getTonBalance(address);
    
    if (result.success) {
      console.log(`✅ Balance: ${result.balance} TON`);
      res.json({
        success: true,
        balance: result.balance,
        address: address
      });
    } else {
      console.log(`❌ Balance fetch failed: ${result.error}`);
      res.status(500).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Balance endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/connect', async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !validateTonAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or wallet address'
      });
    }

    console.log(`🔗 Connecting wallet: User ${telegramId} -> ${walletAddress}`);
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.walletAddress = walletAddress;
    user.lastActive = new Date().toISOString();

    const existingConnection = walletConnections.find(c => 
      c.telegramId === telegramId && c.walletAddress === walletAddress
    );

    if (!existingConnection) {
      walletConnections.push({
        telegramId: telegramId,
        walletAddress: walletAddress,
        connectedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      });
    } else {
      existingConnection.lastUsed = new Date().toISOString();
    }

    console.log(`✅ Wallet connected: ${user.username} -> ${walletAddress}`);

    if (bot) {
      bot.sendMessage(telegramId, 
        `💎 Wallet Connected!\n\n` +
        `Address: \`${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}\`\n` +
        `You can now send/receive TON directly in the app!`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending wallet notification:', err)
      );
    }

    res.json({
      success: true,
      message: 'Wallet connected successfully',
      user: {
        telegramId: user.telegramId,
        username: user.username,
        walletAddress: user.walletAddress
      }
    });

  } catch (error) {
    console.error('❌ Wallet connect error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction', async (req, res) => {
  try {
    const { hash, from, to, amount, comment } = req.body;
    
    if (!hash || !from || !to || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required transaction data'
      });
    }

    console.log(`💰 Recording transaction: ${amount} TON from ${from} to ${to}`);

    const senderUser = users.find(u => u.walletAddress === from);
    
    const transaction = {
      id: tonTransactions.length + 1,
      hash: hash,
      from: from,
      to: to,
      amount: parseFloat(amount),
      comment: comment || '',
      senderTelegramId: senderUser ? senderUser.telegramId : null,
      senderUsername: senderUser ? senderUser.username : null,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    tonTransactions.push(transaction);

    console.log(`✅ Transaction recorded: ${transaction.id}`);

    if (bot && senderUser) {
      bot.sendMessage(senderUser.telegramId, 
        `✅ Transaction Sent!\n\n` +
        `💰 Amount: ${amount} TON\n` +
        `📤 To: \`${to.slice(0, 8)}...${to.slice(-8)}\`\n` +
        `${comment ? `💬 Comment: ${comment}\n` : ''}` +
        `⏱️ Status: Processing...`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending transaction notification:', err)
      );
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        hash: transaction.hash,
        amount: transaction.amount,
        status: transaction.status,
        timestamp: transaction.timestamp
      },
      message: 'Transaction recorded successfully'
    });

  } catch (error) {
    console.error('❌ Transaction record error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction-info', async (req, res) => {
  try {
    const { hash } = req.body;
    
    if (!hash) {
      return res.status(400).json({
        success: false,
        message: 'Transaction hash required'
      });
    }

    console.log(`🔍 Getting transaction info: ${hash}`);
    
    const result = await getTransactionInfo(hash);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Transaction info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/ton/user-transactions/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }

    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === userId
    );

    res.json({
      success: true,
      transactions: userTransactions,
      total: userTransactions.length
    });

  } catch (error) {
    console.error('❌ User transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= USDT PAYMENT ROUTES =========================
app.post('/api/payment/usdt', async (req, res) => {
  try {
    const { 
      telegramId, 
      type, 
      hash, 
      from, 
      amount, 
      comment, 
      usdtEquivalent 
    } = req.body;
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`💰 USDT Payment request: User ${telegramId} - ${type} - ${usdtEquivalent}`);
    
    const paymentRequest = {
      id: usdtPayments.length + 1,
      telegramId: telegramId,
      username: user.username,
      type: type,
      amount: amount,
      usdtEquivalent: usdtEquivalent,
      hash: hash || null,
      fromAddress: from || null,
      comment: comment || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      expectedAddress: type === 'ton_comment' ? USDT_CONFIG.tonReceivingAddress : USDT_CONFIG.usdtReceivingAddress
    };
    
    usdtPayments.push(paymentRequest);
    
    console.log(`✅ USDT Payment recorded: ${paymentRequest.id} - ${user.username}`);
    
    if (bot) {
      const adminMessage = 
        `💰 New USDT Payment Request!\n\n` +
        `👤 User: @${user.username} (${telegramId})\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📝 Type: ${type}\n` +
        `💬 Comment: ${comment}\n` +
        `⏰ Time: ${new Date().toLocaleString()}\n\n` +
        `🔍 Admin Panel: ${WEB_APP_URL}/admin`;
        
      const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || telegramId;
      
      bot.sendMessage(ADMIN_TELEGRAM_ID, adminMessage).catch(err =>
        console.error('Error sending admin notification:', err)
      );
    }
    
    if (bot) {
      const userMessage = type === 'direct_usdt' ?
        `💎 USDT Payment Instructions\n\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📍 Send to: \`${USDT_CONFIG.usdtReceivingAddress}\`\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after payment verification!` :
        
        `💰 TON Payment Received!\n\n` +
        `💎 Amount: ${amount} TON\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after verification!`;
        
      bot.sendMessage(telegramId, userMessage, { parse_mode: 'Markdown' }).catch(err =>
        console.error('Error sending user notification:', err)
      );
    }
    
    res.json({
      success: true,
      payment: {
        id: paymentRequest.id,
        status: paymentRequest.status,
        amount: paymentRequest.usdtEquivalent,
        type: paymentRequest.type,
        createdAt: paymentRequest.createdAt
      },
      message: 'Payment request recorded successfully'
    });
    
  } catch (error) {
    console.error('❌ USDT payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/payment/status/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const userPayments = usdtPayments.filter(p => p.telegramId === userId);
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      payments: userPayments,
      totalPayments: userPayments.length,
      pendingPayments: userPayments.filter(p => p.status === 'pending').length
    });
    
  } catch (error) {
    console.error('❌ Payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/user/:telegramId/premium', (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    const premiumInfo = premiumUsers.find(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      premiumInfo: premiumInfo || null
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
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
    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === user.telegramId
    );
    const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);

    console.log(`✅ User data sent: ${user.username} (${directReferrals.length} referrals, ${userTransactions.length} transactions, ${userPayments.length} payments)`);

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
        walletAddress: user.walletAddress,
        tonTransactions: userTransactions.slice(-10),
        totalTransactions: userTransactions.length,
        usdtPayments: userPayments.slice(-10),
        totalPayments: userPayments.length,
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

app.post('/api/telegram-claim', (req, res) => {
  try {
    const { telegramId, level } = req.body;
    console.log(`💰 Claim request: User ${telegramId} - Level ${level}`);

    if (!validateTelegramUserId(telegramId) || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or level'
      });
    }

    const user = users.find(u => u.telegramId === parseInt(telegramId));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const levels = calculateAllLevels(user.telegramId);
    const currentLevel = levels[level];

    if (!currentLevel.completed) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} not completed. Required: ${currentLevel.required}, Current: ${currentLevel.current}`,
        required: currentLevel.required,
        current: currentLevel.current
      });
    }

    if (currentLevel.reward === 0) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} has no reward`
      });
    }

    if (user.claimedLevels[level]) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} already claimed`
      });
    }

    const claimRequest = {
      id: claimRequests.length + 1,
      telegramId: user.telegramId,
      username: user.username,
      level: level,
      amount: currentLevel.reward,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      referralSnapshot: {
        totalReferrals: currentLevel.current,
        requiredReferrals: currentLevel.required
      }
    };

    claimRequests.push(claimRequest);
    user.claimedLevels[level] = true;

    console.log(`✅ Claim created: ${user.username} - Level ${level} (${currentLevel.reward})`);

    if (bot) {
      bot.sendMessage(user.telegramId, 
        `✅ Claim request submitted!\n\n` +
        `💰 Level ${level}: ${currentLevel.reward.toLocaleString()}\n` +
        `⏱️ Processing: 24-48 hours\n\n` +
        `We'll notify you when processed!`
      ).catch(err => console.error('Error sending claim notification:', err));
    }

    res.json({
      success: true,
      claimRequest: {
        id: claimRequest.id,
        level: claimRequest.level,
        amount: claimRequest.amount,
        status: claimRequest.status,
        requestedAt: claimRequest.requestedAt
      },
      message: `Claim request accepted. Payment of ${currentLevel.reward.toLocaleString()} will be reviewed within 24-48 hours.`
    });

  } catch (error) {
    console.error('❌ Claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/telegram-users', (req, res) => {
  try {
    const publicUsers = users.map(user => {
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === user.telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        telegramId: user.telegramId,
        username: user.username,
        directReferrals: users.filter(u => u.referrerTelegramId === user.telegramId).length,
        joinedAt: user.createdAt,
        isActive: (new Date() - new Date(user.lastActive)) < 24 * 60 * 60 * 1000,
        hasWallet: !!user.walletAddress,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        isPremium: user.isPremium
      };
    });

    res.json({
      success: true,
      users: publicUsers,
      total: users.length,
      stats: getRealTimeStats()
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/claim-requests', (req, res) => {
  try {
    const publicClaims = claimRequests.map(claim => ({
      id: claim.id,
      level: claim.level,
      amount: claim.amount,
      status: claim.status,
      requestedAt: claim.requestedAt,
      username: claim.username
    }));
    
    res.json({
      success: true,
      claimRequests: publicClaims,
      stats: getRealTimeStats().claims
    });

  } catch (error) {
    console.error('❌ Get claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats,
      levelConfig: LEVEL_CONFIG,
      usdtConfig: {
        premiumPrice: USDT_CONFIG.premiumPrice,
        receivingAddress: USDT_CONFIG.usdtReceivingAddress,
        tonReceivingAddress: USDT_CONFIG.tonReceivingAddress
      },
      systemInfo: {
        totalLevels: 12,
        maxUsers: LEVEL_CONFIG[12].required,
        structure: '3^(n-1) referral system',
        telegramBot: BOT_USERNAME,
        rewardLevels: [3, 5, 7, 9, 12],
        webAppUrl: WEB_APP_URL,
        corsEnabled: true,
        tonIntegrated: true,
        tonApiEnabled: !!TON_API_KEY,
        usdtPaymentsEnabled: true,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= ADMIN ROUTES =========================
app.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const sessionToken = crypto.randomUUID();
      adminSessions.add(sessionToken);
      
      setTimeout(() => {
        adminSessions.delete(sessionToken);
      }, 24 * 60 * 60 * 1000);
      
      console.log(`✅ Admin logged in: ${username}`);
      res.json({
        success: true,
        token: sessionToken,
        message: 'Login successful'
      });
    } else {
      console.log(`❌ Failed admin login attempt: ${username}`);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
}

app.get('/admin/stats', requireAdmin, (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        recentUsers: users.slice(-10).map(u => ({
          telegramId: u.telegramId,
          username: u.username,
          referrals: users.filter(ref => ref.referrerTelegramId === u.telegramId).length,
          hasWallet: !!u.walletAddress,
          isPremium: u.isPremium,
          joinedAt: u.createdAt
        })),
        recentClaims: claimRequests.slice(-10),
        recentTransactions: tonTransactions.slice(-10),
        recentPayments: usdtPayments.slice(-10),
        systemHealth: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/users', requireAdmin, (req, res) => {
  try {
    const usersWithStats = users.map(user => {
      const directReferrals = users.filter(u => u.referrerTelegramId === user.telegramId);
      const levels = calculateAllLevels(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => tx.senderTelegramId === user.telegramId);
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        ...user,
        directReferralsCount: directReferrals.length,
        levels: levels,
        claimedRewards: Object.keys(user.claimedLevels || {}).length,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        hasWallet: !!user.walletAddress
      };
    });
    
    res.json({
      success: true,
      users: usersWithStats,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/claims', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      claims: claimRequests,
      summary: {
        total: claimRequests.length,
        pending: claimRequests.filter(c => c.status === 'pending').length,
        processed: claimRequests.filter(c => c.status === 'processed').length,
        rejected: claimRequests.filter(c => c.status === 'rejected').length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/payments', requireAdmin, (req, res) => {
  try {
    const paymentsWithUser = usdtPayments.map(payment => {
      const user = users.find(u => u.telegramId === payment.telegramId);
      return {
        ...payment,
        userInfo: user ? {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        } : null
      };
    });
    
    res.json({
      success: true,
      payments: paymentsWithUser,
      summary: {
        total: usdtPayments.length,
        pending: usdtPayments.filter(p => p.status === 'pending').length,
        verified: usdtPayments.filter(p => p.status === 'verified').length,
        rejected: usdtPayments.filter(p => p.status === 'rejected').length,
        totalUSDT: usdtPayments
          .filter(p => p.status === 'verified')
          .reduce((sum, p) => sum + p.usdtEquivalent, 0)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/transactions', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      transactions: tonTransactions,
      summary: {
        total: tonTransactions.length,
        totalVolume: tonTransactions.reduce((sum, tx) => sum + tx.amount, 0),
        connectedWallets: walletConnections.length,
        uniqueSenders: [...new Set(tonTransactions.map(tx => tx.senderTelegramId))].length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/admin/payments/:id/verify', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, transactionHash } = req.body;
    
    const payment = usdtPayments.find(p => p.id === parseInt(id));
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    payment.status = status;
    payment.note = note || '';
    payment.verifiedAt = new Date().toISOString();
    payment.transactionHash = transactionHash || payment.hash;
    
    console.log(`✅ USDT Payment ${id} updated: ${status}`);
    
    if (status === 'verified') {
      const existingPremium = premiumUsers.find(p => p.telegramId === payment.telegramId);
      
      if (!existingPremium) {
        premiumUsers.push({
          telegramId: payment.telegramId,
          username: payment.username,
          activatedAt: new Date().toISOString(),
          paymentId: payment.id,
          active: true,
          expiresAt: null
        });
      } else {
        existingPremium.active = true;
        existingPremium.activatedAt = new Date().toISOString();
      }
      
      const user = users.find(u => u.telegramId === payment.telegramId);
      if (user) {
        user.isPremium = true;
        user.premiumActivatedAt = new Date().toISOString();
      }
    }
    
    if (bot) {
      let message;
      if (status === 'verified') {
        message = 
          `🎉 Premium Activated!\n\nconst express = require('express');
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
const WEB_APP_URL = process.env.WEB_APP_URL || `http://localhost:${PORT}`;

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
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
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

app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ========================= DATA STORAGE =========================
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// ========================= SAMPLE DATA =========================
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
  iconUrl: `${WEB_APP_URL}/public/icon-192x192.png`,
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

// ========================= TON API FUNCTIONS =========================
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

// ========================= TELEGRAM BOT HANDLERS =========================
if (bot) {
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const referralCode = match[1];
    
    console.log(`🤖 /start with referral: User ${telegramId} (@${username}) referral: ${referralCode}`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `👥 Direct referrals: ${users.filter(u => u.referrerTelegramId === telegramId).length}/3\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n` +
          `📱 Open Web App:`,
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
        
        console.log(`🔗 Referral added: ${referrer.username} -> ${username}`);
      }
      
      console.log(`✅ New user registered: ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      let welcomeMessage = `🎉 Welcome to NotFrens, ${username}!\n\n`;
      
      if (referrer) {
        welcomeMessage += `✅ You joined via ${referrer.username}'s referral!\n\n`;
      }
      
      welcomeMessage += 
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Your referral link:\n\`${referralLink}\`\n\n` +
        `💰 Earn rewards by inviting friends:\n` +
        `• Level 3 (9 referrals): $30\n` +
        `• Level 5 (81 referrals): $300\n` +
        `• Level 7 (729 referrals): $1,800\n` +
        `• Level 9 (6,561 referrals): $20,000\n` +
        `• Level 12 (177,147 referrals): $222,000\n\n` +
        `💎 Connect your TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`;
        
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
        const referrerStats = getAllReferrals(referrer.telegramId);
        await bot.sendMessage(referrer.telegramId, 
          `🎉 New referral joined!\n\n` +
          `👤 ${username} joined via your ID\n` +
          `📊 Your referrals: ${referrerStats.total}`
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
      await bot.sendMessage(chatId, 
        `❌ Sorry, there was an error. Please try again later.`
      );
    }
  });
  
  bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    console.log(`🤖 /start: User ${telegramId} (@${username}) without referral`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        const referralLink = `https://t.me/${BOT_USERNAME}?start=${existingUser.referralCode}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `📤 Share: \`${referralLink}\`\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n`,
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
      
      const newUser = {
        id: users.length + 1,
        telegramId: telegramId,
        username: username,
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        referralCode: telegramId.toString(),
        referrerTelegramId: null,
        referrerCode: null,
        claimedLevels: {},
        walletAddress: null,
        isPremium: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      users.push(newUser);
      
      console.log(`✅ New user (no referral): ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      await bot.sendMessage(chatId, 
        `🎉 Welcome to NotFrens, ${username}!\n\n` +
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Link: \`${referralLink}\`\n\n` +
        `💰 Start earning by sharing your ID!\n` +
        `💎 Connect TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open NotFrens App', web_app: { url: webAppUrl } }],
              [{ text: '📤 Share ID', switch_inline_query: `Join NotFrens! Use my ID: ${telegramId}` }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
    }
  });

  bot.onText(/\/wallet/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      if (user.walletAddress) {
        const userTransactions = tonTransactions.filter(tx => 
          tx.senderTelegramId === telegramId
        );
        
        await bot.sendMessage(chatId, 
          `💎 Your TON Wallet\n\n` +
          `📍 Address: \`${user.walletAddress}\`\n` +
          `📊 Transactions sent: ${userTransactions.length}\n` +
          `🔗 Connect more wallets in the app!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        await bot.sendMessage(chatId, 
          `💎 TON Wallet Not Connected\n\n` +
          `Connect your wallet in the app to:\n` +
          `• Send/receive TON\n` +
          `• Track transactions\n` +
          `• Access DeFi features`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🚀 Connect Wallet', web_app: { url: webAppUrl } }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /wallet error:', error);
    }
  });

  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      const levels = calculateAllLevels(user.telegramId);
      const referralStats = getAllReferrals(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === telegramId);
      
      let statsMessage = `📊 Your NotFrens Stats\n\n`;
      statsMessage += `👤 @${user.username}\n`;
      statsMessage += `🆔 ID: \`${user.telegramId}\`\n`;
      statsMessage += `📊 Referrals: ${referralStats.total}\n`;
      statsMessage += `💎 Wallet: ${user.walletAddress ? '✅ Connected' : '❌ Not connected'}\n`;
      statsMessage += `💰 TON sent: ${userTransactions.length} transactions\n`;
      statsMessage += `🌟 Premium: ${user.isPremium ? '✅ Active' : '❌ Not active'}\n`;
      statsMessage += `💵 USDT payments: ${userPayments.length}\n\n`;
      
      statsMessage += `💰 Reward Levels:\n`;
      [3, 5, 7, 9, 12].forEach(level => {
        const levelData = levels[level];
        const status = levelData.completed ? '✅' : '⏳';
        const reward = levelData.reward > 0 ? `$${levelData.reward.toLocaleString()}` : 'No reward';
        statsMessage += `${status} Level ${level}: ${levelData.current}/${levelData.required} - ${reward}\n`;
      });
      
      await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('❌ Telegram /stats error:', error);
    }
  });
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
    users + stats.payments.totalRevenue.toLocaleString();
                    document.getElementById('premiumUsers').textContent = stats.payments.premiumUsers;
                    document.getElementById('tonTransactions').textContent = stats.ton.totalTransactions;
                    
                    // Load pending payments
                    const pendingPayments = paymentsData.payments.filter(payment => payment.status === 'pending');
                    const pendingPaymentsHtml = pendingPayments.length > 0 ? pendingPayments.map(payment => 
                        '<div class="table-row">' +
                        '<div>' +
                        '<strong>@' + payment.username + '</strong><br>' +
                        '    users: stats.users.total,
    claims: stats.claims.total,
    cors: 'enabled',
    version: '3.0.0-complete'
  });
});

app.get('/app.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// ========================= TON API ROUTES =========================
app.post('/api/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !validateTonAddress(address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TON address'
      });
    }

    console.log(`💎 Getting balance for: ${address}`);
    
    const result = await getTonBalance(address);
    
    if (result.success) {
      console.log(`✅ Balance: ${result.balance} TON`);
      res.json({
        success: true,
        balance: result.balance,
        address: address
      });
    } else {
      console.log(`❌ Balance fetch failed: ${result.error}`);
      res.status(500).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Balance endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/connect', async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !validateTonAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or wallet address'
      });
    }

    console.log(`🔗 Connecting wallet: User ${telegramId} -> ${walletAddress}`);
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.walletAddress = walletAddress;
    user.lastActive = new Date().toISOString();

    const existingConnection = walletConnections.find(c => 
      c.telegramId === telegramId && c.walletAddress === walletAddress
    );

    if (!existingConnection) {
      walletConnections.push({
        telegramId: telegramId,
        walletAddress: walletAddress,
        connectedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      });
    } else {
      existingConnection.lastUsed = new Date().toISOString();
    }

    console.log(`✅ Wallet connected: ${user.username} -> ${walletAddress}`);

    if (bot) {
      bot.sendMessage(telegramId, 
        `💎 Wallet Connected!\n\n` +
        `Address: \`${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}\`\n` +
        `You can now send/receive TON directly in the app!`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending wallet notification:', err)
      );
    }

    res.json({
      success: true,
      message: 'Wallet connected successfully',
      user: {
        telegramId: user.telegramId,
        username: user.username,
        walletAddress: user.walletAddress
      }
    });

  } catch (error) {
    console.error('❌ Wallet connect error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction', async (req, res) => {
  try {
    const { hash, from, to, amount, comment } = req.body;
    
    if (!hash || !from || !to || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required transaction data'
      });
    }

    console.log(`💰 Recording transaction: ${amount} TON from ${from} to ${to}`);

    const senderUser = users.find(u => u.walletAddress === from);
    
    const transaction = {
      id: tonTransactions.length + 1,
      hash: hash,
      from: from,
      to: to,
      amount: parseFloat(amount),
      comment: comment || '',
      senderTelegramId: senderUser ? senderUser.telegramId : null,
      senderUsername: senderUser ? senderUser.username : null,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    tonTransactions.push(transaction);

    console.log(`✅ Transaction recorded: ${transaction.id}`);

    if (bot && senderUser) {
      bot.sendMessage(senderUser.telegramId, 
        `✅ Transaction Sent!\n\n` +
        `💰 Amount: ${amount} TON\n` +
        `📤 To: \`${to.slice(0, 8)}...${to.slice(-8)}\`\n` +
        `${comment ? `💬 Comment: ${comment}\n` : ''}` +
        `⏱️ Status: Processing...`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending transaction notification:', err)
      );
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        hash: transaction.hash,
        amount: transaction.amount,
        status: transaction.status,
        timestamp: transaction.timestamp
      },
      message: 'Transaction recorded successfully'
    });

  } catch (error) {
    console.error('❌ Transaction record error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction-info', async (req, res) => {
  try {
    const { hash } = req.body;
    
    if (!hash) {
      return res.status(400).json({
        success: false,
        message: 'Transaction hash required'
      });
    }

    console.log(`🔍 Getting transaction info: ${hash}`);
    
    const result = await getTransactionInfo(hash);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Transaction info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/ton/user-transactions/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }

    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === userId
    );

    res.json({
      success: true,
      transactions: userTransactions,
      total: userTransactions.length
    });

  } catch (error) {
    console.error('❌ User transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= USDT PAYMENT ROUTES =========================
app.post('/api/payment/usdt', async (req, res) => {
  try {
    const { 
      telegramId, 
      type, 
      hash, 
      from, 
      amount, 
      comment, 
      usdtEquivalent 
    } = req.body;
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`💰 USDT Payment request: User ${telegramId} - ${type} - ${usdtEquivalent}`);
    
    const paymentRequest = {
      id: usdtPayments.length + 1,
      telegramId: telegramId,
      username: user.username,
      type: type,
      amount: amount,
      usdtEquivalent: usdtEquivalent,
      hash: hash || null,
      fromAddress: from || null,
      comment: comment || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      expectedAddress: type === 'ton_comment' ? USDT_CONFIG.tonReceivingAddress : USDT_CONFIG.usdtReceivingAddress
    };
    
    usdtPayments.push(paymentRequest);
    
    console.log(`✅ USDT Payment recorded: ${paymentRequest.id} - ${user.username}`);
    
    if (bot) {
      const adminMessage = 
        `💰 New USDT Payment Request!\n\n` +
        `👤 User: @${user.username} (${telegramId})\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📝 Type: ${type}\n` +
        `💬 Comment: ${comment}\n` +
        `⏰ Time: ${new Date().toLocaleString()}\n\n` +
        `🔍 Admin Panel: ${WEB_APP_URL}/admin`;
        
      const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || telegramId;
      
      bot.sendMessage(ADMIN_TELEGRAM_ID, adminMessage).catch(err =>
        console.error('Error sending admin notification:', err)
      );
    }
    
    if (bot) {
      const userMessage = type === 'direct_usdt' ?
        `💎 USDT Payment Instructions\n\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📍 Send to: \`${USDT_CONFIG.usdtReceivingAddress}\`\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after payment verification!` :
        
        `💰 TON Payment Received!\n\n` +
        `💎 Amount: ${amount} TON\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after verification!`;
        
      bot.sendMessage(telegramId, userMessage, { parse_mode: 'Markdown' }).catch(err =>
        console.error('Error sending user notification:', err)
      );
    }
    
    res.json({
      success: true,
      payment: {
        id: paymentRequest.id,
        status: paymentRequest.status,
        amount: paymentRequest.usdtEquivalent,
        type: paymentRequest.type,
        createdAt: paymentRequest.createdAt
      },
      message: 'Payment request recorded successfully'
    });
    
  } catch (error) {
    console.error('❌ USDT payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/payment/status/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const userPayments = usdtPayments.filter(p => p.telegramId === userId);
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      payments: userPayments,
      totalPayments: userPayments.length,
      pendingPayments: userPayments.filter(p => p.status === 'pending').length
    });
    
  } catch (error) {
    console.error('❌ Payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/user/:telegramId/premium', (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    const premiumInfo = premiumUsers.find(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      premiumInfo: premiumInfo || null
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
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
    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === user.telegramId
    );
    const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);

    console.log(`✅ User data sent: ${user.username} (${directReferrals.length} referrals, ${userTransactions.length} transactions, ${userPayments.length} payments)`);

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
        walletAddress: user.walletAddress,
        tonTransactions: userTransactions.slice(-10),
        totalTransactions: userTransactions.length,
        usdtPayments: userPayments.slice(-10),
        totalPayments: userPayments.length,
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

app.post('/api/telegram-claim', (req, res) => {
  try {
    const { telegramId, level } = req.body;
    console.log(`💰 Claim request: User ${telegramId} - Level ${level}`);

    if (!validateTelegramUserId(telegramId) || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or level'
      });
    }

    const user = users.find(u => u.telegramId === parseInt(telegramId));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const levels = calculateAllLevels(user.telegramId);
    const currentLevel = levels[level];

    if (!currentLevel.completed) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} not completed. Required: ${currentLevel.required}, Current: ${currentLevel.current}`,
        required: currentLevel.required,
        current: currentLevel.current
      });
    }

    if (currentLevel.reward === 0) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} has no reward`
      });
    }

    if (user.claimedLevels[level]) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} already claimed`
      });
    }

    const claimRequest = {
      id: claimRequests.length + 1,
      telegramId: user.telegramId,
      username: user.username,
      level: level,
      amount: currentLevel.reward,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      referralSnapshot: {
        totalReferrals: currentLevel.current,
        requiredReferrals: currentLevel.required
      }
    };

    claimRequests.push(claimRequest);
    user.claimedLevels[level] = true;

    console.log(`✅ Claim created: ${user.username} - Level ${level} (${currentLevel.reward})`);

    if (bot) {
      bot.sendMessage(user.telegramId, 
        `✅ Claim request submitted!\n\n` +
        `💰 Level ${level}: ${currentLevel.reward.toLocaleString()}\n` +
        `⏱️ Processing: 24-48 hours\n\n` +
        `We'll notify you when processed!`
      ).catch(err => console.error('Error sending claim notification:', err));
    }

    res.json({
      success: true,
      claimRequest: {
        id: claimRequest.id,
        level: claimRequest.level,
        amount: claimRequest.amount,
        status: claimRequest.status,
        requestedAt: claimRequest.requestedAt
      },
      message: `Claim request accepted. Payment of ${currentLevel.reward.toLocaleString()} will be reviewed within 24-48 hours.`
    });

  } catch (error) {
    console.error('❌ Claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/telegram-users', (req, res) => {
  try {
    const publicUsers = users.map(user => {
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === user.telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        telegramId: user.telegramId,
        username: user.username,
        directReferrals: users.filter(u => u.referrerTelegramId === user.telegramId).length,
        joinedAt: user.createdAt,
        isActive: (new Date() - new Date(user.lastActive)) < 24 * 60 * 60 * 1000,
        hasWallet: !!user.walletAddress,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        isPremium: user.isPremium
      };
    });

    res.json({
      success: true,
      users: publicUsers,
      total: users.length,
      stats: getRealTimeStats()
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/claim-requests', (req, res) => {
  try {
    const publicClaims = claimRequests.map(claim => ({
      id: claim.id,
      level: claim.level,
      amount: claim.amount,
      status: claim.status,
      requestedAt: claim.requestedAt,
      username: claim.username
    }));
    
    res.json({
      success: true,
      claimRequests: publicClaims,
      stats: getRealTimeStats().claims
    });

  } catch (error) {
    console.error('❌ Get claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats,
      levelConfig: LEVEL_CONFIG,
      usdtConfig: {
        premiumPrice: USDT_CONFIG.premiumPrice,
        receivingAddress: USDT_CONFIG.usdtReceivingAddress,
        tonReceivingAddress: USDT_CONFIG.tonReceivingAddress
      },
      systemInfo: {
        totalLevels: 12,
        maxUsers: LEVEL_CONFIG[12].required,
        structure: '3^(n-1) referral system',
        telegramBot: BOT_USERNAME,
        rewardLevels: [3, 5, 7, 9, 12],
        webAppUrl: WEB_APP_URL,
        corsEnabled: true,
        tonIntegrated: true,
        tonApiEnabled: !!TON_API_KEY,
        usdtPaymentsEnabled: true,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= ADMIN ROUTES =========================
app.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const sessionToken = crypto.randomUUID();
      adminSessions.add(sessionToken);
      
      setTimeout(() => {
        adminSessions.delete(sessionToken);
      }, 24 * 60 * 60 * 1000);
      
      console.log(`✅ Admin logged in: ${username}`);
      res.json({
        success: true,
        token: sessionToken,
        message: 'Login successful'
      });
    } else {
      console.log(`❌ Failed admin login attempt: ${username}`);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
}

app.get('/admin/stats', requireAdmin, (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        recentUsers: users.slice(-10).map(u => ({
          telegramId: u.telegramId,
          username: u.username,
          referrals: users.filter(ref => ref.referrerTelegramId === u.telegramId).length,
          hasWallet: !!u.walletAddress,
          isPremium: u.isPremium,
          joinedAt: u.createdAt
        })),
        recentClaims: claimRequests.slice(-10),
        recentTransactions: tonTransactions.slice(-10),
        recentPayments: usdtPayments.slice(-10),
        systemHealth: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/users', requireAdmin, (req, res) => {
  try {
    const usersWithStats = users.map(user => {
      const directReferrals = users.filter(u => u.referrerTelegramId === user.telegramId);
      const levels = calculateAllLevels(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => tx.senderTelegramId === user.telegramId);
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        ...user,
        directReferralsCount: directReferrals.length,
        levels: levels,
        claimedRewards: Object.keys(user.claimedLevels || {}).length,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        hasWallet: !!user.walletAddress
      };
    });
    
    res.json({
      success: true,
      users: usersWithStats,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/claims', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      claims: claimRequests,
      summary: {
        total: claimRequests.length,
        pending: claimRequests.filter(c => c.status === 'pending').length,
        processed: claimRequests.filter(c => c.status === 'processed').length,
        rejected: claimRequests.filter(c => c.status === 'rejected').length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/payments', requireAdmin, (req, res) => {
  try {
    const paymentsWithUser = usdtPayments.map(payment => {
      const user = users.find(u => u.telegramId === payment.telegramId);
      return {
        ...payment,
        userInfo: user ? {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        } : null
      };
    });
    
    res.json({
      success: true,
      payments: paymentsWithUser,
      summary: {
        total: usdtPayments.length,
        pending: usdtPayments.filter(p => p.status === 'pending').length,
        verified: usdtPayments.filter(p => p.status === 'verified').length,
        rejected: usdtPayments.filter(p => p.status === 'rejected').length,
        totalUSDT: usdtPayments
          .filter(p => p.status === 'verified')
          .reduce((sum, p) => sum + p.usdtEquivalent, 0)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/transactions', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      transactions: tonTransactions,
      summary: {
        total: tonTransactions.length,
        totalVolume: tonTransactions.reduce((sum, tx) => sum + tx.amount, 0),
        connectedWallets: walletConnections.length,
        uniqueSenders: [...new Set(tonTransactions.map(tx => tx.senderTelegramId))].length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/admin/payments/:id/verify', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, transactionHash } = req.body;
    
    const payment = usdtPayments.find(p => p.id === parseInt(id));
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    payment.status = status;
    payment.note = note || '';
    payment.verifiedAt = new Date().toISOString();
    payment.transactionHash = transactionHash || payment.hash;
    
    console.log(`✅ USDT Payment ${id} updated: ${status}`);
    
    if (status === 'verified') {
      const existingPremium = premiumUsers.find(p => p.telegramId === payment.telegramId);
      
      if (!existingPremium) {
        premiumUsers.push({
          telegramId: payment.telegramId,
          username: payment.username,
          activatedAt: new Date().toISOString(),
          paymentId: payment.id,
          active: true,
          expiresAt: null
        });
      } else {
        existingPremium.active = true;
        existingPremium.activatedAt = new Date().toISOString();
      }
      
      const user = users.find(u => u.telegramId === payment.telegramId);
      if (user) {
        user.isPremium = true;
        user.premiumActivatedAt = new Date().toISOString();
      }
    }
    
    if (bot) {
      let message;
      if (status === 'verified') {
        message = 
          `🎉 Premium Activated!\n\nconst express = require('express');
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
const WEB_APP_URL = process.env.WEB_APP_URL || `http://localhost:${PORT}`;

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
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
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

app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ========================= DATA STORAGE =========================
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// ========================= SAMPLE DATA =========================
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
  iconUrl: `${WEB_APP_URL}/public/icon-192x192.png`,
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

// ========================= TON API FUNCTIONS =========================
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

// ========================= TELEGRAM BOT HANDLERS =========================
if (bot) {
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const referralCode = match[1];
    
    console.log(`🤖 /start with referral: User ${telegramId} (@${username}) referral: ${referralCode}`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `👥 Direct referrals: ${users.filter(u => u.referrerTelegramId === telegramId).length}/3\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n` +
          `📱 Open Web App:`,
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
        
        console.log(`🔗 Referral added: ${referrer.username} -> ${username}`);
      }
      
      console.log(`✅ New user registered: ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      let welcomeMessage = `🎉 Welcome to NotFrens, ${username}!\n\n`;
      
      if (referrer) {
        welcomeMessage += `✅ You joined via ${referrer.username}'s referral!\n\n`;
      }
      
      welcomeMessage += 
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Your referral link:\n\`${referralLink}\`\n\n` +
        `💰 Earn rewards by inviting friends:\n` +
        `• Level 3 (9 referrals): $30\n` +
        `• Level 5 (81 referrals): $300\n` +
        `• Level 7 (729 referrals): $1,800\n` +
        `• Level 9 (6,561 referrals): $20,000\n` +
        `• Level 12 (177,147 referrals): $222,000\n\n` +
        `💎 Connect your TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`;
        
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
        const referrerStats = getAllReferrals(referrer.telegramId);
        await bot.sendMessage(referrer.telegramId, 
          `🎉 New referral joined!\n\n` +
          `👤 ${username} joined via your ID\n` +
          `📊 Your referrals: ${referrerStats.total}`
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
      await bot.sendMessage(chatId, 
        `❌ Sorry, there was an error. Please try again later.`
      );
    }
  });
  
  bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    console.log(`🤖 /start: User ${telegramId} (@${username}) without referral`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        const referralLink = `https://t.me/${BOT_USERNAME}?start=${existingUser.referralCode}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `📤 Share: \`${referralLink}\`\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n`,
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
      
      const newUser = {
        id: users.length + 1,
        telegramId: telegramId,
        username: username,
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        referralCode: telegramId.toString(),
        referrerTelegramId: null,
        referrerCode: null,
        claimedLevels: {},
        walletAddress: null,
        isPremium: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      users.push(newUser);
      
      console.log(`✅ New user (no referral): ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      await bot.sendMessage(chatId, 
        `🎉 Welcome to NotFrens, ${username}!\n\n` +
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Link: \`${referralLink}\`\n\n` +
        `💰 Start earning by sharing your ID!\n` +
        `💎 Connect TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open NotFrens App', web_app: { url: webAppUrl } }],
              [{ text: '📤 Share ID', switch_inline_query: `Join NotFrens! Use my ID: ${telegramId}` }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
    }
  });

  bot.onText(/\/wallet/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      if (user.walletAddress) {
        const userTransactions = tonTransactions.filter(tx => 
          tx.senderTelegramId === telegramId
        );
        
        await bot.sendMessage(chatId, 
          `💎 Your TON Wallet\n\n` +
          `📍 Address: \`${user.walletAddress}\`\n` +
          `📊 Transactions sent: ${userTransactions.length}\n` +
          `🔗 Connect more wallets in the app!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        await bot.sendMessage(chatId, 
          `💎 TON Wallet Not Connected\n\n` +
          `Connect your wallet in the app to:\n` +
          `• Send/receive TON\n` +
          `• Track transactions\n` +
          `• Access DeFi features`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🚀 Connect Wallet', web_app: { url: webAppUrl } }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /wallet error:', error);
    }
  });

  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      const levels = calculateAllLevels(user.telegramId);
      const referralStats = getAllReferrals(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === telegramId);
      
      let statsMessage = `📊 Your NotFrens Stats\n\n`;
      statsMessage += `👤 @${user.username}\n`;
      statsMessage += `🆔 ID: \`${user.telegramId}\`\n`;
      statsMessage += `📊 Referrals: ${referralStats.total}\n`;
      statsMessage += `💎 Wallet: ${user.walletAddress ? '✅ Connected' : '❌ Not connected'}\n`;
      statsMessage += `💰 TON sent: ${userTransactions.length} transactions\n`;
      statsMessage += `🌟 Premium: ${user.isPremium ? '✅ Active' : '❌ Not active'}\n`;
      statsMessage += `💵 USDT payments: ${userPayments.length}\n\n`;
      
      statsMessage += `💰 Reward Levels:\n`;
      [3, 5, 7, 9, 12].forEach(level => {
        const levelData = levels[level];
        const status = levelData.completed ? '✅' : '⏳';
        const reward = levelData.reward > 0 ? `$${levelData.reward.toLocaleString()}` : 'No reward';
        statsMessage += `${status} Level ${level}: ${levelData.current}/${levelData.required} - ${reward}\n`;
      });
      
      await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('❌ Telegram /stats error:', error);
    }
  });
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
    users + payment.usdtEquivalent + ' USDT - ' + payment.type + '<br>' +
                        '<small>' + new Date(payment.createdAt).toLocaleString() + '</small>' +
                        '</div>' +
                        '<div>' +
                        '<button class="btn btn-success" onclick="updatePayment(' + payment.id + ', \\'verified\\')">✅ Verify</button>' +
                        '<button class="btn btn-danger" onclick="updatePayment(' + payment.id + ', \\'rejected\\')">❌ Reject</button>' +
                        '</div>' +
                        '</div>'
                    ).join('') : '<div class="table-row"><div>No pending payments</div></div>';
                    document.getElementById('pendingPaymentsTable').innerHTML = pendingPaymentsHtml;
                    
                    // Load all payments
                    const paymentsHtml = paymentsData.payments.slice(-20).reverse().map(payment => 
                        '<div class="table-row">' +
                        '<div>' +
                        '<strong>@' + payment.username + '</strong> -     users: stats.users.total,
    claims: stats.claims.total,
    cors: 'enabled',
    version: '3.0.0-complete'
  });
});

app.get('/app.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// ========================= TON API ROUTES =========================
app.post('/api/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !validateTonAddress(address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TON address'
      });
    }

    console.log(`💎 Getting balance for: ${address}`);
    
    const result = await getTonBalance(address);
    
    if (result.success) {
      console.log(`✅ Balance: ${result.balance} TON`);
      res.json({
        success: true,
        balance: result.balance,
        address: address
      });
    } else {
      console.log(`❌ Balance fetch failed: ${result.error}`);
      res.status(500).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Balance endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/connect', async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !validateTonAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or wallet address'
      });
    }

    console.log(`🔗 Connecting wallet: User ${telegramId} -> ${walletAddress}`);
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.walletAddress = walletAddress;
    user.lastActive = new Date().toISOString();

    const existingConnection = walletConnections.find(c => 
      c.telegramId === telegramId && c.walletAddress === walletAddress
    );

    if (!existingConnection) {
      walletConnections.push({
        telegramId: telegramId,
        walletAddress: walletAddress,
        connectedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      });
    } else {
      existingConnection.lastUsed = new Date().toISOString();
    }

    console.log(`✅ Wallet connected: ${user.username} -> ${walletAddress}`);

    if (bot) {
      bot.sendMessage(telegramId, 
        `💎 Wallet Connected!\n\n` +
        `Address: \`${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}\`\n` +
        `You can now send/receive TON directly in the app!`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending wallet notification:', err)
      );
    }

    res.json({
      success: true,
      message: 'Wallet connected successfully',
      user: {
        telegramId: user.telegramId,
        username: user.username,
        walletAddress: user.walletAddress
      }
    });

  } catch (error) {
    console.error('❌ Wallet connect error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction', async (req, res) => {
  try {
    const { hash, from, to, amount, comment } = req.body;
    
    if (!hash || !from || !to || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required transaction data'
      });
    }

    console.log(`💰 Recording transaction: ${amount} TON from ${from} to ${to}`);

    const senderUser = users.find(u => u.walletAddress === from);
    
    const transaction = {
      id: tonTransactions.length + 1,
      hash: hash,
      from: from,
      to: to,
      amount: parseFloat(amount),
      comment: comment || '',
      senderTelegramId: senderUser ? senderUser.telegramId : null,
      senderUsername: senderUser ? senderUser.username : null,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    tonTransactions.push(transaction);

    console.log(`✅ Transaction recorded: ${transaction.id}`);

    if (bot && senderUser) {
      bot.sendMessage(senderUser.telegramId, 
        `✅ Transaction Sent!\n\n` +
        `💰 Amount: ${amount} TON\n` +
        `📤 To: \`${to.slice(0, 8)}...${to.slice(-8)}\`\n` +
        `${comment ? `💬 Comment: ${comment}\n` : ''}` +
        `⏱️ Status: Processing...`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending transaction notification:', err)
      );
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        hash: transaction.hash,
        amount: transaction.amount,
        status: transaction.status,
        timestamp: transaction.timestamp
      },
      message: 'Transaction recorded successfully'
    });

  } catch (error) {
    console.error('❌ Transaction record error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction-info', async (req, res) => {
  try {
    const { hash } = req.body;
    
    if (!hash) {
      return res.status(400).json({
        success: false,
        message: 'Transaction hash required'
      });
    }

    console.log(`🔍 Getting transaction info: ${hash}`);
    
    const result = await getTransactionInfo(hash);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Transaction info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/ton/user-transactions/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }

    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === userId
    );

    res.json({
      success: true,
      transactions: userTransactions,
      total: userTransactions.length
    });

  } catch (error) {
    console.error('❌ User transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= USDT PAYMENT ROUTES =========================
app.post('/api/payment/usdt', async (req, res) => {
  try {
    const { 
      telegramId, 
      type, 
      hash, 
      from, 
      amount, 
      comment, 
      usdtEquivalent 
    } = req.body;
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`💰 USDT Payment request: User ${telegramId} - ${type} - ${usdtEquivalent}`);
    
    const paymentRequest = {
      id: usdtPayments.length + 1,
      telegramId: telegramId,
      username: user.username,
      type: type,
      amount: amount,
      usdtEquivalent: usdtEquivalent,
      hash: hash || null,
      fromAddress: from || null,
      comment: comment || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      expectedAddress: type === 'ton_comment' ? USDT_CONFIG.tonReceivingAddress : USDT_CONFIG.usdtReceivingAddress
    };
    
    usdtPayments.push(paymentRequest);
    
    console.log(`✅ USDT Payment recorded: ${paymentRequest.id} - ${user.username}`);
    
    if (bot) {
      const adminMessage = 
        `💰 New USDT Payment Request!\n\n` +
        `👤 User: @${user.username} (${telegramId})\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📝 Type: ${type}\n` +
        `💬 Comment: ${comment}\n` +
        `⏰ Time: ${new Date().toLocaleString()}\n\n` +
        `🔍 Admin Panel: ${WEB_APP_URL}/admin`;
        
      const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || telegramId;
      
      bot.sendMessage(ADMIN_TELEGRAM_ID, adminMessage).catch(err =>
        console.error('Error sending admin notification:', err)
      );
    }
    
    if (bot) {
      const userMessage = type === 'direct_usdt' ?
        `💎 USDT Payment Instructions\n\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📍 Send to: \`${USDT_CONFIG.usdtReceivingAddress}\`\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after payment verification!` :
        
        `💰 TON Payment Received!\n\n` +
        `💎 Amount: ${amount} TON\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after verification!`;
        
      bot.sendMessage(telegramId, userMessage, { parse_mode: 'Markdown' }).catch(err =>
        console.error('Error sending user notification:', err)
      );
    }
    
    res.json({
      success: true,
      payment: {
        id: paymentRequest.id,
        status: paymentRequest.status,
        amount: paymentRequest.usdtEquivalent,
        type: paymentRequest.type,
        createdAt: paymentRequest.createdAt
      },
      message: 'Payment request recorded successfully'
    });
    
  } catch (error) {
    console.error('❌ USDT payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/payment/status/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const userPayments = usdtPayments.filter(p => p.telegramId === userId);
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      payments: userPayments,
      totalPayments: userPayments.length,
      pendingPayments: userPayments.filter(p => p.status === 'pending').length
    });
    
  } catch (error) {
    console.error('❌ Payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/user/:telegramId/premium', (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    const premiumInfo = premiumUsers.find(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      premiumInfo: premiumInfo || null
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
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
    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === user.telegramId
    );
    const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);

    console.log(`✅ User data sent: ${user.username} (${directReferrals.length} referrals, ${userTransactions.length} transactions, ${userPayments.length} payments)`);

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
        walletAddress: user.walletAddress,
        tonTransactions: userTransactions.slice(-10),
        totalTransactions: userTransactions.length,
        usdtPayments: userPayments.slice(-10),
        totalPayments: userPayments.length,
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

app.post('/api/telegram-claim', (req, res) => {
  try {
    const { telegramId, level } = req.body;
    console.log(`💰 Claim request: User ${telegramId} - Level ${level}`);

    if (!validateTelegramUserId(telegramId) || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or level'
      });
    }

    const user = users.find(u => u.telegramId === parseInt(telegramId));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const levels = calculateAllLevels(user.telegramId);
    const currentLevel = levels[level];

    if (!currentLevel.completed) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} not completed. Required: ${currentLevel.required}, Current: ${currentLevel.current}`,
        required: currentLevel.required,
        current: currentLevel.current
      });
    }

    if (currentLevel.reward === 0) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} has no reward`
      });
    }

    if (user.claimedLevels[level]) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} already claimed`
      });
    }

    const claimRequest = {
      id: claimRequests.length + 1,
      telegramId: user.telegramId,
      username: user.username,
      level: level,
      amount: currentLevel.reward,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      referralSnapshot: {
        totalReferrals: currentLevel.current,
        requiredReferrals: currentLevel.required
      }
    };

    claimRequests.push(claimRequest);
    user.claimedLevels[level] = true;

    console.log(`✅ Claim created: ${user.username} - Level ${level} (${currentLevel.reward})`);

    if (bot) {
      bot.sendMessage(user.telegramId, 
        `✅ Claim request submitted!\n\n` +
        `💰 Level ${level}: ${currentLevel.reward.toLocaleString()}\n` +
        `⏱️ Processing: 24-48 hours\n\n` +
        `We'll notify you when processed!`
      ).catch(err => console.error('Error sending claim notification:', err));
    }

    res.json({
      success: true,
      claimRequest: {
        id: claimRequest.id,
        level: claimRequest.level,
        amount: claimRequest.amount,
        status: claimRequest.status,
        requestedAt: claimRequest.requestedAt
      },
      message: `Claim request accepted. Payment of ${currentLevel.reward.toLocaleString()} will be reviewed within 24-48 hours.`
    });

  } catch (error) {
    console.error('❌ Claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/telegram-users', (req, res) => {
  try {
    const publicUsers = users.map(user => {
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === user.telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        telegramId: user.telegramId,
        username: user.username,
        directReferrals: users.filter(u => u.referrerTelegramId === user.telegramId).length,
        joinedAt: user.createdAt,
        isActive: (new Date() - new Date(user.lastActive)) < 24 * 60 * 60 * 1000,
        hasWallet: !!user.walletAddress,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        isPremium: user.isPremium
      };
    });

    res.json({
      success: true,
      users: publicUsers,
      total: users.length,
      stats: getRealTimeStats()
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/claim-requests', (req, res) => {
  try {
    const publicClaims = claimRequests.map(claim => ({
      id: claim.id,
      level: claim.level,
      amount: claim.amount,
      status: claim.status,
      requestedAt: claim.requestedAt,
      username: claim.username
    }));
    
    res.json({
      success: true,
      claimRequests: publicClaims,
      stats: getRealTimeStats().claims
    });

  } catch (error) {
    console.error('❌ Get claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats,
      levelConfig: LEVEL_CONFIG,
      usdtConfig: {
        premiumPrice: USDT_CONFIG.premiumPrice,
        receivingAddress: USDT_CONFIG.usdtReceivingAddress,
        tonReceivingAddress: USDT_CONFIG.tonReceivingAddress
      },
      systemInfo: {
        totalLevels: 12,
        maxUsers: LEVEL_CONFIG[12].required,
        structure: '3^(n-1) referral system',
        telegramBot: BOT_USERNAME,
        rewardLevels: [3, 5, 7, 9, 12],
        webAppUrl: WEB_APP_URL,
        corsEnabled: true,
        tonIntegrated: true,
        tonApiEnabled: !!TON_API_KEY,
        usdtPaymentsEnabled: true,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= ADMIN ROUTES =========================
app.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const sessionToken = crypto.randomUUID();
      adminSessions.add(sessionToken);
      
      setTimeout(() => {
        adminSessions.delete(sessionToken);
      }, 24 * 60 * 60 * 1000);
      
      console.log(`✅ Admin logged in: ${username}`);
      res.json({
        success: true,
        token: sessionToken,
        message: 'Login successful'
      });
    } else {
      console.log(`❌ Failed admin login attempt: ${username}`);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
}

app.get('/admin/stats', requireAdmin, (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        recentUsers: users.slice(-10).map(u => ({
          telegramId: u.telegramId,
          username: u.username,
          referrals: users.filter(ref => ref.referrerTelegramId === u.telegramId).length,
          hasWallet: !!u.walletAddress,
          isPremium: u.isPremium,
          joinedAt: u.createdAt
        })),
        recentClaims: claimRequests.slice(-10),
        recentTransactions: tonTransactions.slice(-10),
        recentPayments: usdtPayments.slice(-10),
        systemHealth: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/users', requireAdmin, (req, res) => {
  try {
    const usersWithStats = users.map(user => {
      const directReferrals = users.filter(u => u.referrerTelegramId === user.telegramId);
      const levels = calculateAllLevels(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => tx.senderTelegramId === user.telegramId);
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        ...user,
        directReferralsCount: directReferrals.length,
        levels: levels,
        claimedRewards: Object.keys(user.claimedLevels || {}).length,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        hasWallet: !!user.walletAddress
      };
    });
    
    res.json({
      success: true,
      users: usersWithStats,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/claims', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      claims: claimRequests,
      summary: {
        total: claimRequests.length,
        pending: claimRequests.filter(c => c.status === 'pending').length,
        processed: claimRequests.filter(c => c.status === 'processed').length,
        rejected: claimRequests.filter(c => c.status === 'rejected').length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/payments', requireAdmin, (req, res) => {
  try {
    const paymentsWithUser = usdtPayments.map(payment => {
      const user = users.find(u => u.telegramId === payment.telegramId);
      return {
        ...payment,
        userInfo: user ? {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        } : null
      };
    });
    
    res.json({
      success: true,
      payments: paymentsWithUser,
      summary: {
        total: usdtPayments.length,
        pending: usdtPayments.filter(p => p.status === 'pending').length,
        verified: usdtPayments.filter(p => p.status === 'verified').length,
        rejected: usdtPayments.filter(p => p.status === 'rejected').length,
        totalUSDT: usdtPayments
          .filter(p => p.status === 'verified')
          .reduce((sum, p) => sum + p.usdtEquivalent, 0)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/transactions', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      transactions: tonTransactions,
      summary: {
        total: tonTransactions.length,
        totalVolume: tonTransactions.reduce((sum, tx) => sum + tx.amount, 0),
        connectedWallets: walletConnections.length,
        uniqueSenders: [...new Set(tonTransactions.map(tx => tx.senderTelegramId))].length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/admin/payments/:id/verify', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, transactionHash } = req.body;
    
    const payment = usdtPayments.find(p => p.id === parseInt(id));
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    payment.status = status;
    payment.note = note || '';
    payment.verifiedAt = new Date().toISOString();
    payment.transactionHash = transactionHash || payment.hash;
    
    console.log(`✅ USDT Payment ${id} updated: ${status}`);
    
    if (status === 'verified') {
      const existingPremium = premiumUsers.find(p => p.telegramId === payment.telegramId);
      
      if (!existingPremium) {
        premiumUsers.push({
          telegramId: payment.telegramId,
          username: payment.username,
          activatedAt: new Date().toISOString(),
          paymentId: payment.id,
          active: true,
          expiresAt: null
        });
      } else {
        existingPremium.active = true;
        existingPremium.activatedAt = new Date().toISOString();
      }
      
      const user = users.find(u => u.telegramId === payment.telegramId);
      if (user) {
        user.isPremium = true;
        user.premiumActivatedAt = new Date().toISOString();
      }
    }
    
    if (bot) {
      let message;
      if (status === 'verified') {
        message = 
          `🎉 Premium Activated!\n\nconst express = require('express');
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
const WEB_APP_URL = process.env.WEB_APP_URL || `http://localhost:${PORT}`;

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
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
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

app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ========================= DATA STORAGE =========================
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// ========================= SAMPLE DATA =========================
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
  iconUrl: `${WEB_APP_URL}/public/icon-192x192.png`,
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

// ========================= TON API FUNCTIONS =========================
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

// ========================= TELEGRAM BOT HANDLERS =========================
if (bot) {
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const referralCode = match[1];
    
    console.log(`🤖 /start with referral: User ${telegramId} (@${username}) referral: ${referralCode}`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `👥 Direct referrals: ${users.filter(u => u.referrerTelegramId === telegramId).length}/3\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n` +
          `📱 Open Web App:`,
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
        
        console.log(`🔗 Referral added: ${referrer.username} -> ${username}`);
      }
      
      console.log(`✅ New user registered: ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      let welcomeMessage = `🎉 Welcome to NotFrens, ${username}!\n\n`;
      
      if (referrer) {
        welcomeMessage += `✅ You joined via ${referrer.username}'s referral!\n\n`;
      }
      
      welcomeMessage += 
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Your referral link:\n\`${referralLink}\`\n\n` +
        `💰 Earn rewards by inviting friends:\n` +
        `• Level 3 (9 referrals): $30\n` +
        `• Level 5 (81 referrals): $300\n` +
        `• Level 7 (729 referrals): $1,800\n` +
        `• Level 9 (6,561 referrals): $20,000\n` +
        `• Level 12 (177,147 referrals): $222,000\n\n` +
        `💎 Connect your TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`;
        
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
        const referrerStats = getAllReferrals(referrer.telegramId);
        await bot.sendMessage(referrer.telegramId, 
          `🎉 New referral joined!\n\n` +
          `👤 ${username} joined via your ID\n` +
          `📊 Your referrals: ${referrerStats.total}`
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
      await bot.sendMessage(chatId, 
        `❌ Sorry, there was an error. Please try again later.`
      );
    }
  });
  
  bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    console.log(`🤖 /start: User ${telegramId} (@${username}) without referral`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        const referralLink = `https://t.me/${BOT_USERNAME}?start=${existingUser.referralCode}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `📤 Share: \`${referralLink}\`\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n`,
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
      
      const newUser = {
        id: users.length + 1,
        telegramId: telegramId,
        username: username,
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        referralCode: telegramId.toString(),
        referrerTelegramId: null,
        referrerCode: null,
        claimedLevels: {},
        walletAddress: null,
        isPremium: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      users.push(newUser);
      
      console.log(`✅ New user (no referral): ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      await bot.sendMessage(chatId, 
        `🎉 Welcome to NotFrens, ${username}!\n\n` +
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Link: \`${referralLink}\`\n\n` +
        `💰 Start earning by sharing your ID!\n` +
        `💎 Connect TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open NotFrens App', web_app: { url: webAppUrl } }],
              [{ text: '📤 Share ID', switch_inline_query: `Join NotFrens! Use my ID: ${telegramId}` }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
    }
  });

  bot.onText(/\/wallet/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      if (user.walletAddress) {
        const userTransactions = tonTransactions.filter(tx => 
          tx.senderTelegramId === telegramId
        );
        
        await bot.sendMessage(chatId, 
          `💎 Your TON Wallet\n\n` +
          `📍 Address: \`${user.walletAddress}\`\n` +
          `📊 Transactions sent: ${userTransactions.length}\n` +
          `🔗 Connect more wallets in the app!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        await bot.sendMessage(chatId, 
          `💎 TON Wallet Not Connected\n\n` +
          `Connect your wallet in the app to:\n` +
          `• Send/receive TON\n` +
          `• Track transactions\n` +
          `• Access DeFi features`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🚀 Connect Wallet', web_app: { url: webAppUrl } }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /wallet error:', error);
    }
  });

  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      const levels = calculateAllLevels(user.telegramId);
      const referralStats = getAllReferrals(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === telegramId);
      
      let statsMessage = `📊 Your NotFrens Stats\n\n`;
      statsMessage += `👤 @${user.username}\n`;
      statsMessage += `🆔 ID: \`${user.telegramId}\`\n`;
      statsMessage += `📊 Referrals: ${referralStats.total}\n`;
      statsMessage += `💎 Wallet: ${user.walletAddress ? '✅ Connected' : '❌ Not connected'}\n`;
      statsMessage += `💰 TON sent: ${userTransactions.length} transactions\n`;
      statsMessage += `🌟 Premium: ${user.isPremium ? '✅ Active' : '❌ Not active'}\n`;
      statsMessage += `💵 USDT payments: ${userPayments.length}\n\n`;
      
      statsMessage += `💰 Reward Levels:\n`;
      [3, 5, 7, 9, 12].forEach(level => {
        const levelData = levels[level];
        const status = levelData.completed ? '✅' : '⏳';
        const reward = levelData.reward > 0 ? `$${levelData.reward.toLocaleString()}` : 'No reward';
        statsMessage += `${status} Level ${level}: ${levelData.current}/${levelData.required} - ${reward}\n`;
      });
      
      await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('❌ Telegram /stats error:', error);
    }
  });
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
    users + payment.usdtEquivalent + ' USDT<br>' +
                        '<small>' + payment.type + ' - ' + new Date(payment.createdAt).toLocaleString() + '</small>' +
                        '</div>' +
                        '<span class="status-' + payment.status + '">' + payment.status.toUpperCase() + '</span>' +
                        '</div>'
                    ).join('');
                    document.getElementById('paymentsTable').innerHTML = paymentsHtml;
                    
                    // Load pending claims
                    const pendingClaims = claimsData.claims.filter(claim => claim.status === 'pending');
                    const pendingClaimsHtml = pendingClaims.length > 0 ? pendingClaims.map(claim => 
                        '<div class="table-row">' +
                        '<div>' +
                        '<strong>@' + claim.username + '</strong><br>' +
                        'Level ' + claim.level + ' -     users: stats.users.total,
    claims: stats.claims.total,
    cors: 'enabled',
    version: '3.0.0-complete'
  });
});

app.get('/app.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// ========================= TON API ROUTES =========================
app.post('/api/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !validateTonAddress(address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TON address'
      });
    }

    console.log(`💎 Getting balance for: ${address}`);
    
    const result = await getTonBalance(address);
    
    if (result.success) {
      console.log(`✅ Balance: ${result.balance} TON`);
      res.json({
        success: true,
        balance: result.balance,
        address: address
      });
    } else {
      console.log(`❌ Balance fetch failed: ${result.error}`);
      res.status(500).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Balance endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/connect', async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !validateTonAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or wallet address'
      });
    }

    console.log(`🔗 Connecting wallet: User ${telegramId} -> ${walletAddress}`);
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.walletAddress = walletAddress;
    user.lastActive = new Date().toISOString();

    const existingConnection = walletConnections.find(c => 
      c.telegramId === telegramId && c.walletAddress === walletAddress
    );

    if (!existingConnection) {
      walletConnections.push({
        telegramId: telegramId,
        walletAddress: walletAddress,
        connectedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      });
    } else {
      existingConnection.lastUsed = new Date().toISOString();
    }

    console.log(`✅ Wallet connected: ${user.username} -> ${walletAddress}`);

    if (bot) {
      bot.sendMessage(telegramId, 
        `💎 Wallet Connected!\n\n` +
        `Address: \`${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}\`\n` +
        `You can now send/receive TON directly in the app!`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending wallet notification:', err)
      );
    }

    res.json({
      success: true,
      message: 'Wallet connected successfully',
      user: {
        telegramId: user.telegramId,
        username: user.username,
        walletAddress: user.walletAddress
      }
    });

  } catch (error) {
    console.error('❌ Wallet connect error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction', async (req, res) => {
  try {
    const { hash, from, to, amount, comment } = req.body;
    
    if (!hash || !from || !to || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required transaction data'
      });
    }

    console.log(`💰 Recording transaction: ${amount} TON from ${from} to ${to}`);

    const senderUser = users.find(u => u.walletAddress === from);
    
    const transaction = {
      id: tonTransactions.length + 1,
      hash: hash,
      from: from,
      to: to,
      amount: parseFloat(amount),
      comment: comment || '',
      senderTelegramId: senderUser ? senderUser.telegramId : null,
      senderUsername: senderUser ? senderUser.username : null,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    tonTransactions.push(transaction);

    console.log(`✅ Transaction recorded: ${transaction.id}`);

    if (bot && senderUser) {
      bot.sendMessage(senderUser.telegramId, 
        `✅ Transaction Sent!\n\n` +
        `💰 Amount: ${amount} TON\n` +
        `📤 To: \`${to.slice(0, 8)}...${to.slice(-8)}\`\n` +
        `${comment ? `💬 Comment: ${comment}\n` : ''}` +
        `⏱️ Status: Processing...`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending transaction notification:', err)
      );
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        hash: transaction.hash,
        amount: transaction.amount,
        status: transaction.status,
        timestamp: transaction.timestamp
      },
      message: 'Transaction recorded successfully'
    });

  } catch (error) {
    console.error('❌ Transaction record error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction-info', async (req, res) => {
  try {
    const { hash } = req.body;
    
    if (!hash) {
      return res.status(400).json({
        success: false,
        message: 'Transaction hash required'
      });
    }

    console.log(`🔍 Getting transaction info: ${hash}`);
    
    const result = await getTransactionInfo(hash);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Transaction info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/ton/user-transactions/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }

    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === userId
    );

    res.json({
      success: true,
      transactions: userTransactions,
      total: userTransactions.length
    });

  } catch (error) {
    console.error('❌ User transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= USDT PAYMENT ROUTES =========================
app.post('/api/payment/usdt', async (req, res) => {
  try {
    const { 
      telegramId, 
      type, 
      hash, 
      from, 
      amount, 
      comment, 
      usdtEquivalent 
    } = req.body;
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`💰 USDT Payment request: User ${telegramId} - ${type} - ${usdtEquivalent}`);
    
    const paymentRequest = {
      id: usdtPayments.length + 1,
      telegramId: telegramId,
      username: user.username,
      type: type,
      amount: amount,
      usdtEquivalent: usdtEquivalent,
      hash: hash || null,
      fromAddress: from || null,
      comment: comment || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      expectedAddress: type === 'ton_comment' ? USDT_CONFIG.tonReceivingAddress : USDT_CONFIG.usdtReceivingAddress
    };
    
    usdtPayments.push(paymentRequest);
    
    console.log(`✅ USDT Payment recorded: ${paymentRequest.id} - ${user.username}`);
    
    if (bot) {
      const adminMessage = 
        `💰 New USDT Payment Request!\n\n` +
        `👤 User: @${user.username} (${telegramId})\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📝 Type: ${type}\n` +
        `💬 Comment: ${comment}\n` +
        `⏰ Time: ${new Date().toLocaleString()}\n\n` +
        `🔍 Admin Panel: ${WEB_APP_URL}/admin`;
        
      const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || telegramId;
      
      bot.sendMessage(ADMIN_TELEGRAM_ID, adminMessage).catch(err =>
        console.error('Error sending admin notification:', err)
      );
    }
    
    if (bot) {
      const userMessage = type === 'direct_usdt' ?
        `💎 USDT Payment Instructions\n\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📍 Send to: \`${USDT_CONFIG.usdtReceivingAddress}\`\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after payment verification!` :
        
        `💰 TON Payment Received!\n\n` +
        `💎 Amount: ${amount} TON\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after verification!`;
        
      bot.sendMessage(telegramId, userMessage, { parse_mode: 'Markdown' }).catch(err =>
        console.error('Error sending user notification:', err)
      );
    }
    
    res.json({
      success: true,
      payment: {
        id: paymentRequest.id,
        status: paymentRequest.status,
        amount: paymentRequest.usdtEquivalent,
        type: paymentRequest.type,
        createdAt: paymentRequest.createdAt
      },
      message: 'Payment request recorded successfully'
    });
    
  } catch (error) {
    console.error('❌ USDT payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/payment/status/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const userPayments = usdtPayments.filter(p => p.telegramId === userId);
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      payments: userPayments,
      totalPayments: userPayments.length,
      pendingPayments: userPayments.filter(p => p.status === 'pending').length
    });
    
  } catch (error) {
    console.error('❌ Payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/user/:telegramId/premium', (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    const premiumInfo = premiumUsers.find(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      premiumInfo: premiumInfo || null
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
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
    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === user.telegramId
    );
    const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);

    console.log(`✅ User data sent: ${user.username} (${directReferrals.length} referrals, ${userTransactions.length} transactions, ${userPayments.length} payments)`);

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
        walletAddress: user.walletAddress,
        tonTransactions: userTransactions.slice(-10),
        totalTransactions: userTransactions.length,
        usdtPayments: userPayments.slice(-10),
        totalPayments: userPayments.length,
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

app.post('/api/telegram-claim', (req, res) => {
  try {
    const { telegramId, level } = req.body;
    console.log(`💰 Claim request: User ${telegramId} - Level ${level}`);

    if (!validateTelegramUserId(telegramId) || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or level'
      });
    }

    const user = users.find(u => u.telegramId === parseInt(telegramId));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const levels = calculateAllLevels(user.telegramId);
    const currentLevel = levels[level];

    if (!currentLevel.completed) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} not completed. Required: ${currentLevel.required}, Current: ${currentLevel.current}`,
        required: currentLevel.required,
        current: currentLevel.current
      });
    }

    if (currentLevel.reward === 0) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} has no reward`
      });
    }

    if (user.claimedLevels[level]) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} already claimed`
      });
    }

    const claimRequest = {
      id: claimRequests.length + 1,
      telegramId: user.telegramId,
      username: user.username,
      level: level,
      amount: currentLevel.reward,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      referralSnapshot: {
        totalReferrals: currentLevel.current,
        requiredReferrals: currentLevel.required
      }
    };

    claimRequests.push(claimRequest);
    user.claimedLevels[level] = true;

    console.log(`✅ Claim created: ${user.username} - Level ${level} (${currentLevel.reward})`);

    if (bot) {
      bot.sendMessage(user.telegramId, 
        `✅ Claim request submitted!\n\n` +
        `💰 Level ${level}: ${currentLevel.reward.toLocaleString()}\n` +
        `⏱️ Processing: 24-48 hours\n\n` +
        `We'll notify you when processed!`
      ).catch(err => console.error('Error sending claim notification:', err));
    }

    res.json({
      success: true,
      claimRequest: {
        id: claimRequest.id,
        level: claimRequest.level,
        amount: claimRequest.amount,
        status: claimRequest.status,
        requestedAt: claimRequest.requestedAt
      },
      message: `Claim request accepted. Payment of ${currentLevel.reward.toLocaleString()} will be reviewed within 24-48 hours.`
    });

  } catch (error) {
    console.error('❌ Claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/telegram-users', (req, res) => {
  try {
    const publicUsers = users.map(user => {
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === user.telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        telegramId: user.telegramId,
        username: user.username,
        directReferrals: users.filter(u => u.referrerTelegramId === user.telegramId).length,
        joinedAt: user.createdAt,
        isActive: (new Date() - new Date(user.lastActive)) < 24 * 60 * 60 * 1000,
        hasWallet: !!user.walletAddress,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        isPremium: user.isPremium
      };
    });

    res.json({
      success: true,
      users: publicUsers,
      total: users.length,
      stats: getRealTimeStats()
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/claim-requests', (req, res) => {
  try {
    const publicClaims = claimRequests.map(claim => ({
      id: claim.id,
      level: claim.level,
      amount: claim.amount,
      status: claim.status,
      requestedAt: claim.requestedAt,
      username: claim.username
    }));
    
    res.json({
      success: true,
      claimRequests: publicClaims,
      stats: getRealTimeStats().claims
    });

  } catch (error) {
    console.error('❌ Get claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats,
      levelConfig: LEVEL_CONFIG,
      usdtConfig: {
        premiumPrice: USDT_CONFIG.premiumPrice,
        receivingAddress: USDT_CONFIG.usdtReceivingAddress,
        tonReceivingAddress: USDT_CONFIG.tonReceivingAddress
      },
      systemInfo: {
        totalLevels: 12,
        maxUsers: LEVEL_CONFIG[12].required,
        structure: '3^(n-1) referral system',
        telegramBot: BOT_USERNAME,
        rewardLevels: [3, 5, 7, 9, 12],
        webAppUrl: WEB_APP_URL,
        corsEnabled: true,
        tonIntegrated: true,
        tonApiEnabled: !!TON_API_KEY,
        usdtPaymentsEnabled: true,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= ADMIN ROUTES =========================
app.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const sessionToken = crypto.randomUUID();
      adminSessions.add(sessionToken);
      
      setTimeout(() => {
        adminSessions.delete(sessionToken);
      }, 24 * 60 * 60 * 1000);
      
      console.log(`✅ Admin logged in: ${username}`);
      res.json({
        success: true,
        token: sessionToken,
        message: 'Login successful'
      });
    } else {
      console.log(`❌ Failed admin login attempt: ${username}`);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
}

app.get('/admin/stats', requireAdmin, (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        recentUsers: users.slice(-10).map(u => ({
          telegramId: u.telegramId,
          username: u.username,
          referrals: users.filter(ref => ref.referrerTelegramId === u.telegramId).length,
          hasWallet: !!u.walletAddress,
          isPremium: u.isPremium,
          joinedAt: u.createdAt
        })),
        recentClaims: claimRequests.slice(-10),
        recentTransactions: tonTransactions.slice(-10),
        recentPayments: usdtPayments.slice(-10),
        systemHealth: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/users', requireAdmin, (req, res) => {
  try {
    const usersWithStats = users.map(user => {
      const directReferrals = users.filter(u => u.referrerTelegramId === user.telegramId);
      const levels = calculateAllLevels(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => tx.senderTelegramId === user.telegramId);
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        ...user,
        directReferralsCount: directReferrals.length,
        levels: levels,
        claimedRewards: Object.keys(user.claimedLevels || {}).length,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        hasWallet: !!user.walletAddress
      };
    });
    
    res.json({
      success: true,
      users: usersWithStats,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/claims', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      claims: claimRequests,
      summary: {
        total: claimRequests.length,
        pending: claimRequests.filter(c => c.status === 'pending').length,
        processed: claimRequests.filter(c => c.status === 'processed').length,
        rejected: claimRequests.filter(c => c.status === 'rejected').length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/payments', requireAdmin, (req, res) => {
  try {
    const paymentsWithUser = usdtPayments.map(payment => {
      const user = users.find(u => u.telegramId === payment.telegramId);
      return {
        ...payment,
        userInfo: user ? {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        } : null
      };
    });
    
    res.json({
      success: true,
      payments: paymentsWithUser,
      summary: {
        total: usdtPayments.length,
        pending: usdtPayments.filter(p => p.status === 'pending').length,
        verified: usdtPayments.filter(p => p.status === 'verified').length,
        rejected: usdtPayments.filter(p => p.status === 'rejected').length,
        totalUSDT: usdtPayments
          .filter(p => p.status === 'verified')
          .reduce((sum, p) => sum + p.usdtEquivalent, 0)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/transactions', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      transactions: tonTransactions,
      summary: {
        total: tonTransactions.length,
        totalVolume: tonTransactions.reduce((sum, tx) => sum + tx.amount, 0),
        connectedWallets: walletConnections.length,
        uniqueSenders: [...new Set(tonTransactions.map(tx => tx.senderTelegramId))].length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/admin/payments/:id/verify', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, transactionHash } = req.body;
    
    const payment = usdtPayments.find(p => p.id === parseInt(id));
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    payment.status = status;
    payment.note = note || '';
    payment.verifiedAt = new Date().toISOString();
    payment.transactionHash = transactionHash || payment.hash;
    
    console.log(`✅ USDT Payment ${id} updated: ${status}`);
    
    if (status === 'verified') {
      const existingPremium = premiumUsers.find(p => p.telegramId === payment.telegramId);
      
      if (!existingPremium) {
        premiumUsers.push({
          telegramId: payment.telegramId,
          username: payment.username,
          activatedAt: new Date().toISOString(),
          paymentId: payment.id,
          active: true,
          expiresAt: null
        });
      } else {
        existingPremium.active = true;
        existingPremium.activatedAt = new Date().toISOString();
      }
      
      const user = users.find(u => u.telegramId === payment.telegramId);
      if (user) {
        user.isPremium = true;
        user.premiumActivatedAt = new Date().toISOString();
      }
    }
    
    if (bot) {
      let message;
      if (status === 'verified') {
        message = 
          `🎉 Premium Activated!\n\nconst express = require('express');
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
const WEB_APP_URL = process.env.WEB_APP_URL || `http://localhost:${PORT}`;

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
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
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

app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ========================= DATA STORAGE =========================
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// ========================= SAMPLE DATA =========================
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
  iconUrl: `${WEB_APP_URL}/public/icon-192x192.png`,
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

// ========================= TON API FUNCTIONS =========================
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

// ========================= TELEGRAM BOT HANDLERS =========================
if (bot) {
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const referralCode = match[1];
    
    console.log(`🤖 /start with referral: User ${telegramId} (@${username}) referral: ${referralCode}`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `👥 Direct referrals: ${users.filter(u => u.referrerTelegramId === telegramId).length}/3\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n` +
          `📱 Open Web App:`,
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
        
        console.log(`🔗 Referral added: ${referrer.username} -> ${username}`);
      }
      
      console.log(`✅ New user registered: ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      let welcomeMessage = `🎉 Welcome to NotFrens, ${username}!\n\n`;
      
      if (referrer) {
        welcomeMessage += `✅ You joined via ${referrer.username}'s referral!\n\n`;
      }
      
      welcomeMessage += 
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Your referral link:\n\`${referralLink}\`\n\n` +
        `💰 Earn rewards by inviting friends:\n` +
        `• Level 3 (9 referrals): $30\n` +
        `• Level 5 (81 referrals): $300\n` +
        `• Level 7 (729 referrals): $1,800\n` +
        `• Level 9 (6,561 referrals): $20,000\n` +
        `• Level 12 (177,147 referrals): $222,000\n\n` +
        `💎 Connect your TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`;
        
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
        const referrerStats = getAllReferrals(referrer.telegramId);
        await bot.sendMessage(referrer.telegramId, 
          `🎉 New referral joined!\n\n` +
          `👤 ${username} joined via your ID\n` +
          `📊 Your referrals: ${referrerStats.total}`
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
      await bot.sendMessage(chatId, 
        `❌ Sorry, there was an error. Please try again later.`
      );
    }
  });
  
  bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    console.log(`🤖 /start: User ${telegramId} (@${username}) without referral`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        const referralLink = `https://t.me/${BOT_USERNAME}?start=${existingUser.referralCode}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `📤 Share: \`${referralLink}\`\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n`,
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
      
      const newUser = {
        id: users.length + 1,
        telegramId: telegramId,
        username: username,
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        referralCode: telegramId.toString(),
        referrerTelegramId: null,
        referrerCode: null,
        claimedLevels: {},
        walletAddress: null,
        isPremium: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      users.push(newUser);
      
      console.log(`✅ New user (no referral): ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      await bot.sendMessage(chatId, 
        `🎉 Welcome to NotFrens, ${username}!\n\n` +
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Link: \`${referralLink}\`\n\n` +
        `💰 Start earning by sharing your ID!\n` +
        `💎 Connect TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open NotFrens App', web_app: { url: webAppUrl } }],
              [{ text: '📤 Share ID', switch_inline_query: `Join NotFrens! Use my ID: ${telegramId}` }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
    }
  });

  bot.onText(/\/wallet/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      if (user.walletAddress) {
        const userTransactions = tonTransactions.filter(tx => 
          tx.senderTelegramId === telegramId
        );
        
        await bot.sendMessage(chatId, 
          `💎 Your TON Wallet\n\n` +
          `📍 Address: \`${user.walletAddress}\`\n` +
          `📊 Transactions sent: ${userTransactions.length}\n` +
          `🔗 Connect more wallets in the app!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        await bot.sendMessage(chatId, 
          `💎 TON Wallet Not Connected\n\n` +
          `Connect your wallet in the app to:\n` +
          `• Send/receive TON\n` +
          `• Track transactions\n` +
          `• Access DeFi features`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🚀 Connect Wallet', web_app: { url: webAppUrl } }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /wallet error:', error);
    }
  });

  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      const levels = calculateAllLevels(user.telegramId);
      const referralStats = getAllReferrals(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === telegramId);
      
      let statsMessage = `📊 Your NotFrens Stats\n\n`;
      statsMessage += `👤 @${user.username}\n`;
      statsMessage += `🆔 ID: \`${user.telegramId}\`\n`;
      statsMessage += `📊 Referrals: ${referralStats.total}\n`;
      statsMessage += `💎 Wallet: ${user.walletAddress ? '✅ Connected' : '❌ Not connected'}\n`;
      statsMessage += `💰 TON sent: ${userTransactions.length} transactions\n`;
      statsMessage += `🌟 Premium: ${user.isPremium ? '✅ Active' : '❌ Not active'}\n`;
      statsMessage += `💵 USDT payments: ${userPayments.length}\n\n`;
      
      statsMessage += `💰 Reward Levels:\n`;
      [3, 5, 7, 9, 12].forEach(level => {
        const levelData = levels[level];
        const status = levelData.completed ? '✅' : '⏳';
        const reward = levelData.reward > 0 ? `$${levelData.reward.toLocaleString()}` : 'No reward';
        statsMessage += `${status} Level ${level}: ${levelData.current}/${levelData.required} - ${reward}\n`;
      });
      
      await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('❌ Telegram /stats error:', error);
    }
  });
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
    users + claim.amount.toLocaleString() + '<br>' +
                        '<small>' + new Date(claim.requestedAt).toLocaleString() + '</small>' +
                        '</div>' +
                        '<div>' +
                        '<button class="btn btn-success" onclick="updateClaim(' + claim.id + ', \\'processed\\')">✅ Approve</button>' +
                        '<button class="btn btn-danger" onclick="updateClaim(' + claim.id + ', \\'rejected\\')">❌ Reject</button>' +
                        '</div>' +
                        '</div>'
                    ).join('') : '<div class="table-row"><div>No pending claims</div></div>';
                    document.getElementById('pendingClaimsTable').innerHTML = pendingClaimsHtml;
                    
                    // Load all claims
                    const claimsHtml = claimsData.claims.slice(-20).reverse().map(claim => 
                        '<div class="table-row">' +
                        '<div>' +
                        '<strong>@' + claim.username + '</strong> - Level ' + claim.level + ' (    users: stats.users.total,
    claims: stats.claims.total,
    cors: 'enabled',
    version: '3.0.0-complete'
  });
});

app.get('/app.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// ========================= TON API ROUTES =========================
app.post('/api/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !validateTonAddress(address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TON address'
      });
    }

    console.log(`💎 Getting balance for: ${address}`);
    
    const result = await getTonBalance(address);
    
    if (result.success) {
      console.log(`✅ Balance: ${result.balance} TON`);
      res.json({
        success: true,
        balance: result.balance,
        address: address
      });
    } else {
      console.log(`❌ Balance fetch failed: ${result.error}`);
      res.status(500).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Balance endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/connect', async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !validateTonAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or wallet address'
      });
    }

    console.log(`🔗 Connecting wallet: User ${telegramId} -> ${walletAddress}`);
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.walletAddress = walletAddress;
    user.lastActive = new Date().toISOString();

    const existingConnection = walletConnections.find(c => 
      c.telegramId === telegramId && c.walletAddress === walletAddress
    );

    if (!existingConnection) {
      walletConnections.push({
        telegramId: telegramId,
        walletAddress: walletAddress,
        connectedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      });
    } else {
      existingConnection.lastUsed = new Date().toISOString();
    }

    console.log(`✅ Wallet connected: ${user.username} -> ${walletAddress}`);

    if (bot) {
      bot.sendMessage(telegramId, 
        `💎 Wallet Connected!\n\n` +
        `Address: \`${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}\`\n` +
        `You can now send/receive TON directly in the app!`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending wallet notification:', err)
      );
    }

    res.json({
      success: true,
      message: 'Wallet connected successfully',
      user: {
        telegramId: user.telegramId,
        username: user.username,
        walletAddress: user.walletAddress
      }
    });

  } catch (error) {
    console.error('❌ Wallet connect error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction', async (req, res) => {
  try {
    const { hash, from, to, amount, comment } = req.body;
    
    if (!hash || !from || !to || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required transaction data'
      });
    }

    console.log(`💰 Recording transaction: ${amount} TON from ${from} to ${to}`);

    const senderUser = users.find(u => u.walletAddress === from);
    
    const transaction = {
      id: tonTransactions.length + 1,
      hash: hash,
      from: from,
      to: to,
      amount: parseFloat(amount),
      comment: comment || '',
      senderTelegramId: senderUser ? senderUser.telegramId : null,
      senderUsername: senderUser ? senderUser.username : null,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    tonTransactions.push(transaction);

    console.log(`✅ Transaction recorded: ${transaction.id}`);

    if (bot && senderUser) {
      bot.sendMessage(senderUser.telegramId, 
        `✅ Transaction Sent!\n\n` +
        `💰 Amount: ${amount} TON\n` +
        `📤 To: \`${to.slice(0, 8)}...${to.slice(-8)}\`\n` +
        `${comment ? `💬 Comment: ${comment}\n` : ''}` +
        `⏱️ Status: Processing...`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending transaction notification:', err)
      );
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        hash: transaction.hash,
        amount: transaction.amount,
        status: transaction.status,
        timestamp: transaction.timestamp
      },
      message: 'Transaction recorded successfully'
    });

  } catch (error) {
    console.error('❌ Transaction record error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction-info', async (req, res) => {
  try {
    const { hash } = req.body;
    
    if (!hash) {
      return res.status(400).json({
        success: false,
        message: 'Transaction hash required'
      });
    }

    console.log(`🔍 Getting transaction info: ${hash}`);
    
    const result = await getTransactionInfo(hash);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Transaction info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/ton/user-transactions/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }

    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === userId
    );

    res.json({
      success: true,
      transactions: userTransactions,
      total: userTransactions.length
    });

  } catch (error) {
    console.error('❌ User transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= USDT PAYMENT ROUTES =========================
app.post('/api/payment/usdt', async (req, res) => {
  try {
    const { 
      telegramId, 
      type, 
      hash, 
      from, 
      amount, 
      comment, 
      usdtEquivalent 
    } = req.body;
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`💰 USDT Payment request: User ${telegramId} - ${type} - ${usdtEquivalent}`);
    
    const paymentRequest = {
      id: usdtPayments.length + 1,
      telegramId: telegramId,
      username: user.username,
      type: type,
      amount: amount,
      usdtEquivalent: usdtEquivalent,
      hash: hash || null,
      fromAddress: from || null,
      comment: comment || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      expectedAddress: type === 'ton_comment' ? USDT_CONFIG.tonReceivingAddress : USDT_CONFIG.usdtReceivingAddress
    };
    
    usdtPayments.push(paymentRequest);
    
    console.log(`✅ USDT Payment recorded: ${paymentRequest.id} - ${user.username}`);
    
    if (bot) {
      const adminMessage = 
        `💰 New USDT Payment Request!\n\n` +
        `👤 User: @${user.username} (${telegramId})\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📝 Type: ${type}\n` +
        `💬 Comment: ${comment}\n` +
        `⏰ Time: ${new Date().toLocaleString()}\n\n` +
        `🔍 Admin Panel: ${WEB_APP_URL}/admin`;
        
      const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || telegramId;
      
      bot.sendMessage(ADMIN_TELEGRAM_ID, adminMessage).catch(err =>
        console.error('Error sending admin notification:', err)
      );
    }
    
    if (bot) {
      const userMessage = type === 'direct_usdt' ?
        `💎 USDT Payment Instructions\n\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📍 Send to: \`${USDT_CONFIG.usdtReceivingAddress}\`\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after payment verification!` :
        
        `💰 TON Payment Received!\n\n` +
        `💎 Amount: ${amount} TON\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after verification!`;
        
      bot.sendMessage(telegramId, userMessage, { parse_mode: 'Markdown' }).catch(err =>
        console.error('Error sending user notification:', err)
      );
    }
    
    res.json({
      success: true,
      payment: {
        id: paymentRequest.id,
        status: paymentRequest.status,
        amount: paymentRequest.usdtEquivalent,
        type: paymentRequest.type,
        createdAt: paymentRequest.createdAt
      },
      message: 'Payment request recorded successfully'
    });
    
  } catch (error) {
    console.error('❌ USDT payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/payment/status/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const userPayments = usdtPayments.filter(p => p.telegramId === userId);
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      payments: userPayments,
      totalPayments: userPayments.length,
      pendingPayments: userPayments.filter(p => p.status === 'pending').length
    });
    
  } catch (error) {
    console.error('❌ Payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/user/:telegramId/premium', (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    const premiumInfo = premiumUsers.find(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      premiumInfo: premiumInfo || null
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
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
    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === user.telegramId
    );
    const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);

    console.log(`✅ User data sent: ${user.username} (${directReferrals.length} referrals, ${userTransactions.length} transactions, ${userPayments.length} payments)`);

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
        walletAddress: user.walletAddress,
        tonTransactions: userTransactions.slice(-10),
        totalTransactions: userTransactions.length,
        usdtPayments: userPayments.slice(-10),
        totalPayments: userPayments.length,
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

app.post('/api/telegram-claim', (req, res) => {
  try {
    const { telegramId, level } = req.body;
    console.log(`💰 Claim request: User ${telegramId} - Level ${level}`);

    if (!validateTelegramUserId(telegramId) || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or level'
      });
    }

    const user = users.find(u => u.telegramId === parseInt(telegramId));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const levels = calculateAllLevels(user.telegramId);
    const currentLevel = levels[level];

    if (!currentLevel.completed) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} not completed. Required: ${currentLevel.required}, Current: ${currentLevel.current}`,
        required: currentLevel.required,
        current: currentLevel.current
      });
    }

    if (currentLevel.reward === 0) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} has no reward`
      });
    }

    if (user.claimedLevels[level]) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} already claimed`
      });
    }

    const claimRequest = {
      id: claimRequests.length + 1,
      telegramId: user.telegramId,
      username: user.username,
      level: level,
      amount: currentLevel.reward,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      referralSnapshot: {
        totalReferrals: currentLevel.current,
        requiredReferrals: currentLevel.required
      }
    };

    claimRequests.push(claimRequest);
    user.claimedLevels[level] = true;

    console.log(`✅ Claim created: ${user.username} - Level ${level} (${currentLevel.reward})`);

    if (bot) {
      bot.sendMessage(user.telegramId, 
        `✅ Claim request submitted!\n\n` +
        `💰 Level ${level}: ${currentLevel.reward.toLocaleString()}\n` +
        `⏱️ Processing: 24-48 hours\n\n` +
        `We'll notify you when processed!`
      ).catch(err => console.error('Error sending claim notification:', err));
    }

    res.json({
      success: true,
      claimRequest: {
        id: claimRequest.id,
        level: claimRequest.level,
        amount: claimRequest.amount,
        status: claimRequest.status,
        requestedAt: claimRequest.requestedAt
      },
      message: `Claim request accepted. Payment of ${currentLevel.reward.toLocaleString()} will be reviewed within 24-48 hours.`
    });

  } catch (error) {
    console.error('❌ Claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/telegram-users', (req, res) => {
  try {
    const publicUsers = users.map(user => {
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === user.telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        telegramId: user.telegramId,
        username: user.username,
        directReferrals: users.filter(u => u.referrerTelegramId === user.telegramId).length,
        joinedAt: user.createdAt,
        isActive: (new Date() - new Date(user.lastActive)) < 24 * 60 * 60 * 1000,
        hasWallet: !!user.walletAddress,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        isPremium: user.isPremium
      };
    });

    res.json({
      success: true,
      users: publicUsers,
      total: users.length,
      stats: getRealTimeStats()
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/claim-requests', (req, res) => {
  try {
    const publicClaims = claimRequests.map(claim => ({
      id: claim.id,
      level: claim.level,
      amount: claim.amount,
      status: claim.status,
      requestedAt: claim.requestedAt,
      username: claim.username
    }));
    
    res.json({
      success: true,
      claimRequests: publicClaims,
      stats: getRealTimeStats().claims
    });

  } catch (error) {
    console.error('❌ Get claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats,
      levelConfig: LEVEL_CONFIG,
      usdtConfig: {
        premiumPrice: USDT_CONFIG.premiumPrice,
        receivingAddress: USDT_CONFIG.usdtReceivingAddress,
        tonReceivingAddress: USDT_CONFIG.tonReceivingAddress
      },
      systemInfo: {
        totalLevels: 12,
        maxUsers: LEVEL_CONFIG[12].required,
        structure: '3^(n-1) referral system',
        telegramBot: BOT_USERNAME,
        rewardLevels: [3, 5, 7, 9, 12],
        webAppUrl: WEB_APP_URL,
        corsEnabled: true,
        tonIntegrated: true,
        tonApiEnabled: !!TON_API_KEY,
        usdtPaymentsEnabled: true,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= ADMIN ROUTES =========================
app.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const sessionToken = crypto.randomUUID();
      adminSessions.add(sessionToken);
      
      setTimeout(() => {
        adminSessions.delete(sessionToken);
      }, 24 * 60 * 60 * 1000);
      
      console.log(`✅ Admin logged in: ${username}`);
      res.json({
        success: true,
        token: sessionToken,
        message: 'Login successful'
      });
    } else {
      console.log(`❌ Failed admin login attempt: ${username}`);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
}

app.get('/admin/stats', requireAdmin, (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        recentUsers: users.slice(-10).map(u => ({
          telegramId: u.telegramId,
          username: u.username,
          referrals: users.filter(ref => ref.referrerTelegramId === u.telegramId).length,
          hasWallet: !!u.walletAddress,
          isPremium: u.isPremium,
          joinedAt: u.createdAt
        })),
        recentClaims: claimRequests.slice(-10),
        recentTransactions: tonTransactions.slice(-10),
        recentPayments: usdtPayments.slice(-10),
        systemHealth: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/users', requireAdmin, (req, res) => {
  try {
    const usersWithStats = users.map(user => {
      const directReferrals = users.filter(u => u.referrerTelegramId === user.telegramId);
      const levels = calculateAllLevels(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => tx.senderTelegramId === user.telegramId);
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        ...user,
        directReferralsCount: directReferrals.length,
        levels: levels,
        claimedRewards: Object.keys(user.claimedLevels || {}).length,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        hasWallet: !!user.walletAddress
      };
    });
    
    res.json({
      success: true,
      users: usersWithStats,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/claims', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      claims: claimRequests,
      summary: {
        total: claimRequests.length,
        pending: claimRequests.filter(c => c.status === 'pending').length,
        processed: claimRequests.filter(c => c.status === 'processed').length,
        rejected: claimRequests.filter(c => c.status === 'rejected').length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/payments', requireAdmin, (req, res) => {
  try {
    const paymentsWithUser = usdtPayments.map(payment => {
      const user = users.find(u => u.telegramId === payment.telegramId);
      return {
        ...payment,
        userInfo: user ? {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        } : null
      };
    });
    
    res.json({
      success: true,
      payments: paymentsWithUser,
      summary: {
        total: usdtPayments.length,
        pending: usdtPayments.filter(p => p.status === 'pending').length,
        verified: usdtPayments.filter(p => p.status === 'verified').length,
        rejected: usdtPayments.filter(p => p.status === 'rejected').length,
        totalUSDT: usdtPayments
          .filter(p => p.status === 'verified')
          .reduce((sum, p) => sum + p.usdtEquivalent, 0)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/transactions', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      transactions: tonTransactions,
      summary: {
        total: tonTransactions.length,
        totalVolume: tonTransactions.reduce((sum, tx) => sum + tx.amount, 0),
        connectedWallets: walletConnections.length,
        uniqueSenders: [...new Set(tonTransactions.map(tx => tx.senderTelegramId))].length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/admin/payments/:id/verify', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, transactionHash } = req.body;
    
    const payment = usdtPayments.find(p => p.id === parseInt(id));
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    payment.status = status;
    payment.note = note || '';
    payment.verifiedAt = new Date().toISOString();
    payment.transactionHash = transactionHash || payment.hash;
    
    console.log(`✅ USDT Payment ${id} updated: ${status}`);
    
    if (status === 'verified') {
      const existingPremium = premiumUsers.find(p => p.telegramId === payment.telegramId);
      
      if (!existingPremium) {
        premiumUsers.push({
          telegramId: payment.telegramId,
          username: payment.username,
          activatedAt: new Date().toISOString(),
          paymentId: payment.id,
          active: true,
          expiresAt: null
        });
      } else {
        existingPremium.active = true;
        existingPremium.activatedAt = new Date().toISOString();
      }
      
      const user = users.find(u => u.telegramId === payment.telegramId);
      if (user) {
        user.isPremium = true;
        user.premiumActivatedAt = new Date().toISOString();
      }
    }
    
    if (bot) {
      let message;
      if (status === 'verified') {
        message = 
          `🎉 Premium Activated!\n\nconst express = require('express');
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
const WEB_APP_URL = process.env.WEB_APP_URL || `http://localhost:${PORT}`;

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
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
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

app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ========================= DATA STORAGE =========================
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// ========================= SAMPLE DATA =========================
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
  iconUrl: `${WEB_APP_URL}/public/icon-192x192.png`,
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

// ========================= TON API FUNCTIONS =========================
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

// ========================= TELEGRAM BOT HANDLERS =========================
if (bot) {
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const referralCode = match[1];
    
    console.log(`🤖 /start with referral: User ${telegramId} (@${username}) referral: ${referralCode}`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `👥 Direct referrals: ${users.filter(u => u.referrerTelegramId === telegramId).length}/3\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n` +
          `📱 Open Web App:`,
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
        
        console.log(`🔗 Referral added: ${referrer.username} -> ${username}`);
      }
      
      console.log(`✅ New user registered: ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      let welcomeMessage = `🎉 Welcome to NotFrens, ${username}!\n\n`;
      
      if (referrer) {
        welcomeMessage += `✅ You joined via ${referrer.username}'s referral!\n\n`;
      }
      
      welcomeMessage += 
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Your referral link:\n\`${referralLink}\`\n\n` +
        `💰 Earn rewards by inviting friends:\n` +
        `• Level 3 (9 referrals): $30\n` +
        `• Level 5 (81 referrals): $300\n` +
        `• Level 7 (729 referrals): $1,800\n` +
        `• Level 9 (6,561 referrals): $20,000\n` +
        `• Level 12 (177,147 referrals): $222,000\n\n` +
        `💎 Connect your TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`;
        
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
        const referrerStats = getAllReferrals(referrer.telegramId);
        await bot.sendMessage(referrer.telegramId, 
          `🎉 New referral joined!\n\n` +
          `👤 ${username} joined via your ID\n` +
          `📊 Your referrals: ${referrerStats.total}`
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
      await bot.sendMessage(chatId, 
        `❌ Sorry, there was an error. Please try again later.`
      );
    }
  });
  
  bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    console.log(`🤖 /start: User ${telegramId} (@${username}) without referral`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        const referralLink = `https://t.me/${BOT_USERNAME}?start=${existingUser.referralCode}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `📤 Share: \`${referralLink}\`\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n`,
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
      
      const newUser = {
        id: users.length + 1,
        telegramId: telegramId,
        username: username,
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        referralCode: telegramId.toString(),
        referrerTelegramId: null,
        referrerCode: null,
        claimedLevels: {},
        walletAddress: null,
        isPremium: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      users.push(newUser);
      
      console.log(`✅ New user (no referral): ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      await bot.sendMessage(chatId, 
        `🎉 Welcome to NotFrens, ${username}!\n\n` +
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Link: \`${referralLink}\`\n\n` +
        `💰 Start earning by sharing your ID!\n` +
        `💎 Connect TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open NotFrens App', web_app: { url: webAppUrl } }],
              [{ text: '📤 Share ID', switch_inline_query: `Join NotFrens! Use my ID: ${telegramId}` }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
    }
  });

  bot.onText(/\/wallet/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      if (user.walletAddress) {
        const userTransactions = tonTransactions.filter(tx => 
          tx.senderTelegramId === telegramId
        );
        
        await bot.sendMessage(chatId, 
          `💎 Your TON Wallet\n\n` +
          `📍 Address: \`${user.walletAddress}\`\n` +
          `📊 Transactions sent: ${userTransactions.length}\n` +
          `🔗 Connect more wallets in the app!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        await bot.sendMessage(chatId, 
          `💎 TON Wallet Not Connected\n\n` +
          `Connect your wallet in the app to:\n` +
          `• Send/receive TON\n` +
          `• Track transactions\n` +
          `• Access DeFi features`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🚀 Connect Wallet', web_app: { url: webAppUrl } }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /wallet error:', error);
    }
  });

  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      const levels = calculateAllLevels(user.telegramId);
      const referralStats = getAllReferrals(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === telegramId);
      
      let statsMessage = `📊 Your NotFrens Stats\n\n`;
      statsMessage += `👤 @${user.username}\n`;
      statsMessage += `🆔 ID: \`${user.telegramId}\`\n`;
      statsMessage += `📊 Referrals: ${referralStats.total}\n`;
      statsMessage += `💎 Wallet: ${user.walletAddress ? '✅ Connected' : '❌ Not connected'}\n`;
      statsMessage += `💰 TON sent: ${userTransactions.length} transactions\n`;
      statsMessage += `🌟 Premium: ${user.isPremium ? '✅ Active' : '❌ Not active'}\n`;
      statsMessage += `💵 USDT payments: ${userPayments.length}\n\n`;
      
      statsMessage += `💰 Reward Levels:\n`;
      [3, 5, 7, 9, 12].forEach(level => {
        const levelData = levels[level];
        const status = levelData.completed ? '✅' : '⏳';
        const reward = levelData.reward > 0 ? `$${levelData.reward.toLocaleString()}` : 'No reward';
        statsMessage += `${status} Level ${level}: ${levelData.current}/${levelData.required} - ${reward}\n`;
      });
      
      await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('❌ Telegram /stats error:', error);
    }
  });
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
    users + claim.amount.toLocaleString() + ')<br>' +
                        '<small>' + new Date(claim.requestedAt).toLocaleString() + '</small>' +
                        '</div>' +
                        '<span class="status-' + claim.status + '">' + claim.status.toUpperCase() + '</span>' +
                        '</div>'
                    ).join('');
                    document.getElementById('claimsTable').innerHTML = claimsHtml;
                    
                    // Load transactions
                    const transactionsHtml = transactionsData.transactions.slice(-20).reverse().map(tx => 
                        '<div class="table-row">' +
                        '<div>' +
                        '<strong>' + (tx.senderUsername || 'Unknown') + '</strong><br>' +
                        tx.amount + ' TON → ' + tx.to.slice(0, 8) + '...<br>' +
                        '<small>' + new Date(tx.timestamp).toLocaleString() + '</small>' +
                        '</div>' +
                        '<span>' + tx.status + '</span>' +
                        '</div>'
                    ).join('');
                    document.getElementById('transactionsTable').innerHTML = transactionsHtml;
                    
                    // Load recent users
                    const usersHtml = stats.recentUsers.map(user => 
                        '<div class="table-row">' +
                        '<div>' +
                        '<strong>@' + user.username + '</strong><br>' +
                        '<small>Referrals: ' + user.referrals + ' | ' + 
                        (user.hasWallet ? '💎 Wallet' : '❌ No wallet') + ' | ' +
                        (user.isPremium ? '🌟 Premium' : '❌ Free') + '</small>' +
                        '</div>' +
                        '<span>' + new Date(user.joinedAt).toLocaleDateString() + '</span>' +
                        '</div>'
                    ).join('');
                    document.getElementById('usersTable').innerHTML = usersHtml;
                    
                    console.log('Stats loaded successfully');
                    
                } catch (error) {
                    console.error('Error loading stats:', error);
                    showError('Failed to load data');
                }
            }
            
            async function updatePayment(paymentId, status) {
                const note = status === 'rejected' ? prompt('Rejection reason (optional):') : '';
                
                try {
                    const response = await fetch('/admin/payments/' + paymentId + '/verify', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        body: JSON.stringify({ status, note })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        alert('Payment updated successfully!');
                        loadStats();
                    } else {
                        alert('Error: ' + data.message);
                    }
                } catch (error) {
                    alert('Network error');
                }
            }
            
            async function updateClaim(claimId, status) {
                const note = status === 'rejected' ? prompt('Rejection reason (optional):') : '';
                
                try {
                    const response = await fetch('/admin/claims/' + claimId + '/update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        body: JSON.stringify({ status, note })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        alert('Claim updated successfully!');
                        loadStats();
                    } else {
                        alert('Error: ' + data.message);
                    }
                } catch (error) {
                    alert('Network error');
                }
            }
            
            // Enter key support for login
            document.addEventListener('keypress', function(event) {
                if (event.key === 'Enter' && document.getElementById('loginForm').style.display !== 'none') {
                    login();
                }
            });
            
            // Auto refresh every 60 seconds
            setInterval(() => {
                if (token && document.getElementById('dashboard').style.display !== 'none') {
                    loadStats();
                }
            }, 60000);
            
            console.log('NotFrens Complete Admin panel loaded successfully');
        </script>
    </body>
    </html>
  `);
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
      'POST /api/ton/balance',
      'POST /api/ton/connect',
      'POST /api/ton/transaction',
      'POST /api/payment/usdt',
      'GET /api/telegram-user/:id',
      'POST /api/telegram-claim',
      'GET /admin'
    ]
  });
});

// ========================= SERVER START =========================
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 NotFrens Complete Backend Server Started Successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📱 Frontend App: http://localhost:${PORT}`);
  console.log(`📡 API Base: http://localhost:${PORT}/api`);
  console.log(`🔧 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`💚 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🤖 Telegram Bot: @${BOT_USERNAME}`);
  console.log(`💎 TON Connect: http://localhost:${PORT}/tonconnect-manifest.json`);
  console.log(`💰 USDT Address: ${USDT_CONFIG.usdtReceivingAddress}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (bot) {
    console.log('✅ Telegram Bot: CONNECTED');
    console.log(`🔗 Bot Link: https://t.me/${BOT_USERNAME}`);
  } else {
    console.log('❌ Telegram Bot: DISCONNECTED');
    console.log('   Check TELEGRAM_BOT_TOKEN in .env file');
  }
  
  console.log('\n🔧 Complete System Configuration:');
  console.log(`   - Port: ${PORT}`);
  console.log(`   - CORS: Enabled for all origins`);
  console.log(`   - Static Files: Enabled`);
  console.log(`   - Admin Panel: /admin (Login: ${ADMIN_USER})`);
  console.log(`   - Sample Data: ${users.length} users created`);
  console.log(`   - TON API: ${TON_API_KEY ? 'Full integration' : 'Basic mode'}`);
  console.log(`   - USDT Payments: ${USDT_CONFIG.premiumPrice} premium`);
  console.log(`   - TON Manifest: /tonconnect-manifest.json`);
  
  console.log('\n📋 All Access Points:');
  console.log('   1. Frontend App: http://localhost:3000');
  console.log('   2. Admin Panel: http://localhost:3000/admin');
  console.log('   3. API Test: http://localhost:3000/api/test');
  console.log('   4. Health Check: http://localhost:3000/api/health');
  console.log('   5. Telegram Bot: @not_frens_bot');
  console.log('   6. TON Manifest: http://localhost:3000/tonconnect-manifest.json');
  
  console.log('\n🎯 Complete Feature Set:');
  console.log('   - ✅ Referral system (3^(n-1))');
  console.log('   - ✅ Telegram Bot integration');
  console.log('   - ✅ TO    users: stats.users.total,
    claims: stats.claims.total,
    cors: 'enabled',
    version: '3.0.0-complete'
  });
});

app.get('/app.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// ========================= TON API ROUTES =========================
app.post('/api/ton/balance', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address || !validateTonAddress(address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid TON address'
      });
    }

    console.log(`💎 Getting balance for: ${address}`);
    
    const result = await getTonBalance(address);
    
    if (result.success) {
      console.log(`✅ Balance: ${result.balance} TON`);
      res.json({
        success: true,
        balance: result.balance,
        address: address
      });
    } else {
      console.log(`❌ Balance fetch failed: ${result.error}`);
      res.status(500).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Balance endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/connect', async (req, res) => {
  try {
    const { telegramId, walletAddress } = req.body;
    
    if (!validateTelegramUserId(telegramId) || !validateTonAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or wallet address'
      });
    }

    console.log(`🔗 Connecting wallet: User ${telegramId} -> ${walletAddress}`);
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.walletAddress = walletAddress;
    user.lastActive = new Date().toISOString();

    const existingConnection = walletConnections.find(c => 
      c.telegramId === telegramId && c.walletAddress === walletAddress
    );

    if (!existingConnection) {
      walletConnections.push({
        telegramId: telegramId,
        walletAddress: walletAddress,
        connectedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      });
    } else {
      existingConnection.lastUsed = new Date().toISOString();
    }

    console.log(`✅ Wallet connected: ${user.username} -> ${walletAddress}`);

    if (bot) {
      bot.sendMessage(telegramId, 
        `💎 Wallet Connected!\n\n` +
        `Address: \`${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}\`\n` +
        `You can now send/receive TON directly in the app!`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending wallet notification:', err)
      );
    }

    res.json({
      success: true,
      message: 'Wallet connected successfully',
      user: {
        telegramId: user.telegramId,
        username: user.username,
        walletAddress: user.walletAddress
      }
    });

  } catch (error) {
    console.error('❌ Wallet connect error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction', async (req, res) => {
  try {
    const { hash, from, to, amount, comment } = req.body;
    
    if (!hash || !from || !to || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required transaction data'
      });
    }

    console.log(`💰 Recording transaction: ${amount} TON from ${from} to ${to}`);

    const senderUser = users.find(u => u.walletAddress === from);
    
    const transaction = {
      id: tonTransactions.length + 1,
      hash: hash,
      from: from,
      to: to,
      amount: parseFloat(amount),
      comment: comment || '',
      senderTelegramId: senderUser ? senderUser.telegramId : null,
      senderUsername: senderUser ? senderUser.username : null,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    tonTransactions.push(transaction);

    console.log(`✅ Transaction recorded: ${transaction.id}`);

    if (bot && senderUser) {
      bot.sendMessage(senderUser.telegramId, 
        `✅ Transaction Sent!\n\n` +
        `💰 Amount: ${amount} TON\n` +
        `📤 To: \`${to.slice(0, 8)}...${to.slice(-8)}\`\n` +
        `${comment ? `💬 Comment: ${comment}\n` : ''}` +
        `⏱️ Status: Processing...`
      , { parse_mode: 'Markdown' }).catch(err => 
        console.error('Error sending transaction notification:', err)
      );
    }

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        hash: transaction.hash,
        amount: transaction.amount,
        status: transaction.status,
        timestamp: transaction.timestamp
      },
      message: 'Transaction recorded successfully'
    });

  } catch (error) {
    console.error('❌ Transaction record error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/ton/transaction-info', async (req, res) => {
  try {
    const { hash } = req.body;
    
    if (!hash) {
      return res.status(400).json({
        success: false,
        message: 'Transaction hash required'
      });
    }

    console.log(`🔍 Getting transaction info: ${hash}`);
    
    const result = await getTransactionInfo(hash);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('❌ Transaction info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/ton/user-transactions/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }

    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === userId
    );

    res.json({
      success: true,
      transactions: userTransactions,
      total: userTransactions.length
    });

  } catch (error) {
    console.error('❌ User transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= USDT PAYMENT ROUTES =========================
app.post('/api/payment/usdt', async (req, res) => {
  try {
    const { 
      telegramId, 
      type, 
      hash, 
      from, 
      amount, 
      comment, 
      usdtEquivalent 
    } = req.body;
    
    if (!validateTelegramUserId(telegramId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const user = users.find(u => u.telegramId === telegramId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`💰 USDT Payment request: User ${telegramId} - ${type} - ${usdtEquivalent}`);
    
    const paymentRequest = {
      id: usdtPayments.length + 1,
      telegramId: telegramId,
      username: user.username,
      type: type,
      amount: amount,
      usdtEquivalent: usdtEquivalent,
      hash: hash || null,
      fromAddress: from || null,
      comment: comment || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      expectedAddress: type === 'ton_comment' ? USDT_CONFIG.tonReceivingAddress : USDT_CONFIG.usdtReceivingAddress
    };
    
    usdtPayments.push(paymentRequest);
    
    console.log(`✅ USDT Payment recorded: ${paymentRequest.id} - ${user.username}`);
    
    if (bot) {
      const adminMessage = 
        `💰 New USDT Payment Request!\n\n` +
        `👤 User: @${user.username} (${telegramId})\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📝 Type: ${type}\n` +
        `💬 Comment: ${comment}\n` +
        `⏰ Time: ${new Date().toLocaleString()}\n\n` +
        `🔍 Admin Panel: ${WEB_APP_URL}/admin`;
        
      const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || telegramId;
      
      bot.sendMessage(ADMIN_TELEGRAM_ID, adminMessage).catch(err =>
        console.error('Error sending admin notification:', err)
      );
    }
    
    if (bot) {
      const userMessage = type === 'direct_usdt' ?
        `💎 USDT Payment Instructions\n\n` +
        `💵 Amount: ${usdtEquivalent} USDT\n` +
        `📍 Send to: \`${USDT_CONFIG.usdtReceivingAddress}\`\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after payment verification!` :
        
        `💰 TON Payment Received!\n\n` +
        `💎 Amount: ${amount} TON\n` +
        `💬 Comment: "${comment}"\n\n` +
        `✅ Your premium will be activated within 24 hours after verification!`;
        
      bot.sendMessage(telegramId, userMessage, { parse_mode: 'Markdown' }).catch(err =>
        console.error('Error sending user notification:', err)
      );
    }
    
    res.json({
      success: true,
      payment: {
        id: paymentRequest.id,
        status: paymentRequest.status,
        amount: paymentRequest.usdtEquivalent,
        type: paymentRequest.type,
        createdAt: paymentRequest.createdAt
      },
      message: 'Payment request recorded successfully'
    });
    
  } catch (error) {
    console.error('❌ USDT payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/payment/status/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    if (!validateTelegramUserId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID'
      });
    }
    
    const userPayments = usdtPayments.filter(p => p.telegramId === userId);
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      payments: userPayments,
      totalPayments: userPayments.length,
      pendingPayments: userPayments.filter(p => p.status === 'pending').length
    });
    
  } catch (error) {
    console.error('❌ Payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/user/:telegramId/premium', (req, res) => {
  try {
    const { telegramId } = req.params;
    const userId = parseInt(telegramId);
    
    const isPremium = premiumUsers.some(p => p.telegramId === userId && p.active);
    const premiumInfo = premiumUsers.find(p => p.telegramId === userId && p.active);
    
    res.json({
      success: true,
      isPremium: isPremium,
      premiumInfo: premiumInfo || null
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
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
    const userTransactions = tonTransactions.filter(tx => 
      tx.senderTelegramId === user.telegramId
    );
    const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);

    console.log(`✅ User data sent: ${user.username} (${directReferrals.length} referrals, ${userTransactions.length} transactions, ${userPayments.length} payments)`);

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
        walletAddress: user.walletAddress,
        tonTransactions: userTransactions.slice(-10),
        totalTransactions: userTransactions.length,
        usdtPayments: userPayments.slice(-10),
        totalPayments: userPayments.length,
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

app.post('/api/telegram-claim', (req, res) => {
  try {
    const { telegramId, level } = req.body;
    console.log(`💰 Claim request: User ${telegramId} - Level ${level}`);

    if (!validateTelegramUserId(telegramId) || !level || level < 1 || level > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid telegram ID or level'
      });
    }

    const user = users.find(u => u.telegramId === parseInt(telegramId));
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const levels = calculateAllLevels(user.telegramId);
    const currentLevel = levels[level];

    if (!currentLevel.completed) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} not completed. Required: ${currentLevel.required}, Current: ${currentLevel.current}`,
        required: currentLevel.required,
        current: currentLevel.current
      });
    }

    if (currentLevel.reward === 0) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} has no reward`
      });
    }

    if (user.claimedLevels[level]) {
      return res.status(400).json({
        success: false,
        message: `Level ${level} already claimed`
      });
    }

    const claimRequest = {
      id: claimRequests.length + 1,
      telegramId: user.telegramId,
      username: user.username,
      level: level,
      amount: currentLevel.reward,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      referralSnapshot: {
        totalReferrals: currentLevel.current,
        requiredReferrals: currentLevel.required
      }
    };

    claimRequests.push(claimRequest);
    user.claimedLevels[level] = true;

    console.log(`✅ Claim created: ${user.username} - Level ${level} (${currentLevel.reward})`);

    if (bot) {
      bot.sendMessage(user.telegramId, 
        `✅ Claim request submitted!\n\n` +
        `💰 Level ${level}: ${currentLevel.reward.toLocaleString()}\n` +
        `⏱️ Processing: 24-48 hours\n\n` +
        `We'll notify you when processed!`
      ).catch(err => console.error('Error sending claim notification:', err));
    }

    res.json({
      success: true,
      claimRequest: {
        id: claimRequest.id,
        level: claimRequest.level,
        amount: claimRequest.amount,
        status: claimRequest.status,
        requestedAt: claimRequest.requestedAt
      },
      message: `Claim request accepted. Payment of ${currentLevel.reward.toLocaleString()} will be reviewed within 24-48 hours.`
    });

  } catch (error) {
    console.error('❌ Claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/telegram-users', (req, res) => {
  try {
    const publicUsers = users.map(user => {
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === user.telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        telegramId: user.telegramId,
        username: user.username,
        directReferrals: users.filter(u => u.referrerTelegramId === user.telegramId).length,
        joinedAt: user.createdAt,
        isActive: (new Date() - new Date(user.lastActive)) < 24 * 60 * 60 * 1000,
        hasWallet: !!user.walletAddress,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        isPremium: user.isPremium
      };
    });

    res.json({
      success: true,
      users: publicUsers,
      total: users.length,
      stats: getRealTimeStats()
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/claim-requests', (req, res) => {
  try {
    const publicClaims = claimRequests.map(claim => ({
      id: claim.id,
      level: claim.level,
      amount: claim.amount,
      status: claim.status,
      requestedAt: claim.requestedAt,
      username: claim.username
    }));
    
    res.json({
      success: true,
      claimRequests: publicClaims,
      stats: getRealTimeStats().claims
    });

  } catch (error) {
    console.error('❌ Get claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats,
      levelConfig: LEVEL_CONFIG,
      usdtConfig: {
        premiumPrice: USDT_CONFIG.premiumPrice,
        receivingAddress: USDT_CONFIG.usdtReceivingAddress,
        tonReceivingAddress: USDT_CONFIG.tonReceivingAddress
      },
      systemInfo: {
        totalLevels: 12,
        maxUsers: LEVEL_CONFIG[12].required,
        structure: '3^(n-1) referral system',
        telegramBot: BOT_USERNAME,
        rewardLevels: [3, 5, 7, 9, 12],
        webAppUrl: WEB_APP_URL,
        corsEnabled: true,
        tonIntegrated: true,
        tonApiEnabled: !!TON_API_KEY,
        usdtPaymentsEnabled: true,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ========================= ADMIN ROUTES =========================
app.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const sessionToken = crypto.randomUUID();
      adminSessions.add(sessionToken);
      
      setTimeout(() => {
        adminSessions.delete(sessionToken);
      }, 24 * 60 * 60 * 1000);
      
      console.log(`✅ Admin logged in: ${username}`);
      res.json({
        success: true,
        token: sessionToken,
        message: 'Login successful'
      });
    } else {
      console.log(`❌ Failed admin login attempt: ${username}`);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
}

app.get('/admin/stats', requireAdmin, (req, res) => {
  try {
    const stats = getRealTimeStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        recentUsers: users.slice(-10).map(u => ({
          telegramId: u.telegramId,
          username: u.username,
          referrals: users.filter(ref => ref.referrerTelegramId === u.telegramId).length,
          hasWallet: !!u.walletAddress,
          isPremium: u.isPremium,
          joinedAt: u.createdAt
        })),
        recentClaims: claimRequests.slice(-10),
        recentTransactions: tonTransactions.slice(-10),
        recentPayments: usdtPayments.slice(-10),
        systemHealth: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/users', requireAdmin, (req, res) => {
  try {
    const usersWithStats = users.map(user => {
      const directReferrals = users.filter(u => u.referrerTelegramId === user.telegramId);
      const levels = calculateAllLevels(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => tx.senderTelegramId === user.telegramId);
      const userPayments = usdtPayments.filter(p => p.telegramId === user.telegramId);
      
      return {
        ...user,
        directReferralsCount: directReferrals.length,
        levels: levels,
        claimedRewards: Object.keys(user.claimedLevels || {}).length,
        transactionCount: userTransactions.length,
        paymentCount: userPayments.length,
        hasWallet: !!user.walletAddress
      };
    });
    
    res.json({
      success: true,
      users: usersWithStats,
      total: users.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/claims', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      claims: claimRequests,
      summary: {
        total: claimRequests.length,
        pending: claimRequests.filter(c => c.status === 'pending').length,
        processed: claimRequests.filter(c => c.status === 'processed').length,
        rejected: claimRequests.filter(c => c.status === 'rejected').length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/payments', requireAdmin, (req, res) => {
  try {
    const paymentsWithUser = usdtPayments.map(payment => {
      const user = users.find(u => u.telegramId === payment.telegramId);
      return {
        ...payment,
        userInfo: user ? {
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        } : null
      };
    });
    
    res.json({
      success: true,
      payments: paymentsWithUser,
      summary: {
        total: usdtPayments.length,
        pending: usdtPayments.filter(p => p.status === 'pending').length,
        verified: usdtPayments.filter(p => p.status === 'verified').length,
        rejected: usdtPayments.filter(p => p.status === 'rejected').length,
        totalUSDT: usdtPayments
          .filter(p => p.status === 'verified')
          .reduce((sum, p) => sum + p.usdtEquivalent, 0)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.get('/admin/transactions', requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      transactions: tonTransactions,
      summary: {
        total: tonTransactions.length,
        totalVolume: tonTransactions.reduce((sum, tx) => sum + tx.amount, 0),
        connectedWallets: walletConnections.length,
        uniqueSenders: [...new Set(tonTransactions.map(tx => tx.senderTelegramId))].length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/admin/payments/:id/verify', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, transactionHash } = req.body;
    
    const payment = usdtPayments.find(p => p.id === parseInt(id));
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    payment.status = status;
    payment.note = note || '';
    payment.verifiedAt = new Date().toISOString();
    payment.transactionHash = transactionHash || payment.hash;
    
    console.log(`✅ USDT Payment ${id} updated: ${status}`);
    
    if (status === 'verified') {
      const existingPremium = premiumUsers.find(p => p.telegramId === payment.telegramId);
      
      if (!existingPremium) {
        premiumUsers.push({
          telegramId: payment.telegramId,
          username: payment.username,
          activatedAt: new Date().toISOString(),
          paymentId: payment.id,
          active: true,
          expiresAt: null
        });
      } else {
        existingPremium.active = true;
        existingPremium.activatedAt = new Date().toISOString();
      }
      
      const user = users.find(u => u.telegramId === payment.telegramId);
      if (user) {
        user.isPremium = true;
        user.premiumActivatedAt = new Date().toISOString();
      }
    }
    
    if (bot) {
      let message;
      if (status === 'verified') {
        message = 
          `🎉 Premium Activated!\n\nconst express = require('express');
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
const WEB_APP_URL = process.env.WEB_APP_URL || `http://localhost:${PORT}`;

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
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
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

app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}));

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ========================= DATA STORAGE =========================
let users = [];
let claimRequests = [];
let allReferrals = [];
let walletConnections = [];
let tonTransactions = [];
let usdtPayments = [];
let premiumUsers = [];

// ========================= SAMPLE DATA =========================
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
  iconUrl: `${WEB_APP_URL}/public/icon-192x192.png`,
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

// ========================= TON API FUNCTIONS =========================
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

// ========================= TELEGRAM BOT HANDLERS =========================
if (bot) {
  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const referralCode = match[1];
    
    console.log(`🤖 /start with referral: User ${telegramId} (@${username}) referral: ${referralCode}`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `👥 Direct referrals: ${users.filter(u => u.referrerTelegramId === telegramId).length}/3\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n` +
          `📱 Open Web App:`,
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
        
        console.log(`🔗 Referral added: ${referrer.username} -> ${username}`);
      }
      
      console.log(`✅ New user registered: ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      let welcomeMessage = `🎉 Welcome to NotFrens, ${username}!\n\n`;
      
      if (referrer) {
        welcomeMessage += `✅ You joined via ${referrer.username}'s referral!\n\n`;
      }
      
      welcomeMessage += 
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Your referral link:\n\`${referralLink}\`\n\n` +
        `💰 Earn rewards by inviting friends:\n` +
        `• Level 3 (9 referrals): $30\n` +
        `• Level 5 (81 referrals): $300\n` +
        `• Level 7 (729 referrals): $1,800\n` +
        `• Level 9 (6,561 referrals): $20,000\n` +
        `• Level 12 (177,147 referrals): $222,000\n\n` +
        `💎 Connect your TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`;
        
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
        const referrerStats = getAllReferrals(referrer.telegramId);
        await bot.sendMessage(referrer.telegramId, 
          `🎉 New referral joined!\n\n` +
          `👤 ${username} joined via your ID\n` +
          `📊 Your referrals: ${referrerStats.total}`
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
      await bot.sendMessage(chatId, 
        `❌ Sorry, there was an error. Please try again later.`
      );
    }
  });
  
  bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    
    console.log(`🤖 /start: User ${telegramId} (@${username}) without referral`);
    
    try {
      let existingUser = users.find(u => u.telegramId === telegramId);
      
      if (existingUser) {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        const referralLink = `https://t.me/${BOT_USERNAME}?start=${existingUser.referralCode}`;
        
        await bot.sendMessage(chatId, 
          `👋 Welcome back, ${username}!\n\n` +
          `🔗 Your referral code: \`${existingUser.referralCode}\`\n` +
          `📤 Share: \`${referralLink}\`\n` +
          `💎 Wallet: ${existingUser.walletAddress ? '✅ Connected' : '❌ Not connected'}\n` +
          `🌟 Premium: ${existingUser.isPremium ? '✅ Active' : '❌ Not active'}\n\n`,
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
      
      const newUser = {
        id: users.length + 1,
        telegramId: telegramId,
        username: username,
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        referralCode: telegramId.toString(),
        referrerTelegramId: null,
        referrerCode: null,
        claimedLevels: {},
        walletAddress: null,
        isPremium: false,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      users.push(newUser);
      
      console.log(`✅ New user (no referral): ${telegramId} (@${username})`);
      
      const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
      const referralLink = `https://t.me/${BOT_USERNAME}?start=${newUser.telegramId}`;
      
      await bot.sendMessage(chatId, 
        `🎉 Welcome to NotFrens, ${username}!\n\n` +
        `🆔 Your referral ID: \`${newUser.telegramId}\`\n` +
        `📤 Link: \`${referralLink}\`\n\n` +
        `💰 Start earning by sharing your ID!\n` +
        `💎 Connect TON wallet in the app!\n` +
        `🌟 Upgrade to Premium for $11 USDT!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Open NotFrens App', web_app: { url: webAppUrl } }],
              [{ text: '📤 Share ID', switch_inline_query: `Join NotFrens! Use my ID: ${telegramId}` }]
            ]
          }
        }
      );
      
    } catch (error) {
      console.error('❌ Telegram /start error:', error);
    }
  });

  bot.onText(/\/wallet/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      if (user.walletAddress) {
        const userTransactions = tonTransactions.filter(tx => 
          tx.senderTelegramId === telegramId
        );
        
        await bot.sendMessage(chatId, 
          `💎 Your TON Wallet\n\n` +
          `📍 Address: \`${user.walletAddress}\`\n` +
          `📊 Transactions sent: ${userTransactions.length}\n` +
          `🔗 Connect more wallets in the app!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        const webAppUrl = `${WEB_APP_URL}?user=${telegramId}`;
        await bot.sendMessage(chatId, 
          `💎 TON Wallet Not Connected\n\n` +
          `Connect your wallet in the app to:\n` +
          `• Send/receive TON\n` +
          `• Track transactions\n` +
          `• Access DeFi features`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '🚀 Connect Wallet', web_app: { url: webAppUrl } }
              ]]
            }
          }
        );
      }
      
    } catch (error) {
      console.error('❌ Telegram /wallet error:', error);
    }
  });

  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const user = users.find(u => u.telegramId === telegramId);
      
      if (!user) {
        await bot.sendMessage(chatId, `❌ Send /start first!`);
        return;
      }
      
      const levels = calculateAllLevels(user.telegramId);
      const referralStats = getAllReferrals(user.telegramId);
      const userTransactions = tonTransactions.filter(tx => 
        tx.senderTelegramId === telegramId
      );
      const userPayments = usdtPayments.filter(p => p.telegramId === telegramId);
      
      let statsMessage = `📊 Your NotFrens Stats\n\n`;
      statsMessage += `👤 @${user.username}\n`;
      statsMessage += `🆔 ID: \`${user.telegramId}\`\n`;
      statsMessage += `📊 Referrals: ${referralStats.total}\n`;
      statsMessage += `💎 Wallet: ${user.walletAddress ? '✅ Connected' : '❌ Not connected'}\n`;
      statsMessage += `💰 TON sent: ${userTransactions.length} transactions\n`;
      statsMessage += `🌟 Premium: ${user.isPremium ? '✅ Active' : '❌ Not active'}\n`;
      statsMessage += `💵 USDT payments: ${userPayments.length}\n\n`;
      
      statsMessage += `💰 Reward Levels:\n`;
      [3, 5, 7, 9, 12].forEach(level => {
        const levelData = levels[level];
        const status = levelData.completed ? '✅' : '⏳';
        const reward = levelData.reward > 0 ? `$${levelData.reward.toLocaleString()}` : 'No reward';
        statsMessage += `${status} Level ${level}: ${levelData.current}/${levelData.required} - ${reward}\n`;
      });
      
      await bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('❌ Telegram /stats error:', error);
    }
  });
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
    users
