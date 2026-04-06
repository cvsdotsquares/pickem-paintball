"use client";

import { useState, useRef } from 'react';
import { useAuth } from '@/src/contexts/authProvider';
import { useLeague } from '@/src/contexts/LeagueContext';
import { createLeague } from '@/src/lib/league-utils';
import { uploadLeagueIcon } from '@/src/lib/auth';
import { FaTimes, FaLock, FaGlobe, FaEye, FaEyeSlash, FaUpload } from 'react-icons/fa';
import LeagueSuccessModal from './LeagueSuccessModal';
import { useToast } from '@/src/hooks/useToast';
import Toast from '../ui/Toast';
import { containsProfanity, LEAGUE_NAME_PROFANITY_ERROR } from '@/src/lib/profanity';

interface CreateLeagueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateLeagueModal({ isOpen, onClose }: CreateLeagueModalProps) {
  const { user } = useAuth();
  const { refreshUserLeagues } = useLeague();
  const { toasts, showToast, hideToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdLeague, setCreatedLeague] = useState({ name: '', inviteCode: '' });
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isPublic: true,
    requiresApproval: false,
    isSearchable: true,
    seasonSpecific: false,
    resetFrequency: 'never' as 'never' | 'event' | 'season'
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIconFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setIconPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Check league limit (25)
      const userLeaguesResponse = await fetch(`/api/leagues/user/${user.uid}`);
      const userLeaguesData = await userLeaguesResponse.json();
      
      if (userLeaguesData.leagues?.length >= 25) {
        showToast('You have reached the maximum limit of 25 leagues', 'error');
        setLoading(false);
        return;
      }

      // Check subscription - show hard-gate modal
      const response = await fetch(`/api/users/${user.uid}/subscription`);
      if (!response.ok) {
        throw new Error(`Subscription check failed: ${response.status}`);
      }
      const subscriptionData = await response.json();
      console.log('Subscription check for league creation:', subscriptionData);
      
      if (!subscriptionData.isSubscribed) {
        setLoading(false);
        onClose();
        // Trigger hard-gate modal from parent
        window.dispatchEvent(new CustomEvent('show-subscription-modal', { detail: { type: 'hard-gate' } }));
        return;
      }

      if (containsProfanity(formData.name.trim())) {
        showToast(LEAGUE_NAME_PROFANITY_ERROR, 'error');
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
      
      // Upload icon if provided
      if (iconFile) {
        try {

          const iconUrl = await uploadLeagueIcon(iconFile, result.leagueId);
        
          // Update league with icon URL
          const updateResponse = await fetch(`/api/leagues/${result.leagueId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ icon: iconUrl })
          });
          const updateResult = await updateResponse.json();
        
        } catch (error) {
          console.error('Error uploading icon:', error);
        }
      }
      
      await refreshUserLeagues();
      
      setCreatedLeague({ name: formData.name, inviteCode: result.inviteCode });
      setShowSuccess(true);
      
      setIconFile(null);
      setIconPreview(null);
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
      const message =
        error instanceof Error ? error.message : 'Failed to create league. Please try again';
      showToast(message, 'error');
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
    <>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => hideToast(toast.id)}
        />
      ))}
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-300 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create League</h2>
          <button
            onClick={onClose}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* League Icon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              League Icon (Optional)
            </label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                {iconPreview ? (
                  <img src={iconPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <FaUpload className="text-gray-600 dark:text-gray-500" />
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                Choose Image
              </button>
            </div>
          </div>

          {/* League Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              League Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter league name"
              required
              maxLength={50}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe your league"
              rows={3}
              maxLength={200}
            />
          </div>

          {/* Member Limit Info */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <span className="font-semibold">Member Limit:</span> Default 20 members per league. Need more? Email{' '}
              <a 
                href="mailto:james@pickempaintball.com" 
                className="font-semibold underline hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                james@pickempaintball.com
              </a>
            </p>
          </div>

          {/* Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">League Settings</h3>
            
            {/* Public/Private */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {formData.isPublic ? <FaGlobe className="mr-2 text-green-400" /> : <FaLock className="mr-2 text-red-400" />}
                <span className="text-sm text-gray-900 dark:text-white">
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
                  {formData.isSearchable ? <FaEye className="mr-2 text-blue-400" /> : <FaEyeSlash className="mr-2 text-gray-600 dark:text-gray-400" />}
                  <span className="text-sm text-gray-900 dark:text-white">Searchable</span>
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
              <span className="text-sm text-gray-900 dark:text-white">Require Admin Approval</span>
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
              className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                'Create League'
              )}
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
    </>
  );
}