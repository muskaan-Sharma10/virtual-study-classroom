import React, { useState, useEffect, useRef } from 'react';


const RemoteVideo = ({ stream, username, isSpeaking }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = false; // Ensure audio is ON
      videoRef.current.play().catch(e => console.error("Remote play error:", e));
    }
  }, [stream]);

  return (
    <div className={`relative bg-gray-800 rounded-xl overflow-hidden transition-all duration-300 ${isSpeaking ? 'ring-4 ring-green-500 shadow-lg shadow-green-500/20' : 'ring-1 ring-gray-700'}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm text-white">
        {username || 'Participant'}
      </div>
    </div>
  );
};

const VideoCall = ({ socket, roomId, userId, username }) => {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState(new Map());
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState(new Set()); // socketId set

  const localVideoRef = useRef();
  const peerConnections = useRef(new Map());
  const originalStream = useRef(null);
  const audioContext = useRef(null);
  const analysers = useRef(new Map()); // socketId -> AnalyserNode
  const iceCandidatesQueue = useRef(new Map()); // socketId -> candidates[]
  const animationRef = useRef();

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    // Initialize Audio Context
    audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    startActivityDetection();
    startLocalStream();

    return () => {
      stopLocalStream();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContext.current) audioContext.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const hasLocalStream = !!localStream;

  useEffect(() => {
    if (!socket || !hasLocalStream) return;

    // When someone joins, send them an offer (We are the 'Old' user, they are 'New')
    const handleUserJoined = async ({ socketId, username }) => {
      console.log('User joined:', socketId, username);
      await createPeerConnection(socketId, true, username);
    };

    // Handle existing participants (We are the 'New' user, they are 'Old')
    // We should NOT create an offer. We wait for them to send us an offer.
    // This prevents the "Double Offer" glare.
    const handleExistingParticipants = async (participants) => {
      console.log('Existing participants:', participants);
      for (const participant of participants) {
        const socketId = participant.socketId || participant;
        const username = participant.username || 'Participant';
        // Pass false to NOT create offer. We just set up the PC to be ready.
        await createPeerConnection(socketId, false, username);
      }
    };

    // Receive video offer
    const handleOffer = async ({ offer, from, username }) => {
      await handleReceiveOffer(offer, from, username);
    };

    // Receive video answer
    const handleAnswer = async ({ answer, from }) => {
      await handleReceiveAnswer(answer, from);
    };

    // Receive ICE candidate
    const handleIceCandidate = async ({ candidate, from }) => {
      await handleReceiveIceCandidate(candidate, from);
    };

    // User left
    const handleUserLeftEvent = ({ socketId }) => {
      handleUserLeft(socketId);
    };

    socket.on('user-joined', handleUserJoined);
    socket.on('existing-participants', handleExistingParticipants);
    socket.on('video-offer', handleOffer);
    socket.on('video-answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);

    socket.on('user-left', handleUserLeftEvent);

    // Request participants now that we are ready to handle them!
    socket.emit('request-participants', { roomId });

    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('existing-participants', handleExistingParticipants);
      socket.off('video-offer', handleOffer);
      socket.off('video-answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user-left', handleUserLeftEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, hasLocalStream]); // Only attach listeners when we have a stream to share!

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      originalStream.current = stream;

      // Add tracks to existing peer connections (if any)
      peerConnections.current.forEach((pc) => {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      });

    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };

  const stopLocalStream = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
  };

  const startActivityDetection = () => {
    const checkActivity = () => {
      // Check remote speakers
      const speakers = new Set();
      analysers.current.forEach((analyser, socketId) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((subject, value) => subject + value, 0) / dataArray.length;
        if (volume > 20) { // Threshold
          speakers.add(socketId);
        }
      });

      // Update state only if changed
      setActiveSpeakers(prev => {
        if (prev.size === speakers.size && [...prev].every(value => speakers.has(value))) {
          return prev;
        }
        return speakers;
      });

      animationRef.current = requestAnimationFrame(checkActivity);
    };
    checkActivity();
  };

  const attachAnalyser = (stream, socketId) => {
    if (!audioContext.current) return;
    try {
      const source = audioContext.current.createMediaStreamSource(stream);
      const analyser = audioContext.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analysers.current.set(socketId, analyser);
    } catch (e) {
      console.error("Audio Context Error", e);
    }
  };

  // Modified createPeerConnection to accept username
  const createPeerConnection = async (socketId, createOffer, username) => {
    if (peerConnections.current.has(socketId)) {
      // If connection exists, update username if we have a better one
      if (username && username !== 'Participant') {
        setPeers(prev => {
          const existing = prev.get(socketId);
          if (existing && existing.username !== username) {
            const newPeers = new Map(prev);
            newPeers.set(socketId, { ...existing, username });
            return newPeers;
          }
          return prev;
        });
      }
      return;
    }

    const pc = new RTCPeerConnection(iceServers);
    peerConnections.current.set(socketId, pc);

    // Add local stream tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          candidate: event.candidate,
          to: socketId,
        });
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      setPeers((prev) => {
        const newPeers = new Map(prev);
        newPeers.set(socketId, { connection: pc, stream, username });
        return newPeers;
      });
      // Attach analyser for this peer
      // attachAnalyser(stream, socketId); // DISABLED: Might interfere with audio playback in some browsers
    };

    // Create and send offer if initiator
    if (createOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('video-offer', {
        offer,
        to: socketId,
      });
    }
  };

  const handleReceiveOffer = async (offer, from, username) => {
    // If we receive an offer, we need to create a PC if it doesn't exist
    if (!peerConnections.current.has(from)) {
      await createPeerConnection(from, false, username || 'Participant');
    } else if (username) {
      // Update username if available
      setPeers(prev => {
        const existing = prev.get(from);
        if (existing && existing.username !== username) {
          const newPeers = new Map(prev);
          newPeers.set(from, { ...existing, username });
          return newPeers;
        }
        return prev;
      });
    }

    const pc = peerConnections.current.get(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Process queued ICE candidates
    if (iceCandidatesQueue.current.has(from)) {
      const candidates = iceCandidatesQueue.current.get(from);
      console.log(`Processing ${candidates.length} queued ICE candidates for ${from}`);
      for (const candidate of candidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidatesQueue.current.delete(from);
    }

    // Important: We must have local tracks added by now (createPeerConnection does it if localStream exists)

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('video-answer', {
      answer,
      to: from,
    });
  };

  const handleReceiveAnswer = async (answer, from) => {
    const pc = peerConnections.current.get(from);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleReceiveIceCandidate = async (candidate, from) => {
    const pc = peerConnections.current.get(from);
    if (pc) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue it if remote description not set
        if (!iceCandidatesQueue.current.has(from)) {
          iceCandidatesQueue.current.set(from, []);
        }
        iceCandidatesQueue.current.get(from).push(candidate);
      }
    }
  };

  const handleUserLeft = (socketId) => {
    const pc = peerConnections.current.get(socketId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(socketId);
    }
    setPeers((prev) => {
      const newPeers = new Map(prev);
      newPeers.delete(socketId);
      return newPeers;
    });
  };

  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });

        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in all peer connections
        peerConnections.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        screenTrack.onended = () => {
          stopScreenShare();
        };

        setIsScreenSharing(true);
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (originalStream.current) {
      const videoTrack = originalStream.current.getVideoTracks()[0];

      peerConnections.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = originalStream.current;
      }
    }
    setIsScreenSharing(false);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 overflow-auto">
        {/* Local video */}
        <div className={`relative bg-gray-800 rounded-xl overflow-hidden transition-all duration-300 ${activeSpeakers.has('local') ? 'ring-4 ring-green-500 shadow-lg shadow-green-500/20' : 'ring-1 ring-gray-700'
          }`}>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover transform scale-x-[-1]"
          />
          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-2">
            <span>{isMicOn ? '🎤' : '🔇'}</span>
            <span className="font-medium">You {isScreenSharing && '(Screen)'}</span>
          </div>
          {!isCameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500">
              <div className="flex flex-col items-center gap-2">
                <div className="p-4 rounded-full bg-gray-800">
                  <span className="text-4xl">📷</span>
                </div>
                <span>Camera Off</span>
              </div>
            </div>
          )}
        </div>

        {/* Remote videos */}
        {Array.from(peers.entries()).map(([socketId, peer]) => (
          <RemoteVideo
            key={socketId}
            stream={peer.stream}
            username={peer.username || `Participant ${socketId.substr(0, 4)}...`}
            isSpeaking={activeSpeakers.has(socketId)}
          />
        ))}
      </div>

      <button
        className="absolute top-4 right-4 bg-gray-700/80 hover:bg-gray-600 text-white px-3 py-1 rounded-lg text-sm z-50 backdrop-blur-sm"
        onClick={() => {
          document.querySelectorAll('video').forEach(v => {
            v.muted = false; // Ensure remote aren't muted
            v.play().catch(console.error);
          });
          if (localVideoRef.current) localVideoRef.current.muted = true; // Keep local muted

          if (audioContext.current && audioContext.current.state === 'suspended') {
            audioContext.current.resume();
          }
        }}
      >
        🔊 Fix Audio
      </button>

      {/* Controls Bar */}
      <div className="flex justify-center items-center gap-6 p-6 bg-gray-900/90 backdrop-blur-md border-t border-gray-800">
        <button
          onClick={toggleMic}
          className={`p-4 rounded-full transition-all duration-200 transform hover:scale-110 ${isMicOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30'
            }`}
          title={isMicOn ? 'Mute' : 'Unmute'}
        >
          {isMicOn ? '🎤' : '🔇'}
        </button>

        <button
          onClick={toggleCamera}
          className={`p-4 rounded-full transition-all duration-200 transform hover:scale-110 ${isCameraOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30'
            }`}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraOn ? '📹' : '🚫'}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`p-4 rounded-full transition-all duration-200 transform hover:scale-110 ${isScreenSharing ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30' : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          🖥️
        </button>

        <button
          className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all duration-200 transform hover:scale-110 shadow-lg shadow-red-600/30"
          onClick={() => window.location.href = '/dashboard'}
          title="Leave Call"
        >
          📞
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
