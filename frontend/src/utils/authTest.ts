/**
 * Simple authentication test utility
 */

export const authTest = {
  /**
   * Test login with sample credentials
   */
  async testLogin(email: string = 'test@example.com', password: string = 'password123') {
    try {
      console.log('Testing login...');
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      console.log('Login response:', data);

      if (response.ok) {
        console.log('Login successful!');
        console.log('Token:', data.data?.token);
        console.log('User:', data.data?.user);
      } else {
        console.log('Login failed:', data.error || data.message);
      }

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
      console.log('Testing registration...');
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name, role }),
      });

      const data = await response.json();
      console.log('Registration response:', data);

      if (response.ok) {
        console.log('Registration successful!');
        console.log('Token:', data.data?.token);
        console.log('User:', data.data?.user);
      } else {
        console.log('Registration failed:', data.error || data.message);
      }

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
        console.log('No token found in localStorage');
        return null;
      }

      console.log('Testing protected endpoint...');
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('Profile response:', data);

      if (response.ok) {
        console.log('Protected endpoint access successful!');
        console.log('User profile:', data.data);
      } else {
        console.log('Protected endpoint access failed:', data.error || data.message);
      }

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
    console.log('Auth data cleared');
  },

  /**
   * Check current auth status
   */
  checkAuthStatus() {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    
    console.log('Current auth status:');
    console.log('Token:', token ? 'Present' : 'Not found');
    console.log('User:', user ? JSON.parse(user) : 'Not found');
    
    return { token, user: user ? JSON.parse(user) : null };
  }
};

// Make it available globally for testing
if (typeof window !== 'undefined') {
  (window as any).authTest = authTest;
}
