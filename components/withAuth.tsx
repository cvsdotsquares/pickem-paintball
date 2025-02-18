import { useRouter } from 'next/router';
import { useUser } from '../contexts/UserContext';
import React from 'react';

const withAuth = (WrappedComponent: React.ComponentType) => {
  return function WithAuthComponent(props: React.ComponentProps<typeof WrappedComponent>) {
    const { user, loading } = useUser();
    const router = useRouter();

    if (loading) {
      return <div>Loading...</div>;
    }

    if (!user) {
      router.push('/login');
      return null;
    }

    return <WrappedComponent {...props} />;
  };
};

export default withAuth;