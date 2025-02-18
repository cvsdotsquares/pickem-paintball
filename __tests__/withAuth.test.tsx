import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import withAuth from '../components/withAuth';
import { UserProvider } from '../contexts/UserContext';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('../utils/firebaseClient', () => ({
  auth: {
    currentUser: null,
  },
}));

describe('withAuth HOC', () => {
  const ProtectedComponent = withAuth(() => <div>Protected Content</div>);

  it('redirects to login when user is not authenticated', async () => {
    const { auth } = require('../utils/firebaseClient');
    auth.currentUser = null;

    await waitFor(() => {
      render(
        <UserProvider>
          <ProtectedComponent />
        </UserProvider>
      );
    });

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders the component when user is authenticated', async () => {
    const { auth } = require('../utils/firebaseClient');
    auth.currentUser = { uid: '123' };

    await waitFor(() => {
      render(
        <UserProvider>
          <ProtectedComponent />
        </UserProvider>
      );
    });

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});