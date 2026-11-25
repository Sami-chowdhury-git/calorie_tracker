window.Auth = {
  _listeners: [],

  async initSession() {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin'
      });
      if (!res.ok) {
        Store.clearSession();
        this._notify(null);
        return null;
      }
      const data = await res.json();
      if (data.authenticated && data.user) {
        Store.setSession(data.user);
        await Store.syncWithServer();
        this._notify(data.user);
        return data.user;
      }
      Store.clearSession();
      this._notify(null);
      return null;
    } catch {
      const cached = Store.getSession();
      this._notify(cached);
      return cached;
    }
  },

  async signUp(name, email, password) {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!data.success) return { success: false, error: data.error };

      Store.setSession(data.user);
      await Store.syncWithServer();
      this._notify(data.user);
      return { success: true, user: data.user };
    } catch {
      return { success: false, error: 'Network error connecting to server.' };
    }
  },

  async signIn(email, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!data.success) return { success: false, error: data.error };

      Store.setSession(data.user);
      await Store.syncWithServer();
      this._notify(data.user);
      return { success: true, user: data.user };
    } catch {
      return { success: false, error: 'Network error connecting to server.' };
    }
  },

  async signOut() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch {
      // Clear local session state even if network fails
    }
    Store.clearSession();
    this._notify(null);
  },

  getCurrentUser() { return Store.getSession(); },

  onAuthStateChanged(cb) {
    this._listeners.push(cb);
  },

  _notify(user) { this._listeners.forEach(cb => cb(user)); }
};
