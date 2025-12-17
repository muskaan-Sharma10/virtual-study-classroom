import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import VideoCall from './VideoCall';
import Chat from './Chat';
import DocumentEditor from './DocumentEditor';

const StudyRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('video'); // video, chat, document

  const socketRef = useRef();

  useEffect(() => {
    const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';
    socketRef.current = io(SOCKET_URL);
    setSocket(socketRef.current);

    socketRef.current.on('connect', () => {
      console.log('Socket connected:', socketRef.current.id);
      socketRef.current.emit('join-room', {
        roomId: id,
        userId: user.id,
        username: user.username,
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [id, user.id, user.username]);

  const fetchRoomDetails = useCallback(async () => {
    try {
      const response = await api.get(`/rooms/${id}`);
      setRoom(response.data.room);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching room:', error);
      alert('Room not found');
      navigate('/dashboard');
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchRoomDetails();
  }, [fetchRoomDetails]);

  const handleLeaveRoom = () => {
    if (socket) {
      socket.emit('leave-room', { roomId: id });
      socket.disconnect();
    }
    navigate('/dashboard');
  };

  const handleDeleteRoom = async () => {
    if (!window.confirm('Are you sure you want to delete this room? This action cannot be undone.')) return;

    try {
      await api.delete(`/rooms/${id}`);
      if (socket) {
        socket.disconnect();
      }
      navigate('/dashboard');
    } catch (error) {
      console.error('Error deleting room:', error);
      alert('Failed to delete room');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading room...</div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">{room?.name}</h1>
            {(room?.host?._id === user.id || room?.host === user.id) ? (
              <p className="text-sm text-gray-400">
                Room Code: <span className="text-indigo-400 font-mono">{room?.code}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-400">
                ID: <span className="text-gray-500 font-mono">{room?._id}</span>
              </p>
            )}
          </div>
          <div className="flex gap-3">
            {(room?.host?._id === user.id || room?.host === user.id) && (
              <button
                onClick={handleDeleteRoom}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
              >
                Delete Room
              </button>
            )}
            <button onClick={handleLeaveRoom} className="btn-secondary">
              Leave Room
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tabs */}
      <div className="lg:hidden bg-gray-800 border-b border-gray-700 flex">
        <button
          onClick={() => setActiveTab('video')}
          className={`flex-1 py-3 ${activeTab === 'video' ? 'bg-indigo-600' : 'bg-gray-800'
            }`}
        >
          Video
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3 ${activeTab === 'chat' ? 'bg-indigo-600' : 'bg-gray-800'
            }`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('document')}
          className={`flex-1 py-3 ${activeTab === 'document' ? 'bg-indigo-600' : 'bg-gray-800'
            }`}
        >
          Notes
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Unified Video Layer (Desktop + Mobile) */}
        {/* We place VideoCall in a layer that is always rendered but manipulated via CSS classes for visibility */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 pointer-events-none lg:static lg:block lg:flex-1 lg:pointer-events-auto ${activeTab === 'video' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 lg:opacity-100'}`}
        >
          <VideoCall
            socket={socket}
            roomId={id}
            userId={user.id}
            username={user.username}
          />
        </div>

        {/* Desktop Sidebar (Chat/Notes) */}
        <div className="hidden lg:flex lg:w-96 border-l border-gray-700 bg-gray-900 z-20 relative">
          <div className="flex-1 flex flex-col">
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-3 ${activeTab === 'chat' || activeTab === 'video' ? 'bg-indigo-600' : 'bg-gray-800'}`}
              >
                Chat
              </button>
              <button
                onClick={() => setActiveTab('document')}
                className={`flex-1 py-3 ${activeTab === 'document' ? 'bg-indigo-600' : 'bg-gray-800'}`}
              >
                Notes
              </button>
            </div>

            <div className="flex-1 overflow-hidden relative">
              <div className={`absolute inset-0 ${activeTab === 'document' ? 'hidden' : 'block'}`}>
                <Chat
                  socket={socket}
                  roomId={id}
                  userId={user.id}
                  username={user.username}
                />
              </div>
              <div className={`absolute inset-0 ${activeTab === 'document' ? 'block' : 'hidden'}`}>
                <DocumentEditor
                  socket={socket}
                  roomId={id}
                  userId={user.id}
                  initialContent={room?.documentContent || ''}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Layers for Chat and Notes */}
        {/* Chat Mobile Layer */}
        <div
          className={`absolute inset-0 bg-gray-900 transition-opacity duration-300 lg:hidden ${activeTab === 'chat' ? 'opacity-100 z-20 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}
        >
          <Chat
            socket={socket}
            roomId={id}
            userId={user.id}
            username={user.username}
          />
        </div>

        {/* Document Mobile Layer */}
        <div
          className={`absolute inset-0 bg-gray-900 transition-opacity duration-300 lg:hidden ${activeTab === 'document' ? 'opacity-100 z-20 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}
        >
          <DocumentEditor
            socket={socket}
            roomId={id}
            userId={user.id}
            initialContent={room?.documentContent || ''}
          />
        </div>
      </div>
    </div>
  );
};

export default StudyRoom;
