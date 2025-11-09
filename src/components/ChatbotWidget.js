import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FaComments, FaTimes, FaPaperPlane, FaUser, FaRobot, FaCircle } from 'react-icons/fa';
import socketService from '../services/socket';
import { chatAPI } from '../services/api';

const ChatbotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Initialize session ID
  useEffect(() => {
    let storedSessionId = localStorage.getItem('chatSessionId');
    if (!storedSessionId) {
      storedSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('chatSessionId', storedSessionId);
    }
    setSessionId(storedSessionId);
  }, []);

  // Connect to socket when component mounts or sessionId is available
  useEffect(() => {
    if (!sessionId) return;

    const connectWithIp = async () => {
      let ip = 'unknown';
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        if (data?.ip) ip = data.ip;
      } catch (_) {}

      const socket = socketService.connect(
        sessionId,
        ip,
        navigator.userAgent
      );

      socket.on('user:connected', (data) => {
        setIsConnected(true);
        if (data.sessionId) {
          setSessionId(data.sessionId);
          localStorage.setItem('chatSessionId', data.sessionId);
        }
      });

      socket.on('message:received', (message) => {
        setMessages((prev) => [...prev, message]);
        setIsTyping(false);
        scrollToBottom();
      });

      socket.on('message:sent', (message) => {
        console.log('message:sent', message);
        setMessages((prev) => [...prev, message]);
        scrollToBottom();
      });

      socket.on('typing:admin', () => {
        setIsTyping(true);
      });

      socket.on('typing:admin:stop', () => {
        setIsTyping(false);
      });

      socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setIsConnected(false);
      });

      return () => {
        socketService.disconnect();
      };
    };

    const disconnect = connectWithIp();
    return () => { try { (disconnect && typeof disconnect === 'function') && disconnect(); } catch(_) {} };
  }, [sessionId]);

  // Load existing messages for this session on mount/connect
  useEffect(() => {
    const loadHistory = async () => {
      try {
        if (!sessionId) return;
        const res = await chatAPI.getSessionMessages(sessionId);
        const history = (res.data || []).map((m) => ({
          sessionId: m.session_id,
          message: m.message,
          sender: m.sender,
          senderType: m.sender_type,
          attachmentUrl: m.attachment_url,
          attachmentType: m.attachment_type,
          isAi: m.is_ai,
          timestamp: m.created_at,
        }));
        setMessages(history);
        setTimeout(() => scrollToBottom(), 50);
      } catch (err) {
        // Silently fail for customer widget
      }
    };
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Also keep pinned on typing changes and when opening the widget
  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, isTyping]);

  // Lock body scroll when chat is open on mobile
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll on mobile
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      // Restore body scroll
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !isConnected) return;

    const socket = socketService.getSocket();
    if (!socket) return;

    socket.emit('message:user', {
      sessionId,
      message: inputMessage.trim(),
      sender: 'User',
      senderType: 'user'
    });

    setInputMessage('');
    inputRef.current?.focus();
  };

  const handleTyping = (e) => {
    setInputMessage(e.target.value);
    
    const socket = socketService.getSocket();
    if (socket) {
      socket.emit('typing:start', {
        sessionId,
        senderType: 'user'
      });

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing indicator after 2 seconds of no typing
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing:stop', {
          sessionId,
          senderType: 'user'
        });
      }, 2000);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatDate = (timestamp) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Group messages by calendar day for date separators
  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentDateKey = '';

    messages.forEach((m) => {
      const key = new Date(m.timestamp || m.created_at || Date.now()).toDateString();
      if (key !== currentDateKey) {
        currentDateKey = key;
        groups.push({ type: 'date', key, label: formatDate(m.timestamp || m.created_at || Date.now()) });
      }
      groups.push({ type: 'msg', data: m });
    });

    return groups;
  }, [messages]);

  const fileInputRef = useRef(null);
  const onPickFile = () => fileInputRef.current?.click();
  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !isConnected) return;
    try {
      const res = await chatAPI.upload(file);
      const { url, type } = res.data || {};
      if (url) {
        const socket = socketService.getSocket();
        socket.emit('message:user', {
          sessionId,
          message: '(attachment)',
          sender: 'User',
          senderType: 'user',
          attachmentUrl: url,
          attachmentType: type,
        });
      }
    } catch (err) { /* ignore */ }
  };

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-5 right-5 w-[60px] h-[60px] rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white text-2xl shadow-lg hover:shadow-2xl transition-transform hover:scale-110 flex items-center justify-center ${isOpen ? 'hidden' : ''}`}
        aria-label="Open chat"
      >
        <FaComments />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed inset-0 sm:bottom-5 sm:right-5 sm:left-auto sm:top-auto sm:w-[380px] sm:h-[600px] sm:rounded-2xl w-full h-[100dvh] bg-white rounded-none shadow-2xl flex flex-col overflow-hidden z-[1001]">
          {/* Header */}
          <div className="px-5 py-3 bg-emerald-600 text-white flex items-center justify-between safe-area-inset-top" style={{ paddingTop: `calc(0.75rem + env(safe-area-inset-top, 0px))` }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <FaRobot />
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-none">Customer Support</h3>
                <div className="flex items-center gap-2 text-[11px] opacity-90">
                  <span className={`inline-flex items-center gap-1 ${isConnected ? 'text-white' : 'text-white/70'}`}>
                    <FaCircle className={`text-[8px] ${isConnected ? 'text-green-300' : 'text-yellow-200'}`} />
                    {isConnected ? 'Online' : 'Connecting...'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/90 hover:text-white"
              aria-label="Close chat"
            >
              <FaTimes />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 bg-[length:18px_18px] bg-[radial-gradient(transparent_16px,rgba(16,185,129,0.06)_17px)]">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <FaComments className="text-4xl text-emerald-400 mb-2" />
                <p className="text-gray-600">Start a conversation!</p>
                <p className="text-sm text-gray-400 mt-1">We're here to help you.</p>
              </div>
            )}

            {groupedMessages.map((item, index) => {
              if (item.type === 'date') {
                return (
                  <div key={`date-${item.key}-${index}`} className="flex items-center justify-center my-3">
                    <span className="text-[10px] px-2 py-1 bg-white/70 text-gray-500 rounded-full shadow-sm">
                      {item.label}
                    </span>
                  </div>
                );
              }

              const msg = item.data;
              const isUser = msg.senderType === 'user';

              const hasAttachment = !!(msg.attachmentUrl || msg.attachment_url);

              return (
              <div key={index} className={`mb-2 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex items-end gap-2 max-w-[80%] ${isUser ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar */}
                    <div className={`w-7 h-7 rounded-full ${isUser ? 'bg-emerald-500' : 'bg-gray-300'} text-white flex items-center justify-center text-[11px] shrink-0`}>
                      {isUser ? <FaUser /> : <FaRobot className="text-gray-700" />}
                    </div>

                    {/* Bubble */}
                    <div className={`group relative ${
                      hasAttachment
                        ? ''
                        : isUser
                          ? 'px-3 py-2 rounded-2xl bg-emerald-500 text-white rounded-br-sm'
                          : 'px-3 py-2 rounded-2xl bg-white text-gray-900 rounded-bl-sm shadow'
                    }`}>
                      {/* AI badge */}
                      {(!isUser && msg.isAi) && (
                        <span className={`absolute -top-2 ${isUser ? 'right-2' : 'left-2'} text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200`}>AI</span>
                      )}
                      {hasAttachment ? (
                        (msg.attachmentType || msg.attachment_type || '').startsWith('image') ? (
                          <a href={(msg.attachmentUrl || msg.attachment_url)} target="_blank" rel="noreferrer" className="block">
                            <img src={(msg.attachmentUrl || msg.attachment_url)} alt="attachment" className="max-w-[240px] rounded-xl border border-gray-200" />
                            <span className="block mt-1 text-[10px] text-gray-500 text-right">{formatTime(msg.timestamp)}</span>
                          </a>
                        ) : (
                          <div className="flex items-center gap-2">
                            <a href={(msg.attachmentUrl || msg.attachment_url)} target="_blank" rel="noreferrer" className="underline text-sm text-blue-600">
                              View attachment
                            </a>
                            <span className="text-[10px] text-gray-500">{formatTime(msg.timestamp)}</span>
                          </div>
                        )
                      ) : (
                        <>
                          <p className="whitespace-pre-wrap break-words pr-10 leading-relaxed text-[13px]">{msg.message}</p>
                          {/* Timestamp inside bubble bottom-right */}
                          <span className={`absolute bottom-1 right-2 text-[10px] ${isUser ? 'text-white/80' : 'text-gray-500'}`}>
                            {formatTime(msg.timestamp)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="mb-2 mr-9 flex justify-start">
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white text-gray-700 shadow">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-bounce [animation-delay:.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-bounce [animation-delay:.3s]" />
                  <span className="text-[10px] ml-1">typing…</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendMessage} className="flex gap-2 p-3 bg-white border-t border-gray-200 safe-area-inset-bottom" style={{ paddingBottom: `calc(0.75rem + env(safe-area-inset-bottom, 0px))` }}>
            <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
            <button type="button" onClick={onPickFile} className="w-10 h-10 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">
              📎
            </button>
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={handleTyping}
              placeholder={isConnected ? 'Type a message' : 'Connecting...'}
              disabled={!isConnected}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full outline-none text-sm focus:border-emerald-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || !isConnected}
              className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <FaPaperPlane />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default ChatbotWidget;

