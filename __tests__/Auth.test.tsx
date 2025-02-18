import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Auth } from '../components/Auth';
import { UserProvider } from '../contexts/UserContext';

jest.mock('../utils/firebaseClient', () => ({
  auth: {
    currentUser: null,
    signInWithPopup: jest.fn(),
  },
  googleProvider: {},
}));

jest.mock('firebase/auth', () => ({
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
}));

describe('Auth Component', () => {
  it('renders sign in button when user is not authenticated', async () => {
    await waitFor(() => {
      render(
        <UserProvider>
          <Auth />
        </UserProvider>
      );
    });
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
  });

  it('calls signInWithPopup when sign in button is clicked', async () => {
    const { auth } = require('../utils/firebaseClient');
    const { signInWithPopup } = require('firebase/auth');

    await waitFor(() => {
      render(
        <UserProvider>
          <Auth />
        </UserProvider>
      );
    });

    const signInButton = screen.getByText('Sign in with Google');
    fireEvent.click(signInButton);

    await waitFor(() => {
      expect(signInWithPopup).toHaveBeenCalledWith(auth, expect.anything());
    });
  });
});