/**
 * API Service utility for handling authenticated requests
 * Provides consistent error handling and authentication headers
 */

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface RequestConfig extends RequestInit {
  requireAuth?: boolean;
}

class ApiService {
  private baseURL: string;
  private onUnauthorized?: () => void;

  constructor() {
    // Ensure VITE_API_BASE_URL is treated as a string
    const viteApiUrl = String(import.meta.env.VITE_API_BASE_URL);
    this.baseURL = viteApiUrl || 'https://videointerviewsproctoringsystem-production.up.railway.app';
    // Set up global error handling for 401 responses
    this.setupResponseInterceptor();
  }

  /**
   * Set callback for handling unauthorized responses (401)
   */
  public setUnauthorizedHandler(handler: () => void): void {
    this.onUnauthorized = handler;
  }

  /**
   * Get authentication token from localStorage
   */
  private getAuthToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  /**
   * Get authorization headers
   */
  private getAuthHeaders(): Record<string, string> {
    const token = this.getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Make authenticated API request
   */
  public async request<T = any>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const { requireAuth = true, headers = {}, ...restConfig } = config;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers as Record<string, string>,
    };

    // Add auth headers if required
    if (requireAuth) {
      const authHeaders = this.getAuthHeaders();
      if (!authHeaders.Authorization) {
        throw new Error('Authentication required but no token found');
      }
      Object.assign(requestHeaders, authHeaders);
    }

    try {
      const fullUrl = `${this.baseURL}${endpoint}`;
      console.log('🌐 Making API request to:', fullUrl);
      
      const response = await fetch(fullUrl, {
        ...restConfig,
        headers: requestHeaders,
      });

      // Handle 401 responses
      if (response.status === 401) {
        this.handleUnauthorized();
        throw new Error('Authentication failed');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Handle unauthorized responses
   */
  private handleUnauthorized(): void {
    // Clear stored auth data
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    
    // Call the unauthorized handler if set
    if (this.onUnauthorized) {
      this.onUnauthorized();
    }
  }

  /**
   * Setup response interceptor for global error handling
   */
  private setupResponseInterceptor(): void {
    // Store original fetch
    const originalFetch = window.fetch;

    // Override fetch to add global error handling
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      if (response.status === 401) {
        this.handleUnauthorized();
      }
      
      return response;
    };
  }

  // Convenience methods
  public get<T = any>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  }

  public post<T = any>(endpoint: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  public put<T = any>(endpoint: string, data?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  public delete<T = any>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }
}

// Create singleton instance
export const apiService = new ApiService();
export default apiService;
