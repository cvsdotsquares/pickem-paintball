import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Define types for the input data
interface User {
    email: string;
    name: string;
}



// Cloud Function
export const bulkCreateUsers = functions.https.onCall(
    async (data: any, context: any) => {
        try {
            // Ensure that the request is made by an authenticated admin
            if (!context.auth || context.auth.token.admin !== true) {
                throw new Error('Unauthorized access');
            }

            const users: User[] = data.users; // List of users with { email, name }

            // Iterate over the users and update their Firestore data
            for (const user of users) {
                const { email, name } = user;

                // Fetch user UID by email
                const userRecord = await admin.auth().getUserByEmail(email);
                const uid = userRecord.uid;

                // Create or update the Firestore document with name and email
                await admin.firestore().collection('users').doc(uid).set(
                    {
                        name: name,
                        email: email,
                    },
                    { merge: true } // Use merge to prevent overwriting other data
                );

                console.log(`Created/Updated user: ${email}`);
            }

            return { message: 'Users processed successfully' };
        } catch (error) {
            console.error('Error processing users:', error);
            throw new functions.https.HttpsError(
                'internal',
                'Failed to process users',
                error
            );
        }
    }
);
