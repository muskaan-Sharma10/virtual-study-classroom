import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';

const DocumentEditor = ({ roomId, userId }) => {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef(null);

  const getStorageKey = () => `notes_${roomId}_${userId}`;

  useEffect(() => {
    if (!userId || !roomId) return;

    // Load from local storage
    const savedContent = localStorage.getItem(getStorageKey());
    if (savedContent) {
      setContent(savedContent);
    }
  }, [roomId, userId]);

  const handleContentChange = (e) => {
    const newContent = e.target.value;
    setContent(newContent);

    // Debounced auto-save
    setIsSaving(true);
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (userId && roomId) {
        localStorage.setItem(getStorageKey(), newContent);
      }
      setIsSaving(false);
    }, 1000);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(content, 180);
    doc.text(splitText, 15, 15);
    doc.save(`my-private-notes-${roomId}.pdf`);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/50">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span>📝</span> My Private Notes
        </h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {isSaving ? '💾 Saving...' : '✓ Saved'}
          </span>
          <button
            onClick={handleExportPDF}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md transition-colors flex items-center gap-1"
            title="Export as PDF"
          >
            <span>⬇️</span> PDF
          </button>
        </div>
      </div>

      <div className="flex-1 p-4">
        <textarea
          className="w-full h-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 text-white resize-none focus:outline-none focus:border-indigo-500 font-mono text-sm leading-relaxed"
          placeholder="Start typing your private notes here... content is saved locally to your device."
          value={content}
          onChange={handleContentChange}
        />
      </div>

      <div className="p-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          🔒 These notes are private to you and saved on this device. They are not visible to other participants.
        </p>
      </div>
    </div>
  );
};

export default DocumentEditor;
