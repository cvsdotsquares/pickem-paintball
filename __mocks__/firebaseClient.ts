import { jest } from '@jest/globals';

const mockAuth = {
  currentUser: null,
  onAuthStateChanged: jest.fn(() => jest.fn()),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
};

export const auth = mockAuth;
export const getAuth = jest.fn(() => mockAuth);
export const initializeApp = jest.fn(() => ({
  name: '[DEFAULT]',
  options: {},
}));
export const getApps = jest.fn(() => []);
export const GoogleAuthProvider = jest.fn(() => ({
  addScope: jest.fn(),
}));
export const getFirestore = jest.fn();
export const googleProvider = {};