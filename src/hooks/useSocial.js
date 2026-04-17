'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';

export function useSocial() {
  const { isLoaded, isSignedIn } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  
  const unreadNotificationsCount = notifications.filter(n => !n.is_read).length;
  // Inbox unread count
  const unreadMessagesCount = messages.filter(m => !m.is_read && m.sender_id !== m.receiver_id).length;

  const fetchNotifications = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await fetch('/api/social/notifications');
      if (res.ok) {
        const { notifications: data } = await res.json();
        if (data) setNotifications(data);
      }
    } catch(err) {
      console.error(err);
    }
  }, [isSignedIn]);

  const fetchMessages = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await fetch('/api/social/messages?type=inbox');
      if (res.ok) {
        const { messages: data } = await res.json();
        if (data) setMessages(data);
      }
    } catch(err) {
      console.error(err);
    }
  }, [isSignedIn]);

  const markNotificationsRead = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      await fetch('/api/social/notifications', { method: 'PATCH', body: JSON.stringify({}) });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch(err) {
      console.error(err);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    
    fetchNotifications();
    fetchMessages();
    
    // Polling every 60 seconds
    const interval = setInterval(() => {
      fetchNotifications();
      fetchMessages();
    }, 60000);
    
    return () => clearInterval(interval);
  }, [fetchNotifications, fetchMessages, isLoaded, isSignedIn]);

  return {
    notifications,
    messages,
    unreadNotificationsCount,
    unreadMessagesCount,
    fetchNotifications,
    fetchMessages,
    markNotificationsRead
  };
}
