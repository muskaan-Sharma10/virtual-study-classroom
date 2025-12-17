import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';

const Chat = ({ socket, roomId, userId, username }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('chat-message', (message) => {
      setMessages((prev) => {
        // Prevent duplicates from optimistic updates
        // Check if a message with the same content and very recent timestamp acts as a duplicate
        const isDuplicate = prev.some(m =>
          m.username === message.username &&
          m.content === message.content &&
          m.fileUrl === message.fileUrl &&
          Math.abs(new Date(m.timestamp) - new Date(message.timestamp)) < 1000
        );
        if (isDuplicate) return prev;
        return [...prev, message];
      });
    });

    return () => {
      socket.off('chat-message');
    };
  }, [socket]);

  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e) => {
    e && e.preventDefault();
    if (!newMessage.trim() || !socket) return;

    const messageData = {
      roomId,
      userId,
      username,
      content: newMessage,
      timestamp: new Date().toISOString()
    };

    socket.emit('chat-message', messageData);

    // Optimistically add message to UI
    setMessages((prev) => [...prev, messageData]);

    setNewMessage('');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { fileUrl, type } = response.data;

      const messageData = {
        roomId,
        userId,
        username,
        content: `Shared a file: ${file.name}`,
        fileUrl,
        fileName: file.name,
        fileType: type,
        timestamp: new Date().toISOString()
      };

      socket.emit('chat-message', messageData);
      setMessages((prev) => [...prev, messageData]);

    } catch (error) {
      console.error('File upload error:', error);
      alert('Failed to upload file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Helper to prepend API URL if it's a relative path
  const getFullFileUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    // remove trailing slash from API_URL if present and leading slash from url if present
    // robust join
    return `${API_URL.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/95 backdrop-blur-md border-l border-gray-700/50 shadow-2xl">
      <div className="p-4 border-b border-gray-700/50 bg-gray-800/40">
        <h3 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
          <span>💬</span> Room Chat
        </h3>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth custom-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3 opacity-60">
            <span className="text-5xl filter grayscale">💭</span>
            <p className="font-medium">No messages yet</p>
            <p className="text-sm">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMyMessage = msg.username === username;
            return (
              <div
                key={index}
                className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'} group`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] ${isMyMessage
                    ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-br-none'
                    : 'bg-gray-800/90 border border-gray-700 text-gray-100 rounded-bl-none'
                    }`}
                >
                  {!isMyMessage && (
                    <p className="text-xs font-bold text-indigo-400 mb-1 flex items-center gap-1">
                      {msg.username}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words font-light">
                    {msg.content}
                  </p>

                  {msg.fileUrl && (
                    <div className="mt-2 p-2 bg-black/20 rounded flex items-center gap-3">
                      <div className="text-2xl">📄</div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs truncate font-mono">{msg.fileName}</p>
                        <a
                          href={getFullFileUrl(msg.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-300 hover:text-indigo-100 hover:underline flex items-center gap-1 mt-1"
                        >
                          ⬇️ Download
                        </a>
                      </div>
                    </div>
                  )}

                  <p
                    className={`text-[10px] mt-1.5 text-right font-medium tracking-wide ${isMyMessage ? 'text-indigo-200/80' : 'text-gray-500'
                      }`}
                  >
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-gray-800/40 border-t border-gray-700/50 backdrop-blur-sm">
        <form onSubmit={handleSendMessage} className="flex gap-2 items-center relative">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-all shadow-lg active:scale-95 disabled:opacity-50"
            disabled={isUploading}
            title="Upload File"
          >
            {isUploading ? '⏳' : '📎'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />

          <input
            type="text"
            className="flex-1 bg-gray-900/60 border border-gray-600 text-white placeholder-gray-500 rounded-full pl-5 pr-12 py-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() && !isUploading}
            className="absolute right-2 p-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 transition-all disabled:opacity-0 disabled:cursor-not-allowed shadow-lg hover:shadow-indigo-500/25 transform active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default Chat;
