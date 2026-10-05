import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// In-memory store (in production, use Redis or similar)
const notifications = new Map<string, {
    id: string;
    type: string;
    message: string;
    time: number;
    read: boolean;
}[]>();

const MAX_NOTIFICATIONS = 50;

export const GET: RequestHandler = async ({ url }) => {
    const did = url.searchParams.get('did');
    
    if (!did) {
        return json({ error: 'Missing did parameter' }, { status: 400 });
    }
    
    const userNotifications = notifications.get(did) || [];
    
    return json({
        notifications: userNotifications.map(n => ({
            ...n,
            time: new Date(n.time).toISOString()
        })),
        unreadCount: userNotifications.filter(n => !n.read).length
    });
};

/*
 * Adding is closed (5 October 2026, the door, ADR-Q-034). Nothing in Q ever
 * added here, and anyone could put any words into anyone's bell by naming
 * their DID. Things that need you now reach you through the bellboy, sealed
 * and signed (ADR-Q-014); announcements are signed by their federation.
 */
export const POST: RequestHandler = async () =>
    json({ error: 'Notifications aren’t added here. They come through the bell, signed by whoever sent them.' }, { status: 405 });

export const DELETE: RequestHandler = async ({ url }) => {
    const did = url.searchParams.get('did');
    const id = url.searchParams.get('id');
    
    if (!did) {
        return json({ error: 'Missing did parameter' }, { status: 400 });
    }
    
    if (id) {
        // Delete specific notification
        const userNotifications = notifications.get(did) || [];
        const filtered = userNotifications.filter(n => n.id !== id);
        notifications.set(did, filtered);
    } else {
        // Clear all for user
        notifications.delete(did);
    }
    
    return json({ success: true });
};

export const PATCH: RequestHandler = async ({ url }) => {
    const did = url.searchParams.get('did');
    const id = url.searchParams.get('id');
    
    if (!did) {
        return json({ error: 'Missing did parameter' }, { status: 400 });
    }
    
    const userNotifications = notifications.get(did) || [];
    
    if (id) {
        // Mark specific as read
        const notif = userNotifications.find(n => n.id === id);
        if (notif) {
            notif.read = true;
        }
    } else {
        // Mark all as read
        userNotifications.forEach(n => n.read = true);
    }
    
    notifications.set(did, userNotifications);
    
    return json({ success: true });
};
