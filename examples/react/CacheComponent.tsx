import React, { useEffect, useState } from 'react';
import { createCache, sessionStorageAdapter } from '@antihero/nano-cache';

const cache = createCache({
  adapter: sessionStorageAdapter({ prefix: 'react_app:' }),
  ttl: '10m',
});

export function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      setLoading(true);
      const userData = await cache.fetch(`user:${userId}`, async () => {
        const res = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
        return res.json();
      });

      if (isMounted) {
        setUser(userData);
        setLoading(false);
      }
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  if (loading) return <div>Loading user profile...</div>;

  return (
    <div>
      <h2>{user?.name}</h2>
      <p>Email: {user?.email}</p>
    </div>
  );
}
