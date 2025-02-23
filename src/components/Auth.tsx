// 'use client';

// import React, { useState, useEffect } from 'react';
// import { useRouter } from 'next/navigation';
// import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, User } from 'firebase/auth';
// import { auth, googleProvider } from '../lib/firebaseClient';

// export const Auth: React.FC = () => {
//   console.log('Auth component rendering');
//   const [user, setUser] = useState<User | null>(null);
//   const router = useRouter();

//   useEffect(() => {
//     const unsubscribe = auth.onAuthStateChanged((user) => {
//       setUser(user);
//     });

//     return () => unsubscribe();
//   }, []);

//   const signIn = async () => {
//     try {
//       await signInWithPopup(auth, googleProvider);
//     } catch (error) {
//       console.error('Error signing in with Google', error);
//     }
//   };

//   const signOut = async () => {
//     try {
//       await auth.signOut();
//       router.push('/');
//     } catch (error) {
//       console.error('Error signing out', error);
//     }
//   };
//   const loginWithEmail = (email: string, password: string) => {
//     return signInWithEmailAndPassword(auth, email, password);
//   };

//   const registerWithEmail = async (email: string, password: string) => {
//     const userCredential = await createUserWithEmailAndPassword(auth, email, password);
//     await sendEmailVerification(userCredential.user);
//     return userCredential;
//   };
//   const loginWithGoogle = () => {
//     return signInWithPopup(auth, googleProvider);
//   };

//   const checkEmailVerification = (router: any, setError: (message: string) => void) => {
//     onAuthStateChanged(auth, (user) => {
//       if (user) {
//         if (user.emailVerified) {
//           router.push('/dashboard');
//         } else {
//           setError('Please verify your email before accessing the dashboard.');
//           sendEmailVerification(user);
//         }
//       }
//     });
//   };

//   if (user) {
//     return (
//       <div className='font-sans text-black ' style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 1000 }}>
//         <p>Welcome, {user.displayName}!</p>
//         <button onClick={signOut}>Sign out</button>
//       </div>
//     );
//   }
//   if (loading) {
//     return <div>Loading...</div>;
//   }

//   if (!user) {
//     router.push('/login');
//     return null;
//   }

//   return <WrappedComponent {...props} />;

//   return (
//     <div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 1000 }}>
//       <button onClick={signIn} className=' px-4 py-2 rounded-2xl bg-white text-center text-black font-black'>
//         Sign in / Register
//       </button>
//     </div>
//   );
// };

// export default Auth;