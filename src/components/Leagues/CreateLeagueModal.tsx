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
    visibility: 'public' as 'public' | 'hidden',
    access: 'open' as 'open' | 'private',
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
        visibility: formData.visibility,
        access: formData.access,
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
        visibility: 'public',
        access: 'open',
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

            {/* Visibility: public (in search) vs hidden (invite/code only) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {formData.visibility === 'public' ? <FaEye className="mr-2 text-blue-400" /> : <FaEyeSlash className="mr-2 text-gray-600 dark:text-gray-400" />}
                <div>
                  <span className="text-sm text-gray-900 dark:text-white">
                    {formData.visibility === 'public' ? 'Visible in Search' : 'Hidden from Search'}
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {formData.visibility === 'public'
                      ? 'Anyone can find this league by searching'
                      : 'Only found by invite link or access code'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, visibility: formData.visibility === 'public' ? 'hidden' : 'public' })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  formData.visibility === 'public' ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.visibility === 'public' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Access: open (instant join) vs private (code or approval) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {formData.access === 'open' ? <FaGlobe className="mr-2 text-green-400" /> : <FaLock className="mr-2 text-yellow-400" />}
                <div>
                  <span className="text-sm text-gray-900 dark:text-white">
                    {formData.access === 'open' ? 'Open Access' : 'Private Access'}
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {formData.access === 'open'
                      ? 'Anyone who finds this league joins instantly'
                      : 'Joining needs the access code, or your approval'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, access: formData.access === 'open' ? 'private' : 'open' })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  formData.access === 'open' ? 'bg-green-600' : 'bg-yellow-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.access === 'open' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Plain-language summary of the combined effect */}
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
              {formData.visibility === 'public' && formData.access === 'open' &&
                "Anyone can find this league in search and join right away — no approval needed."}
              {formData.visibility === 'public' && formData.access === 'private' &&
                "Anyone can find this league in search, but they'll need the access code or your approval to join."}
              {formData.visibility === 'hidden' && formData.access === 'open' &&
                "This league won't show up in search. Anyone with the invite link or access code can join right away."}
              {formData.visibility === 'hidden' && formData.access === 'private' &&
                "This league won't show up in search. People need the access code to join — you can also invite members directly."}
            </p>
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