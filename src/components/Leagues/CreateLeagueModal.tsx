"use client";

import { useState } from 'react';
import { useAuth } from '@/src/contexts/authProvider';
import { useLeague } from '@/src/contexts/LeagueContext';
import { createLeague } from '@/src/lib/league-utils';
import { FaTimes, FaLock, FaGlobe, FaEye, FaEyeSlash } from 'react-icons/fa';
import LeagueSuccessModal from './LeagueSuccessModal';

interface CreateLeagueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateLeagueModal({ isOpen, onClose }: CreateLeagueModalProps) {
  const { user } = useAuth();
  const { refreshUserLeagues } = useLeague();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdLeague, setCreatedLeague] = useState({ name: '', inviteCode: '' });
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isPublic: true,
    requiresApproval: false,
    isSearchable: true,
    seasonSpecific: false,
    resetFrequency: 'never' as 'never' | 'event' | 'season'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Check league limit (25)
      const userLeaguesResponse = await fetch(`/api/leagues/user/${user.uid}`);
      const userLeaguesData = await userLeaguesResponse.json();
      
      if (userLeaguesData.leagues?.length >= 25) {
        alert('You have reached the maximum limit of 25 leagues.');
        setLoading(false);
        return;
      }

      // Check subscription (placeholder - implement actual subscription check)
      // TODO: Implement subscription modal intercept
      const hasSubscription = true; // Replace with actual check
      if (!hasSubscription) {
        alert('You need an active subscription to create a league.');
        setLoading(false);
        return;
      }

      const settings = {
        isPublic: formData.isPublic,
        requiresApproval: formData.requiresApproval,
        isSearchable: formData.isSearchable,
        seasonSpecific: formData.seasonSpecific,
        resetFrequency: formData.resetFrequency
      };

      const result = await createLeague(formData.name, formData.description, settings, user.uid);
      await refreshUserLeagues();
      
      // Show success modal with invite code
      setCreatedLeague({ name: formData.name, inviteCode: result.inviteCode });
      setShowSuccess(true);
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        isPublic: true,
        requiresApproval: false,
        isSearchable: true,
        seasonSpecific: false,
        resetFrequency: 'never'
      });
    } catch (error) {
      console.error('Error creating league:', error);
      alert('Failed to create league. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Create League</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* League Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              League Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter league name"
              required
              maxLength={50}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe your league"
              rows={3}
              maxLength={200}
            />
          </div>

          {/* Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300">League Settings</h3>
            
            {/* Public/Private */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {formData.isPublic ? <FaGlobe className="mr-2 text-green-400" /> : <FaLock className="mr-2 text-red-400" />}
                <span className="text-sm text-white">
                  {formData.isPublic ? 'Public League' : 'Private League'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isPublic: !formData.isPublic })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.isPublic ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.isPublic ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Searchable */}
            {formData.isPublic && (
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {formData.isSearchable ? <FaEye className="mr-2 text-blue-400" /> : <FaEyeSlash className="mr-2 text-gray-400" />}
                  <span className="text-sm text-white">Searchable</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isSearchable: !formData.isSearchable })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.isSearchable ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.isSearchable ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Requires Approval */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-white">Require Admin Approval</span>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, requiresApproval: !formData.requiresApproval })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.requiresApproval ? 'bg-yellow-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.requiresApproval ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create League'}
            </button>
          </div>
        </form>
      </div>
      
      {/* Success Modal */}
      <LeagueSuccessModal
        isOpen={showSuccess}
        onClose={handleSuccessClose}
        leagueName={createdLeague.name}
        inviteCode={createdLeague.inviteCode}
      />
    </div>
  );
}