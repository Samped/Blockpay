"use client";

import React, { useState, useEffect } from 'react';
import { Wallet, Send, ArrowLeftRight, CreditCard, Bot, Plus, MessageSquare, Settings, ChevronLeft, ChevronRight, Trash2, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const IntuitionAgentFrontend = () => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState('0.00');
  const TOKEN_ADDRESS: string = ""; 
  const TOKEN_SYMBOL = "tTRUST";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState([
    { id: 1, title: 'New Conversation', timestamp: 'Just now' }
  ]);
  const [currentConvId, setCurrentConvId] = useState(1);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendError, setSendError] = useState('');
  const [showWalletMenu, setShowWalletMenu] = useState(false);

  // Helpers available to both modal and quick actions
  const ensureIntuitionChain = async () => {
    try {
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainIdHex !== '0x350b') { // 13579 in hex
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x350b' }],
          });
        } catch (switchErr) {
          throw new Error('Please switch to Intuition Testnet (chainId 13579) and try again.');
        }
      }
    } catch (err) {
      throw new Error('Unable to verify network. Ensure a wallet is installed.');
    }
  };

  const sendNativeInt = async (to: string, amountStr: string) => {
    const parsed = parseFloat(amountStr);
    if (!to || !amountStr || Number.isNaN(parsed) || parsed <= 0) throw new Error('Invalid recipient or amount');
    const amountWei = BigInt(Math.round(parsed * 1e18));
    const txParams = {
      from: walletAddress,
      to,
      value: '0x' + amountWei.toString(16),
    } as any;
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });
    return txHash;
  };

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        setWalletAddress(accounts[0]);
        setWalletConnected(true);
        
        // Fetch balance dynamically
        await refreshBalance(accounts[0]);
        
        addMessage('system', 'Wallet connected successfully! You can now execute transactions.');
      } catch (error) {
        addMessage('system', 'Failed to connect wallet: ' + error.message);
      }
    } else {
      addMessage('system', 'Please install MetaMask or another Web3 wallet to continue.');
    }
  };

  const disconnectWallet = () => {
    setWalletConnected(false);
    setWalletAddress('');
    setBalance('0.00');
    setShowWalletMenu(false);
    addMessage('system', 'Wallet disconnected successfully.');
  };

  const getNativeBalance = async (address: string) => {
    try {
      const balanceHex = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });
      
      if (!balanceHex || balanceHex === '0x' || balanceHex === '0x0') {
        return '0.00';
      }
      
      const balanceWei = BigInt(balanceHex);
      const divisor = BigInt(10 ** 18);
      const wholePart = balanceWei / divisor;
      const remainder = balanceWei % divisor;
      
      // Convert to string with proper decimal places
      const wholeStr = wholePart.toString();
      const remainderStr = remainder.toString().padStart(18, '0');
      
      // Format: combine whole and fractional parts
      const formatted = `${wholeStr}.${remainderStr}`;
      
      // Remove trailing zeros and limit to 8 decimal places for display
      const parts = formatted.split('.');
      let decimalPart = parts[1]?.replace(/0+$/, '') || '0';
      if (decimalPart.length > 8) decimalPart = decimalPart.slice(0, 8);
      
      return decimalPart === '0' ? parts[0] : `${parts[0]}.${decimalPart}`;
    } catch (err) {
      console.error('Error fetching native balance:', err);
      return '0.00';
    }
  };

  const rpcCall = async (to: string, data: string) => {
    const result = await window.ethereum.request({
      method: 'eth_call',
      params: [ { to, data }, 'latest' ]
    });
    return result as string;
  };

  const padAddress = (addr: string) => '0x' + '000000000000000000000000' + addr.toLowerCase().slice(2);

  const getErc20Decimals = async () => {
    const data = '0x313ce567'; // decimals()
    const res = await rpcCall(TOKEN_ADDRESS, data);
    return parseInt(res, 16) || 18;
  };

  const getErc20Balance = async (address: string) => {
    try {
      const selector = '0x70a08231'; // balanceOf(address)
      const paddedAddr = address.toLowerCase().startsWith('0x') 
        ? address.toLowerCase().slice(2).padStart(64, '0')
        : address.toLowerCase().padStart(64, '0');
      const data = selector + paddedAddr;
      const res = await rpcCall(TOKEN_ADDRESS, data);
      
      if (!res || res === '0x') {
        return '0.00';
      }
      
      const decimals = await getErc20Decimals();
      const bal = BigInt(res);
      
      // Use proper decimal handling with BigInt to avoid precision loss
      const divisor = BigInt(10 ** decimals);
      const wholePart = bal / divisor;
      const remainder = bal % divisor;
      
      // Convert to string with proper decimal places
      const wholeStr = wholePart.toString();
      const remainderStr = remainder.toString().padStart(decimals, '0');
      
      // Format: combine whole and fractional parts
      const formatted = `${wholeStr}.${remainderStr}`;
      
      // Remove trailing zeros and limit to 8 decimal places for display
      const parts = formatted.split('.');
      let decimalPart = parts[1]?.replace(/0+$/, '') || '0';
      if (decimalPart.length > 8) decimalPart = decimalPart.slice(0, 8);
      
      return decimalPart === '0' ? parts[0] : `${parts[0]}.${decimalPart}`;
    } catch (err) {
      console.error('Error fetching ERC20 balance:', err);
      return '0.00';
    }
  };

  // Unified function to refresh balance dynamically
  const refreshBalance = async (address?: string) => {
    const addr = address || walletAddress;
    if (!addr) return;
    try {
      let newBalance: string;
      if (TOKEN_ADDRESS && TOKEN_ADDRESS.startsWith('0x') && TOKEN_ADDRESS.length === 42) {
        console.log('Fetching ERC20 token balance for:', TOKEN_ADDRESS);
        newBalance = await getErc20Balance(addr);
        console.log('ERC20 balance result:', newBalance);
      } else {
        console.log('Fetching native balance');
        newBalance = await getNativeBalance(addr);
        console.log('Native balance result:', newBalance);
      }
      setBalance(newBalance);
    } catch (err) {
      console.error('Failed to refresh balance:', err);
      // Don't update balance on error, keep showing the last known value
    }
  };

  // Listen for account changes and refresh balance
  useEffect(() => {
    if (!window.ethereum) return;
    
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0 && accounts[0] !== walletAddress) {
        setWalletAddress(accounts[0]);
        refreshBalance(accounts[0]);
      }
    };

    const handleChainChanged = () => {
      refreshBalance();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    // Refresh balance periodically when wallet is connected
    let intervalId: NodeJS.Timeout | null = null;
    if (walletConnected && walletAddress) {
      refreshBalance();
      intervalId = setInterval(() => refreshBalance(), 10000); // Refresh every 10 seconds
    }

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
      if (intervalId) clearInterval(intervalId);
    };
  }, [walletConnected, walletAddress]);

  const addMessage = (role, content, action = null) => {
    const newMsg = {
      id: Date.now(),
      role,
      content,
      action,
      timestamp: new Date().toLocaleTimeString()
    };
    setMessages(prev => [...prev, newMsg]);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;
    if (!walletConnected) {
      addMessage('system', 'Please connect your wallet first to send messages to the agent.');
      return;
    }

    const userMessage = inputText.trim();
    setInputText('');
    addMessage('user', userMessage);
    setIsProcessing(true);

    try {
      const payload = { 
        userMessage: userMessage,
        walletAddress: walletConnected ? walletAddress : null
      };
      
      console.log("Sending payload:", payload);

      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log("Response data:", data);

      if (!response.ok) {
        const errorMsg = data.error || `HTTP error! status: ${response.status}`;
        addMessage("system", `Error: ${errorMsg}`);
        setIsProcessing(false);
        return;
      }

      if (data.reply && typeof data.reply === 'string' && data.reply.trim()) {
        addMessage("assistant", data.reply);
      } else if (data.error) {
        addMessage("system", `Error: ${data.error}`);
      } else {
        addMessage("system", "Received empty response from agent. Please try again.");
      }
    } catch (err) {
      console.error("Agent error:", err);
      addMessage("system", "Failed to contact agent. Check your connection and try again.");
    }

    setIsProcessing(false);
  };

  const executeAction = async (action) => {
    if (!walletConnected) {
      addMessage('system', 'Please connect your wallet first to execute transactions.');
      return;
    }

    setIsProcessing(true);
    addMessage('assistant', `Executing ${action} operation...`);
    
    // helpers are now hoisted above
    
    switch(action) {
      case 'buy':
        addMessage('system', 'Buy order executed successfully!\n\nToken: tTrust\nAmount: 100 tokens\nPrice: 0.1 tTrust\nTx: 0x7a8f...3d2e');
        break;
      case 'send':
        setSendError('');
        setShowSendModal(true);
        setIsProcessing(false);
        return; // exit early; confirm handler will process
      case 'swap':
        addMessage('system', 'Swap completed!\n\nFrom: 100 tTrust\nTo: 0.095 tTrust\nSlippage: 0.5%\nTx: 0x3e5d...7c8b');
        break;
      case 'pay':
        addMessage('system', 'Payment processed with attestation!\n\nRecipient: merchant.intuition\nAmount: 25 tTrust\nAtom ID: 0x6f2a...9d1e');
        break;
    }
    
    setIsProcessing(false);
  };

  const newConversation = () => {
    const newId = conversations.length + 1;
    setConversations(prev => [{
      id: newId,
      title: 'New Conversation',
      timestamp: 'Just now'
    }, ...prev]);
    setCurrentConvId(newId);
    setMessages([]);
  };

  const shortenAddress = (addr) => {
    return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
  };

  // Clean agent responses: replace ETH with tTrust
  const cleanAgentResponse = (content: string) => {
    if (!content) return content;
    // Replace ETH mentions with tTrust (case-insensitive, whole word)
    return content
      .replace(/\bETH\b/g, 'tTrust')
      .replace(/\beth\b/g, 'tTrust')
      .replace(/\bEthereum\b/g, 'Intuition')
      .replace(/\bethereum\b/g, 'Intuition');
  };

  return (
    <>
    <div className={`fixed inset-0 flex h-screen w-screen bg-black text-white overflow-hidden ${showSendModal ? 'pointer-events-none' : ''}`} style={{fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif', fontFeatureSettings: '"cv11", "ss01"', letterSpacing: '-0.011em'}}>
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 bg-zinc-950 border-r border-zinc-800 flex flex-col overflow-hidden`}>
        <div className="p-4 border-b border-zinc-800">
          <button
            onClick={newConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            New chat
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setCurrentConvId(conv.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors group ${
                currentConvId === conv.id ? 'bg-zinc-800' : 'hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{conv.title}</div>
                  <div className="text-xs text-zinc-500">{conv.timestamp}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-zinc-800">
          <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-900 rounded-lg transition-colors text-sm text-zinc-400">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-zinc-900 rounded-lg transition-colors"
            >
              {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Logo" className="h-10 w-auto object-contain rounded px-2 py-1 ring-1 ring-zinc-300 dark:ring-zinc-700 bg-white dark:bg-white" />
              <span className="font-medium">BlockPay </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {walletConnected ? (
              <>
                <div className="text-sm text-zinc-400">
                  {balance} {TOKEN_ADDRESS ? TOKEN_SYMBOL : 'tTrust'}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowWalletMenu(!showWalletMenu)}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-sm font-mono transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    {shortenAddress(walletAddress)}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showWalletMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowWalletMenu(false)}
                      ></div>
                      <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-20 overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-800">
                          <div className="text-xs text-zinc-400 mb-1">Connected Wallet</div>
                          <div className="text-sm font-mono text-zinc-200 break-all">{walletAddress}</div>
                        </div>
                        <button
                          onClick={disconnectWallet}
                          className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-zinc-800 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Disconnect Wallet
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={connectWallet}
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 rounded-lg text-sm font-medium transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-24 h-24 bg-sky-500/10 rounded-2xl mb-4">
                  <img src="/logo.png" alt="Logo" className="w-24 h-24 object-contain rounded ring-1 ring-zinc-300 dark:ring-zinc-700 bg-white dark:bg-white" />
                </div>
                <h2 className="text-2xl font-medium mb-2">BlockPay Agent</h2>
                <p className="text-zinc-500 mb-8">
                  Your autonomous DeFi assistant on Intuition Network
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                  <button
                    onClick={() => addMessage('user', 'How can I buy tokens?')}
                    className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-left text-sm transition-colors"
                  >
                    How can I buy tokens?
                  </button>
                  <button
                    onClick={() => addMessage('user', 'Help me swap tokens')}
                    className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-left text-sm transition-colors"
                  >
                    Help me swap tokens
                  </button>
                  <button
                    onClick={() => addMessage('user', 'Send tokens to someone')}
                    className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-left text-sm transition-colors"
                  >
                    Send tokens to someone
                  </button>
                  <button
                    onClick={() => addMessage('user', 'Make a payment')}
                    className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-left text-sm transition-colors"
                  >
                    Make a payment
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    {msg.role !== 'user' && (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ring-zinc-300 dark:ring-zinc-700 bg-white dark:bg-white">
                        <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <div className={`flex-1 max-w-2xl ${msg.role === 'user' ? 'text-right' : ''}`}>
                      <div className={`inline-block text-left ${
                        msg.role === 'user' 
                          ? 'bg-sky-500 px-4 py-2.5 rounded-2xl' 
                          : msg.role === 'system'
                          ? 'bg-zinc-900 px-4 py-2.5 rounded-xl border border-zinc-800'
                          : ''
                      }`}>
                        <div className="text-sm leading-relaxed prose prose-invert max-w-none text-white [&_strong]:font-bold [&_strong]:text-white [&_*]:text-white [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-4 [&_li]:mb-1">
                          {msg.role === 'assistant' || msg.role === 'system' ? (
                            <ReactMarkdown>
                              {cleanAgentResponse(msg.content)}
                            </ReactMarkdown>
                          ) : (
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          )}
                        </div>
                        {msg.action && (
                          <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-700">
                            <button
                              onClick={() => executeAction(msg.action)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition-colors"
                            >
                              Execute {msg.action}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-zinc-600 mt-1 px-1">{msg.timestamp}</div>
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm">You</span>
                      </div>
                    )}
                  </div>
                ))}
                {isProcessing && (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ring-zinc-300 dark:ring-zinc-700 bg-white dark:bg-white">
                      <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                      <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                      <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-zinc-800 p-4">
          <div className="max-w-3xl mx-auto">
            {/* Quick Action Buttons */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => executeAction('buy')}
                disabled={isProcessing || !walletConnected}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-950 disabled:text-zinc-700 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Wallet className="w-3.5 h-3.5" />
                Buy
              </button>
              <button
                onClick={() => executeAction('send')}
                disabled={isProcessing || !walletConnected}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-950 disabled:text-zinc-700 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
              <button
                onClick={() => executeAction('swap')}
                disabled={isProcessing || !walletConnected}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-950 disabled:text-zinc-700 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Swap
              </button>
              <button
                onClick={() => executeAction('pay')}
                disabled={isProcessing || !walletConnected}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-950 disabled:text-zinc-700 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Payment
              </button>
            </div>

            {/* Text Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && walletConnected && handleSendMessage()}
                placeholder={walletConnected ? "Message BlockPay Agent..." : "Connect wallet to send messages..."}
                disabled={isProcessing || !walletConnected}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSendMessage}
                disabled={isProcessing || !inputText.trim() || !walletConnected}
                className="px-6 py-3 bg-sky-500 hover:bg-sky-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-xl font-medium transition-colors text-sm"
              >
                Send
              </button>
            </div>

            <div className="text-xs text-zinc-600 text-center mt-2">
              {!walletConnected ? (
                <span className="text-amber-400">Please connect your wallet to interact with the agent.</span>
              ) : (
                "AI agent can make mistakes. Verify transactions before confirming."
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* Centered Send Modal */}
    {showSendModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70"></div>
        {/* Modal */}
        <div className="relative w-full max-w-md mx-auto rounded-2xl shadow-xl border border-blue-700/50 overflow-hidden pointer-events-auto"
             style={{background: 'linear-gradient(180deg, rgba(9,14,37,0.98) 0%, rgba(7,11,28,0.98) 100%)'}}>
          <div className="px-6 py-5 border-b border-blue-800/60 flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-7 h-7 object-contain rounded bg-white" />
            <h3 className="text-lg font-semibold text-blue-200">Send tTrust</h3>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs text-blue-300 mb-1">Recipient Address</label>
              <input
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="0x..."
                className="w-full bg-blue-950/50 border border-blue-800 rounded-lg px-3 py-2 text-sm text-blue-100 placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-blue-300 mb-1">Amount (tTrust)</label>
              <input
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                placeholder="e.g. 0.1"
                className="w-full bg-blue-950/50 border border-blue-800 rounded-lg px-3 py-2 text-sm text-blue-100 placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {sendError && <div className="text-xs text-red-400">{sendError}</div>}
          </div>
          <div className="px-6 py-4 border-t border-blue-800/60 flex items-center justify-end gap-2 bg-blue-950/40">
            <button
              onClick={() => setShowSendModal(false)}
              className="px-4 py-2 rounded-lg text-sm text-blue-200 hover:bg-blue-900/50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                try {
                  setSendError('');
                  setIsProcessing(true);
                  await ensureIntuitionChain();
                  const hash = await sendNativeInt(sendTo.trim(), sendAmount.trim());
                  addMessage('system', `Sent tTrust successfully.\n\nTo: ${sendTo}\nAmount: ${sendAmount}\nTx: ${hash}`);
                  setShowSendModal(false);
                  setSendTo('');
                  setSendAmount('');
                  // Refresh balance after sending (wait a moment for tx to be included)
                  setTimeout(() => refreshBalance(), 2000);
                } catch (e: any) {
                  const msg = e?.message || String(e);
                  setSendError(msg);
                  addMessage('system', 'Send failed: ' + msg);
                } finally {
                  setIsProcessing(false);
                }
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default IntuitionAgentFrontend;