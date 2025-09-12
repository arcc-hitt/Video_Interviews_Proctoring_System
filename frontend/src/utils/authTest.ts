/**
 * Simple authentication test utility
 */

export const authTest = {
  /**
   * Test login with sample credentials
   */
  async testLogin(email: string = 'test@example.com', password: string = 'password123') {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Login error:', error);
      return null;
    }
  },

  /**
   * Test registration with sample data
   */
  async testRegister(
    email: string = 'newuser@example.com', 
    password: string = 'password123',
    name: string = 'Test User',
    role: 'candidate' | 'interviewer' = 'candidate'
  ) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name, role }),
      });

      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Registration error:', error);
      return null;
    }
  },

  /**
   * Test protected endpoint
   */
  async testProtectedEndpoint() {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        return null;
      }

      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Protected endpoint error:', error);
      return null;
    }
  },

  /**
   * Clear auth data
   */
  clearAuth() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  },

  /**
   * Check current auth status
   */
  checkAuthStatus() {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    
    return { token, user: user ? JSON.parse(user) : null };
  }
};

// Make it available globally for testing
if (typeof window !== 'undefined') {
  (window as any).authTest = authTest;
}
