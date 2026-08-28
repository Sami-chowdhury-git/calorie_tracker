window.Auth = {
  _listeners: [],

  async signUp(name, email, password) {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!data.success) return { success: false, error: data.error };
      
      Store.setSession(data.user);
      await Store.syncFromServer(); 
      this._notify(data.user);
      return { success: true, user: data.user };
    } catch (e) {
      return { success: false, error: 'Network error connecting to server.' };
    }
  },

  async signIn(email, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!data.success) return { success: false, error: data.error };
      
      Store.setSession(data.user);
      await Store.syncFromServer(); 
      this._notify(data.user);
      return { success: true, user: data.user };
    } catch (e) {
      return { success: false, error: 'Network error connecting to server.' };
    }
  },

  signOut() { 
    Store.clearSession(); 
    this._notify(null); 
  },

  getCurrentUser() { return Store.getSession(); },

  onAuthStateChanged(cb) {
    this._listeners.push(cb);
    cb(this.getCurrentUser());
  },

  _notify(user) { this._listeners.forEach(cb => cb(user)); },
};
