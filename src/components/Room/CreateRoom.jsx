import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

const CreateRoom = () => {
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roomName.trim()) {
      setError('Room name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/rooms/create', { name: roomName });
      const room = response.data.room;
      navigate(`/room/${room.id}`);
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to create room');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-effect rounded-2xl p-8 w-full max-w-md fade-in">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-gray-400 hover:text-white mb-6 flex items-center"
        >
          ← Back to Dashboard
        </button>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Create Study Room
          </h1>
          <p className="text-gray-400">Start a new collaborative session</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Room Name</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g., Math Study Group"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>
        </form>

        <div className="mt-8 p-4 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
          <p className="text-sm text-gray-300">
            💡 <strong>Tip:</strong> After creating the room, you'll get a unique code that others can use to join!
          </p>
        </div>
      </div>
    </div>
  );
};

export default CreateRoom;
