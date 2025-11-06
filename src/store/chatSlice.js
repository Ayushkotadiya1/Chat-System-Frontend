import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  sessions: [],
  selectedSession: null,
  messagesBySession: {},
  typingBySession: {},
  aiEnabledBySession: {},
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setSessions(state, action) {
      state.sessions = action.payload || [];
      // keep ai flags if present
      for (const s of state.sessions) {
        if (typeof s.ai_enabled === 'boolean') {
          state.aiEnabledBySession[s.session_id] = s.ai_enabled;
        }
      }
    },
    setSelectedSession(state, action) {
      state.selectedSession = action.payload;
    },
    setMessages(state, action) {
      const { sessionId, messages } = action.payload;
      state.messagesBySession[sessionId] = messages || [];
    },
    addMessage(state, action) {
      const msg = action.payload;
      const sessionId = msg.sessionId || msg.session_id;
      if (!sessionId) return;
      if (!state.messagesBySession[sessionId]) state.messagesBySession[sessionId] = [];
      state.messagesBySession[sessionId].push(msg);
    },
    setTyping(state, action) {
      const { sessionId, typing } = action.payload;
      state.typingBySession[sessionId] = typing;
    },
    setAiEnabled(state, action) {
      const { sessionId, enabled } = action.payload;
      state.aiEnabledBySession[sessionId] = enabled;
    },
  },
});

export const { setSessions, setSelectedSession, setMessages, addMessage, setTyping, setAiEnabled } = chatSlice.actions;
export default chatSlice.reducer;


