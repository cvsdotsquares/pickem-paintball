"use client";

import { FaTimes, FaCopy, FaCheck } from 'react-icons/fa';
import { useState } from 'react';

interface LeagueSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  leagueName: string;
  inviteCode: string;
}

export default function LeagueSuccessModal({ isOpen, onClose, leagueName, inviteCode }: LeagueSuccessModalProps) {
  const [copied, setCopied] = useState(false);

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-green-400">League Created! 🎉</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-bold text-white mb-2">&quot;{leagueName}&quot;</h3>
            <p className="text-gray-300 text-sm">Your league has been created successfully!</p>
          </div>

          {/* Invite Code Section */}
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-2">Share this invite code with friends:</p>
              <div className="flex items-center justify-center gap-2">
                <div className="bg-gray-700 px-4 py-2 rounded-lg">
                  <span className="pickem-numeric text-2xl font-bold text-white tracking-wider">
                    {inviteCode}
                  </span>
                </div>
                <button
                  onClick={copyInviteCode}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1"
                >
                  {copied ? <FaCheck /> : <FaCopy />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3">
            <p className="text-blue-200 text-sm text-center">
              Friends can join by clicking &quot;Join League&quot; and entering this code
            </p>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}