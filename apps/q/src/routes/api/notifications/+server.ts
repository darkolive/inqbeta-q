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

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { did, type, message } = body;
        
        if (!did || !type || !message) {
            return json({ error: 'Missing required fields: did, type, message' }, { status: 400 });
        }
        
        const notification = {
            id: crypto.randomUUID(),
            type,
            message,
            time: Date.now(),
            read: false
        };
        
        // Add to user's notifications
        const userNotifications = notifications.get(did) || [];
        userNotifications.unshift(notification);
        
        // Trim to max size
        if (userNotifications.length > MAX_NOTIFICATIONS) {
            userNotifications.length = MAX_NOTIFICATIONS;
        }
        
        notifications.set(did, userNotifications);
        
        return json({ success: true, id: notification.id });
    } catch (e) {
        return json({ error: 'Invalid request body' }, { status: 400 });
    }
};

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
