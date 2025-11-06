import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ChatbotWidget from './components/ChatbotWidget';
import AdminPanel from './pages/AdminPanel';
import AdminLogin from './pages/AdminLogin';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/" element={
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
              <div className="container mx-auto px-4 py-16">
                <h1 className="text-4xl font-bold text-center text-gray-800 mb-4">
                  Welcome to Our Chatbot
                </h1>
                <p className="text-center text-gray-600 mb-8">
                  Click the chat button in the bottom right corner to start chatting!
                </p>
              </div>
            </div>
          } />
        </Routes>
        {/* Chatbot widget appears on all pages except admin */}
        <Routes>
          <Route path="/admin/*" element={null} />
          <Route path="*" element={<ChatbotWidget />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

