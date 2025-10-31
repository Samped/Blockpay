"use client";

import React, { useState, useEffect } from 'react';
import { Wallet, Send, ArrowLeftRight, CreditCard, Bot, Plus, MessageSquare, Settings, ChevronLeft, ChevronRight, Trash2, Clock } from 'lucide-react';

const IntuitionAgentFrontend = () => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState('0.00');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState([
    { id: 1, title: 'New Conversation', timestamp: 'Just now' }
  ]);
  const [currentConvId, setCurrentConvId] = useState(1);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        setWalletAddress(accounts[0]);
        setWalletConnected(true);
        
        const balanceHex = await window.ethereum.request({
          method: 'eth_getBalance',
          params: [accounts[0], 'latest']
        });
        const balanceEth = parseInt(balanceHex, 16) / 1e18;
        setBalance(balanceEth.toFixed(4));
        
        addMessage('system', 'Wallet connected successfully! You can now execute transactions.');
      } catch (error) {
        addMessage('system', 'Failed to connect wallet: ' + error.message);
      }
    } else {
      addMessage('system', 'Please install MetaMask or another Web3 wallet to continue.');
    }
  };

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
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    switch(action) {
      case 'buy':
        addMessage('system', 'Buy order executed successfully!\n\nToken: TRUST\nAmount: 100 tokens\nPrice: 0.1 ETH\nTx: 0x7a8f...3d2e');
        break;
      case 'send':
        addMessage('system', 'Tokens sent successfully!\n\nTo: 0x742d...0bEb\nAmount: 50 TRUST\nTx: 0x9b1c...4f3a');
        break;
      case 'swap':
        addMessage('system', 'Swap completed!\n\nFrom: 100 TRUST\nTo: 0.095 ETH\nSlippage: 0.5%\nTx: 0x3e5d...7c8b');
        break;
      case 'pay':
        addMessage('system', 'Payment processed with attestation!\n\nRecipient: merchant.intuition\nAmount: 25 TRUST\nAtom ID: 0x6f2a...9d1e');
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

  return (
    <div className="fixed inset-0 flex h-screen w-screen bg-black text-white overflow-hidden" style={{fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif', fontFeatureSettings: '"cv11", "ss01"', letterSpacing: '-0.011em'}}>
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
                  {balance} INT
                </div>
                <div className="px-3 py-1.5 bg-zinc-900 rounded-lg text-sm font-mono">
                  {shortenAddress(walletAddress)}
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
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
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
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="Message BlockPay Agent..."
                disabled={isProcessing}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSendMessage}
                disabled={isProcessing || !inputText.trim()}
                className="px-6 py-3 bg-sky-500 hover:bg-sky-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-xl font-medium transition-colors text-sm"
              >
                Send
              </button>
            </div>

            <div className="text-xs text-zinc-600 text-center mt-2">
              AI agent can make mistakes. Verify transactions before confirming.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntuitionAgentFrontend;