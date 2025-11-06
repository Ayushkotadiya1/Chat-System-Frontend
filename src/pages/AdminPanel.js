import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSignOutAlt, FaComments, FaUser, FaClock, FaPaperPlane, FaArrowLeft } from 'react-icons/fa';
import { chatAPI } from '../services/api';
import adminSocketService from '../services/adminSocket';
import { useDispatch, useSelector } from 'react-redux';
import { setSessions as setSessionsRedux, setSelectedSession as setSelectedSessionRedux, setMessages as setMessagesRedux, addMessage, setTyping as setTypingRedux, setAiEnabled as setAiEnabledRedux } from '../store/chatSlice';

const AdminPanel = () => {
  const dispatch = useDispatch();
  const sessions = useSelector((s) => s.chat.sessions);
  const selectedSession = useSelector((s) => s.chat.selectedSession);
  const messages = useSelector((s) => s.chat.messagesBySession[selectedSession?.session_id || '']) || [];
  const [activeTab, setActiveTab] = useState('active');
  const [showListMobile, setShowListMobile] = useState(true); // controls list/chat visibility on small screens
  const aiEnabled = useSelector((s) => (selectedSession?.session_id ? s.chat.aiEnabledBySession[selectedSession.session_id] : false)) || false;
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const isTyping = useSelector((s) => (selectedSession?.session_id ? s.chat.typingBySession[selectedSession.session_id] : false)) || false;
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin/login');
      return;
    }

    // Verify token
    chatAPI.getSessions()
      .then(() => {
        // Connect socket
        adminSocketService.connect(token);
      })
      .catch(() => {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
      });
  }, [navigate]);

  // Load sessions
  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5001); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Setup socket listeners
  useEffect(() => {
    const socket = adminSocketService.getSocket();
    if (!socket) return;

    socket.on('message:new', (message) => {
      if (selectedSession?.session_id === message.sessionId) {
        const normalized = {
          ...message,
          sender_type: message.senderType,
          created_at: message.timestamp,
        };
        dispatch(addMessage(normalized));
      }
      loadSessions(); // Refresh sessions list
    });

    // When admin sends a message, the server echoes back 'message:sent'
    socket.on('message:sent', (message) => {
      if (selectedSession?.session_id === message.sessionId && message.senderType === 'admin') {
        const normalized = {
          ...message,
          sender_type: message.senderType,
          created_at: message.timestamp,
        };
        dispatch(addMessage(normalized));
        setTimeout(() => scrollToBottom(), 50);
      }
    });

    socket.on('typing:user', (data) => {
      if (selectedSession?.session_id === data.sessionId) {
        dispatch(setTypingRedux({ sessionId: data.sessionId, typing: true }));
      }
    });

    socket.on('typing:user:stop', () => {
      if (selectedSession?.session_id) dispatch(setTypingRedux({ sessionId: selectedSession.session_id, typing: false }));
    });

    return () => {
      socket.off('message:new');
      socket.off('message:sent');
      socket.off('typing:user');
      socket.off('typing:user:stop');
    };
  }, [selectedSession]);

  const loadSessions = async () => {
    try {
      const response = activeTab === 'active' ? await chatAPI.getActiveSessions() : await chatAPI.getPastSessions();
      dispatch(setSessionsRedux(response.data));
      setLoading(false);
    } catch (error) {
      console.error('Error loading sessions:', error);
      if (error.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
      }
    }
  };

  const handleSessionSelect = async (session) => {
    dispatch(setSelectedSessionRedux(session));
    dispatch(setAiEnabledRedux({ sessionId: session.session_id, enabled: session.ai_enabled || false }));
    if (session?.session_id) dispatch(setTypingRedux({ sessionId: session.session_id, typing: false }));
    try {
      const response = await chatAPI.getSessionMessages(session.session_id);
      console.log(response);
      dispatch(setMessagesRedux({ sessionId: session.session_id, messages: response.data }));
      setTimeout(() => scrollToBottom(), 100);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
    // On small screens, hide the list and show chat after selecting
    setShowListMobile(false);
  };

  const handleToggleAi = async () => {
    if (!selectedSession) return;
    try {
      const next = !aiEnabled;
      dispatch(setAiEnabledRedux({ sessionId: selectedSession.session_id, enabled: next }));
      await chatAPI.toggleAi(selectedSession.session_id, next);
      loadSessions();
    } catch (e) {
      dispatch(setAiEnabledRedux({ sessionId: selectedSession.session_id, enabled: aiEnabled }));
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !selectedSession) return;

    const socket = adminSocketService.getSocket();
    if (!socket) return;

    socket.emit('message:admin', {
      sessionId: selectedSession.session_id,
      message: inputMessage.trim(),
      sender: 'Admin',
      senderType: 'admin'
    });

    setInputMessage('');
    inputRef.current?.focus();
    setTimeout(() => scrollToBottom(), 100);
  };

  const onPickFile = () => fileInputRef.current?.click();
  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSession) return;
    try {
      const res = await chatAPI.upload(file);
      const { url, type } = res.data || {};
      const socket = adminSocketService.getSocket();
      socket.emit('message:admin', {
        sessionId: selectedSession.session_id,
        message: '(attachment)',
        sender: 'Admin',
        senderType: 'admin',
        attachmentUrl: url,
        attachmentType: type,
      });
    } catch (err) { /* ignore */ }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Keep view pinned to bottom when typing indicator toggles
  useEffect(() => {
    scrollToBottom();
  }, [isTyping]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    adminSocketService.disconnect();
    navigate('/admin/login');
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

  const getStatusBadge = (status) => {
    return status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  // Sidebar time formatting similar to popular chat apps
  const formatSidebarTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const isSameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    if (isSameDay) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (isYesterday) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Group messages for date separators
  const groupedMessages = useMemo(() => {
    const out = [];
    let lastKey = '';
    messages.forEach((m) => {
      const key = new Date(m.created_at || Date.now()).toDateString();
      if (key !== lastKey) {
        lastKey = key;
        out.push({ type: 'date', key, label: formatDate(m.created_at || Date.now()) });
      }
      out.push({ type: 'msg', data: m });
    });
    return out;
  }, [messages]);

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-900 to-blue-800 flex items-center justify-center p-6">
        {/* Animated gradient orbs */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/30 blur-3xl rounded-full animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-500/30 blur-3xl rounded-full animate-pulse [animation-delay:300ms]" />

        <div className="relative z-10 w-full max-w-md">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl">
            {/* Premium spinner */}
            <div className="mx-auto h-16 w-16 relative">
              <div className="absolute inset-0 rounded-full border-4 border-white/10" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-400 animate-spin" />
              <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 opacity-20" />
            </div>

            <h2 className="mt-6 text-center text-white text-xl font-semibold tracking-wide">
              Preparing your Admin Panel
            </h2>
            <p className="mt-2 text-center text-white/70 text-sm">
              Loading chat sessions, messages, and live connections…
            </p>

            {/* Skeleton shimmer */}
            <div className="mt-6 space-y-3">
              <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_1.6s_infinite]" />
              </div>
              <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-2/3 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_1.6s_infinite] [animation-delay:200ms]" />
              </div>
              <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_1.6s_infinite] [animation-delay:400ms]" />
              </div>
            </div>

            {/* Subtle tips */}
            <div className="mt-6 text-center">
              <span className="inline-flex items-center gap-2 text-[11px] text-white/60 px-3 py-1 rounded-full border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live sockets warming up
              </span>
            </div>
          </div>
        </div>

        {/* keyframes */}
        <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
      </div>
    );
  }
  console.log(groupedMessages);
  return (
    <div className="h-screen overflow-hidden bg-gray-100 flex flex-col">
      <div className="bg-white px-4 md:px-8 py-3 md:py-4 border-b border-gray-200 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <FaComments className="text-xl md:text-2xl text-blue-600" />
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Admin Panel</h1>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-3 md:px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md font-medium"
        >
          <FaSignOutAlt />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Sessions List */}
        <div className={`${showListMobile ? 'block' : 'hidden'} md:flex w-full md:w-[350px] bg-white border-b md:border-b-0 md:border-r border-gray-200 flex-col overflow-hidden`}> 
          <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base md:text-lg font-semibold text-gray-800">Chat Sessions</h2>
            <span className="bg-blue-500 text-white px-2.5 md:px-3 py-0.5 rounded-full text-xs md:text-sm font-semibold">{sessions.length}</span>
          </div>
          <div className="px-4 pt-3 flex flex-wrap gap-2">
            <button onClick={() => { setActiveTab('active'); loadSessions(); }} className={`px-3 py-1 rounded-full text-sm ${activeTab==='active' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Active</button>
            <button onClick={() => { setActiveTab('past'); loadSessions(); }} className={`px-3 py-1 rounded-full text-sm ${activeTab==='past' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>Past</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 md:p-4 pt-2">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <FaComments className="text-4xl text-gray-400 mb-2" />
                <p className="text-gray-500">No chat sessions yet</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => handleSessionSelect(session)}
                  className={`group px-3 py-3 border border-gray-200 rounded-xl mb-2 cursor-pointer transition ${
                    selectedSession?.session_id === session.session_id ? 'border-blue-500 bg-blue-50 shadow' : 'bg-white hover:shadow-sm'
                  }`}
                >
                  {/* Top row: avatar + name + time */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm shrink-0">
                      <FaUser />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="font-semibold text-gray-900 text-sm truncate">
                          {session.session_id.substring(0, 26)}...
                        </span>
                        <span className="text-[10px] md:text-[11px] text-gray-500 whitespace-nowrap">
                          {formatSidebarTime(session.last_message_at || session.created_at)}
                        </span>
                      </div>
                      {/* Last message preview */}
                      <div className="text-[11px] md:text-xs text-gray-500 truncate">
                        {session.last_message
                          ? `${session.last_sender_type === 'admin' ? 'You: ' : 'Customer: '}${session.last_message}`
                          : 'No messages yet'}
                      </div>
                    </div>
                  </div>
                  {/* Bottom meta: status and count */}
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] md:text-[10px] font-semibold ${getStatusBadge(session.status)}`}>
                      {session.status}
                    </span>
                    <div className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <FaComments />
                      <span>{session.message_count || 0}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`${showListMobile ? 'hidden' : 'flex'} md:flex flex-1 flex-col overflow-hidden`}>
          {selectedSession ? (
            <>
              <div className="px-4 md:px-6 py-3 bg-white border-b border-gray-200">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Back button for small screens */}
                  <button onClick={() => setShowListMobile(true)} className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-700">
                    <FaArrowLeft />
                  </button>
                  <h3 className="font-semibold text-gray-800 whitespace-nowrap text-sm md:text-base">Chat with Customer</h3>
                  {showListMobile && <span className="text-xs md:text-sm text-gray-500 truncate">
                    {selectedSession.session_id}
                  </span>}
                  <div className="ml-auto flex items-center gap-2">
                    {/* Device info chips */}
                    <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px]">IP: {selectedSession.user_ip || 'n/a'}</span>
                    <span className="hidden lg:inline px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] max-w-[220px] truncate" title={selectedSession.user_agent || ''}>Agent: {selectedSession.user_agent || 'n/a'}</span>
                    {/* AI toggle pill button */}
                    <button onClick={handleToggleAi} className={`px-3 py-1 rounded-full text-[12px] font-medium border ${aiEnabled ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'} hover:opacity-90`}>{aiEnabled ? 'AI ON' : 'AI OFF'}</button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 md:p-5 bg-[length:18px_18px] bg-[radial-gradient(transparent_16px,rgba(59,130,246,0.06)_17px)]">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <FaComments className="text-4xl text-gray-400 mb-2" />
                    <p className="text-gray-500">No messages in this conversation</p>
                  </div>
                ) : (
                  groupedMessages.map((item, idx) => {
                    if (item.type === 'date') {
                      return (
                        <div key={`date-${item.key}-${idx}`} className="flex items-center justify-center my-3">
                          <span className="text-[10px] px-2 py-1 bg-white/70 text-gray-500 rounded-full shadow-sm">
                            {item.label}
                          </span>
                        </div>
                      );
                    }

                    const msg = item.data;
                    const isAdmin = (msg.sender_type || msg.senderType) === 'admin';
                    const hasAttachment = !!(msg.attachment_url || msg.attachmentUrl);

                    return (
                      <div
                        key={msg.id}
                        className={`mb-2 flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex items-end gap-2 max-w-[92%] md:max-w-[78%] ${isAdmin ? 'flex-row-reverse' : ''}`}>
                          {/* Avatar */}
                          <div className={`w-7 h-7 rounded-full ${isAdmin ? 'bg-blue-500 text-white' : 'bg-gray-300'} flex items-center justify-center text-[11px]`}>
                            <FaUser />
                          </div>

                          {/* Bubble */}
                          <div className={`relative ${
                            hasAttachment
                              ? ''
                              : (isAdmin
                                  ? 'px-3 py-2 rounded-2xl bg-blue-600 text-white rounded-br-sm'
                                  : 'px-3 py-2 rounded-2xl bg-white text-gray-900 rounded-bl-sm shadow')
                          }`}>
                            {/* AI badge */}
                            {msg.is_ai && (
                              <span className={`absolute -top-2 ${isAdmin ? 'right-2' : 'left-2'} text-[10px] px-1.5 py-0.5 rounded ${isAdmin ? 'bg-white/30 text-white' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>AI</span>
                            )}
                            { hasAttachment ? (
                              ((msg.attachment_type || msg.attachmentType) || '').startsWith('image') ? (
                                <a href={(msg.attachment_url || msg.attachmentUrl)} target="_blank" rel="noreferrer" className="block">
                                  <img src={(msg.attachment_url || msg.attachmentUrl)} alt="attachment" className="w-full md:max-w-[280px] rounded-xl border border-gray-200" />
                                  <span className="block mt-1 text-[10px] text-gray-500 text-right">{formatTime(msg.created_at || msg.timestamp)}</span>
                                </a>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <a href={(msg.attachment_url || msg.attachmentUrl)} target="_blank" rel="noreferrer" className={`${isAdmin ? 'text-white' : 'text-blue-600'} underline text-sm`}>View attachment</a>
                                  <span className="text-[10px] text-gray-500">{formatTime(msg.created_at || msg.timestamp)}</span>
                                </div>
                              )
                            ) : (
                              <>
                                <p className="whitespace-pre-wrap break-words pr-12 leading-relaxed text-[13px]">{msg.message}</p>
                                <span className={`absolute bottom-1 right-2 text-[10px] ${isAdmin ? 'text-white/80' : 'text-gray-500'}`}>{formatTime(msg.created_at || msg.timestamp)}</span>
                              </>
                            ) }
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {isTyping && (
                  <div className="mb-2 ml-9 flex justify-start">
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white text-gray-700 shadow">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-bounce [animation-delay:.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-bounce [animation-delay:.3s]" />
                      <span className="text-[10px] ml-1">typing…</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="flex gap-3 p-3 border-t border-gray-200 bg-white">
                <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
                <button type="button" onClick={onPickFile} className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">📎</button>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Type your reply..."
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full outline-none text-sm focus:border-blue-500"
                />
                <button type="submit" disabled={!inputMessage.trim()} className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center justify-center">
                  <FaPaperPlane />
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <FaComments className="text-6xl text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                Select a chat session
              </h3>
              <p className="text-gray-500">
                Choose a conversation from the left panel to view and reply to messages
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;

